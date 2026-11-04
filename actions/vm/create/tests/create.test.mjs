import * as io from "@actions/io";
import { setTimeout as delay } from "node:timers/promises";
import * as execToolkit from "@actions/exec";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { suite, test } from "node:test";
import { GuestCreation } from "../creation.cjs";
import { run } from "../../_internal/command.cjs";
import { limaFixture, qemuFixture } from "../../../../tests/helpers/vm.cjs";

// Copy the ESM namespace so tests can mock the injected helper.
const exec = { ...execToolkit };

suite("vm/create", () => {
	test("configuration must be a checkout file", async (t) => {
		// Arrange
		const { root } = limaFixture(t, { exec, io });
		fs.symlinkSync(
			fs.realpathSync(
				path.join(import.meta.dirname, "../../../../tests/fixture/lima.yml"),
			),
			path.join(root, "external.yml"),
		);
		for (const config of [
			undefined,
			"",
			" \n",
			"missing.yml",
			"../outside.yml",
			"external.yml",
			".",
		]) {
			// Act
			const create = () => new GuestCreation(config);

			// Assert
			assert.throws(create);
		}
	});

	test("custom startup budgets retain a bounded subprocess deadline", async (t) => {
		// Arrange
		const { vm } = limaFixture(t, { exec, io });
		const spawn = t.mock.method(exec, "exec", (_program, _args, options) => {
			options.listeners.stdout(Buffer.from("Host fixture\n"));
			return 0;
		});

		// Act
		await new GuestCreation("guest.yml", "20").start(vm);

		// Assert
		const [program, args, options] = spawn.mock.calls[0].arguments;
		assert.equal(program, "timeout");
		assert.deepEqual(args.slice(0, 3), ["--kill-after=5s", "1260s", "limactl"]);
		assert.ok(args.includes("--timeout=20m"));
		assert.equal(options.env.LIMA_HOME, vm.home);
		assert.equal(options.silent, true);
		assert.equal(options.shell, undefined);
	});

	test("invalid startup budgets are rejected", async (t) => {
		// Arrange
		limaFixture(t, { exec, io });
		for (const timeout of ["", "0", "-1", "41", "1.5", "unbounded"]) {
			// Act
			const create = () => new GuestCreation("guest.yml", timeout);

			// Assert
			assert.throws(create, /Startup timeout/);
		}
	});

	test("repeated creation refuses to reuse or delete a running VM", async (t) => {
		// Arrange
		const { vm } = limaFixture(t, { exec, io });
		t.mock.method(vm, "exists", () => true);
		const command = t.mock.method(exec, "exec");

		// Act
		const start = () => new GuestCreation("guest.yml").start(vm);

		// Assert
		await assert.rejects(start);
		assert.equal(command.mock.callCount(), 0);
	});

	test("startup does not recreate a released runtime", async (t) => {
		// Arrange
		const { vm } = limaFixture(t, { exec, io });
		await vm.destroy();
		const spawn = t.mock.method(exec, "exec");

		// Act
		const start = () => new GuestCreation("guest.yml").start(vm);

		// Assert
		await assert.rejects(start, /runtime is absent/);
		assert.equal(spawn.mock.callCount(), 0);
		assert.equal(fs.existsSync(vm.home), false);
	});

	test("failed creation rolls back its partial guest", async (t) => {
		// Arrange
		const { vm } = limaFixture(t, { exec, io });
		const presence = [false, true, false];
		t.mock.method(vm, "exists", () => presence.shift());
		const command = t.mock.method(exec, "exec", (_program, args) => {
			if (args[3] === "start") throw new Error("synthetic failure");
			return 0;
		});

		// Act
		const start = () => new GuestCreation("guest.yml").start(vm);

		// Assert
		await assert.rejects(start);
		assert.deepEqual(command.mock.calls.at(-1).arguments[1].slice(3), [
			"delete",
			"--force",
			"iac-test",
		]);
		assert.equal(fs.existsSync(vm.home), false);
	});

	test("failed rollback preserves recovery files without exposing command output", async (t) => {
		// Arrange
		const { vm } = limaFixture(t, { exec, io });
		const presence = [false, true];
		fs.writeFileSync(vm.sshConfig, "synthetic recovery configuration");
		t.mock.method(vm, "exists", () => presence.shift());
		t.mock.method(exec, "exec", () => {
			throw new Error("synthetic-private-output");
		});

		// Act
		const start = () => new GuestCreation("guest.yml").start(vm);

		// Assert
		await assert.rejects(start, { message: "VM command failed or timed out" });
		assert.equal(
			fs.readFileSync(vm.sshConfig, "utf8"),
			"synthetic recovery configuration",
		);
		assert.ok(fs.existsSync(vm.home));
	});

	test("subprocess failures and timeouts cannot expose raw output", async (t) => {
		// Arrange
		const spawn = t.mock.method(exec, "exec");
		for (const result of [1, 124, new Error("private-command")]) {
			// Arrange
			spawn.mock.mockImplementation((_program, _args, options) => {
				options.listeners.stdout(Buffer.from("private-output"));
				options.listeners.stderr(Buffer.from("private-error"));
				if (result instanceof Error) throw result;
				return result;
			});

			// Act
			const list = () => run(exec, "limactl", ["list"]);

			// Assert
			await assert.rejects(list, {
				message: "VM command failed or timed out",
			});
		}
	});

	test("bounded execution preserves literal stdin and rejects oversized output", async () => {
		// Arrange
		const input = "guest's value; $(false) — UTF-8\n";

		// Act
		const output = await run(exec, "cat", [], { input });

		// Assert
		assert.equal(output, input.trim());

		// Arrange
		for (const stream of ["stdout", "stderr"]) {
			const script = `process.${stream}.write("x".repeat(1024 * 1024 + 1))`;

			// Act
			const excessive = () => run(exec, process.execPath, ["-e", script]);

			// Assert
			await assert.rejects(excessive, {
				message: "VM command failed or timed out",
			});
		}
	});

	test("command deadlines terminate child processes before they can modify files", async (t) => {
		// Arrange
		const { root } = limaFixture(t, { exec, io });
		const marker = path.join(root, "unexpected-child-output");

		// Act
		const execute = () =>
			run(
				exec,
				"bash",
				[
					"-c",
					'(sleep 0.3; printf unexpected > "$1") & wait',
					"fixture",
					marker,
				],
				{ timeout: 100 },
			);

		// Assert
		await assert.rejects(execute, {
			message: "VM command failed or timed out",
		});
		await delay(400);
		assert.equal(fs.existsSync(marker), false);
	});

	test("QEMU configuration requires bounded resources, private media and matching network addresses", async (t) => {
		// Arrange
		const { creation, config } = qemuFixture(t, { exec, io });

		// Act
		const valid = creation();

		// Assert
		assert.equal(valid.config.diskSerial, "TEST_DISK");

		// Arrange
		for (const patch of [
			{ cpus: 0 },
			{ diskGiB: 129 },
			{ memoryMiB: "2048" },
			{ iso: "/dev/null" },
			{ image: "installer.iso" },
			{ seed: "installer.iso" },
			{ arguments: "-drive /dev/sda" },
			{ diskSerial: "unsafe,drive" },
			{ ssh: { user: "root\nProxyCommand bad", privateKey: "key" } },
			{ network: { ...config.network, address: "10.0.0.10" } },
			{ network: { ...config.network, dns: config.network.gateway } },
		]) {
			// Act
			const create = () => creation({ ...config, ...patch });

			// Assert
			assert.throws(create);
		}
	});

	test("failed QEMU setup rolls back an allocated runtime", async (t) => {
		// Arrange
		const { creation, vm } = qemuFixture(t, { exec, io });
		const operation = creation();
		t.mock.method(operation, "port", async () => {
			throw new Error("synthetic port allocation failure");
		});

		// Act
		const startup = operation.start(vm, { info() {} });

		// Assert
		await assert.rejects(startup);
		assert.equal(fs.existsSync(vm.home), false);
	});

	test("installer power-off precedes disk boot and SSH readiness", async (t) => {
		// Arrange
		const { creation, vm } = qemuFixture(t, { exec, io });
		const operation = creation();
		t.mock.method(operation, "port", async () => 2222);
		t.mock.method(operation, "prepare", () => {});
		const boots = t.mock.method(operation, "boot", () => {});
		const states = [false, false, true];
		t.mock.method(vm, "exists", () => states.shift());
		const subprocess = t.mock.method(exec, "exec", () => 0);

		// Act
		await operation.start(vm, { info() {} });

		// Assert
		assert.deepEqual(
			boots.mock.calls.map((call) => call.arguments[2]),
			[true, false],
		);
		assert.equal(subprocess.mock.calls[0].arguments[1][2], "ssh");
		assert.ok(
			subprocess.mock.calls[0].arguments[1].includes(
				"StrictHostKeyChecking=accept-new",
			),
		);
	});
});
