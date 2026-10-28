const { VirtualMachine } = require("../_internal/runtime.cjs");
const { GuestCreation } = require("./creation.cjs");

module.exports = ({ core }) => {
	try {
		const creation = new GuestCreation(process.env.VM_CONFIG);
		const vm = VirtualMachine.allocate();
		core.info(`VM recovery directory: ${vm.home}`);
		core.setOutput("vm", vm.home);
		core.setOutput("id", require("node:path").basename(vm.home));
		creation.start(vm);
	} catch {
		core.setFailed(
			"VM creation failed. Check the required vm-config checkout file and retry cleanup using the runtime directory if allocated.",
		);
	}
};
