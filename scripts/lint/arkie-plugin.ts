// Arkie's oxlint rules (vite.config.ts jsPlugins): the AGENTS.md "ways to hurt yourself" that a
// string in code can carry. ESLint-style plugin API; the matchers are plain functions so they're tested.

type Node = { type: string; value?: unknown; quasis?: Array<{ value: { cooked?: string | null } }> };
type Context = { report: (report: { node: Node; message: string }) => void };

/** `pkill -f`, `pgrep | kill`, `killall`: killing by name or path hits other worktrees (AGENTS.md rule 1). */
export const killsByPattern = (text: string) => /\b(pkill|pgrep|killall)\b/.test(text);

/** A literal `--stage prod`: only CI deploys prod (AGENTS.md rule 2). */
export const targetsProdStage = (text: string) => /--stage[= ]prod\b/.test(text);

const textOf = (node: Node) =>
	node.type === "Literal" && typeof node.value === "string"
		? node.value
		: node.type === "TemplateLiteral"
			? (node.quasis ?? []).map((q) => q.value.cooked ?? "").join("")
			: undefined;

const stringRule = (test: (text: string) => boolean, message: string) => ({
	create: (context: Context) => {
		const check = (node: Node) => {
			const text = textOf(node);
			if (text !== undefined && test(text)) context.report({ node, message });
		};
		return { Literal: check, TemplateLiteral: check };
	},
});

export default {
	meta: { name: "arkie" },
	rules: {
		"no-kill-by-pattern": stringRule(
			killsByPattern,
			"Don't kill processes by name or path: other worktrees run the same commands. Stop what you started by its PID (AGENTS.md).",
		),
		"no-prod-stage": stringRule(
			targetsProdStage,
			"Only CI deploys --stage prod (from main). Use the root scripts, which name the stage after the checkout (AGENTS.md).",
		),
	},
};
