import { describe, expect, test } from "vite-plus/test";
import { t3Allowed } from "./t3.ts";

describe("t3Allowed", () => {
	test("only allowlisted owners get T3 tools", () => {
		expect(t3Allowed("user_a", "user_a, user_b")).toBe(true);
		expect(t3Allowed("user_c", "user_a,user_b")).toBe(false);
	});

	test("fails closed on an empty list, a missing owner, or a prefix match", () => {
		expect(t3Allowed("user_a", "")).toBe(false);
		expect(t3Allowed(null, "user_a")).toBe(false);
		expect(t3Allowed("user_a", "user_ab")).toBe(false);
	});
});
