const fs = require("node:fs");
const path = require("node:path");

class CheckReports {
	constructor(directory) {
		this.directory = directory;
		this.checks = [];
		this.issues = [];
	}

	get failed() {
		return this.checks.some((check) => check.code !== 0);
	}

	add(kind, target, { code, output }) {
		this.checks.push({ kind, target, code });
		if (kind !== "syntax" || code === 0) return;
		const origin = output.match(/^Origin: \/workspace\/(.+):(\d+):(\d+)\s*$/m);
		const filename = origin?.[1] || target;
		const relative = path.posix.normalize(filename);
		const safe =
			!relative.startsWith("../") && !path.posix.isAbsolute(relative);
		this.issues.push({
			ruleId: "ansible-syntax",
			level: "error",
			// Keep raw diagnostics in the execution log, not in public report artifacts.
			message: {
				text: `Syntax check failed for ${target}. See the execution log.`,
			},
			locations: [
				{
					physicalLocation: {
						artifactLocation: {
							uri: encodeURI(safe ? relative : target),
							uriBaseId: "%SRCROOT%",
						},
						region: {
							startLine: safe && origin ? Math.max(1, Number(origin[2])) : 1,
							startColumn: safe && origin ? Math.max(1, Number(origin[3])) : 1,
						},
					},
				},
			],
		});
	}

	escape(value) {
		// biome-ignore lint/suspicious/noControlCharactersInRegex: XML 1.0 forbids these control characters in filenames.
		const forbiddenControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
		return value
			.replace(forbiddenControls, "")
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
	}

	write() {
		const cases = this.checks.map(({ kind, target, code }) => {
			const failure =
				code === 0
					? ""
					: '<failure message="Ansible check failed. See the execution log." />';
			return `<testcase classname="ansible.${kind}" name="${this.escape(target)}">${failure}</testcase>`;
		});
		const junit = path.join(this.directory, "checks.junit.xml");
		fs.writeFileSync(
			junit,
			`<?xml version="1.0" encoding="UTF-8"?>\n<testsuites><testsuite name="Ansible" tests="${cases.length}" failures="${this.checks.filter((check) => check.code !== 0).length}">${cases.join("")}</testsuite></testsuites>\n`,
		);
		const sarif = path.join(this.directory, "syntax.sarif");
		fs.writeFileSync(
			sarif,
			`${JSON.stringify(
				{
					$schema: "https://json.schemastore.org/sarif-2.1.0.json",
					version: "2.1.0",
					runs: [
						{
							tool: {
								driver: {
									name: "ansible-playbook",
									rules: [
										{
											id: "ansible-syntax",
											shortDescription: {
												text: "Ansible playbook syntax validation",
											},
										},
									],
								},
							},
							results: this.issues,
						},
					],
				},
				null,
				2,
			)}\n`,
		);
		return [junit, sarif];
	}
}

module.exports = { CheckReports };
