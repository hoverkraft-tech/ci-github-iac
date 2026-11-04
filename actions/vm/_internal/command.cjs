async function run(
	exec,
	program,
	args,
	{ timeout = 120000, input, env = process.env } = {},
) {
	// GitHub Script owns execution; GNU timeout bounds the whole process group.
	// Capture only bounded stdout, without logging commands or private output.
	const chunks = [];
	let stdoutBytes = 0;
	let stderrBytes = 0;
	const limit = 1024 * 1024;
	try {
		const status = await exec.exec(
			"timeout",
			["--kill-after=5s", `${timeout / 1000}s`, program, ...args],
			{
				env,
				input: Buffer.from(input ?? ""),
				silent: true,
				ignoreReturnCode: true,
				listeners: {
					stdout(data) {
						stdoutBytes += data.length;
						if (stdoutBytes <= limit) chunks.push(data);
					},
					stderr(data) {
						stderrBytes += data.length;
					},
				},
			},
		);
		if (status !== 0 || stdoutBytes > limit || stderrBytes > limit)
			throw new Error();
		return Buffer.concat(chunks).toString("utf8").trim();
	} catch {
		throw new Error("VM command failed or timed out");
	}
}

module.exports = { run };
