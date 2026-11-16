import { buildImages, type FontAsset } from "../assets.ts";
import type { OutputFormat } from "../formats.ts";
import type { Canvas2D } from "../scenarios/types.ts";
import type { Adapter } from "./types.ts";

/** Paints one frame via `paint` on a cleared canvas of the surface's size, then encodes it. */
type CanvasSurface = (paint: (ctx: Canvas2D) => void, quality: number) => Promise<Uint8Array>;

interface CanvasBackend<F extends OutputFormat> {
	registerFonts(fonts: readonly FontAsset[]): void | Promise<void>;
	decodeImage(png: Uint8Array): unknown;
	/** Called once per scenario size and format; the surface is reused for every render. */
	createSurface(width: number, height: number, format: F): CanvasSurface;
}

export function defineCanvasAdapter<F extends OutputFormat>(spec: {
	name: string;
	packageName: string;
	formats: readonly F[];
	import(): Promise<CanvasBackend<F>>;
}): Adapter<"canvas", F> {
	return {
		name: spec.name,
		kind: "canvas",
		packageName: spec.packageName,
		formats: spec.formats,
		async import() {
			const backend = await spec.import();
			return {
				async registerFonts(fonts) {
					await backend.registerFonts(fonts);
					return {
						async loadImages(pngs) {
							const images = await buildImages((name) => backend.decodeImage(pngs[name]));
							const surfaces = new Map<string, CanvasSurface>();
							return {
								render(scenario, format, { quality }) {
									const { width, height } = scenario;
									const key = `${width}x${height}:${format}`;
									let surface = surfaces.get(key);
									if (!surface) {
										surface = backend.createSurface(width, height, format);
										surfaces.set(key, surface);
									}
									return surface((ctx) => {
										ctx.save();
										ctx.clearRect(0, 0, width, height);
										scenario.canvas(ctx, images);
										ctx.restore();
									}, quality);
								},
							};
						},
					};
				},
			};
		},
	};
}
