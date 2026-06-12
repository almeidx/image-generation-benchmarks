import type { Scenario } from "../types.ts";
import { el, roundedRectPath } from "./helpers.ts";

/** Raster compositing: full-bleed photo, translucent overlay, circular avatar clip. */
export const imageCompositing: Scenario = {
  name: "image-compositing",
  description: "Photo scaled to cover, translucent overlay, circle-clipped avatar with ring",
  width: 800,
  height: 600,
  kinds: ["canvas", "declarative"],

  drawCanvas(ctx, assets) {
    // photo.png is 1600x1200 (same 4:3 aspect), so cover == plain scale.
    ctx.drawImage(assets.photo, 0, 0, 800, 600);

    ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
    ctx.fillRect(0, 420, 800, 180);

    ctx.save();
    ctx.beginPath();
    ctx.arc(120, 510, 64, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(assets.avatar, 56, 446, 128, 128);
    ctx.restore();

    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(120, 510, 67, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(248, 250, 252, 0.9)";
    roundedRectPath(ctx, 640, 40, 120, 48, 24);
    ctx.fill();
  },

  element(assets) {
    return el(
      "div",
      {
        style: { width: "100%", height: "100%", display: "flex", position: "relative" },
      },
      el("img", {
        src: assets.photoSrc,
        width: 800,
        height: 600,
        style: { position: "absolute", left: 0, top: 0, width: 800, height: 600, objectFit: "cover" },
      }),
      el("div", {
        style: {
          position: "absolute",
          display: "flex",
          left: 0,
          top: 420,
          width: 800,
          height: 180,
          backgroundColor: "rgba(15, 23, 42, 0.72)",
        },
      }),
      el("img", {
        src: assets.avatarSrc,
        width: 128,
        height: 128,
        style: { position: "absolute", left: 56, top: 446, width: 128, height: 128, borderRadius: 9999 },
      }),
      el("div", {
        style: {
          position: "absolute",
          display: "flex",
          left: 50,
          top: 440,
          width: 140,
          height: 140,
          borderRadius: 9999,
          border: "6px solid #f8fafc",
        },
      }),
      el("div", {
        style: {
          position: "absolute",
          display: "flex",
          left: 640,
          top: 40,
          width: 120,
          height: 48,
          borderRadius: 24,
          backgroundColor: "rgba(248, 250, 252, 0.9)",
        },
      }),
    );
  },
};
