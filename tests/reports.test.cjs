const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test } = require("node:test");
const { GuestReports } = require("../actions/vm/reports.cjs");
const { GuestAssertions } = require("../actions/vm/assertions.cjs");

function reportFixture(t, selection = "**/*.xml,coverage/*.info") {
	const directory = fs.mkdtempSync("/tmp/report-test-");
	const guest = fs.mkdtempSync("/tmp/iac-reports.");
	t.after(() => {
		fs.rmSync(directory, { recursive: true, force: true });
		fs.rmSync(guest, { recursive: true, force: true });
	});
	fs.writeFileSync(path.join(guest, "junit.xml"), '<testsuite tests="1"/>');
	fs.mkdirSync(path.join(guest, "coverage"));
	fs.writeFileSync(path.join(guest, "coverage/lcov.info"), "TN:synthetic\n");
	fs.writeFileSync(path.join(guest, "private.txt"), "synthetic-private-output");
	fs.symlinkSync(
		path.join(guest, "private.txt"),
		path.join(guest, "linked.xml"),
	);
	fs.symlinkSync(directory, path.join(guest, "external"));
	const vm = { name: "fixture", command: () => "" };
	const execute = (args) => {
		if (args.includes("mktemp")) return guest;
		if (args.includes("find"))
			return execFileSync("find", args.slice(args.indexOf("find") + 1), {
				encoding: "utf8",
			});
		if (args[0] === "copy")
			fs.copyFileSync(args[2].slice(args[2].indexOf(":") + 1), args[3]);
		if (args.includes("rm")) fs.rmSync(guest, { recursive: true });
		return "";
	};
	const command = t.mock.method(vm, "command", execute);
	const reports = new GuestReports(selection);
	reports.prepare(vm);
	return { directory, guest, vm, command, reports, execute };
}

function assertionFixture(t) {
	const fixture = reportFixture(t);
	const previous = process.cwd();
	process.chdir(fixture.directory);
	t.after(() => process.chdir(previous));
	fs.writeFileSync("assert.sh", "true\n");
	return fixture;
}

test("report selection accepts lists and globs within REPORTS_DIR", () => {
	const reports = new GuestReports("*.xml;coverage/*.info\n*.xml");
	assert.deepEqual(
		reports
			.select("20\tjunit.xml\0" + "8\tcoverage/lcov.info\0")
			.map((file) => file.path),
		["coverage/lcov.info", "junit.xml"],
	);
	for (const pattern of [
		"/etc/passwd",
		"../*.xml",
		"nested/../../x",
		"$(id)",
	]) {
		assert.throws(() => new GuestReports(pattern));
	}
});

test("requested reports must exist, be nonempty and fit collection limits", () => {
	const reports = new GuestReports("*.xml");
	for (const manifest of [
		"",
		"0\tempty.xml\0",
		"20971521\tlarge.xml\0",
		"1\t../outside.xml\0",
		"1\tbad\nname.xml\0",
		Array.from({ length: 101 }, (_, index) => `1\t${index}.xml\0`).join(""),
	]) {
		assert.throws(() => reports.select(manifest));
	}
	assert.throws(() =>
		new GuestReports("*.xml,missing.info").select("1\tgood.xml\0"),
	);
});

test("collection copies only selected regular files and preserves their names", (t) => {
	const { reports, vm, directory, guest, command } = reportFixture(t);
	const files = reports.collect(vm, directory);
	assert.deepEqual(
		files.map((file) => path.relative(directory, file)),
		["guest/coverage/lcov.info", "guest/junit.xml"],
	);
	assert.equal(
		fs.readFileSync(files[1], "utf8"),
		fs.readFileSync(path.join(guest, "junit.xml"), "utf8"),
	);
	assert.equal(fs.existsSync(path.join(directory, "guest/linked.xml")), false);
	assert.equal(fs.existsSync(path.join(directory, "guest/private.txt")), false);
	for (const call of command.mock.calls.filter(
		(call) => call.arguments[0][0] === "copy",
	)) {
		assert.equal(call.arguments[0][1], "--backend=scp");
		assert.ok(
			call.arguments[1].timeout > 0 && call.arguments[1].timeout <= 120000,
		);
	}
	reports.cleanup(vm);
	assert.equal(fs.existsSync(guest), false);
	assert.ok(files.every((file) => fs.existsSync(file)));
});

