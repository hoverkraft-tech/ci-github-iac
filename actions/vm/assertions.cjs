const fs = require("node:fs");
const path = require("node:path");
const { Workspace } = require("./workspace.cjs");

class GuestAssertions {
	constructor(script, directory, minutes = "10") {
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
		this.script = script;
		this.directory = directory;
	}

	run(vm) {
		this.report = undefined;
		fs.mkdirSync(this.directory, { recursive: true });
		const directory = fs.mkdtempSync(path.join(this.directory, "vm-test-"));
		const report = path.join(directory, "e2e.junit.xml");
		const started = performance.now();
		let failed = false;
		try {
			const script = fs.readFileSync(new Workspace().file(this.script), "utf8");
			if (!script.trim()) throw new Error("The script must not be empty");
			vm.command(
				["shell", "--workdir=/tmp", vm.name, "bash", "-euo", "pipefail", "-s"],
				{
					timeout: this.timeout,
					input: script,
				},
			);
		} catch {
			failed = true;
		}
		const duration = ((performance.now() - started) / 1000).toFixed(3);
		// All XML text is fixed; no paths, guest output or error details are serialized.
		const failure = failed
			? '<failure message="Consumer script failed or timed out; inspect locally"/>'
			: "";
		try {
			fs.writeFileSync(
				report,
				'<?xml version="1.0" encoding="UTF-8"?>\n' +
					`<testsuite name="disposable-vm" tests="1" failures="${failed ? 1 : 0}">` +
					`<testcase name="consumer-script" classname="vm" time="${duration}">${failure}</testcase></testsuite>\n`,
				{ flag: "wx" },
			);
		} catch (error) {
			fs.rmSync(directory, { recursive: true, force: true });
			throw error;
		}
		this.report = report;
		if (failed) throw new Error("Consumer assertions failed");
	}
}

module.exports = { GuestAssertions };
