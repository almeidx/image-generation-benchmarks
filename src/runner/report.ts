/**
 * Aggregates per-runtime result JSONs into RESULTS.md and site data. Usage:
 *   node src/runner/report.ts [--results dir] [--out RESULTS.md]
 *
 * Reads every bench result (<runtime>.json) and validation file
 * (validation-<runtime>.json) in the results directory, which in CI is the
 * merged artifact download from all matrix jobs.
 */
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BenchResultFile, OutputFormat, ValidationResultFile } from "../types.ts";
import { repoRoot, resultsDir } from "../utils/assets.ts";

const argv = process.argv.slice(2);
function argValue(flag: string, fallback: string): string {
	const i = argv.indexOf(flag);
	return i >= 0 && argv[i + 1] ? (argv[i + 1] as string) : fallback;
}
const inputDir = path.resolve(argValue("--results", resultsDir));
const outPath = path.resolve(argValue("--out", path.join(inputDir, "RESULTS.md")));

async function collectFiles(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
	const found: string[] = [];
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return found;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) found.push(...(await collectFiles(full, predicate)));
		else if (predicate(entry.name)) found.push(full);
	}
	return found;
}

const benchFiles: BenchResultFile[] = [];
const validationFiles: ValidationResultFile[] = [];
for (const file of await collectFiles(inputDir, (n) => n.endsWith(".json"))) {
	const data = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
	if (data.schemaVersion !== 1) continue;
	if (Array.isArray(data.benchmarks)) benchFiles.push(data as unknown as BenchResultFile);
	else if (Array.isArray(data.baselines))
		validationFiles.push(data as unknown as ValidationResultFile);
}
if (benchFiles.length === 0) {
	console.error(`no bench result files found under ${inputDir}`);
	process.exit(1);
}

const runtimeLabel = (f: BenchResultFile | ValidationResultFile) =>
	`${f.runtime.name} ${f.runtime.version}`;
benchFiles.sort((a, b) => runtimeLabel(a).localeCompare(runtimeLabel(b)));

const allAdapters = [...new Set(benchFiles.flatMap((f) => Object.keys(f.libraries)))];
const allScenarios = [...new Set(benchFiles.flatMap((f) => f.benchmarks.map((b) => b.scenario)))];
const allFormats = [
	...new Set(benchFiles.flatMap((f) => f.benchmarks.map((b) => b.format))),
] as OutputFormat[];

const ms = (ns: number) => ns / 1e6;
const fmtMs = (ns: number) => (ms(ns) >= 100 ? ms(ns).toFixed(0) : ms(ns).toPrecision(3));
const opsSec = (ns: number) =>
	1e9 / ns >= 100 ? (1e9 / ns).toFixed(0) : (1e9 / ns).toPrecision(3);

