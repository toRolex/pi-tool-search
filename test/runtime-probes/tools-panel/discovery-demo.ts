import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	initTheme,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { createToolSearchExtension } from "../../../packages/pi-tool-search/src/extension.ts";
import { readDeferredTools } from "../../../packages/pi-tool-search/src/config.ts";
import { createToolSearchTool } from "../../../packages/pi-tool-search/src/tools/tool-search/definition.ts";

// Standalone offline host demo: real extension and TUI components, isolated temporary policy.
const directory = mkdtempSync(join(tmpdir(), "tools-panel-16-demo-"));
const configPath = join(directory, "tool-search.toml");
try {
	writeFileSync(configPath, '[tools]\ndeferred = ["outside", "unregistered"] # keep\n');
	const active = ["tool_search", "alpha", "native", "zebra"];
	const tools = [
		{ name: "zebra", description: "Managed direct tool" },
		{ name: "tool_search", description: "Loader" },
		{ name: "outside", description: "Registered but not assigned" },
		{ name: "native", description: "Host-owned deferred tool", exposure: "deferred" },
		{ name: "alpha", description: "Managed direct tool", exposure: "direct" },
	];
	const handlers = new Map<string, () => void>();
	let command!: Omit<RegisteredCommand, "name" | "sourceInfo">;
	let search!: ReturnType<typeof createToolSearchTool>;
	const pi = {
		registerCommand(_name: string, value: typeof command) {
			command = value;
		},
		registerTool(value: typeof search) {
			search = value;
		},
		getAllTools: () => tools,
		getActiveTools: () => [...active],
		setActiveTools(names: string[]) {
			active.splice(0, active.length, ...names);
		},
		on(event: string, handler: () => void) {
			handlers.set(event, handler);
		},
	} as unknown as ExtensionAPI;
	createToolSearchExtension(pi, configPath);
	handlers.get("session_start")!();
	initTheme("dark");
	let panel!: Component;
	const errors: string[] = [];
	const ctx = {
		mode: "tui",
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
	await command.handler("", ctx);
	const text = () => Bun.stripANSI(panel.render(100).join("\n"));
	const input = (...keys: string[]) => keys.forEach((key) => panel.handleInput!(key));
	console.log("BEFORE — all registered tools, sorted\n" + text());
	assert.match(text(), /native\s+host deferred · active \(readonly\)/);
	assert.match(text(), /outside\s+inactive \(readonly\)/);
	const before = readFileSync(configPath, "utf8");
	input("\x1b[B", "\r", " "); // native: cannot take over host exposure
	console.log("\nNATIVE READONLY — observable reason\n" + text());
	input("\x1b[B", "\r", " "); // outside: do not invent disabled/selection provenance
	console.log("\nOUTSIDE READONLY — conservative reason\n" + text());
	input("\x1b[B", "\r", " "); // self: never defer the loader
	assert.equal(readFileSync(configPath, "utf8"), before);
	assert.deepEqual(active, ["tool_search", "alpha", "native", "zebra"]);
	input("\x1b[B", "\r", "\x1b[B", "\r"); // zebra: choose deferred
	assert.deepEqual(readDeferredTools(configPath), ["outside", "unregistered", "zebra"]);
	assert.deepEqual(active, ["tool_search", "alpha", "native"]);
	console.log("\nAFTER — managed zebra deferred, readonly entries unchanged\n" + text());
	const rejected = await search.execute("demo", { query: "select:outside" }, undefined, undefined, {} as never);
	assert.equal(rejected.details.status, "invalid_select");
	const loaded = await search.execute("demo", { query: "select:zebra" }, undefined, undefined, {} as never);
	assert.deepEqual(loaded.details.activation.added, ["zebra"]);
	assert.equal(loaded.details.counts.registered, 2); // not the five-tool discovery catalog
	assert.deepEqual(errors, []);
	console.log("\nPASS — readonly actions do not save/activate; managed tool persists and loads; index stays assigned.");
	console.log(readFileSync(configPath, "utf8"));
} finally {
	rmSync(directory, { recursive: true, force: true });
}
