// `vp run dev`: the one-command local stack. Node built-ins only, so it runs on a fresh checkout.
//
//   1. installs dependencies if node_modules is missing
//   2. loads secrets: Doppler `arkie/dev` when the Doppler CLI is logged in, then the root .env on top
//   3. checks Docker (the local Postgres) and the Clerk keys, and says exactly what is missing
//   4. picks ports for this checkout (main checkout: 8787/3000/4321/54329; worktrees: a stable offset)
//   5. runs api (alchemy dev), web (vite) and marketing (astro) with prefixed output, and stops all
//      three on Ctrl-C by the process groups it started.
//   6. also writes each app's output, timestamped and without colors, to .t3/logs/<app>.log
//      (replaced on every start), so an agent that didn't start this process can read it.
//
// Flags:
//   --only api,web   run a subset
//   --share          also serve the apps over this machine's tailnet (HTTPS), to test from a phone
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { missingSecrets, type Ports } from "./dev-lib.ts";
import { devEnv, dopplerDev, freePorts, localEnv, root, run, succeeds } from "./lib/local.ts";

const APPS = { api: "@arkie/api", web: "@arkie/web", marketing: "@arkie/marketing" } as const;
type App = keyof typeof APPS;
const SHARE_OFFSET = 10_000;
const LOGS = join(root, ".t3", "logs");

const log = (message: string) => process.stdout.write(`[dev] ${message}\n`);
const fail = (message: string): never => {
	process.stderr.write(`\n[dev] ${message}\n\n`);
	process.exit(1);
};

function parseOnly(): App[] {
	const i = process.argv.indexOf("--only");
	const list = i === -1 ? Object.keys(APPS) : (process.argv[i + 1] ?? "").split(",");
	const unknown = list.filter((name) => !(name in APPS));
	if (unknown.length) fail(`Unknown app(s): ${unknown.join(", ")}. Choose from ${Object.keys(APPS).join(", ")}.`);
	return list as App[];
}

/**
 * --share: `tailscale serve` each app as HTTPS on its local port + 10000 (a serve listener on the same
 * number would make the dev server think its port is taken), and point the apps at those URLs instead
 * of localhost. Never touches a port that is already served (T3 owns :443 on the Mac mini).
 * Returns the env overrides and a cleanup that turns off only the ports this run added.
 */
function share(apps: App[], ports: Ports) {
	if (!succeeds("tailscale", ["version"])) fail("--share needs the Tailscale CLI, logged in to a tailnet.");
	const status = JSON.parse(run("tailscale", ["status", "--json"])) as { Self?: { DNSName?: string } };
	const host = status.Self?.DNSName?.replace(/\.$/, "");
	if (!host) fail("--share: Tailscale has no MagicDNS name for this machine. Enable MagicDNS and HTTPS certificates.");
	const served = run("tailscale", ["serve", "status"]);
	const added: number[] = [];
	for (const app of apps) {
		const port = ports[app] + SHARE_OFFSET;
		if (served.includes(`${host}:${port}`))
			fail(`--share: tailnet port ${port} is already served. Free it or pick another checkout.`);
		run("tailscale", ["serve", "--bg", `--https=${port}`, `http://127.0.0.1:${ports[app]}`]);
		added.push(port);
	}
	const cleanup = () => {
		for (const port of added) {
			try {
				execFileSync("tailscale", ["serve", `--https=${port}`, "off"], { stdio: "ignore" });
			} catch {}
		}
	};
	const url = (port: number) => `https://${host}:${port + SHARE_OFFSET}`;
	const env = {
		VITE_API_URL: url(ports.api),
		PUBLIC_APP_URL: url(ports.web),
		SITE_URL: url(ports.marketing),
		// Vite and Astro reject unknown Host headers and may bind IPv6 only: this lets the tailnet name
		// through and binds them to 127.0.0.1, where serve proxies.
		DEV_SHARE_HOST: host,
	};
	return { env, cleanup, url };
}

