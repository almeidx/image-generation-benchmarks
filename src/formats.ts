export type OutputFormat = "png" | "jpeg" | "webp" | "avif" | "svg";

export const FORMAT_EXTENSIONS: Record<OutputFormat, string> = {
	png: "png",
	jpeg: "jpg",
	webp: "webp",
	avif: "avif",
	svg: "svg",
};

const startsWith = (data: Uint8Array, offset: number, bytes: number[]) =>
	bytes.every((byte, i) => data[offset + i] === byte);

/** Identifies encoded bytes by magic number; libraries may silently fall back to another codec. */
export function sniffFormat(data: Uint8Array): OutputFormat | null {
	if (data.length < 12) return null;
	if (startsWith(data, 0, [0x89, 0x50, 0x4e, 0x47])) return "png";
	if (startsWith(data, 0, [0xff, 0xd8, 0xff])) return "jpeg";
	if (startsWith(data, 0, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, 8, [0x57, 0x45, 0x42, 0x50])) return "webp";
	if (startsWith(data, 4, [0x66, 0x74, 0x79, 0x70])) return "avif";
	const head = new TextDecoder().decode(data.subarray(0, 256)).trimStart();
	if (head.startsWith("<?xml") || head.startsWith("<svg")) return "svg";
	return null;
}
