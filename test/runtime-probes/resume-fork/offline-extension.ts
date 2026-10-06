import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createToolSearchExtension } from "../../../packages/pi-tool-search/src/extension.ts";

export default async function (pi: any) {
	const packageDir = process.env.PI_PROBE_PACKAGE_DIR!;
	const ai = await import(pathToFileURL(`${packageDir}/../pi-ai/dist/index.js`).href);
	const variant = process.env.PI_PROBE_VARIANT!;
	const record = (value: unknown) => {
		appendFileSync(process.env.PI_PROBE_EVENTS!, `${JSON.stringify(value)}\n`);
	};
	pi.registerProvider("runtime-probe", {
		api: "runtime-probe-api",
		baseUrl: "http://invalid.invalid",
		apiKey: "offline-placeholder-not-a-secret",
		models: [
			{
				id: "offline",
				name: "Offline lifecycle probe",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 1000000,
				maxTokens: 1000,
			},
		],
		streamSimple(model: any, context: any) {
			const stream = ai.createAssistantMessageEventStream();
			const last = context.messages.at(-1);
			const userText = Array.isArray(last?.content)
				? last.content
						.filter((block: any) => block.type === "text")
						.map((block: any) => block.text)
						.join("")
				: last?.content;
			const select = last?.role === "user" && userText === "select";
			const content = select
				? [
						{
							type: "toolCall",
							id: `load-${Date.now()}`,
							name: "tool_search",
							arguments: { query: "select:probe_tool", limit: 1 },
						},
					]
				: [{ type: "text", text: "offline complete" }];
			const message = {
				role: "assistant",
				content,
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: select ? "toolUse" : "stop",
				timestamp: Date.now(),
			};
			record({
				phase: "provider_request",
				variant,
				declared: ai.getCurrentTools(context.messages).map((t: any) => t.name),
			});
			queueMicrotask(() => {
				stream.push({ type: "start", partial: { ...message, content: [], stopReason: "pending" } });
				stream.push({ type: "done", reason: message.stopReason, message });
				stream.end();
			});
			return stream;
		},
	});
	for (const name of ["keep_tool", "probe_tool"]) {
		pi.registerTool({
			name,
			label: name,
			description: name === "probe_tool" ? "Probe tool for lifecycle loadout restoration" : "Non-deferred probe tool",
			parameters: { type: "object", properties: {}, required: [] },
			exposure: name === "probe_tool" && variant === "builtin" ? "deferred" : "direct",
			execute: async () => ({ content: [{ type: "text", text: "probe executed" }], details: {} }),
		});
	}
	pi.on("session_start", (event: any) => {
		record({ phase: "session_start_pre", reason: event.reason, active: pi.getActiveTools() });
	});
	if (variant === "repo") {
		createToolSearchExtension(pi, process.env.PI_PROBE_CONFIG!);
	} else {
		const builtin = await import(pathToFileURL(`${packageDir}/dist/extensions/tool-search/index.js`).href);
		builtin.createToolSearchExtension()(pi);
	}
	pi.on("session_start", (event: any) => {
		record({ phase: "session_start_post", reason: event.reason, active: pi.getActiveTools() });
	});
	pi.on("before_agent_start", () => {
		record({ phase: "before_agent_start", active: pi.getActiveTools() });
	});
	pi.on("tool_result", (event: any) => {
		if (event.toolName === "tool_search") {
			record({
				phase: "select_result",
				active: pi.getActiveTools(),
				content: event.content,
				details: event.details,
				isError: event.isError,
			});
		}
	});
	pi.on("session_shutdown", (event: any) => {
		record({ phase: "shutdown", reason: event.reason, active: pi.getActiveTools() });
	});
	if (readFileSync(`${packageDir}/package.json`, "utf8").includes('"version": "1.0.4"') === false) {
		throw new Error("This probe requires installed pi 1.0.4");
	}
}
