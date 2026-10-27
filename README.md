# highpixelgoat

A small dashboard that turns one sentence into finished short-form videos.
Type a hypothetical scenario and a style; Claude writes the take, narrated by
a synthetic voice with word-synced subtitles and a background track, rendered
as a three.js re-creation of the scenario in the place it would really happen
(a bedroom, a kitchen, a street, a downtown plaza, a park, or a landscape),
with the subject modelled to look like the thing it is about and the other
people, pets, cars and objects moving around it, and built as its own 9:16 web
page with an Instagram caption. Talk to Claude to change it, copy the caption,
download the mp4. One video at a time.

The prompt can be any hypothetical. Every take starts as a copy of a working
starter renderer (sets, part models, extras, weather, an auto-framing camera,
the text overlay) in its own folder, and Claude directs the video from there
like a developer in a repo: it writes the script, records the narration,
changes the take's code to build whatever the idea needs (a new place, night,
cuts between scenes, characters that act, a custom camera), builds it, and
looks at real frames until it is right. The starter's three formats are
where it begins, not a limit: "your cheeks double every hour" can be a
**scale** video, "what happens to your parents when you move out" a
**story**, "cocaine snows over NYC" an **overview**, and "you wake up in 1850"
something the starter never had.

```
"your cheeks double in size every hour, pixel art"
        │
        ▼  starter copied into out/<id>/a/src, local Claude Code (claude-opus-5-5) works in the folder:
   spec.json + take.json  ->  voice  ->  edit src/  ->  build  ->  snapshot  ->  ...  ->  final check
        │
        ├──▶ dashboard          preview it
        ├──▶ chat with Claude   "make it night", "cut to the beach at the end", "make the dog wave"
        ▼  render               headless Chromium frames + narration -> video.mp4
```

The look: a subject on a voxel, low-poly or hand-drawn set (growing, walking
about, or standing in a city under the weather), a big serif heading, bold
stat lines, a red rule pill, and the spoken line as an italic subtitle that
lights up word by word.

## Requirements

- Node 22+
- ffmpeg and ffprobe on PATH
- Chromium for Playwright: `npx playwright install chromium` after `npm install`
- Claude Code installed and logged in (`claude` on PATH); it directs every take and chat edit through the Agent SDK
- A voice (picked automatically, see below); nothing to install for the default

## Quick start

```bash
npm install
npx playwright install chromium

claude   # once, to log in to Claude Code if you have not
npm run dev
# open http://localhost:5173
```

Type a scenario and a style, press Enter. Claude directs the take (several
minutes, and many more tokens than a single script call; what it is doing
shows on the card; a second request waits for the first) and it opens next to
a chat panel. Every message goes back to Claude in the take's folder, where
anything can change: lines, numbers, the place, models, the camera, the
light, the narrator, the track, the caption. The narration is re-recorded for
changed lines, the take is checked again, and the preview reloads; an edit
that fails its check is rolled back. The Instagram caption
and hashtags sit under the preview with a Copy link. "Render video" exports
the mp4 (a few minutes, progress shown) and turns into a download button.

No Claude Code? `HPG_OFFLINE=1 npm run dev` runs the whole dashboard with five
built-in example scripts standing in for Claude (three that scale, one story,
one overview), so voicing, previews, the chat plumbing and video export can be
tried first.

## Configuration

Set these in the shell or in a `.env` file (see `.env.example`).

| Variable                                 | Meaning                                                                                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HPG_CLAUDE_AUTH`                        | `login` (default): Claude Code uses the account `claude` is logged in to, and `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` are kept from it. `api-key`: Claude Code gets `ANTHROPIC_API_KEY` and bills it |
| `HPG_CLAUDE_PATH`                        | The `claude` executable to run; default the one on PATH, else the copy bundled with the Agent SDK                                                                                                         |
| `HPG_MODEL`                              | Claude model id, default `claude-opus-5-5`                                                                                                                                                                |
| `HPG_OFFLINE=1`                          | No Claude calls; built-in example scripts stand in                                                                                                                                                        |
| `HPG_TTS`                                | Voice provider: `elevenlabs`, `edge`, `sapi`, `none`. Default: `elevenlabs` when `ELEVENLABS_API_KEY` is set, otherwise `edge`                                                                            |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_MODEL` | ElevenLabs credentials and model (default `eleven_multilingual_v2`)                                                                                                                                       |
| `ELEVENLABS_VOICE_ID`                    | Force one ElevenLabs voice for every narrator persona                                                                                                                                                     |
| `HPG_EDGE_VOICE`                         | Force one Microsoft Edge voice for every narrator persona                                                                                                                                                 |
| `HPG_SAPI_VOICE`                         | Windows built-in voice name for the offline `sapi` provider                                                                                                                                               |
| `HPG_MUSIC_DIR`                          | Folder of background tracks, default `music/`                                                                                                                                                             |
| `HPG_MUSIC_VOLUME`                       | Music level under the voice before ducking, 0 to 1, default 0.22                                                                                                                                          |
| `HPG_MUSIC_SOLO_VOLUME`                  | Music level in a take with no narration, 0 to 1, default 0.6                                                                                                                                              |
| `HPG_SFX_DIR`                            | Folder of sound effects, default `sfx/`                                                                                                                                                                   |
| `PORT`                                   | Dashboard port, default 5173                                                                                                                                                                              |
| `HOST`                                   | Interface to listen on, default `127.0.0.1`; `0.0.0.0` opens the dashboard (and your Claude account) to the network                                                                                       |

