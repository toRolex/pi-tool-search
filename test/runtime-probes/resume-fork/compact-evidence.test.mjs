import assert from "node:assert/strict";
import console from "node:console";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const source = join(dirname(fileURLToPath(import.meta.url)), "compact-evidence.mjs");
const tests = [
	[
		"no arguments preserve unarchived, active and other-worker directories",
		({ evidence, invoke }) => {
			for (const name of ["builtin-diagnosis-ACTIVE", "repo-diagnosis-OLDER", "cli-repo-WORKER"]) {
				mkdirSync(join(evidence, name));
				writeFileSync(join(evidence, name, "keep.txt"), "original evidence");
			}
			assert.notEqual(invoke().status, 0);
			for (const name of ["builtin-diagnosis-ACTIVE", "repo-diagnosis-OLDER", "cli-repo-WORKER"]) {
				assert.equal(readFileSync(join(evidence, name, "keep.txt"), "utf8"), "original evidence");
			}
		},
	],
	[
		"explicit run archives real entries without removing sources or latest",
		({ evidence, run, invoke }) => {
			const runDir = run("repo-diagnosis-ONE");
			const latest = join(evidence, "latest-repo-diagnosis.json");
			writeFileSync(latest, JSON.stringify({ runDir: "/another/worker" }));
			assert.equal(invoke(runDir).status, 0);
			const archive = JSON.parse(readFileSync(join(evidence, "repo-diagnosis-ONE.json"), "utf8"));
			assert.deepEqual(archive.transcripts, [
				{ path: join(runDir, "sessions", "session.jsonl"), entries: [{ id: "entry-one" }] },
			]);
			assert.equal(readFileSync(join(runDir, "result.json"), "utf8"), '{"variant":"repo"}');
			assert.equal(readFileSync(latest, "utf8"), '{"runDir":"/another/worker"}');
		},
	],
	[
		"existing archive is never overwritten",
		({ evidence, run, invoke }) => {
			const runDir = run("repo-diagnosis-ONE");
			const archive = join(evidence, "repo-diagnosis-ONE.json");
			writeFileSync(archive, "another owner's archive");
			assert.notEqual(invoke(runDir).status, 0);
			assert.equal(readFileSync(archive, "utf8"), "another owner's archive");
			assert.equal(readFileSync(join(runDir, "result.json"), "utf8"), '{"variant":"repo"}');
		},
	],
	[
		"two same-variant runs get separate archives",
		({ evidence, run, invoke }) => {
			for (const name of ["repo-diagnosis-ONE", "repo-diagnosis-TWO"]) {
				assert.equal(invoke(run(name)).status, 0);
				assert.equal(JSON.parse(readFileSync(join(evidence, `${name}.json`), "utf8")).variant, "repo");
			}
		},
	],
	[
		"incomplete run fails without removing partial evidence",
		({ evidence, invoke }) => {
			const runDir = join(evidence, "builtin-diagnosis-ACTIVE");
			mkdirSync(runDir);
			writeFileSync(join(runDir, "events.jsonl"), "partial");
			assert.notEqual(invoke(runDir).status, 0);
			assert.equal(readFileSync(join(runDir, "events.jsonl"), "utf8"), "partial");
		},
	],
	[
		"run directory symlink is rejected",
		({ evidence, root, invoke }) => {
			const outside = join(root, "outside");
			mkdirSync(outside);
			const runDir = join(evidence, "repo-diagnosis-LINK");
			symlinkSync(outside, runDir);
			assert.notEqual(invoke(runDir).status, 0);
		},
	],
	[
		"session symlink is rejected without archiving external content",
		({ root, run, invoke }) => {
			const runDir = run("repo-diagnosis-LINK");
			const outside = join(root, "private.jsonl");
			writeFileSync(outside, '{"private":true}\n');
			symlinkSync(outside, join(runDir, "sessions", "external.jsonl"));
			assert.notEqual(invoke(runDir).status, 0);
			assert.equal(readFileSync(outside, "utf8"), '{"private":true}\n');
		},
	],
	[
		"concurrent archive writers have exactly one winner",
		({ evidence, run, script }) => {
			const runDir = run("repo-diagnosis-RACE");
			const driver = `const { spawn } = require('node:child_process'); Promise.all([1,2].map(() => new Promise(resolve => { const p = spawn(process.execPath, [${JSON.stringify(script)}, '--run-dir', ${JSON.stringify(runDir)}], {stdio:'ignore'}); p.on('exit', resolve); }))).then(codes => console.log(JSON.stringify(codes.sort())));`;
			const result = spawnSync(process.execPath, ["-e", driver], { encoding: "utf8" });
			assert.equal(result.status, 0);
			assert.deepEqual(JSON.parse(result.stdout), [0, 1]);
			assert.equal(JSON.parse(readFileSync(join(evidence, "repo-diagnosis-RACE.json"), "utf8")).variant, "repo");
		},
	],
];
let failed = 0;
for (const [name, test] of tests) {
	const root = mkdtempSync(join(tmpdir(), "pi-compact-safety-"));
	const evidence = join(root, "evidence");
	const script = join(root, "compact-evidence.mjs");
	mkdirSync(evidence);
	cpSync(source, script);
	const run = (name) => {
		const runDir = join(evidence, name);
		mkdirSync(join(runDir, "sessions"), { recursive: true });
		writeFileSync(join(runDir, "result.json"), '{"variant":"repo"}');
		writeFileSync(join(runDir, "sessions", "session.jsonl"), '{"id":"entry-one"}\n');
		return runDir;
	};
	const invoke = (runDir) =>
		spawnSync(process.execPath, [script, ...(runDir ? ["--run-dir", runDir] : [])], { encoding: "utf8" });
	try {
		test({ root, evidence, script, run, invoke });
		console.log(`PASS ${name}`);
	} catch (error) {
		failed++;
		console.log(`FAIL ${name}`);
		console.error(error);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}
console.log(`${tests.length - failed} passed; ${failed} failed`);
process.exitCode = failed ? 1 : 0;
