import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createToolSearchExtension } from "../src/extension.ts";
import { searchTools, type ToolMetadata, type ToolNamespace } from "../src/search.ts";
import type { createToolSearchTool } from "../src/tools/tool-search/definition.ts";

function metadata(name: string, description: string, namespace?: ToolNamespace): ToolMetadata {
	return {
		name,
		description,
		parameters: { type: "object", properties: {} },
		sourceInfo: { source: "extension", path: `/extensions/${name}.ts`, scope: "user", origin: "package" },
		...(namespace ? { namespace } : {}),
	};
}

describe("namespace text is searchable", () => {
	test("matches a tool whose namespace description is the only evidence", () => {
		const matches = searchTools("warehousing", [
			metadata("query_database", "Run a read-only query.", {
				name: "mcp__postgres",
				description: "Relational warehousing.",
			}),
			metadata("render_chart", "Draw a chart.", { name: "mcp__charts", description: "Chart rendering." }),
		]);

		expect(matches.map((match) => match.tool.name)).toEqual(["query_database"]);
	});

	test("matches a tool whose namespace name is the only evidence", () => {
		const matches = searchTools("postgres", [
			metadata("query_database", "Run a read-only query.", { name: "mcp__postgres" }),
			metadata("render_chart", "Draw a chart.", { name: "mcp__charts" }),
		]);

		expect(matches.map((match) => match.tool.name)).toEqual(["query_database"]);
	});

	test("matches a tool whose namespace instructions are the only evidence", () => {
		const matches = searchTools("cite identifier", [
			metadata("read_page", "Read a page.", {
				name: "mcp__docs",
				instructions: "Always cite the page identifier in answers.",
			}),
			metadata("list_pages", "List pages.", { name: "mcp__docs", description: "Page listing." }),
		]);

		expect(matches.map((match) => match.tool.name)).toEqual(["read_page"]);
	});

	test("returns nothing when only the namespace is unrelated to the query", () => {
		const matches = searchTools("kubernetes", [
			metadata("query_database", "Run a read-only query.", {
				name: "mcp__postgres",
				description: "Relational warehousing.",
				instructions: "Prefer indexed reads.",
			}),
		]);

		expect(matches).toEqual([]);
	});

	test("ignores a namespace whose optional fields are absent", () => {
		const matches = searchTools("warehousing", [
			metadata("query_database", "Run a read-only query.", { name: "mcp__postgres" }),
		]);

		expect(matches).toEqual([]);
	});
});

describe("namespace text through the extension", () => {
	const directories: string[] = [];

	afterEach(() => {
		for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
	});

	test("loads a deferred tool matched only by its namespace text", async () => {
		const directory = mkdtempSync(join(tmpdir(), "namespace-search-"));
		directories.push(directory);
		const configPath = join(directory, "tool-search.toml");
		writeFileSync(configPath, '[tools]\ndeferred = ["query_database"]\n');
		let active = ["tool_search", "query_database"];
		const tools: ToolMetadata[] = [
			metadata("tool_search", "Search tools."),
			metadata("query_database", "Run a read-only query.", {
				name: "mcp__postgres",
				description: "Relational warehousing.",
			}),
		];
		const handlers = new Map<string, (event: unknown) => void>();
		let tool!: ReturnType<typeof createToolSearchTool>;
		const pi = {
			getAllTools: () => tools,
			getActiveTools: () => [...active],
			setActiveTools: (names: string[]) => {
				active = [...names];
			},
			registerTool: (value: typeof tool) => {
				tool = value;
			},
			on: (event: string, handler: (event: unknown) => void) => {
				handlers.set(event, handler);
			},
		} as unknown as ExtensionAPI;
		createToolSearchExtension(pi, configPath);
		handlers.get("session_start")!({});

		const result = await tool.execute("call", { query: "warehousing" }, undefined, undefined, {} as never);

		expect(result.content).toEqual([{ type: "text", text: "Loaded tools: query_database." }]);
		expect(active).toEqual(["tool_search", "query_database"]);
	});
});

describe("namespace text is additive, not privileged", () => {
	test("ranks a name match above a namespace-only match when the name is indexed twice", () => {
		const matches = searchTools("chart", [
			metadata("query_database", "Run a query.", { name: "mcp__postgres", description: "Chart rendering." }),
			metadata("render_chart", "Draw."),
		]);

		expect(matches.map((match) => match.tool.name)).toEqual(["render_chart", "query_database"]);
	});

	test("ranks a shorter description match above a longer namespace-only match at equal term frequency", () => {
		const matches = searchTools("chart", [
			metadata("query_database", "Charts are unavailable here."),
			metadata("draw_image", "Draw.", { name: "mcp__viz", description: "Chart rendering." }),
		]);

		expect(matches.map((match) => match.tool.name)).toEqual(["query_database", "draw_image"]);
	});
});
