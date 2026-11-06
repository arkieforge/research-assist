import { auth } from "@clerk/tanstack-react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { fetchChats } from "#/lib/api.ts";

/** The signed-in user's chats, fetched server-side from the API with their Clerk token. */
export const listChats = createServerFn({ method: "GET" }).handler(async () => {
	const { userId, getToken } = await auth();
	if (!userId) return [];
	return fetchChats(await getToken());
});
