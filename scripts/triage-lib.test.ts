import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { formatAxiomTable, formatEvents } from "./triage-lib.ts";

test("formatAxiomTable turns Axiom's column-major table into one line per row", () => {
	const table = {
		tables: [
			{
				fields: [{ name: "_time" }, { name: "status" }, { name: "body" }],
				columns: [
					["2026-11-06T16:05:06Z", "2026-11-06T16:06:00Z"],
					[500, null],
					["Error: boom\n  at x", { nested: true }],
				],
			},
		],
	};
	assert.deepEqual(formatAxiomTable(table).split("\n"), [
		"- _time=2026-11-06T16:05:06Z status=500 body=Error: boom at x",
		'- _time=2026-11-06T16:06:00Z status=null body={"nested":true}',
	]);
});

test("formatAxiomTable and formatEvents say so when there is nothing", () => {
	assert.equal(formatAxiomTable({ tables: [{ fields: [{ name: "a" }], columns: [[]] }] }), "(none)");
	assert.equal(formatAxiomTable({}), "(none)");
	assert.equal(formatEvents([]), "(none)");
});

test("formatEvents lists events oldest first, prefers the error over the message, and flattens whitespace", () => {
	const lines = formatEvents([
		{ timestamp: 2_000, $metadata: { level: "warn", trigger: "GET /chats", message: "slow\n  query", requestId: "b" } },
		{
			timestamp: 1_000,
			$metadata: { level: "error", trigger: "queue", message: "x", error: "Error: boom", requestId: "a" },
		},
	]).split("\n");
	assert.deepEqual(lines, [
		"- 1970-01-01T00:00:01.000Z error queue: Error: boom (request a)",
		"- 1970-01-01T00:00:02.000Z warn GET /chats: slow query (request b)",
	]);
});
