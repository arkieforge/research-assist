# Development

## First checkout

Run `vp run doctor` any time something seems off: it checks Node, vp, pnpm, dependencies, git hooks, the worktree setup, Docker, Doppler, the secrets, this checkout's ports and stage, and Docker leftovers from deleted worktrees, and prints the fix for each problem. `vp run doctor --fix` removes those leftovers.

You need [Vite+](https://viteplus.dev) (`curl -fsSL https://vite.plus | bash`), which brings the Node version in `.node-version` and pnpm, and Docker (Docker Desktop or OrbStack, running).

```sh
git clone <repo> arkie && cd arkie
vp run dev
```

The first `vp run dev` installs dependencies, then stops with the list of missing secrets if there are any. Get them one of two ways:

- **Team members:** `brew install dopplerhq/cli/doppler && doppler login`. `vp run dev` reads `arkie/dev` itself; no `.env` needed.
- **Everyone else:** `cp .env.example .env` and fill the two Clerk keys from a free Clerk dev instance. The model key is optional; without it the chat answers with a note.

Then `vp run dev` prints:

```
[dev] Starting:
  web        http://localhost:3000
  api        http://localhost:8787  (postgres :54329)
  marketing  http://localhost:4321
```

No Cloudflare, Neon or Axiom account is involved. The API runs in workerd with local D1, R2, Queues and Durable Objects; Postgres runs in Docker (`apps/api/infra/local-postgres.ts`) and gets `migrations/neon` applied; Alchemy keeps this stage's state in `apps/api/.alchemy/`.

In T3 Code the same is one click: the **Dev** action. New worktrees run **Setup** automatically.

## What `vp run dev` does

`scripts/dev.ts`, in order: install if `node_modules` is missing; load Doppler `arkie/dev` (when the CLI is logged in), then `.env`, then your shell (later wins); check Docker and the Clerk keys; pick ports; start `apps/api` (`alchemy dev --stage dev_<user>_<checkout>`), `apps/web` (Vite) and `apps/marketing` (Astro) with prefixed output; on Ctrl-C stop all three by the process groups it started. `--only api,web` runs a subset.

### Free model turns

Without `ARKIE_ANTHROPIC_API_KEY`, the chat uses **Replay (dev)** (`apps/api/src/agent/replay-model.ts`): a scripted model that streams word by word and calls the real `render_html` tool when you ask for a chart, table or diagram. The socket, persistence, R2/D1 and the sidebar queue all run for real, for free. Set the key only when the change depends on what a real model says.

### Testing from your phone

`vp run dev --share` also serves the three apps over this machine's tailnet with HTTPS, at local port + 10000 (`https://<machine>.<tailnet>.ts.net:13000` for web), and points the apps at those URLs instead of localhost. Open the printed web URL on any device in your tailnet. It refuses ports that are already served and removes only its own entries on exit. Needs the Tailscale CLI with MagicDNS and HTTPS certificates on.

It also wires the apps to each other: `VITE_API_URL` points web at this checkout's API, `PUBLIC_APP_URL` points marketing at this web. Don't set those yourself.

## Worktrees and ports

Every checkout is its own stage (`scripts/stage.sh`), so worktrees never share local data or cloud resources. The main checkout keeps the ports above; a worktree gets a stable offset (1 to 399) derived from its path, shifted further while any of its ports is taken. Read the real ones from the banner.

`scripts/setup-worktree.ts` (T3's Setup action, or `vp run setup`) installs with a frozen lockfile and symlinks the main checkout's `.env`, never replacing a real file.

Before deleting a worktree: `vp run dev:destroy` (local resources, including the Postgres container and volume) and, if you deployed it, `vp run api:destroy`.

## T3 Code

`t3.json` declares the project's actions and makes new threads start in a fresh worktree. T3 offers them under "From t3.json" in the scripts menu; import them once per machine (they are already saved on the Mac mini's Arkie project).

| Action                  | Runs                                  | When                                                                                              |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Setup                   | `node scripts/setup-worktree.ts`      | automatically when a worktree is created (the agent starts meanwhile and waits on `.t3/` markers) |
| Dev                     | `vp run dev`                          | the one-click stack; stopped when the thread settles                                              |
| Dev: API only           | `vp run dev --only api`               | backend work without web and marketing                                                            |
| Dev: share on tailnet   | `vp run dev --share`                  | test from your phone                                                                              |
| Doctor                  | `vp run doctor`                       | when setup or `vp run dev` misbehaves                                                             |
| Check changed           | `vp run check:changed`                | before pushing: CI's checks for what you touched                                                  |
| Check                   | `vp run check`                        | everything, as CI runs it                                                                         |
| Format                  | `vp check --fix`                      |                                                                                                   |
| DB: generate migrations | `vp run db:generate`                  | after editing a schema in `apps/api/src/db/`                                                      |
| Reset local data        | `vp run dev:destroy --yes --no-input` | automatically when a worktree thread settles; manually to start clean                             |

A worktree thread's life: T3 creates the worktree from the default branch (so new tooling only reaches worktrees once it is committed), Setup installs and links the main checkout's `.env`, **Dev** gives it its own stage, ports and Postgres, and when the thread settles T3 stops Dev and runs Reset, which removes the stage's Docker container, volume and local state. The main checkout never runs settle actions, so its local data stays.

## Checks

`vp run check:changed` runs CI's gates for your branch only: lint on the changed files, then typecheck, tests and builds for the packages they affect (an `apps/api` change also checks `apps/web`, which imports it; root config checks everything). It compares against the merge base with `origin/main`, or a ref you pass, and counts uncommitted and untracked files. Steps run side by side and print their output only when they fail. `vp run check` runs everything. CI runs everything either way.

## Triage

`vp run triage "what went wrong"` starts a coding-agent CLI in your terminal (the first of `claude` and `codex` it finds, or `--agent <name>`) on the [triage playbook](../../.github/triage/PLAYBOOK.md), with a context file of machine and deploy facts (recent prod deploys, open incidents, `vp run doctor`) in `.t3/triage/`. In T3 Code, run `vp run triage --print` and paste the prompt into a new thread instead. The agent asks before it changes anything or files an issue.

## Reference sources

`vp run sync:repos` clones Alchemy and Effect at the installed versions into `.repos/` for reading (about 300 MB, gitignored, shared with worktrees by symlink). Rerun after a version bump.

## Local data

Postgres data persists in a Docker volume per stage, so restarts keep your chats. D1, R2, queue and Durable Object data live under `apps/api/.alchemy/local`. `vp run dev:destroy` resets all of it; the next `vp run dev` starts empty and re-applies migrations.

Inspect Postgres: `docker exec -it $(docker ps -qf name=arkie-postgres) psql -U arkie arkie`.

## Schema changes

Edit `apps/api/src/db/neon.ts` (Postgres) or `d1.ts` (D1), then `vp run db:generate` and commit the generated folder under `apps/api/migrations/`. Local dev applies it on the next `vp run dev`; deploys apply it before the Worker goes live. Never edit an applied migration; add a new one.

## Troubleshooting

| Symptom                                   | Fix                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Docker is not running`                   | Start Docker Desktop or OrbStack.                                                                                        |
| `Missing secrets: CLERK_…`                | Doppler login (team) or `.env` (see above).                                                                              |
| API boots but `/chats` is 500             | Postgres not ready or migrations failed: scroll the `[api]` output for `[Migrations]`; `vp run dev:destroy` and retry.   |
| `dev_* stages run only under alchemy dev` | You ran `alchemy deploy` on a dev stage. Use `vp run api:deploy`.                                                        |
| Marketing exits right away                | Astro 7 backgrounds itself for agents; the script's `--ignore-lock` prevents it. Make sure you didn't drop it.           |
| Port already in use                       | Another stack runs. `vp run dev` shifts automatically; a fixed `WEB_PORT` etc. in your shell disables that for that app. |
| Anything else                             | `vp run doctor`.                                                                                                         |
