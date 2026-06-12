import type { Canvas2D, ElementChild, ElementLike } from "../types.ts";

/**
 * Builds a React-element-like plain object. Satori consumes these directly,
 * takumi converts them via fromJsx — no JSX transform required.
 */
export function el(
	type: string,
	props: Record<string, unknown>,
	...children: ElementChild[]
): ElementLike {
	const style = (props.style ?? {}) as Record<string, unknown>;
	return {
		type,
		props: {
			...props,
			style,
			...(children.length > 0 ? { children: children.length === 1 ? children[0] : children } : {}),
		},
	};
}

/**
 * Rounded rectangle path with quadratic-curve corners. roundRect/arcTo are
 * not universally implemented, and arc()-based corners render with artifacts
 * in pureimage; quadratic beziers behave identically in every library.
 */
export function roundedRectPath(
	ctx: Canvas2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number,
): void {
	const radius = Math.min(r, w / 2, h / 2);
	ctx.beginPath();
	ctx.moveTo(x + radius, y);
	ctx.lineTo(x + w - radius, y);
	ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
	ctx.lineTo(x + w, y + h - radius);
	ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
	ctx.lineTo(x + radius, y + h);
	ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
	ctx.lineTo(x, y + radius);
	ctx.quadraticCurveTo(x, y, x + radius, y);
	ctx.closePath();
}

/**
 * Baseline y for text whose CSS box (lineHeight: 1) starts at `top`. Derived
 * from Inter's vertical metrics so canvas output (alphabetic baseline — the
 * only baseline mode every library implements correctly) lines up with the
 * declarative engines' text boxes.
 */
export function baselineY(top: number, sizePx: number): number {
	return top + Math.round(sizePx * 0.88);
}

/**
 * Centered text via measureText, because textAlign is a no-op in some
 * libraries (e.g. the canvaskit-wasm canvas2d emulation). Measurement
 * accuracy is part of what is being compared, so this stays in the timed
 * drawing code.
 */
export function fillTextCentered(
	ctx: Canvas2D,
	content: string,
	cx: number,
	baseline: number,
): void {
	const width = ctx.measureText(content).width;
	ctx.fillText(content, cx - width / 2, baseline);
}

/** Deterministic LCG so generated geometry is identical everywhere. */
export function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

/** Canvas font string used by scenarios; adapters may translate it. */
export function fontString(sizePx: number, weight: 400 | 700): string {
	return `${weight === 700 ? "bold " : ""}${sizePx}px Inter`;
}
