import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { ALL, affected } from "./check-changed-lib.ts";

test("an api change also checks web, which imports @arkie/api", () => {
	assert.deepEqual(affected(["apps/api/src/types.ts"]), ["api", "web"]);
});

test("root config and the lockfile check everything; docs alone check nothing", () => {
	assert.deepEqual(affected(["pnpm-lock.yaml"]), ALL);
	assert.deepEqual(affected(["docs/operations/deploy.md", "README.md"]), []);
});
