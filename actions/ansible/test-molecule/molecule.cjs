const fs = require("node:fs");
const path = require("node:path");

class MoleculeScenario {
	constructor(env, { exec, glob }) {
		this.exec = exec;
		this.glob = glob;
		this.env = env;
		this.directory = env.ANSIBLE_REPORT_DIRECTORY;
	}

	async reportFiles() {
		const info = fs.lstatSync(this.directory);
		if (
			!info.isDirectory() ||
			info.uid !== process.getuid() ||
			info.mode & 0o077 ||
			path.dirname(fs.realpathSync(this.directory)) !==
				fs.realpathSync(this.env.RUNNER_TEMP) ||
			!path.basename(this.directory).startsWith("molecule-reports-")
		) {
			throw new Error("Expected this action's private report directory");
		}
		const search = await this.glob.create(
			`${this.directory.replace(/[[?*]/g, "[$&]")}/*.xml`,
			{
				followSymbolicLinks: false,
				matchDirectories: false,
				implicitDescendants: false,
			},
		);
		const files = [];
		for await (const file of search.globGenerator()) {
			if (fs.lstatSync(file).isFile()) files.push(file);
		}
		return files;
	}

	async collect() {
		const files = await this.reportFiles();
		if (!files.length || files.some((file) => fs.statSync(file).size === 0)) {
			throw new Error("Molecule must produce nonempty JUnit reports");
		}
		return files;
	}

	async execute(command, duration) {
		// GNU timeout bounds Molecule and the Ansible process group together.
		return this.exec.exec(
			"timeout",
			[
				"--kill-after=5s",
				duration,
				path.join(this.directory, "venv/bin/molecule"),
				command,
				"--scenario-name",
				path.basename(this.env.MOLECULE_SCENARIO),
			],
			{
				cwd: this.env.GITHUB_WORKSPACE,
				ignoreReturnCode: true,
				env: {
					...this.env,
					PATH: `${path.join(this.directory, "venv/bin")}:${this.env.PATH || ""}`,
					MOLECULE_GLOB: path.join(this.env.MOLECULE_SCENARIO, "molecule.yml"),
					MOLECULE_EPHEMERAL_DIRECTORY: path.join(this.directory, "state"),
					ANSIBLE_CALLBACKS_ENABLED: "ansible.builtin.junit",
					JUNIT_OUTPUT_DIR: this.directory,
					JUNIT_HIDE_TASK_ARGUMENTS: "true",
					JUNIT_TASK_RELATIVE_PATH: this.env.GITHUB_WORKSPACE,
				},
			},
		);
	}

	async run() {
		let result;
		try {
			result = await this.execute(
				"test",
				`${this.env.ANSIBLE_TEST_TIMEOUT_MINUTES || "20"}m`,
			);
		} catch {
			result = null;
		}
		const interrupted = result === null || [124, 137].includes(result);
		// Native test failure cleanup cannot finish after timeout kills its process.
		const cleanup = interrupted
			? await this.execute("destroy", "2m").catch(() => null)
			: 0;
		const cleanupFailed = cleanup !== 0;
		const native = (await this.reportFiles()).filter(
			(file) => path.basename(file) !== "scenario.xml",
		);
		const hasAssertions = native.some((file) =>
			/<testcase[\s>]/.test(fs.readFileSync(file, "utf8")),
		);
		const failed = Boolean(result !== 0 || cleanupFailed || !hasAssertions);
		const message = cleanupFailed
			? "Molecule was interrupted and scenario cleanup failed"
			: "Molecule failed, timed out or produced no native assertions";
		fs.writeFileSync(
			path.join(this.directory, "scenario.xml"),
			`<testsuite name="molecule" tests="1" failures="${failed ? 1 : 0}"><testcase name="scenario">${failed ? `<failure message="${message}"/>` : ""}</testcase></testsuite>\n`,
			{ flag: "wx" },
		);
		if (failed) throw new Error(`${message}; inspect the scenario reports`);
	}
}

module.exports = { MoleculeScenario };
