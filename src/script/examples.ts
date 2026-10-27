import type { GeneratedActor, GeneratedBeat, GeneratedKeyframe, GeneratedPart, GeneratedSpec } from "./schema";

/**
 * The bundled example scripts, written in the starter-shaped script format:
 * three that scale, one story and one overview. They stand in for Claude in
 * offline mode, and one of them is written into every take as
 * example.spec.json.
 */

type Kind = GeneratedPart["kind"];
function part(
  kind: Kind,
  [x, y, z]: number[],
  [w, h, d]: number[],
  color: string,
  extra: Partial<GeneratedPart> = {},
): GeneratedPart {
  return {
    kind,
    x: x!,
    y: y!,
    z: z!,
    w: w!,
    h: h!,
    d: d!,
    rx: 0,
    ry: 0,
    rz: 0,
    color,
    pattern: "solid",
    color2: color,
    ...extra,
  };
}

/** A beat with the format fields defaulted: no shot override, no weather. */
function beat(
  heading: string,
  stats: string[],
  narration: string,
  subjectScale: number,
  effects: GeneratedBeat["effects"] = [],
  extra: Partial<GeneratedBeat> = {},
): GeneratedBeat {
  return { heading, stats, narration, subjectScale, shot: 0, fall: 0, depth: 0, effects, ...extra };
}

/** A face that is mostly cheeks: two big spheres in close skin tones, a head between them, a small nose. */
const CHEEKS_PARTS: GeneratedPart[] = [
  part("sphere", [0, 0.5, -0.1], [0.62, 0.62, 0.62], "#7a5636", { pattern: "checker", color2: "#8f6a45" }),
  part("sphere", [-0.3, 0.42, 0.08], [0.6, 0.6, 0.6], "#6b4a2e", { pattern: "checker", color2: "#8f6a45" }),
  part("sphere", [0.3, 0.42, 0.08], [0.6, 0.6, 0.6], "#6b4a2e", { pattern: "checker", color2: "#8f6a45" }),
  part("sphere", [0, 0.56, 0.24], [0.14, 0.12, 0.14], "#5a3d26"),
  part("sphere", [-0.1, 0.68, 0.14], [0.08, 0.08, 0.06], "#222222"),
  part("sphere", [0.1, 0.68, 0.14], [0.08, 0.08, 0.06], "#222222"),
];

const PENNY_PARTS: GeneratedPart[] = [
  part("cylinder", [0, 0.08, 0], [1, 0.16, 1], "#c8803a"),
  part("cylinder", [0, 0.165, 0], [0.84, 0.02, 0.84], "#a86a2c"),
  part("box", [0, 0.18, 0], [0.12, 0.02, 0.5], "#c8803a"),
];

function at(beat: number, offset: number, x: number, z: number, face = 0, visible = true): GeneratedKeyframe {
  return { beat, offset, x, z, face, visible };
}

function person(shirt: string, trousers: string, skin = "#e0b08a", hair = "#3a2a1c"): GeneratedPart[] {
  return [
    part("box", [-0.11, 0.21, 0], [0.16, 0.42, 0.2], trousers),
    part("box", [0.11, 0.21, 0], [0.16, 0.42, 0.2], trousers),
    part("box", [0, 0.62, 0], [0.44, 0.4, 0.24], shirt),
    part("box", [-0.3, 0.6, 0], [0.12, 0.38, 0.14], skin),
    part("box", [0.3, 0.6, 0], [0.12, 0.38, 0.14], skin),
    part("box", [0, 0.94, 0], [0.28, 0.26, 0.26], skin),
    part("box", [0, 1.08, -0.02], [0.3, 0.06, 0.3], hair),
  ];
}

