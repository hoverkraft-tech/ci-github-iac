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

	start(vm) {
		if (vm.exists()) throw new Error("This invocation already has a VM");
		try {
			vm.command(
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
		} catch (error) {
			vm.destroy();
			throw error;
		}
	}
}

module.exports = { GuestCreation };
