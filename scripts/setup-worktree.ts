// T3 "Setup" action (t3.json, runs on worktree create): install, then share the main checkout's .env.
// Node built-ins only: it runs before node_modules exists.
//
// Agents can start before setup ends, so it leaves markers in .t3/: `setup-running` (holding this PID)
// while it works, then `setup-done` or `setup-failed` (with the output tail). Wait on them instead of
// racing a second `vp install`.
import { execFileSync, spawn } from "node:child_process";
import { lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const worktree = join(import.meta.dirname, "..");
const markers = join(worktree, ".t3");
mkdirSync(markers, { recursive: true });
rmSync(join(markers, "setup-done"), { force: true });
rmSync(join(markers, "setup-failed"), { force: true });
writeFileSync(join(markers, "setup-running"), `${process.pid}\n`);

let tail = "";
process.on("exit", (code) => {
	rmSync(join(markers, "setup-running"), { force: true });
	if (code === 0) writeFileSync(join(markers, "setup-done"), "");
	else writeFileSync(join(markers, "setup-failed"), `Setup exited with code ${code}.\n${tail}\n`);
});

// A stale lockfile must fail here, not be rewritten.
const install = spawn("vp", ["install", "--frozen-lockfile"], { cwd: worktree, stdio: ["ignore", "pipe", "pipe"] });
for (const [from, to] of [
	[install.stdout, process.stdout],
	[install.stderr, process.stderr],
] as const) {
	from.setEncoding("utf8").on("data", (chunk: string) => {
		to.write(chunk);
		tail = (tail + chunk).slice(-8_000);
	});
}
const status = await new Promise<number | null>((done) => install.on("close", done));
if (status !== 0) process.exit(status ?? 1);

// The main checkout is the parent of the shared .git dir. Link its .env so a worktree needs no copy;
// only a symlink is ever replaced, so a worktree's own .env survives.
const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: worktree, encoding: "utf8" }).trim();
const mainCheckout = process.env.T3CODE_PROJECT_ROOT ?? dirname(resolve(worktree, commonDir));
// .repos (vp run sync:repos) is shared the same way: read-only references, no need for a copy each.
for (const [name, isKind] of [
	[".env", "isFile"],
	[".repos", "isDirectory"],
] as const) {
	const source = join(mainCheckout, name);
	const target = join(worktree, name);
	if (resolve(mainCheckout) === resolve(worktree) || !lstatSync(source, { throwIfNoEntry: false })?.[isKind]())
		continue;
	const existing = lstatSync(target, { throwIfNoEntry: false });
	if (!existing || existing.isSymbolicLink()) {
		rmSync(target, { force: true });
		symlinkSync(source, target);
		process.stdout.write(`Linked ${name} from ${mainCheckout}\n`);
	}
}
