/**
 * Benchmark runner. Usage:
 *   node src/runner/bench.ts [--quick] [--adapters a,b] [--scenarios x,y] [--out file]
 *
 * Full mode uses mitata for rigorous steady-state sampling; --quick uses a
 * short fixed-sample loop intended for PR smoke comparisons (both sides of an
 * A/B run must use the same mode).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";
import { bench, run } from "mitata";
import type { BenchEntry, BenchResultFile, BenchStats } from "../types.ts";
import { formatExtensions, resultsDir } from "../utils/assets.ts";
import { detectRuntime, runtimeId } from "../utils/runtime.ts";
import { comboKey, prepare, renderOptions, type Combo } from "./prepare.ts";

/** Quick-mode defaults. More samples than a smoke test needs, because the PR
 * A/B comment compares medians and gates on measured noise — a steadier
 * estimate directly reduces false "regressions" on unrelated PRs. The
 * perf-baseline workflow overrides these upward for an even stabler reference. */
const QUICK_WARMUP = 5;
const QUICK_SAMPLES = 30;

async function quickStats(combo: Combo, samples: number, warmup: number): Promise<BenchStats> {
	const WARMUP = warmup;
	const SAMPLES = samples;
	for (let i = 0; i < WARMUP; i++) {
		await combo.adapter.render(combo.scenario, combo.format, renderOptions);
	}
	const samplesNs: number[] = [];
	for (let i = 0; i < SAMPLES; i++) {
		const t0 = performance.now();
		await combo.adapter.render(combo.scenario, combo.format, renderOptions);
		samplesNs.push((performance.now() - t0) * 1e6);
	}
	samplesNs.sort((a, b) => a - b);
	const at = (q: number) => samplesNs[Math.floor(q * (samplesNs.length - 1))] as number;
	return {
		avgNs: samplesNs.reduce((a, v) => a + v, 0) / samplesNs.length,
		minNs: samplesNs[0] as number,
		maxNs: samplesNs[samplesNs.length - 1] as number,
		p50Ns: at(0.5),
		p75Ns: at(0.75),
		p99Ns: at(0.99),
		samples: samplesNs.length,
	};
}

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		quick: { type: "boolean", default: false },
		adapters: { type: "string" },
		scenarios: { type: "string" },
		out: { type: "string" },
		samples: { type: "string" },
		warmup: { type: "string" },
	},
});
const opts = {
	quick: values.quick,
	adapters: values.adapters?.split(","),
	scenarios: values.scenarios?.split(","),
	out: values.out,
	samples: values.samples === undefined ? undefined : Number(values.samples),
	warmup: values.warmup === undefined ? undefined : Number(values.warmup),
};
const runtime = detectRuntime();
const id = runtimeId(runtime);
console.log(`runtime: ${id}${opts.quick ? " (quick mode)" : ""}`);

const prepared = await prepare({ adapters: opts.adapters, scenarios: opts.scenarios });

for (const [name, info] of Object.entries(prepared.libraries)) {
	if (info.status === "unsupported") {
		console.warn(`! ${name} unsupported on ${id}: ${info.error}`);
	}
}
for (const entry of prepared.unsupported) {
	console.warn(`! ${entry.adapter} / ${entry.scenario} / ${entry.format}: ${entry.reason}`);
}

// Persist the preflight render outputs for validation reuse and the gallery.
const outputsDir = path.join(resultsDir, "outputs", id);
for (const combo of prepared.combos) {
	const dir = path.join(outputsDir, combo.adapter.name);
	await mkdir(dir, { recursive: true });
	const ext = formatExtensions[combo.format];
	await writeFile(path.join(dir, `${combo.scenario.name}.${ext}`), combo.output);
}
console.log(`${prepared.combos.length} combinations across ${prepared.ready.length} libraries`);

const entries: BenchEntry[] = [];

if (opts.quick) {
	const samples = opts.samples ?? QUICK_SAMPLES;
	const warmup = opts.warmup ?? QUICK_WARMUP;
	console.log(`quick mode: ${warmup} warmup + ${samples} samples per combination`);
	for (const combo of prepared.combos) {
		const stats = await quickStats(combo, samples, warmup);
		entries.push({
			adapter: combo.adapter.name,
			scenario: combo.scenario.name,
			format: combo.format,
			stats,
		});
		console.log(
			`${comboKey(combo.adapter.name, combo.scenario.name, combo.format)}: ${(stats.avgNs / 1e6).toFixed(2)} ms avg`,
		);
	}
} else {
	const lookup = new Map<string, Combo>();
	for (const combo of prepared.combos) {
		const key = comboKey(combo.adapter.name, combo.scenario.name, combo.format);
		lookup.set(key, combo);
		bench(key, async () => {
			await combo.adapter.render(combo.scenario, combo.format, renderOptions);
		});
	}
	const result = await run();
	for (const b of result.benchmarks) {
		const combo = lookup.get(b.alias);
		const stats = b.runs[0]?.stats;
		if (!combo || !stats) continue;
		entries.push({
			adapter: combo.adapter.name,
			scenario: combo.scenario.name,
			format: combo.format,
			stats: {
				avgNs: stats.avg,
				minNs: stats.min,
				maxNs: stats.max,
				p50Ns: stats.p50,
				p75Ns: stats.p75,
				p99Ns: stats.p99,
				samples: stats.ticks,
			},
		});
	}
}

const file: BenchResultFile = {
	schemaVersion: 1,
	runtime,
	platform: {
		os: `${os.platform()} ${os.release()}`,
		arch: os.arch(),
		cpu: os.cpus()[0]?.model ?? "unknown",
	},
	timestamp: new Date().toISOString(),
	quick: opts.quick,
	libraries: prepared.libraries,
	benchmarks: entries,
	unsupported: prepared.unsupported,
};

const outPath = opts.out ?? path.join(resultsDir, `${id}.json`);
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(file, null, 2));
console.log(`results written to ${outPath}`);
