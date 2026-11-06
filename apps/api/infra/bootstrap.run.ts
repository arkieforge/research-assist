import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Doppler from "@alchemy.run/doppler";
import * as GitHub from "@alchemy.run/github";
import * as Alchemy from "alchemy";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import { optional } from "./config.ts";
import { DopplerProviders, DopplerSecret, DopplerServiceToken } from "./doppler.ts";
import { VercelEnv, VercelProject, VercelProviders } from "./vercel.ts";

// The bootstrap stack: account-level setup the app stack (alchemy.run.ts) and CI depend on, as code.
// Run by an admin, once and after changes, with `pnpm infra:bootstrap` (docs/operations/bootstrap.md).
//
//   Cloudflare  (opt-in) a scoped deploy token for Souhardo02's account, written to Doppler
//   Doppler     CLOUDFLARE_ACCOUNT_ID in arkie/stg and arkie/prd; read-only service tokens for CI
//   GitHub      production/preview/preview-cleanup environments holding those tokens, the labels the
//               templates and workflows use, and the main-branch ruleset
//   Vercel      the arkie-web and arkie-marketing projects and web's production env (when VERCEL_TOKEN is set)
//
// Contributors never run this; it only turns admin credentials into the narrow ones everyone else uses.

const REPO = { owner: "arkieforge", repository: "research-assist" } as const;
const ACCOUNT_ID = "47c8dbb0d5e1a36392a9c9d34bedff47"; // Souhardo02@gmail.com's Account
const PROJECT = "arkie";

/** What the app stack and CI need from Cloudflare, and nothing more. Names are Cloudflare's permission groups. */
const DEPLOY_PERMISSIONS = [
	"Workers Scripts Write",
	// Alchemy's Cloudflare state store keeps its auth token in Secrets Store.
	"Secrets Store Write",
	"Workers KV Storage Write",
	"Workers R2 Storage Write",
	"D1 Write",
	"Queues Write",
	"Hyperdrive Write",
	"Workers Observability Write",
	"Workers Tail Read",
	"Account Settings Read",
] as const;

const LABELS: Array<{ name: string; color: string; description: string }> = [
	{ name: "bug", color: "d73a4a", description: "Something is broken or behaving incorrectly." },
	{ name: "enhancement", color: "a2eeef", description: "Requested improvement or new capability." },
	{ name: "needs-triage", color: "fbca04", description: "Needs a maintainer to confirm and categorize." },
	{
		name: "needs more info",
		color: "c5def5",
		description: "Waiting on the reporter. Closes after 7 days without a reply.",
	},
	{ name: "via-triage", color: "5319e7", description: "Filed by an agent following .github/triage/PLAYBOOK.md." },
	{ name: "incident", color: "b60205", description: "Production impact. Linked to an incident.io incident." },
	{ name: "preview:api", color: "1d76db", description: "Deploy this PR's API as Alchemy stage pr-<n>." },
	{ name: "area:api", color: "0e8a16", description: "apps/api (Cloudflare Worker, agents, data)." },
	{ name: "area:web", color: "0e8a16", description: "apps/web (TanStack Start on Vercel)." },
	{ name: "area:marketing", color: "0e8a16", description: "apps/marketing (Astro on Vercel)." },
	{ name: "area:infra", color: "0e8a16", description: "Alchemy stacks, CI/CD, Doppler, dev tooling." },
];

/** Web's production env vars, read from Doppler arkie/prd. Missing ones are skipped. */
const WEB_PRODUCTION_ENV = [
	["VITE_CLERK_PUBLISHABLE_KEY", false],
	["CLERK_PUBLISHABLE_KEY", false],
	["CLERK_SECRET_KEY", true],
	["VITE_POSTHOG_KEY", false],
	["VITE_POSTHOG_HOST", false],
] as const;

