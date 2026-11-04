const fs = require("node:fs");
const { run } = require("../_internal/command.cjs");
const { Workspace } = require("../_internal/workspace.cjs");

class GuestCreation {
	constructor(config, startupTimeout = 10) {
		if (typeof config !== "string" || !config.trim())
			throw new Error("vm-config is required");
		this.template = new Workspace().file(config);
		const minutes = String(startupTimeout).trim();
		if (!/^[1-9]\d?$/.test(minutes) || Number(minutes) > 40)
			throw new Error(
				"Startup timeout must be an integer from 1 to 40 minutes",
			);
		this.startupTimeout = Number(minutes);
	}

	async start(vm) {
		if (await vm.exists()) throw new Error("This invocation already has a VM");
		const command = (args, options) => {
			vm.validateRuntime();
			if (!fs.existsSync(vm.home)) throw new Error("VM runtime is absent");
			return run(vm.exec, "limactl", args, {
				...options,
				env: { ...process.env, LIMA_HOME: vm.home },
			});
		};
		try {
			await command(
				[
					"start",
					"--tty=false",
					"--plain",
					`--timeout=${this.startupTimeout}m`,
					`--name=${vm.name}`,
					this.template,
				],
				{ timeout: (this.startupTimeout + 1) * 60000 },
			);
			const config = await command(["show-ssh", "--format=config", vm.name]);
			fs.writeFileSync(
				vm.sshConfig,
				config.replace(/^Host\s+.*$/m, `Host ${vm.name}`),
				{ mode: 0o600, flag: "wx" },
			);
		} catch (error) {
			await vm.destroy();
			throw error;
		}
	}
}

module.exports = { GuestCreation };
