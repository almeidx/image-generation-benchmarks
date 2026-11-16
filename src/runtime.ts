export interface RuntimeInfo {
	name: "node" | "bun" | "deno";
	version: string;
}

declare const Bun: { version: string } | undefined;
declare const Deno: { version: { deno: string } } | undefined;

export function detectRuntime(): RuntimeInfo {
	if (typeof Bun !== "undefined") {
		return { name: "bun", version: Bun.version };
	}
	if (typeof Deno !== "undefined") {
		return { name: "deno", version: Deno.version.deno };
	}
	return { name: "node", version: process.versions.node };
}

/** Matrix-friendly identifier, e.g. "node-22", "bun-1.2.3", "deno-2.1.0". */
export function runtimeId(info: RuntimeInfo): string {
	if (info.name === "node") {
		return `node-${info.version.split(".")[0]}`;
	}
	return `${info.name}-${info.version}`;
}

export function runtimeLabel(info: RuntimeInfo): string {
	return `${info.name} ${info.version}`;
}