Claude has no speech API, so narration comes from a text-to-speech provider.
Claude picks a narrator persona and pace for each take to fit its vibe
(`narrator`, `buddy`, `bright`, `cheerful`, `dry`, `posh`, `hype`,
`storyteller`; `relaxed`, `brisk`, `fast`), and each provider maps the persona
onto one of its voices: Edge neural voices are free, keyless and return word
timings, so they are the default; ElevenLabs gives the smoothest result;
Windows SAPI works with no network at all; `none` builds silent videos timed
from an estimated reading speed. Ask in chat to change the narrator.

## Background music

Drop tracks into `music/` (mp3, m4a, aac, wav, ogg or flac). Every take gets
one mixed quietly under the narration, looped to the length of the video,
faded in and out, and ducked by the voice itself (a sidechain compressor keyed
on the narration) so every word stays on top. Claude sees the file names and
picks the one that fits the vibe of each take, so name files by feel
(`upbeat-ukulele.mp3`, `dramatic-cinematic.mp3`, `lofi-chill.mp3`); a take whose
pick matches nothing gets a deterministic choice. The preview and the exported
mp4 play the same mixed track. Ask in chat to switch tracks or to drop the
music. With an empty folder, takes are narration only.

Beats can also cue the track (`musicCue`: `low`, `cut`, `swell`, `play`), so the
music drops out on a loaded moment, comes back on the next shot, lifts at the
payoff and sinks under an end card. A take with no narration (a silent,
subtitle-only reel) plays the music louder, at `HPG_MUSIC_SOLO_VOLUME`.

## Sound effects

`npm run sfx` writes a synthesized starter set into `sfx/` (controller clicks,
a phone buzz, a message ping, typing, a soft thud, a whoosh, room tone); add
your own recordings next to them. Claude sees the names and places effects on
beats (`sfx: [{ name, offset, volume }]`), mixed on top of the voice and the
music. See [sfx/README.md](sfx/README.md).

## Commands

| Command                                                                                      | What it does                                                         |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                                                                                | Dashboard with hot reload plus the API, on `PORT`                    |
| `npm run build` / `npm start`                                                                | Build the dashboard, serve it without Vite                           |
| `npm run generate -- "<scenario and style>"`                                                 | Same pipeline as the dashboard from the terminal; writes `out/<id>/` |
| `npm run render -- out/<id>/<a\|b\|c> [--snapshots 0,10,28] [--out f.mp4] [--png] [--crf n]` | Export a built site to mp4 (or stills) without the dashboard         |
| `npm run render -- <scenario>.json`                                                          | Import a hand-written scenario into `out/` (voiced) and render it    |
| `npm run sfx [-- --force]`                                                                   | Write the starter sound effects into `sfx/`                          |
| `npm run check`                                                                              | Format check, lint, typecheck and tests (see Development)            |

A full render is slow but hands-off: a 30-second short takes 5 to 15 minutes
on a laptop (every frame is rendered in software WebGL via SwiftShader and
screenshotted, so no GPU is needed). `--snapshots` is the fast way to check a
take.

## What ends up in out/

```
out/<project id>/
  project.json          prompt, status of each take, caption, video state
  a/ b/ c/              one self-contained site per take
    index.html          the 9:16 page (fonts from Google Fonts, everything else local)
    src/                the take's own renderer: a copy of the starter that Claude extends
    CLAUDE.md           the map of that code and the contract it keeps
    player.js           src/ bundled (three.js inlined)
    spec.json           the timed scenario the page plays, in the take's own schema
    take.json           angle, music, caption and hashtags
    script.json         offline takes only: the starter-shaped script that offline chat edits
    caption.txt         the Instagram caption and hashtags, ready to paste
    audio/narration.mp3 the narration alone
    audio/track.mp3     the narration with the music and sound effects mixed in (what the page and video play)
    audio/clips/        one clip per line, cached by voice + text
    chat.json           the edit conversation
    agent.json          the Claude Code session the take lives in, resumed by chat
    video.mp4           the export, once rendered
```

Open any site directly at `http://localhost:5173/out/<id>/<take>/index.html`.
`?capture=1&t=12` shows the exact frame at 12 seconds with no controls, which is
what the exporter screenshots.

## Security

The dashboard spends the Claude account (and any ElevenLabs key) it runs
with, so it is built to stay on your machine:

- It listens on `127.0.0.1` and, while it does, answers only requests
  addressed to `localhost`, and accepts changes only from its own page, so
  other web pages you visit cannot drive it.
- The scene agent has Claude Code's file tools only (no shell, no web), kept
  inside the take folder, and a take's build cannot read files outside it.
- Keys live in `.env`, which git ignores. With the default
  `HPG_CLAUDE_AUTH=login`, `ANTHROPIC_API_KEY` is not used at all and is kept
  from Claude Code, so leave it out unless you choose `api-key`.

`out/` holds your prompts, chat history and Claude Code session ids; git ignores
it too.

## Development

```bash
npm run check        # format check, lint, typecheck, tests: what CI runs
npm run format       # apply Prettier
npm run lint:fix     # apply ESLint fixes
npm run test:coverage
```

CI (`.github/workflows/ci.yml`) runs the same checks plus `npm run build` on
Ubuntu and Windows for every push and pull request. How the code is organised,
and the rules that keep it that way, are in
[docs/architecture.md](docs/architecture.md); guidance for coding agents
working on this repository is in [AGENTS.md](AGENTS.md).
