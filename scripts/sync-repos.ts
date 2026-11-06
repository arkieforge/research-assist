// `vp run sync:repos`: shallow clones of the sources we build on, at the exact versions installed, into
// .repos/ (gitignored, read-only references). Alchemy v2 and Effect 4 move fast and their docs lag;
// agents and people read real source, examples and tests here instead of guessing from memory.
// Rerun after bumping either dependency. Worktrees symlink the main checkout's .repos (setup-worktree.ts).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { root } from "./lib/local.ts";

const api = JSON.parse(readFileSync(join(root, "apps/api/package.json"), "utf8")) as {
	devDependencies: Record<string, string>;
};
const version = (name: string) => api.devDependencies[name]?.replace(/^[\^~]/, "") ?? "";

const REPOS = [
	{ dir: "alchemy", url: "https://github.com/alchemy-run/alchemy.git", ref: `v${version("alchemy")}` },
	{ dir: "effect", url: "https://github.com/Effect-TS/effect.git", ref: `effect@${version("effect")}` },
];

for (const repo of REPOS) {
	const target = join(root, ".repos", repo.dir);
	const marker = join(target, ".arkie-ref");
	if (existsSync(marker) && readFileSync(marker, "utf8").trim() === repo.ref) {
		process.stdout.write(`.repos/${repo.dir} already at ${repo.ref}\n`);
		continue;
	}
	rmSync(target, { recursive: true, force: true });
	process.stdout.write(`Cloning ${repo.url} at ${repo.ref}...\n`);
	execFileSync("git", ["clone", "--quiet", "--depth", "1", "--branch", repo.ref, repo.url, target], {
		stdio: "inherit",
	});
	execFileSync("sh", ["-c", `printf '%s\\n' "$1" > "$2"`, "sh", repo.ref, marker]);
}
process.stdout.write("Done. Read-only: never edit or import from .repos/.\n");
