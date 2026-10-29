const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const entrypoint = require("../actions/ansible/test/index.cjs");

function fixture(t) {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "ansible-composition-test-"),
	);
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const workspace = path.join(root, "checkout");
	const temp = path.join(root, "temp");
	fs.mkdirSync(workspace);
	fs.mkdirSync(temp);
	fs.writeFileSync(
		path.join(workspace, "requirements.txt"),
		"ansible-core==2.99.1\n",
	);
	fs.writeFileSync(path.join(workspace, "playbook.yml"), "---\n");
	const outputs = {};
	const failures = [];
	const env = {
		GITHUB_WORKSPACE: workspace,
		RUNNER_TEMP: temp,
		ANSIBLE_PHASE: "prepare",
		ANSIBLE_REQUIREMENTS: "requirements.txt",
		ANSIBLE_TEST_PLAYBOOK: "playbook.yml",
	};
	const core = {
		addPath: () => {},
		setOutput: (key, value) => {
			outputs[key] = value;
		},
		setFailed: (value) => failures.push(value),
	};
	return { root, workspace, temp, outputs, failures, env, core };
}

test("playbook tests keep the consumer's exact Ansible pin and explicit test target", (t) => {
	const f = fixture(t);
	entrypoint(f);
	assert.deepEqual(f.failures, []);
	assert.equal(f.outputs.mode, "playbook");
	assert.equal(f.outputs["target-python-version"], "");
	assert.equal(f.outputs["ansible-core-ref"], "v2.99.1");
	assert.equal(
		fs.readFileSync(f.outputs.constraint, "utf8"),
		"ansible-core==2.99.1\n",
	);
	assert.equal(f.outputs["test-playbook"], `${f.workspace}/playbook.yml`);
	assert.equal(path.dirname(f.outputs["report-directory"]), f.temp);
});

test("collection inputs select a single checked-out source with Galaxy metadata", (t) => {
	const f = fixture(t);
	const collection = "ansible_collections/example/smoke";
	fs.mkdirSync(path.join(f.workspace, collection), { recursive: true });
	fs.writeFileSync(
		path.join(f.workspace, collection, "galaxy.yml"),
		"namespace: example\nname: smoke\n",
	);
	entrypoint({
		...f,
		env: {
			...f.env,
			ANSIBLE_TEST_PLAYBOOK: "",
			ANSIBLE_COLLECTION: collection,
			ANSIBLE_TARGET_PYTHON_VERSION: "3.99",
		},
	});
	assert.deepEqual(f.failures, []);
	assert.equal(f.outputs.mode, "sanity");
	assert.equal(f.outputs["collection-root"], collection);
	assert.equal(f.outputs["target-python-version"], "3.99");
});

test("ambiguous selections, missing targets, non-pinned versions and escaping paths fail", (t) => {
	const f = fixture(t);
	fs.symlinkSync(f.temp, path.join(f.workspace, "outside"));
	fs.writeFileSync(
		path.join(f.workspace, "floating.txt"),
		"ansible-core>=2.99\n",
	);
	for (const inputs of [
		{ ANSIBLE_TEST_PLAYBOOK: "" },
		{ ANSIBLE_COLLECTION: "." },
		{ ANSIBLE_TEST_PLAYBOOK: "missing.yml" },
		{ ANSIBLE_TEST_PLAYBOOK: "outside" },
		{ ANSIBLE_TEST_PLAYBOOK: "../temp" },
		{ ANSIBLE_REQUIREMENTS: "floating.txt" },
		{ ANSIBLE_TARGET_PYTHON_VERSION: "3.99" },
		{
			ANSIBLE_TEST_PLAYBOOK: "",
			ANSIBLE_COLLECTION: ".",
			ANSIBLE_TARGET_PYTHON_VERSION: "3.99; false",
		},
	]) {
		f.failures.length = 0;
		entrypoint({ ...f, env: { ...f.env, ...inputs } });
		assert.equal(f.failures.length, 1, JSON.stringify(inputs));
	}
});

test("native reports are retained verbatim even when the upstream action has failed", (t) => {
	const f = fixture(t);
	entrypoint(f);
	const source = path.join(f.workspace, "collection/tests/output/junit");
	fs.mkdirSync(source, { recursive: true });
	const junit =
		'<testsuite tests="1" failures="1"><testcase name="sanity"><failure message="Synthetic invalid module"/></testcase></testsuite>';
	fs.writeFileSync(path.join(source, "sanity.xml"), junit);
	entrypoint({
		...f,
		env: {
			...f.env,
			ANSIBLE_PHASE: "collect",
			ANSIBLE_COLLECTION_ROOT: "collection",
			ANSIBLE_REPORT_DIRECTORY: f.outputs["report-directory"],
		},
	});
	assert.deepEqual(f.failures, []);
	assert.equal(fs.readFileSync(f.outputs["report-files"], "utf8"), junit);
});

test("missing reports and redirected report directories cannot be reported as success", (t) => {
	const f = fixture(t);
	entrypoint(f);
	const env = {
		...f.env,
		ANSIBLE_PHASE: "collect",
		ANSIBLE_REPORT_DIRECTORY: f.outputs["report-directory"],
	};
	entrypoint({ ...f, env });
	assert.match(f.failures.pop(), /no reports/);
	fs.mkdirSync(path.join(f.workspace, "collection/tests/output"), {
		recursive: true,
	});
	fs.symlinkSync(
		f.temp,
		path.join(f.workspace, "collection/tests/output/junit"),
	);
	entrypoint({ ...f, env: { ...env, ANSIBLE_COLLECTION_ROOT: "collection" } });
	assert.match(f.failures.pop(), /symbolic links/);
	assert.equal(f.outputs["report-files"], undefined);
});

test("test playbooks publish native JUnit without exposing the installed runtime", (t) => {
	const f = fixture(t);
	entrypoint(f);
	const reports = f.outputs["report-directory"];
	fs.mkdirSync(path.join(reports, "venv"));
	const junit =
		'<testsuite tests="1"><testcase name="assert fixture"/></testsuite>';
	fs.writeFileSync(path.join(reports, "playbook.xml"), junit);
	entrypoint({
		...f,
		env: {
			...f.env,
			ANSIBLE_PHASE: "collect",
			ANSIBLE_REPORT_DIRECTORY: reports,
		},
	});
	assert.deepEqual(f.failures, []);
	assert.equal(f.outputs["report-files"], path.join(reports, "playbook.xml"));
});
