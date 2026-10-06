import assert from "node:assert/strict";
import console from "node:console";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const evidence = join(dirname(fileURLToPath(import.meta.url)), "evidence");
assert.equal(
	process.argv.length,
	4,
	"Usage: node compact-evidence.mjs --run-dir <runDir>; sources and latest are retained",
);
assert.equal(process.argv[2], "--run-dir");
const runDir = resolve(process.argv[3]);
assert.equal(
	realpathSync(dirname(runDir)),
	realpathSync(evidence),
	"runDir must be a direct child of this probe's evidence directory",
);
assert.equal(lstatSync(runDir).isDirectory(), true, "runDir must be a directory, not a symlink");
assert.equal(dirname(realpathSync(runDir)), realpathSync(evidence));
const readEvidence = (path) => {
	assert.equal(lstatSync(path).isFile(), true, "evidence must be a regular file, not a symlink");
	return readFileSync(path, "utf8");
};
const result = JSON.parse(readEvidence(join(runDir, "result.json")));
const sessionDir = join(runDir, "sessions");
assert.equal(lstatSync(sessionDir).isDirectory(), true, "sessions must be a directory, not a symlink");
const sessions = readdirSync(sessionDir)
	.sort()
	.map((name) => join(sessionDir, name));
for (const name of ["source-before-resume.jsonl", "constructor-control.jsonl"]) {
	const source = join(runDir, name);
	if (existsSync(source)) sessions.push(source);
}
result.transcripts = sessions.map((path) => ({
	path,
	entries: readEvidence(path).trim().split("\n").map(JSON.parse),
}));
const archive = join(evidence, `${basename(runDir)}.json`);
writeFileSync(archive, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
console.log(`PASS archived transcripts to ${archive}; retained all runtime/cache directories and latest pointers`);
