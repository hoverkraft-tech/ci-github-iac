const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { GuestCreation } = require("./creation.cjs");
const { Workspace } = require("../_internal/workspace.cjs");
const { run } = require("../_internal/runtime.cjs");

function fields(value, allowed) {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.keys(value).some((key) => !allowed.includes(key))
	)
		throw new Error("Invalid QEMU configuration fields");
}

class QemuCreation extends GuestCreation {
	constructor(config, timeout) {
		super(config, timeout);
		const value = JSON.parse(fs.readFileSync(this.template, "utf8"));
		fields(value, [
			"cpus",
			"memoryMiB",
			"diskGiB",
			"diskSerial",
			"iso",
			"image",
			"seed",
			"network",
			"ssh",
		]);
		for (const [name, maximum] of Object.entries({
			cpus: 16,
			memoryMiB: 65536,
			diskGiB: 128,
		})) {
			if (
				!Number.isInteger(value[name]) ||
				value[name] < 1 ||
				value[name] > maximum
			)
				throw new Error("Invalid QEMU resource allocation");
		}
		if (!/^[a-zA-Z0-9_-]{1,20}$/.test(value.diskSerial ?? ""))
			throw new Error("Invalid disk serial");
		if (
			Boolean(value.iso) === Boolean(value.image) ||
			(value.iso && value.seed)
		)
			throw new Error(
				"Choose an unattended ISO or a disk image with optional seed",
			);
		const workspace = new Workspace();
		for (const key of ["iso", "image", "seed"]) {
			if (value[key]) value[key] = workspace.file(value[key]);
		}
		fields(value.network, ["subnet", "address", "gateway", "dns", "mac"]);
		for (const key of ["address", "gateway", "dns"]) {
			if (net.isIP(value.network[key]) !== 4)
				throw new Error("Expected IPv4 networking");
		}
		const [subnet, prefix, ...extra] = (value.network.subnet ?? "").split("/");
		if (
			extra.length ||
			net.isIP(subnet) !== 4 ||
			!/^(?:[89]|[12][0-9]|30)$/.test(prefix)
		)
			throw new Error("Expected an IPv4 subnet with prefix 8 to 30");
		const integer = (address) =>
			address.split(".").reduce((sum, part) => sum * 256 + Number(part), 0);
		const block = 2 ** (32 - Number(prefix));
		const base = integer(subnet);
		const addresses = ["address", "gateway", "dns"].map((key) =>
			integer(value.network[key]),
		);
		if (
			base % block ||
			new Set(addresses).size !== 3 ||
			addresses.some(
				(address) => address <= base || address >= base + block - 1,
			)
		)
			throw new Error(
				"Network addresses must be distinct hosts in the supplied subnet",
			);
		if (!/^02(?::[a-fA-F0-9]{2}){5}$/.test(value.network.mac ?? ""))
			throw new Error("Expected a locally administered MAC starting with 02");
		fields(value.ssh, ["user", "privateKey"]);
		if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(value.ssh.user ?? ""))
			throw new Error("Invalid SSH user");
		value.ssh.privateKey = workspace.file(value.ssh.privateKey);
		this.config = value;
	}

	async port() {
		const server = net.createServer();
		await new Promise((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", resolve);
		});
		const port = server.address().port;
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
		return port;
	}

	prepare(vm, port) {
		const config = this.config;
		const local = (filename) => path.join(vm.home, filename);
		fs.accessSync("/dev/kvm", fs.constants.R_OK | fs.constants.W_OK);
		if (
			["tmpfs", "ramfs"].includes(
				run("findmnt", ["-n", "-o", "FSTYPE", "--target", vm.home]),
			)
		)
			throw new Error("VM disks require disk-backed storage");
		fs.copyFileSync(config.ssh.privateKey, local("key"));
		fs.chmodSync(local("key"), 0o600);
		fs.copyFileSync("/usr/share/OVMF/OVMF_VARS_4M.fd", local("uefi.fd"));
		for (const key of ["iso", "seed"]) {
			if (config[key]) fs.copyFileSync(config[key], local(`${key}.iso`));
		}
		if (config.image) {
			const info = JSON.parse(
				run("qemu-img", ["info", "-f", "qcow2", "--output=json", config.image]),
			);
			if (
				info["backing-filename"] ||
				info["format-specific"]?.data?.["data-file"] ||
				!Number.isSafeInteger(info["virtual-size"]) ||
				info["virtual-size"] > config.diskGiB * 1024 ** 3
			)
				throw new Error(
					"Image must be self-contained and fit the configured disk",
				);
			run("qemu-img", [
				"convert",
				"-f",
				"qcow2",
				"-O",
				"raw",
				config.image,
				local("system.raw"),
			]);
			run("qemu-img", [
				"resize",
				"-f",
				"raw",
				local("system.raw"),
				`${config.diskGiB}G`,
			]);
		} else
			run("qemu-img", [
				"create",
				"-f",
				"raw",
				local("system.raw"),
				`${config.diskGiB}G`,
			]);
		fs.writeFileSync(
			vm.sshConfig,
			[
				`Host ${vm.name}`,
				"  HostName 127.0.0.1",
				`  Port ${port}`,
				`  User ${config.ssh.user}`,
				`  IdentityFile ${local("key")}`,
				`  UserKnownHostsFile ${local("known_hosts")}`,
				"  GlobalKnownHostsFile /dev/null",
				"  BatchMode yes",
				"  IdentitiesOnly yes",
				"  PasswordAuthentication no",
				"  KbdInteractiveAuthentication no",
				"  ConnectTimeout 5",
				"  StrictHostKeyChecking yes",
				"  LogLevel ERROR",
				"",
			].join("\n"),
			{ mode: 0o600, flag: "wx" },
		);
	}

	boot(vm, port, install) {
		const config = this.config;
		const network = config.network;
		const local = (filename) => path.join(vm.home, filename);
		run(
			"qemu-system-x86_64",
			[
				"-machine",
				"q35,accel=kvm",
				"-cpu",
				"host",
				"-smp",
				String(config.cpus),
				"-m",
				String(config.memoryMiB),
				"-display",
				"none",
				"-daemonize",
				"-pidfile",
				local("pid"),
				"-drive",
				"if=pflash,format=raw,readonly=on,file=/usr/share/OVMF/OVMF_CODE_4M.fd",
				"-drive",
				`if=pflash,format=raw,file=${local("uefi.fd")}`,
				"-drive",
				`if=none,id=system,format=raw,cache=none,file=${local("system.raw")}`,
				"-device",
				`virtio-blk-pci,drive=system,serial=${config.diskSerial}`,
				"-netdev",
				`user,id=lan,net=${network.subnet},host=${network.gateway},dns=${network.dns},dhcpstart=${network.address},hostfwd=tcp:127.0.0.1:${port}-${network.address}:22`,
				"-device",
				`virtio-net-pci,netdev=lan,mac=${network.mac}`,
				"-serial",
				`file:${local("serial.log")}`,
				...(install
					? ["-cdrom", local("iso.iso"), "-boot", "order=d"]
					: ["-boot", "order=c"]),
				...(!install && config.seed ? ["-cdrom", local("seed.iso")] : []),
			],
			{ timeout: 30000 },
		);
	}

	async start(vm, core) {
		if (vm.exists()) throw new Error("This invocation already has a VM");
		const deadline = Date.now() + this.startupTimeout * 60000;
		try {
			const port = await this.port();
			this.prepare(vm, port);
			if (this.config.iso) {
				core.info("Booting unattended ISO; waiting for installer power-off.");
				this.boot(vm, port, true);
				while (vm.exists()) {
					if (Date.now() >= deadline)
						throw new Error("Installer power-off timed out");
					await delay(2000);
				}
			}
			core.info("Booting the system disk; waiting for SSH.");
			this.boot(vm, port, false);
			while (Date.now() < deadline) {
				if (!vm.exists()) throw new Error("QEMU exited before SSH readiness");
				try {
					// TOFU is restricted to this owned loopback endpoint. Later calls use strict checking.
					run(
						"ssh",
						[
							"-o",
							"StrictHostKeyChecking=accept-new",
							"-F",
							vm.sshConfig,
							vm.name,
							"true",
						],
						{ timeout: 10000 },
					);
					return;
				} catch {
					await delay(2000);
				}
			}
			throw new Error("Guest SSH readiness timed out");
		} catch (error) {
			vm.destroy();
			throw error;
		}
	}
}

module.exports = { QemuCreation };
