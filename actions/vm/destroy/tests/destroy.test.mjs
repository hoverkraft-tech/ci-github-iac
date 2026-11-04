import * as execToolkit from "@actions/exec";
import * as io from "@actions/io";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { suite, test } from "node:test";
import { VirtualMachine } from "../../_internal/runtime.cjs";
import { limaFixture, qemuFixture } from "../../../../tests/helpers/vm.cjs";

// Copy the ESM namespace so tests can mock the injected helper.
const exec = { ...execToolkit };
const helpers = { exec, io };

suite("vm/destroy", () => {
	test("shared, unmanaged and symlinked runtimes are rejected", async (t) => {
		// Arrange
		const { root, vm } = limaFixture(t, { exec, io });
		for (const directory of ["", root, "/tmp/not-owned"]) {
			// Act
			const destroy = () => new VirtualMachine(directory, helpers).destroy();

			// Assert
			assert.throws(destroy);
		}

		// Arrange
		fs.chmodSync(vm.home, 0o755);

		// Act
		const destroyShared = () => vm.destroy();

		// Assert
		await assert.rejects(destroyShared);

		// Arrange
		fs.rmSync(vm.home, { recursive: true });
		fs.symlinkSync(path.join(root, "missing"), vm.home);

		// Act
		const destroySymlink = () => vm.destroy();

		// Assert
		await assert.rejects(destroySymlink);
		assert.ok(fs.existsSync(path.join(root, "guest.yml")));
	});

	test("an empty runtime can be destroyed without installed Lima", async (t) => {
		// Arrange
		const { vm } = limaFixture(t, { exec, io });
		const command = t.mock.method(exec, "exec");

		// Act
		await vm.destroy();

		// Assert
		assert.equal(command.mock.callCount(), 0);
		assert.equal(fs.existsSync(vm.home), false);
	});

	test("failed destruction preserves recovery access", async (t) => {
		// Arrange
		const { vm } = limaFixture(t, { exec, io });
		fs.writeFileSync(vm.sshConfig, "synthetic recovery configuration");
		t.mock.method(VirtualMachine.prototype, "exists", () => true);
		t.mock.method(exec, "exec", () => 0);

		// Act
		const destroy = () => vm.destroy();

		// Assert
		await assert.rejects(destroy, /still exists/);
		assert.equal(
			fs.readFileSync(vm.sshConfig, "utf8"),
			"synthetic recovery configuration",
		);
	});
	test("QEMU runtime selection rejects unmanaged paths and unsafe ownership", async (t) => {
		// Arrange
		const { vm, root } = qemuFixture(t, { exec, io });

		// Act
		const selected = new VirtualMachine(vm.home, helpers);
		const openUnmanaged = () => new VirtualMachine(root, helpers);

		// Assert
		assert.equal(selected.backend, "qemu");
		assert.throws(openUnmanaged);

		// Arrange
		fs.chmodSync(vm.home, 0o755);

		// Act
		const destroyShared = () => vm.destroy();

		// Assert
		await assert.rejects(destroyShared);

		// Arrange
		fs.chmodSync(vm.home, 0o700);
		fs.rmSync(vm.home, { recursive: true });
		fs.symlinkSync(root, vm.home);

		// Act
		const destroySymlink = () => vm.destroy();

		// Assert
		await assert.rejects(destroySymlink);
		assert.ok(fs.existsSync(path.join(root, "key")));
	});

	test("cleanup never signals another process or deletes its recovery files", async (t) => {
		// Arrange
		const { vm } = qemuFixture(t, { exec, io });
		fs.writeFileSync(path.join(vm.home, "pid"), String(process.pid));
		const kill = t.mock.method(process, "kill", () =>
			assert.fail("Must not signal an unrelated process"),
		);

		// Act
		const destroy = () => vm.destroy();

		// Assert
		await assert.rejects(destroy, /ownership/);
		assert.equal(kill.mock.callCount(), 0);
		assert.ok(fs.existsSync(vm.home));
	});
});
