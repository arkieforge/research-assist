import { defineConfig } from "vite-plus";

// Workspace-wide Vite+ config: formatting (oxfmt), linting (oxlint, type-aware), the staged-file
// hook, and the task runner. Each app's own vite.config.ts adds its build and tests.

const GENERATED = [
	".repos/**",
	".alchemy",
	"**/.alchemy/**",
	"**/dist/**",
	"**/.output/**",
	"**/.vercel/**",
	"**/.nitro/**",
	"**/.astro/**",
	"node_modules",
	"pnpm-lock.yaml",
	"**/routeTree.gen.ts",
	"apps/api/migrations/**",
];

export default defineConfig({
	fmt: {
		useTabs: true,
		printWidth: 120,
		ignorePatterns: GENERATED,
		sortPackageJson: {},
		overrides: [{ files: [".devcontainer/devcontainer.json"], options: { trailingComma: "none" } }],
	},
	lint: {
		ignorePatterns: GENERATED,
		plugins: ["eslint", "oxc", "react", "unicorn", "typescript", "jest"],
		jsPlugins: [
			{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
			{ name: "arkie", specifier: "./scripts/lint/arkie-plugin.ts" },
		],
		categories: { correctness: "error", suspicious: "warn", perf: "warn" },
		rules: {
			"vite-plus/prefer-vite-plus-imports": "error",
			"typescript/no-explicit-any": "error",
			"oxc/no-accumulating-spread": "error",
			"arkie/no-kill-by-pattern": "error",
			"arkie/no-prod-stage": "error",
			// A focused or skipped test silently drops the rest of the suite from CI.
			"jest/no-focused-tests": "error",
			"jest/no-disabled-tests": "error",
			// React 19's automatic JSX runtime needs no React import.
			"react/react-in-jsx-scope": "off",
			// Third-party fields such as posthog.__loaded.
			"eslint/no-underscore-dangle": "off",
		},
		// The rules' own source and tests spell out what they forbid.
		overrides: [
			{ files: ["scripts/lint/**"], rules: { "arkie/no-kill-by-pattern": "off", "arkie/no-prod-stage": "off" } },
		],
		options: { typeAware: true, typeCheck: true },
	},
	staged: {
		// In order, so lint reads the formatted file.
		"*": ["vp fmt --no-error-on-unmatched-pattern", "vp lint --no-error-on-unmatched-pattern"],
	},
	run: {
		cache: { scripts: false },
	},
});
