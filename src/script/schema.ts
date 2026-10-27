import { z } from "zod";
import {
  ACTOR_KINDS,
  EFFECTS,
  MODES,
  PACES,
  PART_KINDS,
  PATTERNS,
  PERSONAS,
  STYLES,
  TERRAINS,
  WEATHER_KINDS,
} from "../starter/spec/schema";

/**
 * The flat script shape for the starter renderer: a subset of ScenarioSpec in
 * metres, with no ids, timings, tuples or nullables. The bundled offline
 * examples are written in it, and offline chat edits it; lift.ts turns it into
 * a full spec. Takes made with Claude skip it: the scene agent writes
 * spec.json directly against the take's own schema.
 */
export const GeneratedBeatSchema = z.object({
  heading: z
    .string()
    .describe(
      'Big serif heading, 1-3 words: the time or stage, e.g. "Hour 45", "Day 3", "Age 18", "Year 5". Max 14 characters.',
    ),
  stats: z
    .array(z.string())
    .describe(
      'Up to 3 short uppercase stat lines, the numbers of this story at this beat, e.g. ["176 BILLION TONNES", "MOUNT EVEREST"] or ["VISITS THIS YEAR: 3", "MUM 64, DAD 67"]. Each max 28 characters.',
    ),
  narration: z
    .string()
    .describe(
      "The spoken line for this beat: one or two complete second-person sentences with normal punctuation, 8 to 15 words. Read aloud by the narrator and shown on screen as the subtitle.",
    ),
  subjectScale: z
    .number()
    .describe(
      "Size multiplier of the subject at this beat relative to beat 1 (which is 1). Carries the growth in scale mode; stays 1 in overview mode and 1 or a gentle change in story mode. See THE FORMAT.",
    ),
  shot: z
    .number()
    .describe(
      "How tall a thing the frame should fit at this beat, in metres. 0 lets the camera frame the subject itself (always 0 in scale mode). Otherwise: 2 fits a person, 4 the room and the people in it, 10 the house and its garden, 25 the street, 60 a block, 120 the district, 200 the skyline (the maximum). See PACING.",
    ),
  fall: z
    .number()
    .describe(
      "How heavily the weather is coming down during this beat, 0 (nothing) to 1 (a blizzard). 0 when weatherKind is none. See WEATHER.",
    ),
  depth: z
    .number()
    .describe(
      "How deep what has fallen lies on the ground by the end of this beat, in metres, following the arithmetic: 0 none, 0.05 a dusting, 0.5 knee deep, 2 buries the cars, 15 buries the houses, 90 buries the towers. 0 when weatherKind is none. See WEATHER.",
    ),
  effects: z.array(z.enum(EFFECTS)).describe("Effects to fire at this beat; empty for none."),
});

/** One primitive of the subject model. All fields are required so the schema stays strict; use 0 for no rotation. */
export const GeneratedPartSchema = z.object({
  kind: z.enum(PART_KINDS).describe("box, sphere, cylinder (vertical axis) or cone (point up)."),
  x: z.number().describe("Centre x: -0.5 is the left side, 0.5 the right."),
  y: z.number().describe("Centre y: 0 is the ground; the model is about 1 tall or long."),
  z: z.number().describe("Centre z: -0.5 is the back, 0.5 the front (toward the camera)."),
  w: z.number().describe("Full width (x extent)."),
  h: z.number().describe("Full height (y extent)."),
  d: z.number().describe("Full depth (z extent)."),
  rx: z.number().describe("Rotation about x in degrees, 0 for none (tilts forward/back)."),
  ry: z.number().describe("Rotation about y in degrees, 0 for none (turns left/right)."),
  rz: z.number().describe("Rotation about z in degrees, 0 for none (leans sideways)."),
  color: z.string().describe("Hex colour like #c89a52."),
  pattern: z.enum(PATTERNS).describe("solid almost always; checker in two close tones reads as skin or fur texture."),
  color2: z.string().describe("Second hex colour for checker or stripes; repeat color when solid."),
});
export type GeneratedPart = z.infer<typeof GeneratedPartSchema>;

export const GeneratedKeyframeSchema = z.object({
  beat: z.number().int().describe("Index of the beat this moment hangs off: 0 is the first beat."),
  offset: z.number().describe("Seconds after that beat starts, 0 to about 4."),
  x: z
    .number()
    .describe(
      "World x in units (1 unit is about 3 metres), the start position at 0; negative is left, positive is right.",
    ),
  z: z
    .number()
    .describe("World z in units, the start position at 0; positive is toward the camera, negative is away from it."),
  face: z
    .number()
    .describe(
      "Direction faced while standing still, degrees: 0 faces the camera, 90 faces right, 180 faces away, 270 faces left.",
    ),
  visible: z
    .boolean()
    .describe("False to hide it from this moment until a later visible keyframe (it has left, or has not arrived)."),
});
export type GeneratedKeyframe = z.infer<typeof GeneratedKeyframeSchema>;

