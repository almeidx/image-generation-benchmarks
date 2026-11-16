/** The fonts and images every scenario may use, as seen by scenarios and adapters. */

export const FONT_FAMILY = "Inter";

export type FontWeight = 400 | 700;

export interface FontAsset {
	family: string;
	weight: FontWeight;
	path: string;
	data: Uint8Array;
}

export const IMAGE_NAMES = ["photo", "avatar"] as const;

export type ImageName = (typeof IMAGE_NAMES)[number];

export type ImageRecord<T> = Record<ImageName, T>;

export async function buildImages<T>(build: (name: ImageName) => T | Promise<T>): Promise<ImageRecord<T>> {
	const entries = await Promise.all(IMAGE_NAMES.map(async (name) => [name, await build(name)] as const));
	return Object.fromEntries(entries) as ImageRecord<T>;
}