function car(body: string): GeneratedPart[] {
  return [
    part("box", [0, 0.3, 0], [0.44, 0.26, 1], body),
    part("box", [0, 0.52, -0.08], [0.38, 0.22, 0.52], "#2b3a4a"),
    part("cylinder", [-0.22, 0.14, 0.32], [0.14, 0.1, 0.28], "#222222", { rz: 90 }),
    part("cylinder", [0.22, 0.14, 0.32], [0.14, 0.1, 0.28], "#222222", { rz: 90 }),
    part("cylinder", [-0.22, 0.14, -0.32], [0.14, 0.1, 0.28], "#222222", { rz: 90 }),
    part("cylinder", [0.22, 0.14, -0.32], [0.14, 0.1, 0.28], "#222222", { rz: 90 }),
    part("box", [-0.14, 0.3, 0.5], [0.1, 0.06, 0.02], "#fff2c0"),
    part("box", [0.14, 0.3, 0.5], [0.1, 0.06, 0.02], "#fff2c0"),
  ];
}

/** A van: the car with a tall box body and no separate cabin. */
function van(body: string): GeneratedPart[] {
  return [
    part("box", [0, 0.38, -0.1], [0.46, 0.46, 0.8], body),
    part("box", [0, 0.3, 0.42], [0.44, 0.3, 0.2], body),
    part("box", [0, 0.44, 0.52], [0.36, 0.14, 0.02], "#2b3a4a"),
    part("cylinder", [-0.23, 0.14, 0.3], [0.14, 0.1, 0.28], "#222222", { rz: 90 }),
    part("cylinder", [0.23, 0.14, 0.3], [0.14, 0.1, 0.28], "#222222", { rz: 90 }),
    part("cylinder", [-0.23, 0.14, -0.32], [0.14, 0.1, 0.28], "#222222", { rz: 90 }),
    part("cylinder", [0.23, 0.14, -0.32], [0.14, 0.1, 0.28], "#222222", { rz: 90 }),
  ];
}

const CAT_PARTS: GeneratedPart[] = [
  part("box", [0, 0.32, -0.05], [0.3, 0.26, 0.7], "#5a5a5a"),
  part("box", [0, 0.56, 0.32], [0.26, 0.24, 0.24], "#5a5a5a"),
  part("cone", [-0.08, 0.74, 0.3], [0.08, 0.14, 0.08], "#4a4a4a"),
  part("cone", [0.08, 0.74, 0.3], [0.08, 0.14, 0.08], "#4a4a4a"),
  part("sphere", [-0.06, 0.58, 0.45], [0.05, 0.05, 0.03], "#b8e05a"),
  part("sphere", [0.06, 0.58, 0.45], [0.05, 0.05, 0.03], "#b8e05a"),
  part("cylinder", [-0.1, 0.1, 0.2], [0.08, 0.2, 0.08], "#5a5a5a"),
  part("cylinder", [0.1, 0.1, 0.2], [0.08, 0.2, 0.08], "#5a5a5a"),
  part("cylinder", [-0.1, 0.1, -0.3], [0.08, 0.2, 0.08], "#5a5a5a"),
  part("cylinder", [0.1, 0.1, -0.3], [0.08, 0.2, 0.08], "#5a5a5a"),
  part("cylinder", [0, 0.5, -0.5], [0.06, 0.36, 0.06], "#5a5a5a", { rx: -40 }),
];

const DOG_PARTS: GeneratedPart[] = [
  part("box", [0, 0.5, -0.08], [0.4, 0.3, 0.7], "#c89a52"),
  part("box", [0, 0.76, 0.38], [0.3, 0.28, 0.28], "#c89a52"),
  part("box", [0, 0.66, 0.58], [0.18, 0.14, 0.16], "#b88744"),
  part("sphere", [0, 0.69, 0.67], [0.07, 0.07, 0.07], "#222222"),
  part("box", [-0.16, 0.8, 0.34], [0.08, 0.18, 0.12], "#a6763a", { rz: 15 }),
  part("box", [0.16, 0.8, 0.34], [0.08, 0.18, 0.12], "#a6763a", { rz: -15 }),
  part("cylinder", [-0.13, 0.18, 0.22], [0.12, 0.36, 0.12], "#c89a52"),
  part("cylinder", [0.13, 0.18, 0.22], [0.12, 0.36, 0.12], "#c89a52"),
  part("cylinder", [-0.13, 0.18, -0.22], [0.12, 0.36, 0.12], "#c89a52"),
  part("cylinder", [0.13, 0.18, -0.22], [0.12, 0.36, 0.12], "#c89a52"),
  part("cone", [0, 0.72, -0.5], [0.1, 0.3, 0.1], "#c89a52", { rx: -60 }),
];

