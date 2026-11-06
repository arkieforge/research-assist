// Axiom queries over what Cloudflare exports from the prod Worker (observability.ts), shared by the
// prod monitors and scripts/triage.ts. Keep this file free of imports: scripts load it with plain Node.
//
// What the export looks like: request logs carry no severity_text (only console output does), and a
// failed invocation shows on its root span in arkie-traces as cloudflare.outcome or a 5xx status.
// Root spans have an outcome; subrequest spans don't. trace_id joins a span to its request log
// (which has attributes.url.path).

export const LOGS = "arkie-logs";
export const TRACES = "arkie-traces";

const OUTCOME = "tostring(['attributes.custom']['cloudflare.outcome'])";
const STATUS = "toint(['attributes.http.response.status_code'])";
// Cloudflare's invocation outcomes that mean our code failed (not "ok" or a client "canceled").
const FAILED = '"exception", "exceededCpu", "exceededMemory", "exceededResources", "scriptNotFound", "unknown"';

/** Root spans of invocations that threw, ran out of resources, or answered 5xx. */
export const failedInvocations = `['${TRACES}'] | extend outcome = ${OUTCOME}, status = ${STATUS} | where outcome != "" and (outcome in (${FAILED}) or status >= 500)`;

/** console.error and console.warn output from the Worker. */
export const errorLogs = `['${LOGS}'] | where severity_text in ("ERROR", "WARN")`;

/** Request logs (one per HTTP invocation) with their status, method and path. */
export const requests = `['${LOGS}'] | extend status = ${STATUS}, method = tostring(['attributes.http.request.method']), path = tostring(['attributes.url.path']) | where isnotnull(status)`;

/** Request counts by status code, for a quick read of overall health. */
export const statusCounts = `${requests} | summarize requests = count() by status`;

/** One kind of structured event from src/lib/telemetry.ts (its body is the JSON, `event` first). */
const events = (name: string) =>
	`['${LOGS}'] | where body startswith '{"event":"${name}"' | extend e = parse_json(body)`;

/** Chat turns: outcome, model, total and first-token milliseconds, tokens, the chat's instance name. */
export const chatTurns = `${events("chat.turn")} | extend outcome = tostring(e.outcome), model = tostring(e.model), ms = toreal(e.ms), firstTokenMs = toreal(e.firstTokenMs), outputTokens = toint(e.outputTokens), chat = tostring(e.chat), error = tostring(e.error)`;

/** Chat index writes by the queue consumer, with how stale the oldest event was. */
export const indexWrites = `${events("chat.index")} | extend rows = toint(e.rows), lagMs = toreal(e.lagMs)`;

/** Prod's 5-minute cron. None in 15 minutes means the Worker or its export is down. */
export const heartbeats = events("heartbeat");
