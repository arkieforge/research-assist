import { routeAgentRequest } from "agents";
import { and, desc, eq, sql } from "drizzle-orm";
import { artifacts, d1 } from "#/db/d1.ts";
import { chats, neon } from "#/db/neon.ts";
import { userIdOf } from "#/lib/auth.ts";
import { ownerOf } from "#/lib/chat-name.ts";
import type { ChatEvent } from "#/lib/events.ts";
import { emit } from "#/lib/telemetry.ts";
import type { ChatSummary } from "#/types.ts";

// The API Worker entry (alchemy.run.ts `main`). Durable Object classes must be exported from here.
export { ChatAgent } from "#/agent/chat.ts";

// Auth is a bearer token, never a cookie, so any origin may call: a page can only act as a user
// whose token it already holds. Authorization must be listed by name; `*` doesn't cover it.
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
	"Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

/** Lets a request through to /agents/chat-agent/:name only when the token's user owns that chat. */
async function onlyOwner(request: Request, route: { name: string }, env: Env) {
	const userId = await userIdOf(request, env);
	if (!userId || ownerOf(route.name) !== userId) return new Response("Forbidden", { status: 403, headers: CORS });
	return undefined;
}

async function listChats(env: Env, userId: string): Promise<ChatSummary[]> {
	const rows = await neon(env.HYPERDRIVE)
		.select({ id: chats.id, title: chats.title, updatedAt: chats.updatedAt })
		.from(chats)
		.where(eq(chats.userId, userId))
		.orderBy(desc(chats.updatedAt))
		.limit(50);
	return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

/** A render_html page, only for its owner. The web app frames it with `srcdoc` in a sandboxed iframe. */
async function artifact(env: Env, userId: string, id: string) {
	const [row] = await d1(env.ARTIFACT_INDEX)
		.select({ id: artifacts.id })
		.from(artifacts)
		.where(and(eq(artifacts.id, id), eq(artifacts.userId, userId)));
	const object = row && (await env.ARTIFACTS.get(row.id));
	if (!object) return json({ error: "not found" }, 404);
	return new Response(object.body, { headers: { ...CORS, "Content-Type": "text/html; charset=utf-8" } });
}

export default {
	async fetch(request, env) {
		const agent = await routeAgentRequest(request, env, {
			cors: CORS,
			onBeforeConnect: (req, route) => onlyOwner(req, route, env),
			onBeforeRequest: (req, route) => onlyOwner(req, route, env),
		});
		if (agent) return agent;
		if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

		const { pathname } = new URL(request.url);
		if (request.method !== "GET") return json({ error: "not found" }, 404);
		const userId = await userIdOf(request, env);
		if (!userId) return json({ error: "unauthorized" }, 401);
		if (pathname === "/chats") return json(await listChats(env, userId));
		const artifactId = pathname.match(/^\/artifacts\/([0-9a-f-]{36})$/)?.[1];
		if (artifactId) return artifact(env, userId, artifactId);
		return json({ error: "not found" }, 404);
	},

	// ChatEvents consumer: upserts the chat index in Neon. A thrown error retries the whole batch.
	async queue(batch, env) {
		// One row per chat, newest event wins: Postgres rejects an upsert that touches a row twice.
		const latest = new Map<string, ChatEvent>();
		for (const { body } of batch.messages) {
			if ((latest.get(body.chatId)?.at ?? 0) <= body.at) latest.set(body.chatId, body);
		}
		const rows = [...latest.values()].map((e) => ({
			id: e.chatId,
			userId: e.userId,
			title: e.title,
			updatedAt: new Date(e.at),
		}));
		if (rows.length === 0) return;
		await neon(env.HYPERDRIVE)
			.insert(chats)
			.values(rows)
			.onConflictDoUpdate({
				target: chats.id,
				set: { title: sql`excluded.title`, updatedAt: sql`excluded.updated_at` },
				setWhere: sql`${chats.updatedAt} < excluded.updated_at`,
			});
		emit({
			event: "chat.index",
			rows: rows.length,
			lagMs: Date.now() - Math.min(...rows.map((r) => r.updatedAt.getTime())),
		});
	},

	// Prod's cron (infra/api.ts): proves to the "Arkie heartbeat missing" monitor that the Worker runs and
	// its logs still reach Axiom, which silence from an idle app can't.
	async scheduled() {
		emit({ event: "heartbeat" });
	},
} satisfies ExportedHandler<Env, ChatEvent>;
