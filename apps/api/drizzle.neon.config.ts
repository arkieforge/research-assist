import { defineConfig } from "drizzle-kit";

// Generates reviewed SQL into migrations/neon; Neon.Branch applies it on deploy (alchemy.run.ts).
export default defineConfig({ dialect: "postgresql", schema: "./src/db/neon.ts", out: "./migrations/neon" });