export const GeneratedActorSchema = z.object({
  name: z
    .string()
    .describe('Who or what this is, e.g. "the postman", "a red hatchback", "next door’s cat". Max 40 characters.'),
  kind: z
    .enum(ACTOR_KINDS)
    .describe(
      "person and animal walk with a bob and climb on top of fallen weather; vehicle and object glide and get buried by it.",
    ),
  sizeMetres: z
    .number()
    .describe("Largest dimension in metres: a person 1.7, a car 4.5, a cat 0.5, a wheelie bin 1.2, a drone 0.4."),
  parts: z
    .array(GeneratedPartSchema)
    .describe("2 to 12 primitives, same unit space and rules as the subject. The front faces +z."),
  keyframes: z.array(GeneratedKeyframeSchema).describe("2 to 8 moments in chronological order. See EXTRAS."),
});
export type GeneratedActor = z.infer<typeof GeneratedActorSchema>;

export const ANGLE_IDS = ["deadpan", "relatable", "unhinged"] as const;

export const GeneratedSpecSchema = z.object({
  mode: z
    .enum(MODES)
    .describe("The format of the video: what the viewer watches happen and how the camera is driven. See THE FORMAT."),
  angle: z.enum(ANGLE_IDS).describe("The creative angle you chose for this take. See ANGLE."),
  title: z.string().describe("Short video title, max 60 characters."),
  style: z.enum(STYLES).describe("Render style chosen from the style descriptor."),
  terrain: z.enum(TERRAINS).describe("The place the scenario plays out in. See THE SET."),
  seed: z.number().int().describe("Any integer; varies the layout of the place."),
  subjectLabel: z
    .string()
    .describe(
      'Callout label on the subject, usually "YOU" or "YOUR DOG". Max 10 characters. Empty string for no callout.',
    ),
  subjectParts: z
    .array(GeneratedPartSchema)
    .describe("The subject model, 3 to 20 primitives that look like the thing the scenario is about. See THE SUBJECT."),
  subjectKeyframes: z
    .array(GeneratedKeyframeSchema)
    .describe(
      "Where the subject goes over the video, same rules as an extra's keyframes; the camera follows it. Empty when it stays where it starts (always empty in scale mode). See EXTRAS.",
    ),
  extras: z
    .array(GeneratedActorSchema)
    .describe(
      "2 to 5 other people, animals, vehicles or objects taking part, each with its own model and movement. See EXTRAS.",
    ),
  weatherKind: z
    .enum(WEATHER_KINDS)
    .describe(
      "Something falling over the whole set and piling up on the ground: snow, rain, ash, confetti, or none. See WEATHER.",
    ),
  weatherColor: z
    .string()
    .describe(
      "Hex colour of what falls and of the sheet it piles up into, e.g. #ffffff for snow. Any hex colour when weatherKind is none.",
    ),
  rule: z
    .string()
    .describe(
      'The one-line rule of the scenario shown in a red pill, uppercase, max 36 characters, e.g. "CHEEKS DOUBLE EVERY HOUR". Empty string for none.',
    ),
  voicePersona: z.enum(PERSONAS).describe("Which narrator reads it. See VOICE."),
  voicePace: z.enum(PACES).describe("How quickly the narrator reads. See VOICE."),
  beats: z.array(GeneratedBeatSchema).describe("6 to 8 beats in chronological order."),
  music: z
    .string()
    .describe(
      'Background track: the exact name of one entry in the MUSIC list, "none" for no music, or an empty string when no list is offered.',
    ),
  caption: z
    .string()
    .describe(
      "The Instagram caption: a hook line, at most one more line, and a short call to action, each on its own line. Plain text only: no emoji, no dashes of any kind, no hashtags. See INSTAGRAM.",
    ),
  hashtags: z.array(z.string()).describe("15 to 20 hashtags without the # sign, lowercase, no spaces. See INSTAGRAM."),
});
export type GeneratedSpec = z.infer<typeof GeneratedSpecSchema>;
export type GeneratedBeat = z.infer<typeof GeneratedBeatSchema>;

/**
 * The result of an offline chat edit (offline.ts): a short reply plus the
 * complete revised script. With Claude connected, chat goes to the scene
 * agent instead, which edits the take folder directly.
 */
export const EditResultSchema = z.object({
  reply: z.string().describe("A short message to the user: what changed, or an answer."),
  changed: z.boolean().describe("False only when nothing in the script changed."),
  script: GeneratedSpecSchema.describe("The complete script after this turn."),
});
export type EditResult = z.infer<typeof EditResultSchema>;
