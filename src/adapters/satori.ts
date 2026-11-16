import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { Resvg } from "@resvg/resvg-js";
import { buildImages } from "../assets.ts";
import type { Adapter } from "./types.ts";

type ResvgCtor = typeof Resvg;

async function importResvg(): Promise<ResvgCtor> {
	// Native resvg first; the wasm build covers runtimes without native addon support.
	try {
		return (await import("@resvg/resvg-js")).Resvg;
	} catch {
		const wasm = await import("@resvg/resvg-wasm");
		const require = createRequire(import.meta.url);
		await wasm.initWasm(await readFile(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
		return wasm.Resvg as unknown as ResvgCtor;
	}
}

export const satoriAdapter: Adapter<"declarative", "png" | "svg"> = {
	name: "satori",
	kind: "declarative",
	packageName: "satori",
	formats: ["png", "svg"],

	async import() {
		const satori = (await import("satori")).default;
		const Resvg = await importResvg();
		return {
			registerFonts(registered) {
				const fonts = registered.map((font) => ({
					name: font.family,
					data: Buffer.from(font.data),
					weight: font.weight,
					style: "normal" as const,
				}));
				return {
					async loadImages(pngs) {
						const srcs = await buildImages(
							(name) => `data:image/png;base64,${Buffer.from(pngs[name]).toString("base64")}`,
						);
						return {
							async render(scenario, format) {
								const svg = await satori(scenario.declarative(srcs) as never, {
									width: scenario.width,
									height: scenario.height,
									fonts,
								});
								if (format === "svg") return new TextEncoder().encode(svg);
								// Satori outputs text as paths, so rasterization needs no font config.
								return new Resvg(svg, { fitTo: { mode: "width", value: scenario.width } }).render().asPng();
							},
						};
					},
				};
			},
		};
	},
};
