/**
 * Regenerates the committed per-library baseline PNGs. Run on Linux x64
 * (ubuntu-latest equivalent) with Node so baselines match what CI renders:
 *   pnpm baselines:update
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { baselinePath, repoRoot } from "../src/layout.ts";
import { prepare } from "../src/runner/prepare.ts";
import { detectRuntime } from "../src/runtime.ts";

const runtime = detectRuntime();
if (runtime.name !== "node" || process.platform !== "linux") {
	console.warn(
		`warning: baselines are canonically generated on linux + node; this is ${process.platform} + ${runtime.name}`,
	);
}

const prepared = await prepare({ formats: ["png"] });

for (const combo of prepared.combos) {
	const file = baselinePath(combo.adapter, combo.scenario);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, combo.output);
	console.log(`wrote ${path.relative(repoRoot, file)}`);
}

for (const [name, info] of Object.entries(prepared.libraries)) {
	if (info.status === "unsupported") {
		console.warn(`! ${name} not set up: ${info.error}`);
	}
}
for (const entry of prepared.unsupported) {
	console.warn(`! no baseline for ${entry.adapter}/${entry.scenario}: ${entry.reason}`);
}
