/**
 * Image validation. Usage:
 *   node src/runner/validate.ts [--adapters a,b] [--scenarios x,y]
 *
 * Two layers, by design:
 *  - Per-library baselines (CI-failing): each library's PNG output is
 *    compared against its own committed baseline. Catches regressions when a
 *    dependency bump changes rendering.
 *  - Cross-library similarity (report-only): pairwise diffs within each
 *    paradigm group. Rasterizers legitimately differ in antialiasing and text
 *    rendering, so divergence here is a finding, never a failure.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
// fast-png is pure JS (no node:zlib sync internals), so validation runs
// identically on Node, Bun, and Deno.
import { decode as decodePng, encode as encodePng } from "fast-png";
import pixelmatch from "pixelmatch";
import type { BaselineComparison, CrossLibComparison, ValidationResultFile } from "../types.ts";
import { baselinesDir, resultsDir } from "../utils/assets.ts";
import { detectRuntime, runtimeId } from "../utils/runtime.ts";
import { prepare } from "./prepare.ts";

/** Fraction of pixels allowed to differ from the committed baseline. */
const BASELINE_THRESHOLD = 0.005;
/** Per-pixel color distance threshold for pixelmatch (0..1). */
const PIXEL_THRESHOLD = 0.1;

function parseList(flag: string): string[] | undefined {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1]?.split(",") : undefined;
}

interface Rgba {
	width: number;
	height: number;
	data: Uint8Array;
}

function toRgba(bytes: Uint8Array): Rgba {
	const png = decodePng(bytes);
	if (png.depth === 16) throw new Error("16-bit PNGs are not supported by the validator");
	const pixels = png.width * png.height;
	const src = png.data as Uint8Array;
	if (png.channels === 4) return { width: png.width, height: png.height, data: src };
	const data = new Uint8Array(pixels * 4);
	for (let i = 0; i < pixels; i++) {
		if (png.channels === 3) {
			data[i * 4] = src[i * 3]!;
			data[i * 4 + 1] = src[i * 3 + 1]!;
			data[i * 4 + 2] = src[i * 3 + 2]!;
			data[i * 4 + 3] = 255;
		} else {
			// grayscale (1) or grayscale+alpha (2)
			const g = src[i * png.channels]!;
			data[i * 4] = g;
			data[i * 4 + 1] = g;
			data[i * 4 + 2] = g;
			data[i * 4 + 3] = png.channels === 2 ? src[i * 2 + 1]! : 255;
		}
	}
	return { width: png.width, height: png.height, data };
}

interface DiffResult {
	ratio: number;
	diffPng: Uint8Array;
}

function diffPngs(aBytes: Uint8Array, bBytes: Uint8Array): DiffResult | { error: string } {
	const a = toRgba(aBytes);
	const b = toRgba(bBytes);
	if (a.width !== b.width || a.height !== b.height) {
		return { error: `dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}` };
	}
	const diff = new Uint8Array(a.width * a.height * 4);
	const differing = pixelmatch(a.data, b.data, diff, a.width, a.height, {
		threshold: PIXEL_THRESHOLD,
	});
	return {
		ratio: differing / (a.width * a.height),
		diffPng: encodePng({ width: a.width, height: a.height, data: diff, channels: 4 }),
	};
}

const runtime = detectRuntime();
const id = runtimeId(runtime);
const diffsDir = path.join(resultsDir, "diffs", id);

const prepared = await prepare({
	adapters: parseList("--adapters"),
	scenarios: parseList("--scenarios"),
	formats: ["png"],
});

const baselines: BaselineComparison[] = [];
const crossLibrary: CrossLibComparison[] = [];
const missingBaselines: { adapter: string; scenario: string }[] = [];

// Layer 1: per-library baselines.
for (const combo of prepared.combos) {
	const baselinePath = path.join(baselinesDir, combo.adapter.name, `${combo.scenario.name}.png`);
	let baseline: Uint8Array;
	try {
		baseline = await readFile(baselinePath);
	} catch {
		missingBaselines.push({ adapter: combo.adapter.name, scenario: combo.scenario.name });
		continue;
	}
	const result = diffPngs(baseline, combo.output);
	if ("error" in result) {
		baselines.push({
			adapter: combo.adapter.name,
			scenario: combo.scenario.name,
			diffRatio: 1,
			pass: false,
		});
		console.error(`FAIL ${combo.adapter.name}/${combo.scenario.name}: ${result.error}`);
		continue;
	}
	const pass = result.ratio <= BASELINE_THRESHOLD;
	let diffImage: string | undefined;
	if (!pass) {
		const dir = path.join(diffsDir, "baseline", combo.adapter.name);
		await mkdir(dir, { recursive: true });
		diffImage = path.join(dir, `${combo.scenario.name}.png`);
		await writeFile(diffImage, result.diffPng);
	}
	baselines.push({
		adapter: combo.adapter.name,
		scenario: combo.scenario.name,
		diffRatio: result.ratio,
		pass,
		diffImage: diffImage ? path.relative(resultsDir, diffImage) : undefined,
	});
	console.log(
		`${pass ? "ok  " : "FAIL"} ${combo.adapter.name}/${combo.scenario.name}: ${(result.ratio * 100).toFixed(3)}% differs`,
	);
}

// Layer 2: cross-library similarity within each paradigm group (report-only).
const scenarioNames = [...new Set(prepared.combos.map((c) => c.scenario.name))];
for (const scenarioName of scenarioNames) {
	const group = prepared.combos.filter((c) => c.scenario.name === scenarioName);
	for (let i = 0; i < group.length; i++) {
		for (let j = i + 1; j < group.length; j++) {
			const a = group[i]!;
			const b = group[j]!;
			if (a.adapter.kind !== b.adapter.kind) continue;
			const result = diffPngs(a.output, b.output);
			if ("error" in result) continue;
			const dir = path.join(diffsDir, "cross", scenarioName);
			await mkdir(dir, { recursive: true });
			const diffImage = path.join(dir, `${a.adapter.name}__${b.adapter.name}.png`);
			await writeFile(diffImage, result.diffPng);
			crossLibrary.push({
				scenario: scenarioName,
				adapterA: a.adapter.name,
				adapterB: b.adapter.name,
				diffRatio: result.ratio,
				diffImage: diffImage ? path.relative(resultsDir, diffImage) : undefined,
			});
		}
	}
}

const file: ValidationResultFile = {
	schemaVersion: 1,
	runtime,
	timestamp: new Date().toISOString(),
	threshold: BASELINE_THRESHOLD,
	baselines,
	crossLibrary,
	missingBaselines,
};
await mkdir(resultsDir, { recursive: true });
const outPath = path.join(resultsDir, `validation-${id}.json`);
await writeFile(outPath, JSON.stringify(file, null, 2));
console.log(`validation written to ${outPath}`);

const failed = baselines.filter((b) => !b.pass);
if (missingBaselines.length > 0) {
	console.error(
		`missing baselines (run: pnpm baselines:update): ${missingBaselines
			.map((m) => `${m.adapter}/${m.scenario}`)
			.join(", ")}`,
	);
}
if (failed.length > 0 || missingBaselines.length > 0) {
	process.exit(1);
}
