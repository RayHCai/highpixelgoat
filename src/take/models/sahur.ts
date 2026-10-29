import * as THREE from "three";
import { valueNoise } from "../../starter/scene/noise";
import { poses, swing, walk, type Clip } from "../clips";
import {
  bump,
  cap,
  capsule,
  displace,
  joint,
  lathe,
  limb,
  mesh,
  paint,
  sphere,
  standard,
  tube,
  type Vec3,
} from "../sculpt";

/**
 * Tung Tung Tung Sahur, detailed: a lathed log with wood grain painted per
 * vertex, a human face carved into its front (recessed sockets, a chin, a
 * brow ridge) with lidded eyes, a nose, a closed smile and cheek folds, thin
 * stick limbs with jointed hands and bare feet with toes, and a lathed
 * baseball bat resting on the ground in the right hand. Unit space, about
 * 1 tall, facing +z.
 */

export interface Built {
  root: THREE.Object3D;
  clips: Clip[];
}

const SEED = 11;
const WOOD_DARK = new THREE.Color("#7c3f12");
const WOOD_LIGHT = new THREE.Color("#d8903d");
const FACE = new THREE.Color("#d4843c");
const END_DARK = new THREE.Color("#b06c2a");
const END_LIGHT = new THREE.Color("#ebb872");
const BAT_DARK = new THREE.Color("#a56d2b");
const BAT_LIGHT = new THREE.Color("#e6bb74");

const painted = standard("#ffffff", { roughness: 0.45, vertexColors: true });
const stick = standard("#7c4616", { roughness: 0.8 });
const skin = standard("#c97b33", { roughness: 0.7 });
const sclera = standard("#f4eee3", { roughness: 0.25 });
const iris = standard("#5b3312", { roughness: 0.3 });
const pupil = standard("#140b05", { roughness: 0.3 });
const glint = standard("#ffffff", { roughness: 0.1 });
const lid = standard("#b36d2c", { roughness: 0.7 });
const brow = standard("#4a2a10", { roughness: 0.9 });
const lip = standard("#a24f28", { roughness: 0.55 });
const dark = standard("#36190a", { roughness: 0.9 });
const fold = standard("#a85c24", { roughness: 0.8 });

/** Vertical grain streaks: noise that changes quickly around the trunk and slowly along it. */
function grain(p: THREE.Vector3, darkTone: THREE.Color, lightTone: THREE.Color, seed: number): THREE.Color {
  const a = Math.atan2(p.x, p.z);
  const n1 = valueNoise(Math.sin(a) * 6 + p.y * 1.2, Math.cos(a) * 6 + 40 + p.y * 1.2, seed);
  const n2 = valueNoise(Math.sin(a) * 15 + p.y * 2, Math.cos(a) * 15 + 90 + p.y * 2, seed + 7);
  return darkTone.clone().lerp(lightTone, 0.62 * n1 + 0.38 * n2);
}

function log(): THREE.Mesh {
  const g = lathe(
    [
      [0, 0.3],
      [0.122, 0.3],
      [0.13, 0.33],
      [0.133, 0.55],
      [0.136, 0.8],
      [0.136, 0.955],
      [0.128, 0.975],
      [0.105, 0.985],
      [0, 0.985],
    ],
    72,
  );
  displace(g, (p) => {
    if (p.z < 0.02) return 0;
    let d = 0;
    for (const sx of [-0.066, 0.066]) d -= 0.014 * bump(Math.hypot(p.x - sx, p.y - 0.79), 0.08);
    d += 0.014 * bump(Math.hypot(p.x, p.y - 0.56), 0.065);
    d += 0.006 * bump(Math.hypot(p.x * 0.6, p.y - 0.865), 0.06);
    return d;
  });
  paint(g, (p) => {
    if (p.y > 0.978) {
      const r = Math.hypot(p.x, p.z);
      const ring = 0.5 + 0.5 * Math.sin(r * 95 + valueNoise(p.x * 9, p.z * 9, SEED) * 3);
      return END_DARK.clone().lerp(END_LIGHT, ring);
    }
    const c = grain(p, WOOD_DARK, WOOD_LIGHT, SEED);
    const face = p.z > 0 ? bump(Math.hypot(p.x * 0.9, (p.y - 0.7) * 0.65), 0.17) : 0;
    return c.lerp(FACE, face * 0.6);
  });
  return mesh(g, painted, "log");
}

