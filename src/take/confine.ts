import path from "node:path";
import type { Plugin } from "vite";
import { PROJECT_ROOT } from "../shared/paths";

/**
 * Keeps a take's bundle inside its own folder. The scene agent's file tools
 * cannot leave the take (src/agent/guard.ts), but the bundler can: an import
 * of "../../../.env?raw", a `new URL("…", import.meta.url)`, a CSS url() or a
 * worker would copy any file on disk into player.js, where a snapshot shows it
 * to the model. Packages (three, zod) resolve from this repository's
 * node_modules and stay allowed.
 */

const PACKAGES = path.join(PROJECT_ROOT, "node_modules");
/** Stylesheets Vite would process, resolving their url() and @import itself. As ?raw or ?url they are plain files. */
const STYLESHEET = /\.(css|scss|sass|less|styl|stylus|pcss|postcss|sss)$/;
/** Workers are bundled by a separate build that this plugin is not part of. */
const WORKER = /[?&](worker|sharedworker)\b/;

/** Vite module ids carry queries (?raw, ?url) and use forward slashes. */
function fileOf(id: string): string {
  return id.split("?")[0] ?? "";
}

/** `file` relative to the take, with forward slashes, for the error the model reads. */
function shown(dir: string, file: string): string {
  return path.relative(dir, file).replace(/\\/g, "/");
}

function inside(root: string, file: string): boolean {
  const r = path.relative(root, path.resolve(file));
  return r !== "" && r !== ".." && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r);
}

/** True when the bundler may read module `id` while building the take in `dir`. Virtual modules are not files. */
export function isTakeImport(dir: string, id: string): boolean {
  const file = fileOf(id);
  if (!path.isAbsolute(file)) return true;
  return inside(dir, file) || inside(PACKAGES, file);
}

/**
 * Why the bundler may not use module `id` (with its source `code`) in the take
 * in `dir`, or null when it may. Code in packages is trusted.
 */
export function takeModuleRefusal(dir: string, id: string, code: string): string | null {
  const file = fileOf(id);
  if (!inside(dir, file)) return null;
  const name = shown(dir, file);
  if (WORKER.test(id)) return `${name}: workers are not available in a take`;
  if (STYLESHEET.test(file) && !/[?&](raw|url)\b/.test(id)) {
    return `${name}: stylesheets are not bundled; style from TypeScript, or import the file with ?raw`;
  }
  // Vite resolves new URL(…, import.meta.url) itself, without load, so isTakeImport never sees it.
  if (code.includes("import.meta.url")) {
    return `${name}: import.meta.url is not available in a take; import assets from src/ with ?raw or ?url`;
  }
  return null;
}

/** The Vite plugin that refuses anything a take's code reaches outside the take. */
export function confineToTake(dir: string): Plugin {
  return {
    name: "hpg:confine-to-take",
    enforce: "pre",
    load(id) {
      if (!isTakeImport(dir, id)) {
        this.error(`${shown(dir, fileOf(id))} is outside the take: import only from src/, three and zod`);
      }
      return null;
    },
    transform(code, id) {
      const refusal = takeModuleRefusal(dir, id, code);
      if (refusal) this.error(refusal);
      return null;
    },
  };
}
