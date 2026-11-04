const fs = require("node:fs");
const path = require("node:path");
const { GuestReports } = require("./reports.cjs");
const { GossSuite } = require("./goss.cjs");

class GuestAssertions {
	constructor(source, directory, minutes = "10") {
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
		this.directory = directory;
		if (!source.goss?.trim()) throw new Error("goss-file is required");
		this.goss = new GossSuite(source.goss, source.variables);
		this.guestReports = new GuestReports();
	}

	async run(vm, { exec, io }) {
		this.report = undefined;
		this.reportFiles = [];
		await io.mkdirP(this.directory);
		const directory = fs.mkdtempSync(path.join(this.directory, "vm-test-"));
		this.id = path.basename(directory);
		const report = path.join(directory, "e2e.junit.xml");
		const started = performance.now();
		let failed = false;
		try {
			const environment = await this.guestReports.prepare(vm, this.timeout);
			const command = await this.goss.prepare(
				vm,
				directory,
				this.guestReports.home,
				Math.max(1, Math.ceil(this.timeout - (performance.now() - started))),
				{ exec, io },
			);
			await vm.command(
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
					timeout: Math.max(
						1,
						Math.ceil(this.timeout - (performance.now() - started)),
					),
					input: command,
				},
			);
		} catch {
			failed = true;
		}
		try {
			this.reportFiles = await this.guestReports.collect(vm, directory, {
				io,
			});
			try {
				this.goss.validateReports(this.reportFiles);
			} catch (error) {
				// Empty native suites cannot replace the failed execution summary.
				this.reportFiles = [];
				throw error;
			}
		} catch {
			failed = true;
		} finally {
			try {
				await this.guestReports.cleanup(vm, io);
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
					`<testcase name="goss-execution" time="${duration}">${failure}</testcase></testsuite>\n`,
				{ flag: "wx" },
			);
		} catch (error) {
			await io.rmRF(report);
			if (!this.reportFiles.length) await io.rmRF(directory);
			throw error;
		}
		this.report = report;
		if (failed) throw new Error("Goss assertions failed");
	}
}

module.exports = { GuestAssertions };
