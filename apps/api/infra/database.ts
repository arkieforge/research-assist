import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Neon from "@alchemy.run/neon";
import * as Alchemy from "alchemy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Effect from "effect/Effect";
import { DEV_PG_PORT } from "./config.ts";
import { LocalPostgres } from "./local-postgres.ts";
import { isProdStage } from "./stages.ts";

/**
 * Postgres behind Hyperdrive. Prod owns the Neon project (retained even if this code is deleted);
 * every other cloud stage gets its own copy-on-write branch of it, so previews cost seconds, not a
 * cluster. `alchemy dev` uses a Docker Postgres instead. All three apply migrations/neon.
 */
export const Database = Effect.gen(function* () {
	const { stage } = yield* Alchemy.Stack;
	if ((yield* AlchemyContext).dev) return yield* LocalPostgres(DEV_PG_PORT, "./migrations/neon");
	const project = isProdStage(stage)
		? yield* Neon.Project("Database", {
				region: "aws-ap-southeast-1",
				// Neon's free plan caps point-in-time history at 6 hours (Alchemy defaults to 24). Raise on a paid plan.
				historyRetentionSeconds: 21_600,
			}).pipe(RemovalPolicy.retain())
		: yield* Neon.Project.ref("Database", { stage: "prod" });
	const branch = yield* Neon.Branch("Branch", {
		project,
		// No `protected`: Neon's free plan has no protected branches. The project's retain policy keeps prod's data.
		migrations: "./migrations/neon",
	});
	// Hyperdrive pools the direct endpoint; with Hyperdrive bypassed (dev), Neon's own pooler.
	return { origin: branch.origin, dev: branch.pooledOrigin, label: branch.branchId };
});

export const Hyperdrive = Effect.gen(function* () {
	const { origin, dev } = yield* Database;
	return yield* Cloudflare.Hyperdrive.Connection("Hyperdrive", { origin, dev });
});
