import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Assets } from "../types.ts";

export const repoRoot: string = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);

export const assetsDir: string = path.join(repoRoot, "assets");
export const resultsDir: string = path.join(repoRoot, "results");
export const baselinesDir: string = path.join(repoRoot, "baselines");

export async function loadAssets(): Promise<Assets> {
	const fontDir = path.join(assetsDir, "fonts");
	const imageDir = path.join(assetsDir, "images");
	const [sansRegular, sansBold, photo, avatar] = await Promise.all([
		readFile(path.join(fontDir, "sans-regular.ttf")),
		readFile(path.join(fontDir, "sans-bold.ttf")),
		readFile(path.join(imageDir, "photo.png")),
		readFile(path.join(imageDir, "avatar.png")),
	]);
	return {
		fonts: {
			sansRegular: { path: path.join(fontDir, "sans-regular.ttf"), data: sansRegular },
			sansBold: { path: path.join(fontDir, "sans-bold.ttf"), data: sansBold },
		},
		images: {
			photo: { path: path.join(imageDir, "photo.png"), data: photo },
			avatar: { path: path.join(imageDir, "avatar.png"), data: avatar },
		},
	};
}

export function toDataUri(data: Uint8Array, mime: string): string {
	return `data:${mime};base64,${Buffer.from(data).toString("base64")}`;
}

export const formatExtensions: Record<string, string> = {
	png: "png",
	jpeg: "jpg",
	webp: "webp",
	avif: "avif",
	svg: "svg",
};

/** Magic-byte sniffing used to sanity-check non-PNG outputs. */
export function sniffFormat(data: Uint8Array): string | null {
	if (data.length < 12) return null;
	if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return "png";
	if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpeg";
	if (
		data[0] === 0x52 &&
		data[1] === 0x49 &&
		data[2] === 0x46 &&
		data[3] === 0x46 &&
		data[8] === 0x57 &&
		data[9] === 0x45 &&
		data[10] === 0x42 &&
		data[11] === 0x50
	) {
		return "webp";
	}
	if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) return "avif";
	const head = new TextDecoder().decode(data.slice(0, 256)).trimStart();
	if (head.startsWith("<?xml") || head.startsWith("<svg")) return "svg";
	return null;
}
