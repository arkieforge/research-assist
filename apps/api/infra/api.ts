import * as Cloudflare from "@alchemy.run/cloudflare";
import type { Input } from "alchemy/Input";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import type { ChatAgent } from "../src/agent/chat.ts";
import { AppConfig, DEV_API_PORT } from "./config.ts";
import { Hyperdrive } from "./database.ts";
import { ArtifactIndex, Artifacts, ChatEvents } from "./resources.ts";

/**
 * The API Worker (src/worker.ts): ChatAgent Durable Objects, the JSON routes the web app calls,
 * and the ChatEvents consumer. The web app (apps/web, on Vercel) reaches it cross-origin with a
 * Clerk token. `destinations` are Workers Observability export slugs (Axiom, prod only).
 */
export const Api = (destinations: { logs: Input<string>[]; traces: Input<string>[] }) =>
	Cloudflare.Worker(
		"Api",
		Effect.gen(function* () {
			const config = yield* AppConfig;
			return {
				main: "./src/worker.ts",
				// scripts/dev.ts picks API_PORT per worktree and hands the same URL to apps/web.
				dev: { port: DEV_API_PORT },
				observability: {
					enabled: true,
					// WebSocket connects carry the Clerk token in ?token=, so URLs are logged without queries.
					redactQueryString: true,
					logs: { enabled: true, invocationLogs: true, destinations: destinations.logs },
					traces: { enabled: true, destinations: destinations.traces },
				},
				env: {
					// Named after the class: routeAgentRequest serves it at /agents/chat-agent/:name.
					ChatAgent: Cloudflare.DurableObject<ChatAgent>("ChatAgent", { className: "ChatAgent" }),
					HYPERDRIVE: Hyperdrive,
					ARTIFACTS: Artifacts,
					ARTIFACT_INDEX: ArtifactIndex,
					CHAT_EVENTS: ChatEvents,
					CLERK_SECRET_KEY: config.CLERK_SECRET_KEY,
					ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
					// Empty URL = T3 Code disabled. The token placeholder only exists because a binding can't be absent.
					T3_MCP_URL: Option.match(config.T3_MCP, { onNone: () => "", onSome: ([url]) => url }),
					T3_MCP_TOKEN: Redacted.make(
						Option.match(config.T3_MCP, { onNone: () => "unset", onSome: ([, token]) => token }),
					),
					T3_ALLOWED_USER_IDS: Option.getOrElse(config.T3_ALLOWED_USER_IDS, () => ""),
				},
			};
		}).pipe(Effect.orDie),
	);

export type ApiEnv = Cloudflare.InferEnv<ReturnType<typeof Api>>;
