import * as THREE from "three";
import { bob, poses, swing, walk, type Clip, type Track } from "./clips";
import type { GlbClip, GlbDocument, GlbGeometry, GlbMaterial, GlbNode, GlbTrack } from "./glb-writer";
import { DETAILED, documentFromBuilt } from "./models";

/**
 * The built-in characters of the 3D asset library: three meme characters in
 * three designs each, written as .glb files by `npm run assets`. One design
 * per character is sculpted in detail (src/take/models, built from dense
 * three.js geometry); the others are modelled from primitives in a unit
 * space (feet on y = 0, facing +z). Every one is a tree of named nodes
 * (head, arm-left, leg-right...) whose pivots sit at the joints, so a take
 * can pose them by name or play the clips authored here with poseAsset.
 * Sizes are real: the root node scales the unit model to `metres`.
 */

type Vec3 = [number, number, number];
type Kind = "box" | "sphere" | "cylinder" | "cone";
const KINDS: Kind[] = ["box", "sphere", "cylinder", "cone"];

/** One primitive: centre, full extents and rotation (degrees, XYZ) in the unit space. */
interface Prim {
  kind: Kind;
  at: Vec3;
  size: Vec3;
  rot: Vec3;
  color: string;
  name?: string;
}
/** A named joint: its children are positioned in the unit space, and rotate about `pivot`. */
interface Group {
  group: string;
  pivot: Vec3;
  parts: Node[];
}
type Node = Prim | Group;

export interface Character {
  /** Library name: <character>/<design>, which is the file's path without .glb. */
  name: string;
  character: string;
  design: string;
  /** Largest dimension in metres. */
  metres: number;
  /** One line on the design: what it looks like and what it suits. */
  notes: string;
  /** A primitive model, unless the design is one of the detailed ones listed in src/take/models. */
  nodes?: Node[];
  clips?: Clip[];
}

const prim = (kind: Kind, at: Vec3, size: Vec3, color: string, rot: Vec3 = [0, 0, 0], name?: string): Prim => ({
  kind,
  at,
  size,
  rot,
  color,
  ...(name ? { name } : {}),
});
const box = (at: Vec3, size: Vec3, color: string, rot?: Vec3, name?: string): Prim =>
  prim("box", at, size, color, rot, name);
const sphere = (at: Vec3, size: number | Vec3, color: string, rot?: Vec3, name?: string): Prim =>
  prim("sphere", at, typeof size === "number" ? [size, size, size] : size, color, rot, name);
const cylinder = (at: Vec3, size: Vec3, color: string, rot?: Vec3, name?: string): Prim =>
  prim("cylinder", at, size, color, rot, name);
const cone = (at: Vec3, size: Vec3, color: string, rot?: Vec3, name?: string): Prim =>
  prim("cone", at, size, color, rot, name);
const group = (name: string, pivot: Vec3, parts: Node[]): Group => ({ group: name, pivot, parts });

function otherSide(name: string): string {
  return name.includes("-left") ? name.replace("-left", "-right") : name.replace("-right", "-left");
}

/** The same nodes mirrored across the x = 0 plane, "-left" and "-right" swapped in their names. */
function mirror(nodes: Node[]): Node[] {
  return nodes.map((n) =>
    "group" in n
      ? { group: otherSide(n.group), pivot: [-n.pivot[0], n.pivot[1], n.pivot[2]], parts: mirror(n.parts) }
      : {
          ...n,
          ...(n.name ? { name: otherSide(n.name) } : {}),
          at: [-n.at[0], n.at[1], n.at[2]],
          rot: [n.rot[0], -n.rot[1], -n.rot[2]],
        },
  );
}

/** A limb group and its mirror image. */
function pair(side: Group): Group[] {
  return [side, mirror([side])[0] as Group];
}

// Tung Tung Tung Sahur: a wooden log with a human face on stick limbs, bare feet and a baseball bat.

const WOOD = "#b9772e";
const WOOD_DARK = "#9c5a1c";
const GRAIN = "#d9a05a";
const BAT = "#c48a3c";
const BAT_GRIP = "#a6702a";
const EYE_WHITE = "#f6f1e6";
const PUPIL = "#3a2212";

/** A bat lying along the unit vector `u` from the ground point `g`: barrel, grip and knob. */
function bat(g: Vec3, u: Vec3, rot: Vec3, thick = 1): Prim[] {
  const along = (k: number): Vec3 => [g[0] + u[0] * k, g[1] + u[1] * k, g[2] + u[2] * k];
  return [
    cylinder(along(0.13), [0.075 * thick, 0.26, 0.075 * thick], BAT, rot),
    cylinder(along(0.35), [0.05 * thick, 0.18, 0.05 * thick], BAT_GRIP, rot),
    sphere(along(0.45), 0.065 * thick, BAT_GRIP),
  ];
}

