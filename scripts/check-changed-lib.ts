// Pure part of scripts/check-changed.ts: which packages a set of changed files affects.

export type Target = "api" | "web" | "marketing" | "scripts";
export const ALL: Target[] = ["api", "web", "marketing", "scripts"];

/**
 * Changed paths -> targets to check. web imports @arkie/api (types, chat-name), so an api change checks
 * web too. Root config and the lockfile affect everything; docs alone affect nothing but lint.
 */
export function affected(files: string[]): Target[] {
	const hit = new Set<Target>();
	for (const file of files) {
		if (file.startsWith("apps/api/")) hit.add("api").add("web");
		else if (file.startsWith("apps/web/")) hit.add("web");
		else if (file.startsWith("apps/marketing/")) hit.add("marketing");
		else if (file.startsWith("scripts/")) hit.add("scripts");
		else if (/^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.base\.json|biome\.json)$/.test(file)) {
			for (const t of ALL) hit.add(t);
		}
	}
	return ALL.filter((t) => hit.has(t));
}
