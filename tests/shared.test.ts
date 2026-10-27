import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { describeError } from "../src/shared/errors";
import { readJson, writeJson } from "../src/shared/json";
import { runChecked, runProcess } from "../src/shared/process";
import { capitalise, escapeHtml } from "../src/shared/text";
import { isProjectId } from "../src/project/records";
import { newProjectId } from "../src/project/store";

test("writeJson creates folders, round-trips through readJson and leaves no temp file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hpg-json-"));
  try {
    const file = path.join(dir, "nested", "deeper", "value.json");
    assert.equal(readJson(file), null);
    writeJson(file, { a: 1, b: ["x"] });
    assert.deepEqual(readJson(file), { a: 1, b: ["x"] });
    writeJson(file, { a: 2 });
    assert.deepEqual(readJson(file), { a: 2 });
    assert.deepEqual(readdirSync(path.dirname(file)), ["value.json"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runProcess collects output and the exit code; runChecked rejects on failure", async () => {
  const ok = await runProcess(process.execPath, ["-e", "process.stdout.write('out'); process.stderr.write('err')"]);
  assert.deepEqual(ok, { code: 0, stdout: "out", stderr: "err" });
  assert.equal(await runChecked(process.execPath, ["-e", "process.stdout.write('fine')"]), "fine");
  await assert.rejects(
    runChecked(process.execPath, ["-e", "process.stderr.write('boom'); process.exit(3)"]),
    /exited with code 3: boom/,
  );
  await assert.rejects(runProcess("hpg-no-such-command-xyz", []), /failed to start/);
});

test("text helpers", () => {
  assert.equal(
    escapeHtml(`<a href="x">Tom & "Jerry"</a>`),
    "&lt;a href=&quot;x&quot;&gt;Tom &amp; &quot;Jerry&quot;&lt;/a&gt;",
  );
  assert.equal(capitalise("deadpan"), "Deadpan");
  assert.equal(capitalise(""), "");
  assert.equal(describeError(new Error("nope")), "nope");
  assert.equal(describeError("plain"), "plain");
});

test("project ids are readable, bounded and valid", () => {
  const id = newProjectId("Your dog DOUBLES in size every single day, rendered in low-poly style!");
  assert.match(id, /^your-dog-doubles-in-size-every-single-[0-9a-f]{4}$/);
  assert.ok(isProjectId(id));
  assert.match(newProjectId("???"), /^scenario-[0-9a-f]{4}$/);
  assert.equal(isProjectId("../etc"), false);
  assert.equal(isProjectId("ab"), false);
  assert.equal(existsSync(path.join("out", id)), false, "creating an id writes nothing");
});
