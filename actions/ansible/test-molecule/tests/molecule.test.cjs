const { suite, test } = require("node:test");
const { MoleculeInputs } = require("../inputs.cjs");
const { MoleculeScenario } = require("../molecule.cjs");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const os = require("node:os");
const exec = require("@actions/exec");
const glob = require("@actions/glob");

function fixture(t) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "molecule-contract-"));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const checkout = path.join(root, "checkout");
	const temporary = path.join(root, "runner");
	fs.mkdirSync(path.join(checkout, "default"), { recursive: true });
	fs.mkdirSync(temporary);
	// Scenario playbooks and inventory are selected by Molecule, not this action.
	fs.writeFileSync(
		path.join(checkout, "default/molecule.yml"),
		"---\nansible: {}\n",
	);
	fs.writeFileSync(
		path.join(checkout, "requirements.txt"),
		"ansible-core==2.99.1\n",
	);
	const outputs = {};
	return {
		checkout,
		temporary,
		outputs,
		env: {
			GITHUB_WORKSPACE: checkout,
			RUNNER_TEMP: temporary,
			MOLECULE_SCENARIO: "default",
			ANSIBLE_REQUIREMENTS: "requirements.txt",
		},
		core: {
			setOutput: (name, value) => {
				outputs[name] = value;
			},
		},
	};
}

function prepared(t) {
	const state = fixture(t);
	new MoleculeInputs(state.env).prepare(state.core);
	state.env = {
		...state.env,
		ANSIBLE_REPORT_DIRECTORY: state.outputs["report-directory"],
		MOLECULE_SCENARIO: state.outputs.scenario,
	};
	return state;
}

const nativeReport =
	'<testsuite tests="1" failures="0"><testcase name="configuration"/></testsuite>';

suite("ansible/test-molecule", () => {
	test("Molecule prepares an exact runtime pin without requiring a VM or fixed playbook names", async (t) => {
		// Arrange
		const state = fixture(t);

		// Act
		new MoleculeInputs(state.env).prepare(state.core);

		// Assert
		assert.equal(state.outputs.scenario, path.join(state.checkout, "default"));
		assert.equal(
			fs.readFileSync(state.outputs.constraint, "utf8"),
			"ansible-core==2.99.1\n",
		);
		assert.equal(
			path.dirname(state.outputs["report-directory"]),
			state.temporary,
		);
		assert.deepEqual(fs.readdirSync(state.outputs["report-directory"]), [
			"constraints.txt",
		]);
	});

	test("Molecule rejects escaping scenarios and config, invalid deadlines and floating runtime pins", async (t) => {
		// Arrange
		const state = fixture(t);
		fs.writeFileSync(
			path.join(state.checkout, "floating.txt"),
			"ansible-core>=2.99\n",
		);
		fs.symlinkSync(state.temporary, path.join(state.checkout, "external"));
		fs.writeFileSync(path.join(state.temporary, "ansible.cfg"), "[defaults]\n");
		fs.writeFileSync(path.join(state.temporary, "molecule.yml"), "---\n");
		for (const invalid of [
			{ MOLECULE_SCENARIO: "" },
			{ MOLECULE_SCENARIO: "../runner" },
			{ MOLECULE_SCENARIO: "external" },
			{ ANSIBLE_REQUIREMENTS: "floating.txt" },
			{ ANSIBLE_CONFIG_FILE: "external/ansible.cfg" },
			{ ANSIBLE_TEST_TIMEOUT_MINUTES: "41" },
			{ ANSIBLE_TEST_TIMEOUT_MINUTES: "0" },
		]) {
			// Act
			const prepare = () =>
				new MoleculeInputs({ ...state.env, ...invalid }).prepare(state.core);

			// Assert
			assert.throws(prepare, JSON.stringify(invalid));
			assert.deepEqual(fs.readdirSync(state.temporary).sort(), [
				"ansible.cfg",
				"molecule.yml",
			]);
		}

		// Arrange
		fs.rmSync(path.join(state.checkout, "default/molecule.yml"));

		// Act
		const prepare = () => new MoleculeInputs(state.env).prepare(state.core);

		// Assert
		assert.throws(prepare, /ENOENT/);
	});

	test("Molecule report selection excludes symlinks and runtime directories", async (t) => {
		// Arrange
		const state = prepared(t);
		const directory = state.env.ANSIBLE_REPORT_DIRECTORY;
		const native = path.join(directory, "assertions.xml");
		const junit =
			'<testsuite tests="1" failures="1"><testcase name="configuration"><failure/></testcase></testsuite>';
		fs.writeFileSync(native, junit);
		fs.mkdirSync(path.join(directory, "venv"));
		fs.symlinkSync(
			state.outputs.constraint,
			path.join(directory, "private.xml"),
		);

		// Act
		const files = await new MoleculeScenario(state.env, { glob }).collect();

		// Assert
		assert.deepEqual(files, [native]);
		assert.equal(fs.readFileSync(native, "utf8"), junit);
	});

	test("Molecule reports failed cleanup after a timeout and bounds the cleanup attempt", async (t) => {
		// Arrange
		const state = prepared(t);
		const directory = state.env.ANSIBLE_REPORT_DIRECTORY;
		state.env.ANSIBLE_TEST_TIMEOUT_MINUTES = "1";
		const subprocess = t.mock.method(exec, "exec", (_command, args) => {
			fs.writeFileSync(path.join(directory, "create.xml"), nativeReport);
			return args[3] === "test" ? 124 : 1;
		});

		// Act
		const execute = () => new MoleculeScenario(state.env, { exec, glob }).run();

		// Assert
		await assert.rejects(execute, /cleanup failed/);
		assert.equal(subprocess.mock.callCount(), 2);
		assert.equal(subprocess.mock.calls[0].arguments[1][1], "1m");
		assert.deepEqual(subprocess.mock.calls[1].arguments[1], [
			"--kill-after=5s",
			"2m",
			`${directory}/venv/bin/molecule`,
			"destroy",
			"--scenario-name",
			"default",
		]);
		assert.match(
			fs.readFileSync(path.join(directory, "scenario.xml"), "utf8"),
			/failures="1"/,
		);
	});

	test("Molecule cannot succeed with empty or redirected native assertions", async (t) => {
		// Arrange
		const state = prepared(t);
		const directory = state.env.ANSIBLE_REPORT_DIRECTORY;

		// Act
		const collect = () => new MoleculeScenario(state.env, { glob }).collect();

		// Assert
		await assert.rejects(collect, /nonempty JUnit/);

		// Arrange
		fs.writeFileSync(path.join(state.temporary, "outside.xml"), nativeReport);
		fs.symlinkSync(
			path.join(state.temporary, "outside.xml"),
			path.join(directory, "redirect.xml"),
		);
		fs.writeFileSync(path.join(directory, "empty.xml"), "");
		t.mock.method(exec, "exec", () => 0);

		// Act
		const execute = () => new MoleculeScenario(state.env, { exec, glob }).run();

		// Assert
		await assert.rejects(execute, /no native assertions/);

		// Act
		const collectEmpty = () =>
			new MoleculeScenario(state.env, { glob }).collect();

		// Assert
		await assert.rejects(collectEmpty, /nonempty JUnit/);

		// Arrange
		const redirect = path.join(state.temporary, "molecule-reports-redirect");
		fs.symlinkSync(directory, redirect);
		state.env.ANSIBLE_REPORT_DIRECTORY = redirect;

		// Act
		const collectRedirected = () =>
			new MoleculeScenario(state.env, { glob }).collect();

		// Assert
		await assert.rejects(collectRedirected, /private report directory/);
	});
});
