# sfx

Short sound effects that beats can place by name: mp3, m4a, aac, wav, ogg or
flac. `npm run sfx` writes a synthesized starter set here (controller clicks,
a phone buzz, a message ping, typing, a soft thud, a whoosh, room tone);
existing files are kept, and `npm run sfx -- --force` rewrites them.

The file name (without extension) is what Claude sees and what a beat names
in spec.json:

```json
{ "narration": "", "sfx": [{ "name": "phone-buzz", "offset": 0.5, "volume": 0.8 }] }
```

`offset` is seconds after the beat starts (default 0) and `volume` is 0 to 1
(default 0.8). Effects play on top of the narration and the music: the voice
does not duck them and music cues do not touch them. A name that matches no
file fails the voice step with the list of what is here, so name files by what
they are: `door-creak.wav`, `footsteps-wood.mp3`. Drop in a real recording
with the same name as a starter effect to replace it.

`HPG_SFX_DIR` points at another folder.
