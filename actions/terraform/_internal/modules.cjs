const path = require("node:path");

async function discoverModules(exec, cwd) {
	const { stdout } = await exec.getExecOutput(
		"git",
		["ls-files", "-z", "--", "*.tf", "*.tf.json"],
		{ cwd, silent: true },
	);
	const modules = [
		...new Set(
			stdout
				.split("\0")
				.filter(Boolean)
				.map((file) => path.dirname(file)),
		),
	].sort();
	if (!modules.length) throw new Error("No tracked Terraform modules found");
	return modules;
}

module.exports = { discoverModules };
