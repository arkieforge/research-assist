// `vp run doctor`: is this machine and checkout ready for `vp run dev`, and what exactly to do if not.
// Node built-ins only, so it works before `vp install`.
//
//   vp run doctor          report
//   vp run doctor --json   the same as JSON (for agents and vp run triage)
//   vp run doctor --fix    also remove Docker objects left by deleted worktrees (listed first)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { missingSecrets } from "./dev-lib.ts";
import { type Check, orphanedDevObjects, render, versionAtLeast } from "./doctor-lib.ts";
import { devEnv, devStage, dopplerDev, localEnv, portFree, preferredPorts, root, run, succeeds } from "./lib/local.ts";

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
	engines: { node: string };
	packageManager: string;
};
const output = (cmd: string, args: string[]) => {
	try {
		return run(cmd, args).trim();
	} catch {
		return null;
	}
};
const checks: Check[] = [];
const add = (check: Check) => checks.push(check);

// Toolchain
const nodeWanted = pkg.engines.node.replace(/^>=/, "");
add(
	versionAtLeast(process.versions.node, nodeWanted)
		? { name: "node", status: "ok", detail: process.versions.node }
		: {
				name: "node",
				status: "fail",
				detail: `${process.versions.node}, needs ${nodeWanted}+`,
				fix: "vp env install (reads .node-version)",
			},
);
const vpHave = output("vp", ["--version"]);
add(
	vpHave
		? { name: "vp", status: "ok", detail: vpHave.split("\n")[0] ?? vpHave }
		: { name: "vp", status: "fail", detail: "not found", fix: "curl -fsSL https://vite.plus | bash" },
);
const pnpmWanted = pkg.packageManager.split("@")[1] ?? "";
const pnpmHave = output("pnpm", ["--version"]);
add(
	pnpmHave && pnpmHave.split(".")[0] === pnpmWanted.split(".")[0]
		? { name: "pnpm", status: "ok", detail: `${pnpmHave} (through vp)` }
		: {
				name: "pnpm",
				status: "fail",
				detail: pnpmHave ? `${pnpmHave}, repo pins ${pnpmWanted}` : "not found",
				fix: "vp env install",
			},
);
add(
	existsSync(join(root, "node_modules"))
		? { name: "dependencies", status: "ok", detail: "installed" }
		: {
				name: "dependencies",
				status: "fail",
				detail: "node_modules missing",
				fix: "vp install (vp run dev also does it)",
			},
);
const hooksPath = output("git", ["config", "--get", "core.hooksPath"]);
const hook = hooksPath && join(root, hooksPath, "pre-commit");
add(
	hook && existsSync(hook) && readFileSync(hook, "utf8").length > 0
		? { name: "git hooks", status: "ok", detail: "vp staged pre-commit installed" }
		: {
				name: "git hooks",
				status: "warn",
				detail: "not installed (staged files won't be formatted)",
				fix: "vp config --no-agent",
			},
);

// Worktree setup (T3 Setup action)
const markers = join(root, ".t3");
if (existsSync(join(markers, "setup-failed"))) {
	const tail = readFileSync(join(markers, "setup-failed"), "utf8").trim().split("\n").slice(-3).join(" | ");
	add({ name: "worktree setup", status: "fail", detail: `failed: ${tail}`, fix: "vp run setup" });
} else if (existsSync(join(markers, "setup-running"))) {
	add({ name: "worktree setup", status: "warn", detail: "still running (wait for .t3/setup-done)" });
}

// Services
const docker = output("docker", ["info", "--format", "{{.ServerVersion}}"]);
add(
	docker
		? { name: "docker", status: "ok", detail: `engine ${docker}` }
		: {
				name: "docker",
				status: "fail",
				detail: "not running (the API's local Postgres needs it)",
				fix: "start Docker Desktop or OrbStack",
			},
);

