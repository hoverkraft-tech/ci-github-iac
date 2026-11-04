import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { suite, test } from "node:test";
import { GuestReports } from "../reports.cjs";
import { GuestAssertions } from "../assertions.cjs";
import * as exec from "@actions/exec";
import * as io from "@actions/io";

async function fixture(t) {
	const directory = fs.mkdtempSync("/tmp/report-test-");
	const guest = fs.mkdtempSync("/tmp/iac-reports.");
	const previous = process.cwd();
	process.chdir(directory);
	t.after(() => {
		process.chdir(previous);
		fs.rmSync(directory, { recursive: true, force: true });
		fs.rmSync(guest, { recursive: true, force: true });
	});
	fs.writeFileSync("suite.yaml", "{}");
	const xml = '<testsuite tests="1"><testcase name="fixture"/></testsuite>';
	fs.writeFileSync(path.join(guest, "goss.xml"), xml);
	fs.writeFileSync(path.join(guest, "private.txt"), "synthetic-private-output");
	const execute = async (args) => {
		if (args.includes("mktemp")) return guest;
		if (args.includes("find"))
			return (
				await exec.getExecOutput("find", args.slice(args.indexOf("find") + 1), {
					silent: true,
				})
			).stdout;
		if (args[0] === "copy") fs.copyFileSync(args[2].split(":")[1], args[3]);
		if (args.includes("rm")) fs.rmSync(guest, { recursive: true });
		return "";
	};
	const vm = { name: "fixture", command: execute };
	const assertions = new GuestAssertions({ goss: "suite.yaml" }, directory);
	t.mock.method(assertions.goss, "prepare", () => "goss validate");
	return { directory, guest, vm, execute, assertions, xml };
}

suite("vm/test - report safety", () => {
	test("only one bounded nonempty native report can be collected", () => {
		// Arrange
		const reports = new GuestReports();
		for (const manifest of [
			"",
			"0\tgoss.xml\0",
			"20971521\tgoss.xml\0",
			"2\t../goss.xml\0",
			"2\tgoss.xml\0".repeat(2),
		]) {
			// Act
			const select = () => reports.select(manifest);
			// Assert
			assert.throws(select);
		}
		// Act
		const selected = reports.select("10\tgoss.xml\0" + "20\tprivate.txt\0");
		// Assert
		assert.deepEqual(selected, [{ path: "goss.xml", size: 10 }]);
	});

	test("failed assertions retain native results and redact raw errors", async (t) => {
		// Arrange
		const { directory, guest, vm, execute, assertions, xml } = await fixture(t);
		t.mock.method(vm, "command", (args) => {
			if (args.includes("bash")) throw new Error("synthetic-private-output");
			return execute(args);
		});
		// Act
		const run = () => assertions.run(vm, { exec, io });
		// Assert
		await assert.rejects(run);
		assert.equal(fs.existsSync(guest), false);
		assert.equal(assertions.reportFiles.length, 1);
		assert.equal(fs.readFileSync(assertions.reportFiles[0], "utf8"), xml);
		const status = fs.readFileSync(assertions.report, "utf8");
		assert.match(status, /failures="1"/);
		assert.equal(status.includes("synthetic-private-output"), false);
		assert.equal(
			fs.existsSync(path.join(directory, "guest/private.txt")),
			false,
		);
	});

	for (const failure of [
		"symlink",
		"partial-transfer",
		"cleanup",
		"empty-suite",
		"report-write",
	]) {
		test(`${failure} fails without publishing incomplete results`, async (t) => {
			// Arrange
			const { guest, vm, execute, assertions } = await fixture(t);
			if (failure === "symlink") {
				fs.unlinkSync(path.join(guest, "goss.xml"));
				fs.symlinkSync(
					path.join(guest, "private.txt"),
					path.join(guest, "goss.xml"),
				);
			}
			if (failure === "empty-suite")
				fs.writeFileSync(
					path.join(guest, "goss.xml"),
					'<testsuite tests="0"/>',
				);
			t.mock.method(vm, "command", (args) => {
				if (failure === "partial-transfer" && args[0] === "copy") {
					fs.writeFileSync(args[3], "partial");
					return "";
				}
				if (failure === "cleanup" && args.includes("rm"))
					throw new Error("cleanup failed");
				return execute(args);
			});
			if (failure === "report-write") {
				const write = fs.writeFileSync;
				t.mock.method(fs, "writeFileSync", (file, ...args) => {
					if (file.endsWith("e2e.junit.xml")) {
						write(file, "partial");
						throw new Error("write failed");
					}
					return write(file, ...args);
				});
			}
			// Act
			const run = () => assertions.run(vm, { exec, io });
			// Assert
			await assert.rejects(run);
			assert.equal(
				assertions.reportFiles.length,
				["cleanup", "report-write"].includes(failure) ? 1 : 0,
			);
			if (failure === "report-write")
				assert.equal(assertions.report, undefined);
			else
				assert.match(
					fs.readFileSync(assertions.report, "utf8"),
					/failures="1"/,
				);
			assert.equal(fs.existsSync(guest), failure === "cleanup");
		});
	}
});
