const exec = require("@actions/exec");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { suite, test } = require("node:test");
const { GuestAssertions } = require("../assertions.cjs");
const { Guest } = require("../guest.cjs");
const {
	limaFixture,
	qemuFixture,
} = require("../../../../tests/helpers/vm.cjs");

suite("vm/test - execution", () => {
	for (const [backend, fixture] of [
		["lima", limaFixture],
		["qemu", qemuFixture],
	]) {
		test(`${backend} guest transport opens fresh logins and preserves quoted arguments, stdin and deadlines`, async (t) => {
			// Arrange
			const { vm } = fixture(t, Guest);
			t.mock.method(vm, "exists", () => true);
			const spawn = t.mock.method(exec, "exec", (_program, _args, options) => {
				options.listeners.stdout(Buffer.from("result\n"));
				return 0;
			});
			const input = 'printf "%s" "$GUEST_VALUE"\n';

			// Act
			const result = await vm.command(
				[
					"shell",
					"--workdir=/tmp",
					vm.name,
					"printf",
					"%s",
					"guest's value; $(false)",
				],
				{ input, timeout: 12345 },
			);

			// Assert
			assert.equal(result, "result");
			const [program, args, options] = spawn.mock.calls[0].arguments;
			assert.equal(program, "timeout");
			assert.deepEqual(args, [
				"--kill-after=5s",
				"12.345s",
				"ssh",
				"-o",
				"ControlMaster=no",
				"-o",
				"ControlPath=none",
				"-o",
				"ControlPersist=no",
				"-F",
				vm.sshConfig,
				vm.name,
				"cd /tmp && 'printf' '%s' 'guest'\\''s value; $(false)'",
			]);
			assert.equal(options.input.toString(), input);
			assert.equal(options.silent, true);
			assert.equal(options.shell, undefined);
		});
	}

	for (const [backend, fixture] of [
		["lima", limaFixture],
		["qemu", qemuFixture],
	]) {
		test(`${backend} guest uploads reject paths outside private test files`, async (t) => {
			// Arrange
			const { vm } = fixture(t, Guest);
			t.mock.method(vm, "exists", () => true);
			const spawn = t.mock.method(exec, "exec");
			for (const destination of [
				"/etc/passwd",
				"/tmp/iac-reports.fixture/../outside",
				"/tmp/iac-reports.fixture/file;false",
			]) {
				// Act
				const copy = () => vm.copyTo("synthetic", destination);

				// Assert
				await assert.rejects(copy, /private guest test file/);
			}
			assert.equal(spawn.mock.callCount(), 0);
		});
	}

	test("reports require a resolved directory and a bounded deadline", async (t) => {
		// Arrange
		const { reports } = limaFixture(t, Guest);
		for (const directory of [undefined, "", ".reports"]) {
			// Act
			const configure = () =>
				new GuestAssertions({ goss: "guest.yml" }, directory);

			// Assert
			assert.throws(configure);
		}
		for (const minutes of ["0", "41", "-1", "1.5", "nan", ""]) {
			// Act
			const configure = () =>
				new GuestAssertions({ goss: "guest.yml" }, reports, minutes);

			// Assert
			assert.throws(configure);
		}
	});

	test("invalid suites fail before any guest work", (t) => {
		// Arrange
		const { root, reports } = limaFixture(t, Guest);
		fs.symlinkSync(__filename, path.join(root, "external.yaml"));
		for (const goss of [
			undefined,
			"",
			"missing.yaml",
			"external.yaml",
			"../outside.yaml",
		]) {
			// Act
			const configure = () => new GuestAssertions({ goss }, reports);
			// Assert
			assert.throws(configure);
		}
	});
});
