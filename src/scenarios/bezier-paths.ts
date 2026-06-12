import type { Scenario } from "../types.ts";
import { seededRandom } from "./helpers.ts";

const PALETTE: [number, number, number][] = [
  [99, 102, 241],
  [236, 72, 153],
  [34, 211, 238],
  [16, 185, 129],
  [245, 158, 11],
  [248, 250, 252],
];

/**
 * Path-heavy stress test: hundreds of stroked cubic beziers and arcs.
 * Canvas-only — declarative engines have no arbitrary path API.
 * Geometry is generated from a fixed seed so every library draws the
 * exact same curves.
 */
export const bezierPaths: Scenario = {
  name: "bezier-paths",
  description: "240 cubic beziers + 80 arcs + dashed quadratics, seeded geometry",
  width: 800,
  height: 600,
  kinds: ["canvas"],

  drawCanvas(ctx) {
    const rand = seededRandom(0xbe21e5);
    const color = (alpha: number) => {
      const [r, g, b] = PALETTE[Math.floor(rand() * PALETTE.length)] as [number, number, number];
      return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    };
    const x = () => rand() * 800;
    const y = () => rand() * 600;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 800, 600);

    for (let i = 0; i < 240; i++) {
      ctx.strokeStyle = color(0.2 + rand() * 0.5);
      ctx.lineWidth = 1 + rand() * 3;
      ctx.beginPath();
      ctx.moveTo(x(), y());
      ctx.bezierCurveTo(x(), y(), x(), y(), x(), y());
      ctx.stroke();
    }

    for (let i = 0; i < 80; i++) {
      ctx.strokeStyle = color(0.25 + rand() * 0.5);
      ctx.lineWidth = 1 + rand() * 2;
      ctx.beginPath();
      ctx.arc(x(), y(), 10 + rand() * 60, rand() * Math.PI * 2, rand() * Math.PI * 2);
      ctx.stroke();
    }

    // setLineDash is not implemented everywhere (e.g. pureimage); the dashed
    // pass is skipped there. Per-library baselines keep validation sound.
    if (typeof ctx.setLineDash === "function") {
      ctx.setLineDash([12, 8]);
      for (let i = 0; i < 40; i++) {
        ctx.strokeStyle = color(0.3 + rand() * 0.4);
        ctx.lineWidth = 1 + rand() * 2;
        ctx.beginPath();
        ctx.moveTo(x(), y());
        ctx.quadraticCurveTo(x(), y(), x(), y());
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  },
};
