# Architecture

highpixelgoat is a single-process TypeScript monolith: one Node server (the
API, the generation and render queues, the scene agent) plus two browser
bundles built from the same repository (the dashboard, and the starter
renderer that every take copies and bundles on its own). State is the
`out/` folder on disk, so there is no database and the server survives
restarts.

## Layers

`src/` is organised by layer. A layer may import from the layers before it,
never from the ones after it, and peers never import each other. ESLint
enforces this (`no-restricted-imports` in `eslint.config.js`), so a wrong
import fails `npm run lint` and CI.

```
shared ─▶ starter ─▶ script ┐
                     voice  ├─▶ take ─▶ agent ─▶ project ─▶ server
                     render ┘                            └─▶ cli
```

| Layer          | Runs in | What it owns                                                                                                                        |
| -------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/`  | Node    | Framework-free helpers: repository paths, atomic JSON files, child processes, text, error messages. Depends on nothing else in src. |
| `src/starter/` | Browser | The renderer every take starts from (`player/`, `hud/`, `scene/`, `spec/`) and `TAKE_GUIDE.md`. Self-contained: three and zod only. |
| `src/script/`  | Node    | The flat starter-shaped script: its schema, the lift into a full spec, the bundled examples, and offline mode.                      |
| `src/voice/`   | Node    | Text-to-speech providers (ElevenLabs, Edge, Windows SAPI, silent), the music library, ffmpeg mixdown.                               |
| `src/render/`  | Node    | Headless Chromium capture (`capture.ts`) and the ffmpeg video/stills exporter (`video.ts`).                                         |
| `src/take/`    | Node    | One take folder: the core spec contract, seeding and building the site, narration, the 3D asset library, the Instagram caption.     |
| `src/agent/`   | Node    | The scene agent: Claude Code config, system prompt, path guard, session, MCP take tools, the verify gate, the run loop.             |
| `src/project/` | Node    | Projects and their records, the on-disk store, and the pipelines: generate, chat, render.                                           |
| `src/server/`  | Node    | The Express API and dev/prod serving. Thin: validates input and calls `project/`.                                                   |
| `src/cli/`     | Node    | `npm run generate` and `npm run render`. Thin, like the server.                                                                     |
| `web/`         | Browser | The dashboard. May import only `src/project/records.ts` (types) and `src/shared/text.ts`.                                           |
| `tests/`       | Node    | `node:test` suites, one file per area.                                                                                              |

## How a take is made

**Takes own their renderer.** `src/starter/` is the starter.
`seedScene` in `src/take/site.ts` copies its `player/`, `hud/`, `scene/` and
`spec/` into each new take's `src/`, writes `src/starter/TAKE_GUIDE.md` into
the take as `CLAUDE.md` (the map of the code and the contract it keeps), then
`buildSite` bundles that copy into the take's own `player.js` with Vite.
Changing the starter changes future takes only; existing takes keep their
code.

**The scene agent.** `src/agent/run.ts` runs the local Claude Code as a
library (`@anthropic-ai/claude-agent-sdk`, `query()`) with the take folder as
its working directory. It gets Claude Code's own Read, Write, Edit, Glob and
Grep (no shell, no web), kept inside the take by a PreToolUse hook
(`guardToolCall` in `src/agent/guard.ts`: writes only to `src/`, `spec.json`
and `take.json`; paths and file patterns never leave the take). The bundler is
kept there too: `confineToTake` (`src/take/confine.ts`) refuses imports from
outside the take and `node_modules`, stylesheets Vite would process, workers
and `import.meta.url`, so a take's code cannot copy a file such as `.env` into
its `player.js`. Then there is an in-process MCP server (`src/agent/take-server.ts`)
with this project's tools: `voice` (record and time the narration), `build`
(determinism lint, type check, bundle), `asset` (copy a model from the 3D asset
library into the take, `src/take/assets.ts`) and `snapshot` (real 1080x1920 frames
from headless Chromium, returned as images so Claude sees what it made). Your
own Claude Code settings, hooks, plugins and memory are not loaded. When
Claude stops, the take must pass `verifyTake` (`src/agent/verify.ts`): a valid
core spec, narration in sync, a clean build, a player that starts without page
errors, and a frame that is identical whether it is drawn first or after
seeking elsewhere. A failing take goes back to the same session with the
problems, twice at most. The session id is kept in the take's `agent.json`, so
chat edits (`src/project/chat.ts`) resume the conversation the take was made
in; an edit that fails its check is rolled back. The server log shows which
credentials each run used and its estimated cost.

**Contract.** The server reads only the core of a take's `spec.json`
(`src/take/core.ts`: title, voice, format, beats with narration) and passes
everything else through, so a take can grow its schema freely. Frames must be
pure functions of time (no `Math.random`, `Date` or `performance.now` outside
the player shell), `window.__hpg.seek` must keep working, the stage stays
1080x1920, and nothing is fetched at runtime. The determinism rule is checked
twice: by ESLint on the starter in this repository, and by
`determinismProblems` in `src/take/site.ts` on every take's own code at build
time.

**Spec (starter).** `src/starter/spec/schema.ts` is the starter's contract
between the script and the renderer: style, set, the subject model, the
standing rule, the narrator, and a list of beats. A beat has a heading, stat
lines, the spoken line, a target subject scale, effects, and, once voiced, the
measured line length and word timings.

**Models (starter).** The subject is a list of primitives (boxes, spheres,
cylinders, cones with colours and rotations) that Claude composes to look like
the thing the scenario is about. `src/starter/spec/parts.ts` normalises the
model so its largest dimension is 1 and it rests on the ground;
`src/starter/scene/subject.ts` voxelises it for the pixel style or builds the
primitives for the others. The extras are the other people, animals, vehicles
and objects in the scene: each is its own part model with a real size in
metres and beat-timed keyframes; `resolveActors` in
`src/starter/spec/timing.ts` glides them between keyframes, and
`src/starter/scene/actors.ts` draws them life-sized while the subject grows.
Ready-made models come from the 3D asset library instead: the `asset` tool
copies a `.glb` into the take's `src/assets/`, and `src/starter/scene/assets.ts`
loads it (a top-level await, so it is ready before the first frame), sizes it,
restyles it to the take's look and poses its animation clips at exact times.
`src/script/` keeps the flat starter-shaped script (`schema.ts`, `lift.ts`)
that the offline examples and imports are written in.

**Voice.** `src/take/narrate.ts` records every line with the chosen provider
(`src/voice/`), measures it with ffprobe, lays the beats out so each one holds
the screen for exactly its line plus a breath (`fitNarration` in
`src/starter/spec/timing.ts`), mixes one narration track with ffmpeg, then
lays the chosen background track under it (`src/voice/music.ts`,
`mixMusicArgs` in `src/voice/mixdown.ts`). The voice is the clock: the video
length is derived from the audio, not the other way round.

**Timeline.** `src/starter/spec/timing.ts` is pure: given a spec and a time it
returns everything the frame needs, so seeking is exact and capture is
deterministic. Subject growth is interpolated in log space with a small
overshoot; the camera follows a faster, non-overshooting curve; extreme growth
is compressed onto a bounded visual size.

**Sets.** `src/starter/scene/terrain.ts` builds a seeded height field and
colours it by setting; `src/starter/scene/props.ts` stands everything else on
it with instanced meshes. The camera always sits on the open side of a room,
and anything on that side of the subject is capped below the line of sight
(`src/starter/scene/layout.ts`), so nothing ever hides it.

**HUD.** `src/starter/hud/hud.ts` is the text overlay; the subtitle keeps the
written line (punctuation included) and aligns each word to the voice timings.

**Export.** `src/render/video.ts` opens a take's folder in headless Chromium
(`src/render/capture.ts`), calls `window.__hpg.seek(t)` per frame,
screenshots, and pipes frames plus the narration track into ffmpeg
(`src/project/render.ts` queues renders one at a time).

**Server and dashboard.** `src/server/app.ts` is a small Express API over
`out/`. Every request first passes `requestRefusal` (`src/server/origin.ts`):
while the server listens on loopback the `Host` must be a loopback name (no
DNS rebinding), and a request that changes anything must carry the
dashboard's own `Origin` or none (no cross-site form posts); `web/` is the dashboard (vanilla TypeScript, served by Vite in
development): `main.ts` routes, `home.ts` and `project.ts` are the two views,
`status.ts` holds the pure (tested) wording of a take's state.

## Queues and concurrency

One server process owns `out/`. Generation (`src/project/generate.ts`) and
rendering (`src/project/render.ts`) each run through an in-process promise
queue, one job at a time, so read-modify-write of `project.json`
(`updateVariant` in `src/project/store.ts`) needs no locking. Running two
servers against the same `out/` is not supported. `recoverInterrupted` marks
anything in flight as failed on startup.
