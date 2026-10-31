const fs = require("node:fs");
const path = require("node:path");
const { run } = require("../_internal/runtime.cjs");
const { GuestReports } = require("./reports.cjs");

class RunnerReports extends GuestReports {
	prepare(_vm, directory) {
		this.home = fs.mkdtempSync(path.join(directory, "source-"));
		return { REPORTS_DIR: this.home };
	}

	collect(_vm, directory) {
		if (!this.home || !this.patterns.length) return [];
		const manifest = run("find", [
			"-P",
			this.home,
			"-type",
			"f",
			"-printf",
			"%s\t%P\\0",
		]);
		const files = this.select(manifest);
		const destination = path.join(directory, "runner");
		try {
			for (const file of files) {
				const target = path.join(destination, file.path);
				fs.mkdirSync(path.dirname(target), { recursive: true });
				fs.copyFileSync(
					path.join(this.home, file.path),
					target,
					fs.constants.COPYFILE_EXCL,
				);
				if (fs.statSync(target).size !== file.size)
					throw new Error("Incomplete report copy");
			}
			return files.map((file) => path.join(destination, file.path));
		} catch (error) {
			fs.rmSync(destination, { recursive: true, force: true });
			throw error;
		}
	}

	cleanup() {
		if (this.home) fs.rmSync(this.home, { recursive: true, force: true });
		this.home = undefined;
	}
}

module.exports = { RunnerReports };