function eye(x: number): THREE.Object3D[] {
  // Wide open: a big iris, the lids pulled back to the top and bottom of the ball.
  const c: Vec3 = [x, 0.79, 0.105];
  return [
    mesh(sphere(0.058, 32, 20), sclera, "", { at: c }),
    mesh(cap(0.0585, 0.85), iris, "", { at: c, rot: [90, 0, 0] }),
    mesh(cap(0.059, 0.42), pupil, "", { at: c, rot: [90, 0, 0] }),
    mesh(sphere(0.0095, 12, 8), glint, "", { at: [x - 0.015, 0.808, 0.155] }),
    mesh(cap(0.063, 0.62), lid, "", { at: c, rot: [22, 0, 0] }),
    mesh(cap(0.0625, 0.45), lid, "", { at: c, rot: [158, 0, 0] }),
  ];
}

function face(): THREE.Object3D[] {
  const archTaper = (t: number) => 0.45 + 0.55 * Math.sin(t * Math.PI);
  // z puts a point on the log's surface (radius 0.136) at that x.
  const onLog = (x: number, out = 0): number => Math.sqrt(0.136 ** 2 - Math.min(0.13, Math.abs(x)) ** 2) + out;
  const browPoints = (s: number): Vec3[] => [
    [s * -0.105, 0.855, onLog(0.105, -0.004)],
    [s * -0.078, 0.872, onLog(0.078, -0.002)],
    [s * -0.046, 0.878, onLog(0.046, 0.002)],
    [s * -0.02, 0.87, onLog(0.02, 0.002)],
  ];
  // The smile: a wide arc across the front, corners lifted, lips sitting just proud of the log.
  const arc = (dy: number, out = 0.004): Vec3[] =>
    [-0.096, -0.05, 0, 0.05, 0.096].map((x) => [x, 0.612 + dy + 0.03 * (x / 0.096) ** 2, onLog(x, out)]);
  const foldPoints = (s: number): Vec3[] => [
    [s * 0.028, 0.665, onLog(0.028, 0.003)],
    [s * 0.062, 0.638, onLog(0.062, 0.003)],
    [s * 0.102, 0.605, onLog(0.102, -0.002)],
  ];
  return [
    ...eye(-0.066),
    ...eye(0.066),
    mesh(tube(browPoints(1), 0.0055, { segments: 16, radial: 8, taper: archTaper }), brow),
    mesh(tube(browPoints(-1), 0.0055, { segments: 16, radial: 8, taper: archTaper }), brow),
    // A long nose: the bridge runs from between the eyes down to a rounded tip with flared nostrils.
    mesh(capsule(0.017, 0.085, 20), skin, "", { at: [0, 0.732, 0.133], rot: [-16, 0, 0] }),
    mesh(sphere(0.026, 20, 14), skin, "", { at: [0, 0.68, 0.158] }),
    mesh(sphere(0.015, 14, 10), skin, "", { at: [-0.023, 0.684, 0.146] }),
    mesh(sphere(0.015, 14, 10), skin, "", { at: [0.023, 0.684, 0.146] }),
    mesh(sphere(0.0085, 10, 8), dark, "", { at: [-0.013, 0.669, 0.154] }),
    mesh(sphere(0.0085, 10, 8), dark, "", { at: [0.013, 0.669, 0.154] }),
    mesh(tube(arc(0.005), 0.009, { segments: 24, radial: 8, taper: archTaper }), lip),
    mesh(tube(arc(-0.016), 0.012, { segments: 24, radial: 8, taper: archTaper }), lip),
    mesh(tube(arc(-0.005, 0.012), 0.0035, { segments: 24, radial: 6 }), dark),
    mesh(tube(foldPoints(1), 0.0035, { segments: 12, radial: 6, taper: archTaper }), fold),
    mesh(tube(foldPoints(-1), 0.0035, { segments: 12, radial: 6, taper: archTaper }), fold),
  ];
}

