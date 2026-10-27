# This take

This folder is one narrated 9:16 short (1080x1920, 30 fps), rendered in three.js and exported frame by frame. Everything in it is yours to change except where the contract below says otherwise.

## Files

- spec.json: the script and every number the renderer reads. Its shape is src/spec/schema.ts, which is yours to change. The voice tool records the narration and then writes `at`, `narrationSeconds` and `words` on every beat, `format.duration`, and `audio`; never set those by hand.
- take.json: what is not on screen: {"angle": "Deadpan", "music": "<track name or none>", "caption": "...", "hashtags": ["..."]}.
- example.spec.json: a complete valid spec for the starter (a story-format take). Read it, do not edit it.
- src/: this take's renderer. It starts as a copy of the starter and is bundled into player.js by the build tool.

## The starter, file by file

- src/player/main.ts: the page shell. Loads spec.json (parseSpec, then normaliseModels, then fitBeats), builds `new World(spec, canvas)` and `new Hud(spec, stage)`, and draws a frame with seek(t): `state = resolveState(spec, t); world.update(state); world.render(); hud.update(state, world.subjectTopOnScreen())`. Plays the audio and exposes window.__hpg for export.
- src/spec/schema.ts: the spec's zod schema. Add fields here when the scene needs new data, and read them in the scene code.
- src/spec/timing.ts: pure timeline math. resolveState(spec, t) returns the active beat, seconds since it started, the subject's size and position, the camera's framing size, the weather, and the effects firing. resolveActors(spec, t) places the extras. Every eased transition is a function of the seconds since a beat started.
- src/spec/parts.ts: part models (lists of box, sphere, cylinder and cone primitives). normaliseParts fits a model into the unit space.
- src/scene/world.ts: assembles the scene (renderer, sky and fog, lights, terrain, props, subject, extras, clouds, weather, effects, camera, post) and applies a TimelineState in update().
- src/scene/camera.ts: the auto-framing camera. distance = size * 5.5 + 1.5, orbiting slowly from a per-setting angle on the +z side of the subject and looking down more steeply as the framed size grows. The subject sits in the lower part of the frame.
- src/scene/terrain.ts: procedural height-field ground (voxel columns for pixels, faceted mesh otherwise). 200 x 200 units of detail around the origin plus a coarse ring to the horizon; the ground within 14 units of the origin is flat.
- src/scene/props.ts: everything standing on the ground, drawn as three instanced meshes (box, roof, ball): the suburb (houses, trees, parked cars), downtown (towers, lamps, benches), the park, and the cut-away rooms. Props on the camera side of the subject are capped in height (layout.ts heightCap) so they never hide it.
- src/scene/layout.ts: the street grid shared by terrain and props, heightCap, focusPoints.
- src/scene/palette.ts: sky, fog and ground colours per terrain; per-setting layout and camera angle; per-style look.
- src/scene/subject.ts: buildModel(parts, style) turns a part model into meshes (voxelised for pixels). buildSubject wraps it with the callout anchor.
- src/scene/actors.ts: the extras, one part model each, placed every frame from resolveActors.
- src/scene/atmosphere.ts: clouds, falling weather, the cover it piles into, debris bursts and dust rings.
- src/scene/post.ts: post passes (half-resolution pixelation, supersampled ink outlines).
- src/scene/noise.ts: makeRng(seed), valueNoise, fbm: the only sources of variation.
- src/hud/hud.ts: the DOM overlay drawn over the canvas. Top left (left 64px, top 300px, up to 900px wide): a big serif heading, up to three bold uppercase stat lines, a red pill with the rule. Mid-frame: the narration in italic serif, lit word by word with the voice. A leader-line callout on the subject with its label. A white flash for the "flash" effect.

## Contract (the dashboard, the voice and the export depend on these)

1. Deterministic frames. Each frame is a pure function of t and the spec: seek(t) may jump to any time in any order, and seeking the same t twice draws the same picture. Outside src/player, never call Math.random, Date.now, new Date or performance.now (the build rejects them) and never carry state from one frame to the next. Use makeRng(seed) and valueNoise for variation. Motion, physics and particles are closed-form functions of t, or are re-simulated from 0 with a fixed step every time.
2. Keep src/player/main.ts working as it is: window.__hpg = { ready, spec, duration, frames, seek }, ?capture=1 drawing synchronously inside seek, and the audio playback. Change what it builds, not how it is driven.
3. The stage is 1080x1920; leave format.width and format.height alone.
4. spec.json keeps title, voice {persona, pace}, format, and beats[] each with a narration line. Beats may also carry musicCue ("play", "low", "cut" or "swell") and sfx ([{name, offset, volume}]). The server reads exactly these to record and time the narration and mix the soundtrack; everything else in the spec is yours.
5. No network at runtime. Everything is generated in code or lives in src/ (small files under src/assets can be imported with ?raw or ?url and are inlined into player.js). The build refuses anything outside this folder, stylesheet imports (style the HUD from TypeScript, or import a .css file with ?raw), workers and import.meta.url. The page loads Inter 800 and Playfair Display (500, italic 400) from Google Fonts.
6. Imports: three (including three/examples/jsm/... addons) and zod. Nothing else is installed.

