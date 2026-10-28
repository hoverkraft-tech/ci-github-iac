const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");
const { test } = require("node:test");
const { VirtualMachine } = require("../actions/vm/runtime.cjs");
const { GuestAssertions } = require("../actions/vm/assertions.cjs");
const { localRun } = require("../actions/vm/cli.cjs");

const backend = path.resolve(__dirname, "../actions/vm");

function fixture(t) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "vm-test-"));
	const previousDirectory = process.cwd();
	process.chdir(root);
	const vm = VirtualMachine.allocate();
	fs.writeFileSync(
		path.join(root, "assert.sh"),
		"test -d /run/systemd/system\n",
	);
	t.after(() => {
		process.chdir(previousDirectory);
		fs.rmSync(vm.home, { recursive: true, force: true });
		fs.rmSync(root, { recursive: true, force: true });
	});
	return { root, vm, reports: path.join(root, ".reports") };
}

function runAction(t, operation, inputs) {
	const outputs = {};
	const failures = [];
	const core = {
		setOutput: (key, value) => {
			outputs[key] = value;
		},
		setFailed: (message) => failures.push(message),
		info: () => {},
	};
	const actionInputs = inputs;
	const previous = Object.fromEntries(
		Object.keys(actionInputs).map((key) => [key, process.env[key]]),
	);
	t.after(() => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});
	Object.assign(process.env, actionInputs);
	const execute = require(path.join(backend, operation, "index.cjs"));
	execute({ core });
	return { outputs, failures };
}

test("each invocation has a short private runtime", (t) => {
	const { vm } = fixture(t);
	const other = VirtualMachine.allocate();
	t.after(() => other.destroy());
	assert.notEqual(vm.home, other.home);
	assert.equal(fs.statSync(vm.home).mode & 0o777, 0o700);
	assert.ok(
		Buffer.byteLength(
			path.join(vm.home, vm.name, "ssh.sock.1234567890123456"),
		) < 108,
	);
});

test("shared, unmanaged and symlinked runtimes are rejected", (t) => {
	const { root, vm } = fixture(t);
	for (const directory of ["", root, "/tmp/not-owned"]) {
		assert.throws(() => new VirtualMachine(directory).destroy());
	}
	fs.chmodSync(vm.home, 0o755);
	assert.throws(() => vm.destroy());
	fs.rmSync(vm.home, { recursive: true });
	fs.symlinkSync(path.join(root, "missing"), vm.home);
	assert.throws(() => vm.destroy());
	assert.ok(fs.existsSync(path.join(root, "assert.sh")));
});

test("configuration must be a checkout file", (t) => {
	const { root } = fixture(t);
	fs.symlinkSync(
		path.join(backend, "create/lima.yml"),
		path.join(root, "external.yml"),
	);
	for (const config of ["missing.yml", "../outside.yml", "external.yml", "."]) {
		assert.throws(() => VirtualMachine.template(config));
	}
});

test("create accepts configuration without assertion or report inputs", (t) => {
	const { root, vm } = fixture(t);
	const config = path.join(root, "guest.yml");
	fs.writeFileSync(config, "cpus: 1\n");
	const command = t.mock.method(vm, "command", () => "");
	vm.create(VirtualMachine.template("guest.yml"));
	assert.ok(command.mock.calls[0].arguments[0].includes(config));
	assert.ok(command.mock.calls[0].arguments[0].includes("--plain"));
	assert.equal(command.mock.calls[0].arguments[1].timeout, 660000);
	assert.equal(fs.existsSync(path.join(root, ".reports")), false);
});

test("repeated creation refuses to reuse or delete a running VM", (t) => {
	const { vm } = fixture(t);
	t.mock.method(vm, "exists", () => true);
	const command = t.mock.method(vm, "command");
	assert.throws(() => vm.create(VirtualMachine.template("")));
	assert.equal(command.mock.callCount(), 0);
});

test("failed creation rolls back its partial guest", (t) => {
	const { vm } = fixture(t);
	const presence = [false, true, false];
	t.mock.method(vm, "exists", () => presence.shift());
	const command = t.mock.method(vm, "command", (args) => {
		if (args[0] === "start") throw new Error("synthetic failure");
		return "";
	});
	assert.throws(() => vm.create(VirtualMachine.template("")));
	assert.deepEqual(command.mock.calls.at(-1).arguments[0], [
		"delete",
		"--force",
		"iac-test",
	]);
	assert.equal(fs.existsSync(vm.home), false);
});