function sahurChibi(): Character {
  const wood = "#c07a2c";
  const mouth = "#3b1d0a";
  const face: Node[] = [
    sphere([-0.12, 0.7, 0.2], 0.18, EYE_WHITE),
    sphere([0.12, 0.7, 0.2], 0.18, EYE_WHITE),
    sphere([-0.12, 0.7, 0.26], 0.1, "#2a1708"),
    sphere([0.12, 0.7, 0.26], 0.1, "#2a1708"),
    sphere([-0.095, 0.735, 0.3], 0.045, EYE_WHITE),
    sphere([0.095, 0.735, 0.3], 0.045, EYE_WHITE),
    cone([0, 0.6, 0.265], [0.08, 0.1, 0.08], "#a86424", [90, 0, 0]),
    box([0, 0.49, 0.235], [0.22, 0.09, 0.05], mouth),
    box([0, 0.505, 0.245], [0.14, 0.04, 0.05], "#f4ead8"),
    box([-0.125, 0.52, 0.235], [0.05, 0.05, 0.05], mouth),
    box([0.125, 0.52, 0.235], [0.05, 0.05, 0.05], mouth),
  ];
  const armLeft = group(
    "arm-left",
    [0.23, 0.55, 0],
    [
      cylinder([0.27, 0.42, 0.03], [0.08, 0.28, 0.08], WOOD_DARK, [0, 0, 17]),
      sphere([0.315, 0.28, 0.05], 0.1, WOOD_DARK),
    ],
  );
  const armRight = group(
    "arm-right",
    [-0.23, 0.55, 0],
    [
      cylinder([-0.295, 0.48, 0.055], [0.08, 0.24, 0.08], WOOD_DARK, [-38.2, 0, -36.2]),
      sphere([-0.36, 0.41, 0.11], 0.1, WOOD_DARK),
      // Held upright like a staff.
      cylinder([-0.38, 0.17, 0.13], [0.09, 0.3, 0.09], BAT),
      cylinder([-0.38, 0.42, 0.13], [0.06, 0.2, 0.06], BAT_GRIP),
      sphere([-0.38, 0.53, 0.13], 0.08, BAT_GRIP),
    ],
  );
  const legLeft = group(
    "leg-left",
    [0.11, 0.31, 0],
    [cylinder([0.11, 0.16, 0], [0.11, 0.3, 0.11], WOOD_DARK), box([0.12, 0.03, 0.08], [0.13, 0.06, 0.26], wood)],
  );
  return {
    name: "tung-tung-tung-sahur/chibi",
    character: "Tung Tung Tung Sahur",
    design: "Chibi",
    metres: 1.6,
    notes:
      "Short and stout: a fat log, huge eyes with highlights, a toothy grin, stubby limbs and the bat held upright like a staff. Reads at a distance and in the pixel style.",
    nodes: [
      group(
        "body",
        [0, 0.3, 0],
        [
          cylinder([0, 0.58, 0], [0.46, 0.56, 0.46], wood, undefined, "log"),
          cylinder([0, 0.875, 0], [0.47, 0.035, 0.47], "#e0ab5c"),
          cylinder([0, 0.895, 0], [0.3, 0.015, 0.3], "#c58d3e"),
          ...face,
          armLeft,
          armRight,
        ],
      ),
      ...pair(legLeft),
    ],
    clips: [
      { name: "Idle", tracks: [swing("body", [0, 0, 2.5], 2.0), bob("body", 0.01, 2.0, 1)] },
      {
        name: "Walk",
        tracks: [
          swing("leg-left", [25, 0, 0], 0.9),
          swing("leg-right", [25, 0, 0], 0.9, Math.PI),
          swing("arm-left", [18, 0, 0], 0.9, Math.PI),
          bob("body", 0.012, 0.9),
        ],
      },
      {
        name: "Tap",
        tracks: [
          poses("arm-right", [
            [0, [0, 0, 0]],
            [0.2, [-22, 0, 0]],
            [0.4, [0, 0, 0]],
            [0.6, [-22, 0, 0]],
            [0.8, [0, 0, 0]],
            [1.0, [-22, 0, 0]],
            [1.2, [0, 0, 0]],
          ]),
        ],
      },
    ],
  };
}

