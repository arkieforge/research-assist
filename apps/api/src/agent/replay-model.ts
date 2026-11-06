import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

// "Replay (dev)": a free, scripted model the chat uses when no model key is set (local dev only, see
// alchemy.run.ts). It streams word by word and calls render_html for visual asks, so the socket,
// persistence, tools, R2/D1 and the sidebar queue all run for real without a paid turn.

type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type Prompt = Parameters<MockLanguageModelV4["doStream"]>[0]["prompt"];
type Chunk = StreamResult["stream"] extends ReadableStream<infer C> ? C : never;

const VISUAL = /\b(chart|graph|plot|table|diagram|visuali[sz]e)\b/i;

const SAMPLE_HTML = `<!doctype html><html><body style="margin:0;background:#000;color:#fff;font:14px system-ui">
<svg viewBox="0 0 320 160" width="100%"><g fill="#4f8cff">
<rect x="20" y="90" width="40" height="50"/><rect x="80" y="60" width="40" height="80"/>
<rect x="140" y="30" width="40" height="110"/><rect x="200" y="70" width="40" height="70"/>
<rect x="260" y="20" width="40" height="120"/></g></svg>
<p style="padding:0 12px">Sample chart from the Replay (dev) model.</p></body></html>`;

const usage = {
	inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 0, text: 0, reasoning: 0 },
};

/** The last user message's text, from the model-level prompt. */
function lastUserText(prompt: Prompt): string {
	for (const message of prompt.toReversed()) {
		if (message.role !== "user") continue;
		return message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ");
	}
	return "";
}

const textChunks = (text: string): Chunk[] => [
	{ type: "stream-start", warnings: [] },
	{ type: "text-start", id: "t" },
	...text.split(/(?<= )/).map((delta): Chunk => ({ type: "text-delta", id: "t", delta })),
	{ type: "text-end", id: "t" },
	{ type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
];

const toolCallChunks = (): Chunk[] => [
	{ type: "stream-start", warnings: [] },
	{
		type: "tool-call",
		toolCallId: crypto.randomUUID(),
		toolName: "render_html",
		input: JSON.stringify({ title: "Sample chart", html: SAMPLE_HTML }),
	},
	{ type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
];

/** Picks the next scripted step from the conversation so far. */
export function replayStep(prompt: Prompt): Chunk[] {
	const afterTool = prompt.at(-1)?.role === "tool";
	if (afterTool) return textChunks("Here is a sample chart, rendered with the real render_html tool.");
	const said = lastUserText(prompt);
	if (VISUAL.test(said)) return toolCallChunks();
	return textChunks(
		`Replay (dev) here, no model key is set. You said: "${said.slice(0, 200)}". ` +
			"Ask for a chart to exercise render_html, or set ARKIE_ANTHROPIC_API_KEY for real answers.",
	);
}

export const replayModel = () =>
	new MockLanguageModelV4({
		provider: "arkie",
		modelId: "replay-dev",
		doStream: async ({ prompt }) => ({
			stream: simulateReadableStream({ chunks: replayStep(prompt), initialDelayInMs: 150, chunkDelayInMs: 25 }),
		}),
	});