test("failed rollback preserves the recovery directory", (t) => {
	const { vm } = fixture(t);
	const presence = [false, true];
	t.mock.method(vm, "exists", () => presence.shift());
	t.mock.method(vm, "command", () => {
		throw new Error("synthetic failure");
	});
	assert.throws(() => vm.create(VirtualMachine.template("")));
	assert.ok(fs.existsSync(vm.home));
});

test("reports require a resolved directory and a bounded deadline", (t) => {
	const { reports } = fixture(t);
	for (const directory of [undefined, "", ".reports"]) {
		assert.throws(() => new GuestAssertions("assert.sh", directory));
	}
	for (const minutes of ["0", "41", "-1", "1.5", "nan", ""]) {
		assert.throws(() => new GuestAssertions("assert.sh", reports, minutes));
	}
});

test("local report destinations cannot escape the checkout", (t) => {
	const { root, vm } = fixture(t);
	fs.symlinkSync(vm.home, path.join(root, "reports"));
	for (const directory of ["reports/nested", "../outside", vm.home, "."]) {
		const run = childProcess.spawnSync(process.execPath, [
			path.join(backend, "cli.cjs"),
			"run",
			"--test-script",
			"assert.sh",
			"--report-directory",
			directory,
		]);
		assert.equal(run.status, 1);
		assert.equal(run.stdout.toString(), "");
	}
	assert.deepEqual(fs.readdirSync(vm.home), []);
});

test("invalid settings preserve earlier reports without creating files", (t) => {
	const { vm, reports } = fixture(t);
	t.mock.method(vm, "command", () => "");
	const previous = new GuestAssertions("assert.sh", reports);
	previous.run(vm);
	const content = fs.readFileSync(previous.report, "utf8");
	const directories = fs.readdirSync(reports);
	assert.throws(() => new GuestAssertions("assert.sh", reports, "invalid"));
	assert.deepEqual(fs.readdirSync(reports), directories);
	assert.equal(fs.readFileSync(previous.report, "utf8"), content);
});

test("assertions reach guest stdin with a deadline and leave the VM intact", (t) => {
	const { vm, reports } = fixture(t);
	const assertions = new GuestAssertions("assert.sh", reports, "3");
	const command = t.mock.method(vm, "command", () => "");
	assertions.run(vm);
	assert.deepEqual(command.mock.calls[0].arguments, [
		["shell", "--workdir=/tmp", "iac-test", "bash", "-euo", "pipefail", "-s"],
		{ timeout: 180000, input: "test -d /run/systemd/system\n" },
	]);
	assert.equal(command.mock.callCount(), 1);
	assert.ok(fs.existsSync(vm.home));
	assert.match(
		fs.readFileSync(assertions.report, "utf8"),
		/tests="1" failures="0"/,
	);
});

test("failed and timed out assertions produce redacted failure evidence", (t) => {
	const { vm, reports } = fixture(t);
	const assertions = new GuestAssertions("assert.sh", reports);
	for (const error of [
		new Error("secret-output"),
		Object.assign(new Error("secret"), { code: "ETIMEDOUT" }),
	]) {
		t.mock.method(vm, "command", () => {
			throw error;
		});
		assert.throws(() => assertions.run(vm));
		const report = fs.readFileSync(assertions.report, "utf8");
		assert.match(report, /failures="1"/);
		assert.equal(report.includes("secret"), false);
		assert.ok(fs.existsSync(vm.home));
	}
});

test("invalid scripts fail without guest execution", (t) => {
	const { root, vm, reports } = fixture(t);
	fs.writeFileSync(path.join(root, "empty.sh"), " \n");
	fs.symlinkSync(path.join(backend, "cli.cjs"), path.join(root, "external.sh"));
	const command = t.mock.method(vm, "command");
	for (const script of [
		"",
		"missing.sh",
		"empty.sh",
		"../outside.sh",
		"external.sh",
	]) {
		const assertions = new GuestAssertions(script, reports);
		assert.throws(() => assertions.run(vm));
		assert.match(fs.readFileSync(assertions.report, "utf8"), /failures="1"/);
	}
	assert.equal(command.mock.callCount(), 0);
});

