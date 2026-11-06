# Secrets

Doppler project `arkie` is the source of truth. Configs:

| Config         | Used by                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `dev`          | `vp run dev` (read by `scripts/dev.ts` through the Doppler CLI)          |
| `dev_personal` | your own overrides of `dev`, via `doppler setup`                         |
| `stg`          | `pr-*` previews and `live_*` stages (read by Alchemy's Doppler provider) |
| `prd`          | the `prod` stage                                                         |

Alchemy reads Doppler for every non-dev stage, ranked above the shell, so a stray local variable can't reach a deploy. CI therefore holds a single secret per environment: a Doppler service token as `DOPPLER_TOKEN`.

## What each config holds

"bootstrap" means `vp run infra:bootstrap` ([bootstrap.md](./bootstrap.md)) writes it; everything else an admin adds once in the Doppler dashboard.

| Secret                                                |   dev    |   stg    |   prd    | Source                                                                                                                                                                                                   |
| ----------------------------------------------------- | :------: | :------: | :------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`       |          |    ✓     |    ✓     | bootstrap (scoped deploy token, Souhardo02's account)                                                                                                                                                    |
| `NEON_API_KEY`                                        |          |    ✓     |    ✓     | Neon console > API keys                                                                                                                                                                                  |
| `CLERK_SECRET_KEY`                                    |    ✓     |    ✓     |    ✓     | Clerk > API keys (development instance until production has a domain)                                                                                                                                    |
| `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY` |    ✓     |          |    ✓     | Clerk; bootstrap copies `prd` and `stg` to Vercel                                                                                                                                                        |
| `ARKIE_ANTHROPIC_API_KEY`                             | optional | optional | optional | never name it `ANTHROPIC_API_KEY`; without it the chat uses the scripted Replay model                                                                                                                    |
| `VERCEL_TOKEN`, `VERCEL_TEAM_ID`                      |          | optional | optional | lets deploys point Vercel's `VITE_API_URL` at the stage's API                                                                                                                                            |
| `T3_MCP_URL`, `T3_MCP_TOKEN`                          | optional | optional | optional | both or neither                                                                                                                                                                                          |
| `T3_ALLOWED_USER_IDS`                                 | optional | optional | optional | comma-separated Clerk ids allowed to use T3 tools; empty means nobody                                                                                                                                    |
| `AXIOM_TOKEN`                                         |          |          | optional | Axiom API token (`xaat-`) that may create datasets, tokens, notifiers and monitors; turns on prod's export and alerts. Never set `AXIOM_ORG_ID` with it: that marks the token as personal and auth fails |
| `AXIOM_QUERY_TOKEN`                                   |    ✓     |    ✓     |          | bootstrap (read-only queries on prod's datasets, for `vp run triage` and doctor)                                                                                                                         |
| `ALERT_EMAILS`                                        |          |          | optional | comma-separated addresses the prod monitors email                                                                                                                                                        |
| `INCIDENT_IO_ALERT_URL`, `INCIDENT_IO_TOKEN`          |          |          | optional | incident.io > Alerts > Sources > HTTP                                                                                                                                                                    |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`               | optional |          | optional | bootstrap copies `prd` and `stg` to Vercel                                                                                                                                                               |

Never in Doppler: `DOPPLER_TOKEN` (each GitHub environment holds its own read-only service token, made by bootstrap) and `DOPPLER_ADMIN_TOKEN` (the admin's own CLI token, read at bootstrap time).

When you add a secret: put it in every config that needs it, add it to `.env.example` (dev-facing ones) and this table, and read it through `apps/api/infra/config.ts`.

## Vercel

Bootstrap copies `arkie-web`'s Clerk and PostHog vars from `prd` to Production and from `stg` to Preview; rerun it after changing one. The API stack sets `VITE_API_URL` (prod's API for Production and every Preview, a `pr-<n>` API for its own branch). Bootstrap also sets `arkie-marketing`'s `PUBLIC_APP_URL` and `SITE_URL`. No Doppler Vercel integration.

## Rules

- Never print, log or paste a secret value, including in PRs, issues and agent transcripts. `alchemy … --log-level debug` lists names only.
- Rotate by changing the value in Doppler and redeploying the stage (`workflow_dispatch` on CI/CD for prod). Alchemy rebinds a Worker when a value it reads changes.
