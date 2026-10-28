const { parseArgs } = require("node:util");
const { VirtualMachine } = require("./runtime.cjs");
const { GuestAssertions } = require("./assertions.cjs");
const { Workspace } = require("./workspace.cjs");

function localRun(template, assertions) {
	const vm = VirtualMachine.allocate();
	console.info(`VM recovery directory: ${vm.home}`);
	try {
		vm.create(template);
		assertions.run(vm);
	} finally {
		if (assertions.report) console.info(`JUnit report: ${assertions.report}`);
		for (const file of assertions.reportFiles || [])
			console.info(`Guest report: ${file}`);
		vm.destroy();
	}
}

function main() {
	try {
		const { values, positionals } = parseArgs({
			allowPositionals: true,
			options: {
				vm: { type: "string", default: "" },
				"vm-config": { type: "string", default: "" },
				"test-script": { type: "string", default: "" },
				"report-directory": { type: "string", default: ".reports" },
				"report-file": { type: "string", default: "" },
				"test-timeout-minutes": { type: "string", default: "10" },
			},
		});
		if (positionals.length !== 1) throw new Error("Expected run or destroy");
		if (positionals[0] === "destroy") {
			new VirtualMachine(values.vm).destroy();
		} else if (positionals[0] === "run") {
			const assertions = new GuestAssertions(
				values["test-script"],
				new Workspace().resolve(values["report-directory"]),
				values["test-timeout-minutes"],
				values["report-file"],
			);
			localRun(VirtualMachine.template(values["vm-config"]), assertions);
		} else {
			throw new Error("Unknown command");
		}
	} catch {
		console.error(
			"VM command failed. Check inputs and retry cleanup using the printed runtime directory.",
		);
		process.exitCode = 1;
	}
}

if (require.main === module) main();
module.exports = { localRun };
