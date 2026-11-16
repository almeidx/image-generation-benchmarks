import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { OutputFormat } from "./formats.ts";
import type { RuntimeInfo } from "./runtime.ts";

/** Per-library cold-start phases, measured once per process. */
export interface SetupTimings {
	importMs: number;
	fontsMs: number;
	/** Decoding/registering source images. */
	assetsMs: number;
	/** First end-to-end png render+encode (lazy initialization, JIT warm-up). */
	firstRenderMs: number;
}

export type LibraryInfo =
	| { version: string; status: "ok"; setup: SetupTimings }
	| { version: string; status: "unsupported"; error: string };

export interface BenchStats {
	avgNs: number;
	minNs: number;
	maxNs: number;
	p50Ns: number;
	p75Ns: number;
	p99Ns: number;
	samples: number;
}

export interface ComboId {
	adapter: string;
	scenario: string;
	format: OutputFormat;
}

export interface BenchEntry extends ComboId {
	stats: BenchStats;
}

export interface UnsupportedEntry extends ComboId {
	reason: string;
}

export interface BenchResultFile {
	schemaVersion: 1;
	runtime: RuntimeInfo;
	platform: { os: string; arch: string; cpu: string };
	timestamp: string;
	quick: boolean;
	libraries: Record<string, LibraryInfo>;
	benchmarks: BenchEntry[];
	unsupported: UnsupportedEntry[];
}

export interface BaselineComparison {
	adapter: string;
	scenario: string;
	diffRatio: number;
	pass: boolean;
	diffImage?: string;
}

export interface CrossLibComparison {
	scenario: string;
	adapterA: string;
	adapterB: string;
	diffRatio: number;
	diffImage: string;
}

export interface ValidationResultFile {
	schemaVersion: 1;
	runtime: RuntimeInfo;
	timestamp: string;
	threshold: number;
	baselines: BaselineComparison[];
	crossLibrary: CrossLibComparison[];
	missingBaselines: { adapter: string; scenario: string }[];
}

export function comboName(combo: ComboId): string {
	return `${combo.adapter} · ${combo.scenario} · ${combo.format}`;
}

export function formatMs(ns: number): string {
	const ms = ns / 1e6;
	return `${ms >= 100 ? ms.toFixed(0) : ms.toPrecision(3)} ms`;
}

export function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function jsonFiles(dir: string): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (isMissingFile(error)) return [];
		throw error;
	}
	const found: string[] = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) found.push(...(await jsonFiles(full)));
		else if (entry.name.endsWith(".json")) found.push(full);
	}
	return found;
}

/** Every bench and validation result file under `dir` (recursively), classified by shape. */
export async function readResultFiles(
	dir: string,
): Promise<{ bench: BenchResultFile[]; validations: ValidationResultFile[] }> {
	const bench: BenchResultFile[] = [];
	const validations: ValidationResultFile[] = [];
	for (const file of await jsonFiles(dir)) {
		const data = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
		if (data.schemaVersion !== 1) continue;
		if (Array.isArray(data.benchmarks)) bench.push(data as unknown as BenchResultFile);
		else if (Array.isArray(data.baselines)) validations.push(data as unknown as ValidationResultFile);
	}
	return { bench, validations };
}
