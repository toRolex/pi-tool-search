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
	/** Check source immediately before atomic commit; undefined means absent. Not a cross-process CAS. */
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

type SourceToken = { start: number; end: number; text: string; kind: "string" | "comment" | "syntax" };

function unsafeLayout(): Error {
	return new Error("Cannot safely edit tools.deferred in this TOML layout; fix the config and retry /tools.");
}

/** Lex only after full TOML validation. Strings/comments are opaque, including fake assignments. */
function sourceTokens(source: string): SourceToken[] {
	const tokens: SourceToken[] = [];
	let index = 0;
	while (index < source.length) {
		if (/[ \t\r]/.test(source[index])) {
			index++;
			continue;
		}
		const start = index;
		const char = source[index++];
		let kind: SourceToken["kind"] = "syntax";
		if (char === "#") {
			kind = "comment";
			while (index < source.length && source[index] !== "\n" && source[index] !== "\r") index++;
		} else if (char === '"' || char === "'") {
			kind = "string";
			const triple = source.slice(start, start + 3) === char.repeat(3);
			if (triple) index = start + 3;
			let closed = false;
			while (index < source.length) {
				if (source[index] === "\\" && char === '"') {
					index += 2;
					continue;
				}
				if (source[index] === char) {
					if (!triple) {
						index++;
						closed = true;
						break;
					}
					let end = index;
					while (source[end] === char) end++;
					if (end - index >= 3) {
						index = end;
						closed = true;
						break;
					}
					index = end;
				} else index++;
			}
			if (!closed) throw unsafeLayout();
		} else if (!"\n[]{}=,.".includes(char)) {
			while (index < source.length && !/[\s[\]{}=,.#"']/.test(source[index])) index++;
		}
		tokens.push({ start, end: index, text: source.slice(start, index), kind });
	}
	return tokens;
}

function tomlString(value: string): string {
	return stringify({ name: value })
		.trim()
		.replace(/^name\s*=\s*/, "");
}

function editArray(source: string, tokens: SourceToken[], names: string[]): string {
	const start = tokens[0].start;
	const end = tokens.at(-1)!.end;
	if (!tokens.some((token) => token.kind === "comment")) {
		return source.slice(0, start) + `[${names.map(tomlString).join(", ")}]` + source.slice(end);
	}
	const remaining = new Set(names);
	const elements = tokens.filter((token) => token.kind === "string");
	const kept = elements.filter((token) => {
		const value = parse(`value = ${token.text}`).value as string;
		if (!remaining.has(value)) return false;
		remaining.delete(value);
		return true;
	});
	const added = [...remaining];
	const keptTokens = new Set(kept);
	const edits = tokens
		.filter((token) => token.text === "," || (token.kind === "string" && !keptTokens.has(token)))
		.map((token) => ({ start: token.start, end: token.end, text: "" }));
	for (let index = 0; index < kept.length; index++) {
		if (index < kept.length - 1 || added.length)
			edits.push({ start: kept[index].end, end: kept[index].end, text: "," });
	}
	if (added.length) edits.push({ start: end - 1, end: end - 1, text: added.map(tomlString).join(", ") });
	let result = source;
	for (const edit of edits.sort((a, b) => b.start - a.start))
		result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
	return result;
}

function locatePolicy(tokens: SourceToken[]) {
	let cursor = 0;
	let table: string[] = [];
	let range: SourceToken[] | undefined;
	let toolsHeaderEnd: number | undefined;
	let rootEnd: number | undefined;
	let inlineTools: SourceToken[] | undefined;
	const isPath = (path: string[], expected: string[]) => JSON.stringify(path) === JSON.stringify(expected);
	const skip = () => {
		while (tokens[cursor]?.kind === "comment" || tokens[cursor]?.text === "\n") cursor++;
	};
	const key = () => {
		const path: string[] = [];
		do {
			const token = tokens[cursor++];
			if (!token) throw unsafeLayout();
			path.push(token.kind === "string" ? (parse(`value = ${token.text}`).value as string) : token.text);
			if (tokens[cursor]?.text !== ".") break;
			cursor++;
		} while (cursor < tokens.length);
		return path;
	};
	const value = (path: string[]): void => {
		const start = cursor;
		const token = tokens[cursor++];
		if (!token) throw unsafeLayout();
		if (token.text === "{") {
			skip();
			while (tokens[cursor]?.text !== "}") {
				const child = [...path, ...key()];
				if (tokens[cursor++]?.text !== "=") throw unsafeLayout();
				value(child);
				skip();
				if (tokens[cursor]?.text !== ",") break;
				cursor++;
				skip();
			}
			if (tokens[cursor++]?.text !== "}") throw unsafeLayout();
			if (isPath(path, ["tools"])) inlineTools = tokens.slice(start, cursor);
		} else if (token.text === "[") {
			let depth = 1;
			while (cursor < tokens.length && depth) {
				const next = tokens[cursor++];
				if (next.kind !== "syntax") continue;
				if (next.text === "[") depth++;
				if (next.text === "]") depth--;
			}
			if (depth) throw unsafeLayout();
		} else {
			while (
				cursor < tokens.length &&
				tokens[cursor].kind !== "comment" &&
				!["\n", ",", "}"].includes(tokens[cursor].text)
			)
				cursor++;
		}
		if (isPath(path, ["tools", "deferred"])) {
			if (range || token.text !== "[") throw unsafeLayout();
			range = tokens.slice(start, cursor);
		}
	};
	while (cursor < tokens.length) {
		skip();
		if (cursor === tokens.length) break;
		if (tokens[cursor]?.text === "[") {
			rootEnd ??= tokens[cursor].start;
			cursor++;
			const arrayTable = tokens[cursor]?.text === "[";
			if (arrayTable) cursor++;
			table = key();
			if (tokens[cursor++]?.text !== "]" || (arrayTable && tokens[cursor++]?.text !== "]")) throw unsafeLayout();
			// Array-table members never denote the singleton tools policy table.
			if (arrayTable) table.push("[]");
			if (isPath(table, ["tools"])) {
				let end = cursor;
				if (tokens[end]?.kind === "comment") end++;
				toolsHeaderEnd = tokens[end]?.text === "\n" ? tokens[end].end : tokens[end - 1].end;
			}
			skip();
		} else {
			const path = [...table, ...key()];
			if (tokens[cursor++]?.text !== "=") throw unsafeLayout();
			value(path);
			skip();
		}
	}
	return { range, toolsHeaderEnd, rootEnd, inlineTools };
}

export function patchDeferredTool(source: string, name: string, deferred: boolean): string {
	const document = parse(source) as { tools?: { deferred?: unknown } };
	const tools = document.tools;
	if (tools !== undefined && (typeof tools !== "object" || tools === null || Array.isArray(tools)))
		throw unsafeLayout();
	const value = tools?.deferred;
	if (
		value !== undefined &&
		(!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.length > 0))
	)
		throw unsafeLayout();
	const names = [...new Set((value ?? []) as string[])].filter((entry) => deferred || entry !== name);
	if (deferred && !names.includes(name)) names.push(name);
	if (JSON.stringify(names) === JSON.stringify(value ?? [])) return source;
	const { range, toolsHeaderEnd, rootEnd, inlineTools } = locatePolicy(sourceTokens(source));
	let next: string;
	if (value !== undefined) {
		if (
			!range ||
			JSON.stringify(parse(`value = ${source.slice(range[0].start, range.at(-1)!.end)}`).value) !==
				JSON.stringify(value)
		)
			throw unsafeLayout();
		next = editArray(source, range, names);
	} else {
		const array = `[${names.map(tomlString).join(", ")}]`;
		const newline = source.includes("\r\n") ? "\r\n" : "\n";
		let position: number;
		let insertion: string;
		if (inlineTools) {
			position = inlineTools.at(-1)!.start;
			const significant = inlineTools.slice(1, -1).filter((token) => token.kind !== "comment" && token.text !== "\n");
			insertion = `${significant.length && significant.at(-1)!.text !== "," ? ", " : ""}deferred = ${array}`;
		} else {
			position = toolsHeaderEnd ?? (tools ? (rootEnd ?? source.length) : source.length);
			const separator = position > 0 && source[position - 1] !== "\n" ? newline : "";
			const key = tools && toolsHeaderEnd === undefined ? "tools.deferred" : "deferred";
			insertion = `${separator}${tools === undefined ? `[tools]${newline}` : ""}${key} = ${array}${newline}`;
		}
		next = source.slice(0, position) + insertion + source.slice(position);
	}
	if (JSON.stringify(parseDeferredTools(next)) !== JSON.stringify(names)) throw unsafeLayout();
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
