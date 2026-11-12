const path = require("node:path");
const fs = require("node:fs");

class MoleculeInputs {
	constructor(env) {
		this.env = env;
		this.checkout = fs.realpathSync(env.GITHUB_WORKSPACE);
	}

	file(input) {
		if (typeof input !== "string" || !input.trim())
			throw new Error("Expected a nonempty checkout path");
		const file = fs.realpathSync(path.resolve(this.checkout, input));
		const relative = path.relative(this.checkout, file);
		if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
			throw new Error("Molecule inputs must remain inside the checkout");
		const info = fs.statSync(file);
		if (!info.isFile() || info.size === 0 || !/^[\w./-]+$/.test(file))
			throw new Error("Expected a nonempty file with a shell-safe path");
		return file;
	}

	prepare(core) {
		const scenario = this.env.MOLECULE_SCENARIO?.trim();
		if (!scenario) throw new Error("molecule-scenario is required");
		const selected = path.dirname(
			this.file(path.join(scenario, "molecule.yml")),
		);
		if (!/^[a-zA-Z0-9_-]+$/.test(path.basename(selected)))
			throw new Error("Invalid Molecule scenario name");
		const minutes = this.env.ANSIBLE_TEST_TIMEOUT_MINUTES || "20";
		if (!/^[1-9][0-9]?$/.test(minutes) || Number(minutes) > 40)
			throw new Error("Test timeout must be 1 to 40 minutes");
		const requirements = fs.readFileSync(
			this.file(this.env.ANSIBLE_REQUIREMENTS),
			"utf8",
		);
		const pins = [
			...requirements.matchAll(
				/^ansible-core==([0-9]+\.[0-9]+\.[0-9]+)\s*(?:#.*)?$/gm,
			),
		];
		if (pins.length !== 1)
			throw new Error(
				"Pin exactly one stable ansible-core==X.Y.Z in ansible-requirements",
			);
		const config = this.env.ANSIBLE_CONFIG_FILE
			? this.file(this.env.ANSIBLE_CONFIG_FILE)
			: "";
		const pythonVersionFile = this.env.ANSIBLE_PYTHON_VERSION_FILE
			? this.file(this.env.ANSIBLE_PYTHON_VERSION_FILE)
			: "";
		const reports = fs.mkdtempSync(
			path.join(this.env.RUNNER_TEMP, "molecule-reports-"),
		);
		const constraint = path.join(reports, "constraints.txt");
		fs.writeFileSync(constraint, `ansible-core==${pins[0][1]}\n`, {
			flag: "wx",
		});
		for (const [name, value] of Object.entries({
			scenario: selected,
			config,
			"python-version-file": pythonVersionFile,
			constraint,
			"report-directory": reports,
			id: path.basename(reports),
		}))
			core.setOutput(name, value);
	}
}

module.exports = { MoleculeInputs };
