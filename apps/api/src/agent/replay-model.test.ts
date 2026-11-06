import { describe, expect, test } from "vite-plus/test";
import { replayStep } from "./replay-model.ts";

const user = (text: string) => ({ role: "user" as const, content: [{ type: "text" as const, text }] });

describe("replayStep", () => {
	test("a visual ask calls render_html, so dev exercises the tool, R2 and D1", () => {
		const chunks = replayStep([user("draw a chart of signups")]);
		expect(chunks.some((c) => c.type === "tool-call" && c.toolName === "render_html")).toBe(true);
	});

	test("after the tool result it finishes with text instead of calling the tool again", () => {
		const chunks = replayStep([
			user("chart please"),
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "1",
						toolName: "render_html",
						output: { type: "json", value: { id: "a" } },
					},
				],
			},
		]);
		expect(chunks.some((c) => c.type === "tool-call")).toBe(false);
		expect(chunks.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "stop" } });
	});
});
