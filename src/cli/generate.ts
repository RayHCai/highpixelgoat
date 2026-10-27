import { createProject } from "../project/generate";
import { readProject, variantDir } from "../project/store";
import { describeError } from "../shared/errors";
import { relativeToRoot } from "../shared/paths";

/**
 * Generate a project from the command line: the same pipeline the dashboard
 * runs, one narrated take directed by the local Claude Code.
 *
 *   npm run generate -- "your cheeks double in size every hour, pixel art"
 *
 * Credentials: the account `claude` is logged in to (see src/agent/config.ts),
 * or HPG_OFFLINE=1 to use the bundled example scripts instead of Claude.
 */

async function main(): Promise<void> {
  const prompt = process.argv.slice(2).join(" ").trim();
  if (!prompt) throw new Error('usage: npm run generate -- "<scenario and style>"');

  const { project, done } = createProject(prompt);
  console.log(`project ${project.id}: "${prompt}"`);

  const seen = new Map<string, string>();
  const tick = setInterval(() => {
    const p = readProject(project.id);
    if (!p) return;
    for (const v of p.variants) {
      const line = v.status === "error" ? `error: ${v.error}` : v.status;
      if (seen.get(v.id) !== line) {
        seen.set(v.id, line);
        console.log(`  take ${v.id.toUpperCase()} (${v.angle}): ${line}`);
      }
    }
  }, 500);
  await done;
  clearInterval(tick);

  const p = readProject(project.id);
  if (!p) throw new Error(`project ${project.id} disappeared`);
  console.log("");
  for (const v of p.variants) {
    if (v.status === "ready") {
      console.log(
        `take ${v.id.toUpperCase()}: "${v.title}" [${v.style}, ${v.terrain}] ${v.duration}s  ->  out/${p.id}/${v.id}/`,
      );
    } else {
      console.log(`take ${v.id.toUpperCase()}: ${v.status} ${v.error ?? ""}`);
    }
  }
  console.log("");
  console.log(`dashboard:  npm run dev   then open http://localhost:5173/#/p/${p.id}`);
  console.log(`render:     npm run render -- ${relativeToRoot(variantDir(p.id, "a"))}`);
}

main().catch((err: unknown) => {
  console.error(describeError(err));
  process.exit(1);
});
