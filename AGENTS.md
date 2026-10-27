# Working on highpixelgoat

Guidance for coding agents (and people) changing this repository. Read
[docs/architecture.md](docs/architecture.md) for how the system works; this
file is the rules and the workflow.

## Commands

```bash
npm run check          # format:check + lint + typecheck + test. Run before you say you are done.
npm run format         # Prettier, writes
npm run lint:fix       # ESLint autofixes
npm test               # node:test via tsx, tests/*.test.ts
npm run build          # dashboard into dist/web
npm run dev            # dashboard + API on http://localhost:5173
HPG_OFFLINE=1 HPG_TTS=none npm run generate -- "<prompt>"     # full pipeline, no Claude, no network
npm run render -- out/<id>/a --snapshots 1,20                  # stills of a take, via headless Chromium
```

Node 22+ (`.nvmrc`), npm (`package-lock.json`). ffmpeg/ffprobe and Playwright's
Chromium are needed for voicing and rendering, not for `npm run check`.

## Two codebases in one repo

1. **The app** (`src/` except `src/starter/`, plus `web/`): the server,
   pipeline, scene agent and dashboard.
2. **The starter renderer** (`src/starter/`): a browser bundle that is
   _copied_ into every new take (`out/<id>/<take>/src/`) and then edited by the
   scene agent there. `src/starter/TAKE_GUIDE.md` becomes each take's
   `CLAUDE.md`. Changing the starter affects future takes only.

Never edit anything under `out/`: it is generated data (and the user's archive
of videos), not source. To change how takes look, change `src/starter/`.

## Architecture rules (lint-enforced)

Layers, lowest first. Import only from layers to the left; peers on the same
line never import each other:

```
shared → starter → script | voice | render → take → agent → project → server | cli
```

- `src/shared/` depends on nothing else in `src/`.
- `src/starter/` imports only itself, `three` and `zod`: no `node:*`, nothing
  from `../../`. It is shipped to the browser and into takes.
- Starter frames are pure functions of `t`: no `Math.random`, `Date.now`,
  `new Date` or `performance.now` outside `src/starter/player/`. Use
  `makeRng(seed)` / `valueNoise` from `scene/noise.ts`.
- `web/` imports only `src/project/records.ts` (types) and `src/shared/text.ts`.
- `src/server/` and `src/cli/` stay thin: parse input, call `src/project/`,
  format output. Business logic belongs in `project/` or below.

If a change seems to need an upward import, the code is in the wrong layer:
move the shared piece down rather than adding an exception.

## Conventions

- TypeScript strict, ESM, `noUncheckedIndexedAccess`. Prettier (120 cols) and
  ESLint own formatting and style; do not hand-format against them.
- Validate untrusted input (HTTP bodies, files on disk, model output) with zod
  at the boundary; trust types inside.
- Errors: throw `Error` with a message a user can act on; turn unknowns into
  text with `describeError` (`src/shared/errors.ts`). Re-throws keep `{ cause }`.
- Files: `readJson` / `writeJson` (`src/shared/json.ts`, atomic). Child
  processes: `runProcess` / `runChecked` (`src/shared/process.ts`). Paths:
  `src/shared/paths.ts`, never `__dirname` arithmetic.
- Configuration comes from `HPG_*` environment variables, read where they are
  used and documented in `README.md` and `.env.example`. Add new ones to both.
- Comments explain why, at the density of the surrounding code: a short doc
  comment on each export and module, nothing that restates the code.
- Keep modules small and single-purpose; split a file when it starts doing two
  jobs rather than when it hits a line count.

## Tests

- `node:test` + `node:assert/strict`, one file per area in `tests/`.
- Pure logic (timing, lift, captions, mixdown args, the path guard, dashboard
  wording) gets unit tests. The HTTP API is tested in-process with
  `createApp({ dashboard: "none" })` and `HPG_OFFLINE=1`.
- Tests must not need the network, ffmpeg, a browser or Claude, and must not
  write to `out/`. Use `mkdtempSync(tmpdir())` for files.
- Rendering and the scene agent are verified by running them (see Commands),
  not by unit tests. After touching `src/starter/`, `src/take/` or
  `src/render/`, run an offline generate plus `--snapshots` and look at the
  frames.

## Gotchas

- The dev server does not hot-reload server code: restart `npm run dev` after
  changing anything under `src/` (the dashboard under `web/` hot-reloads).
- The server listens on `127.0.0.1` by default; it spends the Claude account
  it runs with, so do not widen `HOST` casually.
- One process owns `out/`; the generation and render queues are in-memory.
  Do not run two servers against the same `out/`.
- Takes made before a change keep their own copy of the starter. A starter
  bug fix does not reach them unless the take is regenerated or edited.
- The scene agent's security boundary is `src/agent/guard.ts` (its tools) plus
  `src/take/confine.ts` (what the bundler may read for a take). Keep
  `tests/guard.test.ts` and `tests/take.test.ts` covering every rule you change.
- `src/server/origin.ts` refuses foreign `Host` headers and cross-site writes;
  keep `tests/server.test.ts` covering it.
