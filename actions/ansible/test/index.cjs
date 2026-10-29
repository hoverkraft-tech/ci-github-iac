const { AnsibleChecks } = require("./checks.cjs");

module.exports = async ({ core, env = process.env, run }) => {
	try {
		const checks = new AnsibleChecks({ core, env, run });
		await checks.execute();
	} catch (error) {
		core.setFailed(error.message);
	}
};
