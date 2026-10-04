import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerToolSearchCodeModeAdapter } from "./code-mode-adapter.ts";
import { createToolSearchSettings, type ToolSearchSettings } from "./contributions/xsettings.ts";
import { createToolSearchTool } from "./tools/tool-search/definition.ts";

export default function toolSearchExtension(pi: ExtensionAPI): void {
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
	const tool = createToolSearchTool(directScope);
	pi.registerTool(tool);
	const codeMode = registerToolSearchCodeModeAdapter(tool);
	let deferredTools: string[] = [];
	let settingsClient = createToolSearchSettings();
	let unregisterXSettings = settingsClient.register((settings) => {
		deferredTools = [...settings.tools];
	});
	pi.on("session_start", () => {
		const nestedScope = codeMode.scope();
		const activeTools = pi.getActiveTools();
		const active = new Set(activeTools);
		directTools = pi.getAllTools().filter((candidate: { name: string }) => candidate.name !== tool.name && active.has(candidate.name));
		const assignedTools = nestedScope?.tools() ?? directTools;
		const options = assignedTools
			.map((candidate: { name: string; description?: string }) => ({ name: candidate.name, description: candidate.description }))
			.sort((left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name));
		unregisterXSettings();
		settingsClient = createToolSearchSettings(options);
		unregisterXSettings = settingsClient.register((settings: ToolSearchSettings) => {
			deferredTools = [...settings.tools];
		});
		const deferred = new Set(deferredTools);
		const scope = nestedScope ?? directScope;
		scope.setActive(
			scope
				.tools()
				.map((candidate: { name: string }) => candidate.name)
				.filter((name: string) => !deferred.has(name)),
		);
	});
	// Other extensions re-activate deferred tools after session_start (e.g.
	// pi-goal-x installs its tool profile on every before_agent_start), so the
	// defer decision is re-asserted each turn. Tools activated via tool_search
	// stay active for the session. Only deferred names are touched; the rest of
	// the active set (user toggles) is preserved as-is.
	pi.on("before_agent_start", () => {
		if (deferredTools.length === 0) return;
		const deferred = new Set(deferredTools);
		const active = pi.getActiveTools();
		const next = active.filter((name: string) => !deferred.has(name) || activatedBySearch.has(name));
		if (next.length !== active.length) pi.setActiveTools(next);
	});
	pi.on("session_shutdown", (event: { reason: string }) => {
		if (event.reason !== "reload" && event.reason !== "quit") return;
		unregisterXSettings();
		codeMode.dispose();
	});
}
