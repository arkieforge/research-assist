# Arkie

Arkie is an AI chat app. Every chat is a Durable Object agent that streams replies, draws HTML visualizations, and reaches T3 Code threads over MCP. Three apps in one pnpm workspace: a Cloudflare API (`apps/api`), a TanStack Start webapp (`apps/web`, Vercel) and an Astro marketing site (`apps/marketing`, Vercel).

## What we never compromise on

1. **One command to run it.** A fresh clone with Docker and two Clerk keys runs the whole stack with `vp run dev`. Anything that adds a manual step to local dev needs a very good reason and an update to `scripts/dev.ts` so the step stays automatic.
2. **Infra is code.** Every Cloudflare, Neon, Axiom, incident.io, Doppler, GitHub and Vercel setting we control is an Alchemy resource in `apps/api/` (the app stack, or the bootstrap stack for account-level setup). No dashboard edits, no wrangler config. If you clicked it, it will drift.
3. **Fast, honest streaming.** Replies stream token by token from the agent. No spinners that lie, no continuously repainting animations (they peg the GPU on high-refresh screens), no polling where a socket already exists.
4. **A chat belongs to its user.** Ownership is decided before a Durable Object wakes (rule 6 below). Any new way to reach a chat or artifact goes through the same check.

## A note on taste

Build the smallest model that makes the correct behavior unsurprising. Do not preserve complexity because it exists, and do not add machinery because it looks impressive. Channel "measure twice, cut once" and "yagni". These are good defaults, not hard rules; the developer's preferences override anything here.

## Glossary

- **you**: the agent reading this file. **we / maintainers**: the people building Arkie. **user**: someone using the app.
- **chat**: one conversation. Its runtime is a **ChatAgent** Durable Object named `${userId}.${chatId}`.
- **turn**: one user message and the agent's full reply, tool calls included.
- **artifact**: an HTML page the model rendered with `render_html`. Body in R2, index row in D1.
- **stage**: one isolated copy of the API stack. `dev_<user>_<checkout>` (local), `pr-<n>` (preview), `live_<user>_<checkout>` (personal cloud), `prod`.
- **chat index**: the Neon `chats` table the sidebar reads, written by the ChatEvents queue consumer.

## The ways to hurt yourself

1. **Killing by pattern.** Never `pkill -f`, `pgrep | kill`, or kill a PID you found by matching a name or path. Other worktrees run the same commands, and your own process has this path in its argv. Stop what you started by the PID you captured, or Ctrl-C `vp run dev`, which stops its own process groups.
2. **Touching `prod`.** Never pass `--stage prod`, never read Doppler `prd`, never run anything against the prod Neon branch unless the task says so. CI deploys prod from `main`; that is the only path.
3. **Running Alchemy bare.** `alchemy deploy|dev|destroy` without `--stage` lands on a stage named after your user, shared by every worktree. Use the root scripts (`vp run dev`, `vp run api:deploy`, `vp run api:destroy`, `vp run dev:destroy`), which name the stage after the checkout. (Never `vp run --filter … deploy` without the root script: use the root scripts.)
4. **Baking localhost into a build.** `VITE_API_URL` is per environment. `scripts/dev.ts` sets it for dev; Vercel sets it per deployment. Never commit it into code or config.

## Hit every surface

The most common defect is a change that works where you tested it and is missing everywhere else. Before calling work done, say which of these applied:

