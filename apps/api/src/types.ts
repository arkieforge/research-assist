// Response shapes of the API's JSON routes (src/worker.ts), imported by apps/web as @arkie/api/types.

/** GET /chats: the signed-in user's chats, newest first. */
export type ChatSummary = {
	/** ChatAgent instance name (`${userId}.${chatId}`). */
	id: string;
	title: string;
	/** ISO timestamp. */
	updatedAt: string;
};
