import * as Axiom from "@alchemy.run/axiom";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { errorLogs, failedInvocations, LOGS, TRACES } from "./axiom.ts";
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

	// The monitors page whichever notifiers are configured: incident.io, email, or both.
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
	if (notifierIds.length > 0) {
		// Any thrown, resource-killed or 5xx invocation: rare enough at our traffic that one is worth a look.
		yield* Axiom.Monitor("WorkerFailures", {
			name: "Arkie API failures",
			type: "Threshold",
			aplQuery: `${failedInvocations} | summarize count() by bin_auto(_time)`,
			operator: "Above",
			threshold: 0,
			intervalMinutes: 5,
			rangeMinutes: 5,
			notifierIds,
		});
		yield* Axiom.Monitor("WorkerErrors", {
			name: "Arkie error logs",
			type: "Threshold",
			aplQuery: `${errorLogs} | where severity_text == "ERROR" | summarize count() by bin_auto(_time)`,
			operator: "Above",
			threshold: 10,
			intervalMinutes: 5,
			rangeMinutes: 5,
			notifierIds,
		});
	}

	return { logs: [logsOut.slug], traces: [tracesOut.slug] };
});
