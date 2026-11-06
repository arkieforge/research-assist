import * as Cloudflare from "@alchemy.run/cloudflare";

/** R2: HTML artifact bodies, keyed by artifact id. */
export const Artifacts = Cloudflare.R2.Bucket("Artifacts");

/** D1: artifact metadata (src/db/d1.ts). Migrations apply on deploy and in `alchemy dev`. */
export const ArtifactIndex = Cloudflare.D1.Database("ArtifactIndex", { migrations: "./migrations/d1" });

/** Queue: chat events from the ChatAgent, drained by the same Worker's `queue` handler into Neon. */
export const ChatEvents = Cloudflare.Queues.Queue("ChatEvents");
