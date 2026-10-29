import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describeError } from "../shared/errors";
import { DEFAULT_ASSETS_DIR } from "../shared/paths";
import { inspectGlb, type GlbSummary } from "./glb";

/**
 * The local 3D asset library: drop .glb files into assets/ (or the folder
 * HPG_ASSETS_DIR points at), in subfolders if you like. The scene agent sees
 * every model's name, size, weight and animations, and brings the ones a
 * scene needs into the take with the asset tool, which copies the file to
 * <take>/src/assets/<name>.glb. The take imports it from there with ?url, so
 * it is inlined into player.js like any other file under src/ and nothing is
 * fetched at runtime.
 *
 *   HPG_ASSETS_DIR   folder of .glb models, default <project>/assets
 */

export const ASSETS_DIR = process.env.HPG_ASSETS_DIR ? path.resolve(process.env.HPG_ASSETS_DIR) : DEFAULT_ASSETS_DIR;
/** Subfolder levels searched below the library root. */
const MAX_DEPTH = 4;
/** Models listed in the system prompt; the rest are named by the asset tool when asked for. */
const MAX_LISTED = 250;

export interface LibraryAsset {
  /** Path below the library without ".glb", with forward slashes: what Claude sees and asks for. */
  name: string;
  file: string;
  bytes: number;
  summary: GlbSummary | null;
  /** Why it cannot be used, or null. */
  problem: string | null;
}

function findGlbs(root: string, dir: string, depth: number): string[] {
  if (depth > MAX_DEPTH) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return findGlbs(root, full, depth + 1);
    return e.isFile() && path.extname(e.name).toLowerCase() === ".glb" ? [full] : [];
  });
}

/** Every .glb in the library, inspected, sorted by name. */
export function listAssets(dir = ASSETS_DIR): LibraryAsset[] {
  if (!existsSync(dir)) return [];
  return findGlbs(dir, dir, 0)
    .map((file) => {
      const name = path.relative(dir, file).slice(0, -".glb".length).replace(/\\/g, "/");
      const bytes = statSync(file).size;
      try {
        const summary = inspectGlb(file);
        return { name, file, bytes, summary, problem: summary.unsupported };
      } catch (err) {
        return { name, file, bytes, summary: null, problem: `it could not be read: ${describeError(err)}` };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function round(v: number): string {
  return String(Number(v.toPrecision(2)));
}

function weight(bytes: number): string {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/** One line per model: name, size in metres (w x h x d), triangles, file size and animations. */
export function describeAsset(a: LibraryAsset): string {
  if (!a.summary) return `- ${a.name}: unusable, ${a.problem ?? "unreadable"}`;
  const s = a.summary;
  const tris = s.triangles >= 1000 ? `${round(s.triangles / 1000)}k` : String(s.triangles);
  const anims = s.animations.length
    ? `; animations: ${s.animations.map((c) => `${c.name} ${c.seconds.toFixed(1)}s`).join(", ")}`
    : "";
  return `- ${a.name}: ${s.size.map(round).join(" x ")} m, ${tris} triangles, ${weight(a.bytes)}${anims}`;
}

/** The 3D ASSETS section of the system prompt for the current library. */
export function assetsPrompt(assets: LibraryAsset[]): string {
  const usable = assets.filter((a) => !a.problem);
  for (const a of assets.filter((x) => x.problem)) console.warn(`[assets] ${a.name} is skipped: ${a.problem}`);
  if (usable.length === 0) {
    return "3D ASSETS\nNo ready-made 3D models are available right now. Build every model from primitives.";
  }
  const listed = usable.slice(0, MAX_LISTED).map(describeAsset);
  if (usable.length > MAX_LISTED) {
    listed.push(`- and ${usable.length - MAX_LISTED} more: ask the asset tool for a word and it lists the matches`);
  }
  return [
    "3D ASSETS",
    "Ready-made glTF models from the author's library. Use one when the scene needs something primitives would make crude (a character, an animal, a vehicle, furniture, a landmark) and it fits the look; build from primitives when nothing here fits or the thing is simple. Bring one into the take with the asset tool (mcp__take__asset), which copies it under src/assets/ and says how to import it; CLAUDE.md explains loading, sizing, restyling and animating it with src/scene/assets.ts. Sizes are as authored, width x height x depth in metres (1 world unit is about 2.83 m), and many models are not to scale, so size each one deliberately. Every model you use adds its file size to player.js: prefer light ones and bring in only what is on screen. Available:",
    listed.join("\n"),
  ].join("\n");
}

/** Where a library model lives inside a take, relative to the take, with forward slashes. */
export function takeAssetPath(name: string): string {
  return `src/assets/${name}.glb`;
}

/** Names in the library that share a word with `wanted`, for an error message. */
function similar(wanted: string, assets: LibraryAsset[]): string[] {
  const words = wanted
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  return assets.filter((a) => words.some((w) => a.name.toLowerCase().includes(w))).map((a) => a.name);
}

/**
 * Copy the library model `name` into the take in `dir` and return it. The
 * name must be one the library lists, so nothing outside the library is ever
 * read and nothing outside src/assets is ever written.
 */
export function addAsset(dir: string, name: string, assets: LibraryAsset[] = listAssets()): LibraryAsset {
  const wanted = name
    .trim()
    .replace(/\.glb$/i, "")
    .toLowerCase();
  const asset = assets.find((a) => a.name.toLowerCase() === wanted);
  if (!asset) {
    const near = similar(name, assets).slice(0, 40);
    const hint = near.length
      ? `Similar: ${near.join(", ")}.`
      : assets.length
        ? "Use a name from the 3D ASSETS list."
        : "The library is empty.";
    throw new Error(`No 3D asset is named "${name}". ${hint}`);
  }
  if (asset.problem) throw new Error(`${asset.name} cannot be used: ${asset.problem}.`);
  const target = path.join(dir, ...takeAssetPath(asset.name).split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(asset.file, target);
  return asset;
}
