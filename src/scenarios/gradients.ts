import type { Scenario } from "../types.ts";
import { el, roundedRectPath } from "./helpers.ts";

/** Linear and radial gradient fills, full-bleed and inside rounded shapes. */
export const gradients: Scenario = {
  name: "gradients",
  description: "Linear gradient background, gradient cards, radial gradient orb",
  width: 800,
  height: 600,
  kinds: ["canvas", "declarative"],

  drawCanvas(ctx) {
    const bg = ctx.createLinearGradient(0, 0, 800, 600);
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(0.5, "#312e81");
    bg.addColorStop(1, "#6366f1");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 800, 600);

    const card1 = ctx.createLinearGradient(60, 80, 60, 280);
    card1.addColorStop(0, "#ec4899");
    card1.addColorStop(1, "#f59e0b");
    ctx.fillStyle = card1;
    roundedRectPath(ctx, 60, 80, 320, 200, 24);
    ctx.fill();

    const card2 = ctx.createLinearGradient(420, 80, 740, 80);
    card2.addColorStop(0, "#22d3ee");
    card2.addColorStop(1, "#10b981");
    ctx.fillStyle = card2;
    roundedRectPath(ctx, 420, 80, 320, 200, 24);
    ctx.fill();

    const orb = ctx.createRadialGradient(400, 440, 0, 400, 440, 130);
    orb.addColorStop(0, "#c7d2fe");
    orb.addColorStop(1, "#312e81");
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(400, 440, 130, 0, Math.PI * 2);
    ctx.fill();
  },

  element() {
    return el(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundImage: "linear-gradient(to bottom right, #0f172a 0%, #312e81 50%, #6366f1 100%)",
        },
      },
      el("div", {
        style: {
          position: "absolute",
          display: "flex",
          left: 60,
          top: 80,
          width: 320,
          height: 200,
          borderRadius: 24,
          backgroundImage: "linear-gradient(to bottom, #ec4899 0%, #f59e0b 100%)",
        },
      }),
      el("div", {
        style: {
          position: "absolute",
          display: "flex",
          left: 420,
          top: 80,
          width: 320,
          height: 200,
          borderRadius: 24,
          backgroundImage: "linear-gradient(to right, #22d3ee 0%, #10b981 100%)",
        },
      }),
      el("div", {
        style: {
          position: "absolute",
          display: "flex",
          left: 270,
          top: 310,
          width: 260,
          height: 260,
          borderRadius: 9999,
          backgroundImage: "radial-gradient(circle, #c7d2fe 0%, #312e81 100%)",
        },
      }),
    );
  },
};