function sahurRondaPatrol(): Character {
  const maroon = "#6b2d3a";
  const gold = "#c99a4a";
  const mouth = "#3b1d0a";
  const face: Node[] = [
    sphere([-0.075, 0.8, 0.13], 0.1, EYE_WHITE),
    sphere([0.075, 0.8, 0.13], 0.1, EYE_WHITE),
    sphere([-0.075, 0.8, 0.17], 0.055, PUPIL),
    sphere([0.075, 0.8, 0.17], 0.055, PUPIL),
    box([-0.075, 0.87, 0.15], [0.09, 0.03, 0.04], "#5a3212", [0, 0, -12]),
    box([0.075, 0.87, 0.15], [0.09, 0.03, 0.04], "#5a3212", [0, 0, 12]),
    cone([0, 0.72, 0.165], [0.06, 0.09, 0.06], "#a8681f", [90, 0, 0]),
    box([0, 0.63, 0.145], [0.1, 0.07, 0.05], mouth),
  ];
  const armLeft = group(
    "arm-left",
    [0.16, 0.7, 0],
    [
      cylinder([0.205, 0.56, 0.02], [0.06, 0.28, 0.06], WOOD_DARK, [0, 0, 18]),
      sphere([0.25, 0.42, 0.06], 0.07, WOOD_DARK),
    ],
  );
  const armRight = group(
    "arm-right",
    [-0.16, 0.7, 0],
    [
      cylinder([-0.235, 0.84, 0.02], [0.06, 0.31, 0.06], WOOD_DARK, [0, 0, 27]),
      sphere([-0.31, 0.99, 0.03], 0.07, WOOD_DARK),
      // Raised overhead, about to strike.
      ...bat([-0.346, 0.98, 0.045], [0.895, 0.253, -0.37], [-55.7, 0, -63.5]),
    ],
  );
  const legLeft = group(
    "leg-left",
    [0.08, 0.21, 0],
    [cylinder([0.08, 0.11, 0], [0.06, 0.2, 0.06], WOOD_DARK), box([0.09, 0.025, 0.06], [0.085, 0.05, 0.2], WOOD)],
  );
  return {
    name: "tung-tung-tung-sahur/ronda-patrol",
    character: "Tung Tung Tung Sahur",
    design: "Ronda Patrol",
    metres: 2.3,
    notes:
      "On night patrol: a striped sarong around the hips, a slit-drum cut in its side, knitted brows, mouth open mid-shout and the bat raised overhead. Walks and strikes.",
    nodes: [
      group(
        "body",
        [0, 0.3, 0],
        [
          cylinder([0, 0.6, 0], [0.3, 0.6, 0.3], WOOD, undefined, "log"),
          cylinder([0, 0.905, 0], [0.31, 0.03, 0.31], GRAIN),
          box([0.14, 0.62, 0], [0.05, 0.2, 0.045], mouth, undefined, "slit"),
          cylinder([0, 0.3, 0], [0.36, 0.2, 0.36], maroon, undefined, "sarong"),
          cylinder([0, 0.35, 0], [0.37, 0.03, 0.37], gold),
          cylinder([0, 0.25, 0], [0.37, 0.03, 0.37], gold),
          box([0, 0.39, 0.17], [0.1, 0.06, 0.06], maroon),
          ...face,
          armLeft,
          armRight,
        ],
      ),
      ...pair(legLeft),
    ],
    clips: [
      { name: "Idle", tracks: [swing("body", [0, 0, 2], 2.4), swing("arm-right", [0, 0, 4], 2.4, Math.PI / 2)] },
      {
        name: "Walk",
        tracks: [
          swing("leg-left", [25, 0, 0], 1.0),
          swing("leg-right", [25, 0, 0], 1.0, Math.PI),
          swing("arm-left", [15, 0, 0], 1.0, Math.PI),
          bob("body", 0.012, 1.0),
        ],
      },
      {
        name: "Strike",
        tracks: [
          poses("arm-right", [
            [0, [0, 0, 0]],
            [0.25, [-15, 0, 0]],
            [0.5, [130, 0, 0]],
            [0.7, [115, 0, 0]],
            [1.0, [0, 0, 0]],
          ]),
          poses("body", [
            [0, [0, 0, 0]],
            [0.25, [-6, 0, 0]],
            [0.5, [12, 0, 0]],
            [1.0, [0, 0, 0]],
          ]),
        ],
      },
    ],
  };
}

