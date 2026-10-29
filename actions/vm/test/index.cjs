const { VirtualMachine } = require("../_internal/runtime.cjs");
const { GuestAssertions } = require("./assertions.cjs");

module.exports = ({ core }) => {
	try {
		if (!["", "github", "codecov"].includes(process.env.COVERAGE ?? "github"))
			throw new Error("Invalid coverage mode");
		if (process.env.COVERAGE === "codecov" && !process.env.REPORT_FILE?.trim())
			throw new Error("Codecov requires explicitly selected reports");
		const assertions = new GuestAssertions(
			{ command: process.env.TEST_COMMAND, script: process.env.TEST_SCRIPT },
			process.env.RUNNER_TEMP,
			process.env.TEST_TIMEOUT_MINUTES,
			process.env.REPORT_FILE,
		);
		try {
			assertions.run(new VirtualMachine(process.env.VM_DIRECTORY));
		} finally {
			if (assertions.report || assertions.reportFiles?.length)
				core.setOutput("id", assertions.id);
			if (assertions.report) core.setOutput("report", assertions.report);
			if (assertions.reportFiles?.length) {
				core.setOutput("report-files", assertions.reportFiles.join("\n"));
				core.setOutput("codecov-files", assertions.reportFiles.join(","));
			}
		}
	} catch {
		core.setFailed(
			"VM assertions or report collection failed. Inspect the available reports.",
		);
	}
};
