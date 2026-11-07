const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Hosted assertions inspect report side effects without expanding the public API.
class PublishedReports {
	constructor(github, context) {
		this.github = github;
		this.context = context;
	}

	async read(prefix, expectedCount) {
		const directories = fs
			.readdirSync(process.env.RUNNER_TEMP, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
			.map((entry) => path.join(process.env.RUNNER_TEMP, entry.name));
		assert.equal(directories.length, expectedCount);
		let artifacts = [];
		// Upload completion can precede visibility in GitHub's artifact list.
		const deadline = Date.now() + 60_000;
		while (true) {
			artifacts = await this.github.paginate(
				this.github.rest.actions.listWorkflowRunArtifacts,
				{ ...this.context.repo, run_id: this.context.runId, per_page: 100 },
			);
			if (
				directories.every((directory) =>
					artifacts.some(
						(item) =>
							item.name.startsWith(
								`ci-reports-${process.env.GITHUB_RUN_ATTEMPT}-`,
							) && item.name.endsWith(`-${path.basename(directory)}`),
					),
				) ||
				Date.now() >= deadline
			)
				break;
			await new Promise((resolve) => setTimeout(resolve, 2_000));
		}
		return directories.map((directory) => {
			assert.equal(fs.statSync(directory).mode & 0o777, 0o700);
			const artifact = artifacts.find(
				(item) =>
					item.name.startsWith(
						`ci-reports-${process.env.GITHUB_RUN_ATTEMPT}-`,
					) && item.name.endsWith(`-${path.basename(directory)}`),
			);
			assert.ok(
				artifact,
				`Missing uploaded reports for ${path.basename(directory)}`,
			);
			assert.ok(artifact.size_in_bytes > 0);
			assert.equal(artifact.expired, false);
			const files = fs
				.readdirSync(directory)
				.filter((name) => /\.(xml|info|json)$/.test(name))
				.map((name) => path.join(directory, name));
			for (const name of ["guest"]) {
				const source = path.join(directory, name);
				if (!fs.existsSync(source)) continue;
				for (const relative of fs.readdirSync(source, { recursive: true })) {
					const file = path.join(source, relative);
					if (fs.lstatSync(file).isFile()) files.push(file);
				}
			}
			assert.ok(files.length > 0);
			const text = files
				.map((file) => fs.readFileSync(file, "utf8"))
				.join("\n");
			assert.equal(text.includes("synthetic-private-output"), false);
			return { directory, artifact, files, text };
		});
	}

	async comment(title, expected = true) {
		const pullRequest = this.context.payload.pull_request;
		if (
			this.context.eventName !== "pull_request" ||
			pullRequest.head.repo.full_name !==
				`${this.context.repo.owner}/${this.context.repo.repo}`
		)
			return null;
		const comments = await this.github.paginate(
			this.github.rest.issues.listComments,
			{
				...this.context.repo,
				issue_number: pullRequest.number,
				per_page: 100,
			},
		);
		const comment = comments.find(
			(item) =>
				item.user.login === "github-actions[bot]" &&
				item.body.startsWith(`${title}\n`),
		);
		assert.equal(
			Boolean(comment),
			expected,
			`Unexpected comment presence: ${title}`,
		);
		if (!comment) return null;
		assert.equal(comment.body.includes("synthetic-private-output"), false);
		return comment.body;
	}
}

module.exports = { PublishedReports };