// Locked In Alien: a stark white figure with a long bullet head, hollow black eyes and a small open mouth.

const WHITE = "#f4f4f2";
const WHITE_DIM = "#e8e8e6";
const BLACK = "#0a0a0a";

function alienBust(): Character {
  return {
    name: "locked-in-alien/bust",
    character: "Locked In Alien",
    design: "Bust",
    metres: 1.1,
    notes:
      "The reference framing: head, long neck and sloping shoulders on a round plinth, matte white with black sockets. For close-ups and reaction shots; the head turns and leans in.",
    nodes: [
      cylinder([0, 0.05, 0], [0.92, 0.1, 0.92], "#efefed", undefined, "plinth"),
      cone([0, 0.3, 0], [0.86, 0.4, 0.86], WHITE, undefined, "shoulders"),
      cylinder([0, 0.6, 0], [0.14, 0.3, 0.14], WHITE_DIM, undefined, "neck"),
      group(
        "head",
        [0, 0.74, 0],
        [
          sphere([0, 0.98, 0], [0.34, 0.56, 0.36], WHITE, undefined, "skull"),
          sphere([0, 0.82, 0.03], [0.26, 0.26, 0.28], WHITE),
          sphere([-0.075, 1.0, 0.16], [0.1, 0.14, 0.08], BLACK, undefined, "eye-left"),
          sphere([0.075, 1.0, 0.16], [0.1, 0.14, 0.08], BLACK, undefined, "eye-right"),
          sphere([0, 0.84, 0.16], [0.06, 0.05, 0.06], BLACK, undefined, "mouth"),
          sphere([0, 0.92, 0.17], [0.06, 0.07, 0.06], "#ececea"),
          sphere([-0.17, 0.96, 0], [0.05, 0.07, 0.06], BLACK),
          sphere([0.17, 0.96, 0], [0.05, 0.07, 0.06], BLACK),
        ],
      ),
    ],
    clips: [
      { name: "Idle", tracks: [swing("head", [0, 4, 0], 3.0)] },
      {
        name: "Stare",
        tracks: [
          poses("head", [
            [0, [0, 0, 0]],
            [0.5, [12, 0, 0]],
            [1.4, [12, 0, 0]],
            [2.0, [0, 0, 0]],
          ]),
        ],
      },
      {
        name: "Lock",
        tracks: [
          poses("head", [
            [0, [0, 28, 0]],
            [0.3, [0, -4, 0]],
            [0.45, [0, 0, 0]],
            [1.7, [0, 0, 0]],
            [2.0, [0, 28, 0]],
          ]),
        ],
      },
    ],
  };
}

function alienLurker(): Character {
  const armLeft = group(
    "arm-left",
    [0.2, 0.95, 0.05],
    [
      cylinder([0.21, 0.85, 0.175], [0.07, 0.32, 0.07], WHITE, [-51, 0, 3.6]),
      cylinder([0.21, 0.715, 0.45], [0.065, 0.31, 0.065], WHITE, [-77, 0, -3.7]),
      box([0.2, 0.66, 0.66], [0.08, 0.05, 0.14], WHITE, undefined, "hand-left"),
    ],
  );
  const legLeft = group(
    "leg-left",
    [0.1, 0.6, 0],
    [
      cylinder([0.11, 0.475, 0.09], [0.1, 0.31, 0.1], WHITE, [-36, 0, 3.7]),
      cylinder([0.12, 0.2, 0.115], [0.085, 0.33, 0.085], WHITE, [23.4, 0, 0]),
      box([0.12, 0.03, 0.1], [0.09, 0.06, 0.22], WHITE),
    ],
  );
  return {
    name: "locked-in-alien/lurker",
    character: "Locked In Alien",
    design: "Lurker",
    metres: 2.0,
    notes:
      "Hunched and reaching: knees bent, torso leaning in, arms stretched forward, the head stretched longer and tilted at whoever it is locked onto. Creeps and lunges.",
    nodes: [
      group(
        "torso",
        [0, 0.6, 0],
        [
          box([0, 0.6, 0.02], [0.3, 0.16, 0.2], WHITE),
          box([0, 0.78, -0.02], [0.34, 0.4, 0.2], WHITE, [20, 0, 0], "chest"),
          cylinder([0, 1.0, 0.04], [0.11, 0.22, 0.11], WHITE_DIM, [25, 0, 0], "neck"),
          group(
            "head",
            [0, 1.1, 0.08],
            [
              sphere([0, 1.35, 0.12], [0.3, 0.7, 0.32], WHITE, [15, 0, 0], "skull"),
              sphere([-0.07, 1.4, 0.27], [0.1, 0.14, 0.08], BLACK, undefined, "eye-left"),
              sphere([0.07, 1.4, 0.27], [0.1, 0.14, 0.08], BLACK, undefined, "eye-right"),
              sphere([0, 1.19, 0.235], [0.08, 0.05, 0.06], BLACK, undefined, "mouth"),
            ],
          ),
          ...pair(armLeft),
        ],
      ),
      ...pair(legLeft),
    ],
    clips: [
      { name: "Idle", tracks: [swing("torso", [3, 0, 0], 3.0), swing("head", [0, 6, 0], 3.0, Math.PI / 2)] },
      { name: "Creep", tracks: walk(1.4, "torso", 18, 12, 0.01) },
      {
        name: "Lunge",
        tracks: [
          poses("torso", [
            [0, [0, 0, 0]],
            [0.25, [-8, 0, 0]],
            [0.5, [25, 0, 0]],
            [0.75, [20, 0, 0]],
            [1.0, [0, 0, 0]],
          ]),
          poses("arm-left", [
            [0, [0, 0, 0]],
            [0.5, [-25, 0, 0]],
            [1.0, [0, 0, 0]],
          ]),
          poses("arm-right", [
            [0, [0, 0, 0]],
            [0.5, [-25, 0, 0]],
            [1.0, [0, 0, 0]],
          ]),
          poses("head", [
            [0, [0, 0, 0]],
            [0.5, [10, 0, 0]],
            [1.0, [0, 0, 0]],
          ]),
        ],
      },
    ],
  };
}

