import { describe, expect, test } from "vite-plus/test";
import { dopplerConfig, isDevStage, isPreviewStage } from "./stages.ts";

describe("isPreviewStage", () => {
	test("matches only real PR stages, so cleanup can never reach prod or a dev stage", () => {
		expect(["pr-1", "pr-42"].every(isPreviewStage)).toBe(true);
		expect(["prod", "pr-0", "pr-", "pr-42x", "dev_siam_arkie", "xpr-4"].some(isPreviewStage)).toBe(false);
	});
});

test("only prod reads the prd Doppler config", () => {
	expect(dopplerConfig("prod")).toBe("prd");
	expect(dopplerConfig("pr-7")).toBe("stg");
	expect(dopplerConfig("live_siam_arkie")).toBe("stg");
});

test("dev stages are the dev_ ones scripts/stage.sh makes, never a deployable stage", () => {
	expect(isDevStage("dev_siam_arkie")).toBe(true);
	expect(["prod", "pr-3", "live_siam_arkie", "development"].some(isDevStage)).toBe(false);
});
