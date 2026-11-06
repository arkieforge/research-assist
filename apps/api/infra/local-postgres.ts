import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as Docker from "@alchemy.run/docker";
import { ALCHEMY_DEFAULT_TABLE, applyMigrations, withPgExecutor } from "@alchemy.run/sql/Migrations";
import * as Provider from "alchemy/Provider";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

// `alchemy dev` only: a Postgres in Docker stands in for Neon, so a fresh checkout runs with no
// Neon account. Deployed stages never use this (see Database in alchemy.run.ts).

const USER = "arkie";
const PASSWORD = "arkie";
const DATABASE = "arkie";

/**
 * Applies the migrations in `dir` to a Postgres URL. `digest` changes with the files, which re-runs it.
 * `container` is only there to order this after the container (Alchemy orders by props' Outputs).
 */
export type LocalMigrations = Resource<
	"Arkie.LocalMigrations",
	{ url: string; dir: string; digest: string; container: string },
	{ digest: string }
>;
export const LocalMigrations = Resource<LocalMigrations>("Arkie.LocalMigrations");

export const LocalMigrationsProvider = () =>
	Provider.succeed(LocalMigrations, {
		reconcile: ({ news }) =>
			withPgExecutor(
				{ connectionString: news.url },
				(executor) => applyMigrations({ resolved: { dir: news.dir, table: ALCHEMY_DEFAULT_TABLE }, executor }),
				// The container accepts connections a few seconds after it starts; retry only the connect.
				{ retryConnect: { while: () => true, times: 30, interval: "1 second" } },
			).pipe(Effect.as({ digest: news.digest })),
		delete: () => Effect.void,
		read: ({ output }) => Effect.succeed(output),
		list: () => Effect.succeed([]),
	});

/** Hash of every file under `dir`, so adding or editing a migration re-applies. */
function digestOf(dir: string): string {
	const hash = createHash("sha256");
	for (const file of readdirSync(dir, { recursive: true, encoding: "utf8" }).toSorted()) {
		if (file.endsWith(".sql")) hash.update(file).update(readFileSync(join(dir, file)));
	}
	return hash.digest("hex");
}

/** A migrated Postgres on localhost:`port`, as a Hyperdrive origin. Data persists in a Docker volume per stage. */
export const LocalPostgres = (port: number, migrationsDir: string) =>
	Effect.gen(function* () {
		// Retained: the image is shared with anything else on the machine, so destroy must not remove it.
		const image = yield* Docker.RemoteImage("PostgresImage", {
			name: "postgres",
			tag: "17-alpine",
			alwaysPull: false,
		}).pipe(RemovalPolicy.retain());
		const data = yield* Docker.Volume("PostgresData");
		const container = yield* Docker.Container("Postgres", {
			image,
			environment: { POSTGRES_USER: USER, POSTGRES_PASSWORD: PASSWORD, POSTGRES_DB: DATABASE },
			ports: [{ external: port, internal: 5432 }],
			volumes: [{ hostPath: data.name, containerPath: "/var/lib/postgresql/data" }],
			healthcheck: { cmd: ["CMD-SHELL", `pg_isready -U ${USER} -d ${DATABASE}`], interval: "2 seconds", retries: 30 },
			start: true,
		});
		const url = `postgres://${USER}:${PASSWORD}@127.0.0.1:${port}/${DATABASE}`;
		yield* LocalMigrations("Migrations", {
			url,
			dir: migrationsDir,
			digest: digestOf(migrationsDir),
			container: container.name,
		});
		const origin = {
			scheme: "postgres",
			host: "127.0.0.1",
			port,
			database: DATABASE,
			user: USER,
			password: Redacted.make(PASSWORD),
		} as const;
		return { origin, dev: origin, label: `local postgres on :${port}` };
	});
