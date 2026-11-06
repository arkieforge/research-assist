import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, test } from "vite-plus/test";
import { optional, optionalPair } from "./config.ts";

const read = <A>(
	config: { parse: (p: ConfigProvider.ConfigProvider) => Effect.Effect<A, unknown> },
	env: Record<string, string>,
) => Effect.runSync(config.parse(ConfigProvider.fromUnknown(env)));

describe("optional config", () => {
	test("an empty value reads as unset, since CI expands unset variables to empty strings", () => {
		expect(Option.isNone(read(optional("X"), { X: "" }))).toBe(true);
		expect(Option.isNone(read(optional("X"), {}))).toBe(true);
		expect(read(optional("X"), { X: "v" })).toEqual(Option.some("v"));
	});

	test("a pair counts only when both halves are set", () => {
		expect(Option.isNone(read(optionalPair("A", "B"), { A: "url", B: "" }))).toBe(true);
		expect(read(optionalPair("A", "B"), { A: "url", B: "token" })).toEqual(Option.some(["url", "token"]));
	});
});
