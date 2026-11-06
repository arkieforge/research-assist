import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

// Deploy-time configuration. Values come from Doppler (deployed stages) or the environment
// scripts/dev.ts builds (`alchemy dev`); see docs/operations/secrets.md for what lives where.

/** Ports scripts/dev.ts picks for this checkout; the defaults are the main checkout's. */
export const DEV_API_PORT = Number(process.env.API_PORT ?? 8787);
export const DEV_PG_PORT = Number(process.env.PG_PORT ?? 54329);

/** An optional value. Unset and empty both mean absent, since CI expands unset variables to "". */
export const optional = (name: string) =>
	Config.String(name).pipe(
		Config.withDefault(""),
		Config.map((value) => (value ? Option.some(value) : Option.none())),
	);

/** A pair of optional values that only counts when both are present. */
export const optionalPair = <K extends string>(a: K, b: K) =>
	Config.all([optional(a), optional(b)]).pipe(Config.map((pair) => Option.all(pair)));

/**
 * What the API Worker is configured with. Missing required values fail the plan with their name.
 * The model key is optional everywhere: the chat's model will come from T3 Code, and without a key
 * the chat answers with the scripted Replay model, which says how to set one.
 */
export const AppConfig = Effect.gen(function* () {
	return yield* Config.all({
		CLERK_SECRET_KEY: Config.Redacted("CLERK_SECRET_KEY"),
		ANTHROPIC_API_KEY: Config.Redacted("ARKIE_ANTHROPIC_API_KEY").pipe(Config.withDefault(Redacted.make(""))),
		// Optional: without it the chat runs with no T3 Code tools.
		T3_MCP: optionalPair("T3_MCP_URL", "T3_MCP_TOKEN"),
		// The one T3 token drives the deployer's own T3 environment, so only these Clerk user ids get
		// its tools. Empty (the default) means nobody: fail closed.
		T3_ALLOWED_USER_IDS: optional("T3_ALLOWED_USER_IDS"),
	});
});
