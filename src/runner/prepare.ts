import { readFile } from "node:fs/promises";
import path from "node:path";
import { adapters } from "../adapters/index.ts";
import type { Adapter, RenderOptions, Renderer } from "../adapters/types.ts";
import { sniffFormat, type OutputFormat } from "../formats.ts";
import { repoRoot } from "../layout.ts";
import type { ComboId, LibraryInfo, UnsupportedEntry } from "../results.ts";
import { scenarios } from "../scenarios/index.ts";
import type { AdapterKind, Scenario, ScenarioFor } from "../scenarios/types.ts";
import { loadAssets } from "./load-assets.ts";

/** Identical encode settings for every library. */
const renderOptions: RenderOptions = { quality: 80 };

export interface Combo extends ComboId {
	kind: Adapter["kind"];
	/** One timed unit of work: render + encode. */
	render(): Promise<Uint8Array>;
	/** Output bytes from the preflight render. */
	output: Uint8Array;
}

export interface Prepared {
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

async function timed<T>(run: () => T | Promise<T>): Promise<[T, number]> {
	const t0 = performance.now();
	const value = await run();
	return [value, performance.now() - t0];
}

function implementing<K extends AdapterKind>(kind: K) {
	return (scenario: Scenario): scenario is ScenarioFor<K> => scenario[kind] !== undefined;
}

/**
 * Sets up every adapter (recording cold-start phase timings), then preflights
 * each adapter x scenario x format combination once. Combinations that throw
 * or encode a different format than requested are recorded as unsupported
 * instead of failing the run: feature gaps are findings, not errors.
 */
export async function prepare(filter?: {
	adapters?: string[];
	scenarios?: string[];
	formats?: OutputFormat[];
}): Promise<Prepared> {
	const assets = await loadAssets();
	const versions = await libraryVersions();
	const libraries: Record<string, LibraryInfo> = {};
	const combos: Combo[] = [];
	const unsupported: UnsupportedEntry[] = [];

	const selectedAdapters = adapters.filter((a) => !filter?.adapters || filter.adapters.includes(a.name));
	const selectedScenarios = scenarios.filter((s) => !filter?.scenarios || filter.scenarios.includes(s.name));

	for (const adapter of selectedAdapters) {
		const version = versions[adapter.packageName] ?? "unknown";
		const supported = selectedScenarios.filter(implementing(adapter.kind));
		const first = supported[0];
		if (!first) continue;
		let renderer: Renderer<AdapterKind, OutputFormat>;
		try {
			const [library, importMs] = await timed(() => adapter.import());
			const [withFonts, fontsMs] = await timed(() => library.registerFonts(assets.fonts));
			const [loaded, assetsMs] = await timed(() => withFonts.loadImages(assets.images));
			const [, firstRenderMs] = await timed(() => loaded.render(first, "png", renderOptions));
			renderer = loaded;
			libraries[adapter.name] = { version, status: "ok", setup: { importMs, fontsMs, assetsMs, firstRenderMs } };
		} catch (error) {
			libraries[adapter.name] = { version, status: "unsupported", error: String(error) };
			continue;
		}

		for (const scenario of supported) {
			for (const format of adapter.formats) {
				if (filter?.formats && !filter.formats.includes(format)) continue;
				const id = { adapter: adapter.name, scenario: scenario.name, format };
				const render = () => renderer.render(scenario, format, renderOptions);
				try {
					const output = await render();
					const actual = sniffFormat(output);
					if (actual !== format) throw new Error(`encoder produced ${actual ?? "unrecognized bytes"}, not ${format}`);
					combos.push({ ...id, kind: adapter.kind, render, output });
				} catch (error) {
					unsupported.push({ ...id, reason: String(error).split("\n")[0] ?? "unknown" });
				}
			}
		}
	}

	return { libraries, combos, unsupported };
}
