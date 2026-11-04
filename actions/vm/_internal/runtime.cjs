const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { run } = require("./command.cjs");

function validateDirectory(home, parent, prefix) {
	if (
		typeof home !== "string" ||
		path.dirname(home) !== parent ||
		!path.basename(home).startsWith(prefix)
	)
		throw new Error("Expected an invocation's private runtime");
	const info = fs.lstatSync(home, { throwIfNoEntry: false });
	if (!info) return;
	if (!info.isDirectory() || info.uid !== process.getuid() || info.mode & 0o077)
		throw new Error(
			"VM runtime must be a private directory owned by this user",
		);
}

class VmReference {
	name = "iac-test";

	constructor(home, { exec }) {
		this.exec = exec;
		this.home = home;
		this.backend =
			typeof home === "string" && path.dirname(home) === "/var/tmp"
				? "qemu"
				: "lima";
		this.validateRuntime();
		this.sshConfig = path.join(home, "ssh.config");
	}

	validateRuntime() {
		const qemu = this.backend === "qemu";
		validateDirectory(
			this.home,
			qemu ? "/var/tmp" : "/tmp",
			`iac-${qemu ? "qemu-" : ""}${process.getuid()}-`,
		);
	}

	qemuPid() {
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

	async exists() {
		this.validateRuntime();
		if (this.backend === "qemu") return this.qemuPid() !== undefined;
		if (!fs.existsSync(path.join(this.home, this.name))) return false;
		return (
			await run(this.exec, "limactl", ["list", "--format", "{{.Name}}"], {
				env: { ...process.env, LIMA_HOME: this.home },
			})
		)
			.split("\n")
			.includes(this.name);
	}
}

class VirtualMachine extends VmReference {
	constructor(home, { exec, io }) {
		super(home, { exec });
		this.io = io;
	}

	async destroy() {
		if (this.backend === "qemu") {
			for (const signal of ["SIGTERM", "SIGKILL"]) {
				const pid = this.qemuPid();
				if (!pid) break;
				try {
					process.kill(pid, signal);
				} catch (error) {
					if (error.code !== "ESRCH") throw error;
				}
				const deadline = Date.now() + 15000;
				while ((await this.exists()) && Date.now() < deadline) await delay(100);
			}
			if (await this.exists())
				throw new Error("QEMU still exists after deletion");
		} else if (await this.exists()) {
			this.validateRuntime();
			if (!fs.existsSync(this.home)) throw new Error("VM runtime is absent");
			await run(this.exec, "limactl", ["delete", "--force", this.name], {
				env: { ...process.env, LIMA_HOME: this.home },
			});
			if (await this.exists())
				throw new Error("Disposable VM still exists after deletion");
		}
		await this.io.rmRF(this.home);
	}
}

module.exports = { VmReference, VirtualMachine };
