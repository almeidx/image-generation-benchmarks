/**
 * Benchmark runner. Usage:
 *   node src/runner/bench.ts [--quick] [--adapters a,b] [--scenarios x,y] [--out file]
 *
 * Full mode uses mitata for rigorous steady-state sampling; --quick uses a
 * short fixed-sample loop intended for PR smoke comparisons (both sides of an
 * A/B run must use the same mode).
 */
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { bench, run } from "mitata";
import { benchResultPath, outputPath } from "../layout.ts";
import { comboName, type BenchEntry, type BenchResultFile, type BenchStats } from "../results.ts";
import { detectRuntime, runtimeId } from "../runtime.ts";
import { prepare, type Combo } from "./prepare.ts";

/** Quick-mode defaults. More samples than a smoke test needs, because the PR
 * A/B comment compares medians and gates on measured noise: a steadier
 * estimate directly reduces false "regressions" on unrelated PRs. The
 * perf-baseline workflow overrides these upward for an even stabler reference. */
const QUICK_WARMUP = 5;
const QUICK_SAMPLES = 30;

async function quickStats(combo: Combo, samples: number, warmup: number): Promise<BenchStats> {
	for (let i = 0; i < warmup; i++) {
		await combo.render();
	}
	const samplesNs: number[] = [];
	for (let i = 0; i < samples; i++) {
		const t0 = performance.now();
		await combo.render();
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
const runtime = detectRuntime();
const id = runtimeId(runtime);
console.log(`runtime: ${id}${values.quick ? " (quick mode)" : ""}`);

const prepared = await prepare({ adapters: values.adapters?.split(","), scenarios: values.scenarios?.split(",") });

for (const [name, info] of Object.entries(prepared.libraries)) {
	if (info.status === "unsupported") {
		console.warn(`! ${name} unsupported on ${id}: ${info.error}`);
	}
}
for (const entry of prepared.unsupported) {
	console.warn(`! ${comboName(entry)}: ${entry.reason}`);
}

// Preflight outputs feed the report's gallery.
for (const combo of prepared.combos) {
	const file = outputPath(id, combo.adapter, combo.scenario, combo.format);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, combo.output);
}
const readyCount = Object.values(prepared.libraries).filter((info) => info.status === "ok").length;
console.log(`${prepared.combos.length} combinations across ${readyCount} libraries`);

const entries: BenchEntry[] = [];
const entry = (combo: Combo, stats: BenchStats): BenchEntry => ({
	adapter: combo.adapter,
	scenario: combo.scenario,
	format: combo.format,
	stats,
});

if (values.quick) {
	const samples = values.samples === undefined ? QUICK_SAMPLES : Number(values.samples);
	const warmup = values.warmup === undefined ? QUICK_WARMUP : Number(values.warmup);
	// A bad --samples/--warmup (empty, non-numeric, negative, fractional) would
	// otherwise silently yield NaN stats; these are user inputs on perf-baseline.yml.
	if (!Number.isInteger(samples) || samples < 1) {
		console.error(`--samples must be a positive integer (got ${JSON.stringify(values.samples)})`);
		process.exit(1);
	}
	if (!Number.isInteger(warmup) || warmup < 0) {
		console.error(`--warmup must be a non-negative integer (got ${JSON.stringify(values.warmup)})`);
		process.exit(1);
	}
	console.log(`quick mode: ${warmup} warmup + ${samples} samples per combination`);
	for (const combo of prepared.combos) {
		const stats = await quickStats(combo, samples, warmup);
		entries.push(entry(combo, stats));
		console.log(`${comboName(combo)}: ${(stats.avgNs / 1e6).toFixed(2)} ms avg`);
	}
} else {
	const lookup = new Map<string, Combo>();
	for (const combo of prepared.combos) {
		const name = comboName(combo);
		lookup.set(name, combo);
		bench(name, async () => {
			await combo.render();
		});
	}
	const result = await run();
	for (const b of result.benchmarks) {
		const combo = lookup.get(b.alias);
		const stats = b.runs[0]?.stats;
		if (!combo || !stats) continue;
		entries.push(
			entry(combo, {
				avgNs: stats.avg,
				minNs: stats.min,
				maxNs: stats.max,
				p50Ns: stats.p50,
				p75Ns: stats.p75,
				p99Ns: stats.p99,
				samples: stats.ticks,
			}),
		);
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
	quick: values.quick,
	libraries: prepared.libraries,
	benchmarks: entries,
	unsupported: prepared.unsupported,
};

const outPath = values.out ?? benchResultPath(id);
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(file, null, "\t")}\n`);
console.log(`results written to ${outPath}`);
