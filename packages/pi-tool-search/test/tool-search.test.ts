import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { parse } from "smol-toml";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { createToolSearchExtension } from "../src/extension.ts";
import { ensureXSettingsRegistry } from "../../pi-xsettings/src/protocol/settings.ts";
import {
	migrateDeferredTools,
	parseDeferredTools,
	readDeferredTools,
	setDeferredTool,
	deferredConfigFileSystem,
	type DeferredConfigFileSystem,
} from "../src/config.ts";
import {
	initTheme,
	getSettingsListTheme,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type RegisteredCommand,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { configureTuiAppearance, DEFAULT_TUI_APPEARANCE, icon } from "@luan.sh/pi-libtui";
import toolSearchExtension from "../src/extension.ts";
import { searchTools, type ToolMetadata } from "../src/search.ts";
import { createToolSearchTool, executeToolSearch, TOOL_SEARCH_NAME } from "../src/tools/tool-search/definition.ts";
import { renderToolSearchResult } from "../src/tools/tool-search/presentation.ts";
import { DEFERRED_SECTION_KEY, parseSelectQuery, renderDeferredSection } from "../src/tools/tool-search/select.ts";

const SETTINGS_KEY = Symbol.for("pi-xsettings/registry/v1");

let configDir = mkdtempSync(join(tmpdir(), "tool-search-test-"));
let configPath = join(configDir, "tool-search.toml");

function configure(names: string[]) {
	writeFileSync(configPath, `[tools]\ndeferred = [${names.map((name) => JSON.stringify(name)).join(", ")}]`);
}

afterEach(() => {
	rmSync(configDir, { recursive: true, force: true });
	configDir = mkdtempSync(join(tmpdir(), "tool-search-test-"));
	configPath = join(configDir, "tool-search.toml");
	Reflect.deleteProperty(globalThis, SETTINGS_KEY);
	configureTuiAppearance(DEFAULT_TUI_APPEARANCE);
});

const presentationTheme = {
	name: "tool-search-test",
	bold: (text: string) => text,
	getColorMode: () => "truecolor",
	getFgAnsi: () => "\x1b[39m",
	getBgAnsi: () => "\x1b[49m",
} as never as Theme;

function metadata(
	name: string,
	description: string,
	parameters: ToolMetadata["parameters"] = { type: "object", properties: {} },
): ToolMetadata {
	return {
		name,
		description,
		parameters,
		sourceInfo: {
			source: "extension",
			path: `/extensions/${name}.ts`,
			scope: "user",
			origin: "package",
		},
	};
}

function toolApi(tools: ToolMetadata[], active: string[]) {
	const updates: string[][] = [];
	return {
		api: {
			getAllTools: () => tools,
			getActiveTools: () => [...active],
			setActiveTools: (names: string[]) => {
				active.splice(0, active.length, ...names);
				updates.push([...names]);
			},
		},
		scope(...deferredNames: string[]) {
			const assigned = new Set([...active, ...deferredNames]);
			return {
				tools: () => tools.filter((tool) => assigned.has(tool.name)),
				active: () => [...active],
				setActive: (names: readonly string[]) => {
					active.splice(0, active.length, ...names);
					updates.push([...names]);
				},
			};
		},
		updates,
	};
}

describe("extension manifest", () => {
	test("loads exactly the tool-search extension", () => {
		const manifest = JSON.parse(readFileSync(resolve(import.meta.dir, "../../../package.json"), "utf8"));
		expect(manifest.pi.extensions).toEqual(["./packages/pi-tool-search/src/extension.ts"]);
		expect(manifest.pi.extensions).toHaveLength(1);
	});
});

describe("persistent deferred editing", () => {
	test("missing file creates a minimal config, duplicates collapse and no-op saves preserve bytes", () => {
		expect(setDeferredTool(configPath, "weather", true)).toEqual(["weather"]);
		expect(readFileSync(configPath, "utf8")).toBe(
			'# Tools listed here are deferred, not disabled.\n[tools]\ndeferred = ["weather"]\n',
		);
		writeFileSync(configPath, '[tools]\ndeferred = [ "unknown", "unknown", "weather" ] # keep');
		setDeferredTool(configPath, "weather", true);
		expect(readFileSync(configPath, "utf8")).toBe('[tools]\ndeferred = ["unknown", "weather"] # keep');
		writeFileSync(configPath, '[tools]\ndeferred = [ "unknown", "weather" ] # keep');
		expect(
			setDeferredTool(configPath, "weather", true, {
				read: deferredConfigFileSystem.read,
				write() {
					throw new Error("no-op must not write");
				},
			}),
		).toEqual(["unknown", "weather"]);
		expect(readFileSync(configPath, "utf8")).toBe('[tools]\ndeferred = [ "unknown", "weather" ] # keep');
	});

	for (const source of [
		'tools = "scalar"\n',
		'[[tools]]\ndeferred = ["weather"]\n',
		'tools = ["weather"]\n',
		'[tools]\ndeferred = "weather"\n',
		'[tools]\ndeferred = [""]\n',
		'[tools]\ndeferred = ["weather", 7]\n',
		'[tools]\ndeferred = ["weather"\n',
	]) {
		test(`unsupported or invalid config is never changed: ${JSON.stringify(source)}`, () => {
			writeFileSync(configPath, source);
			expect(() => setDeferredTool(configPath, "issues", true)).toThrow();
			expect(readFileSync(configPath, "utf8")).toBe(source);
		});
	}

	for (const missing of [false, true]) {
		test(`atomic commit refuses an external edit or creation (missing: ${missing})`, () => {
			if (!missing) configure(["weather"]);
			const external = '[tools]\ndeferred = ["external"] # external edit\n';
			expect(() =>
				setDeferredTool(configPath, "issues", true, {
					read(path) {
						try {
							return readFileSync(path, "utf8");
						} finally {
							writeFileSync(path, external);
						}
					},
					write: deferredConfigFileSystem.write,
				}),
			).toThrow("changed while saving");
			expect(readFileSync(configPath, "utf8")).toBe(external);
		});
	}

	test("failed staging never creates a partial authoritative file", () => {
		const missingParent = join(configDir, "missing", "tool-search.toml");
		expect(() => setDeferredTool(missingParent, "weather", true)).toThrow();
		expect(existsSync(missingParent)).toBe(false);
	});

	test("editing preserves suffix comment bytes and special tool-name values", () => {
		writeFileSync(configPath, "[tools]\ndeferred = [\"unknown#]\", 'literal]'] # [leave this]\n");
		setDeferredTool(configPath, 'weather"\\', true);
		expect(readFileSync(configPath, "utf8")).toBe(
			'[tools]\ndeferred = ["unknown#]", "literal]", "weather\\"\\\\"] # [leave this]\n',
		);
	});
	test("hide/show replaces only the canonical array and preserves unregistered names", () => {
		const prefix = "# keep 注释\r\n[other]\r\nvalue = 7\r\n\r\n[tools]\r\n  deferred = ";
		const suffix = ' # keep suffix\r\n\r\n[after]\r\nvalue = "unchanged"';
		writeFileSync(configPath, `${prefix}["unknown"]${suffix}`);
		expect(setDeferredTool(configPath, "weather", true)).toEqual(["unknown", "weather"]);
		expect(readFileSync(configPath, "utf8")).toBe(`${prefix}["unknown", "weather"]${suffix}`);
		expect(setDeferredTool(configPath, "weather", true)).toEqual(["unknown", "weather"]);
		expect(setDeferredTool(configPath, "weather", false)).toEqual(["unknown"]);
		expect(readFileSync(configPath, "utf8")).toBe(`${prefix}["unknown"]${suffix}`);
	});
});

describe("#15 handwritten TOML editing", () => {
	test("real atomic staging/rename failures preserve the original bytes and clean temporary files", () => {
		const source = '[tools]\ndeferred = [\n # keep\n "unknown",\n]\n';
		for (const operation of ["writeFileSync", "fsyncSync", "renameSync"]) {
			writeFileSync(configPath, source);
			// A separate Bun process keeps low-level fs fault injection out of every other test.
			const script = `import {mock} from "bun:test";
				import * as fs from "node:fs";
				const actual = {...fs};
				mock.module("node:fs", () => ({...actual, ${operation}() { throw new Error("injected ${operation}"); }}));
				const {setDeferredTool} = await import(${JSON.stringify(resolve(import.meta.dir, "../src/config.ts"))});
				try { setDeferredTool(${JSON.stringify(configPath)}, "weather", true); process.exit(2); }
				catch (error) { console.log(String(error)); }`;
			const result = Bun.spawnSync([process.execPath, "-e", script]);
			expect(result.exitCode).toBe(0);
			expect(result.stdout.toString()).toContain(`injected ${operation}`);
			expect(readFileSync(configPath, "utf8")).toBe(source);
			expect(readdirSync(configDir)).toEqual(["tool-search.toml"]);
			setDeferredTool(configPath, "weather", true);
			expect(readDeferredTools(configPath)).toEqual(["unknown", "weather"]);
		}
	});
	test("missing inline keys retain TOML 1.1 comments and trailing commas", () => {
		for (const [source, expected] of [
			["tools={other=7,}", 'tools={other=7,deferred = ["weather"]}'],
			["tools={\n# c\nother=7,\n}", 'tools={\n# c\nother=7,\ndeferred = ["weather"]}'],
			["tools={# c\n}", 'tools={# c\ndeferred = ["weather"]}'],
			["tools = {\n other = 7 # keep\n}", 'tools = {\n other = 7 # keep\n, deferred = ["weather"]}'],
			["tools.other = 7 # keep", 'tools.other = 7 # keep\ntools.deferred = ["weather"]\n'],
		]) {
			writeFileSync(configPath, source);
			expect(setDeferredTool(configPath, "weather", true)).toEqual(["weather"]);
			expect(readFileSync(configPath, "utf8")).toBe(expected);
		}
	});
	test("comments survive duplicate removal, empty arrays, multiline escaped strings and repeated toggles", () => {
		const source = `[tools]\ndeferred = [\n # first\n """wea\\\n   ther""", # one\n 'unknown', # two\n 'unknown', # duplicate\n 'weather', # last\n]\n`;
		writeFileSync(configPath, source);
		expect(setDeferredTool(configPath, "weather", true)).toEqual(["weather", "unknown"]);
		const deduplicated = readFileSync(configPath, "utf8");
		expect(deduplicated).toBe(
			`[tools]\ndeferred = [\n # first\n """wea\\\n   ther""", # one\n 'unknown' # two\n  # duplicate\n  # last\n]\n`,
		);
		setDeferredTool(configPath, "weather", true);
		expect(readFileSync(configPath, "utf8")).toBe(deduplicated);
		setDeferredTool(configPath, "weather", false);
		setDeferredTool(configPath, "unknown", false);
		expect(readDeferredTools(configPath)).toEqual([]);
		for (const comment of ["# first", "# one", "# two", "# duplicate", "# last"])
			expect(readFileSync(configPath, "utf8")).toContain(comment);
		setDeferredTool(configPath, "weather", true);
		expect(readDeferredTools(configPath)).toEqual(["weather"]);
	});
	test("quoted, escaped, dotted and inline keys locate only the semantic policy array", () => {
		for (const [prefix, array, suffix] of [
			["\"tools\" . 'deferred' = ", '["unknown"]', " # suffix\n"],
			['["too\\u006cs"]\n"defer\\u0072ed" = ', "['unknown']", "\n"],
			['tools = { other = { deferred = ["decoy"] }, "deferred" = ', '["unknown"]', ", keep = 7 }\n"],
			['tools = { "deferred" = ', "[\"\"\"unknown\"\"\", '''literal]#''']", " }\n"],
			["[other]\ndeferred = [\"decoy\"]\n[tools]\n'deferred' = ", "[]", '\n[[after]]\nname = "x"\n'],
		]) {
			writeFileSync(configPath, prefix + array + suffix);
			setDeferredTool(configPath, "weather\x00\t😀", true);
			expect(readFileSync(configPath, "utf8")).toBe(
				prefix +
					(array === "[]"
						? '["weather\\u0000\\t😀"]'
						: array.includes("literal")
							? '["unknown", "literal]#", "weather\\u0000\\t😀"]'
							: '["unknown", "weather\\u0000\\t😀"]') +
					suffix,
			);
			expect(readDeferredTools(configPath)).toContain("weather\x00\t😀");
		}
	});
	test("multiline array preserves internal comments, literal strings and all outside bytes", () => {
		const prefix = "# 注释\r\n[tools]\r\ndeferred = ";
		const array =
			"[\r\n  # heading ]\r\n  \"unknown#]\", # keep unknown\r\n  'weather', # keep removed\r\n  # ending\r\n]";
		const suffix = ' # suffix\r\n[other]\r\ntext = """\n[tools]\ndeferred = []\n"""';
		writeFileSync(configPath, prefix + array + suffix);
		expect(setDeferredTool(configPath, "weather", false)).toEqual(["unknown#]"]);
		expect(readFileSync(configPath, "utf8")).toBe(
			prefix + '[\r\n  # heading ]\r\n  "unknown#]" # keep unknown\r\n   # keep removed\r\n  # ending\r\n]' + suffix,
		);
		setDeferredTool(configPath, 'new"\\\n', true);
		expect(readDeferredTools(configPath)).toEqual(["unknown#]", 'new"\\\n']);
		const result = readFileSync(configPath, "utf8");
		expect(result.startsWith(prefix)).toBe(true);
		expect(result.endsWith(suffix)).toBe(true);
		const bytes = readFileSync(configPath);
		expect(bytes.subarray(0, Buffer.byteLength(prefix))).toEqual(Buffer.from(prefix));
		expect(bytes.subarray(bytes.length - Buffer.byteLength(suffix))).toEqual(Buffer.from(suffix));
		for (const comment of ["# heading ]", "# keep unknown", "# keep removed", "# ending"])
			expect(result).toContain(comment);
	});
});

describe("deferred config", () => {
	for (const existing of [true, false]) {
		test(`initialization reads the authoritative path once (existing: ${existing})`, () => {
			const legacy = join(configDir, "xsettings.toml");
			if (existing) configure(["new"]);
			writeFileSync(legacy, '[tools]\npi-tool-search.tools = ["old"]\n');
			const reads: string[] = [];
			const snapshot = migrateDeferredTools(configPath, legacy, {
				read(path) {
					reads.push(path);
					if (reads.filter((value) => value === path).length > 1) throw new Error("duplicate read");
					return readFileSync(path, "utf8");
				},
				write: (path, source, exclusive) => writeFileSync(path, source, { flag: exclusive ? "wx" : "w" }),
			});
			expect(reads.filter((path) => path === configPath)).toHaveLength(1);
			expect(snapshot).toEqual([existing ? "new" : "old"]);
		});
	}
	test("parses string arrays and ignores non-string entries, empty strings, and duplicates", () => {
		expect(parseDeferredTools('[tools]\ndeferred = [\n # comment\n "read", \'write\', 1, "", "read",\n]')).toEqual([
			"read",
			"write",
		]);
	});
	test("returns empty for missing key and rejects malformed TOML", () => {
		expect(parseDeferredTools("[tools]")).toEqual([]);
		expect(parseDeferredTools("")).toEqual([]);
		expect(() => parseDeferredTools('[tools]\ndeferred = "read"')).toThrow(TypeError);
		expect(() => parseDeferredTools("[tools\ndeferred = [")).toThrow();
	});
	test("reads missing files as empty but propagates other filesystem and parse errors", () => {
		expect(readDeferredTools(configPath)).toEqual([]);
		expect(() => readDeferredTools(configDir)).toThrow();
		writeFileSync(configPath, "[tools\ndeferred = [");
		expect(() => readDeferredTools(configPath)).toThrow();
	});
	test("migrates the 25-name set, writes only deferred, preserves other section values, and is idempotent", () => {
		const legacy = join(configDir, "xsettings.toml");
		const names = Array.from({ length: 25 }, (_, i) => `tool_${i}`);
		writeFileSync(
			legacy,
			`[appearance]\ntheme = "keep"\n\n[tools]\npi-tool-search.tools = ${JSON.stringify(names)}\npi.defaultTools = ["ignore"]\n\n[behavior]\nx = true\n`,
		);
		migrateDeferredTools(configPath, legacy);
		expect(new Set(readDeferredTools(configPath))).toEqual(new Set(names));
		expect(parse(readFileSync(configPath, "utf8"))).toEqual({ tools: { deferred: names } });
		expect(parse(readFileSync(legacy, "utf8"))).toEqual({ appearance: { theme: "keep" }, behavior: { x: true } });
		const before = [readFileSync(configPath, "utf8"), readFileSync(legacy, "utf8")];
		migrateDeferredTools(configPath, legacy, {
			read: (path) => readFileSync(path, "utf8"),
			write() {
				throw new Error("repeat initialization must not write");
			},
		});
		expect([readFileSync(configPath, "utf8"), readFileSync(legacy, "utf8")]).toEqual(before);
	});
	test("existing new config wins and legacy list is cleaned", () => {
		writeFileSync(configPath, '[tools]\ndeferred = ["new"]');
		const legacy = join(configDir, "xsettings.toml");
		writeFileSync(legacy, '[tools]\npi-tool-search.tools = ["old"]\n');
		migrateDeferredTools(configPath, legacy);
		expect(readDeferredTools(configPath)).toEqual(["new"]);
		expect(parse(readFileSync(legacy, "utf8"))).toEqual({});
	});

	test("an existing empty config is authoritative and is not overwritten", () => {
		writeFileSync(configPath, "");
		const legacy = join(configDir, "xsettings.toml");
		writeFileSync(legacy, '[tools]\n"pi-tool-search.tools" = ["old"]\n');
		migrateDeferredTools(configPath, legacy);
		expect(readFileSync(configPath, "utf8")).toBe("");
		expect(parse(readFileSync(legacy, "utf8"))).toEqual({});
	});

	test("missing legacy file is a no-op, with or without an existing new file", () => {
		const legacy = join(configDir, "xsettings.toml");
		migrateDeferredTools(configPath, legacy);
		expect(existsSync(configPath)).toBe(false);
		configure(["new"]);
		migrateDeferredTools(configPath, legacy);
		expect(readDeferredTools(configPath)).toEqual(["new"]);
		expect(existsSync(legacy)).toBe(false);
	});

	test("does not migrate pi.defaultTools alone or discard legacy before a valid migration", () => {
		const legacy = join(configDir, "xsettings.toml");
		for (const source of ['[tools]\npi.defaultTools = ["read"]\n', '[tools]\npi-tool-search.tools = "invalid"\n']) {
			writeFileSync(legacy, source);
			migrateDeferredTools(configPath, legacy);
			expect(existsSync(configPath)).toBe(false);
			expect(readFileSync(legacy, "utf8")).toBe(source);
		}
	});

	test("removes the entire tools tree while preserving multiline and quoted-table values", () => {
		const legacy = join(configDir, "xsettings.toml");
		const source = `[appearance]\nnote = '''keep\n[tools]\nthis is text'''\n["tools"] # quoted header\n"pi-tool-search.tools" = ["old"]\n[tools.nested]\nvalue = 1\n["behavior"]\nenabled = true\n[custom.tools]\nvalue = "keep"\n`;
		writeFileSync(legacy, source);
		migrateDeferredTools(configPath, legacy);
		const expected = parse(source);
		delete expected.tools;
		expect(parse(readFileSync(legacy, "utf8"))).toEqual(expected);
		expect(readDeferredTools(configPath)).toEqual(["old"]);
	});

	test("a new-file write failure retains legacy and reports a retry with the cause", () => {
		const legacy = join(configDir, "xsettings.toml");
		const source = '[tools]\npi-tool-search.tools = ["old"]\n';
		writeFileSync(legacy, source);
		const failure = new Error("injected write failure");
		let caught: unknown;
		try {
			migrateDeferredTools(configPath, legacy, {
				read: (path) => readFileSync(path, "utf8"),
				write() {
					throw failure;
				},
			});
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toContain("legacy config retained. Retry initialization");
		expect((caught as Error).cause).toBe(failure);
		expect(readFileSync(legacy, "utf8")).toBe(source);
		expect(existsSync(configPath)).toBe(false);
	});

	test("cleanup failure reports retry; retry only cleans and does not rewrite the migrated file", () => {
		const legacy = join(configDir, "xsettings.toml");
		const source = '[tools]\npi-tool-search.tools = ["old"]\n';
		writeFileSync(legacy, source);
		const writes: string[] = [];
		expect(() =>
			migrateDeferredTools(configPath, legacy, {
				read: (path) => readFileSync(path, "utf8"),
				write(path, value, exclusive) {
					writes.push(path);
					if (path === legacy) throw new Error("injected cleanup failure");
					writeFileSync(path, value, { flag: exclusive ? "wx" : "w" });
				},
			}),
		).toThrow("Retry initialization to clean the legacy tools section without overwriting the new config");
		expect(readDeferredTools(configPath)).toEqual(["old"]);
		expect(readFileSync(legacy, "utf8")).toBe(source);
		migrateDeferredTools(configPath, legacy, {
			read: (path) => readFileSync(path, "utf8"),
			write(path, value) {
				writes.push(path);
				if (path === configPath) throw new Error("must not overwrite");
				writeFileSync(path, value);
			},
		});
		expect(writes).toEqual([configPath, legacy, legacy]);
		expect(parse(readFileSync(legacy, "utf8"))).toEqual({});
	});
});

describe("ranking", () => {
	test("ranks name matches above description matches", () => {
		const matches = searchTools("weather", [
			metadata("weather_lookup", "Read a forecast."),
			metadata("city_lookup", "Read weather for a city."),
		]);

		expect(matches.map((match) => match.tool.name)).toEqual(["weather_lookup", "city_lookup"]);
	});

	test("searches parameter names and descriptions", () => {
		const matches = searchTools("repository", [
			metadata("find_issue", "Find an issue.", {
				type: "object",
				properties: {
					repo: { type: "string", description: "The repository to inspect." },
				},
			}),
			metadata("find_person", "Find a person."),
		]);

		expect(matches.map((match) => match.tool.name)).toEqual(["find_issue"]);
	});
});

describe("select query parsing", () => {
	test("detects the select prefix after leading whitespace", () => {
		expect(parseSelectQuery("  select:read")).toEqual({ requested: ["read"] });
	});

	test("returns undefined without the prefix", () => {
		expect(parseSelectQuery("weather")).toBeUndefined();
		expect(parseSelectQuery("select")).toBeUndefined();
		expect(parseSelectQuery("preselect:read")).toBeUndefined();
	});

	test("trims segments, drops empties, and dedupes preserving first occurrence", () => {
		expect(parseSelectQuery("select: read , , read ,write_stdin ,, ")).toEqual({
			requested: ["read", "write_stdin"],
		});
	});

	test("keeps a bare select query as an empty request", () => {
		expect(parseSelectQuery("select:")).toEqual({ requested: [] });
		expect(parseSelectQuery("select: , ,")).toEqual({ requested: [] });
	});
});

describe("deferred tool section", () => {
	test("renders nothing when no tools are pending", () => {
		expect(renderDeferredSection([])).toBeUndefined();
	});

	test("lists pending names and shows a two-name select example", () => {
		expect(renderDeferredSection(["read", "write_stdin", "exec_command"])).toBe(
			"These tools are available but their schemas are not loaded: read, write_stdin, exec_command.\n" +
				'Use tool_search with query "select:<name>" (e.g. "select:read,write_stdin") to load tool schemas before calling them.',
		);
	});

	test("shows a single-name example when only one tool is pending", () => {
		expect(renderDeferredSection(["read"])).toBe(
			"These tools are available but their schemas are not loaded: read.\n" +
				'Use tool_search with query "select:<name>" (e.g. "select:read") to load tool schemas before calling them.',
		);
	});
});

describe("select loading", () => {
	test("activates exactly the requested deferred tools", async () => {
		const active = [TOOL_SEARCH_NAME, "read"];
		const { scope, updates } = toolApi(
			[
				metadata(TOOL_SEARCH_NAME, "Search tools."),
				metadata("read", "Read a file."),
				metadata("write_stdin", "Continue a command."),
				metadata("exec_command", "Run a shell command."),
			],
			active,
		);

		const result = await executeToolSearch(
			{ query: "select:write_stdin,exec_command" },
			scope("write_stdin", "exec_command"),
			() => ["write_stdin", "exec_command"],
		);

		expect(updates).toEqual([[TOOL_SEARCH_NAME, "read", "write_stdin", "exec_command"]]);
		expect(result.details).toMatchObject({
			version: 3,
			status: "loaded",
			input: {
				mode: "select",
				query: "select:write_stdin,exec_command",
				requested: ["write_stdin", "exec_command"],
				unknown: [],
				alreadyActive: [],
			},
			rankedMatches: [
				{ name: "write_stdin", score: 1 },
				{ name: "exec_command", score: 1 },
			],
			activation: {
				before: [TOOL_SEARCH_NAME, "read"],
				added: ["write_stdin", "exec_command"],
				after: [TOOL_SEARCH_NAME, "read", "write_stdin", "exec_command"],
			},
			counts: { matches: 2, added: 2 },
		});
		expect(result.content).toEqual([{ type: "text", text: "Loaded tools: write_stdin, exec_command." }]);
	});

	test("ignores the limit on the select path", async () => {
		const active = [TOOL_SEARCH_NAME];
		const { scope, updates } = toolApi(
			[metadata(TOOL_SEARCH_NAME, "Search tools."), metadata("read", "Read."), metadata("write_stdin", "Continue.")],
			active,
		);

		const result = await executeToolSearch(
			{ query: "select:read,write_stdin", limit: 1 },
			scope("read", "write_stdin"),
			() => ["read", "write_stdin"],
		);

		expect(updates).toEqual([[TOOL_SEARCH_NAME, "read", "write_stdin"]]);
		expect(result.details.activation.added).toEqual(["read", "write_stdin"]);
	});

	test("activates nothing when any requested name is unknown", async () => {
		const active = [TOOL_SEARCH_NAME];
		const { scope, updates } = toolApi(
			[
				metadata(TOOL_SEARCH_NAME, "Search tools."),
				metadata("read", "Read a file."),
				metadata("write_stdin", "Continue."),
			],
			active,
		);

		const result = await executeToolSearch({ query: "select:read,missing" }, scope("read", "write_stdin"), () => [
			"read",
			"write_stdin",
		]);

		expect(updates).toEqual([]);
		expect(result.details).toMatchObject({
			version: 3,
			status: "invalid_select",
			input: { mode: "select", requested: ["read", "missing"], unknown: ["missing"], alreadyActive: [] },
			rankedMatches: [],
			activation: { added: [], after: [TOOL_SEARCH_NAME] },
		});
		expect(result.content).toEqual([
			{ type: "text", text: "Unknown or non-deferred tools in select query: missing. No tools were activated." },
		]);
	});

	test("rejects a registered name outside the deferred list", async () => {
		const active = [TOOL_SEARCH_NAME];
		const { scope, updates } = toolApi(
			[
				metadata(TOOL_SEARCH_NAME, "Search tools."),
				metadata("read", "Read."),
				metadata("disabled_weather", "Weather."),
			],
			active,
		);

		const result = await executeToolSearch({ query: "select:disabled_weather" }, scope("disabled_weather"), () => [
			"read",
		]);

		expect(updates).toEqual([]);
		expect(result.details).toMatchObject({
			status: "invalid_select",
			input: { mode: "select", requested: ["disabled_weather"], unknown: ["disabled_weather"] },
		});
	});

	test("reports already-active names alongside the newly added ones", async () => {
		const active = [TOOL_SEARCH_NAME, "read"];
		const { scope, updates } = toolApi(
			[metadata(TOOL_SEARCH_NAME, "Search tools."), metadata("read", "Read."), metadata("write_stdin", "Continue.")],
			active,
		);

		const result = await executeToolSearch({ query: "select:read,write_stdin" }, scope("read", "write_stdin"), () => [
			"read",
			"write_stdin",
		]);

		expect(updates).toEqual([[TOOL_SEARCH_NAME, "read", "write_stdin"]]);
		expect(result.details).toMatchObject({
			status: "loaded",
			input: { mode: "select", requested: ["read", "write_stdin"], unknown: [], alreadyActive: ["read"] },
			activation: { added: ["write_stdin"] },
		});
		expect(result.content).toEqual([{ type: "text", text: "Loaded tools: write_stdin. Already active: read." }]);
	});

	test("does not reactivate only-active tools", async () => {
		const active = [TOOL_SEARCH_NAME, "read"];
		const { scope, updates } = toolApi(
			[metadata(TOOL_SEARCH_NAME, "Search tools."), metadata("read", "Read.")],
			active,
		);

		const result = await executeToolSearch({ query: "select:read" }, scope("read"), () => ["read"]);

		expect(updates).toEqual([]);
		expect(result.details).toMatchObject({
			status: "loaded",
			input: { mode: "select", requested: ["read"], unknown: [], alreadyActive: ["read"] },
			activation: { added: [] },
		});
		expect(result.content).toEqual([{ type: "text", text: "Tools already active: read." }]);
	});

	test("treats a bare select as invalid", async () => {
		const active = [TOOL_SEARCH_NAME];
		const { scope, updates } = toolApi([metadata(TOOL_SEARCH_NAME, "Search tools.")], active);

		const result = await executeToolSearch({ query: "select:" }, scope(), () => []);

		expect(updates).toEqual([]);
		expect(result.details).toMatchObject({
			status: "invalid_select",
			input: { mode: "select", requested: [], unknown: [], alreadyActive: [] },
		});
		expect(result.content).toEqual([{ type: "text", text: 'No tool names after "select:".' }]);
	});

	test("treats every name as unknown without a deferred list", async () => {
		const active = [TOOL_SEARCH_NAME];
		const { scope, updates } = toolApi(
			[metadata(TOOL_SEARCH_NAME, "Search tools."), metadata("read", "Read.")],
			active,
		);

		const result = await executeToolSearch({ query: "select:read" }, scope("read"));

		expect(updates).toEqual([]);
		expect(result.details).toMatchObject({
			status: "invalid_select",
			input: { mode: "select", requested: ["read"], unknown: ["read"] },
		});
	});
});

type HarnessEvent = { reason?: string; systemPromptOptions?: { sections?: Record<string, string> } };

function extensionHarness(active: string[] = [], tools: ToolMetadata[] = [], fs?: DeferredConfigFileSystem) {
	const handlers = new Map<string, (event: HarnessEvent, ctx: ExtensionCommandContext) => void>();
	const errors: string[] = [];
	const updates: string[][] = [];
	const commands = new Map<string, Omit<RegisteredCommand, "name" | "sourceInfo">>();
	let tool!: ReturnType<typeof createToolSearchTool>;
	const pi = {
		registerCommand(name: string, command: Omit<RegisteredCommand, "name" | "sourceInfo">) {
			commands.set(name, command);
		},
		registerTool(value: typeof tool) {
			tool = value;
		},
		getAllTools: () => tools,
		getActiveTools: () => [...active],
		setActiveTools(names: string[]) {
			active.splice(0, active.length, ...names);
			updates.push([...names]);
		},
		on(event: string, handler: (event: HarnessEvent, ctx: ExtensionCommandContext) => void) {
			handlers.set(event, handler);
		},
	} as unknown as ExtensionAPI;
	createToolSearchExtension(pi, configPath, fs);
	return {
		tool,
		commands,
		updates,
		events: [...handlers.keys()],
		errors,
		emit: (event: string, value: HarnessEvent = {}) =>
			handlers.get(event)!(value, {
				ui: { notify: (message: string) => errors.push(message) },
			} as unknown as ExtensionCommandContext),
	};
}

async function openTools(host: ReturnType<typeof extensionHarness>, mode = "tui") {
	initTheme("dark");
	let panel: Component | undefined;
	const errors: string[] = [];
	const ctx = {
		mode,
		ui: {
			notify(message: string) {
				errors.push(message);
			},
			custom: async (factory: Parameters<ExtensionCommandContext["ui"]["custom"]>[0]) => {
				panel = await factory(
					{ requestRender() {} } as never,
					{ fg: (_color: string, text: string) => text, bold: (text: string) => text } as never,
					{} as never,
					() => {},
				);
			},
		},
	} as unknown as ExtensionCommandContext;
	await host.commands.get("tools")!.handler("", ctx);
	return { panel: panel!, errors, text: () => Bun.stripANSI(panel!.render(100).join("\n")) };
}

function focusPanelTool(ui: Awaited<ReturnType<typeof openTools>>, name: string): void {
	const cursor = Bun.stripANSI(getSettingsListTheme().cursor);
	const visited = new Set<string>();
	while (true) {
		const selectedLine = ui
			.text()
			.split("\n")
			.find((line) => line.startsWith(cursor));
		if (!selectedLine) throw new Error("Panel has no visible selected row.");
		const selectedName = selectedLine.slice(cursor.length).trimStart().split(/\s+/)[0];
		if (selectedName === name) return;
		if (visited.has(selectedName)) throw new Error(`Tool ${name} was not found in the panel.`);
		visited.add(selectedName);
		ui.panel.handleInput!("\x1b[B");
	}
}

describe("#15 panel persistence", () => {
	test("panel coexists with retryable legacy cleanup and never overwrites a newer handwritten policy", async () => {
		const legacyPath = join(configDir, "xsettings.toml");
		const legacy = '[tools]\npi-tool-search.tools = ["weather"]\n[other]\nkeep = 7\n';
		writeFileSync(legacyPath, legacy);
		expect(() =>
			migrateDeferredTools(configPath, legacyPath, {
				read: deferredConfigFileSystem.read,
				write(path, source) {
					if (path === legacyPath) throw new Error("cleanup failed");
					writeFileSync(path, source);
				},
			}),
		).toThrow("Retry initialization");
		expect(readDeferredTools(configPath)).toEqual(["weather"]);
		expect(readFileSync(legacyPath, "utf8")).toBe(legacy);
		const source = '["tools"]\n"deferred" = [\n "weather", # keep weather note\n "unknown", # keep unregistered\n]\n';
		writeFileSync(configPath, source);
		const active = [TOOL_SEARCH_NAME, "weather"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, name)),
		);
		host.emit("session_start");
		expect(readFileSync(configPath, "utf8")).toBe(source);
		expect(parse(readFileSync(legacyPath, "utf8"))).toEqual({ other: { keep: 7 } });
		const ui = await openTools(host);
		focusPanelTool(ui, "weather");
		ui.panel.handleInput!("\r");
		ui.panel.handleInput!("\x1b[A");
		ui.panel.handleInput!("\r");
		expect(ui.errors).toEqual([]);
		expect(readDeferredTools(configPath)).toEqual(["unknown"]);
		expect(readFileSync(configPath, "utf8")).toBe(
			'["tools"]\n"deferred" = [\n  # keep weather note\n "unknown" # keep unregistered\n]\n',
		);
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
		expect(ui.text()).toContain("[x] direct");
	});
	test("panel rereads complex external edits and preserves byte comments while updating current policy", async () => {
		writeFileSync(configPath, "[tools]\ndeferred = []\n");
		const active = [TOOL_SEARCH_NAME, "weather", "wind"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, name)),
		);
		host.emit("session_start");
		const ui = await openTools(host);
		const prefix = '# external\r\n"tools" = { "deferred" = ';
		const suffix = ', other = """\n[tools]\ndeferred = ["decoy"]\n""" } # suffix';
		writeFileSync(
			configPath,
			prefix + "[\r\n  \"external\", # unregistered\r\n  'wind', # changed other tool\r\n]" + suffix,
		);
		focusPanelTool(ui, "weather");
		ui.panel.handleInput!("\r");
		ui.panel.handleInput!("\x1b[B");
		ui.panel.handleInput!("\r");
		expect(ui.errors).toEqual([]);
		expect(readFileSync(configPath, "utf8")).toBe(
			prefix + '[\r\n  "external", # unregistered\r\n  \'wind\', # changed other tool\r\n"weather"]' + suffix,
		);
		expect(active).toEqual([TOOL_SEARCH_NAME, "wind"]); // single-target toggle preserves other active tools
		expect(ui.text().match(/\[ \] deferred/g)).toHaveLength(2);
		const sections: Record<string, string> = {};
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(active).toEqual([TOOL_SEARCH_NAME]);
		expect(sections[DEFERRED_SECTION_KEY]).toContain("wind");
		const loaded = await host.tool.execute("load", { query: "select:wind" }, undefined, undefined, {} as never);
		expect(loaded.details.activation.added).toEqual(["wind"]);
	});

	test("panel rejects observed conflicts without committing UI/policy, then permits a repaired retry", async () => {
		const original = '[tools]\ndeferred = [\n # keep\n "unknown",\n]\n';
		const external = '[tools]\ndeferred = [\n # external\n "unknown", "wind",\n]\n';
		writeFileSync(configPath, original);
		let conflict = true;
		const active = [TOOL_SEARCH_NAME, "weather", "wind"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, name)),
			{
				read: deferredConfigFileSystem.read,
				write(path, source, expected) {
					if (conflict) writeFileSync(path, external);
					deferredConfigFileSystem.write(path, source, expected);
				},
			},
		);
		host.emit("session_start");
		const ui = await openTools(host);
		const chooseDeferred = () => {
			focusPanelTool(ui, "weather");
			ui.panel.handleInput!("\r");
			ui.panel.handleInput!("\x1b[B");
			ui.panel.handleInput!("\r");
		};
		chooseDeferred();
		expect(ui.errors.join(" ")).toContain("changed while saving");
		expect(readFileSync(configPath, "utf8")).toBe(external);
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather", "wind"]);
		expect(ui.text().match(/\[x\] direct/g)).toHaveLength(2);
		host.emit("before_agent_start", { systemPromptOptions: { sections: {} } });
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather", "wind"]);
		conflict = false;
		chooseDeferred();
		expect(readDeferredTools(configPath)).toEqual(["unknown", "wind", "weather"]);
		expect(active).toEqual([TOOL_SEARCH_NAME, "wind"]);
		host.emit("before_agent_start", { systemPromptOptions: { sections: {} } });
		expect(active).toEqual([TOOL_SEARCH_NAME]);
	});
	test("actual panel creates missing keys/tables without rewriting existing bytes", async () => {
		for (const [source, expected] of [
			[
				'# keep\r\n["tools"] # header\r\nother = 7\r\n[after]\r\nx = 1',
				'# keep\r\n["tools"] # header\r\ndeferred = ["weather"]\r\nother = 7\r\n[after]\r\nx = 1',
			],
			["[tools] # EOF", '[tools] # EOF\ndeferred = ["weather"]\n'],
			["[other]\nvalue = 7", '[other]\nvalue = 7\n[tools]\ndeferred = ["weather"]\n'],
			["tools.other = 7\n[after]\nx = 1\n", 'tools.other = 7\ntools.deferred = ["weather"]\n[after]\nx = 1\n'],
			["[tools.child]\nx = 1\n", 'tools.deferred = ["weather"]\n[tools.child]\nx = 1\n'],
			["tools = { other = 7 } # inline\n", 'tools = { other = 7 , deferred = ["weather"]} # inline\n'],
			["tools = {}", 'tools = {deferred = ["weather"]}'],
			["# empty\n", '# empty\n[tools]\ndeferred = ["weather"]\n'],
		]) {
			writeFileSync(configPath, source);
			const active = [TOOL_SEARCH_NAME, "weather"];
			const host = extensionHarness(
				active,
				active.map((name) => metadata(name, name)),
			);
			host.emit("session_start");
			const ui = await openTools(host);
			focusPanelTool(ui, "weather");
			ui.panel.handleInput!("\r");
			ui.panel.handleInput!("\x1b[B");
			ui.panel.handleInput!("\r");
			expect(ui.errors).toEqual([]);
			expect(readFileSync(configPath, "utf8")).toBe(expected);
			expect(active).toEqual([TOOL_SEARCH_NAME]);
			expect(ui.text()).toContain("[ ] deferred");
		}
	});
});

