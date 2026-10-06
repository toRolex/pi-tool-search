import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ownDir = dirname(fileURLToPath(import.meta.url));
const variant = process.argv[2] ?? "builtin";
assert.ok(["builtin", "repo"].includes(variant));
const packageDir = realpathSync(
	process.env.PI_PROBE_PACKAGE_DIR ??
		"/Users/rolex/Library/pnpm/global/v11/3e4f681e4af26a3bf5583e3865fa297abc1ef119a9939791bfbe1196e3748496/node_modules/@earendil-works/pi-coding-agent",
);
assert.equal(JSON.parse(readFileSync(join(packageDir, "package.json"))).version, "1.0.4");
const evidence = join(ownDir, "evidence");
mkdirSync(evidence, { recursive: true });
const runDir = mkdtempSync(join(evidence, `cli-${variant}-`));
const cwd = join(runDir, "workspace");
const agentDir = join(runDir, "agent");
const sessionDir = join(runDir, "sessions");
const home = join(runDir, "home");
for (const path of [cwd, agentDir, sessionDir, home]) mkdirSync(path);
const eventsPath = join(runDir, "events.jsonl");
writeFileSync(eventsPath, "");
writeFileSync(
	join(agentDir, "settings.json"),
	JSON.stringify({
		defaultTools: ["tool_search"],
		compaction: { enabled: false },
		retry: { enabled: false },
		cacheWarming: "off",
	}),
);
writeFileSync(join(agentDir, "tool-search.toml"), '[tools]\ndeferred = ["probe_tool"]\n');
const env = Object.fromEntries(
	Object.entries(process.env).filter(
		([key]) => !/API_KEY|TOKEN|SECRET|CREDENTIAL|^AWS_|^GOOGLE_|^AZURE_|^RADIUS_|^ANTHROPIC_|^OPENAI_/.test(key),
	),
);
Object.assign(env, {
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
const commands = [];
const common = [
	join(packageDir, "dist/bundle/cli.js"),
	"--mode",
	"json",
	"--offline",
	"--no-extensions",
	"--no-mcp",
	"--no-skills",
	"--no-prompt-templates",
	"--no-themes",
	"--no-context-files",
	"--no-approve",
	"--extension",
	join(ownDir, "offline-extension.ts"),
	"--model",
	"runtime-probe/offline",
	"--thinking",
	"off",
	"--session-dir",
	sessionDir,
	"--system-prompt",
	"Offline lifecycle probe.",
];
const invoke = (scenario, args) => {
	const offset = readFileSync(eventsPath, "utf8").length;
	const child = spawnSync(process.execPath, [...common, ...args], { cwd, env, encoding: "utf8", timeout: 30000 });
	writeFileSync(join(runDir, `${scenario}.stderr.log`), child.stderr ?? "");
	assert.equal(child.status, 0, child.stderr);
	const rows = child.stdout.trim().split("\n").map(JSON.parse);
	const sessionHeader = rows.find((row) => row.type === "session");
	const path = readdirSync(sessionDir).find((name) => name.endsWith(`_${sessionHeader.id}.jsonl`));
	assert.ok(path, `CLI ${scenario} must persist a session`);
	const manager = sdk.SessionManager.open(join(sessionDir, path), sessionDir);
	const persisted = ai.getCurrentTools(manager.buildSessionContext().messages).map((tool) => tool.name);
	const events = readFileSync(eventsPath, "utf8").slice(offset).trim().split("\n").map(JSON.parse);
	const row = {
		scenario,
		command: [process.execPath, ...common, ...args],
		exitCode: child.status,
		sessionId: sessionHeader.id,
		sessionFile: join(sessionDir, path),
		persisted,
		events,
	};
	commands.push(row);
	console.log(
		JSON.stringify({
			scenario,
			activeAtStart: events.find((e) => e.phase === "session_start_post").active,
			beforeAgentStart: events.find((e) => e.phase === "before_agent_start").active,
			persisted,
		}),
	);
	return row;
};
const fresh = invoke("fresh", ["baseline", "select"]);
assert.equal(fresh.persisted.includes("probe_tool"), true);
writeFileSync(join(runDir, "source-before-resume.jsonl"), readFileSync(fresh.sessionFile));
const fork = invoke("fork", ["--fork", fresh.sessionFile, "fork-check"]);
const resume = invoke("resume", ["--session", fresh.sessionFile, "resume-check"]);
for (const row of [fork, resume]) {
	assert.equal(row.events.find((event) => event.phase === "session_start_post").active.includes("probe_tool"), false);
	assert.equal(row.persisted.includes("probe_tool"), false);
}
const result = {
	version: "1.0.4",
	packageDir,
	variant,
	evidenceLevel: "real CLI process, real session/tool core, simulated offline provider; no real MCP",
	commands,
};
writeFileSync(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(join(evidence, `latest-cli-${variant}.json`), JSON.stringify({ runDir }));
console.log(
	`PASS CLI ${variant} fresh/select, startup --fork and --session reset loaded tool; simulated provider only`,
);
console.log(`Evidence ${runDir}`);
