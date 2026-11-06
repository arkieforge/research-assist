// `vp run check:changed [base]`: CI's checks for only what this branch touched. Compares against the merge
// base with origin/main (or `base`), counting uncommitted and untracked files. Lint runs on the changed
// files; typecheck, tests and builds run for affected packages (scripts/check-changed-lib.ts). CI still
// runs everything, so a local pass doesn't promise a green CI.
import { spawn } from "node:child_process";
import { affected, type Target } from "./check-changed-lib.ts";
import { root, run } from "./lib/local.ts";

const base = process.argv[2] ?? "origin/main";
const lines = (out: string) => out.split("\n").filter(Boolean);
let mergeBase = "HEAD";
try {
	mergeBase = run("git", ["merge-base", "HEAD", base]).trim();
} catch {
	process.stdout.write(`[check] no merge base with ${base}; checking uncommitted changes only\n`);
}
const files = [
	...new Set([
		...lines(run("git", ["diff", "--name-only", mergeBase])),
		...lines(run("git", ["ls-files", "--others", "--exclude-standard"])),
	]),
];
if (files.length === 0) {
	process.stdout.write("[check] nothing changed\n");
	process.exit(0);
}

const targets = affected(files);
const pkg = { api: "@arkie/api", web: "@arkie/web", marketing: "@arkie/marketing" } as const;
const filter = (t: Exclude<Target, "scripts">) => ["run", "--filter", pkg[t]];
const lintable = files.filter((f) => /\.(ts|tsx|js|mjs|json|jsonc|css|md)$/.test(f));
const steps: [string, string, string[]][] = [
	...(lintable.length
		? ([
				["fmt", "vp", ["fmt", "--check", "--no-error-on-unmatched-pattern", ...lintable]],
				["lint", "vp", ["lint", "--no-error-on-unmatched-pattern", ...lintable]],
			] as [string, string, string[]][])
		: []),
	...targets.flatMap((t): [string, string, string[]][] =>
		t === "scripts"
			? [["scripts test", "vp", ["run", "--filter", "@arkie/scripts", "test"]]]
			: [
					...(t !== "marketing"
						? [[`${t} typecheck`, "vp", [...filter(t), "typecheck"]] as [string, string, string[]]]
						: []),
					...(t === "api" ? [["api test", "vp", [...filter(t), "test"]] as [string, string, string[]]] : []),
					...(t !== "api" ? [[`${t} build`, "vp", [...filter(t), "build"]] as [string, string, string[]]] : []),
				],
	),
];

process.stdout.write(`[check] ${files.length} changed file(s) -> ${targets.join(", ") || "lint only"}\n`);
// Side by side; each step prints its output when it finishes, so logs don't interleave.
const results = await Promise.all(
	steps.map(
		([name, cmd, args]) =>
			new Promise<[string, number]>((done) => {
				const child = spawn(cmd, args, {
					cwd: root,

					env: { ...process.env, NITRO_PRESET: "vercel" },
				});
				let log = "";
				child.stdout.on("data", (d) => (log += d));
				child.stderr.on("data", (d) => (log += d));
				child.on("close", (code) => {
					if (code !== 0) process.stdout.write(`\n── ${name} failed ──\n${log.trim()}\n`);
					done([name, code ?? 1]);
				});
			}),
	),
);
process.stdout.write(`\n${results.map(([name, code]) => `${code === 0 ? "✓" : "✗"} ${name}`).join("\n")}\n`);
process.exitCode = results.some(([, code]) => code !== 0) ? 1 : 0;
