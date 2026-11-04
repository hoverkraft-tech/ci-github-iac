const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { VirtualMachine } = require("../../actions/vm/_internal/runtime.cjs");
const { QemuCreation } = require("../../actions/vm/create/qemu.cjs");
const { createRequire } = require("node:module");
const actionRequire = createRequire(path.resolve("package.json"));
const helpers = {
	exec: actionRequire("@actions/exec"),
	io: actionRequire("@actions/io"),
};

function limaFixture(t, Machine = VirtualMachine) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "vm-test-"));
	const previousDirectory = process.cwd();
	process.chdir(root);
	const vm = new Machine(
		fs.mkdtempSync(`/tmp/iac-${process.getuid()}-`),
		helpers,
	);
	fs.writeFileSync(path.join(root, "guest.yml"), "cpus: 1\n");

	t.after(() => {
		process.chdir(previousDirectory);
		fs.rmSync(vm.home, { recursive: true, force: true });
		fs.rmSync(root, { recursive: true, force: true });
	});
	return { root, vm, reports: path.join(root, ".reports") };
}

function qemuFixture(t, Machine = VirtualMachine) {
	const root = fs.mkdtempSync("/tmp/qemu-test-");
	const previous = process.cwd();
	process.chdir(root);
	const vm = new Machine(
		fs.mkdtempSync(`/var/tmp/iac-qemu-${process.getuid()}-`),
		helpers,
	);
	for (const name of ["installer.iso", "key"])
		fs.writeFileSync(name, "synthetic");
	const config = {
		cpus: 2,
		memoryMiB: 2048,
		diskGiB: 10,
		diskSerial: "TEST_DISK",
		iso: "installer.iso",
		network: {
			subnet: "192.0.2.0/24",
			address: "192.0.2.10",
			gateway: "192.0.2.1",
			dns: "192.0.2.2",
			mac: "02:00:00:00:00:01",
		},
		ssh: { user: "root", privateKey: "key" },
	};
	const creation = (value = config) => {
		fs.writeFileSync("vm.json", JSON.stringify(value));
		return new QemuCreation("vm.json", "1");
	};
	t.after(() => {
		process.chdir(previous);
		fs.rmSync(vm.home, { recursive: true, force: true });
		fs.rmSync(root, { recursive: true, force: true });
	});
	return { root, vm, config, creation };
}

module.exports = { limaFixture, qemuFixture };
