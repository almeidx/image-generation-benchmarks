import { createRequire } from "node:module";
import path from "node:path";
import type {
	Adapter,
	Assets,
	Canvas2D,
	CanvasAssets,
	OutputFormat,
	RenderOptions,
	Scenario,
} from "../types.ts";

interface EmulatedCanvas {
	getContext(kind: "2d"): unknown;
	loadFont(data: ArrayBuffer | Uint8Array, descriptors: Record<string, string>): void;
	decodeImage(data: ArrayBuffer | Uint8Array): unknown;
	toDataURL(mime?: string, quality?: number): string;
	dispose(): void;
}

interface CanvasKitLike {
	MakeCanvas?(width: number, height: number): EmulatedCanvas;
}

let CanvasKit: CanvasKitLike | undefined;
let fontBuffers: Uint8Array[] = [];
let imageBytes: { photo: Uint8Array; avatar: Uint8Array } | undefined;
const canvases = new Map<string, { canvas: EmulatedCanvas; images: CanvasAssets }>();

function dataUrlToBytes(dataUrl: string, expectedMime: string): Uint8Array {
	const comma = dataUrl.indexOf(",");
	const header = dataUrl.slice(0, comma);
	if (!header.includes(expectedMime)) {
		throw new Error(`encoder produced ${header} instead of ${expectedMime}`);
	}
	return Uint8Array.from(Buffer.from(dataUrl.slice(comma + 1), "base64"));
}

function getCanvas(
	width: number,
	height: number,
): { canvas: EmulatedCanvas; images: CanvasAssets } {
	const key = `${width}x${height}`;
	let entry = canvases.get(key);
	if (!entry) {
		const canvas = CanvasKit!.MakeCanvas!(width, height);
		// Fonts and images are registered per emulated canvas in CanvasKit.
		canvas.loadFont(fontBuffers[0]!, { family: "Inter", style: "normal", weight: "400" });
		canvas.loadFont(fontBuffers[1]!, { family: "Inter", style: "normal", weight: "700" });
		const images = {
			photo: canvas.decodeImage(imageBytes!.photo),
			avatar: canvas.decodeImage(imageBytes!.avatar),
		} as unknown as CanvasAssets;
		entry = { canvas, images };
		canvases.set(key, entry);
	}
	return entry;
}

export const canvaskitWasmAdapter: Adapter = {
	name: "canvaskit-wasm",
	kind: "canvas",
	packageName: "canvaskit-wasm",
	formats: ["png", "jpeg", "webp"],

	async setup(assets: Assets) {
		const t0 = performance.now();
		const require = createRequire(import.meta.url);
		const init = (await import("canvaskit-wasm")).default as unknown as (opts: {
			locateFile: (file: string) => string;
		}) => Promise<CanvasKitLike>;
		const binDir = path.dirname(require.resolve("canvaskit-wasm"));
		CanvasKit = await init({ locateFile: (file) => path.join(binDir, file) });
		if (typeof CanvasKit.MakeCanvas !== "function") {
			throw new Error("CanvasKit build does not include the canvas2d emulation (MakeCanvas)");
		}
		const t1 = performance.now();
		fontBuffers = [assets.fonts.sansRegular.data, assets.fonts.sansBold.data];
		const t2 = performance.now();
		imageBytes = { photo: assets.images.photo.data, avatar: assets.images.avatar.data };
		const t3 = performance.now();

		// Probe optional codecs: the prebuilt wasm silently falls back to PNG
		// for formats it cannot encode.
		const probe = CanvasKit.MakeCanvas(8, 8);
		for (const format of ["jpeg", "webp"] as const) {
			try {
				dataUrlToBytes(probe.toDataURL(`image/${format}`, 0.8), `image/${format}`);
			} catch {
				this.formats = this.formats.filter((f) => f !== format);
			}
		}
		probe.dispose();
		return { importMs: t1 - t0, fontsMs: t2 - t1, assetsMs: t3 - t2 };
	},

	async render(scenario: Scenario, format: OutputFormat, options: RenderOptions) {
		const { canvas, images } = getCanvas(scenario.width, scenario.height);
		const ctx = canvas.getContext("2d") as Canvas2D;
		ctx.save();
		ctx.clearRect(0, 0, scenario.width, scenario.height);
		scenario.drawCanvas!(ctx, images);
		ctx.restore();
		const mime = `image/${format}`;
		return dataUrlToBytes(canvas.toDataURL(mime, options.quality / 100), mime);
	},
};
