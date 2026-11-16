import { readFile } from "node:fs/promises";
import { buildImages, FONT_FAMILY, type FontAsset, type FontWeight, type ImageRecord } from "../assets.ts";
import { fontPath, imagePath } from "../layout.ts";

const FONT_FILES: { weight: FontWeight; file: string }[] = [
	{ weight: 400, file: "sans-regular.ttf" },
	{ weight: 700, file: "sans-bold.ttf" },
];

export async function loadAssets(): Promise<{ fonts: FontAsset[]; images: ImageRecord<Uint8Array> }> {
	const fonts = await Promise.all(
		FONT_FILES.map(async ({ weight, file }) => ({
			family: FONT_FAMILY,
			weight,
			path: fontPath(file),
			data: await readFile(fontPath(file)),
		})),
	);
	const images = await buildImages((name) => readFile(imagePath(name)));
	return { fonts, images };
}
