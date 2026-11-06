// Runs CASES against a real model with the real SYSTEM prompt and render_html contract, then grades.
//
//   vp run eval:render-html --out runs/base          (from apps/api)
//   ... --model claude-haiku-5-5 --samples 3 --case fact,chart-explicit --baseline runs/base
//
// Needs ARKIE_ANTHROPIC_API_KEY (shell or the repo root .env). Writes results.jsonl and summary.md to --out.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, tool } from "ai";
import { MODEL, renderHtmlSpec, SYSTEM } from "#/agent/prompt.ts";
import { CASES } from "./cases.ts";
import { grade } from "./grade.ts";

const { values } = parseArgs({
	options: {
		out: { type: "string" },
		model: { type: "string", default: MODEL },
		samples: { type: "string", default: "3" },
		case: { type: "string" },
		baseline: { type: "string" },
	},
});
const key = process.env.ARKIE_ANTHROPIC_API_KEY;
if (!values.out) throw new Error("--out <dir> is required");
if (!key) throw new Error("ARKIE_ANTHROPIC_API_KEY is not set (shell or repo root .env)");

const model = createAnthropic({ apiKey: key })(values.model);
const ids = values.case?.split(",");
const cases = ids ? CASES.filter((c) => ids.includes(c.id)) : CASES;
const samples = Number(values.samples);

type Row = { id: string; sample: number; pass: boolean; reasons: string[]; inputTokens: number; outputTokens: number };
const rows: Row[] = [];
for (const c of cases) {
	for (let sample = 0; sample < samples; sample++) {
		// No execute: the run stops at the tool call, which is all the grade needs.
		const result = await generateText({
			model,
			system: SYSTEM,
			prompt: c.prompt,
			tools: { render_html: tool(renderHtmlSpec) },
		});
		const { pass, reasons } = grade(c.expect, result);
		rows.push({
			id: c.id,
			sample,
			pass,
			reasons,
			inputTokens: result.usage.inputTokens ?? 0,
			outputTokens: result.usage.outputTokens ?? 0,
		});
		process.stdout.write(`${pass ? "pass" : "FAIL"} ${c.id}#${sample} ${reasons.join("; ")}\n`);
	}
}

// A case fails when half or more of its samples fail.
const passRate = (list: Row[], id: string) => {
	const own = list.filter((r) => r.id === id);
	return own.filter((r) => r.pass).length / own.length;
};
const baseline: Row[] = values.baseline
	? readFileSync(join(values.baseline, "results.jsonl"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as Row)
	: [];
const tokens = rows.reduce((sum, r) => ({ in: sum.in + r.inputTokens, out: sum.out + r.outputTokens }), {
	in: 0,
	out: 0,
});
const summary = [
	`# render-html eval: ${values.model}, ${samples} samples`,
	"",
	"| case | pass rate | verdict |" + (values.baseline ? " baseline |" : ""),
	"| --- | --- | --- |" + (values.baseline ? " --- |" : ""),
	...cases.map((c) => {
		const rate = passRate(rows, c.id);
		const base = values.baseline ? ` ${passRate(baseline, c.id).toFixed(2)} |` : "";
		return `| ${c.id} | ${rate.toFixed(2)} | ${rate > 0.5 ? "pass" : "FAIL"} |${base}`;
	}),
	"",
	`Tokens: ${tokens.in} in, ${tokens.out} out.`,
].join("\n");

mkdirSync(values.out, { recursive: true });
writeFileSync(join(values.out, "results.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
writeFileSync(join(values.out, "summary.md"), `${summary}\n`);
process.stdout.write(`\n${summary}\n`);
