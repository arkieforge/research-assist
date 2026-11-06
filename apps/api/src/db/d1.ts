import { drizzle } from "drizzle-orm/d1";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// D1: metadata for HTML artifacts (visualizations the model renders). The HTML body lives in R2
// under the same id; this table answers "which artifacts belong to this chat or user".
export const artifacts = sqliteTable("artifacts", {
	id: text("id").primaryKey(),
	chatId: text("chat_id").notNull(),
	userId: text("user_id").notNull(),
	title: text("title").notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const d1 = (db: D1Database) => drizzle(db);
