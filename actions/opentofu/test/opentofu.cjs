const fs = require("node:fs");
const path = require("node:path");

class OpenTofuReport {
	constructor(cases, passed = false) {
		this.cases = cases;
		this.passed = passed;
	}

	static parse(events, exitCode) {
		const cases = [];
		let summary;
		for (const line of events.split("\n").filter((line) => line.trim())) {
			const event = JSON.parse(line);
			if (event.type === "test_summary") summary = event.test_summary;
			if (event.type !== "test_run") continue;
			const run = event.test_run;
			if (!run || !["pass", "fail", "error", "skip"].includes(run.status))
				throw new Error("Invalid native test outcome");
			if (typeof run.path !== "string" || typeof run.run !== "string")
				throw new Error("Missing native test identity");
			if (cases.some((item) => item.file === run.path && item.name === run.run))
				throw new Error("Duplicate native test outcome");
			cases.push({ file: run.path, name: run.run, status: run.status });
		}
		const totals = {
			passed: "pass",
			failed: "fail",
			errored: "error",
			skipped: "skip",
		};
		if (
			!summary ||
			Object.entries(totals).some(
				([field, status]) =>
					summary[field] !==
					cases.filter((item) => item.status === status).length,
			)
		)
			throw new Error("Incomplete native test report");
		const passed =
			exitCode === 0 &&
			summary.status === "pass" &&
			summary.passed > 0 &&
			summary.failed === 0 &&
			summary.errored === 0;
		if (
			!passed &&
			!cases.some((item) => ["fail", "error"].includes(item.status))
		)
			cases.push({
				file: "OpenTofu",
				name: "execution-and-cleanup",
				status: "error",
			});
		return new OpenTofuReport(cases, passed);
	}

	get xml() {
		const cases = this.cases;
		const escapeXml = (value) =>
			value
				.split("")
				.filter(
					(character) =>
						character.charCodeAt(0) >= 32 ||
						["\t", "\n", "\r"].includes(character),
				)
				.join("")
				.replace(
					/[&<>"']/g,
					(character) =>
						({
							"&": "&amp;",
							"<": "&lt;",
							">": "&gt;",
							'"': "&quot;",
							"'": "&apos;",
						})[character],
				);
		const count = (status) =>
			cases.filter((item) => item.status === status).length;
		return (
			'<?xml version="1.0" encoding="UTF-8"?>\n' +
			`<testsuite name="OpenTofu" tests="${cases.length}" failures="${count("fail")}" errors="${count("error")}" skipped="${count("skip")}">` +
			cases
				.map((item) => {
					const outcome = {
						pass: "",
						fail: '<failure message="Native assertion failed"/>',
						error: '<error message="OpenTofu execution or cleanup failed"/>',
						skip: "<skipped/>",
					}[item.status];
					return `<testcase classname="${escapeXml(item.file)}" name="${escapeXml(item.name)}">${outcome}</testcase>`;
				})
				.join("") +
			"</testsuite>\n"
		);
	}
}

class OpenTofuTests {
	constructor(core, exec) {
		this.core = core;
		this.exec = exec;
	}

	async run(directory, reports) {
		let result;
		try {
			const options = { cwd: directory, silent: true, ignoreReturnCode: true };
			const initialized = await this.exec.exec(
				"tofu",
				["init", "-backend=false", "-input=false", "-no-color"],
				options,
			);
			if (initialized !== 0) throw new Error("OpenTofu initialization failed");
			const chunks = [];
			let bytes = 0;
			let overflow = false;
			const code = await this.exec.exec("tofu", ["test", "-json"], {
				...options,
				listeners: {
					stdout: (buffer) => {
						bytes += buffer.length;
						if (bytes > 1024 * 1024) overflow = true;
						else chunks.push(buffer);
					},
				},
			});
			if (overflow)
				throw new Error("Native test report exceeded its size limit");
			result = OpenTofuReport.parse(
				Buffer.concat(chunks).toString("utf8"),
				code,
			);
		} catch {
			result = new OpenTofuReport([
				{ file: "OpenTofu", name: "execution-and-reporting", status: "error" },
			]);
		}
		const report = path.join(reports, "opentofu.junit.xml");
		fs.writeFileSync(report, result.xml, { mode: 0o600, flag: "wx" });
		this.core.setOutput("report", report);
		if (!result.passed)
			this.core.setFailed(
				"OpenTofu tests, initialization, cleanup or report validation failed",
			);
	}
}

module.exports = { OpenTofuReport, OpenTofuTests };
