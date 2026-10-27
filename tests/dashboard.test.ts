import assert from "node:assert/strict";
import { test } from "node:test";
import { idleVideo, newVariant, type ProjectRecord, type VariantRecord } from "../src/project/records";
import { ago, isBusy, renderButtonLabel, studioSubtitle, takeSubtitle } from "../web/src/status";

function ready(patch: Partial<VariantRecord> = {}): VariantRecord {
  return {
    ...newVariant("a", "Deadpan"),
    status: "ready",
    mode: "Scale",
    terrain: "suburb",
    style: "lowpoly",
    voice: "dry / brisk",
    music: "lofi-chill",
    duration: 32,
    ...patch,
  };
}

function project(variants: VariantRecord[]): ProjectRecord {
  return { id: "p-0000", prompt: "x", createdAt: "", updatedAt: "", selected: "a", variants };
}

test("take subtitles describe what is ready, failing or in progress", () => {
  assert.equal(takeSubtitle(ready()), "Scale · Deadpan · suburb · lowpoly · 32s");
  assert.equal(takeSubtitle(ready({ edits: 2 })), "Scale · Deadpan · suburb · lowpoly · 32s · 2 edits");
  assert.equal(takeSubtitle(ready({ edits: 1 })), "Scale · Deadpan · suburb · lowpoly · 32s · 1 edit");
  assert.equal(takeSubtitle({ ...newVariant("a", ""), status: "error", error: "boom" }), "boom");
  assert.equal(takeSubtitle({ ...newVariant("a", ""), status: "voicing" }), "Recording…");
  assert.equal(
    takeSubtitle({ ...newVariant("a", ""), status: "scripting", activity: "Editing scene/props.ts" }),
    "Editing scene/props.ts…",
  );
  assert.equal(studioSubtitle(ready()), "Scale · Deadpan · suburb · lowpoly · dry / brisk · ♪ lofi-chill · 32s");
  assert.equal(studioSubtitle({ ...newVariant("a", ""), status: "building" }), "Building…");
});

test("the render button follows the video state", () => {
  assert.equal(renderButtonLabel(idleVideo()), "Render video");
  assert.equal(renderButtonLabel({ ...idleVideo(), status: "queued" }), "Queued…");
  assert.equal(renderButtonLabel({ ...idleVideo(), status: "rendering", progress: 0.426 }), "Rendering 43%");
  assert.equal(renderButtonLabel({ ...idleVideo(), status: "ready" }), "Download video");
  assert.equal(renderButtonLabel({ ...idleVideo(), status: "error" }), "Render failed, retry");
});

test("a project is busy while a take builds, Claude edits, or a video renders", () => {
  assert.equal(isBusy(project([ready()])), false);
  assert.equal(isBusy(project([ready({ status: "voicing" })])), true);
  assert.equal(isBusy(project([ready({ activity: "Planning" })])), true);
  assert.equal(isBusy(project([ready({ video: { ...idleVideo(), status: "rendering" } })])), true);
  assert.equal(isBusy(project([ready({ status: "error" })])), false);
});

test("ago rounds to the coarsest useful unit", () => {
  const now = Date.parse("2026-01-01T12:00:00Z");
  assert.equal(ago("2026-01-01T11:59:30Z", now), "just now");
  assert.equal(ago("2026-01-01T11:45:00Z", now), "15 min ago");
  assert.equal(ago("2026-01-01T07:00:00Z", now), "5 h ago");
});
