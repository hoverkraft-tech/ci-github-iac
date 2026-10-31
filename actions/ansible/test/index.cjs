const { AnsibleInputs } = require("./inputs.cjs");
const { AnsibleReports } = require("./reports.cjs");

module.exports = ({ core, env = process.env }) => {
	try {
		if (env.ANSIBLE_PHASE === "prepare") new AnsibleInputs(core, env).prepare();
		else if (env.ANSIBLE_PHASE === "collect")
			new AnsibleReports(core, env).collect();
		else if (env.ANSIBLE_PHASE === "molecule") {
			const { MoleculeScenario } = require("./molecule.cjs");
			new MoleculeScenario(env).run();
		} else throw new Error("Unknown Ansible action phase.");
	} catch (error) {
		core.setFailed(error.message);
	}
};
