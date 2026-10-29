const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

class VirtualMachine {
	name = "iac-test";

	constructor(home) {
		this.home = home;
		this.validateRuntime();
	}

	static allocate() {
		return new VirtualMachine(fs.mkdtempSync(`/tmp/iac-${process.getuid()}-`));
	}

	validateRuntime() {
		if (
			path.dirname(this.home) !== "/tmp" ||
			!path.basename(this.home).startsWith(`iac-${process.getuid()}-`)
		) {
			throw new Error("Expected an invocation's private Lima home");
		}
		const info = fs.lstatSync(this.home, { throwIfNoEntry: false });
		if (!info) return; // Repeated destruction is safe after verified removal.
		if (
			!info.isDirectory() ||
			info.uid !== process.getuid() ||
			info.mode & 0o077
		) {
			throw new Error(
				"VM runtime must be a private directory owned by this user",
			);
		}
	}

	command(args, { timeout = 120000, input } = {}) {
		this.validateRuntime();
		if (!fs.existsSync(this.home)) throw new Error("VM runtime is absent");
		const result = childProcess.spawnSync("limactl", args, {
			env: { ...process.env, LIMA_HOME: this.home },
			input,
			encoding: "utf8",
			stdio: "pipe",
			timeout,
			killSignal: "SIGKILL",
			maxBuffer: 1024 * 1024,
		});
		// Never expose raw CLI output or exception details in public action logs.
		if (result.error || result.status !== 0)
			throw new Error("VM command failed or timed out");
		return result.stdout.trim();
	}

	exists() {
		this.validateRuntime();
		if (!fs.existsSync(path.join(this.home, this.name))) return false;
		return this.command(["list", "--format", "{{.Name}}"])
			.split("\n")
			.includes(this.name);
	}

	destroy() {
		if (this.exists()) {
			this.command(["delete", "--force", this.name]);
			if (this.exists())
				throw new Error("Disposable VM still exists after deletion");
		}
		fs.rmSync(this.home, { recursive: true, force: true });
	}
}

module.exports = { VirtualMachine };
