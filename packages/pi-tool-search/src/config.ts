import { readFileSync } from "fs";
import { parse } from "smol-toml";

export function parseDeferredTools(source: string): string[] {
	const document = parse(source) as { tools?: { deferred?: unknown } };
	const value = document.tools?.deferred;
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new TypeError('"tools.deferred" must be an array of strings');
	const names = value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
	return [...new Set(names)];
}

export function readDeferredTools(configPath: string): string[] {
	try {
		return parseDeferredTools(readFileSync(configPath, "utf8"));
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
		throw error;
	}
}
