import type { RuntimeInfo } from "../types.ts";

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
export function runtimeId(info: RuntimeInfo = detectRuntime()): string {
	if (info.name === "node") {
		const major = info.version.split(".")[0];
		return `node-${major}`;
	}
	return `${info.name}-${info.version}`;
}