describe("persistent /tools panel", () => {
	for (const mode of ["print", "json", "rpc"]) {
		test(`non-TUI ${mode} reports an error without opening UI or writing`, async () => {
			const ui = await openTools(extensionHarness(), mode);
			expect(ui.errors).toEqual(["/tools requires TUI mode"]);
			expect(ui.panel).toBeUndefined();
			expect(existsSync(configPath)).toBe(false);
		});
	}

	test("search-loaded deferred persists across turns and reopening; explicit deferred unloads, direct restores", async () => {
		configure(["weather", "unknown"]);
		const active = [TOOL_SEARCH_NAME, "weather"];
		const tools = active.map((name) => metadata(name, name));
		const host = extensionHarness(active, tools);
		host.emit("session_start");
		await host.tool.execute("load", { query: "weather" }, undefined, undefined, {} as never);
		for (let turn = 0; turn < 3; turn++) {
			host.emit("before_agent_start", { systemPromptOptions: { sections: {} } });
			expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
		}
		const ui = await openTools(host);
		expect(ui.text()).toContain("[ ] deferred");
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
		const before = readFileSync(configPath, "utf8");
		focusPanelTool(ui, "weather");
		ui.panel.handleInput!("\r");
		ui.panel.handleInput!("\r"); // explicitly choose current deferred again
		expect(active).toEqual([TOOL_SEARCH_NAME]);
		expect(readFileSync(configPath, "utf8")).toBe(before);
		active.push("weather"); // another extension tries to restore it
		const sections: Record<string, string> = {};
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(active).toEqual([TOOL_SEARCH_NAME]);
		expect(sections[DEFERRED_SECTION_KEY]).toContain("weather");
		const loaded = await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
		expect(loaded.details.activation.added).toEqual(["weather"]);
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
		expect(sections[DEFERRED_SECTION_KEY]).toBeUndefined();
		const freshActive = [TOOL_SEARCH_NAME, "weather"];
		const fresh = extensionHarness(freshActive, tools);
		fresh.emit("session_start");
		expect(freshActive).toEqual([TOOL_SEARCH_NAME]);
		const freshUi = await openTools(fresh);
		focusPanelTool(freshUi, "weather");
		freshUi.panel.handleInput!("\r");
		freshUi.panel.handleInput!("\x1b[A"); // select direct
		freshUi.panel.handleInput!("\r");
		expect(freshActive).toEqual([TOOL_SEARCH_NAME, "weather"]);
		expect(readDeferredTools(configPath)).toEqual(["unknown"]);
		expect(freshUi.text()).toContain("[x] direct");
		const nextActive = [TOOL_SEARCH_NAME, "weather"];
		extensionHarness(nextActive, tools).emit("session_start");
		expect(nextActive).toEqual([TOOL_SEARCH_NAME, "weather"]);
	});

	test("opening invalid TOML or a failed parse during selection changes no active/UI policy", async () => {
		configure([]);
		const active = [TOOL_SEARCH_NAME, "weather"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, name)),
		);
		host.emit("session_start");
		const ui = await openTools(host);
		writeFileSync(configPath, '[tools]\ndeferred = ["broken"\n');
		const bad = await openTools(host);
		expect(bad.panel).toBeUndefined();
		expect(bad.errors.join(" ")).toContain("Cannot open /tools");
		focusPanelTool(ui, "weather");
		ui.panel.handleInput!("\r");
		ui.panel.handleInput!("\x1b[B");
		ui.panel.handleInput!("\r");
		expect(ui.errors.join(" ")).toContain("Cannot save /tools");
		expect(ui.text()).toContain("[x] direct");
		host.emit("before_agent_start", { systemPromptOptions: { sections: {} } });
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
		expect(readFileSync(configPath, "utf8")).toBe('[tools]\ndeferred = ["broken"\n');
	});

	test("each toggle rereads disk, preserving external names and updating the whole search policy", async () => {
		const active = [TOOL_SEARCH_NAME, "weather", "wind"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, name)),
		);
		host.emit("session_start");
		const ui = await openTools(host);
		writeFileSync(configPath, '[tools]\ndeferred = ["external", "wind"] # keep\n');
		focusPanelTool(ui, "weather");
		ui.panel.handleInput!("\r");
		ui.panel.handleInput!("\x1b[B");
		ui.panel.handleInput!("\r");
		expect(readFileSync(configPath, "utf8")).toBe('[tools]\ndeferred = ["external", "wind", "weather"] # keep\n');
		const sections: Record<string, string> = {};
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(active).toEqual([TOOL_SEARCH_NAME]);
		expect(sections[DEFERRED_SECTION_KEY]).toContain("wind");
		const loaded = await host.tool.execute("load", { query: "select:wind" }, undefined, undefined, {} as never);
		expect(loaded.details.activation.added).toEqual(["wind"]);
		expect(ui.text().match(/\[ \] deferred/g)).toHaveLength(2);
	});
	test("ordinary search and select use the same latest persisted deferred policy", async () => {
		const active = [TOOL_SEARCH_NAME, "weather", "wind"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, "forecast")),
		);
		host.emit("session_start");
		const ui = await openTools(host);
		focusPanelTool(ui, "weather");
		ui.panel.handleInput!("\r");
		ui.panel.handleInput!("\x1b[B");
		ui.panel.handleInput!("\r");
		active.splice(active.indexOf("wind"), 1); // another owner made this non-deferred tool inactive
		const loaded = await host.tool.execute("load", { query: "forecast" }, undefined, undefined, {} as never);
		expect(loaded.details.activation.added).toEqual(["weather"]);
		const notDeferred = await host.tool.execute("load", { query: "select:wind" }, undefined, undefined, {} as never);
		expect(notDeferred.details.status).toBe("invalid_select");
		host.emit("before_agent_start", { systemPromptOptions: { sections: {} } });
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
	});
	test("failed atomic save rolls back the actual SettingsList value, policy and active tools", async () => {
		const source = '[tools]\ndeferred = ["unknown"] # keep\n';
		writeFileSync(configPath, source);
		const active = [TOOL_SEARCH_NAME, "weather"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, name)),
			{
				read: (path) => readFileSync(path, "utf8"),
				write() {
					throw new Error("disk full");
				},
			},
		);
		host.emit("session_start");
		const ui = await openTools(host);
		focusPanelTool(ui, "weather");
		ui.panel.handleInput!("\r");
		ui.panel.handleInput!("\x1b[B");
		ui.panel.handleInput!("\r");
		expect(ui.errors.join(" ")).toContain("disk full");
		expect(ui.text()).toContain("[x] direct");
		expect(ui.text()).not.toContain("[ ] deferred");
		expect(readFileSync(configPath, "utf8")).toBe(source);
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
		active.splice(active.indexOf("weather"), 1);
		const rejected = await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
		expect(rejected.details.status).toBe("invalid_select");
	});
	test("editable scope is sorted and excludes self, native exposures and initially inactive tools", async () => {
		configure([TOOL_SEARCH_NAME, "outside", "native"]);
		const active = [TOOL_SEARCH_NAME, "zebra", "alpha", "native", "code", "hidden", "model"];
		const tools = [
			metadata(TOOL_SEARCH_NAME, "search"),
			metadata("outside", "outside"),
			metadata("zebra", "zebra"),
			metadata("alpha", "alpha"),
			{ ...metadata("native", "native"), exposure: "deferred" },
			{ ...metadata("code", "code"), exposure: "codemode" },
			{ ...metadata("hidden", "hidden"), exposure: "hidden" },
			{ ...metadata("model", "model"), exposure: "model-only" },
		];
		const host = extensionHarness(active, tools);
		host.emit("session_start");
		const ui = await openTools(host);
		expect(ui.text().indexOf("alpha")).toBeLessThan(ui.text().indexOf("zebra"));
		for (const name of [TOOL_SEARCH_NAME, "outside", "native", "code", "hidden", "model"])
			expect(ui.text()).toMatch(new RegExp(`${name}\\s+.*readonly`));
		active.push("outside");
		host.emit("before_agent_start", { systemPromptOptions: { sections: {} } });
		expect(active).toContain(TOOL_SEARCH_NAME);
		expect(active).toContain("native");
		expect(active).toContain("outside");
		active.splice(active.indexOf("outside"), 1);
		const rejected = await host.tool.execute("load", { query: "select:outside" }, undefined, undefined, {} as never);
		expect(rejected.details.status).toBe("invalid_select");
		const search = await host.tool.execute("load", { query: "outside" }, undefined, undefined, {} as never);
		expect(search.details.activation.added).toEqual([]);
	});
	test("TUI user can defer a tool immediately and select loads the new persisted policy", async () => {
		const active = [TOOL_SEARCH_NAME, "weather"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, name)),
		);
		host.emit("session_start");
		const ui = await openTools(host);
		expect(ui.text()).toContain("[x] direct");
		focusPanelTool(ui, "weather");
		ui.panel.handleInput!("\r"); // choose weather policy
		ui.panel.handleInput!("[B"); // deferred
		ui.panel.handleInput!("\r");
		expect(ui.errors).toEqual([]);
		expect(readDeferredTools(configPath)).toEqual(["weather"]);
		expect(active).toEqual([TOOL_SEARCH_NAME]);
		expect(ui.text()).toContain("[ ] deferred");
		const result = await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
		expect(result.details.activation.added).toEqual(["weather"]);
	});
});

