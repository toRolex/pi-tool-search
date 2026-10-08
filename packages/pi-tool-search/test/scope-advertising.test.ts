import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createToolSearchExtension } from "../src/extension.ts";
import type { ToolMetadata } from "../src/search.ts";
import type { createToolSearchTool } from "../src/tools/tool-search/definition.ts";

const configDirs: string[] = [];

afterEach(() => {
	for (const directory of configDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

test("advertises and loads scoped deferred tools but rejects deferred tools inactive at session start", async () => {
	const directory = mkdtempSync(join(import.meta.dir, ".scope-advertising-"));
	configDirs.push(directory);
	const configPath = join(directory, "tool-search.toml");
	writeFileSync(configPath, '[tools]\ndeferred = ["outside", "weather", "missing"]\n');
	let active = ["tool_search", "read", "weather"];
	const tools: ToolMetadata[] = ["tool_search", "read", "weather", "outside"].map((name) => ({
		name,
		description: name,
		parameters: { type: "object", properties: {} },
		sourceInfo: { source: "extension", path: `/extensions/${name}.ts`, scope: "user", origin: "package" },
	}));
	const handlers = new Map<string, (event: unknown) => void>();
	let tool!: ReturnType<typeof createToolSearchTool>;
	const pi = {
		registerCommand() {},
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
	expect(active).toEqual(["tool_search", "read"]);

	const rejected = await tool.execute("outside", { query: "select:outside" }, undefined, undefined, {} as never);
	expect(rejected.details).toMatchObject({
		status: "invalid_select",
		input: { mode: "select", requested: ["outside"], unknown: ["outside"] },
		activation: { added: [] },
	});
	expect(rejected.content).toEqual([
		{ type: "text", text: "Unknown or non-deferred tools in select query: outside. No tools were activated." },
	]);
	expect(active).toEqual(["tool_search", "read"]);

	const sections: Record<string, string> = { unrelated: "keep" };
	handlers.get("before_agent_start")!({ systemPromptOptions: { sections } });
	expect(sections).toEqual({
		unrelated: "keep",
		"deferred-tools":
			"These tools are available but their schemas are not loaded: weather.\n" +
			'Use tool_search with query "select:<name>" (e.g. "select:weather") to load tool schemas before calling them.',
	});

	const loaded = await tool.execute("weather", { query: "select:weather" }, undefined, undefined, {} as never);
	expect(loaded.details).toMatchObject({ status: "loaded", activation: { added: ["weather"] } });
	expect(loaded.content).toEqual([{ type: "text", text: "Loaded tools: weather." }]);
	expect(active).toEqual(["tool_search", "read", "weather"]);
	for (let turn = 0; turn < 2; turn++) {
		handlers.get("before_agent_start")!({ systemPromptOptions: { sections } });
		expect(sections).toEqual({ unrelated: "keep" });
		expect(active).toEqual(["tool_search", "read", "weather"]);
	}
});