test("repeated tests on one guest preserve each report", (t) => {
	const { vm, reports } = fixture(t);
	const command = t.mock.method(vm, "command", () => "");
	const assertions = new GuestAssertions("assert.sh", reports);
	assertions.run(vm);
	const first = assertions.report;
	const content = fs.readFileSync(first, "utf8");
	command.mock.mockImplementation(() => {
		throw new Error("synthetic failure");
	});
	assert.throws(() => assertions.run(vm));
	assert.notEqual(assertions.report, first);
	assert.equal(fs.readFileSync(first, "utf8"), content);
	assert.match(fs.readFileSync(assertions.report, "utf8"), /failures="1"/);
	assert.equal(
		fs.statSync(path.dirname(assertions.report)).mode & 0o777,
		0o700,
	);
});

test("failed report writes expose no partial or previous report", (t) => {
	const { vm, reports } = fixture(t);
	t.mock.method(vm, "command", () => "");
	const assertions = new GuestAssertions("assert.sh", reports);
	assertions.run(vm);
	const first = assertions.report;
	const content = fs.readFileSync(first, "utf8");
	const directories = fs.readdirSync(reports);
	const write = fs.writeFileSync;
	t.mock.method(fs, "writeFileSync", (filename) => {
		write(filename, "partial report");
		throw new Error("synthetic write failure");
	});
	assert.throws(() => assertions.run(vm));
	assert.equal(assertions.report, undefined);
	assert.deepEqual(fs.readdirSync(reports), directories);
	assert.equal(fs.readFileSync(first, "utf8"), content);
});

test("CLI commands use private Lima home, stdin and a forced timeout", (t) => {
	const { vm } = fixture(t);
	const spawn = t.mock.method(childProcess, "spawnSync", () => ({
		status: 0,
		stdout: "Running\n",
	}));
	assert.equal(vm.command(["list"]), "Running");
	const [executable, args, options] = spawn.mock.calls[0].arguments;
	assert.equal(executable, "limactl");
	assert.deepEqual(args, ["list"]);
	assert.equal(options.env.LIMA_HOME, vm.home);
	assert.equal(options.timeout, 120000);
	assert.equal(options.killSignal, "SIGKILL");
	assert.equal(options.stdio, "pipe");
	assert.equal(options.shell, undefined);
});

test("subprocess failures and timeouts cannot expose raw output", (t) => {
	const { vm } = fixture(t);
	const spawn = t.mock.method(childProcess, "spawnSync");
	for (const result of [
		{ status: 1, stdout: "private-output", stderr: "private-error" },
		{ status: null, error: new Error("private-command") },
	]) {
		spawn.mock.mockImplementation(() => result);
		assert.throws(() => vm.command(["list"]), {
			message: "VM command failed or timed out",
		});
	}
});

test("destruction verifies absence before removing runtime keys", (t) => {
	const { vm } = fixture(t);
	const presence = [true, false];
	t.mock.method(vm, "exists", () => presence.shift());
	const command = t.mock.method(vm, "command", () => "");
	vm.destroy();
	assert.deepEqual(command.mock.calls[0].arguments[0], [
		"delete",
		"--force",
		"iac-test",
	]);
	assert.equal(fs.existsSync(vm.home), false);
	const rerun = childProcess.spawnSync(process.execPath, [
		path.join(backend, "cli.cjs"),
		"destroy",
		"--vm",
		vm.home,
	]);
	assert.equal(rerun.status, 0, rerun.stderr?.toString());
});

test("a guest surviving deletion preserves recovery access and fails", (t) => {
	const { vm } = fixture(t);
	t.mock.method(vm, "exists", () => true);
	t.mock.method(vm, "command", () => "");
	assert.throws(() => vm.destroy());
	assert.ok(fs.existsSync(vm.home));
});

test("an empty runtime can be destroyed without installed Lima", (t) => {
	const { vm } = fixture(t);
	const command = t.mock.method(vm, "command");
	vm.destroy();
	assert.equal(command.mock.callCount(), 0);
	assert.equal(fs.existsSync(vm.home), false);
});

