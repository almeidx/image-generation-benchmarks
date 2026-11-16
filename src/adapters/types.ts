import type { FontAsset, ImageRecord } from "../assets.ts";
import type { OutputFormat } from "../formats.ts";
import type { AdapterKind, ScenarioFor } from "../scenarios/types.ts";

export interface RenderOptions {
	/** JPEG/WebP/AVIF quality on a 0..100 scale. */
	quality: number;
}

export interface Renderer<K extends AdapterKind, F extends OutputFormat> {
	/** The benchmarked unit: scenario input -> encoded image bytes. */
	render(scenario: ScenarioFor<K>, format: F, options: RenderOptions): Promise<Uint8Array>;
}

type Awaitable<T> = T | Promise<T>;

/**
 * A loaded library. Each stage returns the next, and the harness times each
 * as a separate cold-start phase: fonts, then images, then the first render.
 */
interface Library<K extends AdapterKind, F extends OutputFormat> {
	registerFonts(fonts: readonly FontAsset[]): Awaitable<{
		/** `images` are PNG-encoded. */
		loadImages(images: ImageRecord<Uint8Array>): Awaitable<Renderer<K, F>>;
	}>;
}

export interface Adapter<K extends AdapterKind = AdapterKind, F extends OutputFormat = OutputFormat> {
	/** Stable identifier, used in result files and baseline paths. */
	name: string;
	kind: K;
	/** npm package whose version is reported. */
	packageName: string;
	/** Formats the library claims to encode; the harness verifies each by sniffing the output. */
	formats: readonly F[];
	/**
	 * Loads the library via dynamic `import()`, so import cost is measured and a
	 * library that cannot load on this runtime (e.g. a native addon on Deno) is
	 * reported unsupported instead of failing the run.
	 */
	import(): Promise<Library<K, F>>;
}
