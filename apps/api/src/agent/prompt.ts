import { z } from "zod";

// Everything the chat model reads from us: the system prompt and the render_html tool's contract.
// Kept apart from chat.ts (which only runs in workerd) so evals/render-html imports the real text.

export const MODEL = "claude-sonnet-5-5";

export const SYSTEM = `You are Arkie, a concise assistant.
When a chart, table, diagram or comparison would answer better than prose, call render_html with one
self-contained HTML page (inline CSS and JS, no external requests except cdnjs.cloudflare.com).`;

export const renderHtmlSpec = {
	description: "Show the user a self-contained HTML page: a chart, table, diagram or comparison.",
	inputSchema: z.object({
		title: z.string().min(1).max(120),
		html: z.string().min(1).max(1_000_000),
	}),
};