function extra(
  name: string,
  kind: GeneratedActor["kind"],
  sizeMetres: number,
  parts: GeneratedPart[],
  keyframes: GeneratedKeyframe[],
): GeneratedActor {
  return { name, kind, sizeMetres, parts, keyframes };
}

/** Extras for the bedroom: a flatmate at the door, the cat, a car on the street behind. */
const CHEEKS_EXTRAS: GeneratedActor[] = [
  extra("your flatmate", "person", 1.7, person("#c94d3b", "#2b2b2b"), [
    at(0, 0, 1.45, 0.7, 270, false),
    at(1, 0.5, 1.45, 0.7, 270),
    at(2, 0, 0.9, 0.2, 300),
    at(3, 0.5, 1.45, 0.7, 90),
    at(4, 0, 4.5, -2.5, 90),
    at(5, 0, 7, -6, 90, false),
  ]),
  extra("the cat", "animal", 0.5, CAT_PARTS, [
    at(0, 0, -0.85, -1.0, 60),
    at(2, 0.4, -0.85, -1.0, 60),
    at(2, 2.4, -2.4, -2.6, 220),
    at(3, 0, -2.4, -2.6, 220, false),
  ]),
  extra("a passing car", "vehicle", 4.5, car("#3b6fc9"), [
    at(0, 0, -14, -6.6, 90),
    at(1, 1.5, -2, -6.6, 90),
    at(2, 1.5, 14, -6.6, 90),
    at(2, 1.6, 14, -6.6, 90, false),
  ]),
];

/** Extras for the kitchen: the friend who made the deal, and a neighbour at the window. */
const PENNY_EXTRAS: GeneratedActor[] = [
  extra("the friend with the deal", "person", 1.7, person("#4f8f3a", "#2b4f8f"), [
    at(0, 0, 1.3, -0.9, 270),
    at(2, 0, 1.3, -0.9, 270),
    at(4, 0, 1.45, 0.7, 90),
    at(5, 0, 5, -2, 90),
    at(6, 0, 9, -6, 90, false),
  ]),
  extra("a neighbour on the lawn", "person", 1.7, person("#e0b04c", "#444444"), [
    at(0, 0, -4, -4, 20),
    at(3, 0, -4, -4, 20),
    at(4, 0.5, -6, -5.5, 200),
    at(5, 0, -10, -8, 200, false),
  ]),
];

/** Extras for the street: a dog walker, two cars, a kid on the kerb. */
const METRE_EXTRAS: GeneratedActor[] = [
  extra("a dog walker", "person", 1.7, person("#8a6a4a", "#2b2b2b"), [
    at(0, 0, -5, -1.8, 90),
    at(2, 0, -2.2, -1.8, 90),
    at(3, 0, -2.2, -1.8, 0),
    at(4, 0, -9, -2.2, 270),
    at(5, 0, -14, -2.2, 270, false),
  ]),
  extra("a white van", "vehicle", 5, car("#e8e8e8"), [
    at(0, 0, 14, 0.5, 270),
    at(1, 2, 3, 0.5, 270),
    at(2, 1, 3, 0.5, 270),
    at(3, 0, 14, 0.5, 90, false),
  ]),
  extra("a red hatchback", "vehicle", 4.2, car("#b03a2e"), [
    at(0, 0, -14, -0.5, 90, false),
    at(2, 0, -14, -0.5, 90),
    at(3, 2, -3.5, -0.5, 90),
    at(4, 0, -3.5, -0.5, 90),
    at(4, 3, -14, -0.5, 270, false),
  ]),
  extra("a kid on the kerb", "person", 1.2, person("#3b6fc9", "#e0b04c"), [
    at(0, 0, 2.4, -1.5, 300),
    at(3, 0, 2.4, -1.5, 300),
    at(4, 0, 6, -3, 60),
    at(5, 0, 9, -6, 60, false),
  ]),
];

