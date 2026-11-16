import type { Canvas2D } from "../scenarios/types.ts";
import { defineCanvasAdapter } from "./canvas.ts";

export const skiaCanvasAdapter = defineCanvasAdapter({
	name: "skia-canvas",
	packageName: "skia-canvas",
	formats: ["png", "jpeg", "webp", "svg"],

	async import() {
		const mod = await import("skia-canvas");
		return {
			registerFonts(fonts) {
				for (const family of new Set(fonts.map((font) => font.family))) {
					const paths = fonts.filter((font) => font.family === family).map((font) => font.path);
					mod.FontLibrary.use(family, paths);
				}
			},
			decodeImage: (png) => mod.loadImage(Buffer.from(png)),
			createSurface(width, height, format) {
				// skia-canvas 4 renders on the GPU by default and only falls back to CPU
				// when no usable Vulkan device exists. GPU rasterization anti-aliases
				// differently from the CPU raster that produced the committed baselines,
				// so pin CPU to keep validation and timings machine-independent.
				const canvas = new mod.Canvas(width, height, { gpu: false });
				const ctx = canvas.getContext("2d") as unknown as Canvas2D;
				return (paint, quality) => {
					paint(ctx);
					// skia-canvas expects quality in the 0..1 range, like toDataURL.
					return canvas.toBuffer(format, { quality: quality / 100 });
				};
			},
		};
	},
});
