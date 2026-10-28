const { VirtualMachine } = require("../runtime.cjs");
const { GuestAssertions } = require("../assertions.cjs");

module.exports = ({ core }) => {
	try {
		const assertions = new GuestAssertions(
			process.env.TEST_SCRIPT,
			process.env.REPORT_DIRECTORY,
			process.env.TEST_TIMEOUT_MINUTES,
		);
		try {
			assertions.run(new VirtualMachine(process.env.VM_DIRECTORY));
		} finally {
			if (require("node:fs").existsSync(assertions.report))
				core.setOutput("report", assertions.report);
		}
	} catch {
		core.setFailed(
			"VM assertions failed. Inspect the sanitized JUnit report when available.",
		);
	}
};
