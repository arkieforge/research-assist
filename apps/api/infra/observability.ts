import * as Axiom from "@alchemy.run/axiom";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { chatTurns, errorLogs, failedInvocations, heartbeats, indexWrites, LOGS, requests, TRACES } from "./axiom.ts";
import { optional, optionalPair } from "./config.ts";

/**
 * Prod only: ship Workers logs and traces to Axiom, and alert on errors (incident.io and/or ALERT_EMAILS).
 * Cloudflare pushes the telemetry (no exporter code in the Worker); other stages keep
 * Cloudflare's own Workers Logs. Returns the export slugs the Worker opts into.
 */
export const Observability = Effect.gen(function* () {
	const logs = yield* Axiom.Dataset("Logs", { name: LOGS, kind: "otel:logs:v1", retentionDays: 30 });
	const traces = yield* Axiom.Dataset("Traces", { name: TRACES, kind: "otel:traces:v1", retentionDays: 30 });
	const ingest = yield* Axiom.ApiToken("Ingest", {
		name: "arkie-worker-ingest",
		description: "Cloudflare Workers Observability export",
		datasetCapabilities: { [LOGS]: { ingest: ["create"] }, [TRACES]: { ingest: ["create"] } },
	});
	const bearer = Output.map(ingest.token, (t) => Redacted.make(`Bearer ${Redacted.value(t)}`));
	const logsOut = yield* Cloudflare.Workers.ObservabilityDestination("AxiomLogs", {
		url: logs.otelLogsEndpoint,
		headers: { authorization: bearer, "x-axiom-dataset": logs.name },
		logpushDataset: "opentelemetry-logs",
	});
	const tracesOut = yield* Cloudflare.Workers.ObservabilityDestination("AxiomTraces", {
		url: traces.otelTracesEndpoint,
		headers: { authorization: bearer, "x-axiom-dataset": traces.name },
		logpushDataset: "opentelemetry-traces",
	});

	// Pages go to whichever notifiers are configured: incident.io, email, or both.
	const notifierIds: Output.Output<string>[] = [];
	const incident = yield* optionalPair("INCIDENT_IO_ALERT_URL", "INCIDENT_IO_TOKEN");
	if (Option.isSome(incident)) {
		const [url, token] = incident.value;
		const pager = yield* Axiom.Notifier("IncidentIo", {
			name: "incident.io",
			properties: {
				customWebhook: {
					url,
					headers: { "Content-Type": "application/json" },
					secretHeaders: { Authorization: `Bearer ${token}` },
					body: '{"title": "{{.Monitor.Name}}", "status": "firing", "deduplication_key": "{{.Monitor.ID}}"}',
				},
			},
		});
		notifierIds.push(pager.id);
	}
	const emails = yield* optional("ALERT_EMAILS");
	if (Option.isSome(emails)) {
		const mail = yield* Axiom.Notifier("AlertEmail", {
			name: "Arkie alerts (email)",
			properties: { email: { emails: emails.value.split(",").map((e) => e.trim()) } },
		});
		notifierIds.push(mail.id);
	}
	// Pages go to the notifiers and need two failing runs in a row (one for the heartbeat, whose window
	// already spans three beats). Warnings notify nobody: they show in Axiom, the dashboard and triage.
	// Each description is the healthy baseline; docs/operations/observability.md says what to do.
	const monitors = [
		{
			id: "WorkerFailures",
			page: true,
			name: "Arkie API failures",
			description: "Healthy: 0. Invocations that threw, ran out of CPU or memory, or answered 5xx.",
			aplQuery: `${failedInvocations} | summarize count() by bin_auto(_time)`,
			operator: "Above",
			threshold: 0,
			rangeMinutes: 5,
		},
		{
			id: "TurnFailures",
			page: true,
			name: "Arkie chat turns failing",
			description: "Healthy: 0. Turns whose model stream errored (the user saw a broken reply).",
			aplQuery: `${chatTurns} | where outcome == "error" | summarize count() by bin_auto(_time)`,
			operator: "Above",
			threshold: 0,
			rangeMinutes: 5,
		},
		{
			id: "Heartbeat",
			page: true,
			name: "Arkie heartbeat missing",
			description: "Healthy: 3 per 15 minutes. None means the Worker isn't running or its logs stopped reaching Axiom.",
			aplQuery: `${heartbeats} | summarize count() by bin_auto(_time)`,
			operator: "Below",
			threshold: 1,
			rangeMinutes: 15,
			alertOnNoData: true,
			triggerFromNRuns: 1,
		},
		{
			id: "WorkerErrors",
			page: false,
			name: "Arkie error logs",
			description: "Healthy: under 1 per 5 minutes. console.error from the Worker, its libraries included.",
			aplQuery: `${errorLogs} | where severity_text == "ERROR" | summarize count() by bin_auto(_time)`,
			operator: "Above",
			threshold: 10,
			rangeMinutes: 5,
		},
		{
			id: "SlowFirstToken",
			page: false,
			name: "Arkie slow first token",
			description: "Healthy: p95 under 3 s on a real model. Time from a turn's start to its first streamed text.",
			aplQuery: `${chatTurns} | where isnotnull(firstTokenMs) | summarize percentile(firstTokenMs, 95) by bin_auto(_time)`,
			operator: "Above",
			threshold: 8_000,
			rangeMinutes: 30,
		},
		{
			id: "IndexLag",
			page: false,
			name: "Arkie chat index lag",
			description: "Healthy: p95 under 5 s. How stale a chat event is when the queue consumer writes its sidebar row.",
			aplQuery: `${indexWrites} | summarize percentile(lagMs, 95) by bin_auto(_time)`,
			operator: "Above",
			threshold: 30_000,
			rangeMinutes: 15,
		},
	] as const;
	for (const { id, page, ...monitor } of monitors) {
		yield* Axiom.Monitor(id, {
			type: "Threshold",
			intervalMinutes: 5,
			triggerFromNRuns: page ? 2 : 1,
			resolvable: true,
			...monitor,
			notifierIds: page ? notifierIds : [],
		});
	}

	yield* Axiom.View("RecentRequests", {
		name: "arkie-recent-requests",
		description: "The last 200 API requests, newest first. A trace_id opens the request's spans in arkie-traces.",
		datasets: [LOGS],
		aplQuery: `${requests} | project _time, method, path, status, trace_id | order by _time desc | take 200`,
	});
	yield* Axiom.View("RecentTurns", {
		name: "arkie-recent-turns",
		description: "The last 200 chat turns: outcome, model, timing, tools and errors.",
		datasets: [LOGS],
		aplQuery: `${chatTurns} | project _time, outcome, model, ms, firstTokenMs, outputTokens, toolCalls = e.toolCalls, error, chat | order by _time desc | take 200`,
	});

	const charts: Axiom.DashboardProps["dashboard"]["charts"] = [
		{
			id: "requests",
			name: "Requests by status",
			type: "TimeSeries",
			query: { apl: `${requests} | summarize count() by bin_auto(_time), status = tostring(status)` },
		},
		{
			id: "failures",
			name: "Failed invocations",
			type: "TimeSeries",
			query: { apl: `${failedInvocations} | summarize count() by bin_auto(_time), outcome` },
		},
		{
			id: "turns",
			name: "Chat turns by outcome",
			type: "TimeSeries",
			query: { apl: `${chatTurns} | summarize count() by bin_auto(_time), outcome` },
		},
		{
			id: "first-token",
			name: "Time to first token (ms)",
			type: "TimeSeries",
			query: {
				apl: `${chatTurns} | summarize p50 = percentile(firstTokenMs, 50), p95 = percentile(firstTokenMs, 95) by bin_auto(_time)`,
			},
		},
		{
			id: "index-lag",
			name: "Chat index lag p95 (ms)",
			type: "TimeSeries",
			query: { apl: `${indexWrites} | summarize percentile(lagMs, 95) by bin_auto(_time)` },
		},
		{
			id: "heartbeat",
			name: "Heartbeats",
			type: "TimeSeries",
			query: { apl: `${heartbeats} | summarize count() by bin_auto(_time)` },
		},
		{
			id: "recent-failures",
			name: "Recent failed invocations",
			type: "Table",
			query: { apl: `${failedInvocations} | project _time, outcome, status, trace_id | order by _time desc | take 50` },
		},
		{
			id: "recent-errors",
			name: "Recent error logs",
			type: "Table",
			query: { apl: `${errorLogs} | project _time, severity_text, body, trace_id | order by _time desc | take 50` },
		},
	];
	yield* Axiom.Dashboard("Health", {
		dashboard: {
			name: "Arkie health",
			owner: "",
			description:
				"Prod API: requests, failures, chat turns, the chat index and the heartbeat. Alerts: docs/operations/observability.md.",
			charts,
			// Two charts per row on a 12-column grid.
			layout: charts.map((chart, i) => ({ i: chart.id, x: (i % 2) * 6, y: Math.floor(i / 2) * 5, w: 6, h: 5 })),
			refreshTime: 60,
			schemaVersion: 2,
			timeWindowStart: "qr-now-24h",
			timeWindowEnd: "qr-now",
		},
	});

	return { logs: [logsOut.slug], traces: [tracesOut.slug] };
});
