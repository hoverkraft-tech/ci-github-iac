const { VirtualMachine } = require("../_internal/runtime.cjs");
const { GuestCreation } = require("./creation.cjs");

module.exports = ({ core }) => {
	const failed = () =>
		core.setFailed(
			"VM creation failed. Check the required vm-config checkout file and startup timeout, then retry cleanup using the runtime directory if allocated.",
		);
	try {
		const backend = process.env.VM_BACKEND ?? "lima";
		if (!["lima", "qemu"].includes(backend))
			throw new Error("Invalid VM backend");
		const Creation =
			backend === "qemu" ? require("./qemu.cjs").QemuCreation : GuestCreation;
		const Machine =
			backend === "qemu"
				? require("../_internal/qemu.cjs").QemuMachine
				: VirtualMachine;
		const creation = new Creation(
			process.env.VM_CONFIG,
			process.env.VM_STARTUP_TIMEOUT_MINUTES,
		);
		const vm = Machine.allocate();
		core.info(`VM recovery directory: ${vm.home}`);
		core.setOutput("vm", vm.home);
		core.setOutput("id", require("node:path").basename(vm.home));
		core.setOutput("name", vm.name);
		if (vm.sshConfig) core.setOutput("ssh-config", vm.sshConfig);
		const startup = creation.start(vm, core);
		if (startup) return startup.catch(failed);
	} catch {
		failed();
	}
};
