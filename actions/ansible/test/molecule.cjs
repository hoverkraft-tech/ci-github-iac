const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { VirtualMachine, run } = require("../../vm/_internal/runtime.cjs");

class MoleculeScenario {
	constructor(env) {
		this.env = env;
	}

	prepare(directory, scenario) {
		if (this.env.ANSIBLE_INVENTORY_FILE || this.env.ANSIBLE_GALAXY_REQUIREMENTS)
			throw new Error(
				"Molecule uses the VM inventory and its native Galaxy dependency configuration",
			);
		const vm = VirtualMachine.open(this.env.ANSIBLE_VM);
		if (!vm.exists() || !fs.statSync(vm.sshConfig).isFile())
			throw new Error(
				"Expected a running disposable VM with SSH configuration",
			);
		const group = this.env.MOLECULE_INVENTORY_GROUP || "vm";
		if (
			!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(group) ||
			["all", "ungrouped"].includes(group)
		)
			throw new Error("Invalid VM inventory group");
		if (!/^[a-zA-Z0-9_-]+$/.test(path.basename(scenario)))
			throw new Error("Invalid Molecule scenario name");
		const minutes = this.env.ANSIBLE_TEST_TIMEOUT_MINUTES || "20";
		if (!/^[1-9][0-9]?$/.test(minutes) || Number(minutes) > 40)
			throw new Error("Test timeout must be 1 to 40 minutes");
		const config = run("ssh", ["-G", "-F", vm.sshConfig, vm.name]);
		const user = config.match(/^user ([a-zA-Z0-9_.-]+)$/m)?.[1];
		if (!user)
			throw new Error("The VM SSH configuration must resolve a login user");
		fs.writeFileSync(
			path.join(directory, "inventory.json"),
			JSON.stringify({
				[group]: {
					hosts: {
						[vm.name]: {
							ansible_connection: "ssh",
							ansible_user: user,
							ansible_ssh_common_args: `-F ${vm.sshConfig}`,
						},
					},
				},
			}),
			{ mode: 0o600, flag: "wx" },
		);
	}

	run() {
		const directory = this.env.ANSIBLE_REPORT_DIRECTORY;
		const scenario = this.env.MOLECULE_SCENARIO;
		const env = {
			...this.env,
			MOLECULE_GLOB: path.join(scenario, "molecule.yml"),
			MOLECULE_ACTION_DIRECTORY: __dirname,
			VM_ANSIBLE_INVENTORY: path.join(directory, "inventory.json"),
			MOLECULE_EPHEMERAL_DIRECTORY: path.join(directory, "state"),
			ANSIBLE_CALLBACKS_ENABLED: "ansible.builtin.junit",
			JUNIT_OUTPUT_DIR: directory,
			JUNIT_HIDE_TASK_ARGUMENTS: "true",
			JUNIT_TASK_RELATIVE_PATH: this.env.GITHUB_WORKSPACE,
		};
		// GNU timeout bounds the complete process group, including Ansible children.
		const result = childProcess.spawnSync(
			"timeout",
			[
				"--kill-after=5s",
				`${this.env.ANSIBLE_TEST_TIMEOUT_MINUTES || "20"}m`,
				path.join(directory, "venv/bin/molecule"),
				"--base-config",
				path.join(__dirname, "molecule.yml"),
				"test",
				"--destroy",
				"never",
				"--scenario-name",
				path.basename(scenario),
			],
			{
				cwd: this.env.GITHUB_WORKSPACE,
				env,
				stdio: "inherit",
			},
		);
		const native = fs
			.readdirSync(directory)
			.filter((file) => file.endsWith(".xml") && file !== "scenario.xml");
		const hasAssertions = native.some((file) =>
			/<testcase[\s>]/.test(
				fs.readFileSync(path.join(directory, file), "utf8"),
			),
		);
		const failed = Boolean(
			result.error || result.status !== 0 || !hasAssertions,
		);
		fs.writeFileSync(
			path.join(directory, "scenario.xml"),
			`<testsuite name="molecule" tests="1" failures="${failed ? 1 : 0}"><testcase name="deployment-idempotence-reboot">${failed ? '<failure message="Molecule failed, timed out or produced no task assertions"/>' : ""}</testcase></testsuite>\n`,
			{ flag: "wx" },
		);
		if (failed)
			throw new Error(
				"Molecule scenario failed or timed out, or produced no native assertions; inspect its task reports",
			);
	}
}

module.exports = { MoleculeScenario };