/** An open hand hanging from the wrist: a palm and five curled fingers. `s` is the side (+1 left, -1 right). */
function hand(w: Vec3, s: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [
    mesh(sphere(0.03, 20, 14), skin, "", { at: [w[0], w[1] - 0.028, w[2] + 0.005], scale: [0.9, 1.2, 0.55] }),
  ];
  for (let k = 0; k < 4; k++) {
    const x = w[0] + (k - 1.5) * 0.012 * s;
    const points: Vec3[] = [
      [x, w[1] - 0.052, w[2] + 0.005],
      [x, w[1] - 0.075, w[2] + 0.013],
      [x, w[1] - 0.095, w[2] + 0.009],
    ];
    out.push(mesh(tube(points, 0.0055, { segments: 10, radial: 8, taper: (t) => 1 - 0.3 * t }), skin));
  }
  const thumb: Vec3[] = [
    [w[0] - 0.022 * s, w[1] - 0.038, w[2] + 0.012],
    [w[0] - 0.034 * s, w[1] - 0.06, w[2] + 0.022],
  ];
  out.push(mesh(tube(thumb, 0.0055, { segments: 8, radial: 8, taper: (t) => 1 - 0.3 * t }), skin));
  return out;
}

/** A hand closed around the bat handle, which runs through the wrist along `u`. */
function grip(w: Vec3, u: THREE.Vector3): THREE.Object3D[] {
  const centre = new THREE.Vector3(w[0], w[1], w[2]);
  const v1 = new THREE.Vector3().crossVectors(u, new THREE.Vector3(0, 0, 1)).normalize();
  const v2 = new THREE.Vector3().crossVectors(u, v1).normalize();
  const out: THREE.Object3D[] = [
    mesh(sphere(0.026, 20, 14), skin, "", { at: [w[0] + 0.014, w[1] + 0.012, w[2] + 0.012], scale: [1.1, 1.3, 0.8] }),
  ];
  for (let k = 0; k < 4; k++) {
    const along = (k - 1.5) * 0.013;
    const ring = centre.clone().addScaledVector(u, along);
    const points: Vec3[] = [];
    for (let i = 0; i <= 5; i++) {
      const theta = -0.35 * Math.PI + (i / 5) * 1.25 * Math.PI;
      const p = ring
        .clone()
        .addScaledVector(v1, Math.cos(theta) * 0.026)
        .addScaledVector(v2, Math.sin(theta) * 0.026);
      points.push([p.x, p.y, p.z]);
    }
    out.push(mesh(tube(points, 0.0055, { segments: 14, radial: 8, taper: (t) => 1 - 0.25 * t }), skin));
  }
  return out;
}

function bat(groundPoint: Vec3, u: THREE.Vector3): THREE.Mesh {
  const g = lathe(
    [
      [0, 0],
      [0.032, 0],
      [0.045, 0.0105],
      [0.05, 0.043],
      [0.05, 0.144],
      [0.042, 0.195],
      [0.031, 0.246],
      [0.022, 0.288],
      [0.019, 0.339],
      [0.019, 0.388],
      [0.028, 0.398],
      [0.031, 0.406],
      [0, 0.41],
    ],
    40,
  );
  paint(g, (p) => grain(p, BAT_DARK, BAT_LIGHT, SEED + 20));
  const out = mesh(g, painted, "bat", { at: groundPoint });
  out.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
  return out;
}

