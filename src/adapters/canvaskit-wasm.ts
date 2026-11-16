import { createRequire } from "node:module";
import path from "node:path";
import type { Canvas2D } from "../scenarios/types.ts";
import { defineCanvasAdapter } from "./canvas.ts";

interface EmulatedCanvas {
	getContext(kind: "2d"): unknown;
	loadFont(data: ArrayBuffer | Uint8Array, descriptors: Record<string, string>): void;
	decodeImage(data: ArrayBuffer | Uint8Array): unknown;
	/** Encodes PNG unless `mime` is image/jpeg; undefined when the build lacks that encoder. */
	toDataURL(mime?: string, quality?: number): string | undefined;
}

interface CanvasKitLike {
	MakeCanvas?(width: number, height: number): EmulatedCanvas;
}

export const canvaskitWasmAdapter = defineCanvasAdapter({
	name: "canvaskit-wasm",
	packageName: "canvaskit-wasm",
	formats: ["png", "jpeg"],

	async import() {
		const require = createRequire(import.meta.url);
		const init = (await import("canvaskit-wasm")).default as unknown as (opts: {
			locateFile: (file: string) => string;
		}) => Promise<CanvasKitLike>;
		const binDir = path.dirname(require.resolve("canvaskit-wasm"));
		const CanvasKit = await init({ locateFile: (file) => path.join(binDir, file) });
		if (typeof CanvasKit.MakeCanvas !== "function") {
			throw new Error("CanvasKit build does not include the canvas2d emulation (MakeCanvas)");
		}
		const makeCanvas = CanvasKit.MakeCanvas.bind(CanvasKit);
		// The emulation only exposes font loading and image decoding as canvas
		// methods, but both fill caches shared by every canvas.
		const shared = makeCanvas(1, 1);
		return {
			registerFonts(fonts) {
				for (const font of fonts) {
					shared.loadFont(font.data, { family: font.family, style: "normal", weight: String(font.weight) });
				}
			},
			decodeImage: (png) => shared.decodeImage(png),
			createSurface(width, height, format) {
				const canvas = makeCanvas(width, height);
				const ctx = canvas.getContext("2d") as Canvas2D;
				const mime = `image/${format}`;
				return (paint, quality) => {
					paint(ctx);
					const dataUrl = canvas.toDataURL(mime, quality / 100);
					if (dataUrl === undefined) return Promise.reject(new Error(`no ${format} encoder in this CanvasKit build`));
					return Promise.resolve(Uint8Array.from(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")));
				};
			},
		};
	},
});
