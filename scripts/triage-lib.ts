// Pure parts of scripts/triage.ts: the Workers Observability query for prod's warnings and errors,
// and the one-line-per-event summary it puts in the triage context.

/** One event from POST /accounts/:id/workers/observability/telemetry/query (view "events"). */
export type ObservabilityEvent = {
	timestamp: number;
	$metadata: { level?: string; trigger?: string; message?: string; error?: string; requestId?: string };
};

/** The query body: the prod Worker (its name carries a random suffix), warn and error only, newest first. */
export const prodErrorsQuery = (from: number, to: number, limit = 30) => ({
	queryId: "arkie-triage",
	timeframe: { from, to },
	view: "events",
	limit,
	parameters: {
		filterCombination: "and",
		filters: [
			{ key: "$metadata.service", operation: "regex", type: "string", value: "^arkie-api-prod" },
			{ key: "$metadata.level", operation: "regex", type: "string", value: "^(error|warn)$" },
		],
	},
});

/** `- <ISO time> <level> <trigger>: <message>`, one per event, oldest first, messages cut to 300 chars. */
export function formatEvents(events: ObservabilityEvent[]): string {
	if (events.length === 0) return "(none)";
	return events
		.toSorted((a, b) => a.timestamp - b.timestamp)
		.map(({ timestamp, $metadata: m }) => {
			const text = (m.error ?? m.message ?? "").replace(/\s+/g, " ").slice(0, 300);
			return `- ${new Date(timestamp).toISOString()} ${m.level ?? "?"} ${m.trigger ?? "?"}: ${text} (request ${m.requestId ?? "?"})`;
		})
		.join("\n");
}
