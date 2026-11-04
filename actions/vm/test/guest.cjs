const fs = require("node:fs");
const { VmReference } = require("../_internal/runtime.cjs");
const { run } = require("../_internal/command.cjs");

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

class Guest extends VmReference {
	async copyTo(source, destination, options) {
		this.validateRuntime();
		if (
			(this.backend === "qemu" && !(await this.exists())) ||
			!/^\/tmp\/iac-reports\.[a-zA-Z0-9]+\/[a-zA-Z0-9.-]+$/.test(destination)
		)
			throw new Error("Expected a running VM and a private guest test file");
		if (this.backend === "lima")
			return this.command(
				["copy", "--backend=scp", source, `${this.name}:${destination}`],
				options,
			);
		return run(
			this.exec,
			"scp",
			["-F", this.sshConfig, "--", source, `${this.name}:${destination}`],
			options,
		);
	}

	async command(args, options = {}) {
		this.validateRuntime();
		if (!fs.existsSync(this.home)) throw new Error("VM runtime is absent");
		if (this.backend === "qemu" && !(await this.exists()))
			throw new Error("QEMU is not running");
		if (
			args[0] === "shell" &&
			args[1] === "--workdir=/tmp" &&
			args[2] === this.name
		) {
			return run(
				this.exec,
				"ssh",
				[
					"-o",
					"ControlMaster=no",
					"-o",
					"ControlPath=none",
					"-o",
					"ControlPersist=no",
					"-F",
					this.sshConfig,
					this.name,
					`cd /tmp && ${args.slice(3).map(quote).join(" ")}`,
				],
				options,
			);
		}
		if (this.backend === "lima")
			return run(this.exec, "limactl", args, {
				...options,
				env: { ...process.env, LIMA_HOME: this.home },
			});
		if (
			args[0] === "copy" &&
			args[1] === "--backend=scp" &&
			args[2].startsWith(`${this.name}:/tmp/iac-reports.`)
		) {
			return run(
				this.exec,
				"scp",
				["-F", this.sshConfig, "--", args[2], args[3]],
				options,
			);
		}
		throw new Error("Unsupported QEMU guest operation");
	}
}

module.exports = { Guest };
