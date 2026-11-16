/**
 * Aggregates per-runtime result JSONs into RESULTS.md and site data. Usage:
 *   node src/runner/report.ts [--results dir] [--out RESULTS.md]
 *
 * Reads every bench result (<runtime>.json) and validation file
 * (validation-<runtime>.json) in the results directory, which in CI is the
 * merged artifact download from all matrix jobs.
 */
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { outputsDir, resultsDir, siteDir } from "../layout.ts";
import { formatMs, isMissingFile, readResultFiles } from "../results.ts";
import { runtimeLabel, type RuntimeInfo } from "../runtime.ts";

const { values: cliArgs } = parseArgs({
	args: process.argv.slice(2),
	options: {
		results: { type: "string" },
		out: { type: "string" },
	},
});
const inputDir = path.resolve(cliArgs.results ?? resultsDir);
const outPath = path.resolve(cliArgs.out ?? path.join(inputDir, "RESULTS.md"));

const { bench: benchFiles, validations: validationFiles } = await readResultFiles(inputDir);
if (benchFiles.length === 0) {
	console.error(`no bench result files found under ${inputDir}`);
	process.exit(1);
}

const fileLabel = (f: { runtime: RuntimeInfo }) => runtimeLabel(f.runtime);
benchFiles.sort((a, b) => fileLabel(a).localeCompare(fileLabel(b)));

const allAdapters = [...new Set(benchFiles.flatMap((f) => Object.keys(f.libraries)))];
const allScenarios = [...new Set(benchFiles.flatMap((f) => f.benchmarks.map((b) => b.scenario)))];
const allFormats = [...new Set(benchFiles.flatMap((f) => f.benchmarks.map((b) => b.format)))];

const opsSec = (ns: number) => (1e9 / ns >= 100 ? (1e9 / ns).toFixed(0) : (1e9 / ns).toPrecision(3));

const lines: string[] = [];
lines.push("# Benchmark results");
lines.push("");
const sha = process.env.GITHUB_SHA?.slice(0, 7);
lines.push(
	`Generated ${new Date().toISOString()}${sha ? ` · commit \`${sha}\`` : ""} · ${benchFiles[0]!.platform.os} ${benchFiles[0]!.platform.arch} · ${benchFiles[0]!.platform.cpu}`,
);
if (benchFiles.some((f) => f.quick)) {
	lines.push("");
	lines.push("> ⚠️ Includes quick-mode runs (reduced sample counts) — treat numbers as indicative only.");
}
lines.push("");

lines.push("## Libraries");
lines.push("");
lines.push(`| Library | Version | ${benchFiles.map(fileLabel).join(" | ")} |`);
lines.push(`| --- | --- | ${benchFiles.map(() => "---").join(" | ")} |`);
for (const adapter of allAdapters) {
	const version = benchFiles.map((f) => f.libraries[adapter]?.version).find(Boolean) ?? "?";
	const cells = benchFiles.map((f) => {
		const info = f.libraries[adapter];
		if (!info) return "—";
		return info.status === "ok" ? "✅" : "❌";
	});
	lines.push(`| ${adapter} | ${version} | ${cells.join(" | ")} |`);
}
lines.push("");

lines.push("## Cold start / setup cost");
lines.push("");
lines.push(
	"Measured once per process, separately from the steady-state benchmarks: module import, font registration, image decoding, and the first end-to-end render (lazy initialization + warm-up). Relevant for serverless and edge deployments.",
);
lines.push("");
for (const f of benchFiles) {
	lines.push(`<details><summary>${fileLabel(f)}</summary>`);
	lines.push("");
	lines.push("| Library | import | fonts | images | first render | total |");
	lines.push("| --- | --- | --- | --- | --- | --- |");
	for (const adapter of allAdapters) {
		const info = f.libraries[adapter];
		if (info?.status !== "ok") continue;
		const { setup } = info;
		const total = setup.importMs + setup.fontsMs + setup.assetsMs + setup.firstRenderMs;
		lines.push(
			`| ${adapter} | ${setup.importMs.toFixed(1)} ms | ${setup.fontsMs.toFixed(1)} ms | ${setup.assetsMs.toFixed(1)} ms | ${setup.firstRenderMs.toFixed(1)} ms | ${total.toFixed(1)} ms |`,
		);
	}
	lines.push("");
	lines.push("</details>");
	lines.push("");
}

lines.push("## Benchmarks");
lines.push("");
lines.push(
	"Mean time per render+encode (operations/second in parentheses). Lower is better; the fastest library per column is bold.",
);
lines.push("");
for (const scenario of allScenarios) {
	lines.push(`### ${scenario}`);
	lines.push("");
	for (const format of allFormats) {
		const rows = allAdapters
			.map((adapter) => ({
				adapter,
				cells: benchFiles.map((f) =>
					f.benchmarks.find((b) => b.adapter === adapter && b.scenario === scenario && b.format === format),
				),
			}))
			.filter((r) => r.cells.some(Boolean));
		if (rows.length === 0) continue;
		lines.push(`**${format}**`);
		lines.push("");
		lines.push(`| Library | ${benchFiles.map(fileLabel).join(" | ")} |`);
		lines.push(`| --- | ${benchFiles.map(() => "---").join(" | ")} |`);
		const best = benchFiles.map((_, col) => {
			const values = rows.map((r) => r.cells[col]?.stats.avgNs).filter((v): v is number => v !== undefined);
			return values.length > 0 ? Math.min(...values) : undefined;
		});
		for (const row of rows) {
			const cells = row.cells.map((cell, col) => {
				if (!cell) return "—";
				const text = `${formatMs(cell.stats.avgNs)} (${opsSec(cell.stats.avgNs)}/s)`;
				return cell.stats.avgNs === best[col] ? `**${text}**` : text;
			});
			lines.push(`| ${row.adapter} | ${cells.join(" | ")} |`);
		}
		lines.push("");
	}
}

