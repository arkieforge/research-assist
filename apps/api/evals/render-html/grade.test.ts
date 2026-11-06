import { describe, expect, test } from "vite-plus/test";
import { externalHosts, grade } from "./grade.ts";

const render = (html: string) => ({ text: "", toolCalls: [{ toolName: "render_html", input: { title: "t", html } }] });

describe("externalHosts", () => {
	test("finds hosts the page would fetch, except cdnjs", () => {
		const html = `<script src="https://cdnjs.cloudflare.com/x.js"></script>
			<link href="//fonts.googleapis.com/css"><img src='https://example.com/a.png'>
			<style>@import "https://cdn.jsdelivr.net/a.css"; body{background:url(https://example.com/b.png)}</style>
			<script>fetch("https://api.example.org/data")</script>`;
		expect(externalHosts(html)).toEqual(["fonts.googleapis.com", "example.com", "cdn.jsdelivr.net", "api.example.org"]);
	});

	test("ignores links the page only shows, and inline data", () => {
		expect(externalHosts(`<p>See https://example.com</p><img src="data:image/png;base64,AA">`)).toEqual([]);
	});
});

describe("grade", () => {
	test("a visual ask passes with one self-contained page", () => {
		expect(grade("render", render("<svg></svg>"))).toEqual({ pass: true, reasons: [] });
	});

	test("a visual ask fails without a page, with two pages, or with an external request", () => {
		expect(grade("render", { text: "Here is a chart", toolCalls: [] }).pass).toBe(false);
		expect(grade("render", { text: "", toolCalls: [...render("a").toolCalls, ...render("b").toolCalls] }).pass).toBe(
			false,
		);
		expect(grade("render", render('<img src="https://example.com/x.png">')).reasons).toEqual([
			"page requests example.com",
		]);
	});

	test("a prose ask fails when the model renders anyway", () => {
		expect(grade("prose", { text: "Paris.", toolCalls: [] }).pass).toBe(true);
		expect(grade("prose", { ...render("<p>Paris</p>"), text: "Paris." }).reasons).toEqual([
			"called render_html for a prose answer",
		]);
	});
});