/**
 * Extras for the living room story: the parents on the sofa who come to the
 * front to wave, wait at the window, and greet; the dog that follows you to
 * the door and is gone by year ten; the van that takes you away.
 */
const PARENTS_EXTRAS: GeneratedActor[] = [
  extra("your mum", "person", 1.65, person("#b9637a", "#4a4a5a", "#e0b08a", "#6b4a2e"), [
    at(0, 0, -0.15, -1.05, 0),
    at(2, 1.0, -0.15, -1.05, 0),
    at(2, 2.6, -0.4, 1.4, 270),
    at(3, 0.4, -0.55, -1.15, 180),
    at(4, 1.0, -0.3, -0.55, 0),
    at(5, 0.5, -0.15, -1.05, 0),
    at(6, 1.2, -0.3, -0.55, 0),
  ]),
  extra("your dad", "person", 1.75, person("#5f7390", "#3a3a3a", "#d8a67c", "#8a8a8a"), [
    at(0, 0, 0.4, -1.05, 0),
    at(2, 1.0, 0.4, -1.05, 0),
    at(2, 2.6, 0.5, 1.4, 270),
    at(3, 0.4, 0.4, -1.05, 0),
    at(4, 1.2, 0.5, -0.5, 0),
    at(5, 0.5, 0.4, -1.05, 0),
    at(6, 1.4, 0.5, -0.5, 0),
  ]),
  extra("the family dog", "animal", 0.7, DOG_PARTS, [
    at(0, 0, -1.0, 0.1, 60),
    at(2, 0.6, -1.0, 0.1, 60),
    at(2, 2.4, -0.2, 1.8, 270),
    at(3, 0.2, -1.0, -0.4, 30),
    at(4, 1.4, -0.7, 0.4, 0),
    at(5, 0, -1.0, -0.4, 30, false),
  ]),
  extra("the removal van", "vehicle", 5.5, van("#e8e8e8"), [
    at(0, 0, -5.5, 14, 180, false),
    at(2, 0.2, -5.5, 14, 180),
    at(2, 3.2, -5.5, 2.6, 180),
    at(2, 4.6, -5.5, 2.6, 180),
    at(3, 0.6, -5.5, -14, 180),
    at(3, 0.7, -5.5, -14, 180, false),
  ]),
];

/** Extras for downtown under the snow: the cab, the plough, the officer, the news van. */
const NYC_EXTRAS: GeneratedActor[] = [
  extra("a yellow cab", "vehicle", 4.5, car("#f2c230"), [
    at(0, 0, 10, -14, 0),
    at(1, 0.4, 10, 14, 0),
    at(1, 0.5, 10, -3, 0, false),
    at(1, 0.6, 10, -3, 0),
    at(5, 0, 10, -3, 0),
  ]),
  extra("a snow plough", "vehicle", 6, van("#e8731a"), [
    at(0, 0, -14, -10, 90, false),
    at(2, 0, -14, -10, 90),
    at(2, 3.5, -2, -10, 90),
    at(5, 0, -2, -10, 90),
  ]),
  extra("an NYPD officer", "person", 1.8, person("#1f3a5f", "#1f3a5f", "#d8a67c", "#1f3a5f"), [
    at(0, 0, 3, -3, 300),
    at(1, 0.5, 2, -2, 330),
    at(2, 0, 3, -3, 0),
    at(3, 1, 6, -6, 60),
    at(4, 0, 9, -9, 60, false),
  ]),
  extra("a news van", "vehicle", 5, van("#ffffff"), [
    at(0, 0, -10, 14, 180, false),
    at(1, 0.5, -10, 14, 180),
    at(1, 3, -10, 3, 180),
    at(2, 2, -10, 3, 180),
    at(3, 0, -10, 3, 180, false),
  ]),
];

