/**
 * Summarizes what a `pnpm validate` run found, for the baseline-regeneration PR
 * comment. Reads the validation JSON(s) written under results/ and emits a
 * markdown table of the per-library baselines that changed (and any new
 * combinations with no committed baseline yet). Usage:
 *   node scripts/render-change-summary.ts [--out comment.md]
 *
 * Must run *before* baselines are regenerated — once they're overwritten, the
 * outputs match and nothing shows as changed.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { ValidationResultFile } from "../src/types.ts";
import { resultsDir } from "../src/utils/assets.ts";

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: { out: { type: "string" } },
});
const outPath = values.out;

async function collectValidationFiles(dir: string): Promise<ValidationResultFile[]> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return [];
	}
	const files: ValidationResultFile[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.startsWith("validation-") || !entry.name.endsWith(".json")) {
			continue;
		}
		const data = JSON.parse(await readFile(path.join(dir, entry.name), "utf8")) as Record<
			string,
			unknown
		>;
		if (data.schemaVersion === 1 && Array.isArray(data.baselines)) {
			files.push(data as unknown as ValidationResultFile);
		}
	}
	return files;
}

const validations = await collectValidationFiles(resultsDir);
const runtimeLabel = (v: ValidationResultFile) => `${v.runtime.name} ${v.runtime.version}`;

const changed = validations.flatMap((v) =>
	v.baselines.filter((b) => !b.pass).map((b) => ({ runtime: runtimeLabel(v), ...b })),
);
const missing = validations.flatMap((v) =>
	v.missingBaselines.map((m) => ({ runtime: runtimeLabel(v), ...m })),
);

const lines: string[] = [];
lines.push("## 🎨 Baseline regeneration");
lines.push("");
lines.push(
	"Regenerated on `ubuntu-latest` (linux + node — the canonical rendering platform) and pushed to this branch.",
);
lines.push("");

if (changed.length === 0 && missing.length === 0) {
	lines.push(
		"No per-library pixel baseline changed — rendering still matches the committed baselines. The perf baseline was refreshed to keep the drift reference current with this branch.",
	);
} else {
	if (changed.length > 0) {
		lines.push("**Rendering changed vs the previous committed baselines:**");
		lines.push("");
		lines.push("| Library | Runtime | Scenario | Pixels differing |");
		lines.push("| --- | --- | --- | --- |");
		for (const c of changed.toSorted((a, b) => b.diffRatio - a.diffRatio)) {
			lines.push(
				`| ${c.adapter} | ${c.runtime} | ${c.scenario} | ${(c.diffRatio * 100).toFixed(3)}% |`,
			);
		}
		lines.push("");
	}
	if (missing.length > 0) {
		lines.push(
			`**New combinations (no prior baseline):** ${missing
				.map((m) => `${m.adapter} · ${m.scenario} (${m.runtime})`)
				.join(", ")}`,
		);
		lines.push("");
	}
	lines.push(
		"⚠️ **Review the diff images** (attached to the workflow run as the `baseline-diffs` artifact) to confirm the rendering change is expected before merging. The perf baseline was refreshed too.",
	);
}
lines.push("");

const output = lines.join("\n");
if (outPath) {
	await mkdir(path.dirname(outPath), { recursive: true });
	await writeFile(outPath, output);
	console.error(`summary written to ${outPath}`);
} else {
	console.log(output);
}