const unsupportedRows: string[] = [];
for (const f of benchFiles) {
	for (const [name, info] of Object.entries(f.libraries)) {
		if (info.status === "unsupported") {
			unsupportedRows.push(`| ${name} | ${fileLabel(f)} | (library failed to load) | ${info.error} |`);
		}
	}
	for (const u of f.unsupported) {
		unsupportedRows.push(`| ${u.adapter} | ${fileLabel(f)} | ${u.scenario} / ${u.format} | ${u.reason} |`);
	}
}
if (unsupportedRows.length > 0) {
	lines.push("## Unsupported combinations");
	lines.push("");
	lines.push("| Library | Runtime | Combination | Reason |");
	lines.push("| --- | --- | --- | --- |");
	lines.push(...new Set(unsupportedRows));
	lines.push("");
}

if (validationFiles.length > 0) {
	lines.push("## Validation");
	lines.push("");
	const failures = validationFiles.flatMap((v) =>
		v.baselines
			.filter((b) => !b.pass)
			.map((b) => `| ${b.adapter} | ${fileLabel(v)} | ${b.scenario} | ${(b.diffRatio * 100).toFixed(2)}% |`),
	);
	if (failures.length === 0) {
		lines.push("✅ All outputs match their committed per-library baselines.");
	} else {
		lines.push("| Library | Runtime | Scenario | Pixels differing |");
		lines.push("| --- | --- | --- | --- |");
		lines.push(...failures);
	}
	lines.push("");
	lines.push("### Cross-library similarity (informational)");
	lines.push("");
	lines.push(
		"Pixel difference between libraries rendering the same scenario, within each paradigm group. Rasterizers legitimately differ (antialiasing, font hinting); large values indicate diverging feature support worth checking in the gallery.",
	);
	lines.push("");
	const v = validationFiles[0]!;
	const scenariosInV = [...new Set(v.crossLibrary.map((c) => c.scenario))];
	for (const scenario of scenariosInV) {
		const pairs = v.crossLibrary.filter((c) => c.scenario === scenario);
		lines.push(`<details><summary>${scenario}</summary>`);
		lines.push("");
		lines.push("| Pair | Pixels differing |");
		lines.push("| --- | --- |");
		for (const p of pairs.toSorted((a, b) => b.diffRatio - a.diffRatio)) {
			lines.push(`| ${p.adapterA} ↔ ${p.adapterB} | ${(p.diffRatio * 100).toFixed(2)}% |`);
		}
		lines.push("");
		lines.push("</details>");
		lines.push("");
	}
}

lines.push("---");
lines.push("");
lines.push(
	"Methodology: see the repository README. Setup (fonts, image decoding) is excluded from steady-state numbers; every library renders identical scenario inputs and encodes with identical quality settings.",
);
lines.push("");

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, lines.join("\n"));
console.log(`report written to ${outPath}`);

await mkdir(siteDir, { recursive: true });
await writeFile(
	path.join(siteDir, "data.json"),
	JSON.stringify(
		{
			generated: new Date().toISOString(),
			commit: process.env.GITHUB_SHA ?? null,
			runs: benchFiles,
			validations: validationFiles,
		},
		null,
		2,
	),
);
console.log(`site data written to ${path.join(siteDir, "data.json")}`);

// Gallery: rendered outputs from one runtime (prefer the newest node), where
// site/public/app.js loads them from.
let runtimes: string[] = [];
try {
	const entries = await readdir(outputsDir(inputDir), { withFileTypes: true });
	runtimes = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.toSorted();
} catch (error) {
	if (!isMissingFile(error)) throw error;
}
const galleryRuntime = runtimes.filter((r) => r.startsWith("node")).pop() ?? runtimes[0];
if (galleryRuntime) {
	await cp(path.join(outputsDir(inputDir), galleryRuntime), path.join(siteDir, "gallery", "outputs"), {
		recursive: true,
	});
	console.log(`gallery copied from runtime ${galleryRuntime}`);
}