const PERSON_PARTS: GeneratedPart[] = [
  part("box", [-0.11, 0.21, 0], [0.16, 0.42, 0.2], "#2b4f8f"),
  part("box", [0.11, 0.21, 0], [0.16, 0.42, 0.2], "#2b4f8f"),
  part("box", [0, 0.62, 0], [0.44, 0.4, 0.24], "#3b6fc9"),
  part("box", [-0.3, 0.6, 0], [0.12, 0.38, 0.14], "#e0b08a"),
  part("box", [0.3, 0.6, 0], [0.12, 0.38, 0.14], "#e0b08a"),
  part("box", [0, 0.94, 0], [0.28, 0.26, 0.26], "#e8b995"),
  part("box", [0, 1.08, -0.02], [0.3, 0.06, 0.3], "#3a2a1c"),
];

const NO_WEATHER = { weatherKind: "none" as const, weatherColor: "#ffffff" };

/**
 * HPG_OFFLINE=1: stand-ins for Claude so the whole dashboard (voice, sites,
 * chat plumbing, video export) can be exercised without an API key. Five
 * built-in scripts cover the three formats: three that scale, one story in a
 * living room, and one overview of a city under the snow.
 */

const CHEEKS: GeneratedSpec = {
  mode: "scale",
  title: "Your cheeks double in size every hour",
  style: "pixels",
  terrain: "bedroom",
  seed: 7,
  subjectLabel: "YOU",
  subjectParts: CHEEKS_PARTS,
  subjectKeyframes: [],
  extras: CHEEKS_EXTRAS,
  ...NO_WEATHER,
  angle: "deadpan",
  rule: "CHEEKS DOUBLE EVERY HOUR",
  music: "",
  voicePersona: "dry",
  voicePace: "brisk",
  beats: [
    beat(
      "Hour 0",
      ["TWO NORMAL CHEEKS"],
      "What if your cheeks doubled in size every single hour, starting right now?",
      1,
    ),
    beat(
      "Hour 3",
      ["8 TIMES BIGGER", "A PAIR OF GRAPEFRUITS"],
      "By lunch you look like you are hiding two grapefruits, and everyone politely says nothing.",
      8,
      ["dust"],
    ),
    beat(
      "Hour 6",
      ["64 TIMES BIGGER", "TWO BEACH BALLS"],
      "At dinner you take the door off its hinges and eat standing in the garden.",
      64,
      ["dust"],
    ),
    beat(
      "Hour 10",
      ["1,024 TIMES", "A SMALL CAR EACH"],
      "Each cheek now weighs about as much as a Honda Civic, and they are still warm.",
      1024,
      ["debris"],
    ),
    beat(
      "Hour 14",
      ["16,384 TIMES", "THE SIZE OF THE HOUSE"],
      "The house is gone. Your neighbours are filming. The council has been informed.",
      16384,
      ["debris", "shake"],
    ),
    beat(
      "Hour 20",
      ["A MILLION TIMES", "DOWNTOWN, ROUGHLY"],
      "By midnight your face has its own postcode and a light aircraft warning.",
      1048576,
      ["shake"],
    ),
    beat(
      "Hour 24",
      ["16 MILLION TIMES", "MOUNT EVEREST"],
      "Twenty four hours in, your cheeks are taller than Everest. Hour twenty five is loading.",
      16777216,
      ["flash", "shake"],
    ),
  ],
  caption:
    "Your cheeks double every hour.\nBy hour 24 they are taller than Everest.\nTag the chubbiest cheeks you know.",
  hashtags: [
    "reels",
    "explore",
    "whatif",
    "fyp",
    "animation",
    "hypothetical",
    "scale",
    "science",
    "3danimation",
    "satisfying",
    "viral",
    "didyouknow",
    "exponential",
    "cheeks",
    "everest",
    "doubling",
    "pixelart",
    "growth",
  ],
};

