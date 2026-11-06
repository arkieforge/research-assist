import type { Expect } from "./grade.ts";

// Each case is one user message and what SYSTEM (src/agent/prompt.ts) says should happen.
// Add a case before changing that text: it must fail on the old text and pass on the new.
// Prose cases are controls: they catch a prompt that makes the model render everything.

export type Case = { id: string; source: string; prompt: string; expect: Expect };

export const CASES: Case[] = [
	{
		id: "chart-explicit",
		source: "SYSTEM: charts render",
		prompt: "Make a bar chart of these monthly signups: Jan 120, Feb 180, Mar 260, Apr 310.",
		expect: "render",
	},
	{
		id: "comparison-implicit",
		source: "SYSTEM: a comparison answers better as a page",
		prompt: "Compare Postgres, SQLite and DynamoDB on cost, scaling and query flexibility.",
		expect: "render",
	},
	{
		id: "chart-library-cdn",
		source: "SYSTEM: only cdnjs may be requested",
		prompt: "Plot y = sin(x) and y = cos(x) from 0 to 2π on one interactive chart.",
		expect: "render",
	},
	{ id: "fact", source: "control", prompt: "What is the capital of Japan?", expect: "prose" },
	{
		id: "rewrite",
		source: "control",
		prompt: "Rewrite this to sound friendlier: 'Send the report now.'",
		expect: "prose",
	},
	{ id: "code", source: "control", prompt: "How do I reverse a string in Python?", expect: "prose" },
];
