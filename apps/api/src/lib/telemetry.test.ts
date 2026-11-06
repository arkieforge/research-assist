import { describe, expect, test } from "vite-plus/test";
import { trackTurn } from "./telemetry.ts";

describe("trackTurn", () => {
	test("times the first streamed text, collects tool calls, and reports how the turn ended", () => {
		let clock = 1_000;
		const turn = trackTurn("user_a.c1", "replay", () => clock);
		clock = 1_100;
		turn.chunk({ type: "tool-call", toolName: "render_html" });
		clock = 1_250;
		turn.chunk({ type: "text-delta" });
		clock = 1_400;
		turn.chunk({ type: "text-delta" });
		clock = 2_000;
		expect(turn.end("completed", { inputTokens: 10, outputTokens: 5 })).toEqual({
			event: "chat.turn",
			chat: "user_a.c1",
			model: "replay",
			outcome: "completed",
			ms: 1_000,
			firstTokenMs: 250,
			toolCalls: ["render_html"],
			inputTokens: 10,
			outputTokens: 5,
		});
	});

	test("a turn that fails before any text has no first-token time", () => {
		const turn = trackTurn("user_a.c1", "m", () => 0);
		expect(turn.end("error", { error: "overloaded" })).toMatchObject({ outcome: "error", firstTokenMs: undefined });
	});
});
