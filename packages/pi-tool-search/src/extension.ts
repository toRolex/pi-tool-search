import { dirname, join } from "node:path";
import type { BeforeAgentStartEvent, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { migrateDeferredTools } from "./config.ts";
import { createToolSearchTool } from "./tools/tool-search/definition.ts";
import { DEFERRED_SECTION_KEY, renderDeferredSection } from "./tools/tool-search/select.ts";

export default function toolSearchExtension(pi: ExtensionAPI): void {
	createToolSearchExtension(pi, `${process.env.HOME}/.pi/agent/tool-search.toml`);
}

export function createToolSearchExtension(pi: ExtensionAPI, configPath: string): void {
	// Migration must finish (including retryable cleanup) before taking the session snapshot.
	const deferredTools = migrateDeferredTools(configPath, join(dirname(configPath), "xsettings.toml"));
	const deferredSet = new Set(deferredTools);
	let directTools: ReturnType<ExtensionAPI["getAllTools"]> = [];
	const activatedBySearch = new Set<string>();
	const directScope = {
		tools: () => directTools,
		active: () => {
			const assigned = new Set(directTools.map((candidate: { name: string }) => candidate.name));
			return pi.getActiveTools().filter((name: string) => assigned.has(name));
		},
		setActive: (names: readonly string[]) => {
			for (const name of names) activatedBySearch.add(name);
			const assigned = new Set(directTools.map((candidate: { name: string }) => candidate.name));
			pi.setActiveTools([...pi.getActiveTools().filter((name: string) => !assigned.has(name)), ...names]);
		},
	};

	const getDeferredNames = () => {
		const registered = new Set(pi.getAllTools().map((candidate: { name: string }) => candidate.name));
		return deferredTools.filter((name) => registered.has(name));
	};
	const tool = createToolSearchTool(directScope, getDeferredNames);
	pi.registerTool(tool);
	pi.on("session_start", () => {
		const activeTools = pi.getActiveTools();
		const active = new Set(activeTools);
		directTools = pi.getAllTools().filter((candidate: { name: string }) => candidate.name !== tool.name && active.has(candidate.name));
		directScope.setActive(
			directScope
				.tools()
				.map((candidate: { name: string }) => candidate.name)
				.filter((name: string) => !deferredSet.has(name)),
		);
	});
	// Other extensions re-activate deferred tools after session_start (e.g.
	// pi-goal-x installs its tool profile on every before_agent_start), so the
	// defer decision is re-asserted each turn. Tools activated via tool_search
	// stay active for the session. Only deferred names are touched; the rest of
	// the active set (user toggles) is preserved as-is. The same hook advertises
	// the deferred names so the model knows what select: can load. `sections` is
	// typed optional because pi 0.84 (the pinned dev dependency) predates it.
	pi.on("before_agent_start", (event: BeforeAgentStartEvent) => {
		const active = pi.getActiveTools();
		const next = active.filter((name: string) => !deferredSet.has(name) || activatedBySearch.has(name));
		const changed = next.length !== active.length;
		if (changed) pi.setActiveTools(next);
		const sections = (event.systemPromptOptions as { sections?: Record<string, string> }).sections;
		if (!sections) return;
		// A tool counts as loaded when it is in pi's active set, whatever activated it
		// (tool_search or user toggles); activatedBySearch only protects against pruning.
		const loaded = new Set(changed ? pi.getActiveTools() : active);
		const pending = getDeferredNames().filter((name) => !loaded.has(name));
		const section = renderDeferredSection(pending);
		if (section === undefined) delete sections[DEFERRED_SECTION_KEY];
		else sections[DEFERRED_SECTION_KEY] = section;
	});
	pi.on("session_shutdown", (event: { reason: string }) => {
		if (event.reason !== "reload" && event.reason !== "quit") return;
	});
}