// Chopped Chin: a young man in a black hoodie at a basketball game, shaggy fringe, pursed lips and a very long chin.

const HOODIE = "#111214";
const LOGO = "#f2f2f2";
const RED = "#c8102e";
const JEANS = "#22242b";
const SHOE = "#f0f0ee";
const SKIN = "#8d5a3b";
const SKIN_DARK = "#7a4c30";
const LIPS = "#5a3327";
const LIP_LOWER = "#704036";
const HAIR = "#15110f";
const EYE_DARK = "#1a1410";

/** The face and hair around a head box centred at `c` (the head is 0.24 wide and 0.2 tall), chin hanging below. */
function chinHead(c: Vec3): Prim[] {
  const [x, y, z] = c;
  const at = (dx: number, dy: number, dz: number): Vec3 => [x + dx, y + dy, z + dz];
  return [
    box(c, [0.24, 0.2, 0.24], SKIN, undefined, "skull"),
    box(at(0, -0.14, 0.04), [0.16, 0.12, 0.18], SKIN, undefined, "chin"),
    box(at(0, -0.075, 0.135), [0.09, 0.05, 0.05], LIPS, undefined, "lips"),
    box(at(0, -0.095, 0.14), [0.08, 0.04, 0.045], LIP_LOWER),
    box(at(-0.055, 0.01, 0.12), [0.05, 0.04, 0.05], EYE_DARK, undefined, "eye-left"),
    box(at(0.055, 0.01, 0.12), [0.05, 0.04, 0.05], EYE_DARK, undefined, "eye-right"),
    box(at(-0.06, 0.055, 0.12), [0.08, 0.03, 0.045], EYE_DARK),
    box(at(0.06, 0.055, 0.12), [0.08, 0.03, 0.045], EYE_DARK),
    box(at(0, -0.03, 0.13), [0.05, 0.07, 0.05], SKIN_DARK),
    box(at(0, 0.11, -0.01), [0.28, 0.08, 0.28], HAIR, undefined, "hair"),
    box(at(-0.145, 0.04, -0.02), [0.05, 0.14, 0.24], HAIR),
    box(at(0.145, 0.04, -0.02), [0.05, 0.14, 0.24], HAIR),
    box(at(0.03, 0.08, 0.12), [0.22, 0.07, 0.05], HAIR, [0, 0, -12], "fringe"),
    sphere(at(-0.08, 0.16, 0.02), 0.12, HAIR),
    sphere(at(0.06, 0.17, -0.04), 0.11, HAIR),
    sphere(at(0.1, 0.14, 0.07), 0.1, HAIR),
  ];
}

/** The hoodie's chest patch: a white rectangle with a red diagonal band. */
function patch(c: Vec3, w = 0.2): Prim[] {
  return [
    box(c, [w, w * 0.35, 0.05], LOGO),
    box([c[0], c[1], c[2] + 0.025], [w * 0.8, w * 0.17, 0.03], RED, [0, 0, -12]),
  ];
}

