import path from "node:path";
import { fileURLToPath } from "node:url";

/** Where things live in this repository. Every path is absolute. */

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Generated projects, one folder per id. */
export const OUT_DIR = path.join(PROJECT_ROOT, "out");

/** The renderer every take starts from (copied into <take>/src). */
export const STARTER_DIR = path.join(PROJECT_ROOT, "src", "starter");

/** The dashboard's Vite root, and where `vite build` writes it. */
export const WEB_DIR = path.join(PROJECT_ROOT, "web");
export const WEB_DIST_DIR = path.join(PROJECT_ROOT, "dist", "web");

/** The background music library unless HPG_MUSIC_DIR points elsewhere. */
export const DEFAULT_MUSIC_DIR = path.join(PROJECT_ROOT, "music");

/** The sound-effect library unless HPG_SFX_DIR points elsewhere. */
export const DEFAULT_SFX_DIR = path.join(PROJECT_ROOT, "sfx");

/** The 3D model library unless HPG_ASSETS_DIR points elsewhere. */
export const DEFAULT_ASSETS_DIR = path.join(PROJECT_ROOT, "assets");

/** `p` relative to the repository, with forward slashes, for log lines. */
export function relativeToRoot(p: string): string {
  return path.relative(PROJECT_ROOT, p).replace(/\\/g, "/");
}