function startApp(app: App, env: NodeJS.ProcessEnv): ChildProcess {
	// detached: the child leads its own process group, so stopping it also stops alchemy/vite/workerd under it.
	const child = spawn("vp", ["run", "--filter", APPS[app], "dev"], { cwd: root, env, detached: true, stdio: "pipe" });
	const tag = `[${app}]`.padEnd(12);
	mkdirSync(LOGS, { recursive: true });
	const file = createWriteStream(join(LOGS, `${app}.log`));
	for (const stream of [child.stdout, child.stderr]) {
		let buffered = "";
		stream?.setEncoding("utf8").on("data", (chunk: string) => {
			buffered += chunk;
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) {
				process.stdout.write(`${tag} ${line}\n`);
				file.write(`${new Date().toISOString()} ${stripVTControlCharacters(line)}\n`);
			}
		});
	}
	return child;
}

const apps = parseOnly();

if (!existsSync(join(root, "node_modules"))) {
	log("Installing dependencies (first run)...");
	execFileSync("vp", ["install", "--frozen-lockfile"], { cwd: root, stdio: "inherit" });
}

const doppler = dopplerDev();
if (doppler.status === "loaded") log(`Loaded ${Object.keys(doppler.secrets).length} secrets from Doppler arkie/dev.`);
if (doppler.status === "no-cli") log("Doppler CLI not found; using .env. Team members: docs/operations/secrets.md.");
if (doppler.status === "not-logged-in") log("Doppler is installed but not logged in (`doppler login`); using .env.");
const baseEnv = localEnv(doppler);

if (apps.includes("api") && !succeeds("docker", ["info", "--format", "{{.ServerVersion}}"])) {
	fail("Docker is not running. The API's local Postgres runs in Docker: start Docker Desktop or OrbStack and retry.");
}
const ports =
	(await freePorts((p) => [...apps.map((app) => p[app]), ...(apps.includes("api") ? [p.postgres] : [])])) ??
	fail(
		"No free port set found near this checkout's ports. Stop another dev stack and retry. (`vp run doctor` lists them.)",
	);
const missing = apps.some((app) => app !== "marketing")
	? missingSecrets({ ...baseEnv, ...devEnv(ports, baseEnv) })
	: [];
if (missing.length) {
	fail(
		[
			"Missing secrets:",
			...missing.map((m) => `  ${m}`),
			"Add them to Doppler arkie/dev (team) or to .env at the repo root (see .env.example). `vp run doctor` checks setup.",
		].join("\n"),
	);
}

const shared = process.argv.includes("--share") ? share(apps, ports) : null;
const env = { ...baseEnv, ...devEnv(ports, baseEnv), ...shared?.env };
const children = apps.map((app) => startApp(app, env));
const where = (port: number) => shared?.url(port) ?? `http://localhost:${port}`;
log(
	[
		"Starting:",
		apps.includes("web") ? `  web        ${where(ports.web)}` : "",
		apps.includes("api") ? `  api        ${where(ports.api)}  (postgres :${ports.postgres})` : "",
		apps.includes("marketing") ? `  marketing  ${where(ports.marketing)}` : "",
		shared ? "  shared on the tailnet only; stops with this process" : "",
	]
		.filter(Boolean)
		.join("\n"),
);

let stopping = false;
const stop = (code: number) => {
	if (stopping) return;
	stopping = true;
	shared?.cleanup();
	for (const child of children) {
		// Negative pid = the child's process group, which we created with `detached`.
		if (child.pid && child.exitCode === null) {
			try {
				process.kill(-child.pid, "SIGTERM");
			} catch {}
		}
	}
	setTimeout(() => process.exit(code), 1500).unref();
};
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => stop(0));
for (const [i, child] of children.entries()) {
	child.on("exit", (code) => {
		if (stopping) return;
		log(`${apps[i]} exited (${code ?? "signal"}); stopping the rest.`);
		stop(code ?? 1);
	});
}
