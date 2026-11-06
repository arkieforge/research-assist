import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart } from "@tanstack/react-start";

// Clerk reads the session cookie on every request so server routes and functions can call auth().
export const startInstance = createStart(() => ({ requestMiddleware: [clerkMiddleware()] }));
