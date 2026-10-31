const { VirtualMachine } = require("../_internal/runtime.cjs");

module.exports = ({ core }) => {
	try {
		VirtualMachine.open(process.env.VM_DIRECTORY).destroy();
		core.setOutput("removed", "true");
	} catch {
		core.setFailed(
			"VM destruction failed. The runtime directory is retained for recovery.",
		);
	}
};
