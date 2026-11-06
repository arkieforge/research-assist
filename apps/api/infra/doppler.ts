import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { request } from "./http-resource.ts";

// Doppler writes as Alchemy resources (@alchemy.run/doppler only reads secrets). Auth:
// DOPPLER_ADMIN_TOKEN, a token that may write the project, e.g. `doppler configure get token --plain`
// from a logged-in CLI. Deliberately not DOPPLER_TOKEN, which deploys use as a read-only service token.
// https://docs.doppler.com/reference/api

const API = "https://api.doppler.com/v3";
const doppler = <T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown) =>
	request<T>("Doppler", "DOPPLER_ADMIN_TOKEN", method, `${API}${path}`, body);

/** One secret in one Doppler config. Destroying the resource removes the secret. */
export type DopplerSecret = Resource<
	"Arkie.DopplerSecret",
	{ project: string; config: string; name: string; value: string | Redacted.Redacted },
	{ name: string }
>;
export const DopplerSecret = Resource<DopplerSecret>("Arkie.DopplerSecret");

/** A read-only service token for one config (what CI holds as DOPPLER_TOKEN). Minted once, revoked on destroy. */
export type DopplerServiceToken = Resource<
	"Arkie.DopplerServiceToken",
	{ project: string; config: string; name: string },
	{ slug: string; token: Redacted.Redacted }
>;
export const DopplerServiceToken = Resource<DopplerServiceToken>("Arkie.DopplerServiceToken");

const SecretProvider = () =>
	Provider.succeed(DopplerSecret, {
		reconcile: ({ news }) =>
			doppler("POST", "/configs/config/secrets", {
				project: news.project,
				config: news.config,
				secrets: { [news.name]: Redacted.isRedacted(news.value) ? Redacted.value(news.value) : news.value },
			}).pipe(Effect.as({ name: news.name })),
		delete: ({ olds }) =>
			doppler("DELETE", `/configs/config/secret?project=${olds.project}&config=${olds.config}&name=${olds.name}`).pipe(
				Effect.asVoid,
			),
		read: ({ output }) => Effect.succeed(output),
		list: () => Effect.succeed([]),
	});

const ServiceTokenProvider = () =>
	Provider.succeed(DopplerServiceToken, {
		// Doppler shows a token's value only at creation, so an existing one is kept as is.
		reconcile: ({ news, output }) =>
			output
				? Effect.succeed(output)
				: doppler<{ token: { slug: string; key: string } }>("POST", "/configs/config/tokens", {
						project: news.project,
						config: news.config,
						name: news.name,
						access: "read",
					}).pipe(Effect.map(({ token }) => ({ slug: token.slug, token: Redacted.make(token.key) }))),
		delete: ({ olds, output }) =>
			doppler("DELETE", "/configs/config/tokens/token", {
				project: olds.project,
				config: olds.config,
				slug: output.slug,
			}).pipe(Effect.asVoid),
		read: ({ output }) => Effect.succeed(output),
		list: () => Effect.succeed([]),
	});

export const DopplerProviders = () => Layer.mergeAll(SecretProvider(), ServiceTokenProvider());
