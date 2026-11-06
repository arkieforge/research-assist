import * as Axiom from "@alchemy.run/axiom";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { optionalPair } from "./config.ts";

/**
 * Prod only: ship Workers logs and traces to Axiom, and page incident.io on errors.
 * Cloudflare pushes the telemetry (no exporter code in the Worker); other stages keep
 * Cloudflare's own Workers Logs. Returns the export slugs the Worker opts into.
 */
export const Observability = Effect.gen(function* () {
	const logs = yield* Axiom.Dataset("Logs", { name: "arkie-logs", kind: "otel:logs:v1", retentionDays: 30 });
	const traces = yield* Axiom.Dataset("Traces", { name: "arkie-traces", kind: "otel:traces:v1", retentionDays: 30 });
	const ingest = yield* Axiom.ApiToken("Ingest", {
		name: "arkie-worker-ingest",
		description: "Cloudflare Workers Observability export",
		datasetCapabilities: { "arkie-logs": { ingest: ["create"] }, "arkie-traces": { ingest: ["create"] } },
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
		yield* Axiom.Monitor("WorkerErrors", {
			name: "Arkie worker errors",
			type: "Threshold",
			aplQuery: "['arkie-logs'] | where severity_text == 'ERROR' | summarize count() by bin_auto(_time)",
			operator: "Above",
			threshold: 10,
			intervalMinutes: 5,
			rangeMinutes: 5,
			notifierIds: [pager.id],
		});
	}

	return { logs: [logsOut.slug], traces: [tracesOut.slug] };
});