## Units and conventions in the starter

- World units: 1 unit is about 2.83 metres (one terrain cell). A person is 0.6 units tall. In spec.json every length is in world units: subject.baseSize, actor size, keyframe x and z, beat shot and depth.
- y is up. The subject starts at the origin facing +z. The camera always looks from the +z side (front-left by default), so keep anything that should not hide the subject out of the space between them.
- Part models: primitives in a unit space where x and z run from -0.5 to 0.5 (+z is the front) and y runs up from 0; each part has a centre (x, y, z), full extents (w, h, d), rotations (rx, ry, rz in degrees), a hex colour, and a pattern (solid, checker or stripes, with color2). The player normalises each model so its largest dimension is 1 and it stands on the ground, then scales it by subject.baseSize x subjectScale, or by the actor's size. Later parts draw over earlier ones. A person: two leg boxes, a torso box, two arm boxes, a head box. A dog: a body box, a head box with a snout box and a nose sphere, two ear boxes, four leg cylinders, a cone tail tilted up. A car: a long low box, a shorter cabin box on top, four dark cylinders rotated rz 90 for wheels, two pale headlight boxes on the front.
- Beats: `heading` (the time or stage, e.g. "Year 5"), `stats` (up to 3 uppercase lines), `narration` (one spoken line), `subjectScale` (size multiplier, eased in log space with a small overshoot), `shot` (height to frame in units, 0 = by mode), `fall` (0 to 1 weather intensity), `depth` (how deep the fallen weather lies, in units), `effects` (debris, shake, dust, flash).
- mode: "scale" frames the subject's own size, so the camera pulls back as it grows past the house, the block and the region (growth past 70 units is compressed in log space). "story" frames a room-sized shot by default (shot 0 = 1.4 units) and follows the subject along its keyframes. "overview" holds a block-sized shot by default (24 units). A beat's shot never frames the subject out: a smaller shot grows to fit it. The widest shot is 70 units.
- Keyframes (subject and extras): { beat, offset seconds after that beat starts, x, z, face in degrees (0 faces the camera), visible }. Between keyframes things glide with an ease and face the way they move; people and animals bob as they walk and stand on top of fallen weather, while vehicles and objects get buried by it.
- Weather: weather.kind (none, snow, rain, ash, confetti) and weather.color; per beat, fall and depth.
- Starter places (world.terrain): bedroom, livingroom, kitchen and office are cut-away rooms 3 units square around the subject, open toward the camera (front and left walls removed), with the door in the right wall at (1.5, 0.7), the rest of the house to the right (x 1.5 to 3.3), the garden behind (z below -1.8), the front lawn toward the camera (z 1.6 to 3.5), and a street along x at z = -6 and another along z at x = -5.5. street puts the subject on a road along x with kerbs at z = +-1.3, houses from z = +-2.5, and cars arriving from x = -14. city is a paved plaza 6 units across with roads at x = 10 and z = -10 and benches and planters at radius 5 to 6. park is open lawn with a winding path and trees from radius 7 outward. plains, mountains, island, desert, snow and ocean are open landscapes.
- Styles: pixels (half-resolution, nearest filtering, voxelised models), lowpoly (flat-shaded), drawing (toon shading with ink outlines on a paper-tinted sky).

## Going past the starter

The starter is a starting point, not a menu. Extend it wherever the idea needs to go:

- A new place: add a terrain value and a Setting in palette.ts, and a builder in props.ts or a new file under src/scene, or build the set in world.ts directly. Interiors, vehicles, space, underwater, the inside of something: anything that can be built from geometry.
- Light and sky: drive the sun, the hemisphere light, the sky and the fog from new beat fields (night, a blackout, a sunset, an eclipse).
- Several places or cuts: add a scene index per beat, build one group per scene, show the active one, and give each its own camera rule.
- The camera: per-beat positions and targets, a dolly, a top-down shot, a close-up on something other than the subject.
- Characters that act: build models as named groups (arms, legs, head) and pose them as functions of t (a wave, a run, a fall), or let things fly, jump, spin, grow, break apart, or change colour over time.
- The text: restyle or move the HUD, add on-screen labels, counters or maps, as long as the narration subtitle stays readable.

Prefer extending the starter over rewriting it, keep the code readable, and delete what you replace.
