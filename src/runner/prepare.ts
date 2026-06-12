import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
	Adapter,
	Assets,
	LibraryInfo,
	OutputFormat,
	RenderOptions,
	Scenario,
	SetupTimings,
	UnsupportedEntry,
} from "../types.ts";
import { adapters } from "../adapters/index.ts";
import { scenarios } from "../scenarios/index.ts";
import { loadAssets, repoRoot } from "../utils/assets.ts";

/** Identical encode settings for every library. */
export const renderOptions: RenderOptions = { quality: 80 };

export interface Combo {
	adapter: Adapter;
	scenario: Scenario;
	format: OutputFormat;
	/** Output bytes from the preflight render, reusable for validation/gallery. */
	output: Uint8Array;
}

export interface Prepared {
	assets: Assets;
	ready: Adapter[];
	libraries: Record<string, LibraryInfo>;
	combos: Combo[];
	unsupported: UnsupportedEntry[];
}

async function libraryVersions(): Promise<Record<string, string>> {
	const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
		dependencies: Record<string, string>;
	};
	return pkg.dependencies;
}

/**
 * Sets up every adapter (recording cold-start phase timings), then preflights
 * each adapter x scenario x format combination once. Combinations that throw
 * are recorded as unsupported instead of failing the run — feature gaps are
 * findings, not errors.
 */
export async function prepare(filter?: {
	adapters?: string[];
	scenarios?: string[];
	formats?: OutputFormat[];
}): Promise<Prepared> {
	const assets = await loadAssets();
	const versions = await libraryVersions();
	const libraries: Record<string, LibraryInfo> = {};
	const ready: Adapter[] = [];
	const combos: Combo[] = [];
	const unsupported: UnsupportedEntry[] = [];

	const selectedAdapters = adapters.filter(
		(a) => !filter?.adapters || filter.adapters.includes(a.name),
	);
	const selectedScenarios = scenarios.filter(
		(s) => !filter?.scenarios || filter.scenarios.includes(s.name),
	);

	for (const adapter of selectedAdapters) {
		const version = versions[adapter.packageName] ?? "unknown";
		let setup: SetupTimings;
		try {
			const phases = await adapter.setup(assets);
			// First end-to-end render approximates the remaining cold-start cost
			// (lazy canvas/font initialization, JIT warm-up, etc).
			const first =
				selectedScenarios.find((s) => s.kinds.includes(adapter.kind)) ?? selectedScenarios[0];
			const t0 = performance.now();
			if (first) await adapter.render(first, "png", renderOptions);
			setup = { ...phases, firstRenderMs: performance.now() - t0 };
		} catch (error) {
			libraries[adapter.name] = { version, status: "unsupported", error: String(error) };
			continue;
		}
		libraries[adapter.name] = { version, status: "ok", setup };
		ready.push(adapter);

		for (const scenario of selectedScenarios) {
			if (!scenario.kinds.includes(adapter.kind)) {
				continue;
			}
			for (const format of adapter.formats) {
				if (filter?.formats && !filter.formats.includes(format)) continue;
				try {
					const output = await adapter.render(scenario, format, renderOptions);
					if (output.length === 0) throw new Error("empty output");
					combos.push({ adapter, scenario, format, output });
				} catch (error) {
					unsupported.push({
						adapter: adapter.name,
						scenario: scenario.name,
						format,
						reason: String(error).split("\n")[0] ?? "unknown",
					});
				}
			}
		}
	}

	return { assets, ready, libraries, combos, unsupported };
}

export function comboKey(adapter: string, scenario: string, format: string): string {
	return `${adapter} · ${scenario} · ${format}`;
}