const PENNY: GeneratedSpec = {
  mode: "scale",
  title: "A penny that doubles every day",
  style: "lowpoly",
  terrain: "kitchen",
  seed: 21,
  subjectLabel: "YOUR PENNY",
  subjectParts: PENNY_PARTS,
  subjectKeyframes: [],
  extras: PENNY_EXTRAS,
  ...NO_WEATHER,
  angle: "relatable",
  rule: "DOUBLES EVERY DAY",
  music: "",
  voicePersona: "buddy",
  voicePace: "brisk",
  beats: [
    beat("Day 1", ["ONE CENT"], "Someone hands you a penny and says it doubles every day for a month. Deal?", 1),
    beat(
      "Day 8",
      ["$1.28", "A VENDING MACHINE SNACK"],
      "A week in, you have a dollar twenty eight. Your friends are already losing interest.",
      1.5,
    ),
    beat(
      "Day 15",
      ["$163.84", "A WEEK OF GROCERIES"],
      "Day fifteen buys the groceries, and the penny is now the size of a dinner plate.",
      6,
      ["dust"],
    ),
    beat(
      "Day 20",
      ["$5,242", "A USED CAR"],
      "Day twenty buys a used car, and the coin no longer fits through the kitchen door.",
      20,
      ["dust"],
    ),
    beat(
      "Day 25",
      ["$167,772", "A SMALL APARTMENT"],
      "Day twenty five is an apartment. The coin has taken the roof off yours.",
      100,
      ["debris"],
    ),
    beat(
      "Day 28",
      ["$1.3 MILLION", "A SUBURBAN STREET"],
      "Day twenty eight buys the whole street, which is lucky, because the coin is lying on it.",
      400,
      ["debris", "shake"],
    ),
    beat(
      "Day 30",
      ["$5.4 MILLION", "THE WHOLE BLOCK"],
      "Day thirty: five million dollars, from one cent. Would you have taken the deal?",
      1200,
      ["flash"],
    ),
  ],
  caption: "A penny that doubles every day for a month.\nDay 30 is 5.4 million dollars.\nComment the day you cash out.",
  hashtags: [
    "reels",
    "explore",
    "whatif",
    "fyp",
    "animation",
    "hypothetical",
    "money",
    "finance",
    "compoundinterest",
    "3danimation",
    "satisfying",
    "viral",
    "didyouknow",
    "penny",
    "doubling",
    "investing",
    "lowpoly",
    "mathtok",
  ],
};

const METRE: GeneratedSpec = {
  mode: "scale",
  title: "You grow one metre every minute",
  style: "drawing",
  terrain: "street",
  seed: 33,
  subjectLabel: "YOU",
  subjectParts: PERSON_PARTS,
  subjectKeyframes: [],
  extras: METRE_EXTRAS,
  ...NO_WEATHER,
  angle: "unhinged",
  rule: "ONE METRE A MINUTE",
  music: "",
  voicePersona: "hype",
  voicePace: "fast",
  beats: [
    beat(
      "Minute 0",
      ["1.7 METRES", "PERFECTLY NORMAL"],
      "Okay, new rule: starting now, you grow one metre every single minute. Go.",
      1,
    ),
    beat(
      "Minute 2",
      ["3.7 METRES", "A BASKETBALL HOOP"],
      "Two minutes in and you can dunk without jumping. Nobody on the street is impressed yet.",
      2.2,
      ["dust"],
    ),
    beat(
      "Minute 5",
      ["6.7 METRES", "A TWO STOREY HOUSE"],
      "Five minutes. You are eye to eye with the upstairs windows, and the curtains are closing.",
      3.9,
      ["dust"],
    ),
    beat(
      "Minute 15",
      ["16.7 METRES", "A FIVE STOREY BLOCK"],
      "Fifteen minutes, and the whole street is a toy town you tiptoe through.",
      9.8,
      ["debris"],
    ),
    beat(
      "Hour 1",
      ["61.7 METRES", "THE STATUE OF LIBERTY"],
      "One hour. You are the Statue of Liberty, and you have just sat on the park.",
      36,
      ["debris", "shake"],
    ),
    beat(
      "Hour 5",
      ["301 METRES", "THE EIFFEL TOWER"],
      "Five hours in, planes are routed around you and your phone is somewhere in your sock.",
      177,
      ["shake"],
    ),
    beat(
      "Day 1",
      ["1.44 KILOMETRES", "THREE BURJ KHALIFAS"],
      "One day. You are a kilometre and a half tall, and the weather happens below your knees.",
      848,
      ["flash", "shake"],
    ),
  ],
  caption:
    "You grow one metre every minute.\nBy lunch the weather is below your knees.\nTag someone who is already too tall.",
  hashtags: [
    "reels",
    "explore",
    "whatif",
    "fyp",
    "animation",
    "hypothetical",
    "scale",
    "science",
    "3danimation",
    "satisfying",
    "viral",
    "didyouknow",
    "giant",
    "tall",
    "eiffeltower",
    "burjkhalifa",
    "handdrawn",
    "growth",
  ],
};