const lines: string[] = [];
lines.push("# Benchmark results");
lines.push("");
const sha = process.env.GITHUB_SHA?.slice(0, 7);
lines.push(
	`Generated ${new Date().toISOString()}${sha ? ` · commit \`${sha}\`` : ""} · ${benchFiles[0]!.platform.os} ${benchFiles[0]!.platform.arch} · ${benchFiles[0]!.platform.cpu}`,
);
if (benchFiles.some((f) => f.quick)) {
	lines.push("");
	lines.push(
		"> ⚠️ Includes quick-mode runs (reduced sample counts) — treat numbers as indicative only.",
	);
}
lines.push("");

// Library support per runtime.
lines.push("## Libraries");
lines.push("");
lines.push(`| Library | Version | ${benchFiles.map(runtimeLabel).join(" | ")} |`);
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

// Cold start phases.
lines.push("## Cold start / setup cost");
lines.push("");
lines.push(
	"Measured once per process, separately from the steady-state benchmarks: module import, font registration, image decoding, and the first end-to-end render (lazy initialization + warm-up). Relevant for serverless and edge deployments.",
);
lines.push("");
for (const f of benchFiles) {
	lines.push(`<details><summary>${runtimeLabel(f)}</summary>`);
	lines.push("");
	lines.push("| Library | import | fonts | images | first render | total |");
	lines.push("| --- | --- | --- | --- | --- | --- |");
	for (const adapter of allAdapters) {
		const setup = f.libraries[adapter]?.setup;
		if (!setup) continue;
		const total = setup.importMs + setup.fontsMs + setup.assetsMs + setup.firstRenderMs;
		lines.push(
			`| ${adapter} | ${setup.importMs.toFixed(1)} ms | ${setup.fontsMs.toFixed(1)} ms | ${setup.assetsMs.toFixed(1)} ms | ${setup.firstRenderMs.toFixed(1)} ms | ${total.toFixed(1)} ms |`,
		);
	}
	lines.push("");
	lines.push("</details>");
	lines.push("");
}

// Steady-state benchmarks: per scenario, per format.
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
					f.benchmarks.find(
						(b) => b.adapter === adapter && b.scenario === scenario && b.format === format,
					),
				),
			}))
			.filter((r) => r.cells.some(Boolean));
		if (rows.length === 0) continue;
		lines.push(`**${format}**`);
		lines.push("");
		lines.push(`| Library | ${benchFiles.map(runtimeLabel).join(" | ")} |`);
		lines.push(`| --- | ${benchFiles.map(() => "---").join(" | ")} |`);
		const best = benchFiles.map((_, col) => {
			const values = rows
				.map((r) => r.cells[col]?.stats.avgNs)
				.filter((v): v is number => v !== undefined);
			return values.length > 0 ? Math.min(...values) : undefined;
		});
		for (const row of rows) {
			const cells = row.cells.map((cell, col) => {
				if (!cell) return "—";
				const text = `${fmtMs(cell.stats.avgNs)} ms (${opsSec(cell.stats.avgNs)}/s)`;
				return cell.stats.avgNs === best[col] ? `**${text}**` : text;
			});
			lines.push(`| ${row.adapter} | ${cells.join(" | ")} |`);
		}
		lines.push("");
	}
}

// Unsupported combinations.
const unsupportedRows: string[] = [];
for (const f of benchFiles) {
	for (const [name, info] of Object.entries(f.libraries)) {
		if (info.status === "unsupported") {
			unsupportedRows.push(
				`| ${name} | ${runtimeLabel(f)} | (library failed to load) | ${info.error ?? ""} |`,
			);
		}
	}
	for (const u of f.unsupported) {
		unsupportedRows.push(
			`| ${u.adapter} | ${runtimeLabel(f)} | ${u.scenario} / ${u.format} | ${u.reason} |`,
		);
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

// Validation summary.
if (validationFiles.length > 0) {
	lines.push("## Validation");
	lines.push("");
	const failures = validationFiles.flatMap((v) =>
		v.baselines
			.filter((b) => !b.pass)
			.map(
				(b) =>
					`| ${b.adapter} | ${runtimeLabel(v)} | ${b.scenario} | ${(b.diffRatio * 100).toFixed(2)}% |`,
			),
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

// Site data + gallery.
const siteDir = path.join(repoRoot, "site", "public");
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

// Gallery: rendered outputs from one runtime (prefer the newest node) plus
// cross-library diff images.
const outputRoots = await collectFiles(inputDir, (n) => n.endsWith(".png")).then((files) =>
	[...new Set(files.map((f) => path.dirname(f)))].filter((d) => d.includes(`outputs${path.sep}`)),
);
const runtimes = [
	...new Set(outputRoots.map((d) => d.split(`outputs${path.sep}`)[1]?.split(path.sep)[0])),
].filter((r): r is string => Boolean(r));
const galleryRuntime =
	runtimes
		.filter((r) => r.startsWith("node"))
		.toSorted()
		.pop() ?? runtimes[0];
if (galleryRuntime) {
	const sourceDir = outputRoots[0]!.split(`outputs${path.sep}`)[0]!;
	await cp(
		path.join(sourceDir, "outputs", galleryRuntime),
		path.join(siteDir, "gallery", "outputs"),
		{
			recursive: true,
		},
	);
	try {
		await cp(
			path.join(sourceDir, "diffs", galleryRuntime, "cross"),
			path.join(siteDir, "gallery", "diffs"),
			{
				recursive: true,
			},
		);
	} catch {
		// No cross diffs available — gallery just shows outputs.
	}
	console.log(`gallery copied from runtime ${galleryRuntime}`);
}
