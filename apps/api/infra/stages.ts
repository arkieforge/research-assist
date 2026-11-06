// Stage names this stack treats specially. Kept import-free so CI scripts and tests can use it.

/** `alchemy dev` stages (scripts/stage.sh dev): local state, local Postgres, never deployed. */
export const isDevStage = (stage: string) => stage.startsWith("dev_");

/** Pull-request preview stages. Anchored so `prod`, `dev_*` and `pr-0` never match a cleanup job. */
export const isPreviewStage = (stage: string) => /^pr-[1-9][0-9]*$/.test(stage);

/** The one stage that owns long-lived data (the Neon project) and ships telemetry to Axiom. */
export const isProdStage = (stage: string) => stage === "prod";

/** Doppler config a deployed stage reads: prod uses `prd`, every other cloud stage `stg`. */
export const dopplerConfig = (stage: string) => (isProdStage(stage) ? "prd" : "stg");
