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

const migrationFileSystem: MigrationFileSystem = {
	read: (path) => readFileSync(path, "utf8"),
	write: (path, source, exclusive) => {
		// Stage on the same filesystem: a failed write must not leave an empty/partial
		// authoritative config or truncate the legacy file before cleanup succeeds.
		const temporaryDir = mkdtempSync(join(dirname(path), ".tool-search-migration-"));
		const temporaryPath = join(temporaryDir, "config.toml");
		try {
			writeFileSync(temporaryPath, source);
			const fd = openSync(temporaryPath, "r");
			try {
				fsyncSync(fd);
			} finally {
				closeSync(fd);
			}
			if (exclusive) linkSync(temporaryPath, path);
			else renameSync(temporaryPath, path);
		} finally {
			rmSync(temporaryDir, { recursive: true, force: true });
		}
	},
};

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
