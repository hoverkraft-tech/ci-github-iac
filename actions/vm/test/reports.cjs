const fs = require("node:fs");
const path = require("node:path");

class GuestReports {
	constructor(selection = "") {
		this.patterns = selection
			.split(/[\n,;]/)
			.map((value) => value.trim())
			.filter(Boolean);
		for (const pattern of this.patterns) {
			if (
				path.isAbsolute(pattern) ||
				pattern.split("/").includes("..") ||
				!/^[a-zA-Z0-9_./*?[\] -]+$/.test(pattern)
			) {
				throw new Error("Report patterns must be relative to REPORTS_DIR");
			}
		}
	}

	prepare(vm) {
		this.home = undefined;
		if (!this.patterns.length) return [];
		const directory = vm.command([
			"shell",
			"--workdir=/tmp",
			vm.name,
			"mktemp",
			"-d",
			"/tmp/iac-reports.XXXXXXXX",
		]);
		if (!/^\/tmp\/iac-reports\.[a-zA-Z0-9]+$/.test(directory)) {
			throw new Error("Invalid guest report directory");
		}
		this.home = directory;
		return ["env", `REPORTS_DIR=${directory}`];
	}

	select(manifest) {
		const files = manifest
			.split("\0")
			.filter(Boolean)
			.map((entry) => {
				const [size, filename, ...extra] = entry.split("\t");
				if (
					extra.length ||
					!/^[0-9]+$/.test(size) ||
					!filename ||
					path.isAbsolute(filename) ||
					filename.split("/").includes("..") ||
					!/^[a-zA-Z0-9_./ -]+$/.test(filename)
				) {
					throw new Error("Invalid guest report manifest");
				}
				return { path: filename, size: Number(size) };
			});
		const selected = new Map();
		for (const pattern of this.patterns) {
			const matches = files.filter((file) =>
				path.matchesGlob(file.path, pattern),
			);
			if (!matches.length)
				throw new Error("A requested report pattern matched no files");
			for (const file of matches) selected.set(file.path, file);
		}
		const reports = [...selected.values()].sort((left, right) =>
			left.path.localeCompare(right.path),
		);
		const total = reports.reduce((sum, file) => sum + file.size, 0);
		if (
			reports.length > 100 ||
			total > 20 * 1024 * 1024 ||
			reports.some((file) => file.size === 0)
		) {
			throw new Error(
				"Reports must be nonempty and limited to 100 files and 20 MiB",
			);
		}
		return reports;
	}

	collect(vm, directory) {
		if (!this.home) return [];
		const deadline = Date.now() + 120000;
		const command = (args) => {
			const timeout = deadline - Date.now();
			if (timeout <= 0) throw new Error("Report collection timed out");
			return vm.command(args, { timeout });
		};
		const manifest = command([
			"shell",
			"--workdir=/tmp",
			vm.name,
			"find",
			"-P",
			this.home,
			"-type",
			"f",
			"-printf",
			"%s\t%P\\0",
		]);
		const files = this.select(manifest);
		const staging = fs.mkdtempSync(path.join(directory, "collect-"));
		const destination = path.join(directory, "guest");
		try {
			for (const file of files) {
				const target = path.join(staging, file.path);
				fs.mkdirSync(path.dirname(target), { recursive: true });
				command([
					"copy",
					"--backend=scp",
					`${vm.name}:${this.home}/${file.path}`,
					target,
				]);
				const info = fs.lstatSync(target);
				if (!info.isFile() || info.size !== file.size)
					throw new Error("Incomplete report transfer");
			}
			fs.renameSync(staging, destination);
			return files.map((file) => path.join(destination, file.path));
		} catch (error) {
			fs.rmSync(staging, { recursive: true, force: true });
			throw error;
		}
	}

	cleanup(vm) {
		if (!this.home) return;
		const directory = this.home;
		this.home = undefined;
		vm.command([
			"shell",
			"--workdir=/tmp",
			vm.name,
			"rm",
			"-rf",
			"--",
			directory,
		]);
	}
}

module.exports = { GuestReports };
