import type { Scenario } from "../types.ts";
import { el, roundedRectPath } from "./helpers.ts";

/**
 * Basic vector primitives: solid fills, rounded corners, circles, translucent
 * overlaps, and a thick border. Translucency uses rgba colors rather than
 * globalAlpha for the widest library support.
 */
export const shapes: Scenario = {
	name: "shapes",
	description: "Rectangles, rounded rectangles, circles, translucent overlaps, borders",
	width: 800,
	height: 600,
	kinds: ["canvas", "declarative"],

	drawCanvas(ctx) {
		ctx.fillStyle = "#f8fafc";
		ctx.fillRect(0, 0, 800, 600);

		ctx.fillStyle = "#6366f1";
		ctx.fillRect(40, 40, 200, 140);
		ctx.fillStyle = "#ec4899";
		ctx.fillRect(280, 40, 200, 140);
		ctx.fillStyle = "#10b981";
		ctx.fillRect(520, 40, 240, 140);

		ctx.fillStyle = "#0f172a";
		roundedRectPath(ctx, 40, 220, 340, 160, 24);
		ctx.fill();
		ctx.fillStyle = "#f59e0b";
		roundedRectPath(ctx, 420, 220, 340, 160, 24);
		ctx.fill();

		ctx.fillStyle = "#22d3ee";
		ctx.beginPath();
		ctx.arc(140, 490, 70, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "rgba(236, 72, 153, 0.6)";
		ctx.beginPath();
		ctx.arc(340, 490, 70, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = "rgba(99, 102, 241, 0.6)";
		ctx.beginPath();
		ctx.arc(460, 490, 70, 0, Math.PI * 2);
		ctx.fill();

		// Stroke inset by half the line width so it matches a CSS inner border.
		ctx.strokeStyle = "#0f172a";
		ctx.lineWidth = 8;
		ctx.strokeRect(564, 424, 192, 132);
	},

	element() {
		const abs = (
			left: number,
			top: number,
			width: number,
			height: number,
			style: Record<string, unknown>,
		) =>
			el("div", {
				style: { position: "absolute", display: "flex", left, top, width, height, ...style },
			});
		return el(
			"div",
			{
				style: {
					width: "100%",
					height: "100%",
					display: "flex",
					position: "relative",
					backgroundColor: "#f8fafc",
				},
			},
			abs(40, 40, 200, 140, { backgroundColor: "#6366f1" }),
			abs(280, 40, 200, 140, { backgroundColor: "#ec4899" }),
			abs(520, 40, 240, 140, { backgroundColor: "#10b981" }),
			abs(40, 220, 340, 160, { backgroundColor: "#0f172a", borderRadius: 24 }),
			abs(420, 220, 340, 160, { backgroundColor: "#f59e0b", borderRadius: 24 }),
			abs(70, 420, 140, 140, { backgroundColor: "#22d3ee", borderRadius: 9999 }),
			abs(270, 420, 140, 140, { backgroundColor: "rgba(236, 72, 153, 0.6)", borderRadius: 9999 }),
			abs(390, 420, 140, 140, { backgroundColor: "rgba(99, 102, 241, 0.6)", borderRadius: 9999 }),
			abs(560, 420, 200, 140, { border: "8px solid #0f172a" }),
		);
	},
};
