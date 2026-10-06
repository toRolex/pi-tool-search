import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import console from "node:console";

const ownDir = dirname(fileURLToPath(import.meta.url));
const packageDir = realpathSync(
	process.env.PI_PROBE_PACKAGE_DIR ??
		"/Users/rolex/Library/pnpm/global/v11/3e4f681e4af26a3bf5583e3865fa297abc1ef119a9939791bfbe1196e3748496/node_modules/@earendil-works/pi-coding-agent",
);
assert.equal(JSON.parse(readFileSync(join(packageDir, "package.json"))).version, "1.0.4");
const variant = process.argv[2] ?? "builtin";
const expectation = process.argv[3] ?? "diagnosis";
assert.ok(["builtin", "repo"].includes(variant));
assert.ok(["restoration", "diagnosis"].includes(expectation));
const evidence = join(ownDir, "evidence");
mkdirSync(evidence, { recursive: true });
const runDir = mkdtempSync(join(evidence, `${variant}-${expectation}-`));
const cwd = join(runDir, "workspace");
const agentDir = join(runDir, "agent");
const sessionDir = join(runDir, "sessions");
const home = join(runDir, "home");
for (const path of [cwd, agentDir, sessionDir, home]) mkdirSync(path);
const eventsPath = join(runDir, "events.jsonl");
writeFileSync(eventsPath, "");
writeFileSync(join(agentDir, "tool-search.toml"), '[tools]\ndeferred = ["probe_tool"]\n');
for (const key of Object.keys(process.env)) {
	if (/API_KEY|TOKEN|SECRET|CREDENTIAL|^AWS_|^GOOGLE_|^AZURE_|^RADIUS_|^ANTHROPIC_|^OPENAI_/.test(key))
		delete process.env[key];
}
Object.assign(process.env, {
	HOME: home,
	TMPDIR: runDir,
	XDG_CACHE_HOME: join(runDir, "cache"),
	PI_CODING_AGENT_DIR: agentDir,
	PI_CODING_AGENT_SESSION_DIR: sessionDir,
	PI_OFFLINE: "1",
	PI_SKIP_VERSION_CHECK: "1",
	PI_TELEMETRY: "0",
	PI_PROBE_PACKAGE_DIR: packageDir,
	PI_PROBE_VARIANT: variant,
	PI_PROBE_EVENTS: eventsPath,
	PI_PROBE_CONFIG: join(agentDir, "tool-search.toml"),
});
const sdk = await import(pathToFileURL(join(packageDir, "dist/index.js")).href);
const ai = await import(pathToFileURL(join(packageDir, "../pi-ai/dist/index.js")).href);
const agentCore = await import(pathToFileURL(join(packageDir, "../pi-agent-core/dist/index.js")).href);
const observations = [];
const record = (scenario, session) => {
	const context = session.sessionManager.buildSessionContext().messages;
	const row = {
		scenario,
		active: session.getActiveToolNames(),
		persisted: ai.getCurrentTools(context).map((tool) => tool.name),
		sessionFile: session.sessionFile,
	};
	observations.push(row);
	console.log(JSON.stringify(row));
	return row;
};
const factory = async ({ cwd, agentDir, sessionManager, sessionStartEvent, omitInitial = false }) => {
	const modelRuntime = await sdk.ModelRuntime.create({
		authPath: join(agentDir, "auth.json"),
		modelsPath: null,
		modelsStorePath: join(agentDir, "model-store.json"),
		refreshOnCreate: false,
		allowModelNetwork: false,
	});
	const services = await sdk.createAgentSessionServices({
		cwd,
		agentDir,
		modelRuntime,
		settingsManager: sdk.SettingsManager.inMemory({
			defaultTools: ["tool_search"],
			compaction: { enabled: false },
			retry: { enabled: false },
			cacheWarming: "off",
		}),
		resourceLoaderOptions: {
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			systemPrompt: "Offline tool lifecycle probe.",
			additionalExtensionPaths: [join(ownDir, "offline-extension.ts")],
		},
	});
	assert.deepEqual(services.resourceLoader.getExtensions().errors, []);
	assert.deepEqual(services.diagnostics, []);
	const model = services.modelRuntime.getModel("runtime-probe", "offline");
	assert.equal(model?.provider, "runtime-probe");
	if (omitInitial) {
		const agent = new agentCore.Agent({
			initialState: {
				model,
				thinkingLevel: "off",
				messages: sessionManager.buildSessionContext().messages,
				tools: [],
				systemPrompt: "",
			},
			streamFn: (model, context, options) => services.modelRuntime.streamSimple(model, context, options),
		});
		const session = new sdk.AgentSession({
			agent,
			cwd,
			sessionManager,
			sessionStartEvent,
			settingsManager: services.settingsManager,
			resourceLoader: services.resourceLoader,
			modelRuntime: services.modelRuntime,
		});
		return { session, services, diagnostics: services.diagnostics };
	}
	const result = await sdk.createAgentSessionFromServices({
		services,
		sessionManager,
		sessionStartEvent,
		model,
		thinkingLevel: "off",
	});
	return { ...result, services, diagnostics: services.diagnostics };
};
const runtime = await sdk.createAgentSessionRuntime(factory, {
	cwd,
	agentDir,
	sessionManager: sdk.SessionManager.create(cwd, sessionDir),
});
runtime.setRebindSession((session) => session.bindExtensions({}));
await runtime.session.bindExtensions({});
record("fresh.session_start", runtime.session);
await runtime.session.prompt("baseline");
record("fresh.before_select", runtime.session);
await runtime.session.prompt("select");
const loaded = record("fresh.after_select", runtime.session);
assert.deepEqual(loaded.active.toSorted(), ["keep_tool", "probe_tool", "tool_search"]);
assert.deepEqual(loaded.persisted.toSorted(), ["keep_tool", "probe_tool", "tool_search"]);
const originalFile = runtime.session.sessionFile;
const forkLeaf = runtime.session.sessionManager.getLeafId();
writeFileSync(join(runDir, "source-before-resume.jsonl"), readFileSync(originalFile));
await runtime.newSession();
record("new.session_start", runtime.session);
assert.equal((await runtime.switchSession(originalFile)).cancelled, false);
const resumed = record("resume.session_start", runtime.session);
await runtime.session.prompt("resume-check");
const resumedPrompt = record("resume.after_prompt", runtime.session);
await runtime.session.prompt("select");
const resumedSelect = record("resume.after_reselect", runtime.session);
assert.equal((await runtime.fork(forkLeaf, { position: "at" })).cancelled, false);
const forked = record("fork.session_start", runtime.session);
await runtime.session.prompt("fork-check");
const forkedPrompt = record("fork.after_prompt", runtime.session);
await runtime.session.prompt("select");
const forkedSelect = record("fork.after_reselect", runtime.session);
for (const row of [resumedSelect, forkedSelect]) {
	assert.deepEqual(row.active.toSorted(), ["keep_tool", "probe_tool", "tool_search"]);
	assert.deepEqual(row.persisted.toSorted(), ["keep_tool", "probe_tool", "tool_search"]);
}
await runtime.dispose();
writeFileSync(join(runDir, "constructor-control.jsonl"), readFileSync(join(runDir, "source-before-resume.jsonl")));

