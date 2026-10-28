const fs = require("node:fs");
const path = require("node:path");
const { Workspace } = require("./workspace.cjs");
const { GuestReports } = require("./reports.cjs");

class GuestAssertions {
	constructor(source, directory, minutes = "10", reportFiles = "") {
		if (!directory || !path.isAbsolute(directory)) {
			throw new Error("Expected an absolute report directory");
		}
		if (
			!/^[0-9]+$/.test(minutes) ||
			Number(minutes) < 1 ||
			Number(minutes) > 40
		) {
			throw new Error(
				"The assertion timeout must be an integer from 1 to 40 minutes",
			);
		}
		this.timeout = Number(minutes) * 60000;
		this.source = source;
		this.directory = directory;
		this.guestReports = new GuestReports(reportFiles);
	}

	readCommand() {
		const { command = "", script = "" } = this.source;
		if (Boolean(command.trim()) === Boolean(script.trim()))
			throw new Error("Provide exactly one of command or test-script");
		const content = command.trim()
			? command
			: fs.readFileSync(new Workspace().file(script), "utf8");
		if (!content.trim()) throw new Error("The test command must not be empty");
		return content;
	}

	run(vm) {
		this.report = undefined;
		this.reportFiles = [];
		fs.mkdirSync(this.directory, { recursive: true });
		const directory = fs.mkdtempSync(path.join(this.directory, "vm-test-"));
		this.id = path.basename(directory);
		const report = path.join(directory, "e2e.junit.xml");
		const started = performance.now();
		let failed = false;
		try {
			const command = this.readCommand();
			const environment = this.guestReports.prepare(vm);
			vm.command(
				[
					"shell",
					"--workdir=/tmp",
					vm.name,
					...environment,
					"bash",
					"-euo",
					"pipefail",
					"-s",
				],
				{
					timeout: this.timeout,
					input: command,
				},
			);
		} catch {
			failed = true;
		}
		try {
			this.reportFiles = this.guestReports.collect(vm, directory);
		} catch {
			failed = true;
		} finally {
			try {
				this.guestReports.cleanup(vm);
			} catch {
				failed = true;
			}
		}
		const duration = ((performance.now() - started) / 1000).toFixed(3);
		// All XML text is fixed; no paths, guest output or error details are serialized.
		const failure = failed
			? '<failure message="Guest assertions or report collection failed; inspect test outputs"/>'
			: "";
		try {
			fs.writeFileSync(
				report,
				'<?xml version="1.0" encoding="UTF-8"?>\n' +
					`<testsuite name="disposable-vm" tests="1" failures="${failed ? 1 : 0}">` +
					`<testcase name="consumer-command" time="${duration}">${failure}</testcase></testsuite>\n`,
				{ flag: "wx" },
			);
		} catch (error) {
			fs.rmSync(report, { force: true });
			if (!this.reportFiles.length)
				fs.rmSync(directory, { recursive: true, force: true });
			throw error;
		}
		this.report = report;
		if (failed) throw new Error("Consumer assertions failed");
	}
}

module.exports = { GuestAssertions };
