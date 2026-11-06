import { createAnthropic } from "@ai-sdk/anthropic";
import { AIChatAgent, type ChatResponseResult } from "@cloudflare/ai-chat";
import { convertToModelMessages, isStepCount, streamText, tool } from "ai";
import { artifacts, d1 } from "#/db/d1.ts";
import { ownerOf } from "#/lib/chat-name.ts";
import type { ChatEvent } from "#/lib/events.ts";
import { t3Allowed } from "#/lib/t3.ts";
import { MODEL, renderHtmlSpec, SYSTEM } from "./prompt.ts";
import { replayModel } from "./replay-model.ts";

/**
 * One chat. A Durable Object per conversation: AIChatAgent persists the messages in its SQLite,
 * streams replies over the WebSocket, and resumes a stream after a reconnect.
 * Instances are named `${userId}.${chatId}`; src/worker.ts only routes a user to their own.
 */
export class ChatAgent extends AIChatAgent<Env> {
	// Tools from MCP servers (T3 Code) restore after hibernation; wait for them before a turn.
	waitForMcpConnections = { timeout: 5_000 };

	async onChatMessage() {
		const t3 = t3Allowed(ownerOf(this.name), this.env.T3_ALLOWED_USER_IDS);
		if (t3) await this.connectT3();
		// No key set (any stage): the scripted Replay model, which tells the user how to configure one.
		const key = this.env.ANTHROPIC_API_KEY;
		const result = streamText({
			model: key ? createAnthropic({ apiKey: key })(MODEL) : replayModel(),
			system: SYSTEM,
			messages: await convertToModelMessages(this.messages),
			tools: { ...(t3 ? this.mcp.getAITools() : {}), render_html: this.renderHtml() },
			stopWhen: isStepCount(8),
		});
		return result.toUIMessageStreamResponse();
	}

	// Tell the rest of the app (sidebar index in Neon) that this chat moved. Off the hot path: the queue
	// consumer writes Postgres, so a slow database never delays a reply.
	protected async onChatResponse(result: ChatResponseResult) {
		const userId = ownerOf(this.name);
		if (result.status !== "completed" || !userId) return;
		const event: ChatEvent = { type: "chat.updated", chatId: this.name, userId, title: this.title(), at: Date.now() };
		await this.env.CHAT_EVENTS.send(event);
	}

	/** The first user message, trimmed. shortcut: no model-written titles yet; add one when the sidebar needs it. */
	private title() {
		const first = this.messages.find((m) => m.role === "user");
		const text = first?.parts.find((p) => p.type === "text")?.text ?? "New chat";
		return text.slice(0, 80);
	}

	/** Connects T3 Code's MCP server once per chat; the Agents SDK persists and restores the connection. */
	private async connectT3() {
		const url = this.env.T3_MCP_URL;
		if (!url || this.getMcpServers().servers.t3) return;
		await this.addMcpServer("T3 Code", url, {
			id: "t3",
			transport: { headers: { Authorization: `Bearer ${this.env.T3_MCP_TOKEN}` } },
		});
	}

	/** Stores a model-written HTML page in R2 (body) and D1 (index); the web app loads it from /artifacts/:id. */
	private renderHtml() {
		return tool({
			...renderHtmlSpec,
			execute: async ({ title, html }) => {
				const userId = ownerOf(this.name);
				if (!userId) throw new Error("chat has no owner");
				const id = crypto.randomUUID();
				await this.env.ARTIFACTS.put(id, html, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
				await d1(this.env.ARTIFACT_INDEX)
					.insert(artifacts)
					.values({ id, chatId: this.name, userId, title, createdAt: new Date() });
				return { id };
			},
		});
	}
}
