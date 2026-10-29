import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describeError } from "../shared/errors";
import { relativeToRoot } from "../shared/paths";
import { ASSETS_DIR } from "../take/assets";
import { buildCharacter, CHARACTERS } from "../take/characters";
import { encodeGlb } from "../take/glb-writer";

/**
 * Write the built-in characters into the 3D asset library as .glb files, so
 * the scene agent has models to use before any are downloaded. Files that
 * already exist are kept; replace any of them with a better model of the
 * same name whenever you have one.
 *
 *   npm run assets              write the missing ones
 *   npm run assets -- --force   rewrite all of them
 */

function main(): void {
  const force = process.argv.includes("--force");
  for (const character of CHARACTERS) {
    const out = path.join(ASSETS_DIR, ...`${character.name}.glb`.split("/"));
    if (existsSync(out) && !force) {
      console.log(`kept     ${relativeToRoot(out)}`);
      continue;
    }
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, encodeGlb(buildCharacter(character)));
    console.log(`wrote    ${relativeToRoot(out)}`);
  }
}

try {
  main();
} catch (err) {
  console.error(describeError(err));
  process.exit(1);
}
