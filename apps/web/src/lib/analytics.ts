import posthog from "posthog-js";

/**
 * Starts PostHog in the browser when VITE_POSTHOG_KEY is set; a no-op otherwise (dev without a key, SSR).
 * It also captures uncaught errors: Vercel's Hobby plan can't send web logs to Axiom.
 */
export function startAnalytics(userId: string | null | undefined) {
	const key = import.meta.env.VITE_POSTHOG_KEY;
	if (!key || typeof window === "undefined") return;
	if (!posthog.__loaded) {
		posthog.init(key, {
			api_host: import.meta.env.VITE_POSTHOG_HOST,
			person_profiles: "identified_only",
			capture_exceptions: true,
		});
	}
	if (userId) posthog.identify(userId);
	else posthog.reset();
}
