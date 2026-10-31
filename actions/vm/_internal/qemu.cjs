const fs = require("node:fs");
const path = require("node:path");
const { validateDirectory, run } = require("./runtime.cjs");

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

class QemuMachine {
	name = "iac-test";

	constructor(home) {
		this.home = home;
		this.validateRuntime();
		this.sshConfig = path.join(home, "ssh.config");
	}

	static allocate() {
		return new QemuMachine(
			fs.mkdtempSync(`/var/tmp/iac-qemu-${process.getuid()}-`),
		);
	}

	validateRuntime() {
		validateDirectory(this.home, "/var/tmp", `iac-qemu-${process.getuid()}-`);
	}

	pid() {
		this.validateRuntime();
		const file = path.join(this.home, "pid");
		if (!fs.existsSync(file)) return undefined;
		const value = fs.readFileSync(file, "utf8").trim();
		if (!/^[1-9][0-9]*$/.test(value))
			throw new Error("Invalid QEMU process identity");
		const pid = Number(value);
		let command;
		try {
			command = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
		} catch (error) {
			if (error.code === "ENOENT") return undefined;
			throw error;
		}
		if (command[0] === "") return undefined; // Exited child awaiting reaping.
		if (
			path.basename(command[0]) !== "qemu-system-x86_64" ||
			command[command.indexOf("-pidfile") + 1] !== file ||
			fs.statSync(`/proc/${pid}`).uid !== process.getuid()
		)
			throw new Error("QEMU process ownership cannot be verified");
		return pid;
	}

	exists() {
		return this.pid() !== undefined;
	}

	copyTo(source, destination, options) {
		this.validateRuntime();
		if (
			!this.exists() ||
			!/^\/tmp\/iac-reports\.[a-zA-Z0-9]+\/[a-zA-Z0-9.-]+$/.test(destination)
		)
			throw new Error("Expected a running VM and a private guest test file");
		return run(
			"scp",
			["-F", this.sshConfig, "--", source, `${this.name}:${destination}`],
			options,
		);
	}

	command(args, options) {
		this.validateRuntime();
		if (!this.exists()) throw new Error("QEMU is not running");
		if (
			args[0] === "shell" &&
			args[1] === "--workdir=/tmp" &&
			args[2] === this.name
		) {
			return run(
				"ssh",
				[
					"-F",
					this.sshConfig,
					this.name,
					`cd /tmp && ${args.slice(3).map(quote).join(" ")}`,
				],
				options,
			);
		}
		if (
			args[0] === "copy" &&
			args[1] === "--backend=scp" &&
			args[2].startsWith(`${this.name}:/tmp/iac-reports.`)
		) {
			return run(
				"scp",
				["-F", this.sshConfig, "--", args[2], args[3]],
				options,
			);
		}
		throw new Error("Unsupported QEMU guest operation");
	}

	destroy() {
		for (const signal of ["SIGTERM", "SIGKILL"]) {
			const pid = this.pid();
			if (!pid) break;
			try {
				process.kill(pid, signal);
			} catch (error) {
				if (error.code !== "ESRCH") throw error;
			}
			const deadline = Date.now() + 15000;
			while (this.exists() && Date.now() < deadline)
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
		}
		if (this.exists()) throw new Error("QEMU still exists after deletion");
		fs.rmSync(this.home, { recursive: true, force: true });
	}
}

module.exports = { QemuMachine };
