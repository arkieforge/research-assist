# Observability and incidents

## Where signals go

| Signal              | Where                                                                                 | Stage                              |
| ------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| API logs and traces | Cloudflare Workers Observability (dashboard > Workers > Observability)                | every cloud stage                  |
| API logs and traces | Axiom datasets `arkie-logs`, `arkie-traces` (30-day retention), pushed by Cloudflare  | prod                               |
| Chat turns, index   | `chat.turn` and `chat.index` events in `arkie-logs` (`src/lib/telemetry.ts`)          | prod (Workers Logs elsewhere)      |
| Dashboard, views    | Axiom dashboard "Arkie health"; views `arkie-recent-requests`, `arkie-recent-turns`   | prod                               |
| Alerts              | Axiom monitors, [below](#alerts); pages email ALERT_EMAILS (and incident.io when set) | prod                               |
| Web errors          | PostHog > Error tracking (`capture_exceptions`)                                       | wherever `VITE_POSTHOG_KEY` is set |
| Web and marketing   | Vercel > Project > Logs (the Hobby plan has no log drains, so not in Axiom)           | Vercel deployments                 |
| Product analytics   | PostHog                                                                               | wherever `VITE_POSTHOG_KEY` is set |

All of it is declared in `apps/api/infra/observability.ts`, with the shared queries in `apps/api/infra/axiom.ts`. Change a retention, threshold, query or chart there, not in the Axiom UI: the next deploy would revert a UI edit. Request URLs are logged without query strings (WebSocket connects carry the Clerk token in `?token=`).

## Reading logs

Start at the "Arkie health" dashboard. `vp run triage` puts the same last 24 hours in its context file: requests by status, failed invocations, `console.error`/`warn`, chat turns by model and the failed ones, the heartbeat and chat index lag. It uses bootstrap's read-only `AXIOM_QUERY_TOKEN` from Doppler `stg`. `vp run doctor` checks that token.

What Cloudflare exports: request logs have no `severity_text` (only `console` output does). The Worker's own events are JSON log bodies that start with `{"event":"…"`; `axiom.ts` parses them. A failure shows on the request's root span in `arkie-traces`, as `attributes.custom['cloudflare.outcome']` (`exception`, `exceededCpu`, …) or a 5xx `attributes.http.response.status_code`. `trace_id` joins a span to its request log, which has `attributes.url.path`.

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

## Alerts

Pages email `ALERT_EMAILS` (and incident.io when its pair is set) after two failing 5-minute runs in a row. Warnings notify nobody: check them on the dashboard or in triage. Each monitor's description in Axiom gives its healthy baseline.

**Arkie API failures** (page, healthy 0). Invocations that threw, ran out of CPU or memory, or answered 5xx. Open "Recent failed invocations" on the dashboard, take a `trace_id` to `arkie-logs` for the path, then the last deploy. A burst right after a deploy means roll back first.

**Arkie chat turns failing** (page, healthy 0). Model streams that errored, so users saw a broken reply. `arkie-recent-turns` shows `error` and the `chat`. One model at a time failing is usually the provider (rate limit, outage, bad key); every turn failing after a deploy is ours.

**Arkie heartbeat missing** (page, healthy 3 per 15 minutes). The prod cron's `heartbeat` stopped. Either the Worker is down (`GET /chats` without a token should answer 401) or telemetry stopped reaching Axiom: check the Worker's observability destinations in Cloudflare and the `arkie-worker-ingest` token in Axiom. Ingest outages hide every other alert, so treat this one as urgent.

**Arkie error logs** (warning, healthy under 1 per 5 minutes). `console.error` spikes, often a library logging a handled failure. Read the bodies on the dashboard; if one repeats, fix or downgrade it.

**Arkie slow first token** (warning, healthy p95 under 3 s on a real model). Usually the model provider; compare models in `arkie-recent-turns`. Slow T3 tool connects (`waitForMcpConnections`) also delay the first token.

**Arkie chat index lag** (warning, healthy p95 under 5 s). The sidebar trails chats. Look for queue retries (`Dropped message` in `arkie-logs`) and slow Neon or Hyperdrive.

## Incidents

A page ([Alerts](#alerts)) or a user report of broad breakage is an incident. In order:

1. **Acknowledge** the page (in incident.io, when set up, declare an incident if users are affected). Label any GitHub issue `incident`.
2. **Look at the last change first.** `git log origin/main -5`, the latest **CI/CD** run on `main`, the latest Vercel deployment. Most incidents follow a deploy.
3. **Mitigate before you diagnose.** If a deploy is the likely cause, roll back ([deploy.md](./deploy.md#rollback)), then confirm the error rate falls in Axiom.
4. **Diagnose** with the [triage playbook](../../.github/triage/PLAYBOOK.md): logs, traces, the chat or artifact the user hit, Neon.
5. **Fix forward** with a PR that has a failing test for the cause, then revert the rollback by shipping the fix.
6. **Write it up** in the incident.io postmortem: what users saw, timeline, cause, the fix, and what would have caught it earlier (a test, a monitor, a preview).

Data loss: Neon can branch the prod database from a point in time before the damage. Restore into a new branch, verify it read-only, and only then decide with a maintainer how to bring rows back. Never reset the prod branch in place.
