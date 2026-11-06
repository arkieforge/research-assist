import { describe, expect, test, vi } from "vite-plus/test";
import { userIdOf } from "./auth.ts";

// Clerk's runtime contract: verifyToken resolves to the JWT payload itself and throws on a bad token.
vi.mock("@clerk/backend", () => ({
	verifyToken: async (token: string) => {
		if (token !== "good") throw new Error("token-invalid");
		return { sub: "user_a", sid: "sess_1" };
	},
}));

const env = { CLERK_SECRET_KEY: "sk_test_x" } as Env;

describe("userIdOf", () => {
	test("reads the user from a valid token, by header or ?token=", async () => {
		expect(await userIdOf(new Request("https://api/chats", { headers: { Authorization: "Bearer good" } }), env)).toBe(
			"user_a",
		);
		expect(await userIdOf(new Request("https://api/agents/chat-agent/x?token=good"), env)).toBe("user_a");
	});

	test("no token or a rejected token means no user", async () => {
		expect(await userIdOf(new Request("https://api/chats"), env)).toBeNull();
		expect(
			await userIdOf(new Request("https://api/chats", { headers: { Authorization: "Bearer bad" } }), env),
		).toBeNull();
	});
});