/**
 * A story: you grow up in the living room, the van comes at eighteen, and
 * the years tick by for the two people left on the sofa. The camera follows
 * you out of the open front of the room and back in for the visits.
 */
const PARENTS: GeneratedSpec = {
  mode: "story",
  title: "What happens to your parents when you move out",
  style: "lowpoly",
  terrain: "livingroom",
  seed: 45,
  subjectLabel: "YOU",
  subjectParts: PERSON_PARTS,
  subjectKeyframes: [
    at(0, 0, 0.3, 0.2, 0),
    at(2, 0.4, 0.3, 0.2, 0),
    at(2, 2.2, 0.6, 2.4, 0),
    at(2, 4.2, -3.6, 2.6, 270),
    at(3, 0, -3.6, 2.6, 270, false),
    at(4, 0.3, -3.6, 2.6, 90),
    at(4, 2.6, 0.4, 0.3, 0),
    at(5, 1.2, 0.4, 0.3, 0),
    at(5, 3.2, 0.6, 2.4, 0),
    at(5, 3.3, 0.6, 2.4, 0, false),
    at(6, 0.3, 0.6, 2.4, 180),
    at(6, 2.2, 0.3, 0.2, 0),
  ],
  extras: PARENTS_EXTRAS,
  ...NO_WEATHER,
  angle: "relatable",
  rule: "YOU MOVE OUT AT 18",
  music: "",
  voicePersona: "storyteller",
  voicePace: "relaxed",
  beats: [
    beat(
      "Age 8",
      ["MUM 36, DAD 38", "DINNERS TOGETHER: 365"],
      "What really happens to your parents when you move out? Start at eight.",
      0.6,
      [],
      { shot: 4 },
    ),
    beat(
      "Age 14",
      ["MUM 42, DAD 44", "DOOR SLAMS A WEEK: 9"],
      "At fourteen you are a closed door, and they still cook for three.",
      0.8,
      [],
      { shot: 4 },
    ),
    beat(
      "Age 18",
      ["THE VAN IS HERE", "YOUR ROOM: PRESERVED"],
      "Eighteen. The van is here. Your mum waves until the street is empty.",
      1,
      [],
      { shot: 7 },
    ),
    beat(
      "Year 1",
      ["CALLS A WEEK: 1", "VISITS THIS YEAR: 3"],
      "Year one. The house is quiet, and dinner for two means leftovers.",
      1,
      [],
      { shot: 12 },
    ),
    beat(
      "Year 5",
      ["MUM 59, DAD 61", "VISITS THIS YEAR: 2"],
      "Year five. You come home for Christmas, and the sofa still has your dent.",
      1,
      [],
      { shot: 4 },
    ),
    beat(
      "Year 10",
      ["THE DOG IS GONE", "CALLS A WEEK: 2"],
      "Year ten. The dog is gone. Your dad is fine, he tells the window.",
      1,
      [],
      { shot: 6 },
    ),
    beat(
      "Year 16",
      ["MUM 70, DAD 72", "RENT: UP 40 PERCENT"],
      "Year sixteen. Rent goes up. You move back in. Your mum is thrilled.",
      1,
      ["flash"],
      { shot: 4 },
    ),
  ],
  caption:
    "What happens to your parents when you move out.\nYear one is dinner for two and a lot of leftovers.\nCall your mum.",
  hashtags: [
    "reels",
    "explore",
    "whatif",
    "fyp",
    "animation",
    "hypothetical",
    "relatable",
    "family",
    "3danimation",
    "lowpoly",
    "viral",
    "didyouknow",
    "movingout",
    "parents",
    "adulting",
    "callyourmum",
    "emptynest",
    "storytime",
  ],
};

