import type { ImageRecord } from "../assets.ts";

/**
 * The CanvasRenderingContext2D surface scenarios may use. Structural, so every
 * library's context satisfies it; check library support before extending it.
 */
export interface Canvas2D {
	fillStyle: unknown;
	strokeStyle: unknown;
	lineWidth: number;
	font: string;
	setLineDash?(segments: number[]): void;
	save(): void;
	restore(): void;
	beginPath(): void;
	closePath(): void;
	arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
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
}

interface CanvasGradientLike {
	addColorStop(offset: number, color: string): void;
}

/**
 * A React-element-like plain object tree. Satori consumes this directly;
 * takumi converts it with `fromJsx`. No JSX transform is involved so the
 * harness stays runnable without a build step.
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

/** One implementation per rendering paradigm. */
interface ScenarioImplementations {
	/** `images` are whatever the canvas library decoded; only ever passed back to `drawImage`. */
	canvas: (ctx: Canvas2D, images: ImageRecord<unknown>) => void;
	/** `images` are `<img src>` values; what a src resolves to is up to each declarative library. */
	declarative: (images: ImageRecord<string>) => ElementLike;
}

export type AdapterKind = keyof ScenarioImplementations;

/** A scenario runs on an adapter kind iff it implements that kind. */
export interface Scenario extends Partial<ScenarioImplementations> {
	name: string;
	description: string;
	width: number;
	height: number;
}

export type ScenarioFor<K extends AdapterKind> = Scenario & Pick<ScenarioImplementations, K>;
