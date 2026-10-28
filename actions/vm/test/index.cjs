const { VirtualMachine } = require("../runtime.cjs");
const { GuestAssertions } = require("../assertions.cjs");

module.exports = ({ core }) => {
	try {
		const assertions = new GuestAssertions(
			process.env.TEST_SCRIPT,
			process.env.RUNNER_TEMP,
			process.env.TEST_TIMEOUT_MINUTES,
			process.env.REPORT_FILE,
		);
		try {
			assertions.run(new VirtualMachine(process.env.VM_DIRECTORY));
		} finally {
			if (assertions.report) core.setOutput("report", assertions.report);
			if (assertions.reportFiles?.length)
				core.setOutput("report-files", assertions.reportFiles.join("\n"));
		}
	} catch {
		core.setFailed(
			"VM assertions or report collection failed. Inspect the available reports.",
		);
	}
};
