const { VirtualMachine } = require("../runtime.cjs");

module.exports = ({ core }) => {
	try {
		const template = VirtualMachine.template(process.env.VM_CONFIG);
		const vm = VirtualMachine.allocate();
		core.info(`VM recovery directory: ${vm.home}`);
		core.setOutput("vm", vm.home);
		core.setOutput("id", require("node:path").basename(vm.home));
		vm.create(template);
	} catch {
		core.setFailed(
			"VM creation failed. Check the required vm-config checkout file and retry cleanup using the runtime directory if allocated.",
		);
	}
};
