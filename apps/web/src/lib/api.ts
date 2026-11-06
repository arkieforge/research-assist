import type { ChatSummary } from "@arkie/api/types";

/** Base URL of the API Worker. Read lazily so a missing value fails the request, not the import. */
export function apiUrl(): string {
	const url = import.meta.env.VITE_API_URL;
	if (!url) throw new Error("VITE_API_URL is not set (apps/web/.env.example)");
	return url;
}

/** Calls an API JSON route with the user's Clerk session token. */
async function get<T>(path: string, token: string | null): Promise<T> {
	const res = await fetch(new URL(path, apiUrl()), { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
	return res.json();
}

export const fetchChats = (token: string | null) => get<ChatSummary[]>("/chats", token);

/** A render_html artifact's HTML, shown via iframe srcdoc. */
export async function fetchArtifact(id: string, token: string | null): Promise<string> {
	const res = await fetch(new URL(`/artifacts/${id}`, apiUrl()), { headers: { Authorization: `Bearer ${token}` } });
	if (!res.ok) throw new Error(`GET /artifacts/${id} failed: ${res.status}`);
	return res.text();
}
