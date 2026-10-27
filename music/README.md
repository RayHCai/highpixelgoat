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

`HPG_MUSIC_DIR` points at another folder; `HPG_MUSIC_VOLUME` (0 to 1, default
0.22) sets how loud the music sits under the voice before ducking, and
`HPG_MUSIC_SOLO_VOLUME` (default 0.6) how loud it plays in a take with no
narration, where it carries the video alone.