const sideEye: Clip = {
  name: "SideEye",
  tracks: [
    poses("head", [
      [0, [0, 0, 0]],
      [0.4, [-6, 22, 0]],
      [1.1, [-6, 22, 0]],
      [1.6, [0, 0, 0]],
    ]),
  ],
};

function chinSeated(): Character {
  const seatBlue = "#1f3b73";
  const armLeft = group(
    "arm-left",
    [0.27, 0.65, -0.06],
    [
      box([0.27, 0.52, -0.06], [0.12, 0.26, 0.13], HOODIE),
      box([0.235, 0.37, 0.07], [0.1, 0.24, 0.1], HOODIE, [-74.6, 0, -17]),
      box([0.2, 0.33, 0.19], [0.1, 0.06, 0.1], SKIN, undefined, "hand-left"),
    ],
  );
  const legLeft = group(
    "leg-left",
    [0.09, 0.3, -0.12],
    [
      box([0.09, 0.3, 0.05], [0.14, 0.1, 0.34], JEANS),
      box([0.09, 0.12, 0.2], [0.13, 0.24, 0.14], JEANS),
      box([0.09, 0.035, 0.26], [0.15, 0.07, 0.24], SHOE),
    ],
  );
  return {
    name: "chopped-chin/seated",
    character: "Chopped Chin",
    design: "Seated",
    metres: 1.3,
    notes:
      "The meme frame: sitting on an arena seat, forearms on his knees, deadpan. Comes with its blue seat and pedestal; keep it still or let it lean forward and look sideways.",
    nodes: [
      box([0, 0.09, -0.1], [0.3, 0.18, 0.3], "#2a2d33", undefined, "pedestal"),
      box([0, 0.22, -0.1], [0.44, 0.08, 0.4], seatBlue, undefined, "seat"),
      box([0, 0.45, -0.28], [0.44, 0.4, 0.06], seatBlue, undefined, "backrest"),
      ...pair(legLeft),
      group(
        "torso",
        [0, 0.35, -0.08],
        [
          box([0, 0.52, -0.08], [0.4, 0.34, 0.22], HOODIE, undefined, "hoodie"),
          ...patch([0, 0.58, 0.035]),
          box([0, 0.71, -0.17], [0.3, 0.1, 0.12], HOODIE, undefined, "hood"),
          box([0, 0.7, -0.08], [0.12, 0.08, 0.12], SKIN, undefined, "neck"),
          group("head", [0, 0.72, -0.08], chinHead([0, 0.82, -0.08])),
          ...pair(armLeft),
        ],
      ),
    ],
    clips: [
      { name: "Idle", tracks: [swing("head", [0, 3, 0], 2.6), swing("torso", [1.5, 0, 0], 2.6, Math.PI / 2)] },
      sideEye,
      {
        name: "Lean",
        tracks: [
          poses("torso", [
            [0, [0, 0, 0]],
            [0.4, [10, 0, 0]],
            [1.0, [10, 0, 0]],
            [1.4, [0, 0, 0]],
          ]),
        ],
      },
    ],
  };
}