- **Apps.** API, web, marketing. A new API capability usually needs a web entry point; a new product claim on marketing needs to be true in the app.
- **Agents.** A capability a user can trigger is usually one the chat agent should reach as a tool, and T3 Code may reach it over MCP. Put the logic in a function both can call, not in a route handler.
- **Stages.** Local (Docker Postgres, local D1/R2/queues), preview and prod (Neon branch, real Cloudflare). A migration, binding or secret must work in all three. New secrets go in Doppler `dev`, `stg` and `prd` and in `.env.example`.
- **Reverse states.** If you added a way in, add the way out. Create needs delete; connect (T3 MCP) needs disconnect.
- **Docs.** Check whether the change makes existing guidance wrong. Apply the [documentation rules](#documentation) before adding anything.

## Dev servers

- `vp run dev` runs everything; read the real ports from its `[dev]` banner. The main checkout uses 8787 (API), 3000 (web), 4321 (marketing), 54329 (Postgres). Worktrees get a stable offset from their path, shifted further if a port is taken.
- Worktrees get `vp install` and the main checkout's `.env` from the T3 Setup action (`scripts/setup-worktree.ts`). While `.t3/setup-running` names a live PID, wait for it; it ends with `.t3/setup-done` or `.t3/setup-failed`. With no marker, run `vp run setup` yourself.
- Secrets: Doppler `arkie/dev` when the Doppler CLI is logged in, then `.env` on top. `vp run dev` says exactly which keys are missing. Never print secret values.
- Local Postgres data lives in a Docker volume per stage and survives restarts. `vp run dev:destroy` removes it (and every local resource of the stage). Do it before deleting a worktree.
- Real model turns cost money. Without `ARKIE_ANTHROPIC_API_KEY` the chat uses the free **Replay (dev)** model: it streams, and calls `render_html` when you ask for a chart, so the socket, tools, R2/D1 and the queue all run. Use a real key only when the change depends on model output.
- Testing on a phone: `vp run dev --share` (tailnet HTTPS). Never hand-wire `tailscale serve`.

## Verifying

- Before you push: `vp run check:changed` (CI's gates for what you touched). `vp run check` runs everything; CI always does. Don't rerun repo-wide checks while iterating.
- Setup or dev misbehaving: `vp run doctor` first. It names the problem and the fix.
- While iterating: `vp run --filter <app> test` or `vp test run <file>`.
- Test behavior that can break: auth and ownership checks, the queue consumer's upsert, stage selection in the stack, migrations, parsing of external formats, the logic a bug fix changed. Leave out tests for what types guarantee, copy text, smoke runs and callback wiring. Extend an existing test before adding one. Test at the lowest layer that fails on `main`.
- Bug fixes: logic, data and protocol bugs get a failing test first, then the fix. Purely visual bugs get before/after screenshots and no test.
- User-visible web changes get one pass in a real browser (the `test-arkie-app` skill): T3's preview browser against `vp run dev`, with screenshots in the PR.
- Infra changes: run `vp run dev` from a clean stage (`dev:destroy` first) and show the plan and the `Done:` line. For cloud-only resources, label the PR `preview:api` and link the preview.

## Pull requests

- Never open a PR unless the developer asks.
- Conventional commit titles in plain language: `fix(api): chat list no longer drops renamed chats`. Scopes: `api`, `web`, `marketing`, `infra`, `docs`.
- Body: the problem in a sentence or two, then how you fixed it, then how you verified it. UI changes need before/after images; motion needs a short video. Upload evidence to the PR; never commit PR-only assets.
- One request is one PR.
- Babysitting: watch the PR, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason, stay quiet when nothing is new, stop when CI is green on the latest commit.

## Documentation

Most changes need no doc change; agents can read the code.

- `docs/internals/` holds decisions and their reasons, constraints that span apps, and traps that are hard to discover from source. Before adding a paragraph, ask what a maintainer would get wrong without it.
- `docs/operations/` holds runbooks: development, deploys, secrets, observability and incidents.
- No feature catalogs, field lists, control-flow narration or PR summaries. A local reason goes in a one-line code comment next to the code.
- When a documented decision changes, rewrite or remove the text. Don't append a second account.
- Don't commit plans, research notes or scratch files. A merged PR is the implementation record.

## How it works

The browser opens a WebSocket to `wss://<api>/agents/chat-agent/<userId>.<chatId>?token=<Clerk JWT>`. The API Worker verifies the token and that the name's user matches before routing to the ChatAgent Durable Object, which keeps the message history in its SQLite and streams the model's reply. After each completed turn the agent sends a `chat.updated` event to the ChatEvents queue; the same Worker's `queue` handler upserts the Neon `chats` row (through Hyperdrive) that the web app lists via `GET /chats`. `render_html` stores the page in R2 and its owner in D1; the web app fetches it with the user's token and frames it with a sandboxed `srcdoc` iframe. More in [docs/internals/overview.md](docs/internals/overview.md).

## Where code lives

- `apps/api/alchemy.run.ts`: the app stack (thin). `apps/api/infra/`: one module per concern (api, database, resources, observability, config, stages) plus custom resources (local Postgres, Doppler, Vercel). `infra/bootstrap.run.ts`: the admin-run account stack. `Env` is inferred from `infra/api.ts`. See [apps/api/README.md](apps/api/README.md).
- `apps/api/src/`: `worker.ts` (routing, auth gate, JSON routes, queue consumer), `agent/chat.ts`, `db/` (Drizzle schemas and clients), `lib/`, `types.ts` (response shapes web imports).
- `apps/web/src/`: TanStack routes; `lib/api.ts` is the only place web talks to the API.
- `apps/marketing/src/`: Astro pages.
- `scripts/`: `dev.ts` (the local stack), `doctor.ts`, `triage.ts`, `check-changed.ts`, `setup-worktree.ts`, `stage.sh`; pure logic in `*-lib.ts` with `node:test` tests.
- `.github/`: CI/CD, templates, the [triage playbook](.github/triage/PLAYBOOK.md). `.agents/skills/`: repo skills.

## Reference sources

`vp run sync:repos` clones Alchemy and Effect at the exact installed versions into `.repos/` (gitignored; worktrees link the main checkout's). Both are young, fast-moving betas: read their source, examples and tests there before guessing an API, and prefer their patterns over invented ones. Never edit or import from `.repos/`. Rerun after bumping either.

## Taste

- Web never touches Cloudflare bindings. It calls the API with a bearer token. Shared code comes from `@arkie/api/*` exports and must be import-free.
- The API authenticates with bearer tokens, never cookies. That is why CORS is `*`; adding cookie auth means revisiting CORS.
- Inferred types over annotations; `any` is the enemy. Types flow from `alchemy.run.ts` (bindings), Drizzle schemas (rows) and `apps/api/src/types.ts` (responses).
- Default to no comment. Write one for a constraint, an external quirk, or an invariant the code can't show.
- React effects are for synchronizing with something outside React. Derive in render; act in handlers.
- UI starts from references and an approved mock. Both apps' current screens are functional placeholders.
- If a rule here fights the task in front of you, say so and get a human sign-off before breaking it.

## Pitfalls

- Plain `vite build` in `apps/web` targets Node; CI and Vercel set `NITRO_PRESET=vercel`. Don't add `@cloudflare/vite-plugin` anywhere: the API is a plain Worker built by Alchemy.
- `@clerk/backend`'s `verifyToken` resolves to the JWT payload itself (not `{ data }`) and throws on a bad token; `userIdOf` maps a throw to "no user" (401/403, not 500). TypeScript 7 collapses Clerk's `JwtPayload` to `{}`, so `auth.ts` reads `sub` defensively.
- Clerk session tokens live about a minute: the chat asks for a fresh one per connect and per history load.
- `Access-Control-Allow-Headers: *` does not cover `Authorization`; it is listed by name.
- Postgres rejects an upsert batch touching one row twice; the queue consumer dedupes by chat id first.
- Astro 7 backgrounds `astro dev` when it detects an agent; the marketing script passes `--ignore-lock` to stay in the foreground (and to allow one server per worktree).
- A preview or `live_*` stage references prod's Neon project, so prod must be deployed before the first preview.
