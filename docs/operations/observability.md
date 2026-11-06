# Observability and incidents

## Where signals go

| Signal              | Where                                                                                    | Stage                                  |
| ------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| API logs and traces | Cloudflare Workers Observability (dashboard > Workers > Observability)                   | every cloud stage                      |
| API logs and traces | Axiom datasets `arkie-logs`, `arkie-traces` (30-day retention), pushed by Cloudflare     | prod                                   |
| Alerts              | Axiom monitor "Arkie worker errors" (more than 10 ERROR logs in 5 minutes) → incident.io | prod, when the incident.io pair is set |
| Web and marketing   | Vercel > Project > Logs                                                                  | Vercel deployments                     |
| Product analytics   | PostHog                                                                                  | wherever `VITE_POSTHOG_KEY` is set     |

All of it is declared in `apps/api/alchemy.run.ts` (`Observability`). Change a retention, threshold or query there, not in the Axiom UI: the next deploy would revert a UI edit. Request URLs are logged without query strings (WebSocket connects carry the Clerk token in `?token=`).

## Reading logs

```sh
cd apps/api
vp exec alchemy logs --stage prod --tail      # live API logs (needs prd access)
```

Axiom, last hour of API errors:

```apl
['arkie-logs']
| where _time > ago(1h) and severity_text == "ERROR"
| project _time, body, attributes
| order by _time desc
```

One request end to end: find its trace id in `arkie-traces`, then `['arkie-traces'] | where trace_id == "<id>"`.

Local dev logs are the `[api]` lines of `vp run dev`.

## Incidents

An incident.io alert or a user report of broad breakage is an incident. In order:

1. **Acknowledge** in incident.io and declare an incident there if users are affected. Label any GitHub issue `incident`.
2. **Look at the last change first.** `git log origin/main -5`, the latest **CI/CD** run on `main`, the latest Vercel deployment. Most incidents follow a deploy.
3. **Mitigate before you diagnose.** If a deploy is the likely cause, roll back ([deploy.md](./deploy.md#rollback)), then confirm the error rate falls in Axiom.
4. **Diagnose** with the [triage playbook](../../.github/triage/PLAYBOOK.md): logs, traces, the chat or artifact the user hit, Neon.
5. **Fix forward** with a PR that has a failing test for the cause, then revert the rollback by shipping the fix.
6. **Write it up** in the incident.io postmortem: what users saw, timeline, cause, the fix, and what would have caught it earlier (a test, a monitor, a preview).

Data loss: Neon can branch the prod database from a point in time before the damage. Restore into a new branch, verify it read-only, and only then decide with a maintainer how to bring rows back. Never reset the prod branch in place.
