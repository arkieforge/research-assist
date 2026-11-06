# Arkie

An AI chat app on Cloudflare. Every chat is a Durable Object agent that streams replies, draws HTML visualizations, and works with T3 Code threads over MCP.

| App                                | Stack                                                                             | Runs on    |
| ---------------------------------- | --------------------------------------------------------------------------------- | ---------- |
| [`apps/api`](apps/api)             | Workers, Durable Objects (Agents SDK), Queues, D1, R2, Hyperdrive → Neon, Alchemy | Cloudflare |
| [`apps/web`](apps/web)             | TanStack Start, React 19, Tailwind, Clerk, PostHog                                | Vercel     |
| [`apps/marketing`](apps/marketing) | Astro                                                                             | Vercel     |

## Run it

[Vite+](https://viteplus.dev) (`curl -fsSL https://vite.plus | bash`; it brings Node and pnpm) and Docker, then:

```sh
vp run dev
```

The first run installs everything and tells you which secrets are missing: team members log in to Doppler, everyone else copies `.env.example` to `.env` and adds two Clerk keys. No Cloudflare or Neon account is needed locally; Postgres runs in Docker. In T3 Code, it's the **Dev** button. Stuck? `vp run doctor`. Details: [docs/operations/development.md](docs/operations/development.md).

## Ship it

PRs run CI. Merging to `main` deploys the API to Cloudflare (`prod`), and Vercel deploys web and marketing. Label a PR `preview:api` for its own API stage. See [docs/operations/deploy.md](docs/operations/deploy.md).

## More

- [AGENTS.md](AGENTS.md): how agents (and people) work in this repo
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/](docs/README.md): runbooks and architecture
- [Triage playbook](.github/triage/PLAYBOOK.md) and [security policy](.github/SECURITY.md)
