import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import { isProdStage } from "./stages.ts";

/**
 * R2: HTML artifact bodies, keyed by artifact id. Only prod's are user data: every other stage's
 * bucket empties on destroy, since R2 refuses to delete a bucket with objects and preview teardown failed.
 */
export const Artifacts = Effect.gen(function* () {
	const { stage } = yield* Alchemy.Stack;
	return yield* Cloudflare.R2.Bucket("Artifacts", { forceDestroy: !isProdStage(stage) });
});

/** D1: artifact metadata (src/db/d1.ts). Migrations apply on deploy and in `alchemy dev`. */
export const ArtifactIndex = Cloudflare.D1.Database("ArtifactIndex", { migrations: "./migrations/d1" });

/** Queue: chat events from the ChatAgent, drained by the same Worker's `queue` handler into Neon. */
export const ChatEvents = Cloudflare.Queues.Queue("ChatEvents");
