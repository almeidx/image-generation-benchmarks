/**
 * Shared types for the benchmark harness.
 *
 * TypeScript here must remain erasable-syntax-only (no enums, no namespaces,
 * no parameter properties) so that Node's type stripping, Bun, and Deno can
 * all execute the sources directly without a build step.
 */

export type OutputFormat = "png" | "jpeg" | "webp" | "avif" | "svg";

export type AdapterKind = "canvas" | "declarative";

/** Raw, adapter-agnostic assets loaded once from disk. */
export interface Assets {
  fonts: {
    sansRegular: { path: string; data: Uint8Array };
    sansBold: { path: string; data: Uint8Array };
  };
  images: {
    photo: { path: string; data: Uint8Array };
    avatar: { path: string; data: Uint8Array };
  };
}

/**
 * Assets as seen by a scenario's `drawCanvas` function. The image objects are
 * adapter-specific (each canvas library decodes images into its own Image
 * type); scenarios only rely on them being drawable via `ctx.drawImage` and
 * exposing width/height.
 */
export interface CanvasAssets {
  photo: DrawableImage;
  avatar: DrawableImage;
}

export interface DrawableImage {
  width: number;
  height: number;
}

/**
 * Assets as seen by a scenario's `element` function. The src strings are
 * adapter-specific: satori receives data URIs, takumi receives keys backed by
 * its persistent image store.
 */
export interface ElementAssets {
  photoSrc: string;
  avatarSrc: string;
}

/**
 * The minimal CanvasRenderingContext2D surface used by scenarios. Structural,
 * so every library's context satisfies it. Scenarios must not use methods
 * outside this set without checking library support first.
 */
export interface Canvas2D {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  setLineDash?(segments: number[]): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  arcTo?(x1: number, y1: number, x2: number, y2: number, r: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: unknown, ...args: number[]): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradientLike;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradientLike;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  setTransform?(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

export interface CanvasGradientLike {
  addColorStop(offset: number, color: string): void;
}

/**
 * A React-element-like plain object tree. Satori consumes this directly;
 * takumi converts it with `fromJsx` from @takumi-rs/helpers. No JSX transform
 * is involved so the harness stays runnable without a build step.
 */
export interface ElementLike {
  type: string;
  props: {
    style?: Record<string, unknown>;
    children?: ElementChild | ElementChild[];
    [key: string]: unknown;
  };
}

export type ElementChild = ElementLike | string | number | null;

export interface Scenario {
  name: string;
  description: string;
  width: number;
  height: number;
  /** Which adapter kinds can express this scenario. */
  kinds: AdapterKind[];
  drawCanvas?: (ctx: Canvas2D, assets: CanvasAssets) => void;
  element?: (assets: ElementAssets) => ElementLike;
}

/** Per-adapter setup phases, measured once per process. Reported separately
 * from the steady-state benchmarks (relevant for serverless cold starts). */
export interface SetupTimings {
  /** Dynamic import of the library module(s). */
  importMs: number;
  /** Font registration. */
  fontsMs: number;
  /** Decoding/registering source images. */
  assetsMs: number;
  /** First end-to-end render+encode (og-card, png), measured by the harness. */
  firstRenderMs: number;
}

export interface RenderOptions {
  /** JPEG/WebP quality, pinned identically across libraries. */
  quality: number;
}

export interface Adapter {
  /** Stable identifier, used in result files and baseline paths. */
  name: string;
  kind: AdapterKind;
  /** npm package whose version is reported. */
  packageName: string;
  /** Formats this adapter can encode. May be narrowed during setup(). */
  formats: OutputFormat[];
  /**
   * Loads the library and prepares fonts/images. Untimed by benchmarks;
   * phases are measured and reported as cold-start data. Throwing marks the
   * adapter unsupported on the current runtime.
   */
  setup(assets: Assets): Promise<Omit<SetupTimings, "firstRenderMs">>;
  /** The benchmarked unit: scenario input -> encoded image bytes. */
  render(scenario: Scenario, format: OutputFormat, options: RenderOptions): Promise<Uint8Array>;
}

export interface BenchStats {
  avgNs: number;
  minNs: number;
  maxNs: number;
  p50Ns: number;
  p75Ns: number;
  p99Ns: number;
  samples: number;
}

export interface BenchEntry {
  adapter: string;
  scenario: string;
  format: OutputFormat;
  stats: BenchStats;
}

export interface UnsupportedEntry {
  adapter: string;
  scenario: string;
  format: OutputFormat;
  reason: string;
}

export interface LibraryInfo {
  version: string;
  status: "ok" | "unsupported";
  error?: string;
  setup?: SetupTimings;
}

export interface RuntimeInfo {
  name: "node" | "bun" | "deno";
  version: string;
}

export interface BenchResultFile {
  schemaVersion: 1;
  runtime: RuntimeInfo;
  platform: { os: string; arch: string; cpu: string };
  timestamp: string;
  quick: boolean;
  libraries: Record<string, LibraryInfo>;
  benchmarks: BenchEntry[];
  unsupported: UnsupportedEntry[];
}

export interface BaselineComparison {
  adapter: string;
  scenario: string;
  diffRatio: number;
  pass: boolean;
  diffImage?: string;
}

export interface CrossLibComparison {
  scenario: string;
  adapterA: string;
  adapterB: string;
  diffRatio: number;
  diffImage?: string;
}

export interface ValidationResultFile {
  schemaVersion: 1;
  runtime: RuntimeInfo;
  timestamp: string;
  threshold: number;
  baselines: BaselineComparison[];
  crossLibrary: CrossLibComparison[];
  missingBaselines: { adapter: string; scenario: string }[];
}
