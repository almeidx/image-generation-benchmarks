import type { Adapter, Assets, Canvas2D, CanvasAssets, OutputFormat, RenderOptions, Scenario } from "../types.ts";

interface NapiCanvas {
  getContext(kind: "2d"): unknown;
  encode(format: "png"): Promise<Buffer>;
  encode(format: "jpeg" | "webp", quality?: number): Promise<Buffer>;
  encode(format: "avif", cfg?: { quality?: number }): Promise<Buffer>;
}

let mod: typeof import("@napi-rs/canvas") | undefined;
const canvases = new Map<string, NapiCanvas>();
let images: CanvasAssets | undefined;

export const napiRsCanvasAdapter: Adapter = {
  name: "napi-rs-canvas",
  kind: "canvas",
  packageName: "@napi-rs/canvas",
  formats: ["png", "jpeg", "webp", "avif"],

  async setup(assets: Assets) {
    const t0 = performance.now();
    mod = await import("@napi-rs/canvas");
    const t1 = performance.now();
    mod.GlobalFonts.register(Buffer.from(assets.fonts.sansRegular.data));
    mod.GlobalFonts.register(Buffer.from(assets.fonts.sansBold.data));
    const t2 = performance.now();
    const [photo, avatar] = await Promise.all([
      mod.loadImage(assets.images.photo.data),
      mod.loadImage(assets.images.avatar.data),
    ]);
    images = { photo, avatar };
    const t3 = performance.now();
    return { importMs: t1 - t0, fontsMs: t2 - t1, assetsMs: t3 - t2 };
  },

  async render(scenario: Scenario, format: OutputFormat, options: RenderOptions) {
    const key = `${scenario.width}x${scenario.height}`;
    let canvas = canvases.get(key);
    if (!canvas) {
      canvas = mod!.createCanvas(scenario.width, scenario.height) as unknown as NapiCanvas;
      canvases.set(key, canvas);
    }
    const ctx = canvas.getContext("2d") as Canvas2D;
    ctx.save();
    ctx.clearRect(0, 0, scenario.width, scenario.height);
    scenario.drawCanvas!(ctx, images!);
    ctx.restore();
    if (format === "png") return canvas.encode("png");
    if (format === "jpeg" || format === "webp") return canvas.encode(format, options.quality);
    if (format === "avif") return canvas.encode("avif", { quality: options.quality });
    throw new Error(`format not supported: ${format}`);
  },
};
