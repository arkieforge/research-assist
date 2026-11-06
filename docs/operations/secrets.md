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

| Secret                                                |   dev    |   stg    |   prd    | Source                                                                                |
| ----------------------------------------------------- | :------: | :------: | :------: | ------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`       |          |    ✓     |    ✓     | bootstrap (scoped deploy token, Souhardo02's account)                                 |
| `NEON_API_KEY`                                        |          |    ✓     |    ✓     | Neon console > API keys                                                               |
| `CLERK_SECRET_KEY`                                    |    ✓     |    ✓     |    ✓     | Clerk > API keys (development instance until production has a domain)                 |
| `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY` |    ✓     |          |    ✓     | Clerk; `prd` copies go to Vercel through bootstrap                                    |
| `ARKIE_ANTHROPIC_API_KEY`                             | optional | optional | optional | never name it `ANTHROPIC_API_KEY`; without it the chat uses the scripted Replay model |
| `VERCEL_TOKEN`, `VERCEL_TEAM_ID`                      |          | optional | optional | lets deploys point Vercel's `VITE_API_URL` at the stage's API                         |
| `T3_MCP_URL`, `T3_MCP_TOKEN`                          | optional | optional | optional | both or neither                                                                       |
| `T3_ALLOWED_USER_IDS`                                 | optional | optional | optional | comma-separated Clerk ids allowed to use T3 tools; empty means nobody                 |
| `AXIOM_TOKEN`, `AXIOM_ORG_ID`                         |          |          | optional | turns on prod's Axiom export (and the incident.io monitor)                            |
| `INCIDENT_IO_ALERT_URL`, `INCIDENT_IO_TOKEN`          |          |          | optional | incident.io > Alerts > Sources > HTTP                                                 |
| `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`               | optional |          | optional | `prd` copies go to Vercel through bootstrap                                           |

Never in Doppler: `DOPPLER_TOKEN` (each GitHub environment holds its own read-only service token, made by bootstrap) and `DOPPLER_ADMIN_TOKEN` (the admin's own CLI token, read at bootstrap time).

When you add a secret: put it in every config that needs it, add it to `.env.example` (dev-facing ones) and this table, and read it through `apps/api/infra/config.ts`.

## Vercel

Install Doppler's Vercel integration and sync:

| Doppler config | Vercel project | Vercel environment |
| -------------- | -------------- | ------------------ |
| `prd`          | `arkie-web`    | Production         |
| `stg`          | `arkie-web`    | Preview            |

`arkie-web` needs `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`. `arkie-marketing` needs only `PUBLIC_APP_URL` and `SITE_URL`; set those in Vercel directly.

## Rules

- Never print, log or paste a secret value, including in PRs, issues and agent transcripts. `alchemy … --log-level debug` lists names only.
- Rotate by changing the value in Doppler and redeploying the stage (`workflow_dispatch` on Deploy API for prod). Alchemy rebinds a Worker when a value it reads changes.
