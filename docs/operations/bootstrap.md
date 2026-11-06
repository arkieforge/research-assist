# Bootstrap

`apps/api/infra/bootstrap.run.ts` is a second Alchemy stack, run by an admin, that turns admin credentials into the narrow ones everyone else uses. Contributors never run it.

| Creates                                                                                | Where                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `CLOUDFLARE_ACCOUNT_ID` next to the Cloudflare token                                   | Doppler `arkie/stg` and `arkie/prd`                     |
| Read-only Doppler service tokens for `prd` and `stg`                                   | Doppler                                                 |
| `production`, `preview`, `preview-cleanup` environments, each with its `DOPPLER_TOKEN` | GitHub `arkieforge/research-assist`                     |
| Every label the templates and workflows use                                            | GitHub                                                  |
| The `main` ruleset (PRs only, squash, `CI` must pass, no force-push), opt-in           | GitHub                                                  |
| `arkie-web` and `arkie-marketing` projects, web's env from Doppler `prd` and `stg`     | Vercel, when `VERCEL_TOKEN` is set                      |
| A read-only Axiom query token, as `AXIOM_QUERY_TOKEN`                                  | Doppler `dev` and `stg`, when `AXIOM_TOKEN` is in `prd` |
| A scoped Cloudflare deploy token replacing the hand-made one, opt-in                   | Souhardo02's Cloudflare account, then Doppler           |

Rerunning is safe: unchanged resources are left alone, tokens are never re-minted, and Vercel projects are retained even if removed from the code.

## What the admin needs

| Credential                                                                                                                 | Why                                                                                         | How                                                                               |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Doppler login with write access to `arkie`                                                                                 | Read `prd` (Cloudflare credentials for the state store), write secrets, mint service tokens | `doppler login`; the script reads the CLI token itself                            |
| GitHub admin on `arkieforge/research-assist`                                                                               | Environments, secrets, labels, rulesets                                                     | `gh auth login`; the script passes `gh auth token`                                |
| `VERCEL_TOKEN` (optional), `VERCEL_TEAM_ID` if the projects live in a team                                                 | Vercel projects and env                                                                     | vercel.com/account/tokens                                                         |
| For `BOOTSTRAP_MINT_DEPLOY_TOKEN=1` only: an Alchemy profile with a Cloudflare API key or token that can create API tokens | Mint the scoped token; OAuth can't                                                          | `vp exec alchemy profile edit --add Cloudflare`, then run with `--profile <name>` |

Required from the shell: `GITHUB_DEPLOY_REVIEWERS=login1,login2`, who approves `production` and `preview` deploys. The bootstrap refuses to run without it, because `preview` runs PR code with real credentials. With two or more reviewers, nobody can approve their own deploy.

Optional: `BOOTSTRAP_MINT_DEPLOY_TOKEN=1` (see above).

The repo is public, which is what makes environments, reviewers and rulesets free; on a private repo they need a paid GitHub plan. Push the first commit to `main` before running the bootstrap: once the ruleset is on, `main` only accepts PRs.

## Run it

```sh
vp run infra:bootstrap:plan     # what would change
vp run infra:bootstrap          # apply (asks for confirmation)
```

Both run as stage `main`. Afterwards, everything in [secrets.md](./secrets.md) marked "bootstrap" is filled; add the rest (Clerk, Neon, model key) to Doppler, then the first `prod` deploy can run ([deploy.md](./deploy.md#first-prod-deploy)).

## Rotating

- Cloudflare token: replace `CLOUDFLARE_API_TOKEN` in Doppler `stg` and `prd` (or, if bootstrap minted it, `vp exec --filter @arkie/api alchemy destroy infra/bootstrap.run.ts --stage main --include DeployToken` and rerun). Deploys pick it up next run.
- A Doppler service token: `vp exec --filter @arkie/api alchemy destroy infra/bootstrap.run.ts --stage main --include CiTokenPrd` (or `CiTokenStg`), then `vp run infra:bootstrap`; the GitHub secret updates on the rerun.