/**
 * An overview: downtown under cocaine, the camera holding wide on the block
 * and then the skyline while the depth follows the arithmetic, the cab gets
 * buried, the plough gives up and the officer climbs out on top.
 */
const NYC: GeneratedSpec = {
  mode: "overview",
  title: "What if it snowed cocaine over New York",
  style: "pixels",
  terrain: "city",
  seed: 88,
  subjectLabel: "YOU",
  subjectParts: person("#2b2b2b", "#3a3a3a", "#e0b08a", "#1f1f1f"),
  subjectKeyframes: [],
  extras: NYC_EXTRAS,
  weatherKind: "snow",
  weatherColor: "#ffffff",
  angle: "deadpan",
  rule: "IT NEVER STOPS SNOWING",
  music: "",
  voicePersona: "dry",
  voicePace: "brisk",
  beats: [
    beat(
      "Day 0",
      ["2 CENTIMETRES", "ONE BILLION DOLLARS"],
      "What if it started snowing cocaine over New York, and it never stopped?",
      1,
      [],
      { shot: 60, fall: 0.5, depth: 0.02 },
    ),
    beat(
      "Day 1",
      ["40 CENTIMETRES", "EVERY CAB STUCK"],
      "Day one. Forty centimetres, every cab is stuck, and nobody in Manhattan has blinked.",
      1,
      [],
      { shot: 60, fall: 0.8, depth: 0.4 },
    ),
    beat(
      "Week 1",
      ["3 METRES", "CARS: GONE"],
      "Week one. Three metres deep. The cars are gone, and the ploughs have given up.",
      1,
      [],
      { shot: 120, fall: 1, depth: 3 },
    ),
    beat(
      "Month 1",
      ["20 METRES", "BROWNSTONES: GONE"],
      "Month one. Twenty metres. The brownstones are gone, and the city is very awake.",
      1,
      [],
      { shot: 200, fall: 1, depth: 20 },
    ),
    beat(
      "Month 3",
      ["90 METRES", "30 STOREYS UNDER"],
      "Month three. Ninety metres, thirty storeys under, and the street value is beyond counting.",
      1,
      [],
      { shot: 200, fall: 1, depth: 90 },
    ),
    beat(
      "Month 6",
      ["300 METRES", "ONLY THE TOWERS"],
      "Month six. Only the tallest towers show. Tomorrow's forecast: flurries.",
      1,
      ["flash"],
      { shot: 200, fall: 0.7, depth: 300 },
    ),
  ],
  caption:
    "What if it snowed cocaine over New York and never stopped.\nMonth one buries the brownstones.\nTag a New Yorker.",
  hashtags: [
    "reels",
    "explore",
    "whatif",
    "fyp",
    "animation",
    "hypothetical",
    "scale",
    "3danimation",
    "pixelart",
    "satisfying",
    "viral",
    "didyouknow",
    "nyc",
    "newyork",
    "manhattan",
    "snowstorm",
    "blizzard",
    "skyline",
  ],
};

export type ExampleId = "a" | "b" | "c" | "d" | "e";
export const EXAMPLE_IDS: readonly ExampleId[] = ["a", "b", "c", "d", "e"];

export const EXAMPLES: Record<ExampleId, GeneratedSpec> = { a: CHEEKS, b: PENNY, c: METRE, d: PARENTS, e: NYC };