function choosePanelPolicy(ui: Awaited<ReturnType<typeof openTools>>, name: string, deferred: boolean): void {
	focusPanelTool(ui, name);
	ui.panel.handleInput!("\r");
	ui.panel.handleInput!(deferred ? "\x1b[B" : "\x1b[A");
	ui.panel.handleInput!("\r");
}

describe("long-session policy consistency (#17)", () => {
	test("search to direct to deferred revokes the load exemption and can search again", async () => {
		configure(["weather", "outside", "native", TOOL_SEARCH_NAME]);
		const active = [TOOL_SEARCH_NAME, "weather", "wind", "native"];
		const tools = [
			...active.filter((name) => name !== "native").map((name) => metadata(name, "forecast")),
			{ ...metadata("native", "forecast"), exposure: "deferred" },
			metadata("outside", "forecast"),
		];
		const host = extensionHarness(active, tools);
		host.emit("session_start");
		await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
		const ui = await openTools(host);
		choosePanelPolicy(ui, "weather", false);
		expect(active).toContain("weather");
		expect(readDeferredTools(configPath)).toEqual(["outside", "native", TOOL_SEARCH_NAME]);
		choosePanelPolicy(ui, "weather", true);
		expect(ui.errors).toEqual([]);
		expect(active).toEqual([TOOL_SEARCH_NAME, "native", "wind"]);
		active.splice(active.indexOf("wind"), 1); // unrelated owner deactivates a direct tool
		active.push("weather", "outside"); // unrelated owner reactivates unloaded deferred and scope-excluded names
		const sections: Record<string, string> = {};
		for (let turn = 0; turn < 3; turn++) {
			host.emit("before_agent_start", { systemPromptOptions: { sections } });
			expect(active).toEqual([TOOL_SEARCH_NAME, "native", "outside"]);
			expect(sections[DEFERRED_SECTION_KEY]).toContain("weather");
			expect(sections[DEFERRED_SECTION_KEY]).not.toContain("outside");
			expect(sections[DEFERRED_SECTION_KEY]).not.toContain("native");
			active.push("weather");
		}
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		const loaded = await host.tool.execute("load", { query: "forecast" }, undefined, undefined, {} as never);
		expect(loaded.details.activation.added).toEqual(["weather"]);
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(active).toEqual([TOOL_SEARCH_NAME, "native", "outside", "weather"]);
		expect(sections[DEFERRED_SECTION_KEY]).toBeUndefined();
	});

	test("reopening refreshes disk, registry and active without unloading search-loaded tools; read errors retain the snapshot", async () => {
		configure(["weather"]);
		const active = [TOOL_SEARCH_NAME, "weather", "wind"];
		const tools = active.map((name) => metadata(name, "forecast"));
		const host = extensionHarness(active, tools);
		host.emit("session_start");
		await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
		const first = await openTools(host);
		expect(first.text()).toMatch(/weather\s+\[ \] deferred/);
		expect(first.text()).toMatch(/wind\s+\[x\] direct/);
		tools.push(metadata("outside", "forecast")); // newly registered, not assigned
		active.push("outside");
		configure(["weather", "wind", "outside", "unregistered", TOOL_SEARCH_NAME]);
		const reopened = await openTools(host);
		expect(reopened.errors).toEqual([]);
		expect(reopened.text()).toMatch(/wind\s+\[ \] deferred/);
		expect(reopened.text()).toMatch(/outside\s+active \(readonly\)/);
		expect(active).toEqual([TOOL_SEARCH_NAME, "wind", "weather", "outside"]);
		const sections: Record<string, string> = {};
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather", "outside"]);
		expect(sections[DEFERRED_SECTION_KEY]).toContain("wind");
		expect(sections[DEFERRED_SECTION_KEY]).not.toContain("weather");
		expect(sections[DEFERRED_SECTION_KEY]).not.toContain("outside");
		expect(sections[DEFERRED_SECTION_KEY]).not.toContain("unregistered");
		const latest = await openTools(host);
		expect(latest.text()).toMatch(/outside\s+active \(readonly\)/);
		active.splice(active.indexOf("outside"), 1);
		const inactive = await openTools(host);
		expect(inactive.text()).toMatch(/outside\s+inactive \(readonly\)/);
		writeFileSync(configPath, "[tools]\ndeferred = [broken\n");
		const failed = await openTools(host);
		expect(failed.panel).toBeUndefined();
		expect(failed.errors.join(" ")).toContain("Cannot open /tools");
		active.push("wind", "outside");
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather", "outside"]);
		expect(sections[DEFERRED_SECTION_KEY]).toContain("wind");
		const loaded = await host.tool.execute("load", { query: "select:wind" }, undefined, undefined, {} as never);
		expect(loaded.details.activation.added).toEqual(["wind"]);
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(sections[DEFERRED_SECTION_KEY]).toBeUndefined();
		configure(["wind", "outside", "unregistered"]);
		const repaired = await openTools(host);
		expect(repaired.errors).toEqual([]);
		expect(repaired.text()).toMatch(/weather\s+\[x\] direct/);
		expect(repaired.text()).toMatch(/wind\s+\[ \] deferred/);
		expect(active).toContain("wind");
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(sections[DEFERRED_SECTION_KEY]).toBeUndefined();
	});

	for (const reason of ["new", "resume", "fork"]) {
		test(`${reason} event resets loads but neither recaptures outsiders nor restores inactive direct tools`, async () => {
			configure(["weather", "wind", "outside"]);
			const active = [TOOL_SEARCH_NAME, "weather", "wind"];
			const host = extensionHarness(
				active,
				[...active, "outside"].map((name) => metadata(name, "forecast")),
			);
			host.emit("session_start", { reason: "startup" });
			await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
			active.push("outside");
			configure(["weather", "outside"]); // wind is now direct, but not active
			host.emit("session_start", { reason });
			expect(active).toEqual([TOOL_SEARCH_NAME, "outside"]);
			const ui = await openTools(host);
			expect(ui.text()).toMatch(/outside\s+active \(readonly\)/);
			expect(ui.text()).toMatch(/wind\s+\[x\] direct/);
			const rejected = await host.tool.execute("load", { query: "select:wind" }, undefined, undefined, {} as never);
			expect(rejected.details.status).toBe("invalid_select");
			const loaded = await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
			expect(loaded.details.activation.added).toEqual(["weather"]);
		});
	}

	test("an initially empty scope stays empty when another owner later activates a registered tool", async () => {
		configure(["outside"]);
		const active = [TOOL_SEARCH_NAME];
		const host = extensionHarness(active, [metadata(TOOL_SEARCH_NAME, "search"), metadata("outside", "forecast")]);
		host.emit("session_start", { reason: "startup" });
		active.push("outside");
		host.emit("session_start", { reason: "new" });
		expect(active).toEqual([TOOL_SEARCH_NAME, "outside"]);
		const ui = await openTools(host);
		expect(ui.text()).toMatch(/outside\s+active \(readonly\)/);
		const sections: Record<string, string> = {};
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(sections[DEFERRED_SECTION_KEY]).toBeUndefined();
		const loaded = await host.tool.execute("load", { query: "select:outside" }, undefined, undefined, {} as never);
		expect(loaded.details.status).toBe("invalid_select");
	});
	test("filesystem read failures on reopen preserve valid policy and search-loaded tools", async () => {
		configure(["weather", "wind"]);
		const active = [TOOL_SEARCH_NAME, "weather", "wind"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, "forecast")),
		);
		host.emit("session_start");
		await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
		rmSync(configPath);
		mkdirSync(configPath); // real EISDIR, not a parse error or missing-file empty policy
		const failed = await openTools(host);
		expect(failed.panel).toBeUndefined();
		expect(failed.errors.join(" ")).toContain("Cannot open /tools");
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
		active.push("wind");
		const sections: Record<string, string> = {};
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
		expect(sections[DEFERRED_SECTION_KEY]).toContain("wind");
		rmSync(configPath, { recursive: true });
		configure(["weather", "wind"]);
		const repaired = await openTools(host);
		expect(repaired.errors).toEqual([]);
		expect(repaired.text().match(/\[ \] deferred/g)).toHaveLength(2);
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
	});

	test("session initialization rereads policy and read errors preserve valid policy and loaded state", async () => {
		configure(["weather"]);
		const active = [TOOL_SEARCH_NAME, "weather", "wind"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, "forecast")),
		);
		host.emit("session_start", { reason: "startup" });
		await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
		const before = [...active];
		writeFileSync(configPath, "[tools]\ndeferred = [broken\n");
		host.emit("session_start", { reason: "new" });
		expect(host.errors.join(" ")).toContain("Cannot initialize Tool Search");
		expect(active).toEqual(before);
		const sections: Record<string, string> = {};
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(active).toEqual(before);
		expect(sections[DEFERRED_SECTION_KEY]).toBeUndefined();
		configure(["weather", "wind", "unknown"]);
		host.emit("session_start", { reason: "new" });
		expect(active).toEqual([TOOL_SEARCH_NAME]);
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(sections[DEFERRED_SECTION_KEY]).toContain("weather");
		expect(sections[DEFERRED_SECTION_KEY]).toContain("wind");
		expect(sections[DEFERRED_SECTION_KEY]).not.toContain("unknown");
		const loaded = await host.tool.execute("load", { query: "select:wind" }, undefined, undefined, {} as never);
		expect(loaded.details.activation.added).toEqual(["wind"]);
	});
	test("new session resets search loads without rebuilding scope from the clipped active set", async () => {
		configure(["weather", "wind", "outside"]);
		const active = [TOOL_SEARCH_NAME, "weather", "wind"];
		const tools = [...active, "outside"].map((name) => metadata(name, "forecast"));
		const host = extensionHarness(active, tools);
		host.emit("session_start", { reason: "startup" });
		expect(active).toEqual([TOOL_SEARCH_NAME]);
		await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
		expect(active).toEqual([TOOL_SEARCH_NAME, "weather"]);
		host.emit("session_start", { reason: "new" });
		expect(active).toEqual([TOOL_SEARCH_NAME]);
		const ui = await openTools(host);
		expect(ui.text()).toMatch(/wind\s+\[ \] deferred/);
		expect(ui.text()).toMatch(/outside\s+.*readonly/);
		const sections: Record<string, string> = {};
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(sections[DEFERRED_SECTION_KEY]).toContain("wind");
		expect(sections[DEFERRED_SECTION_KEY]).not.toContain("outside");
		const loaded = await host.tool.execute("load", { query: "select:wind" }, undefined, undefined, {} as never);
		expect(loaded.details.activation.added).toEqual(["wind"]);
		host.emit("session_start", { reason: "new" });
		expect(active).toEqual([TOOL_SEARCH_NAME]);
		const again = await host.tool.execute("load", { query: "forecast" }, undefined, undefined, {} as never);
		expect(again.details.activation.added).toEqual(["weather", "wind"]);
	});
});

