const assert = require("node:assert/strict");
const { suite, test } = require("node:test");
const { OpenTofuReport } = require("../opentofu.cjs");

suite("Native OpenTofu reporting boundaries", () => {
	test("keeps names and outcomes without diagnostic or state contents", () => {
		// Arrange
		const events = [
			{ type: "diagnostic", diagnostic: { detail: "private-canary" } },
			{
				type: "test_run",
				test_run: {
					path: "tests/a&b.tofutest.hcl",
					run: 'check<"value">',
					status: "pass",
				},
			},
			{
				type: "test_summary",
				test_summary: {
					status: "pass",
					passed: 1,
					failed: 0,
					errored: 0,
					skipped: 0,
				},
			},
		]
			.map((event) => JSON.stringify(event))
			.join("\n");
		// Act
		const result = OpenTofuReport.parse(events, 0);
		// Assert
		assert.equal(result.passed, true);
		assert.match(result.xml, /a&amp;b/);
		assert.match(result.xml, /check&lt;&quot;value&quot;&gt;/);
		assert.ok(!result.xml.includes("private-canary"));
	});

	test("preserves a cleanup failure after a passing assertion", () => {
		// Arrange
		const success = {
			status: "pass",
			passed: 1,
			failed: 0,
			errored: 0,
			skipped: 0,
		};
		const events =
			JSON.stringify({ type: "test_summary", test_summary: success }) +
			"\n" +
			JSON.stringify({
				type: "test_run",
				test_run: { path: "a.tofutest.hcl", run: "valid", status: "pass" },
			});
		// Act
		const result = OpenTofuReport.parse(events, 1);
		// Assert
		assert.equal(result.passed, false);
		assert.match(result.xml, /execution-and-cleanup/);
		assert.match(result.xml, /errors="1"/);
	});

	for (const [name, events] of [
		[
			"missing summary",
			[{ type: "test_run", test_run: { path: "a", run: "b", status: "pass" } }],
		],
		[
			"missing outcomes",
			[
				{
					type: "test_summary",
					test_summary: {
						status: "pass",
						passed: 1,
						failed: 0,
						errored: 0,
						skipped: 0,
					},
				},
			],
		],
		[
			"unknown status",
			[
				{
					type: "test_run",
					test_run: { path: "a", run: "b", status: "unknown" },
				},
			],
		],
	]) {
		test(`rejects ${name}`, () => {
			// Arrange
			const stream = events.map((event) => JSON.stringify(event)).join("\n");
			// Act
			const parse = () => OpenTofuReport.parse(stream, 0);
			// Assert
			assert.throws(parse);
		});
	}
});
