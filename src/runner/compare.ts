/**
 * Compares two bench result files (base vs head) and emits a markdown diff
 * for the PR sticky comment. Usage:
 *   node src/runner/compare.ts base.json head.json [--out comment.md]
 *
 * Run both sides on the same runner and in the same mode (--quick) so the
 * hardware is controlled; the diff then reflects the code/dependency change.
 */
import { readFile, writeFile } from "node:fs/promises";
import type { BenchResultFile } from "../types.ts";

/** Relative change beyond which a result is flagged as interesting. */
const FLAG_THRESHOLD = 0.15;

const [basePath, headPath] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const outIdx = process.argv.indexOf("--out");
const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;

if (!headPath) {
  console.error("usage: node src/runner/compare.ts base.json head.json [--out file]");
  process.exit(1);
}

async function load(file: string): Promise<BenchResultFile | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as BenchResultFile;
  } catch {
    return undefined;
  }
}

const base = basePath ? await load(basePath) : undefined;
const head = await load(headPath);
if (!head) {
  console.error(`cannot read head results: ${headPath}`);
  process.exit(1);
}

const lines: string[] = [];
lines.push("## 📊 Benchmark comparison");
lines.push("");
lines.push(
  `Runtime: ${head.runtime.name} ${head.runtime.version} · ${head.platform.cpu}${head.quick ? " · quick mode (indicative numbers)" : ""}`,
);
lines.push("");

const key = (b: { adapter: string; scenario: string; format: string }) => `${b.adapter}|${b.scenario}|${b.format}`;
const fmtMs = (ns: number) => `${(ns / 1e6).toPrecision(3)} ms`;

if (!base) {
  lines.push("_No base results available (new benchmark setup?) — head-only numbers below._");
  lines.push("");
  lines.push("| Benchmark | Mean |");
  lines.push("| --- | --- |");
  for (const b of head.benchmarks) {
    lines.push(`| ${b.adapter} · ${b.scenario} · ${b.format} | ${fmtMs(b.stats.avgNs)} |`);
  }
} else {
  // Library version changes.
  const versionChanges: string[] = [];
  for (const [name, info] of Object.entries(head.libraries)) {
    const baseInfo = base.libraries[name];
    if (baseInfo && baseInfo.version !== info.version) {
      versionChanges.push(`- **${name}**: \`${baseInfo.version}\` → \`${info.version}\``);
    }
  }
  if (versionChanges.length > 0) {
    lines.push("**Library version changes:**");
    lines.push(...versionChanges);
    lines.push("");
  }

  const baseMap = new Map(base.benchmarks.map((b) => [key(b), b]));
  const headMap = new Map(head.benchmarks.map((b) => [key(b), b]));

  interface Row {
    name: string;
    baseNs: number;
    headNs: number;
    delta: number;
  }
  const rows: Row[] = [];
  for (const b of head.benchmarks) {
    const baseline = baseMap.get(key(b));
    if (!baseline) continue;
    rows.push({
      name: `${b.adapter} · ${b.scenario} · ${b.format}`,
      baseNs: baseline.stats.avgNs,
      headNs: b.stats.avgNs,
      delta: (b.stats.avgNs - baseline.stats.avgNs) / baseline.stats.avgNs,
    });
  }

  const flagged = rows.filter((r) => Math.abs(r.delta) >= FLAG_THRESHOLD).sort((a, b) => a.delta - b.delta);
  const added = head.benchmarks.filter((b) => !baseMap.has(key(b)));
  const removed = base.benchmarks.filter((b) => !headMap.has(key(b)));

  if (flagged.length === 0) {
    lines.push(`No benchmark changed by more than ±${FLAG_THRESHOLD * 100}%.`);
    lines.push("");
  } else {
    lines.push(`**Interesting changes** (±${FLAG_THRESHOLD * 100}% or more):`);
    lines.push("");
    lines.push("| Benchmark | Base | Head | Δ |");
    lines.push("| --- | --- | --- | --- |");
    for (const r of flagged) {
      const icon = r.delta < 0 ? "🚀" : "⚠️";
      const pct = `${r.delta > 0 ? "+" : ""}${(r.delta * 100).toFixed(1)}%`;
      lines.push(`| ${r.name} | ${fmtMs(r.baseNs)} | ${fmtMs(r.headNs)} | ${icon} ${pct} |`);
    }
    lines.push("");
  }

  if (added.length > 0) {
    lines.push(`**Newly supported:** ${added.map((b) => `${b.adapter} · ${b.scenario} · ${b.format}`).join(", ")}`);
    lines.push("");
  }
  if (removed.length > 0) {
    lines.push(`**No longer supported:** ${removed.map((b) => `${b.adapter} · ${b.scenario} · ${b.format}`).join(", ")}`);
    lines.push("");
  }

  lines.push("<details><summary>All results</summary>");
  lines.push("");
  lines.push("| Benchmark | Base | Head | Δ |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    const pct = `${r.delta > 0 ? "+" : ""}${(r.delta * 100).toFixed(1)}%`;
    lines.push(`| ${r.name} | ${fmtMs(r.baseNs)} | ${fmtMs(r.headNs)} | ${pct} |`);
  }
  lines.push("");
  lines.push("</details>");
}

lines.push("");
const output = lines.join("\n");
if (outPath) {
  await writeFile(outPath, output);
  console.error(`comparison written to ${outPath}`);
} else {
  console.log(output);
}
