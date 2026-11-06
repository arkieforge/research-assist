/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_CLERK_PUBLISHABLE_KEY: string;
	/** The API Worker (apps/api): http://localhost:8787 in dev, its workers.dev or custom domain otherwise. */
	readonly VITE_API_URL: string;
	readonly VITE_POSTHOG_KEY?: string;
	readonly VITE_POSTHOG_HOST?: string;
}
