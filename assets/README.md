# assets

Ready-made 3D models the scene agent can use when a primitive model would look
crude: characters, animals, vehicles, furniture, landmarks. Binary glTF
(`.glb`) only, in subfolders if you like (`kenney-city/building-a.glb`).

The path without `.glb` is the model's name. Claude sees every name with the
model's size in metres, its triangle count, its file size and its animation
clips, so name files by what they are: `corgi.glb`, `delivery-van.glb`,
`furniture/sofa-green.glb`. When a scene needs one, Claude copies it into the
take with its `asset` tool (to `src/assets/<name>.glb`), where it is bundled
into `player.js`. Every model a take uses adds its file size to that bundle, so
prefer light, game-ready models.

What loads:

- Embedded textures, vertex colours, skinned and morph animations. Clips play
  at exact times, so frames stay deterministic.
- Not Draco, meshopt or KTX2 compressed files: the player ships no decoders.
  Re-export them uncompressed (in Blender, leave compression off in the glTF
  exporter). Such files are left out of what Claude sees, with a warning in
  the server log.
- Not `.gltf` with separate `.bin` and image files: convert them to `.glb`
  first (`npx @gltf-transform/cli copy model.gltf model.glb`).

Takes restyle models to match their look (toon shading for `drawing`, flat
shading for `lowpoly`) unless Claude keeps the authored materials on purpose.

`npm run assets` writes the built-in characters here (`src/take/characters.ts`
and `src/take/models/`: Tung Tung Tung Sahur, Locked In Alien and Chopped Chin,
three designs each, with named joints such as `head` and `arm-right` and clips
such as `Walk`). `night-watch`, `figure` and `courtside` are the detailed,
sculpted ones (300 KB to 1 MB each); the others are light primitive models.
Existing files are kept; `npm run assets -- --force` rewrites them.

Models are often licensed, so this folder is not committed (only this README).
CC0 packs that fit the starter's look: Kenney (kenney.nl), Quaternius
(quaternius.com), Poly Pizza (poly.pizza; check each model's licence).

`HPG_ASSETS_DIR` points at another folder.
