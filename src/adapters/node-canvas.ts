import type { Canvas2D } from "../scenarios/types.ts";
import { defineCanvasAdapter } from "./canvas.ts";

interface NodeCanvas {
	getContext(kind: "2d"): unknown;
	toBuffer(cb: (err: Error | null, buf: Buffer) => void, mime: string, cfg?: { quality?: number }): void;
	toBuffer(): Buffer;
}

function encodeAsync(canvas: NodeCanvas, mime: string, cfg?: { quality?: number }): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		canvas.toBuffer((err, buf) => (err ? reject(err) : resolve(buf)), mime, cfg);
	});
}

export const nodeCanvasAdapter = defineCanvasAdapter({
	name: "node-canvas",
	packageName: "canvas",
	formats: ["png", "jpeg", "svg"],

	async import() {
		const mod = await import("canvas");
		const create = (width: number, height: number, type?: "svg") =>
			mod.createCanvas(width, height, type) as unknown as NodeCanvas;
		return {
			// registerFont must run before any canvas is created.
			registerFonts(fonts) {
				for (const font of fonts) {
					mod.registerFont(font.path, { family: font.family, weight: font.weight === 700 ? "bold" : "normal" });
				}
			},
			decodeImage: (png) => mod.loadImage(Buffer.from(png)),
			createSurface(width, height, format) {
				if (format === "svg") {
					// A Cairo SVG surface only records drawing, so clearing cannot reset it:
					// every frame needs a new canvas, and creating it is part of the cost.
					return (paint) => {
						const canvas = create(width, height, "svg");
						paint(canvas.getContext("2d") as Canvas2D);
						return Promise.resolve(canvas.toBuffer());
					};
				}
				const canvas = create(width, height);
				const ctx = canvas.getContext("2d") as Canvas2D;
				const mime = `image/${format}`;
				return (paint, quality) => {
					paint(ctx);
					return format === "png" ? encodeAsync(canvas, mime) : encodeAsync(canvas, mime, { quality: quality / 100 });
				};
			},
		};
	},
});
