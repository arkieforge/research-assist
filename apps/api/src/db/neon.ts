import { drizzle } from "drizzle-orm/node-postgres";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Neon Postgres (through Hyperdrive): the cross-chat index. Message history lives in each
// chat's Durable Object; this table is what the sidebar lists.
export const chats = pgTable(
	"chats",
	{
		// The ChatAgent instance name: `${userId}:${chatId}` (see src/lib/chat-name.ts).
		id: text("id").primaryKey(),
		userId: text("user_id").notNull(),
		title: text("title").notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [index("chats_user_updated_idx").on(t.userId, t.updatedAt)],
);

/** A Drizzle client over the Worker's Hyperdrive binding. One per request; Hyperdrive does the pooling. */
export const neon = (hyperdrive: Hyperdrive) => drizzle(hyperdrive.connectionString);
