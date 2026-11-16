import type { Canvas2D } from "../scenarios/types.ts";
import { defineCanvasAdapter } from "./canvas.ts";

export const napiRsCanvasAdapter = defineCanvasAdapter({
	name: "napi-rs-canvas",
	packageName: "@napi-rs/canvas",
	formats: ["png", "jpeg", "webp", "avif"],

	async import() {
		const mod = await import("@napi-rs/canvas");
		return {
			registerFonts(fonts) {
				for (const font of fonts) mod.GlobalFonts.register(Buffer.from(font.data));
			},
			decodeImage: (png) => mod.loadImage(png),
			createSurface(width, height, format) {
				const canvas = mod.createCanvas(width, height);
				const ctx = canvas.getContext("2d") as unknown as Canvas2D;
				return (paint, quality) => {
					paint(ctx);
					if (format === "png") return canvas.encode("png");
					if (format === "avif") return canvas.encode("avif", { quality });
					return canvas.encode(format, quality);
				};
			},
		};
	},
});
