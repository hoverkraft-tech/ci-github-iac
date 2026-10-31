const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { QemuMachine } = require("../actions/vm/_internal/qemu.cjs");
const { VirtualMachine } = require("../actions/vm/_internal/runtime.cjs");
const { QemuCreation } = require("../actions/vm/create/qemu.cjs");
const { GuestAssertions } = require("../actions/vm/test/assertions.cjs");

function fixture(t) {
	const root = fs.mkdtempSync("/tmp/qemu-test-");
	const previous = process.cwd();
	process.chdir(root);
	const vm = QemuMachine.allocate();
	for (const name of ["installer.iso", "key"])
		fs.writeFileSync(name, "synthetic");
	const config = {
		cpus: 2,
		memoryMiB: 2048,
		diskGiB: 10,
		diskSerial: "TEST_DISK",
		iso: "installer.iso",
		network: {
			subnet: "192.0.2.0/24",
			address: "192.0.2.10",
			gateway: "192.0.2.1",
			dns: "192.0.2.2",
			mac: "02:00:00:00:00:01",
		},
		ssh: { user: "root", privateKey: "key" },
	};
	const creation = (value = config) => {
		fs.writeFileSync("vm.json", JSON.stringify(value));
		return new QemuCreation("vm.json", "1");
	};
	t.after(() => {
		process.chdir(previous);
		fs.rmSync(vm.home, { recursive: true, force: true });
		fs.rmSync(root, { recursive: true, force: true });
	});
	return { root, vm, config, creation };
}

test("QEMU configuration requires bounded resources, private media and matching network addresses", (t) => {
	const { creation, config } = fixture(t);
	assert.equal(creation().config.diskSerial, "TEST_DISK");
	for (const patch of [
		{ cpus: 0 },
		{ diskGiB: 129 },
		{ memoryMiB: "2048" },
		{ iso: "/dev/null" },
		{ image: "installer.iso" },
		{ seed: "installer.iso" },
		{ arguments: "-drive /dev/sda" },
		{ diskSerial: "unsafe,drive" },
		{ ssh: { user: "root\nProxyCommand bad", privateKey: "key" } },
		{ network: { ...config.network, address: "10.0.0.10" } },
		{ network: { ...config.network, dns: config.network.gateway } },
	])
		assert.throws(() => creation({ ...config, ...patch }));
});

test("QEMU runtime selection rejects unmanaged paths and unsafe ownership", (t) => {
	const { vm, root } = fixture(t);
	assert.ok(VirtualMachine.open(vm.home) instanceof QemuMachine);
	assert.throws(() => new QemuMachine(root));
	fs.chmodSync(vm.home, 0o755);
	assert.throws(() => vm.destroy());
	fs.chmodSync(vm.home, 0o700);
	fs.rmSync(vm.home, { recursive: true });
	fs.symlinkSync(root, vm.home);
	assert.throws(() => vm.destroy());
	assert.ok(fs.existsSync(path.join(root, "key")));
});

test("cleanup never signals another process or deletes its recovery files", (t) => {
	const { vm } = fixture(t);
	fs.writeFileSync(path.join(vm.home, "pid"), String(process.pid));
	const kill = t.mock.method(process, "kill", () =>
		assert.fail("Must not signal an unrelated process"),
	);
	assert.throws(() => vm.destroy(), /ownership/);
	assert.equal(kill.mock.callCount(), 0);
	assert.ok(fs.existsSync(vm.home));
	fs.unlinkSync(path.join(vm.home, "pid"));
	vm.destroy();
	vm.destroy();
	assert.equal(fs.existsSync(vm.home), false);
});

test("failed QEMU setup rolls back an allocated runtime", async (t) => {
	const { creation, vm } = fixture(t);
	const operation = creation();
	t.mock.method(operation, "port", async () => {
		throw new Error("synthetic port allocation failure");
	});
	await assert.rejects(operation.start(vm, { info() {} }));
	assert.equal(fs.existsSync(vm.home), false);
});

test("installer power-off precedes disk boot and SSH readiness", async (t) => {
	const { creation, vm } = fixture(t);
	const operation = creation();
	t.mock.method(operation, "port", async () => 2222);
	t.mock.method(operation, "prepare", () => {});
	const boots = t.mock.method(operation, "boot", () => {});
	const states = [false, false, true];
	t.mock.method(vm, "exists", () => states.shift());
	const subprocess = t.mock.method(
		require("node:child_process"),
		"spawnSync",
		() => ({ status: 0, stdout: "" }),
	);
	await operation.start(vm, { info() {} });
	assert.deepEqual(
		boots.mock.calls.map((call) => call.arguments[2]),
		[true, false],
	);
	assert.equal(subprocess.mock.calls[0].arguments[0], "ssh");
	assert.ok(
		subprocess.mock.calls[0].arguments[1].includes(
			"StrictHostKeyChecking=accept-new",
		),
	);
});

test("runner tests preserve native reports after failure and isolate each invocation", (t) => {
	const { vm, root } = fixture(t);
	t.mock.method(vm, "exists", () => true);
	const reports = path.join(root, "reports");
	const source = {
		command:
			'test -n "$VM_SSH_CONFIG"; printf "<testsuite/>" > "$REPORTS_DIR/native.xml"; exit 1',
	};
	const assertions = new GuestAssertions(
		source,
		reports,
		"1",
		"*.xml",
		"runner",
	);
	assert.throws(() => assertions.run(vm));
	const first = assertions.reportFiles[0];
	assert.equal(fs.readFileSync(first, "utf8"), "<testsuite/>");
	assert.match(fs.readFileSync(assertions.report, "utf8"), /failures="1"/);
	assert.throws(() => assertions.run(vm));
	assert.notEqual(first, assertions.reportFiles[0]);
	assert.ok(fs.existsSync(first));
	assert.equal(
		fs
			.readdirSync(path.dirname(assertions.report))
			.some((name) => name.startsWith("source-")),
		false,
	);
});

test("runner report selection cannot follow symlinks or succeed with missing reports", (t) => {
	const { vm, root } = fixture(t);
	t.mock.method(vm, "exists", () => true);
	const assertions = new GuestAssertions(
		{ command: 'ln -s "$PWD/key" "$REPORTS_DIR/native.xml"' },
		root,
		"1",
		"*.xml",
		"runner",
	);
	assert.throws(() => assertions.run(vm));
	assert.deepEqual(assertions.reportFiles, []);
	assert.equal(fs.readFileSync("key", "utf8"), "synthetic");
});

test("runner tools cannot consume subsequent commands from script stdin", (t) => {
	const { vm, root } = fixture(t);
	t.mock.method(vm, "exists", () => true);
	const assertions = new GuestAssertions(
		{
			command:
				'cat >/dev/null\nprintf "<testsuite/>" > "$REPORTS_DIR/native.xml"\n',
		},
		root,
		"1",
		"*.xml",
		"runner",
	);
	assertions.run(vm);
	assert.equal(
		fs.readFileSync(assertions.reportFiles[0], "utf8"),
		"<testsuite/>",
	);
	assert.equal(
		fs.existsSync(path.join(path.dirname(assertions.report), "command.sh")),
		false,
	);
});
