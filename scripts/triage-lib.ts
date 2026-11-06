// Pure parts of scripts/triage.ts: turning Axiom's tabular APL results (prod's datasets) and, as a
// fallback, Workers Observability events into the one-line-per-row lists the triage context shows.

/** The body of POST https://api.axiom.co/v1/datasets/_apl?format=tabular. */
export type AxiomTabular = { tables?: Array<{ fields: Array<{ name: string }>; columns: unknown[][] }> };

/** The first table's rows as `- name=value name=value`, values flattened and cut to 300 chars. */
export function formatAxiomTable(result: AxiomTabular): string {
	const table = result.tables?.[0];
	const rows = table?.columns[0]?.length ?? 0;
	if (!table || rows === 0) return "(none)";
	return Array.from({ length: rows }, (_, i) => {
		const cells = table.fields.map(({ name }, c) => {
			const value = table.columns[c]?.[i];
			const text = typeof value === "string" ? value : JSON.stringify(value ?? null);
			return `${name}=${text.replace(/\s+/g, " ").slice(0, 300)}`;
		});
		return `- ${cells.join(" ")}`;
	}).join("\n");
}

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
