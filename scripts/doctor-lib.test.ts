import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { orphanedDevObjects, versionAtLeast } from "./doctor-lib.ts";

test("versionAtLeast compares numerically, not as strings", () => {
	assert.ok(versionAtLeast("24.12.0", "24.11.1"));
	assert.ok(versionAtLeast("26.0.0", "24.11.1"));
	assert.ok(!versionAtLeast("24.9.0", "24.11.1"));
	assert.ok(versionAtLeast("v24.11.1", "24.11.1"));
});

test("only this user's dev objects whose worktree is gone count as leftovers", () => {
	const names = [
		"arkie-postgres-dev-siam-arkie-jgsk4fkxn5bblhuk", // main checkout, still exists
		"arkie-postgres-dev-siam-feat-chat-ab12cd34ef56", // deleted worktree
		"arkie-postgresdata-dev-siam-feat-chat-ab12cd34ef56",
		"arkie-postgres-dev-other-feat-chat-ab12cd34ef56", // another user's
		"arkie-postgres-pr-12-ab12cd34ef56", // not a dev stage
		"t3code-vectorizer-1", // unrelated
	];
	assert.deepEqual(orphanedDevObjects(names, "siam", ["Arkie"]), [
		"arkie-postgres-dev-siam-feat-chat-ab12cd34ef56",
		"arkie-postgresdata-dev-siam-feat-chat-ab12cd34ef56",
	]);
});
