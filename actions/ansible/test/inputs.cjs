const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

class AnsibleInputs {
	constructor(core, env) {
		this.core = core;
		this.env = env;
		this.workspace = fs.realpathSync(env.GITHUB_WORKSPACE);
	}

	checkoutPath(value, directory = false) {
		const resolved = fs.realpathSync(path.resolve(this.workspace, value));
		const relative = path.relative(this.workspace, resolved);
		if (
			relative.startsWith("..") ||
			path.isAbsolute(relative) ||
			!/^[\w./-]+$/.test(resolved)
		) {
			throw new Error(
				"Inputs must stay inside the checkout and use paths without spaces or shell metacharacters.",
			);
		}
		const stat = fs.statSync(resolved);
		if (directory ? !stat.isDirectory() : !stat.isFile() || stat.size === 0) {
			throw new Error(
				`${value} must be a ${directory ? "directory" : "nonempty file"}.`,
			);
		}
		return resolved;
	}

	prepare() {
		const playbook = this.env.ANSIBLE_TEST_PLAYBOOK?.trim();
		const collection = this.env.ANSIBLE_COLLECTION?.trim();
		const targetPython = this.env.ANSIBLE_TARGET_PYTHON_VERSION?.trim() || "";
		if (targetPython && (!collection || !/^3\.[0-9]+$/.test(targetPython))) {
			throw new Error(
				"target-python-version requires a collection and a Python 3 major.minor version.",
			);
		}
		this.core.setOutput("target-python-version", targetPython);
		if (Boolean(playbook) === Boolean(collection)) {
			throw new Error(
				"Provide test-playbook or one collection, exclusively. Use a matrix for multiple collections.",
			);
		}
		const requirements = this.checkoutPath(this.env.ANSIBLE_REQUIREMENTS);
		const pins = [
			...fs
				.readFileSync(requirements, "utf8")
				.matchAll(/^ansible-core==([0-9]+\.[0-9]+\.[0-9]+)\s*(?:#.*)?$/gm),
		];
		if (pins.length !== 1)
			throw new Error(
				"ansible-requirements must contain one exact stable ansible-core==X.Y.Z pin.",
			);
		this.core.setOutput(
			"test-playbook",
			playbook ? this.checkoutPath(playbook) : "",
		);
		const collectionRoot = collection
			? this.checkoutPath(collection, true)
			: "";
		if (collectionRoot)
			this.checkoutPath(path.join(collectionRoot, "galaxy.yml"));
		const optionalFiles = {
			inventory: this.env.ANSIBLE_INVENTORY_FILE,
			config: this.env.ANSIBLE_CONFIG_FILE,
			galaxy: this.env.ANSIBLE_GALAXY_REQUIREMENTS,
		};
		for (const [name, value] of Object.entries(optionalFiles)) {
			this.core.setOutput(name, value ? this.checkoutPath(value) : "");
		}
		const collectionsPath = this.env.ANSIBLE_COLLECTIONS_DIRECTORY
			? this.checkoutPath(this.env.ANSIBLE_COLLECTIONS_DIRECTORY, true)
			: "";
		this.core.setOutput(
			"collections-path",
			[
				collectionsPath,
				path.join(os.homedir(), ".ansible/collections"),
				"/usr/share/ansible/collections",
			]
				.filter(Boolean)
				.join(":"),
		);
		const reports = fs.mkdtempSync(
			path.join(this.env.RUNNER_TEMP, "ansible-reports-"),
		);
		if (playbook) this.core.addPath(path.join(reports, "venv/bin"));
		const constraint = path.join(reports, "constraints.txt");
		fs.writeFileSync(constraint, `ansible-core==${pins[0][1]}\n`);
		this.core.setOutput("constraint", constraint);
		this.core.setOutput("ansible-core-ref", `v${pins[0][1]}`);
		this.core.setOutput("mode", collection ? "sanity" : "playbook");
		this.core.setOutput("collection", collectionRoot);
		this.core.setOutput(
			"collection-root",
			collectionRoot ? path.relative(this.workspace, collectionRoot) : "",
		);
		this.core.setOutput("report-directory", reports);
		this.core.setOutput("id", path.basename(reports));
	}
}

module.exports = { AnsibleInputs };
