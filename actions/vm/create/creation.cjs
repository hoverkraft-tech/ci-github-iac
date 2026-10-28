const { Workspace } = require("../_internal/workspace.cjs");

class GuestCreation {
	constructor(config) {
		if (typeof config !== "string" || !config.trim())
			throw new Error("vm-config is required");
		this.template = new Workspace().file(config);
	}

	start(vm) {
		if (vm.exists()) throw new Error("This invocation already has a VM");
		try {
			vm.command(
				[
					"start",
					"--tty=false",
					"--plain",
					"--timeout=10m",
					`--name=${vm.name}`,
					this.template,
				],
				{ timeout: 660000 },
			);
		} catch (error) {
			vm.destroy();
			throw error;
		}
	}
}

module.exports = { GuestCreation };
