# Deploys and stages

## What deploys where

| App              | Platform             | How                                                              |
| ---------------- | -------------------- | ---------------------------------------------------------------- |
| `apps/api`       | Cloudflare (Alchemy) | `.github/workflows/deploy-api.yml` on every push to `main`       |
| `apps/web`       | Vercel               | Vercel Git integration: production from `main`, a preview per PR |
| `apps/marketing` | Vercel               | same                                                             |

## API stages

| Stage                    | Made by             | State                  | Postgres                            | Secrets                        |
| ------------------------ | ------------------- | ---------------------- | ----------------------------------- | ------------------------------ |
| `dev_<user>_<checkout>`  | `vp run dev`        | `apps/api/.alchemy/`   | Docker                              | shell / `.env` / Doppler `dev` |
| `pr-<n>`                 | `preview:api` label | Cloudflare state store | Neon branch of prod's project       | Doppler `stg`                  |
| `live_<user>_<checkout>` | `vp run api:deploy` | Cloudflare state store | Neon branch of prod's project       | Doppler `stg`                  |
| `prod`                   | CI on `main`        | Cloudflare state store | the Neon project's protected branch | Doppler `prd`                  |

Prod owns the Neon project and retains it: deleting the code or destroying the stage never deletes the database. Every other cloud stage gets its own copy-on-write branch, created and destroyed with the stage. Only prod gets the Axiom export and incident.io alerts.

The Cloudflare state store (a small Worker + Durable Object Alchemy deploys into the account on first use) is shared by every machine and CI, so anyone with access can destroy a stage they didn't create, by name.

## First prod deploy

1. An admin runs `vp run infra:bootstrap` ([bootstrap.md](./bootstrap.md)): the deploy token goes into Doppler, the GitHub environments get their Doppler tokens, the Vercel projects exist.
2. Add the rest of [secrets.md](./secrets.md) to Doppler `prd` and `stg` (Neon, Clerk, model key, Axiom).
3. Push to `main` (or run **Deploy API** manually). The job deploys `--stage prod`, sets the commit status `API deploy / prod`, and (with `VERCEL_TOKEN` in Doppler) points the web project's production `VITE_API_URL` at the Worker.

## PR previews

Label a same-repo PR `preview:api`. The **API preview** workflow waits for approval in the `preview` environment (it runs PR code with real credentials), deploys `pr-<n>`, and comments the Worker URL. Every push redeploys. Removing the label or closing the PR runs **API preview cleanup** from the default branch, which destroys the stage and removes the label; a nightly run retries any that failed.

The `preview` and `preview-cleanup` environments hold a Doppler `stg` service token as `DOPPLER_TOKEN` (bootstrap sets them). Prod must be deployed once before the first preview (previews branch its Neon project).

Vercel builds its own web preview for every PR. With `VERCEL_TOKEN` in Doppler `stg`, the `pr-<n>` deploy sets `VITE_API_URL` for that PR's branch, so the web preview after the next push talks to the PR's own API.

## Vercel projects

Bootstrap creates both (with `VERCEL_TOKEN`); otherwise import the repo twice by hand with these settings:

| Project           | Root Directory   | Framework preset                            |
| ----------------- | ---------------- | ------------------------------------------- |
| `arkie-web`       | `apps/web`       | Other (Nitro writes Vercel's output itself) |
| `arkie-marketing` | `apps/marketing` | Astro                                       |

Turn on "Skip deployments when there are no changes to the root directory or its dependencies" in both. Environment variables come from Doppler's Vercel integration (see [secrets.md](./secrets.md)).

## Rollback

- **API, now:** Cloudflare dashboard > Workers > the prod Worker > Deployments > roll back to the previous version. Instant, no build.
- **API, durable:** revert the PR on `main`; the deploy job ships the revert. A rollback in the dashboard is overwritten by the next deploy, so always follow with the revert.
- **Web, marketing:** Vercel > Deployments > the last good one > Promote to Production, then revert on `main`.
- **Database:** migrations run forward only. Ship a new migration that undoes the change. Neon's point-in-time restore (a branch from a timestamp) is the last resort for data loss; see [observability.md](./observability.md#incidents).
