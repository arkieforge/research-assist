// Pure helpers for scripts/dev.ts, split out so node:test can cover them without spawning anything.
import { createHash } from "node:crypto";

export const BASE_PORTS = { api: 8787, web: 3000, marketing: 4321, postgres: 54329 } as const;
export type Ports = { [K in keyof typeof BASE_PORTS]: number };

/** How far a checkout's ports sit from the base ports. The main checkout keeps the documented defaults. */
export function portOffset(checkoutPath: string, isMainCheckout: boolean): number {
	if (isMainCheckout) return 0;
	const hash = createHash("sha256").update(checkoutPath).digest();
	return 1 + (hash.readUInt32BE(0) % 399);
}

export const portsAt = (offset: number): Ports => ({
	api: BASE_PORTS.api + offset,
	web: BASE_PORTS.web + offset,
	marketing: BASE_PORTS.marketing + offset,
	postgres: BASE_PORTS.postgres + offset,
});

/** Variables every app needs for local dev, derived from the ports so the apps always agree. */
export function devEnv(ports: Ports, env: NodeJS.ProcessEnv): Record<string, string> {
	const publishable = env.VITE_CLERK_PUBLISHABLE_KEY ?? env.CLERK_PUBLISHABLE_KEY ?? "";
	return {
		API_PORT: String(ports.api),
		PG_PORT: String(ports.postgres),
		WEB_PORT: String(ports.web),
		MARKETING_PORT: String(ports.marketing),
		VITE_API_URL: `http://localhost:${ports.api}`,
		PUBLIC_APP_URL: `http://localhost:${ports.web}`,
		SITE_URL: `http://localhost:${ports.marketing}`,
		// Clerk wants the key under both names (server and browser); one is enough in .env or Doppler.
		CLERK_PUBLISHABLE_KEY: publishable,
		VITE_CLERK_PUBLISHABLE_KEY: publishable,
	};
}

/** Secrets the stack can't boot without, each with where to get it. Empty when nothing is missing. */
export function missingSecrets(env: Record<string, string | undefined>): string[] {
	const required: Record<string, string> = {
		CLERK_SECRET_KEY: "Clerk dashboard > API keys (Secret key, sk_test_...)",
		VITE_CLERK_PUBLISHABLE_KEY: "Clerk dashboard > API keys (Publishable key, pk_test_...)",
	};
	return Object.entries(required)
		.filter(([name]) => !env[name])
		.map(([name, where]) => `${name}: ${where}`);
}