// Secrets
const doppler = dopplerDev();
add(
	{
		loaded: { name: "doppler", status: "ok", detail: "arkie/dev readable" },
		"inside-run": { name: "doppler", status: "ok", detail: "running inside doppler run" },
		"no-cli": {
			name: "doppler",
			status: "warn",
			detail: "CLI not installed; .env is the only source",
			fix: "brew install dopplerhq/cli/doppler && doppler login (team members)",
		},
		"not-logged-in": {
			name: "doppler",
			status: "warn",
			detail: "installed, can't read arkie/dev",
			fix: "doppler login, and ask for access to the arkie project",
		},
	}[doppler.status] as Check,
);
const env = localEnv(doppler);
const ports = preferredPorts();
const missing = missingSecrets({ ...env, ...devEnv(ports, env) });
add(
	missing.length
		? {
				name: "secrets",
				status: "fail",
				detail: `missing ${missing.map((m) => m.split(":")[0]).join(", ")}`,
				fix: "Doppler arkie/dev, or .env from .env.example",
			}
		: {
				name: "secrets",
				status: "ok",
				detail: env.ARKIE_ANTHROPIC_API_KEY ? "Clerk + model key" : "Clerk (chat uses the free Replay model)",
			},
);

// Ports for this checkout
const portList = Object.entries(ports);
const taken = (
	await Promise.all(portList.map(async ([app, port]) => ((await portFree(port)) ? null : `${app}:${port}`)))
).filter(Boolean);
add(
	taken.length
		? {
				name: "ports",
				status: "warn",
				detail: `in use: ${taken.join(", ")} (vp run dev shifts to free ones; a running vp run dev here is fine)`,
			}
		: { name: "ports", status: "ok", detail: portList.map(([app, port]) => `${app} ${port}`).join(", ") },
);
add({ name: "stage", status: "ok", detail: devStage() });

// Leftovers from deleted worktrees
const worktrees = (output("git", ["worktree", "list", "--porcelain"]) ?? "")
	.split("\n")
	.filter((line) => line.startsWith("worktree "))
	.map((line) => basename(line.slice("worktree ".length)));
const dockerNames = docker
	? [
			...(output("docker", ["ps", "-a", "--format", "{{.Names}}"]) ?? "").split("\n"),
			...(output("docker", ["volume", "ls", "--format", "{{.Name}}"]) ?? "").split("\n"),
		].filter(Boolean)
	: [];
const orphans = orphanedDevObjects(dockerNames, process.env.USER ?? "unknown", worktrees);
const fixing = process.argv.includes("--fix");
if (orphans.length && fixing) {
	for (const name of orphans) {
		// Containers first: a volume in use can't be removed.
		if (!/postgresdata/.test(name)) execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
	}
	for (const name of orphans.filter((n) => /postgresdata/.test(n))) {
		execFileSync("docker", ["volume", "rm", name], { stdio: "ignore" });
	}
}
add(
	orphans.length === 0
		? { name: "leftovers", status: "ok", detail: "no Docker objects from deleted worktrees" }
		: fixing
			? { name: "leftovers", status: "ok", detail: `removed ${orphans.join(", ")}` }
			: {
					name: "leftovers",
					status: "warn",
					detail: `from deleted worktrees: ${orphans.join(", ")}`,
					fix: "vp run doctor --fix",
				},
);

// Optional tools
add(
	succeeds("gh", ["auth", "status"])
		? { name: "gh", status: "ok", detail: "logged in (PRs, vp run triage)" }
		: { name: "gh", status: "warn", detail: "not logged in; only needed for PRs and triage", fix: "gh auth login" },
);
add(
	succeeds("tailscale", ["status"])
		? { name: "tailscale", status: "ok", detail: "connected (vp run dev --share works)" }
		: { name: "tailscale", status: "warn", detail: "not connected; only needed for vp run dev --share" },
);

if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`);
else process.stdout.write(`${render(checks)}\n`);
process.exitCode = checks.some((c) => c.status === "fail") ? 1 : 0;
