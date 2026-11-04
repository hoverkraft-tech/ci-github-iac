const fs = require("node:fs");
const path = require("node:path");

class GuestReports {
	async prepare(vm, timeout) {
		this.home = undefined;
		const directory = await vm.command(
			[
				"shell",
				"--workdir=/tmp",
				vm.name,
				"mktemp",
				"-d",
				"/tmp/iac-reports.XXXXXXXX",
			],
			{ timeout },
		);
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
		const reports = files.filter((file) => file.path === "goss.xml");
		if (
			reports.length !== 1 ||
			reports[0].size === 0 ||
			reports[0].size > 20 * 1024 * 1024
		)
			throw new Error(
				"Goss must produce one nonempty regular report up to 20 MiB",
			);
		return reports;
	}

	async collect(vm, directory, { io }) {
		if (!this.home) return [];
		const deadline = Date.now() + 120000;
		const command = (args) => {
			const timeout = deadline - Date.now();
			if (timeout <= 0) throw new Error("Report collection timed out");
			return vm.command(args, { timeout });
		};
		const manifest = await command([
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
				await io.mkdirP(path.dirname(target));
				await command([
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
			await io.rmRF(staging);
			throw error;
		}
	}

	async cleanup(vm) {
		if (!this.home) return;
		const directory = this.home;
		this.home = undefined;
		await vm.command([
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