describe("/tools registered discovery and readonly boundaries (#16)", () => {
	test("readonly reasons use host exposure, never guess disabled or strict selection from inactive", async () => {
		configure(["native", "code", "outside", "missing", TOOL_SEARCH_NAME]);
		const active = [TOOL_SEARCH_NAME, "alpha", "native", "code", "hidden", "model"];
		const tools = [
			metadata("alpha", "editable"),
			{ ...metadata("code", "code"), exposure: "codemode" },
			{ ...metadata("hidden", "hidden"), exposure: "hidden" },
			{ ...metadata("model", "model"), exposure: "model-only" },
			{ ...metadata("native", "native"), exposure: "deferred" },
			metadata("outside", "not selected"),
			metadata(TOOL_SEARCH_NAME, "search"),
		];
		const host = extensionHarness(active, tools, {
			read: deferredConfigFileSystem.read,
			write() {
				throw new Error("readonly actions must never write");
			},
		});
		host.emit("session_start");
		const updatesBeforeInput = [...host.updates];
		const ui = await openTools(host);
		const before = readFileSync(configPath, "utf8");
		ui.panel.handleInput!("\x1b[B"); // code
		expect(ui.text()).toContain("Host exposure: codemode");
		expect(ui.text()).toMatch(/code\s+host codemode · active \(readonly\)/);
		expect(ui.text()).toMatch(/native\s+host deferred · active \(readonly\)/);
		for (const reason of [
			"Host exposure: codemode",
			"Host exposure: hidden",
			"Host exposure: model-only",
			"Host exposure: deferred",
		]) {
			expect(ui.text()).toContain(reason);
			for (const key of ["\r", " "]) ui.panel.handleInput!(key);
			ui.panel.handleInput!("\x1b[B");
		}
		expect(ui.text()).toContain("Outside current assigned scope.");
		expect(ui.text()).not.toMatch(/disabled|strict selection|MCP/);
		expect(ui.text()).toMatch(/outside\s+inactive \(readonly\)/);
		ui.panel.handleInput!("\r");
		ui.panel.handleInput!("\x1b[B"); // self
		expect(ui.text()).toContain("Tool Search stays available");
		ui.panel.handleInput!(" ");
		expect(readFileSync(configPath, "utf8")).toBe(before);
		expect(active).toEqual([TOOL_SEARCH_NAME, "alpha", "native", "code", "hidden", "model"]);
		expect(host.updates).toEqual(updatesBeforeInput);
		const sections: Record<string, string> = {};
		host.emit("before_agent_start", { systemPromptOptions: { sections } });
		expect(sections[DEFERRED_SECTION_KEY]).toBeUndefined();
		for (const query of ["select:native,code,outside", "native code outside"]) {
			const result = await host.tool.execute("load", { query }, undefined, undefined, {} as never);
			expect(result.details.activation.added).toEqual([]);
			expect(result.details.counts.registered).toBe(1);
		}
		expect(ui.errors).toEqual([]);
	});
	test("all registered tools are sorted; readonly input leaves disk and active unchanged", async () => {
		configure(["unknown", "outside"]);
		const active = [TOOL_SEARCH_NAME, "zebra", "alpha"];
		const host = extensionHarness(active, [
			metadata("zebra", "zebra"),
			metadata(TOOL_SEARCH_NAME, "search"),
			metadata("outside", "outside"),
			metadata("alpha", "alpha"),
		]);
		host.emit("session_start");
		const ui = await openTools(host);
		const text = ui.text();
		expect(text.indexOf("alpha")).toBeLessThan(text.indexOf("outside"));
		expect(text.indexOf("outside")).toBeLessThan(text.indexOf(TOOL_SEARCH_NAME));
		expect(text.indexOf(TOOL_SEARCH_NAME)).toBeLessThan(text.indexOf("zebra"));
		expect(text).toMatch(/outside\s+.*inactive.*readonly/);
		expect(text).not.toMatch(/outside\s+\[ \] deferred/);
		const before = readFileSync(configPath, "utf8");
		ui.panel.handleInput!("\x1b[B"); // outside
		expect(ui.text()).toContain("Outside current assigned scope");
		for (const key of ["\r", " ", "\r"]) ui.panel.handleInput!(key);
		expect(readFileSync(configPath, "utf8")).toBe(before);
		expect(active).toEqual([TOOL_SEARCH_NAME, "zebra", "alpha"]);
		ui.panel.handleInput!("\x1b[B"); // tool_search
		for (const key of ["\r", " "]) ui.panel.handleInput!(key);
		expect(readFileSync(configPath, "utf8")).toBe(before);
		expect(active).toContain(TOOL_SEARCH_NAME);
		ui.panel.handleInput!("\x1b[B"); // zebra, editable
		ui.panel.handleInput!("\r");
		ui.panel.handleInput!("\x1b[B");
		ui.panel.handleInput!("\r");
		expect(readDeferredTools(configPath)).toEqual(["unknown", "outside", "zebra"]);
		expect(active).toEqual([TOOL_SEARCH_NAME, "alpha"]);
		expect(ui.text()).toMatch(/outside\s+.*inactive.*readonly/);
		const loaded = await host.tool.execute("load", { query: "select:zebra" }, undefined, undefined, {} as never);
		expect(loaded.details.activation.added).toEqual(["zebra"]);
		const rejected = await host.tool.execute("load", { query: "select:outside" }, undefined, undefined, {} as never);
		expect(rejected.details.status).toBe("invalid_select");
		expect(ui.errors).toEqual([]);
	});
});

