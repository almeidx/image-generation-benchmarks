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
import { parseArgs } from "node:util";
// fast-png is pure JS (no node:zlib sync internals), so validation runs
// identically on Node, Bun, and Deno.
import { convertIndexedToRgb, decode as decodePng, encode as encodePng } from "fast-png";
import pixelmatch from "pixelmatch";
import { baselineDiffPath, baselinePath, crossDiffPath, resultsDir, validationResultPath } from "../layout.ts";
import {
	isMissingFile,
	type BaselineComparison,
	type CrossLibComparison,
	type ValidationResultFile,
} from "../results.ts";
import { detectRuntime, runtimeId } from "../runtime.ts";
import { prepare } from "./prepare.ts";

/** Fraction of pixels allowed to differ from the committed baseline. */
const BASELINE_THRESHOLD = 0.005;
/** Per-pixel color distance threshold for pixelmatch (0..1). */
const PIXEL_THRESHOLD = 0.1;

const { values: cliArgs } = parseArgs({
	args: process.argv.slice(2),
	options: {
		adapters: { type: "string" },
		scenarios: { type: "string" },
	},
});

interface Rgba {
	width: number;
	height: number;
	data: Uint8Array;
}

function toRgba(bytes: Uint8Array): Rgba {
	const decoded = decodePng(bytes);
	if (decoded.depth === 16) throw new Error("16-bit PNGs are not supported by the validator");
	// Palette (indexed-color) PNGs decode to one channel of palette indices.
	// takumi >= 2.16 emits this encoding for flat-color images; expand through
	// the palette so the indices aren't misread as grayscale values.
	const png = decoded.palette
		? {
				...decoded,
				data: convertIndexedToRgb(decoded),
				channels: decoded.palette[0]!.length === 4 ? 4 : 3,
			}
		: decoded;
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

async function writeDiff(file: string, png: Uint8Array): Promise<string> {
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, png);
	return path.relative(resultsDir, file);
}

const runtime = detectRuntime();
const id = runtimeId(runtime);

const prepared = await prepare({
	adapters: cliArgs.adapters?.split(","),
	scenarios: cliArgs.scenarios?.split(","),
	formats: ["png"],
});

const baselines: BaselineComparison[] = [];
const crossLibrary: CrossLibComparison[] = [];
const missingBaselines: { adapter: string; scenario: string }[] = [];

for (const { adapter, scenario, output } of prepared.combos) {
	let baseline: Uint8Array;
	try {
		baseline = await readFile(baselinePath(adapter, scenario));
	} catch (error) {
		if (!isMissingFile(error)) throw error;
		missingBaselines.push({ adapter, scenario });
		continue;
	}
	const result = diffPngs(baseline, output);
	if ("error" in result) {
		baselines.push({ adapter, scenario, diffRatio: 1, pass: false });
		console.error(`FAIL ${adapter}/${scenario}: ${result.error}`);
		continue;
	}
	const pass = result.ratio <= BASELINE_THRESHOLD;
	baselines.push({
		adapter,
		scenario,
		diffRatio: result.ratio,
		pass,
		diffImage: pass ? undefined : await writeDiff(baselineDiffPath(id, adapter, scenario), result.diffPng),
	});
	console.log(`${pass ? "ok  " : "FAIL"} ${adapter}/${scenario}: ${(result.ratio * 100).toFixed(3)}% differs`);
}

const scenarioNames = [...new Set(prepared.combos.map((c) => c.scenario))];
for (const scenario of scenarioNames) {
	const group = prepared.combos.filter((c) => c.scenario === scenario);
	for (let i = 0; i < group.length; i++) {
		for (let j = i + 1; j < group.length; j++) {
			const a = group[i]!;
			const b = group[j]!;
			if (a.kind !== b.kind) continue;
			const result = diffPngs(a.output, b.output);
			if ("error" in result) continue;
			crossLibrary.push({
				scenario,
				adapterA: a.adapter,
				adapterB: b.adapter,
				diffRatio: result.ratio,
				diffImage: await writeDiff(crossDiffPath(id, scenario, a.adapter, b.adapter), result.diffPng),
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
const outPath = validationResultPath(id);
await mkdir(path.dirname(outPath), { recursive: true });
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