test("local composition attempts cleanup after startup and test failures", (t) => {
	const { vm } = fixture(t);
	t.mock.method(VirtualMachine, "allocate", () => vm);
	t.mock.method(console, "info", () => {});
	for (const failed of ["create", "test", "destroy"]) {
		const trace = [];
		const invoke = (name) => {
			trace.push(name);
			if (failed === name) throw new Error("synthetic failure");
		};
		t.mock.method(vm, "create", () => invoke("create"));
		t.mock.method(vm, "destroy", () => invoke("destroy"));
		assert.throws(() =>
			localRun(VirtualMachine.template(""), { run: () => invoke("test") }),
		);
		assert.equal(trace.at(-1), "destroy");
		assert.equal(trace.includes("test"), failed !== "create");
	}
});

test("creation action exports recovery outputs before failed startup", (t) => {
	const { vm } = fixture(t);
	t.mock.method(VirtualMachine, "allocate", () => vm);
	t.mock.method(vm, "command", () => {
		throw new Error("secret-output");
	});
	const { outputs, failures } = runAction(t, "create", { VM_CONFIG: "" });
	assert.equal(outputs.vm, vm.home);
	assert.equal(outputs.id, path.basename(vm.home));
	assert.equal(failures.length, 1);
	assert.equal(failures[0].includes("secret"), false);
	assert.equal(fs.existsSync(vm.home), false);
});

test("test action exports a failed report while preserving the guest", (t) => {
	const { root, vm } = fixture(t);
	t.mock.method(VirtualMachine.prototype, "command", () => {
		throw new Error("secret-command");
	});
	const { outputs, failures } = runAction(t, "test", {
		VM_DIRECTORY: vm.home,
		TEST_SCRIPT: "assert.sh",
		RUNNER_TEMP: path.join(root, "runner temp"),
		TEST_TIMEOUT_MINUTES: "1",
	});
	assert.equal(
		path.dirname(path.dirname(outputs.report)),
		path.join(root, "runner temp"),
	);
	assert.equal(fs.existsSync(path.join(root, ".reports")), false);
	assert.equal(failures.length, 1);
	assert.equal(failures[0].includes("secret"), false);
	assert.match(fs.readFileSync(outputs.report, "utf8"), /failures="1"/);
	assert.ok(fs.existsSync(vm.home));
});

test("report write failures fail the action and allow local cleanup", (t) => {
	const { root, vm, reports } = fixture(t);
	t.mock.method(VirtualMachine.prototype, "command", () => "");
	t.mock.method(fs, "writeFileSync", () => {
		throw new Error("synthetic disk failure");
	});
	const { outputs, failures } = runAction(t, "test", {
		VM_DIRECTORY: vm.home,
		TEST_SCRIPT: "assert.sh",
		RUNNER_TEMP: path.join(root, "runner temp"),
		TEST_TIMEOUT_MINUTES: "1",
	});
	assert.deepEqual(outputs, {});
	assert.equal(failures.length, 1);
	t.mock.method(VirtualMachine, "allocate", () => vm);
	t.mock.method(vm, "create", () => {});
	t.mock.method(console, "info", () => {});
	assert.throws(() =>
		localRun(
			VirtualMachine.template(""),
			new GuestAssertions("assert.sh", reports),
		),
	);
	assert.equal(fs.existsSync(vm.home), false);
});

test("destruction action exports removal only after verified cleanup", (t) => {
	const { vm } = fixture(t);
	const presence = t.mock.method(
		VirtualMachine.prototype,
		"exists",
		() => true,
	);
	t.mock.method(VirtualMachine.prototype, "command", () => "");
	const failed = runAction(t, "destroy", { VM_DIRECTORY: vm.home });
	assert.equal(failed.outputs.removed, undefined);
	assert.equal(failed.failures.length, 1);
	assert.ok(fs.existsSync(vm.home));
	presence.mock.mockImplementation(() => false);
	const success = runAction(t, "destroy", { VM_DIRECTORY: vm.home });
	assert.equal(success.outputs.removed, "true");
	assert.deepEqual(success.failures, []);
	assert.equal(fs.existsSync(vm.home), false);
});
