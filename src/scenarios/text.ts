import type { ElementChild, Scenario } from "../types.ts";
import { baselineY, el, fillTextCentered, fontString } from "./helpers.ts";

const BODY_LINES = [
	"Each library renders this exact document from the same inputs:",
	"identical fonts, identical colors, identical layout coordinates.",
	"Lines are positioned explicitly so no engine-specific text wrapping",
	"or hyphenation can skew the comparison between candidates.",
];

/** Typography: weights, sizes, alignment, multi-line body text. */
export const text: Scenario = {
	name: "text",
	description: "Headings, body copy, mixed weights and sizes, centered and left-aligned",
	width: 800,
	height: 600,
	kinds: ["canvas", "declarative"],

	drawCanvas(ctx) {
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, 800, 600);

		ctx.fillStyle = "#0f172a";
		ctx.font = fontString(56, 700);
		fillTextCentered(ctx, "The quick brown fox", 400, baselineY(70, 56));

		ctx.fillStyle = "#475569";
		ctx.font = fontString(28, 400);
		fillTextCentered(ctx, "Server-side image generation in JavaScript", 400, baselineY(150, 28));

		ctx.fillStyle = "#334155";
		ctx.font = fontString(20, 400);
		for (let i = 0; i < BODY_LINES.length; i++) {
			ctx.fillText(BODY_LINES[i] as string, 80, baselineY(230 + i * 34, 20));
		}

		ctx.fillStyle = "#6366f1";
		ctx.font = fontString(16, 700);
		ctx.fillText("IMAGE-GENERATION-BENCHMARKS", 80, baselineY(400, 16));

		ctx.fillStyle = "#cbd5e1";
		ctx.font = fontString(72, 700);
		fillTextCentered(ctx, "PNG · JPEG · WEBP", 400, baselineY(470, 72));
	},

	element() {
		const centered = (
			top: number,
			fontSize: number,
			fontWeight: number,
			color: string,
			content: string,
		) =>
			el(
				"div",
				{
					style: {
						position: "absolute",
						display: "flex",
						left: 0,
						top,
						width: 800,
						justifyContent: "center",
						fontSize,
						fontWeight,
						lineHeight: 1,
						color,
					},
				},
				content,
			);
		const left = (
			top: number,
			fontSize: number,
			fontWeight: number,
			color: string,
			content: string,
		) =>
			el(
				"div",
				{
					style: {
						position: "absolute",
						display: "flex",
						left: 80,
						top,
						fontSize,
						fontWeight,
						lineHeight: 1,
						color,
					},
				},
				content,
			);
		return el(
			"div",
			{
				style: {
					width: "100%",
					height: "100%",
					display: "flex",
					position: "relative",
					backgroundColor: "#ffffff",
					fontFamily: "Inter",
				},
			},
			centered(70, 56, 700, "#0f172a", "The quick brown fox"),
			centered(150, 28, 400, "#475569", "Server-side image generation in JavaScript"),
			...BODY_LINES.map((line, i): ElementChild => left(230 + i * 34, 20, 400, "#334155", line)),
			left(400, 16, 700, "#6366f1", "IMAGE-GENERATION-BENCHMARKS"),
			centered(470, 72, 700, "#cbd5e1", "PNG · JPEG · WEBP"),
		);
	},
};
