const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const entrypoint = require("../actions/ansible/test/index.cjs");

function fixture(t) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ansible-check-test-"));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const workspace = path.join(root, "checkout");
	const temp = path.join(root, "temp");
	fs.mkdirSync(workspace);
	fs.mkdirSync(temp);
	for (const filename of ["first.yml", "second.yml", "inventory.yml"]) fs.writeFileSync(path.join(workspace, filename), "---\n");
	const collection = "collections/ansible_collections/example/smoke";
	fs.mkdirSync(path.join(workspace, collection), { recursive: true });
	const outputs = {};
	const failures = [];
	const calls = [];
	const env = { GITHUB_WORKSPACE: workspace, RUNNER_TEMP: temp, ANSIBLE_TEST_IMAGE: "fixture:local", ANSIBLE_TEST_PLAYBOOKS: "first.yml\nsecond.yml", ANSIBLE_TEST_INVENTORY: "inventory.yml" };
	const core = { info() {}, setOutput: (key, value) => { outputs[key] = value; }, setFailed: (value) => failures.push(value) };
	const success = { status: 0, stdout: "", stderr: "" };
	const run = (command, args) => { calls.push({ command, args }); return args.includes("--version") ? { ...success, stdout: "Python 3.14.1\n" } : success; };
	return { root, workspace, temp, collection, outputs, failures, calls, env, core, run, success };
}

test("syntax and sanity checks use native commands and the image's Python with no consumer Makefile", async (t) => {
	const f = fixture(t);
	f.env.ANSIBLE_TEST_COLLECTIONS = f.collection;
	f.env.ANSIBLE_TEST_CACHE = ".cache/sanity";
	f.env.ANSIBLE_TEST_ENVIRONMENT = "ANSIBLE_COLLECTIONS_PATH=/opt/collections:/workspace/collections";
	await entrypoint(f);
	assert.deepEqual(f.failures, []);
	assert.equal(f.calls.length, 4);
	assert.ok(f.calls.every(({ command, args }) => command === "docker" && args.includes("--user") && !args.includes("make")));
	assert.ok(f.calls[0].args.includes("/workspace/inventory.yml"));
	assert.deepEqual(f.calls[3].args.slice(-4), ["ansible-test", "sanity", "--python", "3.14"]);
	assert.ok(f.calls[3].args.includes(`/workspace/${f.collection}`));
	assert.ok(f.calls[3].args.includes(`type=bind,src=${f.workspace}/.cache/sanity,dst=/ansible-test-cache`));
	assert.match(fs.readFileSync(f.outputs["report-files"].split("\n")[0], "utf8"), /tests="3" failures="0"/);
	assert.equal(fs.readdirSync(f.temp).some((name) => name.startsWith("ansible-accounts-")), false);
});

test("failures do not suppress subsequent checks and reports exclude raw output", async (t) => {
	const f = fixture(t);
	f.env.ANSIBLE_TEST_COLLECTIONS = f.collection;
	const run = (command, args) => {
		const result = f.run(command, args);
		return args.includes("/workspace/first.yml") || args.includes("sanity") ? { status: 2, stdout: "[ERROR]: synthetic-private-output\nOrigin: /workspace/roles/task.yml:7:3\n", stderr: "" } : result;
	};
	await entrypoint({ ...f, run });
	assert.equal(f.calls.length, 4);
	assert.equal(f.failures.length, 1);
	const [junit, sarif] = f.outputs["report-files"].split("\n").map((filename) => fs.readFileSync(filename, "utf8"));
	assert.match(junit, /tests="3" failures="2"/);
	assert.equal(`${junit}${sarif}`.includes("synthetic-private-output"), false);
	const location = JSON.parse(sarif).runs[0].results[0].locations[0].physicalLocation;
	assert.equal(location.artifactLocation.uri, "roles/task.yml");
	assert.deepEqual(location.region, { startLine: 7, startColumn: 3 });
});

test("timeouts remove the named container and still publish failure results", async (t) => {
	const f = fixture(t);
	f.env.ANSIBLE_TEST_PLAYBOOKS = "first.yml";
	await entrypoint({ ...f, run: (command, args) => {
		f.run(command, args);
		return args[0] === "run" ? { status: null, error: new Error("timeout"), signal: "SIGTERM" } : f.success;
	} });
	assert.equal(f.failures.length, 1);
	const name = f.calls[0].args[f.calls[0].args.indexOf("--name") + 1];
	assert.deepEqual(f.calls[1].args, ["rm", "--force", name]);
	assert.match(fs.readFileSync(f.outputs["report-files"].split("\n")[0], "utf8"), /failures="1"/);
});

test("container cleanup failure is reported and cannot pass", async (t) => {
	const f = fixture(t);
	await entrypoint({ ...f, run: () => ({ status: 1, error: new Error("failed"), stderr: "daemon unavailable" }) });
	assert.match(f.failures[0], /remove the interrupted/);
	assert.ok(f.outputs["report-files"]);
});

test("missing selections, files, directories, invalid settings and path escapes fail before Docker", async (t) => {
	const f = fixture(t);
	fs.symlinkSync(f.temp, path.join(f.workspace, "outside"));
	fs.writeFileSync(path.join(f.workspace, "empty.yml"), "");
	const invalid = [
		{ ANSIBLE_TEST_PLAYBOOKS: "" },
		{ ANSIBLE_TEST_PLAYBOOKS: "missing.yml" },
		{ ANSIBLE_TEST_PLAYBOOKS: "empty.yml" },
		{ ANSIBLE_TEST_PLAYBOOKS: "../temp" },
		{ ANSIBLE_TEST_COLLECTIONS: "." },
		{ ANSIBLE_TEST_CACHE: "outside/new/cache" },
		{ ANSIBLE_TEST_IMAGE: "--privileged" },
		{ ANSIBLE_TEST_ENVIRONMENT: "HOME=/root" },
		{ ANSIBLE_TEST_ENVIRONMENT: "ANSIBLE_HOME=/elsewhere" },
	];
	for (const inputs of invalid) {
		f.failures.length = 0;
		await entrypoint({ ...f, env: { ...f.env, ...inputs } });
		assert.equal(f.failures.length, 1, JSON.stringify(inputs));
	}
	assert.equal(f.calls.length, 0);
	assert.equal(fs.existsSync(path.join(f.temp, "new")), false);
});

test("reruns preserve earlier reports and escape XML filenames", async (t) => {
	const f = fixture(t);
	fs.writeFileSync(path.join(f.workspace, 'a&"b.yml'), "---\n");
	f.env.ANSIBLE_TEST_PLAYBOOKS = 'a&"b.yml';
	await entrypoint(f);
	const first = f.outputs["report-files"];
	await entrypoint(f);
	assert.notEqual(first, f.outputs["report-files"]);
	assert.match(fs.readFileSync(first.split("\n")[0], "utf8"), /a&amp;&quot;b.yml/);
});
