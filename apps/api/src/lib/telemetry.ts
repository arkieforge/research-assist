// Structured events the Worker logs as one JSON line each. On prod they reach Axiom `arkie-logs` as
// the log `body` (infra/axiom.ts parses them by `event`); elsewhere they're plain Workers Logs.
// Cloudflare's export has no custom spans, so this is how the Worker adds meaning to its telemetry.

export type TelemetryEvent =
	| {
			event: "chat.turn";
			chat: string;
			model: string;
			outcome: "completed" | "error" | "aborted";
			ms: number;
			/** Milliseconds from the turn's start to its first streamed text; absent when none streamed. */
			firstTokenMs?: number;
			inputTokens?: number;
			outputTokens?: number;
			toolCalls: string[];
			error?: string;
	  }
	| { event: "chat.index"; rows: number; /** Oldest event's age when its row was written. */ lagMs: number }
	| { event: "heartbeat" };

export const emit = (event: TelemetryEvent) => console.log(JSON.stringify(event));

type Turn = Extract<TelemetryEvent, { event: "chat.turn" }>;

/** Measures one turn from the stream's chunks; `end` returns its chat.turn event. `now` is for tests. */
export function trackTurn(chat: string, model: string, now = Date.now) {
	const start = now();
	let firstTokenMs: number | undefined;
	const toolCalls: string[] = [];
	return {
		chunk(chunk: { type: string; toolName?: string }) {
			if (chunk.type === "text-delta" && firstTokenMs === undefined) firstTokenMs = now() - start;
			if (chunk.type === "tool-call" && chunk.toolName) toolCalls.push(chunk.toolName);
		},
		end(outcome: Turn["outcome"], extra: Pick<Turn, "inputTokens" | "outputTokens" | "error"> = {}): Turn {
			return { event: "chat.turn", chat, model, outcome, ms: now() - start, firstTokenMs, toolCalls, ...extra };
		},
	};
}
