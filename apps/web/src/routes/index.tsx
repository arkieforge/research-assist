import { chatIdOf } from "@arkie/api/chat-name";
import { Show } from "@clerk/tanstack-react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { listChats } from "#/lib/chats.ts";

export const Route = createFileRoute("/")({
	loader: () => listChats(),
	component: Home,
});

function Home() {
	const chats = Route.useLoaderData();
	return (
		<main className="py-6">
			<Show when="signed-out">
				<p className="text-muted">Sign in to start a chat.</p>
			</Show>
			<Show when="signed-in">
				<Link to="/c/$chatId" params={{ chatId: crypto.randomUUID() }} className="underline">
					New chat
				</Link>
				<ul className="mt-6 divide-y divide-line">
					{chats.map((chat) => (
						<li key={chat.id}>
							<Link to="/c/$chatId" params={{ chatId: chatIdOf(chat.id) }} className="block py-2">
								{chat.title}
							</Link>
						</li>
					))}
				</ul>
			</Show>
		</main>
	);
}
