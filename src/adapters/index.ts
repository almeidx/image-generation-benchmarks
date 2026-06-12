import type { Adapter } from "../types.ts";
import { napiRsCanvasAdapter } from "./napi-rs-canvas.ts";
import { skiaCanvasAdapter } from "./skia-canvas.ts";
import { nodeCanvasAdapter } from "./node-canvas.ts";
import { canvaskitWasmAdapter } from "./canvaskit-wasm.ts";
import { pureimageAdapter } from "./pureimage.ts";
import { takumiAdapter } from "./takumi.ts";
import { satoriAdapter } from "./satori.ts";

export const adapters: Adapter[] = [
  napiRsCanvasAdapter,
  skiaCanvasAdapter,
  nodeCanvasAdapter,
  canvaskitWasmAdapter,
  pureimageAdapter,
  takumiAdapter,
  satoriAdapter,
];
