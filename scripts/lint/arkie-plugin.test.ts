import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { killsByPattern, targetsProdStage } from "./arkie-plugin.ts";

test("killsByPattern flags name-based kills, not PID kills or lookalike words", () => {
	assert.ok(killsByPattern("pkill -f workerd"));
	assert.ok(killsByPattern("pgrep vite | xargs kill"));
	assert.ok(killsByPattern("killall node"));
	assert.ok(!killsByPattern("kill -TERM 1234"));
	assert.ok(!killsByPattern("skillful"));
});

test("targetsProdStage flags a literal prod stage flag only", () => {
	assert.ok(targetsProdStage("alchemy deploy --stage prod"));
	assert.ok(targetsProdStage("--stage=prod"));
	assert.ok(!targetsProdStage("--stage production-like"));
	assert.ok(!targetsProdStage("--stage pr-12"));
	assert.ok(!targetsProdStage('stage === "prod"'));
});
