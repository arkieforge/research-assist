import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { formatEvents } from "./triage-lib.ts";

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

test("formatEvents says so when there is nothing", () => {
	assert.equal(formatEvents([]), "(none)");
});
