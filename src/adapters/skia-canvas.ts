import type {
	Adapter,
	Assets,
	Canvas2D,
	CanvasAssets,
	OutputFormat,
	RenderOptions,
	Scenario,
} from "../types.ts";

interface SkiaCanvas {
	getContext(kind: "2d"): unknown;
	toBuffer(format: string, options?: { quality?: number }): Promise<Buffer>;
}

let mod: typeof import("skia-canvas") | undefined;
const canvases = new Map<string, SkiaCanvas>();
let images: CanvasAssets | undefined;

export const skiaCanvasAdapter: Adapter = {
	name: "skia-canvas",
	kind: "canvas",
	packageName: "skia-canvas",
	formats: ["png", "jpeg", "webp", "svg"],

	async setup(assets: Assets) {
		const t0 = performance.now();
		mod = await import("skia-canvas");
		const t1 = performance.now();
		mod.FontLibrary.use("Inter", [assets.fonts.sansRegular.path, assets.fonts.sansBold.path]);
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
		const key = `${scenario.width}x${scenario.height}`;
		let canvas = canvases.get(key);
		if (!canvas) {
			canvas = new mod!.Canvas(scenario.width, scenario.height) as unknown as SkiaCanvas;
			canvases.set(key, canvas);
		}
		const ctx = canvas.getContext("2d") as Canvas2D;
		ctx.save();
		ctx.clearRect(0, 0, scenario.width, scenario.height);
		scenario.drawCanvas!(ctx, images!);
		ctx.restore();
		// skia-canvas expects quality in the 0..1 range, like toDataURL.
		return canvas.toBuffer(format, { quality: options.quality / 100 });
	},
};