function chinChopped(): Character {
  const armLeft = group(
    "arm-left",
    [0.2, 0.39, 0],
    [
      box([0.2, 0.27, 0], [0.1, 0.24, 0.12], HOODIE),
      box([0.2, 0.12, 0.02], [0.08, 0.06, 0.09], SKIN, undefined, "hand-left"),
    ],
  );
  const legLeft = group(
    "leg-left",
    [0.07, 0.16, 0],
    [box([0.07, 0.08, 0], [0.12, 0.16, 0.14], JEANS), box([0.075, 0.03, 0.04], [0.13, 0.06, 0.2], SHOE)],
  );
  return {
    name: "chopped-chin/chopped",
    character: "Chopped Chin",
    design: "Chopped",
    metres: 1.5,
    notes:
      "The caricature: a huge head on a small body, half-lidded eyes, a big pout and the chin drawn out into a long wedge. For the joke itself; walks and looks sideways.",
    nodes: [
      group(
        "torso",
        [0, 0.16, 0],
        [
          box([0, 0.28, 0], [0.3, 0.26, 0.18], HOODIE, undefined, "hoodie"),
          ...patch([0, 0.3, 0.095], 0.14),
          box([0, 0.42, -0.08], [0.24, 0.08, 0.1], HOODIE, undefined, "hood"),
          group(
            "head",
            [0, 0.62, 0],
            [
              box([0, 0.78, 0], [0.36, 0.28, 0.34], SKIN, undefined, "skull"),
              box([0, 0.63, 0.04], [0.26, 0.08, 0.28], SKIN),
              cone([0, 0.5, 0.07], [0.22, 0.26, 0.24], SKIN, [180, 0, 0], "chin"),
              box([0, 0.66, 0.19], [0.14, 0.06, 0.06], LIPS, undefined, "lips"),
              box([0, 0.63, 0.195], [0.12, 0.05, 0.05], LIP_LOWER),
              box([-0.08, 0.8, 0.17], [0.09, 0.05, 0.05], EYE_DARK, undefined, "eye-left"),
              box([0.08, 0.8, 0.17], [0.09, 0.05, 0.05], EYE_DARK, undefined, "eye-right"),
              box([-0.08, 0.83, 0.175], [0.1, 0.03, 0.05], SKIN_DARK),
              box([0.08, 0.83, 0.175], [0.1, 0.03, 0.05], SKIN_DARK),
              box([-0.085, 0.87, 0.17], [0.11, 0.035, 0.045], EYE_DARK, [0, 0, -8]),
              box([0.085, 0.87, 0.17], [0.11, 0.035, 0.045], EYE_DARK, [0, 0, 8]),
              box([0, 0.74, 0.18], [0.06, 0.08, 0.05], SKIN_DARK),
              box([0, 0.95, -0.01], [0.4, 0.1, 0.38], HAIR, undefined, "hair"),
              box([-0.2, 0.84, -0.02], [0.06, 0.2, 0.32], HAIR),
              box([0.2, 0.84, -0.02], [0.06, 0.2, 0.32], HAIR),
              box([0.04, 0.9, 0.17], [0.32, 0.09, 0.06], HAIR, [0, 0, -10], "fringe"),
              sphere([-0.12, 1.0, 0.04], 0.16, HAIR),
              sphere([0.06, 1.02, -0.06], 0.15, HAIR),
              sphere([0.16, 0.97, 0.08], 0.13, HAIR),
              sphere([-0.02, 1.03, 0.12], 0.12, HAIR),
            ],
          ),
          ...pair(armLeft),
        ],
      ),
      ...pair(legLeft),
    ],
    clips: [
      { name: "Idle", tracks: [swing("head", [0, 5, 3], 2.4)] },
      { name: "Walk", tracks: walk(0.9, "torso", 25, 20, 0.01) },
      sideEye,
    ],
  };
}

/** The nine built-in characters, three designs each; the first of each three is the detailed one. */
export const CHARACTERS: Character[] = [
  {
    name: "tung-tung-tung-sahur/night-watch",
    character: "Tung Tung Tung Sahur",
    design: "Night Watch",
    metres: 2.4,
    notes:
      "The reference pose, sculpted: a lathed log with painted grain, a carved face with wide lidded eyes, a long nose and a closed smile, stick limbs with fingers and toes, the bat resting on the ground in its right hand. Walks and swings.",
  },
  sahurChibi(),
  sahurRondaPatrol(),
  {
    name: "locked-in-alien/figure",
    character: "Locked In Alien",
    design: "Figure",
    metres: 2.3,
    notes:
      "The whole creature standing, sculpted: a bullet head three times taller than wide with carved black sockets, brow and mouth, a long creased neck, sloping shoulders and a slender matte-white body with long fingers. Walks and stares.",
  },
  alienBust(),
  alienLurker(),
  {
    name: "chopped-chin/courtside",
    character: "Chopped Chin",
    design: "Courtside",
    metres: 1.8,
    notes:
      "Standing, life-sized, sculpted: a long egg head with cheekbones, a drawn-out chin and a pout, half-lidded eyes under thick brows, shaggy hair with a swept fringe, a black hoodie with the chest patch, pocket, drawstrings and bunched hood, black jeans and white sneakers. Walks, looks sideways.",
  },
  chinSeated(),
  chinChopped(),
];

// From the unit-space tree to a glTF document.

function quaternion(deg: Vec3): [number, number, number, number] {
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(deg[0]),
    THREE.MathUtils.degToRad(deg[1]),
    THREE.MathUtils.degToRad(deg[2]),
    "XYZ",
  );
  const q = new THREE.Quaternion().setFromEuler(e);
  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  return [round(q.x), round(q.y), round(q.z), round(q.w)];
}

