import { chatName } from "@arkie/api/chat-name";
import { useAuth } from "@clerk/tanstack-react-start";
import { getAgentMessages, useAgentChat } from "@cloudflare/ai-chat/react";
import { createFileRoute } from "@tanstack/react-router";
import { useAgent } from "agents/react";
import { useEffect, useState } from "react";
import { apiUrl, fetchArtifact } from "#/lib/api.ts";

// The chat lives on a WebSocket to its ChatAgent Durable Object in the API Worker, so it renders
// in the browser only.
export const Route = createFileRoute("/c/$chatId")({
	ssr: false,
	component: ChatPage,
});

function ChatPage() {
	const { chatId } = Route.useParams();
	const { userId, isLoaded } = useAuth();
	if (!isLoaded) return null;
	if (!userId) return <p className="py-6 text-muted">Sign in to open this chat.</p>;
	return <Chat name={chatName(userId, chatId)} />;
}

function Chat({ name }: { name: string }) {
	const { getToken } = useAuth();
	// Clerk session tokens live about a minute, so each (re)connect and history load asks for a fresh one.
	const agent = useAgent({
		agent: "ChatAgent",
		name,
		host: apiUrl(),
		query: async () => ({ token: await getToken() }),
	});
	const { messages, sendMessage, status } = useAgentChat({
		agent,
		getInitialMessages: async () =>
			getAgentMessages({
				host: apiUrl(),
				agent: "ChatAgent",
				name,
				headers: { Authorization: `Bearer ${await getToken()}` },
			}),
	});
	const [draft, setDraft] = useState("");

	return (
		<main className="flex flex-1 flex-col gap-4 py-6">
			{messages.map((message) => (
				<section key={message.id} className={message.role === "user" ? "text-muted" : ""}>
					{message.parts.map((part, i) => {
						const key = `${message.id}-${i}`;
						if (part.type === "text") {
							return (
								<p key={key} className="whitespace-pre-wrap">
									{part.text}
								</p>
							);
						}
						if (part.type === "tool-render_html" && part.state === "output-available") {
							return <Artifact key={key} id={(part.output as { id: string }).id} />;
						}
						return null;
					})}
				</section>
			))}
			<form
				className="sticky bottom-0 mt-auto bg-bg py-3"
				onSubmit={(e) => {
					e.preventDefault();
					const text = draft.trim();
					if (!text) return;
					void sendMessage({ role: "user", parts: [{ type: "text", text }] });
					setDraft("");
				}}
			>
				<input
					aria-label="Message"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					disabled={status === "streaming"}
					placeholder="Message Arkie"
					className="w-full border border-line bg-bg px-3 py-2"
				/>
			</form>
		</main>
	);
}

/**
 * A render_html page. srcdoc + sandbox without allow-same-origin gives it an opaque origin: its
 * scripts run, but it can't read this app's cookies, storage or Clerk session.
 */
function Artifact({ id }: { id: string }) {
	const { getToken } = useAuth();
	const [html, setHtml] = useState<string | null>(null);
	useEffect(() => {
		let live = true;
		getToken()
			.then((token) => fetchArtifact(id, token))
			.then((body) => live && setHtml(body))
			.catch(() => live && setHtml("<p>Could not load this artifact.</p>"));
		return () => {
			live = false;
		};
	}, [id, getToken]);
	if (html === null) return null;
	return <iframe title="Artifact" srcDoc={html} sandbox="allow-scripts" className="h-96 w-full" />;
}
