// Side-effectful helpers shared by scripts/dev.ts, doctor.ts and triage.ts. Node built-ins only:
// these scripts run before (or without) node_modules.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { basename, join } from "node:path";
import { parseEnv } from "node:util";
import { devEnv, type Ports, portOffset, portsAt } from "../dev-lib.ts";

export const root = join(import.meta.dirname, "..", "..");

/** Runs a command in the repo root and returns stdout; throws on a non-zero exit. */
export const run = (cmd: string, args: string[]) =>
	execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: "pipe" });

export function succeeds(cmd: string, args: string[]): boolean {
	try {
		run(cmd, args);
		return true;
	} catch {
		return false;
	}
}

export function isMainCheckout(): boolean {
	return run("git", ["rev-parse", "--git-dir"]).trim() === run("git", ["rev-parse", "--git-common-dir"]).trim();
}

const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

/** The `dev_*` stage `vp run dev` uses here; mirrors scripts/stage.sh. */
export function devStage(): string {
	const checkout = basename(run("git", ["rev-parse", "--show-toplevel"]).trim());
	return `dev_${sanitize(process.env.USER ?? "unknown")}_${sanitize(checkout)}`;
}

export type DopplerResult =
	| { status: "loaded"; secrets: Record<string, string> }
	| { status: "no-cli" | "not-logged-in" | "inside-run" };

/** Doppler `arkie/dev` as env. Never throws: a missing or logged-out CLI means .env is the source. */
export function dopplerDev(): DopplerResult {
	if (process.env.DOPPLER_ENVIRONMENT) return { status: "inside-run" };
	if (!succeeds("doppler", ["--version"])) return { status: "no-cli" };
	try {
		const json = run("doppler", ["secrets", "download", "-p", "arkie", "-c", "dev", "--no-file", "--format", "json"]);
		// Drop Doppler's own DOPPLER_* metadata; only the project's secrets go to the apps.
		const secrets = Object.fromEntries(
			Object.entries(JSON.parse(json) as Record<string, string>).filter(([key]) => !key.startsWith("DOPPLER_")),
		);
		return { status: "loaded", secrets };
	} catch {
		return { status: "not-logged-in" };
	}
}

/** Precedence: Doppler < root .env < shell. Personal overrides stay local; a one-off `X=1 vp run dev` wins. */
export function localEnv(doppler: DopplerResult): NodeJS.ProcessEnv {
	const dotenvPath = join(root, ".env");
	const fromDotenv = existsSync(dotenvPath) ? parseEnv(readFileSync(dotenvPath, "utf8")) : {};
	const fromDoppler = doppler.status === "loaded" ? doppler.secrets : {};
	return { ...fromDoppler, ...fromDotenv, ...process.env };
}

export const portFree = (port: number) =>
	new Promise<boolean>((resolve) => {
		const server = createServer()
			.once("error", () => resolve(false))
			.once("listening", () => server.close(() => resolve(true)))
			.listen(port, "127.0.0.1");
	});

/** This checkout's preferred ports (before any shifting for taken ports). */
export const preferredPorts = (): Ports => portsAt(portOffset(root, isMainCheckout()));

/** The first port set at or after this checkout's offset where every `needed` port is free. */
export async function freePorts(needed: (ports: Ports) => number[]): Promise<Ports | null> {
	const start = portOffset(root, isMainCheckout());
	for (let offset = start; offset < start + 50; offset++) {
		const ports = portsAt(offset);
		// oxlint-disable-next-line eslint/no-await-in-loop -- sequential on purpose: stop at the first free set.
		if ((await Promise.all(needed(ports).map(portFree))).every(Boolean)) return ports;
	}
	return null;
}

export { devEnv };
