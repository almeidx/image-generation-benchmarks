import { PassThrough, Readable } from "node:stream";
import type { Adapter, Assets, Canvas2D, CanvasAssets, OutputFormat, RenderOptions, Scenario } from "../types.ts";

interface PureBitmap {
  getContext(kind: "2d"): Canvas2D;
}

let mod: typeof import("pureimage") | undefined;
const bitmaps = new Map<string, { bitmap: PureBitmap; ctx: Canvas2D }>();
let images: CanvasAssets | undefined;

const FONT_RE = /^(bold )?(\d+(?:\.\d+)?)px Inter$/;

/**
 * pureimage matches fonts by exact registered name and does not parse weight
 * tokens from the font shorthand, so bold is registered as its own family
 * ("Inter Bold") and this proxy rewrites scenario font strings accordingly.
 */
function shimFont(ctx: Canvas2D): Canvas2D {
  return new Proxy(ctx as unknown as Record<string | symbol, unknown>, {
    set(target, prop, value) {
      if (prop === "font" && typeof value === "string") {
        const m = FONT_RE.exec(value);
        if (m) {
          target.font = `${m[2]}px '${m[1] ? "Inter Bold" : "Inter"}'`;
          return true;
        }
      }
      target[prop] = value;
      return true;
    },
    get(target, prop) {
      const value = target[prop];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }) as unknown as Canvas2D;
}

async function collectStream(write: (stream: PassThrough) => Promise<unknown>): Promise<Uint8Array> {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));
  await write(stream);
  return Uint8Array.from(Buffer.concat(chunks));
}

export const pureimageAdapter: Adapter = {
  name: "pureimage",
  kind: "canvas",
  packageName: "pureimage",
  formats: ["png", "jpeg"],

  async setup(assets: Assets) {
    const t0 = performance.now();
    mod = await import("pureimage");
    const t1 = performance.now();
    await mod.registerFont(assets.fonts.sansRegular.path, "Inter").load();
    await mod.registerFont(assets.fonts.sansBold.path, "Inter Bold").load();
    const t2 = performance.now();
    const [photo, avatar] = await Promise.all([
      mod.decodePNGFromStream(Readable.from(Buffer.from(assets.images.photo.data))),
      mod.decodePNGFromStream(Readable.from(Buffer.from(assets.images.avatar.data))),
    ]);
    images = { photo, avatar } as unknown as CanvasAssets;
    const t3 = performance.now();
    return { importMs: t1 - t0, fontsMs: t2 - t1, assetsMs: t3 - t2 };
  },

  async render(scenario: Scenario, format: OutputFormat, options: RenderOptions) {
    const key = `${scenario.width}x${scenario.height}`;
    let entry = bitmaps.get(key);
    if (!entry) {
      const bitmap = mod!.make(scenario.width, scenario.height) as unknown as PureBitmap;
      entry = { bitmap, ctx: shimFont(bitmap.getContext("2d")) };
      bitmaps.set(key, entry);
    }
    // pureimage logs rasterizer warnings ("can't project the same paths")
    // via console.log on degenerate curves; suppress them or they flood CI
    // logs at hundreds of lines per render.
    const log = console.log;
    console.log = () => {};
    try {
      entry.ctx.clearRect(0, 0, scenario.width, scenario.height);
      scenario.drawCanvas!(entry.ctx, images!);
    } finally {
      console.log = log;
    }
    if (format === "png") {
      return collectStream((s) => mod!.encodePNGToStream(entry.bitmap as never, s));
    }
    if (format === "jpeg") {
      return collectStream((s) => mod!.encodeJPEGToStream(entry.bitmap as never, s, options.quality));
    }
    throw new Error(`format not supported: ${format}`);
  },
};
