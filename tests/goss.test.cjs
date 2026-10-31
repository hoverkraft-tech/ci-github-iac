const { test } = require("node:test");
const { GossSuite } = require("../actions/vm/test/goss.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { GuestAssertions } = require("../actions/vm/test/assertions.cjs");
const { MoleculeScenario } = require("../actions/ansible/test/molecule.cjs");
const { VirtualMachine } = require("../actions/vm/_internal/runtime.cjs");

function fixture(t) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "opinionated-test-"));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	return directory;
}

test("Goss exclusively owns guest execution and native report selection", (t) => {
	const directory = fixture(t);
	for (const [source, selection, execution] of [
		[{ goss: "tests/fixture/goss/valid.yaml", command: "true" }, "", "guest"],
		[{ goss: "tests/fixture/goss/valid.yaml" }, "*.xml", "guest"],
		[{ goss: "tests/fixture/goss/valid.yaml" }, "", "runner"],
		[{ command: "true", variables: "vars.json" }, "", "guest"],
	])
		assert.throws(
			() => new GuestAssertions(source, directory, "1", selection, execution),
		);
	const assertions = new GuestAssertions(
		{ goss: "tests/fixture/goss/valid.yaml" },
		directory,
	);
	assert.deepEqual(assertions.guestReports.patterns, ["goss.xml"]);
});

test("Goss rejects a mismatched release before extracting or copying it", (t) => {
	const directory = fixture(t);
	let copies = 0;
	const calls = [];
	t.mock.method(childProcess, "spawnSync", (program, args) => {
		calls.push(program);
		if (program === "curl")
			fs.writeFileSync(args[args.indexOf("--output") + 1], "corrupt release");
		return { status: 0, stdout: "" };
	});
	const suite = new GossSuite("tests/fixture/goss/valid.yaml");
	assert.throws(
		() =>
			suite.prepare(
				{
					name: "iac-test",
					command: () => "Linux x86_64",
					copyTo: () => copies++,
				},
				directory,
				"/tmp/iac-reports.fixture",
				60000,
			),
		/checksum/,
	);
	assert.deepEqual(calls, ["curl"]);
	assert.equal(copies, 0);
	assert.deepEqual(fs.readdirSync(directory), []);
});

test("Goss rejects empty native reports while retaining failed assertion reports", (t) => {
	const directory = fixture(t);
	const file = path.join(directory, "goss.xml");
	const suite = new GossSuite("tests/fixture/goss/valid.yaml");
	fs.writeFileSync(file, '<testsuite tests="0"/>');
	assert.throws(() => suite.validateReports([file]), /at least one/);
	fs.writeFileSync(
		file,
		'<testsuite tests="1" failures="1"><testcase name="service"><failure/></testcase></testsuite>',
	);
	assert.doesNotThrow(() => suite.validateReports([file]));
});

test("Molecule derives inventory only from a running owned VM", (t) => {
	const directory = fixture(t);
	const vm = VirtualMachine.allocate();
	t.after(() => fs.rmSync(vm.home, { recursive: true, force: true }));
	fs.writeFileSync(vm.sshConfig, "Host iac-test\n");
	t.mock.method(VirtualMachine.prototype, "exists", () => true);
	const env = { ANSIBLE_VM: vm.home, MOLECULE_INVENTORY_GROUP: "proxmox" };
	new MoleculeScenario(env).prepare(directory, "/checkout/molecule/default");
	const inventory = JSON.parse(
		fs.readFileSync(path.join(directory, "inventory.json")),
	);
	assert.deepEqual(Object.keys(inventory.proxmox.hosts), ["iac-test"]);
	assert.equal(
		inventory.proxmox.hosts["iac-test"].ansible_ssh_common_args,
		`-F ${vm.sshConfig}`,
	);
	for (const inputs of [
		{ ANSIBLE_VM: "/tmp" },
		{ ANSIBLE_INVENTORY_FILE: "production.ini" },
		{ MOLECULE_INVENTORY_GROUP: "all" },
		{ ANSIBLE_TEST_TIMEOUT_MINUTES: "0" },
	])
		assert.throws(() =>
			new MoleculeScenario({ ...env, ...inputs }).prepare(
				directory,
				"/checkout/molecule/default",
			),
		);
});

test("Molecule preserves failed process status including idempotence and timeout failures", (t) => {
	const directory = fixture(t);
	const execute = t.mock.method(childProcess, "spawnSync", () => ({
		status: 124,
	}));
	const scenario = new MoleculeScenario({
		ANSIBLE_REPORT_DIRECTORY: directory,
		MOLECULE_SCENARIO: "/checkout/molecule/default",
		GITHUB_WORKSPACE: "/checkout",
		ANSIBLE_TEST_TIMEOUT_MINUTES: "1",
	});
	assert.throws(() => scenario.run(), /failed or timed out/);
	assert.match(
		fs.readFileSync(path.join(directory, "scenario.xml"), "utf8"),
		/failures="1"/,
	);
	assert.equal(execute.mock.calls[0].arguments[0], "timeout");
	assert.equal(execute.mock.calls[0].arguments[1][1], "1m");
});
