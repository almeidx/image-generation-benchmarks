import type { Scenario } from "../types.ts";
import { bezierPaths } from "./bezier-paths.ts";
import { gradients } from "./gradients.ts";
import { imageCompositing } from "./image-compositing.ts";
import { ogCard } from "./og-card.ts";
import { shapes } from "./shapes.ts";
import { text } from "./text.ts";

export const scenarios: Scenario[] = [shapes, gradients, text, imageCompositing, ogCard, bezierPaths];