describe("single-extension lifecycle", () => {
	test("stale xsettings publications cannot replace the actual deferred snapshot", async () => {
		// Install a residual registration in the global Symbol.for registry before init.
		const registry = ensureXSettingsRegistry();
		Reflect.set(globalThis, SETTINGS_KEY, registry);
		const published: unknown[] = [];
		const unregister = registry.register({
			namespace: "pi-tool-search",
			label: "Stale tool search",
			definitions: [],
			onValues: (values) => {
				published.push(values);
			},
		});
		configure(["weather"]);
		const active = [TOOL_SEARCH_NAME, "weather", "issues"];
		const host = extensionHarness(
			active,
			active.map((name) => metadata(name, name)),
		);
		try {
			await registry.publish("pi-tool-search", { tools: ["issues"] });
			expect(published).toEqual([{ tools: ["issues"] }]);
			host.emit("session_start");
			expect(host.updates).toEqual([[TOOL_SEARCH_NAME, "issues"]]);
			await registry.publish("pi-tool-search", { tools: [] });
			active.push("weather");
			host.emit("before_agent_start", { systemPromptOptions: {} });
			expect(host.updates).toEqual([
				[TOOL_SEARCH_NAME, "issues"],
				[TOOL_SEARCH_NAME, "issues"],
			]);
			const loaded = await host.tool.execute("load", { query: "select:weather" }, undefined, undefined, {} as never);
			expect(loaded.details.activation.added).toEqual(["weather"]);
		} finally {
			unregister();
		}
	});
	test("TOML alone defers and select activation survives successive turns", async () => {
		configure(["weather", "other", "unknown"]);
		expect(Reflect.has(globalThis, SETTINGS_KEY)).toBe(false);
		const active = [TOOL_SEARCH_NAME, "read", "weather", "other"];
		const tools = [TOOL_SEARCH_NAME, "read", "weather", "other"].map((name) => metadata(name, name));
		const host = extensionHarness(active, tools);
		host.emit("session_start");
		expect(active).toEqual([TOOL_SEARCH_NAME, "read"]);
		const result = await host.tool.execute("call", { query: "select:weather" }, undefined, undefined, {} as never);
		expect(result.details.activation.added).toEqual(["weather"]);
		for (let turn = 0; turn < 3; turn++) {
			active.push("other");
			const sections: Record<string, string> = {};
			host.emit("before_agent_start", { systemPromptOptions: { sections } });
			expect(active).toEqual([TOOL_SEARCH_NAME, "read", "weather"]);
			expect(sections[DEFERRED_SECTION_KEY]).toContain("other");
			expect(sections[DEFERRED_SECTION_KEY]).not.toContain("weather");
		}
		expect(Reflect.has(globalThis, SETTINGS_KEY)).toBe(false);
	});

	test("call and result previews render without an extension host", async () => {
		configureTuiAppearance({ iconPack: "emoji" });
		configure(["weather"]);
		const host = extensionHarness(
			[TOOL_SEARCH_NAME, "weather"],
			[metadata(TOOL_SEARCH_NAME, "Search"), metadata("weather", "Forecast")],
		);
		host.emit("session_start");
		const context = {
			args: { query: "select:weather" },
			executionStarted: true,
			invalidate() {},
			isError: false,
			lastComponent: undefined,
		};
		const call = host.tool.renderCall!({ query: "select:weather" }, presentationTheme, {
			...context,
			executionStarted: false,
		} as never);
		expect(Bun.stripANSI(call.render(80).join("\n"))).toContain("select:weather");
		const result = await host.tool.execute("preview", { query: "select:weather" }, undefined, undefined, {} as never);
		const rendered = Bun.stripANSI(
			renderToolSearchResult(result, presentationTheme, context, true).render(80).join("\n"),
		);
		expect(rendered).toContain("Loaded tools");
		expect(rendered).toContain("weather");
	});
});

