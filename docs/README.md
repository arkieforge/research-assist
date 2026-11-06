# Arkie docs

Start with the [development runbook](./operations/development.md) and the [contribution guide](../CONTRIBUTING.md). Agents: [AGENTS.md](../AGENTS.md).

## Runbooks

- [Development](./operations/development.md): first run, worktrees, ports, local data, troubleshooting
- [Deploys and stages](./operations/deploy.md): prod, PR previews, personal stages, Vercel, rollback
- [Secrets](./operations/secrets.md): Doppler projects and configs, what lives where
- [Bootstrap](./operations/bootstrap.md): the admin-run stack for the deploy token, CI secrets, GitHub and Vercel
- [Observability and incidents](./operations/observability.md): Axiom, incident.io, logs, responding to an alert

## Internals

Decisions, cross-app constraints and traps the source doesn't explain. Follow the [documentation rules](../AGENTS.md#documentation) before adding a page.

- [Architecture overview](./internals/overview.md)
- [Testing](./internals/testing.md)
