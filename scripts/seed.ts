// `vp run seed`: give this checkout's running local stack real data, so an agent never tests on an
// empty sidebar. Drives chats through the same path the browser uses (Clerk token, WebSocket to the
// ChatAgent, queue consumer into Postgres), so the Durable Objects, the chat index and artifacts all
// fill. With no model key the free Replay model answers. Node built-ins only.
//
//   vp run seed                 seed 3 chats as the seed user (needs `vp run dev` running)
//   vp run seed --api <url>     a stack on other ports than this checkout's preferred ones
//
// Sign in as SEED_EMAIL with code 424242 (Clerk development instances) to see the seeded chats.
import { chatName } from "../apps/api/src/lib/chat-name.ts";
import { dopplerDev, localEnv, preferredPorts } from "./lib/local.ts";

const SEED_EMAIL = "seed+clerk_test@example.com";
const PROMPTS = [
	"What can you do?",
	"Draw a chart of weekly signups",
	"Summarize this in one line: seeds make tests honest",
];

const fail = (message: string): never => {
	process.stderr.write(`[seed] ${message}\n`);
	process.exit(1);
};
const argv = process.argv.slice(2);
const apiFlag = argv.indexOf("--api");
const api =
	apiFlag === -1 ? `http://localhost:${preferredPorts().api}` : (argv[apiFlag + 1] ?? fail("--api needs a URL"));

const secretKey = localEnv(dopplerDev()).CLERK_SECRET_KEY;
if (!secretKey) fail("CLERK_SECRET_KEY is missing (Doppler arkie/dev or .env). `vp run doctor` says why.");
if (!secretKey?.startsWith("sk_test_")) fail("Refusing to seed: CLERK_SECRET_KEY is not a development instance key.");

const clerk = async <T>(path: string, body?: unknown): Promise<T> => {
	const res = await fetch(`https://api.clerk.com/v1${path}`, {
		method: body === undefined ? "GET" : "POST",
		headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	if (!res.ok) fail(`Clerk ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
	return res.json() as Promise<T>;
};

/** A fresh session token for the seed user (created on first use). They live about a minute. */
async function seedToken(): Promise<{ userId: string; token: () => Promise<string> }> {
	const found = await clerk<Array<{ id: string }>>(`/users?email_address=${encodeURIComponent(SEED_EMAIL)}`);
	const userId =
		found[0]?.id ??
		(
			await clerk<{ id: string }>("/users", {
				email_address: [SEED_EMAIL],
				skip_password_requirement: true,
				first_name: "Seed",
			})
		).id;
	const session = await clerk<{ id: string }>("/sessions", { user_id: userId });
	return { userId, token: async () => (await clerk<{ jwt: string }>(`/sessions/${session.id}/tokens`, {})).jwt };
}

/** Sends one user message over the chat's WebSocket and resolves when the agent's reply is done. */
function sendTurn(name: string, token: string, text: string): Promise<void> {
	const url = `${api.replace(/^http/, "ws")}/agents/chat-agent/${name}?token=${encodeURIComponent(token)}`;
	const socket = new WebSocket(url);
	const id = crypto.randomUUID();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`no reply within 60s for "${text}"`)), 60_000);
		socket.addEventListener("error", () =>
			reject(new Error(`WebSocket to ${api} failed (is \`vp run dev\` running?)`)),
		);
		socket.addEventListener("open", () => {
			const messages = [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] }];
			const body = JSON.stringify({ messages, trigger: "submit-message" });
			socket.send(JSON.stringify({ type: "cf_agent_use_chat_request", id, init: { method: "POST", body } }));
		});
		socket.addEventListener("message", (event) => {
			const frame = JSON.parse(String(event.data)) as {
				type?: string;
				id?: string;
				done?: boolean;
				error?: boolean;
				body?: string;
			};
			if (frame.type !== "cf_agent_use_chat_response" || frame.id !== id) return;
			if (frame.error) reject(new Error(`agent error: ${frame.body}`));
			if (frame.done || frame.error) {
				clearTimeout(timer);
				socket.close();
				resolve();
			}
		});
	});
}

const { userId, token } = await seedToken();
for (const text of PROMPTS) {
	await sendTurn(chatName(userId, crypto.randomUUID()), await token(), text).catch((error: Error) =>
		fail(error.message),
	);
	process.stdout.write(`[seed] chat: ${text}\n`);
}

// The queue consumer batches for up to 2s; wait for the sidebar to show what we sent.
let listed = 0;
for (let attempt = 0; attempt < 10 && listed < PROMPTS.length; attempt++) {
	await new Promise((resolve) => setTimeout(resolve, 1_000));
	const res = await fetch(`${api}/chats`, { headers: { Authorization: `Bearer ${await token()}` } });
	listed = res.ok ? ((await res.json()) as unknown[]).length : 0;
}
if (listed < PROMPTS.length)
	fail(`GET /chats lists ${listed} chats after seeding ${PROMPTS.length}; check .t3/logs/api.log.`);
process.stdout.write(`[seed] done: ${listed} chats for ${SEED_EMAIL} (${userId}). Sign in with code 424242.\n`);
