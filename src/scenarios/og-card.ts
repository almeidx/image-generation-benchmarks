import type { Scenario } from "../types.ts";
import { baselineY, el, fillTextCentered, fontString, roundedRectPath } from "./helpers.ts";

/** The headline real-world case: a 1200x630 social/OG card. */
export const ogCard: Scenario = {
  name: "og-card",
  description: "1200x630 social card: gradient background, badge, title, subtitle, avatar footer",
  width: 1200,
  height: 630,
  kinds: ["canvas", "declarative"],

  drawCanvas(ctx, assets) {
    const bg = ctx.createLinearGradient(0, 0, 1200, 630);
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(0.55, "#1e1b4b");
    bg.addColorStop(1, "#312e81");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 630);

    // Decorative orb: translucent solid rather than a radial gradient so the
    // flagship scenario stays renderable by every library (radial gradient
    // support is exercised — and divergence surfaced — by the gradients
    // scenario instead).
    ctx.fillStyle = "rgba(99, 102, 241, 0.3)";
    ctx.beginPath();
    ctx.arc(1040, 120, 220, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6366f1";
    roundedRectPath(ctx, 80, 80, 220, 52, 26);
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = fontString(24, 700);
    fillTextCentered(ctx, "BENCHMARK", 190, baselineY(94, 24));

    ctx.fillStyle = "#f8fafc";
    ctx.font = fontString(64, 700);
    ctx.fillText("Which image library", 80, baselineY(200, 64));
    ctx.fillText("should you choose?", 80, baselineY(276, 64));

    ctx.fillStyle = "#94a3b8";
    ctx.font = fontString(28, 400);
    ctx.fillText("Seven libraries. Five runtimes. One fair benchmark.", 80, baselineY(380, 28));

    ctx.save();
    ctx.beginPath();
    ctx.arc(120, 510, 40, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(assets.avatar, 80, 470, 80, 80);
    ctx.restore();

    ctx.fillStyle = "#e2e8f0";
    ctx.font = fontString(28, 700);
    ctx.fillText("image-generation-benchmarks", 180, baselineY(485, 28));
    ctx.fillStyle = "#94a3b8";
    ctx.font = fontString(22, 400);
    ctx.fillText("github.com/almeidx", 180, baselineY(522, 22));
  },

  element(assets) {
    return el(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          fontFamily: "Inter",
          backgroundImage: "linear-gradient(to bottom right, #0f172a 0%, #1e1b4b 55%, #312e81 100%)",
        },
      },
      el("div", {
        style: {
          position: "absolute",
          display: "flex",
          left: 820,
          top: -100,
          width: 440,
          height: 440,
          borderRadius: 9999,
          backgroundColor: "rgba(99, 102, 241, 0.3)",
        },
      }),
      el(
        "div",
        {
          style: {
            position: "absolute",
            display: "flex",
            left: 80,
            top: 80,
            width: 220,
            height: 52,
            borderRadius: 26,
            backgroundColor: "#6366f1",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            fontWeight: 700,
            color: "#f8fafc",
          },
        },
        "BENCHMARK",
      ),
      el(
        "div",
        {
          style: {
            position: "absolute",
            display: "flex",
            left: 80,
            top: 200,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1,
            color: "#f8fafc",
          },
        },
        "Which image library",
      ),
      el(
        "div",
        {
          style: {
            position: "absolute",
            display: "flex",
            left: 80,
            top: 276,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1,
            color: "#f8fafc",
          },
        },
        "should you choose?",
      ),
      el(
        "div",
        {
          style: {
            position: "absolute",
            display: "flex",
            left: 80,
            top: 380,
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1,
            color: "#94a3b8",
          },
        },
        "Seven libraries. Five runtimes. One fair benchmark.",
      ),
      el("img", {
        src: assets.avatarSrc,
        width: 80,
        height: 80,
        style: { position: "absolute", left: 80, top: 470, width: 80, height: 80, borderRadius: 9999 },
      }),
      el(
        "div",
        {
          style: {
            position: "absolute",
            display: "flex",
            left: 180,
            top: 485,
            fontSize: 28,
            fontWeight: 700,
            lineHeight: 1,
            color: "#e2e8f0",
          },
        },
        "image-generation-benchmarks",
      ),
      el(
        "div",
        {
          style: {
            position: "absolute",
            display: "flex",
            left: 180,
            top: 522,
            fontSize: 22,
            fontWeight: 400,
            lineHeight: 1,
            color: "#94a3b8",
          },
        },
        "github.com/almeidx",
      ),
    );
  },
};
