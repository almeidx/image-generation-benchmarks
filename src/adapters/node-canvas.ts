import type { Adapter, Assets, Canvas2D, CanvasAssets, OutputFormat, RenderOptions, Scenario } from "../types.ts";

interface NodeCanvas {
  getContext(kind: "2d"): unknown;
  toBuffer(cb: (err: Error | null, buf: Buffer) => void, mime: string, cfg?: { quality?: number }): void;
  toBuffer(): Buffer;
}

let mod: typeof import("canvas") | undefined;
const canvases = new Map<string, NodeCanvas>();
let images: CanvasAssets | undefined;

function encodeAsync(canvas: NodeCanvas, mime: string, cfg?: { quality?: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    canvas.toBuffer((err, buf) => (err ? reject(err) : resolve(buf)), mime, cfg);
  });
}

export const nodeCanvasAdapter: Adapter = {
  name: "node-canvas",
  kind: "canvas",
  packageName: "canvas",
  formats: ["png", "jpeg", "svg"],

  async setup(assets: Assets) {
    const t0 = performance.now();
    mod = await import("canvas");
    const t1 = performance.now();
    // registerFont must run before any canvas is created.
    mod.registerFont(assets.fonts.sansRegular.path, { family: "Inter", weight: "normal" });
    mod.registerFont(assets.fonts.sansBold.path, { family: "Inter", weight: "bold" });
    const t2 = performance.now();
    const [photo, avatar] = await Promise.all([
      mod.loadImage(Buffer.from(assets.images.photo.data)),
      mod.loadImage(Buffer.from(assets.images.avatar.data)),
    ]);
    images = { photo, avatar };
    const t3 = performance.now();
    return { importMs: t1 - t0, fontsMs: t2 - t1, assetsMs: t3 - t2 };
  },

  async render(scenario: Scenario, format: OutputFormat, options: RenderOptions) {
    if (format === "svg") {
      // SVG requires a dedicated canvas type; creating it is part of the cost.
      const svgCanvas = mod!.createCanvas(scenario.width, scenario.height, "svg") as unknown as NodeCanvas;
      scenario.drawCanvas!(svgCanvas.getContext("2d") as Canvas2D, images!);
      return svgCanvas.toBuffer();
    }
    const key = `${scenario.width}x${scenario.height}`;
    let canvas = canvases.get(key);
    if (!canvas) {
      canvas = mod!.createCanvas(scenario.width, scenario.height) as unknown as NodeCanvas;
      canvases.set(key, canvas);
    }
    const ctx = canvas.getContext("2d") as Canvas2D;
    ctx.save();
    ctx.clearRect(0, 0, scenario.width, scenario.height);
    scenario.drawCanvas!(ctx, images!);
    ctx.restore();
    if (format === "png") return encodeAsync(canvas, "image/png");
    if (format === "jpeg") return encodeAsync(canvas, "image/jpeg", { quality: options.quality / 100 });
    throw new Error(`format not supported: ${format}`);
  },
};
