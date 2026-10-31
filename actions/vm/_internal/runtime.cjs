const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

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

function run(
	program,
	args,
	{ timeout = 120000, input, env = process.env } = {},
) {
	const result = childProcess.spawnSync(program, args, {
		env,
		input,
		encoding: "utf8",
		stdio: "pipe",
		timeout,
		killSignal: "SIGKILL",
		maxBuffer: 1024 * 1024,
	});
	if (result.error || result.status !== 0)
		throw new Error("VM command failed or timed out");
	return result.stdout.trim();
}

class VirtualMachine {
	name = "iac-test";

	constructor(home) {
		this.home = home;
		this.validateRuntime();
	}

	static allocate() {
		return new VirtualMachine(fs.mkdtempSync(`/tmp/iac-${process.getuid()}-`));
	}

	static open(home) {
		if (typeof home === "string" && path.dirname(home) === "/var/tmp") {
			const { QemuMachine } = require("./qemu.cjs");
			return new QemuMachine(home);
		}
		return new VirtualMachine(home);
	}

	validateRuntime() {
		validateDirectory(this.home, "/tmp", `iac-${process.getuid()}-`);
	}

	command(args, { timeout = 120000, input } = {}) {
		this.validateRuntime();
		if (!fs.existsSync(this.home)) throw new Error("VM runtime is absent");
		return run("limactl", args, {
			env: { ...process.env, LIMA_HOME: this.home },
			input,
			timeout,
		});
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

module.exports = { VirtualMachine, validateDirectory, run };
