const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Workspace } = require("../_internal/workspace.cjs");
const { run } = require("../_internal/runtime.cjs");
const release = require("./goss.json");

class GossSuite {
	constructor(file, variables = "") {
		this.file = new Workspace().file(file);
		this.variables = variables ? new Workspace().file(variables) : "";
	}

	prepare(vm, directory, destination, timeout) {
		const deadline = Date.now() + timeout;
		const options = () => {
			const remaining = deadline - Date.now();
			if (remaining <= 0) throw new Error("Goss setup timed out");
			return { timeout: remaining };
		};
		const platform = vm.command(
			["shell", "--workdir=/tmp", vm.name, "uname", "-sm"],
			options(),
		);
		if (
			process.platform !== "linux" ||
			process.arch !== "x64" ||
			platform !== "Linux x86_64"
		)
			throw new Error(
				"Goss currently requires Linux x86-64 on runner and guest",
			);
		const tools = fs.mkdtempSync(path.join(directory, "goss-"));
		try {
			const archive = path.join(tools, "goss.tar.gz");
			run(
				"curl",
				[
					"--fail",
					"--silent",
					"--show-error",
					"--location",
					"--proto",
					"=https",
					"--proto-redir",
					"=https",
					"--max-time",
					"120",
					"--output",
					archive,
					`https://github.com/goss-org/goss/releases/download/v${release.version}/goss_${release.version}_linux_x86_64.tar.gz`,
				],
				options(),
			);
			const digest = crypto
				.createHash("sha256")
				.update(fs.readFileSync(archive))
				.digest("hex");
			if (digest !== release.sha256) throw new Error("Goss checksum mismatch");
			run("tar", ["-xzf", archive, "-C", tools, "goss"], options());
			const binary = path.join(tools, "goss");
			fs.chmodSync(binary, 0o700);
			const rendered = run(
				binary,
				[
					"-g",
					this.file,
					...(this.variables ? ["--vars", this.variables] : []),
					"render",
				],
				options(),
			);
			const suite = path.join(tools, "goss.yaml");
			fs.writeFileSync(suite, rendered, { mode: 0o600 });
			vm.copyTo(binary, `${destination}/goss`, options());
			vm.copyTo(suite, `${destination}/goss.yaml`, options());
		} finally {
			fs.rmSync(tools, { recursive: true, force: true });
		}
		return 'chmod 700 "$REPORTS_DIR/goss"\n"$REPORTS_DIR/goss" -g "$REPORTS_DIR/goss.yaml" validate --format junit > "$REPORTS_DIR/goss.xml"\n';
	}

	validateReports(files) {
		const report = files.find((file) => path.basename(file) === "goss.xml");
		const xml = report ? fs.readFileSync(report, "utf8") : "";
		const total = Number(
			xml.match(/<testsuite\b[^>]*\btests="([0-9]+)"/)?.[1] || 0,
		);
		const skipped = Number(
			xml.match(/<testsuite\b[^>]*\bskipped="([0-9]+)"/)?.[1] || 0,
		);
		if (total <= skipped || !/<testcase[\s>]/.test(xml))
			throw new Error("Goss must execute at least one assertion");
	}
}

module.exports = { GossSuite };
