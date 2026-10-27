import "./styles.css";
import type { VariantId } from "../../src/project/records";
import { renderHome } from "./home";
import { renderProject } from "./project";

/**
 * The dashboard. One input, one take, talk to Claude about it, copy the
 * caption, download the video. State lives on the server
 * (out/<id>/project.json); each view polls it while anything is in flight
 * and patches the DOM in place so the embedded players are never reloaded
 * unnecessarily.
 */

type Route = { kind: "home" } | { kind: "project"; id: string; variant: VariantId | null };

function route(): Route {
  const m = location.hash.match(/^#\/p\/([a-z0-9-]+)(?:\/([abc]))?$/);
  if (!m) return { kind: "home" };
  return { kind: "project", id: m[1]!, variant: (m[2] as VariantId | undefined) ?? null };
}

const app = document.getElementById("app")!;
let dispose: (() => void) | null = null;

function render(): void {
  dispose?.();
  const r = route();
  dispose = r.kind === "home" ? renderHome(app) : renderProject(app, r.id, r.variant);
}

window.addEventListener("hashchange", render);
render();
