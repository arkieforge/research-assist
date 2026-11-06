import { describe, expect, test } from "vite-plus/test";
import { chatName, ownerOf } from "./chat-name.ts";

describe("ownerOf", () => {
	test("reads the user back out of a chat name", () => {
		expect(ownerOf(chatName("user_2abc", "c1d2-e3"))).toBe("user_2abc");
	});

	test("rejects names that could let one user claim another's chat", () => {
		expect(ownerOf("user_2abc")).toBeNull();
		expect(ownerOf(".c1")).toBeNull();
		expect(ownerOf("user_2abc.")).toBeNull();
	});
});
