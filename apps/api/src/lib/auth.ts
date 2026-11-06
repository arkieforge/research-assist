import { verifyToken } from "@clerk/backend";

/**
 * The Clerk user behind a request from the web app, or null. The token is a Clerk session JWT:
 * `Authorization: Bearer` on fetches, `?token=` on WebSocket connects (browsers can't set headers there).
 */
export async function userIdOf(request: Request, env: Env): Promise<string | null> {
	const header = request.headers.get("Authorization");
	const token = header?.startsWith("Bearer ") ? header.slice(7) : new URL(request.url).searchParams.get("token");
	if (!token) return null;
	// verifyToken throws on a malformed token (despite returning { errors } for an invalid one): both are "no user".
	const result = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY }).catch(() => null);
	// Clerk's JwtPayload intersection collapses to {} under TypeScript 7, so read the claim defensively.
	const sub: unknown = (result?.data as { sub?: unknown } | undefined)?.sub;
	return typeof sub === "string" ? sub : null;
}
