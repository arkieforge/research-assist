import { verifyToken } from "@clerk/backend";

/**
 * The Clerk user behind a request from the web app, or null. The token is a Clerk session JWT:
 * `Authorization: Bearer` on fetches, `?token=` on WebSocket connects (browsers can't set headers there).
 */
export async function userIdOf(request: Request, env: Env): Promise<string | null> {
	const header = request.headers.get("Authorization");
	const token = header?.startsWith("Bearer ") ? header.slice(7) : new URL(request.url).searchParams.get("token");
	if (!token) return null;
	// The package's verifyToken resolves to the JWT payload and throws on a bad token: that is "no user".
	const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY }).catch(() => null);
	// Clerk's JwtPayload intersection collapses to {} under TypeScript 7, so read the claim defensively.
	const sub: unknown = (payload as { sub?: unknown } | null)?.sub;
	return typeof sub === "string" ? sub : null;
}