export default Alchemy.Stack(
	"ArkieBootstrap",
	{
		providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers(), DopplerProviders(), VercelProviders()),
		state: Cloudflare.state(),
		// Doppler prd supplies the Cloudflare credentials (state store) and web's production env;
		// the admin's shell supplies DOPPLER_ADMIN_TOKEN, GITHUB_TOKEN and VERCEL_TOKEN.
		secrets: [Alchemy.Secrets.ProcessEnv(), Doppler.Secrets({ project: PROJECT, config: "prd" })],
	},
	Effect.gen(function* () {
		// 1. Cloudflare (opt-in): mint a scoped deploy token and put it in Doppler, replacing a hand-made one.
		// Needs a credential that can create API tokens (an Alchemy profile with an API key; OAuth can't).
		// Without BOOTSTRAP_MINT_DEPLOY_TOKEN, deploys keep using the token already in Doppler.
		if (Option.isSome(yield* optional("BOOTSTRAP_MINT_DEPLOY_TOKEN"))) {
			const deploy = yield* Cloudflare.ApiToken.AccountApiToken("DeployToken", {
				accountId: ACCOUNT_ID,
				policies: [
					{
						effect: "allow",
						permissionGroups: [...DEPLOY_PERMISSIONS],
						resources: { [`com.cloudflare.api.account.${ACCOUNT_ID}`]: "*" },
					},
				],
			});
			for (const config of ["stg", "prd"] as const) {
				yield* DopplerSecret(`CloudflareToken-${config}`, {
					project: PROJECT,
					config,
					name: "CLOUDFLARE_API_TOKEN",
					value: deploy.value,
				});
			}
		}

		// 2. Doppler: the account id next to the token in every cloud config, and read-only CI tokens.
		for (const config of ["stg", "prd"] as const) {
			yield* DopplerSecret(`CloudflareAccount-${config}`, {
				project: PROJECT,
				config,
				name: "CLOUDFLARE_ACCOUNT_ID",
				value: ACCOUNT_ID,
			});
		}
		const ciPrd = yield* DopplerServiceToken("CiTokenPrd", {
			project: PROJECT,
			config: "prd",
			name: "github-production",
		});
		const ciStg = yield* DopplerServiceToken("CiTokenStg", { project: PROJECT, config: "stg", name: "github-preview" });
		// Its own token, so teardown access can be revoked without touching previews.
		const ciCleanup = yield* DopplerServiceToken("CiTokenCleanup", {
			project: PROJECT,
			config: "stg",
			name: "github-preview-cleanup",
		});

		// 3. GitHub: environments the workflows deploy from, each holding only its Doppler token. An
		// environment's secrets reach any job that names it, so each one is closed off:
		//   production       only from main (merged code), plus reviewers when set
		//   preview          runs PR code, so it can't be branch-limited: reviewers are required (fail closed)
		//   preview-cleanup  only from main, where the teardown workflow runs (pull_request_target, schedule)
		const reviewerList = Option.map(yield* optional("GITHUB_DEPLOY_REVIEWERS"), (list) =>
			list
				.split(",")
				.map((login) => login.trim())
				.filter(Boolean),
		);
		if (Option.isNone(reviewerList) || reviewerList.value.length === 0) {
			return yield* Effect.die(
				"GITHUB_DEPLOY_REVIEWERS is required (comma-separated GitHub logins): the preview environment runs PR code with real credentials and must wait for a reviewer.",
			);
		}
		const reviewers = {
			reviewers: { users: reviewerList.value },
			// With one reviewer, blocking self-review would leave nobody able to approve their own PR's deploy.
			preventSelfReview: reviewerList.value.length > 1,
		};
		const mainOnly = { deploymentBranchPolicy: { customBranchPolicies: ["main"] } };
		const environments = [
			{ name: "production", token: ciPrd.token, gate: { ...mainOnly, ...reviewers } },
			{ name: "preview", token: ciStg.token, gate: reviewers },
			{ name: "preview-cleanup", token: ciCleanup.token, gate: mainOnly },
		];
		for (const env of environments) {
			const environment = yield* GitHub.Environment(`Env-${env.name}`, { ...REPO, name: env.name, ...env.gate });
			yield* GitHub.Secret(`DopplerToken-${env.name}`, {
				...REPO,
				environment,
				name: "DOPPLER_TOKEN",
				value: env.token,
			});
		}
		for (const label of LABELS) {
			yield* GitHub.Label(`Label-${label.name.replace(/[^a-z0-9]/gi, "-")}`, { ...REPO, ...label });
		}
		// main takes changes only through PRs that pass CI. The repo is public, so rulesets, environments
		// and reviewers are all available on GitHub's free plan.
		yield* GitHub.Ruleset("ProtectMain", {
			...REPO,
			name: "main",
			enforcement: "active",
			target: "branch",
			conditions: { include: ["~DEFAULT_BRANCH"] },
			requiredStatusChecks: { checks: [{ context: "CI" }] },
			pullRequest: { requiredApprovingReviewCount: 0, allowedMergeMethods: ["squash"] },
			nonFastForward: true,
			deletion: true,
		});

		// 4. Vercel: both projects, imported from this repo, and web's production env. Retained: deleting
		// a Vercel project drops its domains and deployment history.
		if (Option.isSome(yield* optional("VERCEL_TOKEN"))) {
			const repo = `${REPO.owner}/${REPO.repository}`;
			yield* VercelProject("Web", { name: "arkie-web", rootDirectory: "apps/web", framework: null, repo }).pipe(
				RemovalPolicy.retain(),
			);
			yield* VercelProject("Marketing", {
				name: "arkie-marketing",
				rootDirectory: "apps/marketing",
				framework: "astro",
				repo,
			}).pipe(RemovalPolicy.retain());
			for (const [key, secret] of WEB_PRODUCTION_ENV) {
				const value = yield* optional(key);
				if (Option.isNone(value)) continue;
				yield* VercelEnv(`WebEnv-${key}`, {
					project: "arkie-web",
					key,
					value: secret ? Redacted.make(value.value) : value.value,
					target: ["production"],
				});
			}
		}

		return { environments: environments.map((e) => e.name) };
	}),
);
