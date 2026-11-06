import assert from "node:assert/strict";
import { test } from "vite-plus/test";
import { BASE_PORTS, devEnv, missingSecrets, portOffset, portsAt } from "./dev-lib.ts";

test("the main checkout keeps the documented ports; worktrees get a stable, distinct offset", () => {
	assert.equal(portOffset("/code/arkie", true), 0);
	const a = portOffset("/code/arkie-worktrees/feat-a", false);
	assert.equal(a, portOffset("/code/arkie-worktrees/feat-a", false));
	assert.notEqual(a, portOffset("/code/arkie-worktrees/feat-b", false));
	assert.ok(a >= 1 && a < 400);
});

test("port ranges never collide across apps, whatever the offset", () => {
	const ranges = Object.values(BASE_PORTS).map((base) => [base, base + 399] as const);
	for (const [i, [lo, hi]] of ranges.entries()) {
		for (const [lo2, hi2] of ranges.slice(i + 1)) assert.ok(hi < lo2 || hi2 < lo);
	}
});

test("web is pointed at this checkout's API, and one Clerk key name fills both", () => {
	const env = devEnv(portsAt(5), { CLERK_PUBLISHABLE_KEY: "pk_test_x" });
	assert.equal(env.VITE_API_URL, "http://localhost:8792");
	assert.equal(env.VITE_CLERK_PUBLISHABLE_KEY, "pk_test_x");
});

test("missing Clerk keys are reported with where to find them", () => {
	assert.equal(missingSecrets({ CLERK_SECRET_KEY: "sk", VITE_CLERK_PUBLISHABLE_KEY: "pk" }).length, 0);
	assert.match(missingSecrets({})[0] ?? "", /^CLERK_SECRET_KEY: Clerk dashboard/);
});
