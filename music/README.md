# music

Drop background tracks here: mp3, m4a, aac, wav, ogg or flac. Every take gets
one mixed quietly under the narration and ducked while the narrator speaks.

The file name (without extension) is what Claude sees when it picks the track
that fits the vibe of a take, so name files by feel: `upbeat-ukulele.mp3`,
`dramatic-cinematic.mp3`, `lofi-chill.mp3`, `suspense-ticking.mp3`. A take whose
pick does not match a file gets a deterministic choice, so three takes still
sound different. Ask in chat to switch tracks or to drop the music.

Beats can cue the track with `musicCue` in spec.json: `low` sinks it, `cut`
drops it to silence on the cut, `swell` lifts it a little, `play` brings it
back to normal. A cue holds until a later beat sets another; cuts in and out
of silence are instant, the rest ramp over 0.6 seconds.

`npm run music` writes five original loops here in the styles that trend on
short-form video (block-town-lobby-upbeat, dreamcore-music-box-uncanny,
backrooms-fluorescent-hum, liminal-mall-muzak-slowed,
funk-montagem-phonk-cowbell), synthesized by src/voice/compose.ts, plus three
stand-ins for licensed trending sounds from src/voice/standins.ts
(trending-my-moon-my-man-soft-launch for Finneas, "My Moon My Man";
trending-montagem-chupeta-funk for Lthiago, "Montagem da Chupeta";
trending-no-signal-tv-bossa for the Backrooms "No Signal" sound). Existing files
are kept, and `npm run music -- --force` rewrites only the files it wrote.

To preview a take with the real recording, replace the stand-in with a copy you
have the right to use, under the same name (delete the stand-in's .mp3 if yours
has another extension), then ask in chat to re-voice the take or switch tracks.
Post with the official audio added inside Instagram or TikTok.

`HPG_MUSIC_DIR` points at another folder; `HPG_MUSIC_VOLUME` (0 to 1, default
0.22) sets how loud the music sits under the voice before ducking, and
`HPG_MUSIC_SOLO_VOLUME` (default 0.6) how loud it plays in a take with no
narration, where it carries the video alone.
