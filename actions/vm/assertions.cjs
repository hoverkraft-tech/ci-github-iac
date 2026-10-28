const fs = require("node:fs");
const path = require("node:path");
const { Workspace } = require("./workspace.cjs");

class GuestAssertions {
	constructor(script, directory = ".reports", minutes = "10") {
		if (!/^[a-zA-Z0-9_./-]+$/.test(directory) || path.isAbsolute(directory)) {
			throw new Error("Expected a relative report directory");
		}
		const reports = new Workspace().resolve(directory);
		fs.mkdirSync(reports, { recursive: true });
		this.report = path.join(reports, "e2e.junit.xml");
		fs.rmSync(this.report, { force: true });
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
	}

	run(vm) {
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
		fs.writeFileSync(
			this.report,
			'<?xml version="1.0" encoding="UTF-8"?>\n' +
				`<testsuite name="disposable-vm" tests="1" failures="${failed ? 1 : 0}">` +
				`<testcase name="consumer-script" classname="vm" time="${duration}">${failure}</testcase></testsuite>\n`,
		);
		if (failed) throw new Error("Consumer assertions failed");
	}
}

module.exports = { GuestAssertions };
