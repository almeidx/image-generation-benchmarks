/**
 * Regenerates the committed per-library baseline PNGs. Run on Linux x64
 * (ubuntu-latest equivalent) with Node so baselines match what CI renders:
 *   npm run baselines:update
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { baselinesDir } from "../src/utils/assets.ts";
import { detectRuntime } from "../src/utils/runtime.ts";
import { prepare } from "../src/runner/prepare.ts";

const runtime = detectRuntime();
if (runtime.name !== "node" || process.platform !== "linux") {
  console.warn(
    `warning: baselines are canonically generated on linux + node; this is ${process.platform} + ${runtime.name}`,
  );
}

const prepared = await prepare({ formats: ["png"] });

for (const combo of prepared.combos) {
  const dir = path.join(baselinesDir, combo.adapter.name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${combo.scenario.name}.png`), combo.output);
  console.log(`wrote baselines/${combo.adapter.name}/${combo.scenario.name}.png`);
}

for (const [name, info] of Object.entries(prepared.libraries)) {
  if (info.status === "unsupported") {
    console.warn(`! ${name} not set up: ${info.error}`);
  }
}
for (const entry of prepared.unsupported.filter((u) => u.format === "png")) {
  console.warn(`! no baseline for ${entry.adapter}/${entry.scenario}: ${entry.reason}`);
}
