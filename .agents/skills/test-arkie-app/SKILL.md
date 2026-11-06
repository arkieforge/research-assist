---
name: test-arkie-app
description: Verify a user-visible change in Arkie's web app or marketing site in a real browser, against the local stack, with screenshots for the PR. Use after changing anything in apps/web or apps/marketing, or API behavior the UI shows.
---

# Test the Arkie app

1. **Start the stack** unless it's already running in this checkout: run `vp run dev` as a tracked background command and wait for the `[api] … Done:` line and the `[dev] Starting:` banner. Read this checkout's ports from the banner; don't assume 3000.
2. **Open the page** in T3 Code's preview browser (`preview_open`, then `preview_navigate` to `{kind: "environment-port", port: <web port>}`) so the developer can watch. Outside T3, use `agent-browser` or the `playwright-cli` skill and record the run.
3. **Sign in** with a Clerk test user. On a Clerk development instance any `+clerk_test` email works with code `424242`. Never use a real person's account. For a sidebar with chats and an artifact, run `vp run seed` first and sign in as `seed+clerk_test@example.com`.
4. **Walk the change, then its edges:** the path you changed; reload mid-stream (the chat must resume); a second tab on the same chat; signed out (chat routes must refuse); the narrow viewport (`preview_resize` to 390px); dark mode is the default.
5. **Model turns cost money.** Without `ARKIE_ANTHROPIC_API_KEY` the chat answers with a fixed notice, which still exercises the socket, persistence and the sidebar. Use a real key only when the change depends on model output.
6. **Capture evidence:** before/after screenshots of the changed screen (`preview_snapshot` with `save: true`), a short recording for motion. Save them outside the worktree and attach them to the PR, never commit them.
7. **Stop what you started:** Ctrl-C your `vp run dev` (it stops its own process groups) and close the tabs you opened. Never kill processes by name.

Report what you checked, what you saw, and anything you couldn't check.
