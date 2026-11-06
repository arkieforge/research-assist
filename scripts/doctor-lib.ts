// Pure parts of scripts/doctor.ts, split out for node:test.

export type Status = "ok" | "fail" | "warn";
export type Check = { name: string; status: Status; detail: string; fix?: string };

/** `a >= b` for dotted versions like "24.11.1"; non-numeric parts count as 0. */
export function versionAtLeast(a: string, b: string): boolean {
	const pa = a
		.replace(/^v/, "")
		.split(".")
		.map((n) => Number.parseInt(n, 10) || 0);
	const pb = b
		.replace(/^v/, "")
		.split(".")
		.map((n) => Number.parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d !== 0) return d > 0;
	}
	return true;
}

/**
 * Docker objects a dev stage left behind on this machine (`arkie-postgres-dev-<user>-<checkout>-<id>`,
 * `arkie-postgresdata-dev-…`) whose checkout no longer exists. Those can't be `alchemy destroy`ed: the
 * stage's state lived in the deleted worktree. `checkouts` are the basenames of `git worktree list`.
 */
const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "-");

export function orphanedDevObjects(names: string[], user: string, checkouts: string[]): string[] {
	const prefix = `dev-${sanitize(user)}-`;
	const live = new Set(checkouts.map(sanitize));
	return names.filter((name) => {
		const match = /^arkie-postgres(?:data)?-(dev-.+)-[a-z0-9]{8,}$/.exec(name);
		if (!match?.[1]?.startsWith(prefix)) return false; // not ours, or another user's
		return !live.has(match[1].slice(prefix.length));
	});
}

export function render(checks: Check[]): string {
	const mark = { ok: "✓", fail: "✗", warn: "!" } as const;
	const lines = checks.flatMap((c) => [
		`${mark[c.status]} ${c.name.padEnd(18)} ${c.detail}`,
		...(c.fix && c.status !== "ok" ? [`  ${" ".repeat(18)} fix: ${c.fix}`] : []),
	]);
	const failed = checks.filter((c) => c.status === "fail").length;
	lines.push("", failed ? `${failed} problem(s). Fix the ✗ lines, then run vp run doctor again.` : "Ready: vp run dev");
	return lines.join("\n");
}
