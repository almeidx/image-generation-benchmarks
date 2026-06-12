import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { Adapter, Assets, ElementAssets, OutputFormat, RenderOptions, Scenario } from "../types.ts";
import { toDataUri } from "../utils/assets.ts";

type SatoriFn = typeof import("satori").default;
type ResvgCtor = typeof import("@resvg/resvg-js").Resvg;

interface SatoriFont {
  name: string;
  data: ArrayBuffer | Buffer;
  weight: 400 | 700;
  style: "normal";
}

let satori: SatoriFn | undefined;
let Resvg: ResvgCtor | undefined;
let fonts: SatoriFont[] = [];
let elementAssets: ElementAssets | undefined;

export const satoriAdapter: Adapter = {
  name: "satori",
  kind: "declarative",
  packageName: "satori",
  formats: ["png", "svg"],

  async setup(assets: Assets) {
    const t0 = performance.now();
    satori = (await import("satori")).default;
    // Native resvg first; wasm build as a portability fallback.
    try {
      Resvg = (await import("@resvg/resvg-js")).Resvg;
    } catch {
      const wasm = await import("@resvg/resvg-wasm");
      const require = createRequire(import.meta.url);
      await wasm.initWasm(await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
      Resvg = wasm.Resvg as unknown as ResvgCtor;
    }
    const t1 = performance.now();
    fonts = [
      { name: "Inter", data: Buffer.from(assets.fonts.sansRegular.data), weight: 400, style: "normal" },
      { name: "Inter", data: Buffer.from(assets.fonts.sansBold.data), weight: 700, style: "normal" },
    ];
    const t2 = performance.now();
    elementAssets = {
      photoSrc: toDataUri(assets.images.photo.data, "image/png"),
      avatarSrc: toDataUri(assets.images.avatar.data, "image/png"),
    };
    const t3 = performance.now();
    return { importMs: t1 - t0, fontsMs: t2 - t1, assetsMs: t3 - t2 };
  },

  async render(scenario: Scenario, format: OutputFormat, _options: RenderOptions) {
    const element = scenario.element!(elementAssets!);
    const svg = await satori!(element as never, {
      width: scenario.width,
      height: scenario.height,
      fonts,
    });
    if (format === "svg") return new TextEncoder().encode(svg);
    if (format === "png") {
      // Satori outputs text as paths, so rasterization needs no font config.
      const rendered = new Resvg!(svg, { fitTo: { mode: "width", value: scenario.width } }).render();
      return rendered.asPng();
    }
    throw new Error(`format not supported: ${format}`);
  },
};
