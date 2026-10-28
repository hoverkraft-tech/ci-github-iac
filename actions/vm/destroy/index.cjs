const { VirtualMachine } = require("../runtime.cjs");

module.exports = ({ core }) => {
	try {
		new VirtualMachine(process.env.VM_DIRECTORY).destroy();
		core.setOutput("removed", "true");
	} catch {
		core.setFailed(
			"VM destruction failed. The runtime directory is retained for recovery.",
		);
	}
};
