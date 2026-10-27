import type { Page } from "playwright";
import { seekAndWait } from "../render/capture";
import { describeError } from "../shared/errors";
import type { CoreSpec } from "../take/core";
import { readTakeMeta, voiceTake } from "../take/folder";
import { buildSite } from "../take/site";
import type { TakeSession } from "./session";

/**
 * The gate a take must pass before it is shown: a valid spec and take.json,
 * narration in sync with the script, a clean build, a player that starts
 * without errors, and frames that are the same whichever order they are
 * drawn in. Returns the problems, empty when the take is good.
 */
export async function verifyTake(session: TakeSession): Promise<string[]> {
  let spec: CoreSpec;
  try {
    readTakeMeta(session.dir);
    spec = await voiceTake(session.ctx);
  } catch (err) {
    return [describeError(err)];
  }
  const report = await buildSite(session.dir);
  if (!report.ok) return report.errors;

  const errors: string[] = [];
  let page: Page;
  try {
    page = await session.openPlayer(spec, (m) => errors.push(m));
  } catch (err) {
    return [`the player did not start: ${describeError(err)}`, ...errors.slice(0, 10)];
  }
  try {
    const problems: string[] = [];
    const d = spec.format.duration;
    const mid = Math.round(d * 0.5 * 100) / 100;
    if (!(await seekIsStateless(page, mid, [d - 0.1, 0, d * 0.25]))) {
      problems.push(
        `the frame at ${mid}s changed after seeking to other times and back: something carries state between frames or depends on the order frames are drawn in`,
      );
    }
    problems.push(...errors.filter((e) => e.startsWith("[page]")).slice(0, 10));
    return problems;
  } finally {
    await page.close();
  }
}

/** Draw `t`, visit the other times, draw `t` again: the two frames must be identical. */
async function seekIsStateless(page: Page, t: number, elsewhere: number[]): Promise<boolean> {
  await seekAndWait(page, t);
  const first = await page.screenshot({ type: "png" });
  for (const other of elsewhere) await seekAndWait(page, other);
  await seekAndWait(page, t);
  const again = await page.screenshot({ type: "png" });
  return first.equals(again);
}
