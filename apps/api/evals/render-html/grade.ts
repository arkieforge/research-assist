// Grades one model reply against a case: did it render when it should, stay in prose when it
// should, and keep the page self-contained as SYSTEM asks (no external requests except cdnjs).

export type Expect = "render" | "prose";
export type Reply = { text: string; toolCalls: Array<{ toolName: string; input: unknown }> };
export type Grade = { pass: boolean; reasons: string[] };

const ALLOWED_HOST = "cdnjs.cloudflare.com";
// URLs a browser would fetch on its own: src/href attributes, CSS url() and @import, fetch/XHR targets.
const FETCHED =
	/(?:\b(?:src|href)\s*=\s*["']?|url\(\s*["']?|@import\s+["']|fetch\(\s*["'])(https?:)?\/\/([^/"'\s)]+)/gi;

/** Hosts an HTML page would request, other than the allowed CDN. */
export function externalHosts(html: string): string[] {
	const hosts = [...html.matchAll(FETCHED)].map((m) => (m[2] ?? "").toLowerCase());
	return [...new Set(hosts.filter((host) => host !== ALLOWED_HOST))];
}

export function grade(expect: Expect, reply: Reply): Grade {
	const renders = reply.toolCalls.filter((call) => call.toolName === "render_html");
	const reasons: string[] = [];
	if (expect === "prose") {
		if (renders.length > 0) reasons.push("called render_html for a prose answer");
		if (!reply.text.trim()) reasons.push("no text reply");
		return { pass: reasons.length === 0, reasons };
	}
	if (renders.length !== 1) reasons.push(`expected one render_html call, got ${renders.length}`);
	for (const call of renders) {
		const html = (call.input as { html?: unknown }).html;
		if (typeof html !== "string" || !html.trim()) {
			reasons.push("render_html without html");
			continue;
		}
		const hosts = externalHosts(html);
		if (hosts.length > 0) reasons.push(`page requests ${hosts.join(", ")}`);
	}
	return { pass: reasons.length === 0, reasons };
}
