const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { CheckReports } = require("./reports.cjs");

class AnsibleChecks {
	constructor({ core, env, run = spawnSync }) {
		this.core = core;
		this.env = env;
		this.run = run;
		this.workspace = fs.realpathSync(env.GITHUB_WORKSPACE);
		this.image = env.ANSIBLE_TEST_IMAGE?.trim();
		if (!this.image || !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(this.image)) {
			throw new Error("container-image must be a Docker image reference.");
		}
		this.playbooks = this.paths(env.ANSIBLE_TEST_PLAYBOOKS, false);
		this.collections = this.paths(env.ANSIBLE_TEST_COLLECTIONS, true);
		if (!this.playbooks.length && !this.collections.length) {
			throw new Error("Provide at least one playbook or collection to test.");
		}
		for (const collection of this.collections) {
			if (!/\/ansible_collections\/\w+\/\w+$/.test(`/${collection}`)) {
				throw new Error(
					"Collections must use ansible_collections/namespace/name directories.",
				);
			}
		}
		this.inventory = env.ANSIBLE_TEST_INVENTORY?.trim();
		if (this.inventory)
			this.inventory = this.relativePath(this.inventory, false);
		this.environment = this.lines(env.ANSIBLE_TEST_ENVIRONMENT);
		for (const setting of this.environment) {
			if (
				!/^ANSIBLE_[A-Z_]+=.*$/.test(setting) ||
				/^ANSIBLE_(HOME|NOCOLOR)=/.test(setting)
			) {
				throw new Error(
					"environment accepts ANSIBLE_* assignments except ANSIBLE_HOME and ANSIBLE_NOCOLOR.",
				);
			}
		}
		this.cache = env.ANSIBLE_TEST_CACHE?.trim();
		if (this.cache) {
			const target = path.resolve(this.workspace, this.cache);
			this.contained(target);
			// Validate existing ancestors before creating directories through possible links.
			let ancestor = target;
			while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
			this.contained(fs.realpathSync(ancestor));
			fs.mkdirSync(target, { recursive: true });
			this.cache = fs.realpathSync(target);
			this.contained(this.cache);
		}
	}

	lines(value = "") {
		return [
			...new Set(
				value
					.split(/\r?\n/)
					.map((line) => line.trim())
					.filter(Boolean),
			),
		];
	}

	contained(target) {
		const relative = path.relative(this.workspace, target);
		if (
			relative === ".." ||
			relative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relative) ||
			/[,\r\n]/.test(target)
		) {
			throw new Error(
				"Paths must stay inside the checkout and cannot contain commas or newlines.",
			);
		}
	}

	relativePath(value, directory) {
		const target = fs.realpathSync(path.resolve(this.workspace, value));
		this.contained(target);
		const stat = fs.statSync(target);
		if (directory ? !stat.isDirectory() : !stat.isFile() || stat.size === 0) {
			throw new Error(
				`${value} must be a ${directory ? "directory" : "nonempty file"}.`,
			);
		}
		return path.relative(this.workspace, target);
	}

	paths(value, directory) {
		return this.lines(value).map((entry) =>
			this.relativePath(entry, directory),
		);
	}

	container(command, args = [], directory = "") {
		const name = `ansible-test-${randomUUID()}`;
		const options = [
			"run",
			"--rm",
			"--name",
			name,
			"--user",
			`${process.getuid()}:${process.getgid()}`,
			"--mount",
			`type=bind,src=${this.workspace},dst=/workspace`,
			"--mount",
			`type=bind,src=${this.accounts}/passwd,dst=/etc/passwd,readonly`,
			"--mount",
			`type=bind,src=${this.accounts}/group,dst=/etc/group,readonly`,
			"--workdir",
			path.posix.join("/workspace", directory),
			"--env",
			"HOME=/tmp",
			"--env",
			"XDG_CACHE_HOME=/tmp/.cache",
			"--env",
			"ANSIBLE_HOME=/tmp/.ansible",
			"--env",
			"ANSIBLE_NOCOLOR=1",
		];
		for (const setting of this.environment) options.push("--env", setting);
		if (this.cache)
			options.push(
				"--mount",
				`type=bind,src=${this.cache},dst=/ansible-test-cache`,
			);
		options.push(
			"--entrypoint",
			"/bin/sh",
			this.image,
			"-ec",
			'mkdir -p "$ANSIBLE_HOME/test"; if [ -d /ansible-test-cache ]; then ln -s /ansible-test-cache "$ANSIBLE_HOME/test/venv"; fi; exec "$@"',
			"ansible-test",
			command,
			...args,
		);
		let result;
		try {
			result = this.run("docker", options, {
				encoding: "utf8",
				timeout: 20 * 60 * 1000,
				maxBuffer: 8 * 1024 * 1024,
			});
			const output = `${result.stdout || ""}${result.stderr || ""}`;
			this.core.info(output);
			return {
				code: result.error || result.signal ? 1 : result.status,
				output,
			};
		} finally {
			// A killed Docker client can leave its container running after a timeout.
			if (!result || result.error || result.signal) {
				const cleanup = this.run("docker", ["rm", "--force", name], {
					encoding: "utf8",
					timeout: 30000,
				});
				if (
					cleanup.status !== 0 &&
					!cleanup.stderr?.includes("No such container")
				) {
					throw new Error(
						"Failed to remove the interrupted Ansible test container.",
					);
				}
			}
		}
	}

	async execute() {
		this.contained(this.workspace);
		const directory = fs.mkdtempSync(
			path.join(this.env.RUNNER_TEMP, "ansible-reports-"),
		);
		const reports = new CheckReports(directory);
		this.accounts = fs.mkdtempSync(
			path.join(this.env.RUNNER_TEMP, "ansible-accounts-"),
		);
		fs.chmodSync(this.accounts, 0o755);
		const uid = process.getuid();
		const gid = process.getgid();
		fs.writeFileSync(
			path.join(this.accounts, "passwd"),
			`ansible-ci:x:${uid}:${gid}::/tmp:/bin/sh\n`,
			{ mode: 0o644 },
		);
		fs.writeFileSync(
			path.join(this.accounts, "group"),
			`ansible-ci:x:${gid}:\n`,
			{ mode: 0o644 },
		);
		try {
			for (const playbook of this.playbooks) {
				this.core.info(`Checking playbook ${playbook}`);
				const args = ["--syntax-check"];
				if (this.inventory)
					args.push("--inventory", `/workspace/${this.inventory}`);
				args.push(`/workspace/${playbook}`);
				const result = this.container("ansible-playbook", args);
				reports.add("syntax", playbook, result);
			}
			if (this.collections.length) {
				const python = this.container("python3", ["--version"]);
				const version = python.output.match(/^Python (\d+\.\d+)\./m)?.[1];
				if (python.code !== 0 || !version)
					throw new Error(
						"Cannot identify the tooling image's Python version.",
					);
				for (const collection of this.collections) {
					this.core.info(`Checking collection ${collection}`);
					const result = this.container(
						"ansible-test",
						["sanity", "--python", version],
						collection,
					);
					reports.add("sanity", collection, result);
				}
			}
		} catch (error) {
			reports.add("runtime", "Ansible test execution", { code: 1, output: "" });
			throw error;
		} finally {
			fs.rmSync(this.accounts, { recursive: true, force: true });
			const files = reports.write();
			this.core.setOutput("report-files", files.join("\n"));
			this.core.setOutput("id", path.basename(directory));
		}
		if (reports.failed)
			throw new Error(
				"Ansible checks failed. See the check reports and execution log.",
			);
	}
}

module.exports = { AnsibleChecks };
