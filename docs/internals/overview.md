# Architecture overview

```
browser ──(Vercel)── apps/web: TanStack Start SSR + client, Clerk
   │  wss /agents/chat-agent/<userId>.<chatId>?token=…      GET /chats, GET /artifacts/:id (Bearer)
   ▼
apps/api: one Cloudflare Worker
   ├─ auth gate: Clerk JWT → userId; the instance name must start with `<userId>.`
   ├─ ChatAgent Durable Object (one per chat): history in its SQLite, model streaming, tools
   │     ├─ render_html → R2 (body) + D1 (owner index)
   │     └─ T3 Code over MCP (client connection, persisted by the Agents SDK)
   ├─ after each turn: ChatEvents queue → this Worker's queue() → Neon `chats` via Hyperdrive
   └─ JSON routes for web: /chats (Neon), /artifacts/:id (D1 + R2)
```

## Decisions and why

**One Worker for the API.** Durable Objects, the queue consumer and the JSON routes share bindings and deploy atomically. Splitting buys nothing until a part needs its own scaling or blast radius.

**Messages live in the Durable Object, not Postgres.** The Agents SDK persists, streams and resumes from the DO's SQLite with no network hop. Postgres holds only the cross-chat index the sidebar needs. Anything that needs every message (search, export) reads through the agent, or adds its own projection fed by the queue.

**The index is written through a queue.** The reply path never waits on Postgres, and a slow database delays the sidebar, not the chat. The consumer is idempotent: it dedupes a batch by chat id and only applies newer `at` timestamps, so retries and replays are safe.

**Ownership in the name.** `${userId}.${chatId}` lets the Worker reject a foreign chat before the Durable Object wakes, with no lookup. Clerk ids never contain a dot. Never route to a ChatAgent by any other naming.

**Bearer tokens, not cookies, on the API.** Web and the API live on different origins (Vercel, workers.dev or a custom domain). A token makes CORS `*` safe: a page can only act as a user whose token it already holds. WebSockets can't send headers, so the token rides in `?token=`, which is why logs drop query strings.

**Artifacts are framed with `srcdoc` in a sandbox.** Model-written HTML runs its scripts in an opaque origin, with no access to the app's cookies, storage or Clerk session. The API serves it only to its owner; there are no public artifact URLs (add signed links deliberately if sharing is ever needed).

**Stages decide the database.** `alchemy dev` stages use Docker Postgres and local state so anyone can run the stack; cloud stages branch prod's Neon project, which prod owns and retains. See [deploy.md](../operations/deploy.md).

## Constraints that span apps

- Response shapes the web app reads live in `apps/api/src/types.ts` and are imported by web. Change both in one PR.
- `apps/api/src/lib/chat-name.ts` is imported by web. It must stay free of imports and runtime dependencies.
- Renaming or removing the `ChatAgent` class orphans every existing chat's storage. Treat it as a data migration: plan how chats move before changing `className`, and check what Alchemy's plan says it will do to the Durable Object namespace.
