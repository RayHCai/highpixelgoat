import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { importScenario } from "../project/generate";
import { variantDir } from "../project/store";
import { serveFolder } from "../render/capture";
import { renderStills, renderVideo } from "../render/video";
import { describeError } from "../shared/errors";
import { readJson } from "../shared/json";
import { relativeToRoot } from "../shared/paths";
import { CoreSpecSchema, specLabel } from "../take/core";

/**
 * Render a generated site folder (or a hand-written scenario JSON) to an mp4
 * or to stills, without the dashboard.
 *
 *   npm run render -- out/<project>/<a|b|c> [options]
 *   npm run render -- scenarios/<id>.json [options]      (imported into out/ first)
 *
 * Options:
 *   --out <file.mp4>        output path (default <site>/video.mp4)
 *   --snapshots 0,10,28     write stills at these seconds instead of a video
 *   --start <s> --end <s>   render a sub-range (video only)
 *   --crf <n>               x264 quality, lower is better (default 18)
 *   --png                   capture PNG frames (slower, lossless)
 */

interface Options {
  input: string;
  out: string | null;
  snapshots: number[] | null;
  start: number;
  end: number | null;
  crf: number;
  png: boolean;
}

function parseArgs(argv: string[]): Options {
  const o: Options = { input: "", out: null, snapshots: null, start: 0, end: null, crf: 18, png: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    if (a === "--out") o.out = next();
    else if (a === "--snapshots") o.snapshots = next().split(",").map(Number);
    else if (a === "--start") o.start = Number(next());
    else if (a === "--end") o.end = Number(next());
    else if (a === "--crf") o.crf = Number(next());
    else if (a === "--png") o.png = true;
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else o.input = a;
  }
  if (!o.input) {
    throw new Error("usage: npm run render -- out/<project>/<a|b|c> | scenarios/<id>.json [--snapshots 0,5,10]");
  }
  return o;
}

async function main(): Promise<void> {
  const o = parseArgs(process.argv.slice(2));
  let dir = path.resolve(o.input);
  if (!existsSync(dir)) throw new Error(`no such path: ${dir}`);
  if (statSync(dir).isFile()) {
    console.log(`importing ${relativeToRoot(dir)} into out/ (voicing the narration)...`);
    const project = await importScenario(dir);
    dir = variantDir(project.id, "a");
    console.log(`site: ${relativeToRoot(dir)}`);
  }
  const specJson = readJson<unknown>(path.join(dir, "spec.json"));
  if (!specJson) throw new Error(`${dir} is not a generated site (no spec.json)`);
  const spec = CoreSpecSchema.parse(specJson);
  const labels = [specLabel(spec, "style"), specLabel(spec, "world", "terrain")].filter(Boolean).join(", ");
  console.log(
    `"${spec.title}"${labels ? ` [${labels}]` : ""} ${spec.format.duration}s @ ${spec.format.fps}fps${spec.audio ? ", narrated" : ", silent"}`,
  );

  const site = await serveFolder(dir);
  const pageUrl = `${site.url}/index.html?capture=1`;
  const started = Date.now();
  try {
    if (o.snapshots) {
      const files = await renderStills({ pageUrl, spec, times: o.snapshots, outDir: o.out ?? dir, jpeg: !o.png });
      for (const f of files) console.log(`wrote ${relativeToRoot(f)}`);
    } else {
      const out = o.out ? path.resolve(o.out) : path.join(dir, "video.mp4");
      await renderVideo({
        pageUrl,
        spec,
        out,
        audio: spec.audio ? path.join(dir, spec.audio.src) : null,
        jpeg: !o.png,
        crf: o.crf,
        start: o.start,
        end: o.end,
        onProgress: (done, total) => {
          const elapsed = (Date.now() - started) / 1000;
          const eta = (elapsed / done) * (total - done);
          process.stdout.write(`\rframe ${done}/${total}  ${elapsed.toFixed(0)}s elapsed, ~${eta.toFixed(0)}s left   `);
        },
      });
      process.stdout.write("\n");
      console.log(`wrote ${relativeToRoot(out)}`);
    }
  } finally {
    await site.close();
  }
}

main().catch((err: unknown) => {
  console.error(describeError(err));
  process.exit(1);
});
