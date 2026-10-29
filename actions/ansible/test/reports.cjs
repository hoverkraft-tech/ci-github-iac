const fs = require("node:fs");
const path = require("node:path");

class AnsibleReports {
	constructor(core, env) {
		this.core = core;
		this.env = env;
	}

	collect() {
		const destination = fs.realpathSync(this.env.ANSIBLE_REPORT_DIRECTORY);
		if (
			path.dirname(destination) !== fs.realpathSync(this.env.RUNNER_TEMP) ||
			!path.basename(destination).startsWith("ansible-reports-")
		) {
			throw new Error("Invalid action report directory.");
		}
		const files = [];
		if (this.env.ANSIBLE_COLLECTION_ROOT) {
			const source = path.resolve(
				this.env.GITHUB_WORKSPACE,
				this.env.ANSIBLE_COLLECTION_ROOT,
				"tests/output/junit",
			);
			const relative = path.relative(
				fs.realpathSync(this.env.GITHUB_WORKSPACE),
				source,
			);
			if (relative.startsWith("..") || path.isAbsolute(relative))
				throw new Error("Collection reports must remain inside the checkout.");
			if (fs.existsSync(source)) {
				if (fs.realpathSync(source) !== source)
					throw new Error("JUnit report directories cannot be symbolic links.");
				for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
					if (!entry.isFile() || !entry.name.endsWith(".xml")) continue;
					const target = path.join(destination, entry.name);
					fs.copyFileSync(
						path.join(source, entry.name),
						target,
						fs.constants.COPYFILE_EXCL,
					);
					files.push(target);
				}
			}
		} else {
			const sarif = path.join(destination, "syntax.sarif");
			if (fs.existsSync(sarif) && fs.lstatSync(sarif).isFile())
				files.push(sarif);
		}
		if (!files.length)
			throw new Error(
				"The upstream Ansible action produced no reports. See its execution log.",
			);
		this.core.setOutput("report-files", files.join("\n"));
	}
}

module.exports = { AnsibleReports };
