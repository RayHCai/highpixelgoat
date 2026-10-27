import { copyFileSync, cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "vite";
import { EXAMPLES } from "../script/examples";
import { toScenarioSpec } from "../script/lift";
import { describeError } from "../shared/errors";
import { readJson, writeJson } from "../shared/json";
import { PROJECT_ROOT, STARTER_DIR } from "../shared/paths";
import { runProcess } from "../shared/process";
import { escapeHtml } from "../shared/text";
import { confineToTake } from "./confine";

/**
 * Every take owns its renderer. When a take is created the starter (src/starter
 * in this repo: player, hud, scene and spec) is copied into <take>/src, and
 * from then on Claude edits that copy freely: new sets, cameras, models, cuts,
 * shaders. The copy is bundled into the take's own player.js, so nothing a take
 * does reaches the starter or another take, and older takes keep playing.
 *
 *   <take>/src/          the take's renderer (starts as the starter)
 *   <take>/CLAUDE.md     map of the code and the contract it must keep (src/starter/TAKE_GUIDE.md)
 *   <take>/spec.json     the script and everything the renderer reads
 *   <take>/take.json     angle, music, caption, hashtags
 *   <take>/index.html    the page; <take>/player.js the bundle
 */

export const STARTER_DIRS = ["player", "hud", "scene", "spec"] as const;
const ENTRY = path.join("src", "player", "main.ts");
const TAKE_GUIDE = path.join(STARTER_DIR, "TAKE_GUIDE.md");
const TSC = path.join(PROJECT_ROOT, "node_modules", "typescript", "bin", "tsc");

/** Calls that make a frame depend on more than t; the player shell (src/player) is exempt. */
const NONDETERMINISTIC = /\b(Math\.random|Date\.now|performance\.now)\s*\(|\bnew Date\s*\(/;

const TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "bundler",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    types: ["vite/client"],
    strict: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    isolatedModules: true,
  },
  include: ["src"],
};

export function hasScene(dir: string): boolean {
  return existsSync(path.join(dir, ENTRY));
}

/** Copy the starter into a take folder. Never overwrites a take's own src/. */
export function seedScene(dir: string): void {
  if (!hasScene(dir)) {
    for (const d of STARTER_DIRS) cpSync(path.join(STARTER_DIR, d), path.join(dir, "src", d), { recursive: true });
  }
  writeJson(path.join(dir, "tsconfig.json"), TSCONFIG);
  copyFileSync(TAKE_GUIDE, path.join(dir, "CLAUDE.md"));
  // A complete, valid spec to read next to the schema: a story-format take.
  writeJson(path.join(dir, "example.spec.json"), toScenarioSpec(EXAMPLES.d, { id: "example", seed: 7 }));
}

export function siteHtml(title: string): string {
  const safe = escapeHtml(title);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safe}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@800&family=Playfair+Display:ital,wght@0,500;1,400&display=swap"
      rel="stylesheet"
    />
    <style>html, body { margin: 0; height: 100%; background: #000; }</style>
  </head>
  <body>
    <script type="module" src="./player.js"></script>
  </body>
</html>
`;
}

export interface BuildReport {
  /** True when player.js was rebuilt and the determinism check passed. */
  ok: boolean;
  /** Problems that block the take: bundling errors and nondeterministic calls. */
  errors: string[];
  /** Type errors: the bundle still builds, but they usually mean a real bug. */
  typeErrors: string[];
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(full) : /\.(ts|js|mjs|glsl|vert|frag)$/.test(e.name) ? [full] : [];
  });
}

/** Every call in the take's renderer that would make a frame depend on the wall clock or chance. */
export function determinismProblems(dir: string): string[] {
  const shell = path.join(dir, "src", "player");
  const problems: string[] = [];
  for (const file of sourceFiles(path.join(dir, "src"))) {
    if (file.startsWith(shell + path.sep)) continue;
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (NONDETERMINISTIC.test(line) && !/^\s*(\/\/|\*)/.test(line)) {
          problems.push(
            `${path.relative(dir, file).replace(/\\/g, "/")}:${i + 1}: nondeterministic call (use t, the seed, makeRng or valueNoise): ${line.trim()}`,
          );
        }
      });
  }
  return problems;
}

/** Type-check the take's renderer. Resolves with the error lines, empty when clean. */
export async function typecheck(dir: string): Promise<string[]> {
  const args = [TSC, "-p", path.join(dir, "tsconfig.json"), "--pretty", "false"];
  try {
    const { stdout, stderr } = await runProcess(process.execPath, args, { cwd: dir });
    return `${stdout}${stderr}`.split(/\r?\n/).filter((l) => l.trim());
  } catch (err) {
    return [`could not run tsc: ${describeError(err)}`];
  }
}

/**
 * Bundle the take's renderer into its player.js and write its page. A failed
 * build, or code that fails the determinism check, leaves the previous
 * player.js in place, so the take keeps playing.
 */
export async function buildSite(dir: string, o: { typecheck?: boolean } = {}): Promise<BuildReport> {
  const errors = determinismProblems(dir);
  const typeErrors = o.typecheck ? await typecheck(dir) : [];
  if (errors.length) return { ok: false, errors, typeErrors };
  try {
    await build({
      configFile: false,
      root: dir,
      publicDir: false,
      logLevel: "silent",
      plugins: [confineToTake(dir)],
      // Takes live under out/ in this repo, so three and zod resolve from its node_modules.
      build: {
        target: "es2022",
        outDir: dir,
        emptyOutDir: false,
        copyPublicDir: false,
        minify: "esbuild",
        cssCodeSplit: false,
        lib: { entry: path.join(dir, ENTRY), formats: ["es"], fileName: () => "player.js" },
        rollupOptions: { output: { codeSplitting: false } },
      },
    });
  } catch (err) {
    errors.unshift(`bundle failed: ${describeError(err)}`.slice(0, 4000));
  }
  const spec = readJson<{ title?: unknown }>(path.join(dir, "spec.json"));
  writeFileSync(path.join(dir, "index.html"), siteHtml(typeof spec?.title === "string" ? spec.title : "Untitled"));
  return { ok: errors.length === 0, errors, typeErrors };
}
