import type { Scenario } from "../types.ts";
import { shapes } from "./shapes.ts";
import { gradients } from "./gradients.ts";
import { text } from "./text.ts";
import { imageCompositing } from "./image-compositing.ts";
import { ogCard } from "./og-card.ts";
import { bezierPaths } from "./bezier-paths.ts";

export const scenarios: Scenario[] = [
	shapes,
	gradients,
	text,
	imageCompositing,
	ogCard,
	bezierPaths,
];
