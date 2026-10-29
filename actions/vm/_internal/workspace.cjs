const fs = require("node:fs");
const path = require("node:path");

class Workspace {
	constructor() {
		this.root = fs.realpathSync(process.cwd());
	}

	file(value) {
		const filename = fs.realpathSync(path.resolve(this.root, value));
		const relative = path.relative(this.root, filename);
		if (
			!value ||
			!relative ||
			relative === ".." ||
			relative.startsWith(`..${path.sep}`) ||
			path.isAbsolute(relative)
		) {
			throw new Error("The path must be inside the checkout");
		}
		if (!fs.statSync(filename).isFile())
			throw new Error("Expected a checkout file");
		return filename;
	}
}

module.exports = { Workspace };
