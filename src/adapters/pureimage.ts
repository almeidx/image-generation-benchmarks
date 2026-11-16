import { PassThrough, Readable } from "node:stream";
import type { Canvas2D } from "../scenarios/types.ts";
import { defineCanvasAdapter } from "./canvas.ts";

/**
 * pureimage matches fonts by exact registered name and does not parse weight
 * tokens from the font shorthand, so each weight is registered as its own
 * family and scenario font strings are rewritten to match.
 */
const registeredName = (family: string, bold: boolean) => (bold ? `${family} Bold` : family);

const FONT_RE = /^(bold )?(\d+(?:\.\d+)?)px (.+)$/;

function rewriteFonts(ctx: Canvas2D): Canvas2D {
	return new Proxy(ctx as unknown as Record<string | symbol, unknown>, {
		set(target, prop, value) {
			const m = prop === "font" && typeof value === "string" ? FONT_RE.exec(value) : null;
			target[prop] = m ? `${m[2]}px '${registeredName(m[3]!, Boolean(m[1]))}'` : value;
			return true;
		},
		get(target, prop) {
			const value = target[prop];
			return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
		},
	}) as unknown as Canvas2D;
}

/**
 * pureimage's rasterizer reports degenerate curves through console.warn
 * ("can't project the same paths") and console.log ("same points!"), hundreds
 * of lines per render, which floods CI logs.
 */
function withoutRasterizerNoise(run: () => void): void {
	const { log, warn } = console;
	console.log = console.warn = () => {};
	try {
		run();
	} finally {
		console.log = log;
		console.warn = warn;
	}
}

async function collectStream(write: (stream: PassThrough) => Promise<unknown>): Promise<Uint8Array> {
	const stream = new PassThrough();
	const chunks: Buffer[] = [];
	stream.on("data", (chunk: Buffer) => chunks.push(chunk));
	await write(stream);
	return Uint8Array.from(Buffer.concat(chunks));
}

export const pureimageAdapter = defineCanvasAdapter({
	name: "pureimage",
	packageName: "pureimage",
	formats: ["png", "jpeg"],

	async import() {
		const mod = await import("pureimage");
		return {
			async registerFonts(fonts) {
				for (const font of fonts) {
					await mod.registerFont(font.path, registeredName(font.family, font.weight === 700)).load();
				}
			},
			decodeImage: (png) => mod.decodePNGFromStream(Readable.from(Buffer.from(png))),
			createSurface(width, height, format) {
				const bitmap = mod.make(width, height);
				const ctx = rewriteFonts(bitmap.getContext("2d") as unknown as Canvas2D);
				return (paint, quality) => {
					withoutRasterizerNoise(() => paint(ctx));
					return collectStream((stream) =>
						format === "png" ? mod.encodePNGToStream(bitmap, stream) : mod.encodeJPEGToStream(bitmap, stream, quality),
					);
				};
			},
		};
	},
});
