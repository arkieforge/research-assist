import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { request } from "./http-resource.ts";

// Vercel as Alchemy resources (there is no Alchemy v2 Vercel provider). Auth: VERCEL_TOKEN, plus
// VERCEL_TEAM_ID when the projects live in a team. https://vercel.com/docs/rest-api

const API = "https://api.vercel.com";
const withTeam = (path: string) =>
	Config.String("VERCEL_TEAM_ID").pipe(
		Config.withDefault(""),
		Effect.map((team) => `${API}${path}${team ? `${path.includes("?") ? "&" : "?"}teamId=${team}` : ""}`),
		Effect.orDie,
	);
const vercel = <T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown) =>
	withTeam(path).pipe(Effect.flatMap((url) => request<T>("Vercel", "VERCEL_TOKEN", method, url, body)));

/** A Vercel project deploying one app of this monorepo from GitHub. Created if missing, updated in place. */
export type VercelProject = Resource<
	"Arkie.VercelProject",
	{ name: string; rootDirectory: string; framework: string | null; repo: string },
	{ id: string; name: string }
>;
export const VercelProject = Resource<VercelProject>("Arkie.VercelProject");

/** One environment variable on a Vercel project, upserted by key, target and branch. */
export type VercelEnv = Resource<
	"Arkie.VercelEnv",
	{
		project: string;
		key: string;
		value: string | Redacted.Redacted;
		target: Array<"production" | "preview" | "development">;
		/** Preview only: scope the value to one git branch (a PR's preview). */
		gitBranch?: string;
	},
	{ id: string }
>;
export const VercelEnv = Resource<VercelEnv>("Arkie.VercelEnv");

const ProjectProvider = () =>
	Provider.succeed(VercelProject, {
		reconcile: ({ news }) =>
			Effect.gen(function* () {
				const settings = {
					framework: news.framework,
					rootDirectory: news.rootDirectory,
					// Build only when this app or its workspace deps changed.
					enableAffectedProjectsDeployments: true,
					// Fork PRs build only after a member approves: previews run with real env (and prod's API).
					gitForkProtection: true,
				};
				const existing = yield* vercel<{ id: string; name: string }>("GET", `/v9/projects/${news.name}`).pipe(
					Effect.catchTag("ApiError", (e) => (e.status === 404 ? Effect.succeed(undefined) : Effect.fail(e))),
				);
				const project = existing
					? yield* vercel<{ id: string; name: string }>("PATCH", `/v9/projects/${existing.id}`, settings)
					: yield* vercel<{ id: string; name: string }>("POST", "/v11/projects", {
							name: news.name,
							...settings,
							gitRepository: { type: "github", repo: news.repo },
						});
				return { id: project.id, name: project.name };
			}),
		delete: ({ output }) => vercel("DELETE", `/v9/projects/${output.id}`).pipe(Effect.asVoid),
		read: ({ output }) => Effect.succeed(output),
		list: () => Effect.succeed([]),
	});

const EnvProvider = () =>
	Provider.succeed(VercelEnv, {
		reconcile: ({ news }) =>
			Effect.gen(function* () {
				const value = Redacted.isRedacted(news.value) ? Redacted.value(news.value) : news.value;
				const res = yield* vercel<{ created: { id: string } | Array<{ id: string }> }>(
					"POST",
					`/v10/projects/${news.project}/env?upsert=true`,
					{
						key: news.key,
						value,
						type: Redacted.isRedacted(news.value) ? "encrypted" : "plain",
						target: news.target,
						...(news.gitBranch ? { gitBranch: news.gitBranch } : {}),
					},
				);
				const created = Array.isArray(res.created) ? res.created[0] : res.created;
				return { id: created?.id ?? "" };
			}),
		delete: ({ olds, output }) => vercel("DELETE", `/v9/projects/${olds.project}/env/${output.id}`).pipe(Effect.asVoid),
		read: ({ output }) => Effect.succeed(output),
		list: () => Effect.succeed([]),
	});

export const VercelProviders = () => Layer.mergeAll(ProjectProvider(), EnvProvider());
