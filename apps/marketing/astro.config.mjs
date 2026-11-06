import { defineConfig } from "astro/config";

// Static output: Vercel serves dist/ directly, no adapter needed. Add @astrojs/vercel only for SSR routes.
export default defineConfig({
	site: process.env.SITE_URL ?? "http://localhost:4321",
	// `pnpm dev --share` serves this over the tailnet; the dev server rejects Host headers it doesn't know.
	server: process.env.DEV_SHARE_HOST ? { host: "127.0.0.1", allowedHosts: [process.env.DEV_SHARE_HOST] } : {},
});