test("a failed transfer removes all staged files without disturbing prior evidence", (t) => {
	const { reports, vm, directory, command, execute } = reportFixture(t);
	fs.writeFileSync(path.join(directory, "prior.xml"), "earlier result");
	let copies = 0;
	command.mock.mockImplementation((args) => {
		if (args[0] !== "copy" || copies++ === 0) return execute(args);
		fs.writeFileSync(args[3], "partial");
		throw new Error("synthetic transfer failure");
	});
	assert.throws(() => reports.collect(vm, directory));
	assert.deepEqual(fs.readdirSync(directory), ["prior.xml"]);
	assert.equal(
		fs.readFileSync(path.join(directory, "prior.xml"), "utf8"),
		"earlier result",
	);
});

test("incomplete copies fail before reports become visible", (t) => {
	const { reports, vm, directory, command } = reportFixture(t, "*.xml");
	command.mock.mockImplementation((args) => {
		if (args.includes("find")) return "100\tjunit.xml\0";
		if (args[0] === "copy") fs.writeFileSync(args[3], "partial");
		return "";
	});
	assert.throws(() => reports.collect(vm, directory));
	assert.deepEqual(fs.readdirSync(directory), []);
});

test("test failures and timeouts still collect reports before guest report cleanup", (t) => {
	const { directory, guest, vm, command, execute } = assertionFixture(t);
	command.mock.mockImplementation((args) => {
		if (args.includes("bash")) {
			assert.ok(args.includes(`REPORTS_DIR=${guest}`));
			throw Object.assign(new Error("synthetic timeout"), {
				code: "ETIMEDOUT",
			});
		}
		return execute(args);
	});
	const assertions = new GuestAssertions(
		{ script: "assert.sh" },
		directory,
		"1",
		"*.xml",
	);
	assert.throws(() => assertions.run(vm));
	assert.equal(assertions.reportFiles.length, 1);
	assert.ok(fs.existsSync(assertions.reportFiles[0]));
	assert.match(fs.readFileSync(assertions.report, "utf8"), /failures="1"/);
	assert.equal(fs.existsSync(guest), false);
});

test("collection failure fails successful assertions and cleans the guest report directory", (t) => {
	const { directory, guest, vm } = assertionFixture(t);
	const assertions = new GuestAssertions(
		{ script: "assert.sh" },
		directory,
		"1",
		"missing.xml",
	);
	assert.throws(() => assertions.run(vm));
	assert.deepEqual(assertions.reportFiles, []);
	assert.match(fs.readFileSync(assertions.report, "utf8"), /failures="1"/);
	assert.equal(fs.existsSync(guest), false);
});

test("report collection has a single deadline across all transfers", (t) => {
	const { reports, vm, directory, command } = reportFixture(t);
	const times = [1000, 121001];
	t.mock.method(Date, "now", () => times.shift());
	assert.throws(() => reports.collect(vm, directory), /timed out/);
	assert.equal(command.mock.callCount(), 1);
});

test("completed guest reports survive a command-status report write failure", (t) => {
	const { directory, vm } = assertionFixture(t);
	const write = fs.writeFileSync;
	t.mock.method(fs, "writeFileSync", (filename) => {
		write(filename, "partial");
		throw new Error("synthetic report write failure");
	});
	const assertions = new GuestAssertions(
		{ script: "assert.sh" },
		directory,
		"1",
		"*.xml",
	);
	assert.throws(() => assertions.run(vm));
	assert.equal(assertions.report, undefined);
	assert.equal(assertions.reportFiles.length, 1);
	assert.ok(fs.existsSync(assertions.reportFiles[0]));
	assert.equal(
		fs.existsSync(
			path.join(
				path.dirname(path.dirname(assertions.reportFiles[0])),
				"e2e.junit.xml",
			),
		),
		false,
	);
});
