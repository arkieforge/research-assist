import * as Axiom from "@alchemy.run/axiom";
import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Docker from "@alchemy.run/docker";
import * as Doppler from "@alchemy.run/doppler";
import * as Neon from "@alchemy.run/neon";
import * as Alchemy from "alchemy";
import { AlchemyContext } from "alchemy/AlchemyContext";
import { Stage } from "alchemy/Stage";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Api } from "./infra/api.ts";
import { optional } from "./infra/config.ts";
import { Database } from "./infra/database.ts";
import { LocalMigrationsProvider } from "./infra/local-postgres.ts";
import { Observability } from "./infra/observability.ts";
import { ChatEvents } from "./infra/resources.ts";
import { dopplerConfig, isDevStage, isPreviewStage, isProdStage } from "./infra/stages.ts";
import { VercelEnv, VercelProviders } from "./infra/vercel.ts";

// The app stack: the Cloudflare backend, one copy per stage. Modules in infra/ hold each concern;
// runtime code is in src/. Three kinds of stage (docs/operations/deploy.md):
//   dev_*          `alchemy dev`: workerd + local D1/R2/Queues, Postgres in Docker, state on disk.
//   pr-*, live_*   real Cloudflare, a Neon branch of prod's project, secrets from Doppler `stg`.
//   prod           owns the Neon project, Axiom export and incident.io alerts; Doppler `prd`.
// Account-level setup (deploy token, CI secrets, GitHub, Vercel projects) is infra/bootstrap.run.ts.

export type { ApiEnv } from "./infra/api.ts";

export default Alchemy.Stack(
	"Arkie",
	{
		providers: Layer.mergeAll(
			Cloudflare.providers(),
			Neon.providers(),
			Axiom.providers(),
			Docker.providers(),
			LocalMigrationsProvider(),
			VercelProviders(),
		),
		// dev_* stages keep state in .alchemy/ so they need no Cloudflare account (and `pnpm dev:destroy`
		// finds them). Deployed stages share remote state (a Worker + Durable Object in the account)
		// across machines, worktrees and CI. Keyed on the stage name, not the command, for that reason.
		state: Layer.unwrap(
			Effect.map(Effect.service(Stage), (stage) => (isDevStage(stage) ? Alchemy.localState() : Cloudflare.state())),
		),
		// Deployed stages: Doppler wins over the shell, so a stray local variable can't reach prod.
		// dev_* stages: the environment scripts/dev.ts builds (Doppler CLI or the root .env).
		secrets: ({ stage }) =>
			isDevStage(stage)
				? [Alchemy.Secrets.ProcessEnv()]
				: [Alchemy.Secrets.ProcessEnv(), Doppler.Secrets({ project: "arkie", config: dopplerConfig(stage) })],
	},
	Effect.gen(function* () {
		const { stage } = yield* Alchemy.Stack;
		if (isDevStage(stage) !== (yield* AlchemyContext).dev) {
			return yield* Effect.die(
				`Stage ${stage}: dev_* stages run only under \`alchemy dev\`, and \`alchemy dev\` only on dev_* stages.`,
			);
		}
		// Axiom export is opt-in: prod with AXIOM_TOKEN set in Doppler. Otherwise Cloudflare's own logs only.
		const axiom = yield* optional("AXIOM_TOKEN");
		const destinations = isProdStage(stage) && Option.isSome(axiom) ? yield* Observability : { logs: [], traces: [] };
		// The heartbeat feeds a monitor, so it only runs where the monitors do.
		const api = yield* Api(destinations, destinations.logs.length > 0 ? ["*/5 * * * *"] : []);
		const { label } = yield* Database;

		yield* Cloudflare.Queues.Consumer("ChatEventsConsumer", {
			queueId: (yield* ChatEvents).queueId,
			scriptName: api.workerName,
			settings: { batchSize: 50, maxRetries: 3, maxWaitTimeMs: 2000 },
		});

		// Point the web app at this stage's API: prod's Production env, or a PR's own preview branch.
		// Skipped without VERCEL_TOKEN (and locally). Vercel applies it to the next build of that target.
		const vercel = yield* optional("VERCEL_TOKEN");
		const branch = yield* optional("GITHUB_HEAD_REF");
		if (Option.isSome(vercel) && isProdStage(stage)) {
			yield* VercelEnv("WebApiUrl", {
				project: "arkie-web",
				key: "VITE_API_URL",
				value: api.url.as<string>(),
				target: ["production"],
			});
			// Previews without an API of their own (no preview:api label) use prod's; a PR's branch value wins.
			yield* VercelEnv("WebApiUrlPreview", {
				project: "arkie-web",
				key: "VITE_API_URL",
				value: api.url.as<string>(),
				target: ["preview"],
			});
		}
		if (Option.isSome(vercel) && isPreviewStage(stage) && Option.isSome(branch)) {
			yield* VercelEnv("WebApiUrl", {
				project: "arkie-web",
				key: "VITE_API_URL",
				value: api.url.as<string>(),
				target: ["preview"],
				gitBranch: branch.value,
			});
		}

		return { url: api.url.as<string>(), database: label };
	}),
);
