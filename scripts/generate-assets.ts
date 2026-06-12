/**
 * Generates the committed sample images deterministically (seeded geometry)
 * so the asset provenance is reproducible. Run: npm run assets:generate
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { seededRandom } from "../src/scenarios/helpers.ts";
import { assetsDir } from "../src/utils/assets.ts";

const imageDir = path.join(assetsDir, "images");
await mkdir(imageDir, { recursive: true });

// photo.png — 1600x1200 "landscape": sky gradient, sun, hills, scattered stars.
{
  const canvas = createCanvas(1600, 1200);
  const ctx = canvas.getContext("2d");
  const rand = seededRandom(0x9e3779b9);

  const sky = ctx.createLinearGradient(0, 0, 0, 1200);
  sky.addColorStop(0, "#1e293b");
  sky.addColorStop(0.55, "#7c3aed");
  sky.addColorStop(0.8, "#fb923c");
  sky.addColorStop(1, "#fde68a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1600, 1200);

  ctx.fillStyle = "rgba(248, 250, 252, 0.9)";
  for (let i = 0; i < 220; i++) {
    const x = rand() * 1600;
    const y = rand() * 620;
    const r = 0.8 + rand() * 2.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const sun = ctx.createRadialGradient(1180, 760, 0, 1180, 760, 180);
  sun.addColorStop(0, "#fff7ed");
  sun.addColorStop(0.6, "#fdba74");
  sun.addColorStop(1, "rgba(253, 186, 116, 0)");
  ctx.fillStyle = sun;
  ctx.beginPath();
  ctx.arc(1180, 760, 180, 0, Math.PI * 2);
  ctx.fill();

  const hill = (baseY: number, amp: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 1200);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= 1600; x += 100) {
      ctx.quadraticCurveTo(x + 50, baseY - amp * Math.sin(x / 240), x + 100, baseY + amp * 0.3 * Math.cos(x / 180));
    }
    ctx.lineTo(1600, 1200);
    ctx.closePath();
    ctx.fill();
  };
  hill(880, 90, "#3b0764");
  hill(980, 70, "#1e1b4b");
  hill(1080, 50, "#0f172a");

  await writeFile(path.join(imageDir, "photo.png"), await canvas.encode("png"));
  console.log("wrote assets/images/photo.png");
}

// avatar.png — 256x256: gradient disc with initials.
{
  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 256, 256);
  bg.addColorStop(0, "#6366f1");
  bg.addColorStop(1, "#ec4899");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.beginPath();
  ctx.arc(80, 70, 90, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 110px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("IB", 128, 138);

  await writeFile(path.join(imageDir, "avatar.png"), await canvas.encode("png"));
  console.log("wrote assets/images/avatar.png");
}