function fromThree(g: THREE.BufferGeometry): GlbGeometry {
  const index = g.getIndex();
  if (!index) throw new Error("geometry must be indexed");
  return {
    positions: Float32Array.from(g.getAttribute("position").array),
    normals: Float32Array.from(g.getAttribute("normal").array),
    indices: Uint16Array.from(index.array),
  };
}

let geometries: GlbGeometry[] | null = null;
/** Unit primitives in KINDS order, shared by every primitive character: a cube, and a sphere, cylinder and cone 1 across and 1 tall. */
function unitGeometries(): GlbGeometry[] {
  geometries ??= [
    fromThree(new THREE.BoxGeometry(1, 1, 1)),
    fromThree(new THREE.SphereGeometry(0.5, 16, 12)),
    fromThree(new THREE.CylinderGeometry(0.5, 0.5, 1, 16)),
    fromThree(new THREE.ConeGeometry(0.5, 1, 16)),
  ];
  return geometries;
}

/** Largest dimension of the unit-space model, measured like inspectGlb does (rotated bounding boxes). */
function extent(nodes: Node[]): number {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const v = new THREE.Vector3();
  const visit = (n: Node): void => {
    if ("group" in n) {
      n.parts.forEach(visit);
      return;
    }
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(n.rot[0]),
        THREE.MathUtils.degToRad(n.rot[1]),
        THREE.MathUtils.degToRad(n.rot[2]),
        "XYZ",
      ),
    );
    for (let corner = 0; corner < 8; corner++) {
      v.set(
        (corner & 1 ? 0.5 : -0.5) * n.size[0],
        (corner & 2 ? 0.5 : -0.5) * n.size[1],
        (corner & 4 ? 0.5 : -0.5) * n.size[2],
      ).applyQuaternion(q);
      const p = [v.x + n.at[0], v.y + n.at[1], v.z + n.at[2]];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i]!, p[i]!);
        max[i] = Math.max(max[i]!, p[i]!);
      }
    }
  };
  nodes.forEach(visit);
  return Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** The glTF document for a character: a detailed build, or the primitive tree with one material per colour and its clips. */
export function buildCharacter(c: Character): GlbDocument {
  const detailed = DETAILED[c.name];
  if (detailed) return documentFromBuilt(detailed(), c.metres, c.name.replace("/", "-"));
  if (!c.nodes || !c.clips) throw new Error(`${c.name} has neither a detailed build nor a primitive model`);

  const materials: GlbMaterial[] = [];
  const materialIndex = new Map<string, number>();
  const materialFor = (hex: string): number => {
    let index = materialIndex.get(hex);
    if (index === undefined) {
      const color = new THREE.Color(hex);
      index = materials.push({ name: hex.slice(1), color: [color.r, color.g, color.b] }) - 1;
      materialIndex.set(hex, index);
    }
    return index;
  };
  /** Rest translation of every node, so a translation track can offset it. */
  const rest = new Map<string, Vec3>();
  let unnamed = 0;
  const convert = (n: Node, parent: Vec3): GlbNode => {
    if ("group" in n) {
      const translation = sub(n.pivot, parent);
      rest.set(n.group, translation);
      return { name: n.group, translation, children: n.parts.map((p) => convert(p, n.pivot)) };
    }
    const name = n.name ?? `${n.kind}-${++unnamed}`;
    const translation = sub(n.at, parent);
    rest.set(name, translation);
    return {
      name,
      translation,
      rotation: quaternion(n.rot),
      scale: n.size,
      mesh: { geometry: KINDS.indexOf(n.kind), material: materialFor(n.color) },
    };
  };
  const children = c.nodes.map((n) => convert(n, [0, 0, 0]));
  const scale = c.metres / extent(c.nodes);
  const root: GlbNode = { name: c.name.replace("/", "-"), scale: [scale, scale, scale], children };

  const track = (t: Track): GlbTrack => {
    const times = t.keys.map(([time]) => time);
    if (t.path === "rotation") {
      return { node: t.node, path: "rotation", times, values: t.keys.flatMap(([, deg]) => quaternion(deg)) };
    }
    const base = rest.get(t.node);
    if (!base) throw new Error(`${c.name}: a clip moves a node named "${t.node}" that does not exist`);
    return {
      node: t.node,
      path: "translation",
      times,
      values: t.keys.flatMap(([, off]) => [base[0] + off[0], base[1] + off[1], base[2] + off[2]]),
    };
  };
  const clips: GlbClip[] = c.clips.map((clip) => ({ name: clip.name, tracks: clip.tracks.map(track) }));

  return { geometries: unitGeometries(), materials, nodes: [root], clips };
}