describe("dynamic loading", () => {
	test("migrates before initialization and uses the latest persisted policy on repeated sessions", async () => {
		const legacy = join(configDir, "xsettings.toml");
		const names = Array.from({ length: 25 }, (_, index) => `tool_${index}`);
		writeFileSync(legacy, `[tools]\npi-tool-search.tools = ${JSON.stringify(names)}\npi.defaultTools = ["direct"]\n`);
		const active = [TOOL_SEARCH_NAME, "direct", ...names];
		const tools = [
			metadata(TOOL_SEARCH_NAME, "Search"),
			metadata("direct", "Direct"),
			...names.map((name) => metadata(name, "Deferred")),
		];
		const host = extensionHarness(active, tools);
		expect(new Set(readDeferredTools(configPath))).toEqual(new Set(names));
		expect(parse(readFileSync(legacy, "utf8"))).toEqual({});
		host.emit("session_start", { reason: "startup" });
		expect(active).toEqual([TOOL_SEARCH_NAME, "direct"]);
		configure(["direct"]);
		const migratedLegacy = readFileSync(legacy, "utf8");
		for (let session = 0; session < 2; session++) {
			active.splice(0, active.length, TOOL_SEARCH_NAME, "direct", ...names);
			host.emit("session_start", { reason: "new" });
			expect(active).toEqual([TOOL_SEARCH_NAME, ...names]);
		}
		expect(readDeferredTools(configPath)).toEqual(["direct"]);
		expect(readFileSync(legacy, "utf8")).toBe(migratedLegacy);
	});

	test("registers tool_search as a normal Pi tool", async () => {
		expect(toolSearchExtension.length).toBe(1);
		const host = extensionHarness();
		expect(host.tool).toMatchObject({ name: TOOL_SEARCH_NAME });
	});

	test("owns deferred selection lifecycle without another hierarchy provider", () => {
		const host = extensionHarness();
		expect(host.events).toEqual(["session_start", "before_agent_start", "session_shutdown"]);
	});

	test("defers only configured active tools without registering xsettings options", async () => {
		const active = [TOOL_SEARCH_NAME, "deferred_weather", "direct_issues"];
		const tools = [
			metadata(TOOL_SEARCH_NAME, "Search tools."),
			metadata("deferred_weather", "Weather data."),
			metadata("direct_issues", "Issue data."),
			metadata("disabled_weather", "Disabled weather data."),
		];
		configure(["deferred_weather", "disabled_weather"]);
		const host = extensionHarness(active, tools);
		// A new session reads the current file rather than the factory snapshot.
		configure(["direct_issues", "disabled_weather"]);
		host.emit("session_start");

		expect(active).toEqual([TOOL_SEARCH_NAME, "deferred_weather"]);
	});

	test("excludes active tools and activates matches additively", async () => {
		const active = [TOOL_SEARCH_NAME, "read", "weather_lookup"];
		const { scope, updates } = toolApi(
			[
				metadata(TOOL_SEARCH_NAME, "Search tools."),
				metadata("read", "Read a file."),
				metadata("weather_lookup", "Look up weather."),
				metadata("weather_history", "Read historical weather."),
				metadata("issue_search", "Search issues."),
			],
			active,
		);
		const tool = createToolSearchTool(scope("weather_history", "issue_search"));

		const result = await tool.execute("call", { query: "weather", limit: 8 }, undefined, undefined, {} as never);

		expect(updates).toEqual([[TOOL_SEARCH_NAME, "read", "weather_lookup", "weather_history"]]);
		expect(result.details).toMatchObject({
			version: 3,
			tool: "tool_search",
			status: "loaded",
			input: { query: "weather", normalizedQuery: "weather", limit: 8 },
			rankedMatches: [{ name: "weather_history" }],
			activation: {
				before: [TOOL_SEARCH_NAME, "read", "weather_lookup"],
				added: ["weather_history"],
				after: [TOOL_SEARCH_NAME, "read", "weather_lookup", "weather_history"],
			},
			counts: { registered: 5, searchable: 2, matches: 1, added: 1 },
		});
		expect(result.details.timing.durationMs).toBeGreaterThanOrEqual(0);
		expect(JSON.parse(JSON.stringify(result.details))).toEqual(result.details);
	});

	test("loads matching tools from the assigned inactive scope", async () => {
		const active = [TOOL_SEARCH_NAME];
		const { scope, updates } = toolApi(
			[
				metadata(TOOL_SEARCH_NAME, "Search tools."),
				metadata("exec_command", "Run a shell command."),
				metadata("write_stdin", "Continue a running command."),
			],
			active,
		);

		const result = await createToolSearchTool(scope("exec_command", "write_stdin")).execute(
			"call",
			{ query: "shell command", limit: 8 },
			undefined,
			undefined,
			{} as never,
		);

		expect(updates).toEqual([[TOOL_SEARCH_NAME, "exec_command", "write_stdin"]]);
		expect(result.details.activation.added).toEqual(["exec_command", "write_stdin"]);
	});

	test("does not change the active set when no inactive tool matches", async () => {
		const active = [TOOL_SEARCH_NAME, "read"];
		const { scope, updates } = toolApi(
			[metadata(TOOL_SEARCH_NAME, "Search tools."), metadata("read", "Read a file.")],
			active,
		);
		const tool = createToolSearchTool(scope());

		const result = await tool.execute("call", { query: "weather", limit: 8 }, undefined, undefined, {} as never);

		expect(updates).toEqual([]);
		expect(result.details).toMatchObject({
			version: 3,
			tool: "tool_search",
			status: "no_match",
			input: { query: "weather", normalizedQuery: "weather", limit: 8 },
			rankedMatches: [],
			activation: {
				before: [TOOL_SEARCH_NAME, "read"],
				added: [],
				after: [TOOL_SEARCH_NAME, "read"],
			},
			counts: { registered: 2, searchable: 0, matches: 0, added: 0 },
		});
	});

	test("caps activation at eight matches", async () => {
		const active = [TOOL_SEARCH_NAME];
		const tools = Array.from({ length: 12 }, (_, index) => metadata(`weather_${index}`, "Weather data."));
		const { scope, updates } = toolApi([metadata(TOOL_SEARCH_NAME, "Search tools."), ...tools], active);
		const tool = createToolSearchTool(scope(...tools.map((tool) => tool.name)));

		await tool.execute("call", { query: "weather", limit: 20 }, undefined, undefined, {} as never);

		expect(updates[0]).toHaveLength(9);
		expect(updates[0]?.[0]).toBe(TOOL_SEARCH_NAME);
	});

	test("the limit bounds activation without expanding a hidden group", async () => {
		const names = Array.from({ length: 10 }, (_, index) => `suite_${index}`);
		const { scope, updates } = toolApi(
			[metadata(TOOL_SEARCH_NAME, "Search tools."), ...names.map((name) => metadata(name, "Suite capability."))],
			[TOOL_SEARCH_NAME],
		);

		const result = await createToolSearchTool(scope(...names)).execute(
			"call",
			{ query: "suite capability", limit: 1 },
			undefined,
			undefined,
			{} as never,
		);

		expect(updates).toHaveLength(1);
		expect(updates[0]).toHaveLength(2);
		expect(result.details.activation.added).toHaveLength(1);
	});

	test("never searches registered tools outside its assigned deferred scope", async () => {
		const active = [TOOL_SEARCH_NAME];
		const { scope, updates } = toolApi(
			[
				metadata(TOOL_SEARCH_NAME, "Search tools."),
				metadata("deferred_weather", "Weather data."),
				metadata("disabled_weather", "Weather data."),
			],
			active,
		);

		const result = await createToolSearchTool(scope("deferred_weather")).execute(
			"call",
			{ query: "weather", limit: 8 },
			undefined,
			undefined,
			{} as never,
		);

		expect(updates).toEqual([[TOOL_SEARCH_NAME, "deferred_weather"]]);
		expect(result.details.rankedMatches.map((match) => match.name)).toEqual(["deferred_weather"]);
	});

	test("missing persisted details use the configured search marker", () => {
		configureTuiAppearance({ iconPack: "emoji" });
		const component = renderToolSearchResult(
			{ content: [{ type: "text", text: "search failed" }], details: undefined as never },
			presentationTheme,
			{
				args: { query: "weather" },
				executionStarted: true,
				invalidate() {},
				isError: true,
				lastComponent: undefined,
			},
			false,
		);
		expect(Bun.stripANSI(component.render(80).join("\n"))).toBe(`${icon("search")} Tool search failed · weather ›`);
	});

	test("malformed nested search details fall back without throwing", () => {
		const component = renderToolSearchResult(
			{
				content: [{ type: "text", text: "search failed" }],
				details: {
					version: 2,
					tool: "tool_search",
					status: "loaded",
					input: { query: "weather" },
					rankedMatches: [{ name: "weather", description: "Weather", score: 1 }],
					activation: {},
					counts: { matches: 1 },
					timing: { durationMs: 1 },
				} as never,
			},
			presentationTheme,
			{
				args: { query: "weather" },
				executionStarted: true,
				invalidate() {},
				isError: true,
				lastComponent: undefined,
			},
			false,
		);
		expect(Bun.stripANSI(component.render(80).join("\n"))).toBe(`${icon("search")} Tool search failed · weather ›`);
	});

	test("renders a valid persisted v2 result through the back-compat guard", () => {
		const component = renderToolSearchResult(
			{
				content: [{ type: "text", text: "Loaded tools: weather." }],
				details: {
					version: 2,
					tool: "tool_search",
					status: "loaded",
					input: { query: "weather", normalizedQuery: "weather", limit: 8 },
					rankedMatches: [{ name: "weather", description: "Weather data.", score: 1 }],
					activation: { before: [TOOL_SEARCH_NAME], added: ["weather"], after: [TOOL_SEARCH_NAME, "weather"] },
					counts: { registered: 2, searchable: 1, matches: 1, added: 1 },
					timing: { durationMs: 5 },
				} as never,
			},
			presentationTheme,
			{
				args: { query: "weather" },
				executionStarted: true,
				invalidate() {},
				isError: false,
				lastComponent: undefined,
			},
			false,
		);
		const rendered = Bun.stripANSI(component.render(80).join("\n"));
		expect(rendered).toContain("Loaded tools");
		expect(rendered).not.toContain("Tool search failed");
	});

	test("renders invalid select details with the unknown names", () => {
		const component = renderToolSearchResult(
			{
				content: [
					{
						type: "text",
						text: "Unknown or non-deferred tools in select query: missing. No tools were activated.",
					},
				],
				details: {
					version: 3,
					tool: "tool_search",
					status: "invalid_select",
					input: {
						mode: "select",
						query: "select:missing",
						requested: ["missing"],
						unknown: ["missing"],
						alreadyActive: [],
					},
					rankedMatches: [],
					activation: { before: [TOOL_SEARCH_NAME], added: [], after: [TOOL_SEARCH_NAME] },
					counts: { registered: 1, searchable: 1, matches: 0, added: 0 },
					timing: { durationMs: 2 },
				},
			},
			presentationTheme,
			{
				args: { query: "select:missing" },
				executionStarted: true,
				invalidate() {},
				isError: false,
				lastComponent: undefined,
			},
			false,
		);
		const rendered = Bun.stripANSI(component.render(80).join("\n"));
		expect(rendered).toContain("Invalid select");
		expect(rendered).toContain("Unknown or non-deferred tools");
	});

	test("derives invalid select diagnostics from details when content is empty", () => {
		const component = renderToolSearchResult(
			{
				content: [],
				details: {
					version: 3,
					tool: "tool_search",
					status: "invalid_select",
					input: {
						mode: "select",
						query: "select:missing",
						requested: ["missing"],
						unknown: ["missing"],
						alreadyActive: [],
					},
					rankedMatches: [],
					activation: { before: [TOOL_SEARCH_NAME], added: [], after: [TOOL_SEARCH_NAME] },
					counts: { registered: 1, searchable: 1, matches: 0, added: 0 },
					timing: { durationMs: 2 },
				},
			},
			presentationTheme,
			{
				args: { query: "select:missing" },
				executionStarted: true,
				invalidate() {},
				isError: false,
				lastComponent: undefined,
			},
			false,
		);
		const rendered = Bun.stripANSI(component.render(80).join("\n"));
		expect(rendered).toContain("Unknown or non-deferred tools in select query: missing");
	});

	test("publishes deferred names as a system-prompt section each turn", async () => {
		type PromptEvent = { systemPromptOptions: { sections: Record<string, string> } };
		const handlers = new Map<string, Array<(event?: PromptEvent) => void | Promise<void>>>();
		const active = [TOOL_SEARCH_NAME, "deferred_weather"];
		const tools = [metadata(TOOL_SEARCH_NAME, "Search tools."), metadata("deferred_weather", "Weather data.")];
		let registeredTool: { execute: (id: string, parameters: { query: string }) => Promise<unknown> } | undefined;
		const pi = {
			registerCommand() {},
			registerTool(tool: typeof registeredTool) {
				registeredTool = tool;
			},
			getAllTools: () => tools,
			getActiveTools: () => [...active],
			setActiveTools: (names: string[]) => active.splice(0, active.length, ...names),
			on(event: string, handler: (event?: PromptEvent) => void | Promise<void>) {
				handlers.set(event, [...(handlers.get(event) ?? []), handler]);
			},
		} as unknown as ExtensionAPI;

		configure(["deferred_weather"]);
		createToolSearchExtension(pi, configPath);
		for (const handler of handlers.get("session_start") ?? []) await handler();

		const sections: Record<string, string> = {};
		for (const handler of handlers.get("before_agent_start") ?? [])
			await handler({ systemPromptOptions: { sections } });

		expect(active).toEqual([TOOL_SEARCH_NAME]);
		expect(sections[DEFERRED_SECTION_KEY]).toBe(
			"These tools are available but their schemas are not loaded: deferred_weather.\n" +
				'Use tool_search with query "select:<name>" (e.g. "select:deferred_weather") to load tool schemas before calling them.',
		);

		// Loading via tool_search (the only path that survives pruning) removes the
		// name from the advertised section on the next turn.
		await registeredTool!.execute("tool_1", { query: "select:deferred_weather" });
		expect(active).toEqual([TOOL_SEARCH_NAME, "deferred_weather"]);
		for (const handler of handlers.get("before_agent_start") ?? []) {
			await handler({ systemPromptOptions: { sections } });
		}
		expect(active).toEqual([TOOL_SEARCH_NAME, "deferred_weather"]);
		expect(sections[DEFERRED_SECTION_KEY]).toBeUndefined();
	});
});
