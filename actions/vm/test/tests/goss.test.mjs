import * as execToolkit from "@actions/exec";
import * as io from "@actions/io";
import { suite, test } from "node:test";
import { GossSuite } from "../goss.cjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Copy the ESM namespace so tests can mock the injected helper.
const exec = { ...execToolkit };
const helpers = { exec, io };

function fixture(t) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goss-test-"));
	const previousDirectory = process.cwd();
	process.chdir(
		path.join(import.meta.dirname, "../../../../tests/fixture/goss"),
	);
	t.after(() => {
		process.chdir(previousDirectory);
		fs.rmSync(directory, { recursive: true, force: true });
	});
	return directory;
}

suite("vm/test - Goss verification", () => {
	test("Goss rejects a mismatched release before extracting or copying it", async (t) => {
		// Arrange
		const directory = fixture(t);
		let copies = 0;
		const calls = [];
		t.mock.method(exec, "exec", (_program, args) => {
			const program = args[2];
			calls.push(program);
			if (program === "curl")
				fs.writeFileSync(args[args.indexOf("--output") + 1], "corrupt release");
			return 0;
		});
		const goss = new GossSuite("valid.yaml");
		const vm = {
			name: "iac-test",
			command: () => "Linux x86_64",
			copyTo: () => copies++,
		};

		// Act
		const prepare = () =>
			goss.prepare(vm, directory, "/tmp/iac-reports.fixture", 60000, helpers);

		// Assert
		await assert.rejects(prepare, /checksum/);
		assert.deepEqual(calls, ["curl"]);
		assert.equal(copies, 0);
		assert.deepEqual(fs.readdirSync(directory), []);
	});

	test("Goss rejects empty native reports while retaining failed assertion reports", async (t) => {
		// Arrange
		const directory = fixture(t);
		const file = path.join(directory, "goss.xml");
		const goss = new GossSuite("valid.yaml");
		fs.writeFileSync(file, '<testsuite tests="0"/>');

		// Act
		const validateEmpty = () => goss.validateReports([file]);

		// Assert
		assert.throws(validateEmpty, /at least one/);

		// Arrange
		fs.writeFileSync(
			file,
			'<testsuite tests="1" skipped="1"><testcase name="skipped"><skipped/></testcase></testsuite>',
		);

		// Act
		const validateSkipped = () => goss.validateReports([file]);

		// Assert
		assert.throws(validateSkipped, /at least one/);

		// Arrange
		fs.writeFileSync(
			file,
			'<testsuite tests="1" failures="1"><testcase name="service"><failure/></testcase></testsuite>',
		);

		// Act
		const validateFailed = () => goss.validateReports([file]);

		// Assert
		assert.doesNotThrow(validateFailed);
	});
});
