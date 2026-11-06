import { defineConfig } from "drizzle-kit";

// Generates reviewed SQL into migrations/d1; the D1 Database resource applies it on deploy and in dev.
export default defineConfig({ dialect: "sqlite", schema: "./src/db/d1.ts", out: "./migrations/d1" });
