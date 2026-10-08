import {
	closeSync,
	fsyncSync,
	linkSync,
	mkdtempSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "smol-toml";

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
		if (isMissing(error)) return [];
		throw error;
	}
}

function isMissing(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export interface MigrationFileSystem {
	read(path: string): string;
	write(path: string, source: string, exclusive?: boolean): void;
}

function atomicWrite(path: string, source: string, exclusive = false, beforeCommit?: () => void): void {
	const temporaryDir = mkdtempSync(join(dirname(path), ".tool-search-write-"));
	const temporaryPath = join(temporaryDir, "config.toml");
	let committed = false;
	try {
		writeFileSync(temporaryPath, source);
		const fd = openSync(temporaryPath, "r");
		try {
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		beforeCommit?.();
		if (exclusive) linkSync(temporaryPath, path);
		else renameSync(temporaryPath, path);
		committed = true;
	} finally {
		try {
			rmSync(temporaryDir, { recursive: true, force: true });
		} catch (error) {
			// Cleanup after rename is not a failed save: disk is already authoritative.
			process.emitWarning(
				`Tool Search ${committed ? "saved config" : "save failed"}, but temporary cleanup failed: ${String(error)}`,
			);
		}
	}
}

const migrationFileSystem: MigrationFileSystem = {
	read: (path) => readFileSync(path, "utf8"),
	write: atomicWrite,
};

export interface DeferredConfigFileSystem {
	read(path: string): string;
	/** Commit atomically only if the latest source still matches; undefined means absent. */
	write(path: string, source: string, expectedSource: string | undefined): void;
}

function readSource(path: string, fs: Pick<DeferredConfigFileSystem, "read">): string | undefined {
	try {
		return fs.read(path);
	} catch (error) {
		if (isMissing(error)) return undefined;
		throw error;
	}
}

export const deferredConfigFileSystem: DeferredConfigFileSystem = {
	read: (path) => readFileSync(path, "utf8"),
	write(path, source, expectedSource) {
		atomicWrite(path, source, expectedSource === undefined, () => {
			if (readSource(path, deferredConfigFileSystem) !== expectedSource) {
				throw new Error("Tool Search config changed while saving; reopen /tools and retry.");
			}
		});
	},
};

/** #14 supports the canonical single-line array only; richer safe editing belongs to #15. */
export function patchDeferredTool(source: string, name: string, deferred: boolean): string {
	const document = parse(source) as { tools?: { deferred?: unknown } };
	const value = document.tools?.deferred;
	const unsupported = () =>
		new Error("Unsupported tool-search.toml layout: use [tools] with a single-line deferred string array.");
	if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0)) {
		throw unsupported();
	}
	// Multiline strings can contain fake headers/assignments; never regex-edit those documents.
	if (source.includes('"""') || source.includes("'''")) throw unsupported();
	let inTools = false;
	let offset = 0;
	let range: { start: number; end: number } | undefined;
	for (const line of source.split(/(?<=\n)/)) {
		if (/^\s*\[/.test(line)) inTools = /^\s*\[tools\]\s*(?:#.*)?(?:\r?\n)?$/.test(line);
		if (inTools) {
			const assignment = /^[ \t]*deferred[ \t]*=[ \t]*\[/.exec(line);
			if (assignment) {
				const start = assignment[0].length - 1;
				let quote = "";
				let end = -1;
				for (let index = start + 1; index < line.length; index++) {
					const char = line[index];
					if (quote) {
						if (char === "\\" && quote === '"') index++;
						else if (char === quote) quote = "";
					} else if (char === '"' || char === "'") quote = char;
					else if (char === "]") {
						end = index + 1;
						break;
					} else if (char === "#" || char === "\n" || char === "\r" || char === "[") throw unsupported();
				}
				if (end < 0 || !/^[ \t]*(?:#.*)?(?:\r?\n)?$/.test(line.slice(end))) throw unsupported();
				const isolated = parse(`value = ${line.slice(start, end)}`).value;
				if (JSON.stringify(isolated) !== JSON.stringify(value)) throw unsupported();
				range = { start: offset + start, end: offset + end };
			}
		}
		offset += line.length;
	}
	if (!range) throw unsupported();
	const names = [...new Set(value as string[])].filter((entry) => deferred || entry !== name);
	if (deferred && !names.includes(name)) names.push(name);
	if (JSON.stringify(names) === JSON.stringify(value)) return source;
	const serialized = `[${names
		.map((entry) =>
			stringify({ name: entry })
				.trim()
				.replace(/^name\s*=\s*/, ""),
		)
		.join(", ")}]`;
	const next = source.slice(0, range.start) + serialized + source.slice(range.end);
	parse(next);
	return next;
}

export function setDeferredTool(
	configPath: string,
	name: string,
	deferred: boolean,
	fs: DeferredConfigFileSystem = deferredConfigFileSystem,
): string[] {
	if (!name) throw new Error("Tool name must not be empty.");
	const previous = readSource(configPath, fs);
	const source = previous ?? "# Tools listed here are deferred, not disabled.\n[tools]\ndeferred = []\n";
	const next = patchDeferredTool(source, name, deferred);
	if (next !== previous) fs.write(configPath, next, previous);
	return parseDeferredTools(next);
}

/** Read once and return the session snapshot; existing files (even empty ones) win.
 * Cleanup can be retried without migrating again or rereading the new file.
 */
export function migrateDeferredTools(
	configPath: string,
	legacyPath: string,
	fs: MigrationFileSystem = migrationFileSystem,
): string[] {
	let exists = true;
	let snapshot: string[] = [];
	try {
		snapshot = parseDeferredTools(fs.read(configPath));
	} catch (error) {
		if (!isMissing(error)) throw error;
		exists = false;
	}
	let legacy: string;
	try {
		legacy = fs.read(legacyPath);
	} catch (error) {
		if (isMissing(error)) return snapshot;
		throw error;
	}
	const document = parse(legacy) as Record<string, unknown>;
	if (!Object.hasOwn(document, "tools")) return snapshot;
	const tools = document.tools as Record<string, unknown>;
	// Unquoted dotted TOML keys are nested; also accept the quoted legacy spelling.
	const namespace = tools["pi-tool-search"] as { tools?: unknown } | undefined;
	const oldNames = tools["pi-tool-search.tools"] ?? namespace?.tools;
	if (!exists) {
		if (!Array.isArray(oldNames) || !oldNames.every((name) => typeof name === "string")) return snapshot;
		const source = stringify({ tools: { deferred: oldNames } });
		try {
			// Never copy other xsettings sections or pi.defaultTools to the new file.
			fs.write(configPath, source, true);
			snapshot = parseDeferredTools(source);
		} catch (error) {
			throw new Error(
				`Deferred tools migration: cannot write ${configPath}; legacy config retained. Retry initialization after fixing the write failure.`,
				{ cause: error },
			);
		}
	}
	// Parse/stringify handles quoted headers, nested tables, and multiline values safely.
	delete document.tools;
	try {
		fs.write(legacyPath, stringify(document));
	} catch (error) {
		throw new Error(
			`Deferred tools migration: cannot clean ${legacyPath}; ${configPath} is authoritative. Retry initialization to clean the legacy tools section without overwriting the new config.`,
			{ cause: error },
		);
	}
	return snapshot;
}
