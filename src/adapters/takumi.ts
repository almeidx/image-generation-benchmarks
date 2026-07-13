import type {
	Adapter,
	Assets,
	ElementAssets,
	OutputFormat,
	RenderOptions,
	Scenario,
} from "../types.ts";

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
			stylesheets?: string[];
			images?: { src: string; data: Uint8Array }[];
		},
	): Promise<Buffer>;
}
type FromJsx = (element: unknown) => Promise<{ node: unknown; stylesheets: string[] }>;

let renderer: Renderer | undefined;
let fromJsx: FromJsx | undefined;
let elementAssets: ElementAssets | undefined;
let images: { src: string; data: Uint8Array }[] | undefined;

export const takumiAdapter: Adapter = {
	name: "takumi",
	kind: "declarative",
	packageName: "@takumi-rs/core",
	formats: ["png", "jpeg", "webp"],

	async setup(assets: Assets) {
		const t0 = performance.now();
		const core = await import("@takumi-rs/core");
		fromJsx = (await import("@takumi-rs/helpers/jsx")).fromJsx as FromJsx;
		const t1 = performance.now();
		const RendererCtor = core.Renderer as unknown as new () => Renderer;
		renderer = new RendererCtor();
		await renderer.registerFont({ data: assets.fonts.sansRegular.data, weight: 400 });
		await renderer.registerFont({ data: assets.fonts.sansBold.data, weight: 700 });
		const t2 = performance.now();
		images = [
			{ src: "bench://photo", data: assets.images.photo.data },
			{ src: "bench://avatar", data: assets.images.avatar.data },
		];
		elementAssets = { photoSrc: "bench://photo", avatarSrc: "bench://avatar" };
		const t3 = performance.now();
		return { importMs: t1 - t0, fontsMs: t2 - t1, assetsMs: t3 - t2 };
	},

	async render(scenario: Scenario, format: OutputFormat, options: RenderOptions) {
		if (format !== "png" && format !== "jpeg" && format !== "webp") {
			throw new Error(`format not supported: ${format}`);
		}
		// The element -> node conversion is part of takumi's real pipeline, so it
		// is intentionally inside the timed region.
		const element = scenario.element!(elementAssets!);
		const { node, stylesheets } = await fromJsx!(element);
		const buf = await renderer!.render(node, {
			width: scenario.width,
			height: scenario.height,
			format,
			quality: options.quality,
			stylesheets,
			images,
		});
		return Uint8Array.from(buf);
	},
};
