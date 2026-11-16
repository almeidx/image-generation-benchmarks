import { buildImages, IMAGE_NAMES } from "../assets.ts";
import type { ElementChild } from "../scenarios/types.ts";
import type { Adapter } from "./types.ts";

// Structural type: @takumi-rs/core's published d.ts uses extensionless
// relative imports that don't resolve under moduleResolution nodenext.
interface Renderer {
	registerFont(font: { data: Uint8Array; weight: number }): Promise<unknown>;
	render(
		node: unknown,
		options: {
			width: number;
			height: number;
			format: string;
			quality?: number;
			css?: string[];
			images?: ImageSource[];
		},
	): Promise<Buffer>;
}
type FromJsx = (element: unknown) => Promise<{ node: unknown; css: string[] }>;
type ImageSource = { src: string; data: Uint8Array };

function collectSrcs(child: ElementChild | ElementChild[] | undefined, into: Set<unknown>): Set<unknown> {
	if (Array.isArray(child)) {
		for (const c of child) collectSrcs(c, into);
	} else if (child !== null && typeof child === "object") {
		into.add(child.props.src);
		collectSrcs(child.props.children, into);
	}
	return into;
}

export const takumiAdapter: Adapter<"declarative", "png" | "jpeg" | "webp"> = {
	name: "takumi",
	kind: "declarative",
	packageName: "@takumi-rs/core",
	formats: ["png", "jpeg", "webp"],

	async import() {
		const core = await import("@takumi-rs/core");
		const fromJsx = (await import("@takumi-rs/helpers/jsx")).fromJsx as FromJsx;
		const renderer = new (core.Renderer as unknown as new () => Renderer)();
		return {
			async registerFonts(fonts) {
				for (const font of fonts) await renderer.registerFont({ data: font.data, weight: font.weight });
				return {
					async loadImages(pngs) {
						const srcs = await buildImages((name) => `bench://${name}`);
						const sources: ImageSource[] = IMAGE_NAMES.map((name) => ({ src: srcs[name], data: pngs[name] }));
						// Takumi decodes every image it is given on each render, so each scenario
						// gets only the ones its element references, resolved once.
						const scenarioImages = new Map<string, ImageSource[] | undefined>();
						return {
							async render(scenario, format, { quality }) {
								// The element -> node conversion is part of takumi's real pipeline, so it
								// is intentionally inside the timed region.
								const element = scenario.declarative(srcs);
								const { node, css } = await fromJsx(element);
								if (!scenarioImages.has(scenario.name)) {
									const used = collectSrcs(element, new Set());
									const images = sources.filter((source) => used.has(source.src));
									scenarioImages.set(scenario.name, images.length > 0 ? images : undefined);
								}
								const buf = await renderer.render(node, {
									width: scenario.width,
									height: scenario.height,
									format,
									quality,
									css,
									images: scenarioImages.get(scenario.name),
								});
								return Uint8Array.from(buf);
							},
						};
					},
				};
			},
		};
	},
};
