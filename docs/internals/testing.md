# Testing

These rules apply to agents and to reviewers. Keep them in sync with the Verifying section of AGENTS.md.

- **Test behavior that can break:** the auth gate and ownership checks, the queue consumer's dedupe and upsert ordering, stage selection (`apps/api/infra/stages.ts`), migrations, parsing of external formats (tokens, model output), and the exact logic a bug fix changed.
- **Leave out:** what the type system already guarantees, copy text, smoke runs, mock-call mirrors, callback wiring, and markup rendered from props.
- **Extend before you add.** If a test file covers the module, add a case or an assertion there.
- **One layer.** Test at the lowest layer that fails on `main`. Don't repeat the case in a wrapper or at each call site.
- **Bug fixes:** a failing test first (the fewest that fail on `main` for that reason), then the fix. Visual-only bugs get before/after screenshots instead.
- **No sleeps, no retries, no per-test timeouts.** Await the event that marks the milestone. A test that needs a timeout to pass is wrong.
- **No real model calls in tests.** Inject the model; real turns cost money and are nondeterministic.
- **Where tests live:** next to the code (`*.test.ts`), run by Vitest per package. `scripts/*.test.ts` use `node:test` because scripts run before dependencies are installed.
