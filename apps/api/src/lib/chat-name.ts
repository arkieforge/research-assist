// Shared with apps/web (@arkie/api/chat-name): keep this file free of imports.
// A ChatAgent instance is named `${userId}.${chatId}`, so ownership is checkable from the URL alone,
// before the Durable Object is ever woken. Clerk user ids (`user_…`) never contain a dot.

export const chatName = (userId: string, chatId: string) => `${userId}.${chatId}`;

/** The owner encoded in an instance name, or null when the name is malformed. */
export function ownerOf(name: string): string | null {
	const dot = name.indexOf(".");
	return dot > 0 && dot < name.length - 1 ? name.slice(0, dot) : null;
}

/** The chat id part of an instance name (what the /c/:chatId URL carries). */
export const chatIdOf = (name: string) => name.slice(name.indexOf(".") + 1);
