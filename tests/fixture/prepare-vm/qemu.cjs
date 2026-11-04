const fs = require("node:fs");
const path = require("node:path");

module.exports = async ({ exec, io }) => {
	const directory = path.resolve(".cache/qemu-fixture");
	await io.mkdirP(directory);
	fs.chmodSync(directory, 0o700);
	await exec.exec("ssh-keygen", [
		"-q",
		"-t",
		"ed25519",
		"-N",
		"",
		"-f",
		`${directory}/key`,
	]);
	const key = fs.readFileSync(`${directory}/key.pub`, "utf8").trim();
	fs.writeFileSync(
		`${directory}/user-data`,
		`#cloud-config\nusers:\n  - name: tester\n    shell: /bin/bash\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    ssh_authorized_keys:\n      - ${key}\n`,
	);
	fs.writeFileSync(
		`${directory}/meta-data`,
		"instance-id: iac-qemu-fixture\nlocal-hostname: iac-test\n",
	);
	await exec.exec("cloud-localds", [
		`${directory}/seed.iso`,
		`${directory}/user-data`,
		`${directory}/meta-data`,
	]);
	const config = {
		cpus: 2,
		memoryMiB: 2048,
		diskGiB: 10,
		diskSerial: "IAC_TEST_DISK",
		image: ".cache/qemu-fixture/image.qcow2",
		seed: ".cache/qemu-fixture/seed.iso",
		network: {
			subnet: "192.0.2.0/24",
			address: "192.0.2.10",
			gateway: "192.0.2.1",
			dns: "192.0.2.2",
			mac: "02:00:00:00:00:01",
		},
		ssh: { user: "tester", privateKey: ".cache/qemu-fixture/key" },
	};
	fs.writeFileSync(`${directory}/vm.json`, JSON.stringify(config));
	fs.writeFileSync(`${directory}/invalid.qcow2`, "synthetic invalid image");
	fs.writeFileSync(
		`${directory}/invalid.json`,
		JSON.stringify({ ...config, image: ".cache/qemu-fixture/invalid.qcow2" }),
	);
};
