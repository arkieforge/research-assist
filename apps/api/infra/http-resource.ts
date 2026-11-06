import * as Config from "effect/Config";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

// Shared plumbing for the custom Alchemy resources over plain REST APIs (Vercel, Doppler), which have
// no Alchemy provider. Each call reads its bearer token from Config, so it comes from the stack's
// secrets list like every other credential, and is never logged.

export class ApiError extends Data.TaggedError("ApiError")<{ api: string; status: number; body: string }> {
	override get message() {
		return `${this.api} API ${this.status}: ${this.body.slice(0, 300)}`;
	}
}

/** JSON request with a bearer token read from `tokenVar`. A 404 on DELETE counts as done. */
export const request = <T>(
	api: string,
	tokenVar: string,
	method: "GET" | "POST" | "PATCH" | "DELETE",
	url: string,
	body?: unknown,
) =>
	Effect.gen(function* () {
		const token = yield* Config.Redacted(tokenVar).pipe(Effect.orDie);
		const res = yield* Effect.tryPromise({
			try: () =>
				fetch(url, {
					method,
					headers: { Authorization: `Bearer ${Redacted.value(token)}`, "Content-Type": "application/json" },
					...(body === undefined ? {} : { body: JSON.stringify(body) }),
				}),
			catch: (cause) => new ApiError({ api, status: 0, body: String(cause) }),
		});
		if (method === "DELETE" && res.status === 404) return undefined as T;
		const text = yield* Effect.promise(() => res.text());
		if (!res.ok) return yield* new ApiError({ api, status: res.status, body: text });
		return (text ? JSON.parse(text) : undefined) as T;
	});
