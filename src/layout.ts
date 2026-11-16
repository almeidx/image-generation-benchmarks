import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORMAT_EXTENSIONS, type OutputFormat } from "./formats.ts";

export const repoRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const resultsDir: string = path.join(repoRoot, "results");
export const siteDir: string = path.join(repoRoot, "site", "public");

export function fontPath(file: string): string {
	return path.join(repoRoot, "assets", "fonts", file);
}

export function imagePath(name: string): string {
	return path.join(repoRoot, "assets", "images", `${name}.png`);
}

export function baselinePath(adapter: string, scenario: string): string {
	return path.join(repoRoot, "baselines", adapter, `${scenario}.png`);
}

export function benchResultPath(runtimeId: string): string {
	return path.join(resultsDir, `${runtimeId}.json`);
}

export function validationResultPath(runtimeId: string): string {
	return path.join(resultsDir, `validation-${runtimeId}.json`);
}

/** Rendered outputs: `<root>/outputs/<runtime>/<adapter>/<scenario>.<ext>`. */
export function outputsDir(root: string): string {
	return path.join(root, "outputs");
}

export function outputPath(runtimeId: string, adapter: string, scenario: string, format: OutputFormat): string {
	return path.join(outputsDir(resultsDir), runtimeId, adapter, `${scenario}.${FORMAT_EXTENSIONS[format]}`);
}

export function baselineDiffPath(runtimeId: string, adapter: string, scenario: string): string {
	return path.join(resultsDir, "diffs", runtimeId, "baseline", adapter, `${scenario}.png`);
}

export function crossDiffPath(runtimeId: string, scenario: string, adapterA: string, adapterB: string): string {
	return path.join(resultsDir, "diffs", runtimeId, "cross", scenario, `${adapterA}__${adapterB}.png`);
}
