# Observability and incidents

## Where signals go

| Signal              | Where                                                                                   | Stage                                  |
| ------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| API logs and traces | Cloudflare Workers Observability (dashboard > Workers > Observability)                  | every cloud stage                      |
| API logs and traces | Axiom datasets `arkie-logs`, `arkie-traces` (30-day retention), pushed by Cloudflare    | prod                                   |
| Alerts              | Axiom monitors "Arkie API failures" (any) and "Arkie error logs" (over 10 in 5 minutes) | prod, with incident.io or ALERT_EMAILS |
| Web and marketing   | Vercel > Project > Logs (the Hobby plan has no log drains, so not in Axiom)             | Vercel deployments                     |
| Product analytics   | PostHog                                                                                 | wherever `VITE_POSTHOG_KEY` is set     |

All of it is declared in `apps/api/infra/observability.ts`, with the shared queries in `apps/api/infra/axiom.ts`. Change a retention, threshold or query there, not in the Axiom UI: the next deploy would revert a UI edit. Request URLs are logged without query strings (WebSocket connects carry the Clerk token in `?token=`).

## Reading logs

`vp run triage` already puts prod's last 24 hours in its context file: requests by status, failed invocations and `console.error`/`warn`. It uses bootstrap's read-only `AXIOM_QUERY_TOKEN` from Doppler `stg`. `vp run doctor` checks that token.

What Cloudflare exports: request logs have no `severity_text` (only `console` output does). A failure shows on the request's root span in `arkie-traces`, as `attributes.custom['cloudflare.outcome']` (`exception`, `exceededCpu`, …) or a 5xx `attributes.http.response.status_code`. `trace_id` joins a span to its request log, which has `attributes.url.path`.

```apl
['arkie-traces']
| extend outcome = tostring(['attributes.custom']['cloudflare.outcome']), status = toint(['attributes.http.response.status_code'])
| where _time > ago(1h) and outcome != "" and (outcome != "ok" or status >= 500)
| project _time, outcome, status, trace_id

['arkie-logs'] | where trace_id == "<id>" | project _time, body, ['attributes.url.path'], severity_text
```

```sh
cd apps/api
vp exec alchemy logs --stage prod --tail      # live API logs (needs prd access)
```

Local dev logs: `.t3/logs/<app>.log` in the checkout, written by `vp run dev`.

## Incidents

An incident.io alert or a user report of broad breakage is an incident. In order:

1. **Acknowledge** in incident.io and declare an incident there if users are affected. Label any GitHub issue `incident`.
2. **Look at the last change first.** `git log origin/main -5`, the latest **CI/CD** run on `main`, the latest Vercel deployment. Most incidents follow a deploy.
3. **Mitigate before you diagnose.** If a deploy is the likely cause, roll back ([deploy.md](./deploy.md#rollback)), then confirm the error rate falls in Axiom.
4. **Diagnose** with the [triage playbook](../../.github/triage/PLAYBOOK.md): logs, traces, the chat or artifact the user hit, Neon.
5. **Fix forward** with a PR that has a failing test for the cause, then revert the rollback by shipping the fix.
6. **Write it up** in the incident.io postmortem: what users saw, timeline, cause, the fix, and what would have caught it earlier (a test, a monitor, a preview).

Data loss: Neon can branch the prod database from a point in time before the damage. Restore into a new branch, verify it read-only, and only then decide with a maintainer how to bring rows back. Never reset the prod branch in place.
