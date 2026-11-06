# Contributing

Setup: [development runbook](docs/operations/development.md). It's `vp run dev` and two Clerk keys; `vp run doctor` tells you what's missing.

Report bugs and propose features with the [issue forms](.github/ISSUE_TEMPLATE). Search first.

<a id="prior-approval"></a>

## Agree on the problem first

Features and intentional behavior changes need an issue where a maintainer agreed on the direction and scope. Link that comment in the PR. A substantial bug fix links an issue that establishes the actual failure and the intended behavior. A small, focused fix for an obvious bug can skip the issue: explain the defect and why the fix is obviously right.

<a id="one-problem"></a>

## One problem per PR

A PR solves one underlying problem. Include every change that problem needs (API, web, tests, docs, migrations) and explain how they relate when it isn't obvious. An adjacent cleanup, refactor or second fix is its own PR. Count problems, not files or lines.

<a id="verification"></a>

## Show that it works

Say how you established the problem, what you ran or checked, and what you saw. Say what you couldn't check. "Tests pass" alone doesn't show the change works.

- Behavior that can break gets a focused test ([testing rules](docs/internals/testing.md)). Bug fixes start with a test that fails on `main`.
- UI changes need before/after screenshots; motion or timing needs a short recording.
- Infra changes show the `vp run dev` plan, or a `preview:api` deployment for cloud-only resources.

Attach evidence to the PR. Never commit PR-only screenshots or recordings.

## Conventions

- PR titles are conventional commits in plain language: `fix(web): new chats no longer flash the empty state`. Scopes: `api`, `web`, `marketing`, `infra`, `docs`. PRs are squash-merged, so the title becomes the commit.
- `vp run check:changed` passes before you ask for review (CI runs `vp run check`). The pre-commit hook (`vp staged`) formats and lints staged files.
- New secrets go in every Doppler config that needs them and in [docs/operations/secrets.md](docs/operations/secrets.md).
- Follow [AGENTS.md](AGENTS.md), especially the documentation rules: decisions and traps in `docs/internals/`, procedures in `docs/operations/`, nothing that just restates the code.

## Review

`size:*` labels are context for reviewers, not rules. A PR that skips the steps above can be closed with a note saying which rule it missed and how to fix it; correct it and ask for another look.
