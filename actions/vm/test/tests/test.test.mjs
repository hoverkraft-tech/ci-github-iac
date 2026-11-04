import * as io from "@actions/io";
import * as execToolkit from "@actions/exec";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { suite, test } from "node:test";
import { GuestAssertions } from "../assertions.cjs";
import { Guest } from "../guest.cjs";
import { limaFixture, qemuFixture } from "../../../../tests/helpers/vm.cjs";

// Copy the ESM namespace so tests can mock the injected helper.
const exec = { ...execToolkit };

suite("vm/test - execution", () => {
	for (const [backend, fixture] of [
		["lima", limaFixture],
		["qemu", qemuFixture],
	]) {
		test(`${backend} guest transport opens fresh logins and preserves quoted arguments, stdin and deadlines`, async (t) => {
			// Arrange
			const { vm } = fixture(t, { exec, io }, Guest);
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
			const { vm } = fixture(t, { exec, io }, Guest);
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
		const { reports } = limaFixture(t, { exec, io }, Guest);
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
		const { root, reports } = limaFixture(t, { exec, io }, Guest);
		fs.symlinkSync(import.meta.filename, path.join(root, "external.yaml"));
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