const { session } = await factory({
	cwd,
	agentDir,
	omitInitial: true,
	sessionManager: sdk.SessionManager.open(join(runDir, "constructor-control.jsonl"), sessionDir),
	sessionStartEvent: { type: "session_start", reason: "resume" },
});
const restored = record("constructor.omitted_initial.before_bind", session);
await session.bindExtensions({});
const bound = record("constructor.omitted_initial.after_bind", session);
await session.prompt("constructor-check");
const prompted = record("constructor.omitted_initial.after_prompt", session);
session.dispose();
assert.deepEqual(restored.active.toSorted(), ["keep_tool", "probe_tool", "tool_search"]);
const events = readFileSync(eventsPath, "utf8").trim().split("\n").map(JSON.parse);
const result = {
	packageDir,
	version: "1.0.4",
	variant,
	expectation,
	evidenceLevel: "real SDK lifecycle and tools, simulated provider",
	observations,
	events,
};
writeFileSync(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(join(evidence, `latest-${variant}-${expectation}.json`), `${JSON.stringify({ runDir }, null, 2)}\n`);
assert.equal(events.find((event) => event.phase === "select_result")?.isError, false);
assert.equal(
	events.some((event) => event.phase === "provider_request" && event.declared.includes("probe_tool")),
	true,
);
console.log(`Evidence ${resolve(runDir)}`);
if (expectation === "restoration") {
	assert.equal(resumed.active.includes("probe_tool"), true, "resume must restore the loaded tool before session_start");
	assert.equal(forked.active.includes("probe_tool"), true, "fork must restore the loaded tool before session_start");
} else {
	for (const row of [resumed, forked]) {
		assert.equal(row.active.includes("probe_tool"), false);
		assert.equal(row.persisted.includes("probe_tool"), true);
	}
	for (const row of [resumedPrompt, forkedPrompt]) assert.equal(row.persisted.includes("probe_tool"), false);
	assert.equal(bound.active.includes("probe_tool"), variant === "builtin");
	assert.equal(prompted.active.includes("probe_tool"), variant === "builtin");
	console.log(
		`PASS ${variant}: real core fresh/select, resume/fork reset, omitted-initial restore${variant === "repo" ? ", repo session_start prunes restored loadout" : ""}`,
	);
}