function arm(side: number, shoulder: Vec3, elbow: Vec3, wrist: Vec3, handParts: THREE.Object3D[]): THREE.Group {
  return joint(side > 0 ? "arm-left" : "arm-right", shoulder, [
    limb(shoulder, elbow, 0.017, 0.014, stick),
    mesh(sphere(0.016, 16, 12), stick, "", { at: elbow }),
    limb(elbow, wrist, 0.014, 0.011, stick),
    mesh(sphere(0.012, 16, 12), stick, "", { at: wrist }),
    ...handParts,
  ]);
}

function leg(side: number): THREE.Group {
  const hip: Vec3 = [side * 0.05, 0.305, 0];
  const knee: Vec3 = [side * 0.06, 0.165, 0.015];
  const ankle: Vec3 = [side * 0.066, 0.035, 0.02];
  const foot: Vec3 = [side * 0.07, 0.022, 0.065];
  const toes: THREE.Object3D[] = [];
  const offsets = [-0.028, -0.015, -0.003, 0.009, 0.02];
  const radii = [0.0092, 0.0078, 0.0072, 0.0066, 0.006];
  offsets.forEach((dx, k) => {
    toes.push(
      mesh(capsule(radii[k]!, 0.016, 10), skin, "", {
        at: [foot[0] + dx * side, 0.012 + radii[k]! * 0.4, 0.158 - Math.abs(dx) * 0.25],
        rot: [90, 0, 0],
      }),
    );
  });
  return joint(side > 0 ? "leg-left" : "leg-right", hip, [
    limb(hip, knee, 0.019, 0.016, stick),
    mesh(sphere(0.018, 16, 12), stick, "", { at: knee }),
    limb(knee, ankle, 0.016, 0.013, stick),
    mesh(sphere(0.015, 16, 12), stick, "", { at: ankle }),
    mesh(sphere(0.03, 24, 16), skin, "", { at: foot, scale: [1.4, 0.8, 3.2] }),
    mesh(sphere(0.025, 16, 12), skin, "", { at: [foot[0], 0.025, -0.02] }),
    ...toes,
  ]);
}

export function sahurNightWatch(): Built {
  // Short arms low on the log, the hands hanging below its bottom; the bat leans from the right hand to the ground.
  const groundPoint: Vec3 = [-0.31, 0.045, 0.19];
  const wristRight: Vec3 = [-0.195, 0.27, 0.05];
  const u = new THREE.Vector3(...wristRight).sub(new THREE.Vector3(...groundPoint)).normalize();
  const armRight = arm(-1, [-0.13, 0.43, 0], [-0.17, 0.355, 0.02], wristRight, [
    ...grip(wristRight, u),
    bat(groundPoint, u),
  ]);
  const wristLeft: Vec3 = [0.195, 0.27, 0.05];
  const armLeft = arm(1, [0.13, 0.43, 0], [0.17, 0.355, 0.02], wristLeft, hand(wristLeft, 1));

  const body = joint("body", [0, 0.3, 0], [log(), ...face(), armLeft, armRight]);
  const root = new THREE.Group();
  root.add(body, leg(1), leg(-1));
  return {
    root,
    clips: [
      { name: "Idle", tracks: [swing("body", [0, 3, 2], 2.4)] },
      { name: "Walk", tracks: walk(1.0, "body", 28, 20, 0.015, 10) },
      {
        name: "Swing",
        tracks: [
          poses("arm-right", [
            [0, [0, 0, 0]],
            [0.35, [-160, 0, -20]],
            [0.55, [-20, 0, 0]],
            [0.8, [-40, 0, -10]],
            [1.2, [0, 0, 0]],
          ]),
          poses("body", [
            [0, [0, 0, 0]],
            [0.35, [-5, 0, 0]],
            [0.55, [8, 0, 0]],
            [1.2, [0, 0, 0]],
          ]),
        ],
      },
    ],
  };
}
