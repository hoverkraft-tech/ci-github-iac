const fs = require("node:fs");
const path = require("node:path");

// Resolve existing ancestors before creating anything, including report folders.
class Workspace {
	constructor() {
		this.root = fs.realpathSync(process.cwd());
	}

	resolve(value) {
		const root = this.root;
		const candidate = path.resolve(root, value);
		let ancestor = candidate;
		while (!fs.lstatSync(ancestor, { throwIfNoEntry: false })) {
			ancestor = path.dirname(ancestor);
		}
		const resolved = path.resolve(
			fs.realpathSync(ancestor),
			path.relative(ancestor, candidate),
		);
		const relative = path.relative(root, resolved);
		if (
			!value ||
			!relative ||
			relative === ".." ||
			relative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relative)
		) {
			throw new Error("The path must be inside the checkout");
		}
		return resolved;
	}

	file(value) {
		const filename = this.resolve(value);
		if (!fs.statSync(filename).isFile())
			throw new Error("Expected a checkout file");
		return filename;
	}
}

module.exports = { Workspace };
