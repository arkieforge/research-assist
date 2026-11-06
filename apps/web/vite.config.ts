import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, lazyPlugins } from "vite-plus";

// Nitro builds the server for wherever it runs: on Vercel it emits Vercel's output format automatically.
export default defineConfig({
	resolve: { tsconfigPaths: true },
	// `pnpm dev --share` serves this over the tailnet; Vite rejects Host headers it doesn't know.
	server: process.env.DEV_SHARE_HOST ? { host: "127.0.0.1", allowedHosts: [process.env.DEV_SHARE_HOST] } : {},
	plugins: lazyPlugins(() => [tanstackStart(), nitro(), viteReact(), tailwindcss()]),
});
