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
	putPersistentImage(source: { src: string; data: Uint8Array }): Promise<void>;
	render(
		node: unknown,
		options: {
			width: number;
			height: number;
			format: string;
			quality?: number;
			stylesheets?: string[];
		},
	): Promise<Buffer>;
}
type FromJsx = (element: unknown) => Promise<{ node: unknown; stylesheets: string[] }>;

let renderer: Renderer | undefined;
let fromJsx: FromJsx | undefined;
let elementAssets: ElementAssets | undefined;

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
		const RendererCtor = core.Renderer as unknown as new (options: {
			fonts: { data: Uint8Array; weight: number }[];
		}) => Renderer;
		renderer = new RendererCtor({
			fonts: [
				{ data: assets.fonts.sansRegular.data, weight: 400 },
				{ data: assets.fonts.sansBold.data, weight: 700 },
			],
		});
		const t2 = performance.now();
		// Persistent images are matched by src string at render time.
		await renderer.putPersistentImage({ src: "bench://photo", data: assets.images.photo.data });
		await renderer.putPersistentImage({ src: "bench://avatar", data: assets.images.avatar.data });
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
		});
		return Uint8Array.from(buf);
	},
};
