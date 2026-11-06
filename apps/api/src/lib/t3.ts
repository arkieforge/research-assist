/**
 * Whether this chat's owner may use T3 Code tools. The T3 token drives the deployer's own T3
 * environment (it can start and steer agents there), so only allowlisted Clerk ids get it. Fails
 * closed: no owner or an empty list means no T3 tools. shortcut: one shared token; per-user T3
 * sign-in replaces this when the chat relays to T3.
 */
export function t3Allowed(userId: string | null, allowList: string): boolean {
	return !!userId && allowList.split(",").some((id) => id.trim() === userId);
}
