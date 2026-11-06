import { ClerkProvider, Show, SignInButton, UserButton, useAuth } from "@clerk/tanstack-react-start";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { startAnalytics } from "#/lib/analytics.ts";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ name: "theme-color", content: "#000" },
			{ title: "Arkie" },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	shellComponent: RootDocument,
	component: RootComponent,
});

// Placeholder shell: real layout comes from approved mocks (see AGENTS.md, UI work).
function RootComponent() {
	const { userId } = useAuth();
	useEffect(() => startAnalytics(userId), [userId]);
	return (
		<div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4">
			<header className="flex h-12 items-center justify-between border-b border-line">
				<Link to="/" className="font-medium">
					Arkie
				</Link>
				<Show when="signed-in">
					<UserButton />
				</Show>
				<Show when="signed-out">
					<SignInButton />
				</Show>
			</header>
			<Outlet />
		</div>
	);
}

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<ClerkProvider>{children}</ClerkProvider>
				<Scripts />
			</body>
		</html>
	);
}
