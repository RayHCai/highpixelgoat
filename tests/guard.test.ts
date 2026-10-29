import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { describeCall, guardToolCall, isWriteCall, TAKE_TOOLS } from "../src/agent/guard";

const take = path.resolve("/projects/out/demo-1a2b/a");

test("reads and searches stay inside the take", () => {
  assert.equal(guardToolCall(take, "Read", { file_path: path.join(take, "src/scene/world.ts") }), null);
  assert.equal(guardToolCall(take, "Read", { file_path: "spec.json" }), null);
  assert.equal(guardToolCall(take, "Glob", { pattern: "**/*.ts" }), null);
  assert.equal(guardToolCall(take, "Grep", { pattern: "seek", path: "src" }), null);
  assert.match(guardToolCall(take, "Read", { file_path: path.resolve("/etc/passwd") }) ?? "", /outside the take/);
  assert.match(guardToolCall(take, "Grep", { pattern: "x", path: ".." }) ?? "", /outside the take/);
});

test("writes go only to src/, spec.json and take.json", () => {
  for (const file of ["src/scene/props.ts", "spec.json", "take.json", path.join(take, "src/new/file.ts")]) {
    assert.equal(guardToolCall(take, "Write", { file_path: file }), null, file);
    assert.equal(guardToolCall(take, "Edit", { file_path: file }), null, file);
  }
  for (const file of ["CLAUDE.md", "player.js", "index.html", "audio/track.mp3", "srcx/a.ts"]) {
    assert.match(guardToolCall(take, "Write", { file_path: file }) ?? "", /read-only/, file);
  }
});

test("path traversal out of the take is refused", () => {
  assert.match(guardToolCall(take, "Write", { file_path: "src/../../b/spec.json" }) ?? "", /outside the take/);
  assert.match(guardToolCall(take, "Edit", { file_path: "../a-other/src/x.ts" }) ?? "", /outside the take/);
  assert.match(guardToolCall(take, "Write", { file_path: path.resolve("/tmp/spec.json") }) ?? "", /outside the take/);
  // A write to a file whose name merely starts with "..": still inside, but not writable.
  assert.match(guardToolCall(take, "Write", { file_path: "..notes" }) ?? "", /read-only/);
});

test("Glob patterns and Grep file globs cannot reach outside the take", () => {
  assert.equal(guardToolCall(take, "Glob", { pattern: "src/**/*.{ts,glsl}" }), null);
  assert.equal(guardToolCall(take, "Grep", { pattern: "\\.\\./", glob: "*.ts" }), null);
  assert.equal(guardToolCall(take, "Glob", { pattern: "..notes/*" }), null);
  for (const pattern of ["../**", "src/../../*.json", "{..,src}/.env", "/etc/*", "C:/Users/**", "~/.ssh/*", "..\\x"]) {
    assert.match(guardToolCall(take, "Glob", { pattern }) ?? "", /outside the take/, pattern);
    assert.match(guardToolCall(take, "Grep", { pattern: "x", glob: pattern }) ?? "", /outside the take/, pattern);
  }
});

test("every other Claude Code tool is off; the take tools are on", () => {
  for (const name of ["Bash", "WebFetch", "WebSearch", "Task", "NotebookEdit"]) {
    assert.match(guardToolCall(take, name, {}) ?? "", /not available/, name);
  }
  for (const name of TAKE_TOOLS) assert.equal(guardToolCall(take, name, {}), null, name);
});

test("only Write and Edit count as changing the take", () => {
  assert.equal(isWriteCall("Write"), true);
  assert.equal(isWriteCall("Edit"), true);
  assert.equal(isWriteCall("Read"), false);
  assert.equal(isWriteCall("mcp__take__build"), false);
});

test("describeCall gives the dashboard a short line per tool", () => {
  assert.equal(describeCall("Edit", { file_path: path.join(take, "src/scene/props.ts") }), "Editing scene/props.ts");
  assert.equal(describeCall("Glob", { pattern: "*" }), "Reading the code");
  assert.equal(describeCall("mcp__take__voice", {}), "Recording the narration");
  assert.equal(describeCall("mcp__take__snapshot", {}), "Looking at frames");
  assert.equal(describeCall("mcp__take__asset", { name: "city/car" }), "Bringing in city/car");
  assert.equal(describeCall("Something", {}), "Working");
});
