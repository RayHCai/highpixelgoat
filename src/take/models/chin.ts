import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { makeRng, valueNoise } from "../../starter/scene/noise";
import { poses, swing, walk } from "../clips";
import {
  bump,
  cap,
  capsule,
  cylinder,
  displace,
  joint,
  lathe,
  limb,
  mesh,
  paint,
  sphere,
  standard,
  tube,
  weld,
  type Vec3,
} from "../sculpt";
import type { Built } from "./sahur";

/**
 * Chopped Chin, detailed and standing: a long egg-shaped head sculpted with
 * cheekbones, a brow ridge, a drawn-out chin and a pout, half-lidded eyes
 * under thick brows, a shaggy hair cap with a swept fringe and loose curls,
 * a black hoodie with the chest patch, kangaroo pocket, drawstrings and a
 * bunched hood, black jeans and white sneakers. Unit space, about 1.03
 * tall, facing +z.
 */

const SEED = 31;
const SKIN = new THREE.Color("#a46f4c");
const SKIN_SHADE = new THREE.Color("#7d5438");
const SKIN_LIGHT = new THREE.Color("#bd8a63");
const HOODIE_DARK = new THREE.Color("#0c0c0f");
const HOODIE_LIGHT = new THREE.Color("#222228");
const HAIR_DARK = new THREE.Color("#120c09");
const HAIR_LIGHT = new THREE.Color("#2a1c14");

const painted = standard("#ffffff", { roughness: 0.7, vertexColors: true });
const skin = standard("#a46f4c", { roughness: 0.65 });
const skinShade = standard("#7d5438", { roughness: 0.7 });
const hair = standard("#17110d", { roughness: 0.8 });
const hoodie = standard("#121214", { roughness: 0.95 });
const seam = standard("#2c2c31", { roughness: 0.9 });
const string = standard("#cfcfcb", { roughness: 0.8 });
const jeans = standard("#1b1d23", { roughness: 0.9 });
const shoe = standard("#f1f0ec", { roughness: 0.5 });
const sole = standard("#dcdad3", { roughness: 0.7 });
const patch = standard("#f4f4f2", { roughness: 0.5 });
const red = standard("#c8102e", { roughness: 0.5 });
const ink = standard("#1d1d1f", { roughness: 0.6 });
const sclera = standard("#ece6dc", { roughness: 0.3 });
const iris = standard("#3a2416", { roughness: 0.3 });
const pupil = standard("#0c0806", { roughness: 0.3 });
const lipUpper = standard("#5e3a30", { roughness: 0.55 });
const lipLower = standard("#7b4f44", { roughness: 0.5 });
const dark = standard("#2a1a12", { roughness: 0.9 });

/** Head profile (radius, height above the chin): a long egg, narrow at the jaw. */
const HEAD: [number, number][] = [
  [0.01, 0],
  [0.028, 0.015],
  [0.044, 0.04],
  [0.056, 0.07],
  [0.064, 0.1],
  [0.069, 0.13],
  [0.07, 0.155],
  [0.067, 0.18],
  [0.055, 0.195],
  [0.03, 0.205],
  [0, 0.21],
];

function radiusAt(y: number): number {
  for (let i = 1; i < HEAD.length; i++) {
    const [r0, y0] = HEAD[i - 1]!;
    const [r1, y1] = HEAD[i]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

/** z of the head surface at (x, y), plus `out`. */
function onHead(x: number, y: number, out = 0): number {
  const r = radiusAt(y);
  return Math.sqrt(Math.max(0, r * r - x * x)) + out;
}

function head(): THREE.Mesh {
  const g = lathe(HEAD, 72);
  displace(g, (p, n) => {
    const front = Math.max(0, n.z);
    let d = 0;
    for (const s of [-1, 1]) {
      d -= 0.006 * bump(Math.hypot(p.x - s * 0.028, p.y - 0.125), 0.03) * front;
      d += 0.0045 * bump(Math.hypot(p.x - s * 0.05, (p.y - 0.105) * 1.3), 0.03) * Math.max(0, 0.4 + n.z);
    }
    d += 0.003 * bump(Math.abs(p.y - 0.15), 0.014) * front;
    d += 0.007 * bump(Math.hypot(p.x * 1.1, (p.y - 0.012) * 0.8), 0.035) * front;
    d += 0.006 * bump(Math.hypot(p.x * 0.9, (p.y - 0.055) * 1.2), 0.03) * front;
    d -= 0.003 * bump(Math.hypot(p.x * 1.2, p.y - 0.03), 0.012) * front;
    return d;
  });
  paint(g, (p) => {
    const n = valueNoise(p.x * 30, p.y * 30 + p.z * 15, SEED) - 0.5;
    const c = SKIN.clone().lerp(SKIN_LIGHT, 0.5 + n);
    const sockets = Math.max(
      bump(Math.hypot(p.x - 0.028, p.y - 0.125), 0.028),
      bump(Math.hypot(p.x + 0.028, p.y - 0.125), 0.028),
    );
    return c.lerp(SKIN_SHADE, p.z > 0 ? 0.4 * sockets : 0.12);
  });
  return mesh(g, painted, "skull");
}

function eye(side: number): THREE.Object3D[] {
  const x = side * 0.027;
  const c: Vec3 = [x, 0.125, onHead(x, 0.125, -0.008)];
  return [
    mesh(sphere(0.016, 28, 18), sclera, "", { at: c }),
    // The gaze drops a little and drifts to the viewer's left.
    mesh(cap(0.0163, 0.95), iris, "", { at: c, rot: [100, 0, 10] }),
    mesh(cap(0.0166, 0.45), pupil, "", { at: c, rot: [100, 0, 10] }),
    mesh(cap(0.0178, 1.0), skinShade, "", { at: c, rot: [50, 0, 0] }),
    mesh(cap(0.0174, 0.5), skinShade, "", { at: c, rot: [150, 0, 0] }),
  ];
}

function face(): THREE.Object3D[] {
  const flat = (t: number) => 0.7 + 0.3 * Math.sin(t * Math.PI);
  const browPoints = (s: number): Vec3[] => [
    [s * 0.052, 0.15, onHead(0.052, 0.15, 0.002)],
    [s * 0.03, 0.157, onHead(0.03, 0.157, 0.004)],
    [s * 0.01, 0.154, onHead(0.01, 0.154, 0.004)],
  ];
  // The pout: both lips pushed well forward of the face, the mouth narrow.
  const lipArc = (y: number, extra: number): Vec3[] =>
    [-0.026, -0.014, 0, 0.014, 0.026].map((x) => [x, y, onHead(x, y, 0.004 + extra * (1 - (x / 0.026) ** 2))]);
  return [
    ...eye(1),
    ...eye(-1),
    mesh(tube(browPoints(1), 0.0065, { segments: 12, radial: 8, taper: flat }), hair),
    mesh(tube(browPoints(-1), 0.0065, { segments: 12, radial: 8, taper: flat }), hair),
    mesh(capsule(0.011, 0.03, 16), skin, "", { at: [0, 0.103, onHead(0, 0.103, 0.004)], rot: [-12, 0, 0] }),
    mesh(sphere(0.016, 20, 14), skin, "", { at: [0, 0.082, onHead(0, 0.082, 0.011)] }),
    mesh(sphere(0.0125, 16, 12), skin, "", { at: [-0.017, 0.079, onHead(0.017, 0.079, 0.004)] }),
    mesh(sphere(0.0125, 16, 12), skin, "", { at: [0.017, 0.079, onHead(0.017, 0.079, 0.004)] }),
    mesh(sphere(0.0055, 10, 8), dark, "", { at: [-0.009, 0.071, onHead(0.009, 0.071, 0.009)] }),
    mesh(sphere(0.0055, 10, 8), dark, "", { at: [0.009, 0.071, onHead(0.009, 0.071, 0.009)] }),
    mesh(tube(lipArc(0.057, 0.01), 0.0075, { segments: 20, radial: 8, taper: flat }), lipUpper),
    mesh(tube(lipArc(0.043, 0.012), 0.0095, { segments: 20, radial: 8, taper: flat }), lipLower),
    mesh(tube(lipArc(0.05, 0.006), 0.003, { segments: 20, radial: 6 }), dark),
    mesh(sphere(0.013, 16, 12), skin, "ear-left", {
      at: [radiusAt(0.112) + 0.004, 0.112, -0.004],
      scale: [0.7, 1.5, 0.7],
    }),
    mesh(sphere(0.013, 16, 12), skin, "ear-right", {
      at: [-radiusAt(0.112) - 0.004, 0.112, -0.004],
      scale: [0.7, 1.5, 0.7],
    }),
    mesh(sphere(0.007, 12, 8), skinShade, "", { at: [radiusAt(0.112) + 0.008, 0.112, -0.002], scale: [0.6, 1.4, 0.7] }),
    mesh(sphere(0.007, 12, 8), skinShade, "", {
      at: [-radiusAt(0.112) - 0.008, 0.112, -0.002],
      scale: [0.6, 1.4, 0.7],
    }),
  ];
}

/** The hair: a shaggy cap cut along a ragged hairline, a fringe swept to the viewer's right, loose curls. */
function hairParts(): THREE.Object3D[] {
  const centre = new THREE.Vector3(0, 0.12, -0.004);
  const g = weld(new THREE.SphereGeometry(0.09, 56, 40));
  g.translate(centre.x, centre.y, centre.z);
  const hairline = (p: THREE.Vector3): number => {
    const a = Math.atan2(p.x - centre.x, p.z - centre.z);
    const t = (Math.cos(a) + 1) / 2;
    return 0.078 + 0.088 * t + 0.012 * (valueNoise(a * 3, 7, SEED) - 0.5);
  };
  displace(g, (p) => {
    if (p.y < hairline(p)) return -0.035;
    return 0.004 + 0.007 * valueNoise(p.x * 60, p.y * 60 + p.z * 40, SEED + 1);
  });
  paint(g, (p) => HAIR_DARK.clone().lerp(HAIR_LIGHT, valueNoise(p.x * 80, p.y * 80, SEED + 2)));
  const out: THREE.Object3D[] = [mesh(g, painted, "hair")];

  const strand = (t: number) => 1 - 0.5 * t;
  for (let k = 0; k < 14; k++) {
    const sx = -0.036 + k * 0.0055;
    const lift = (k % 3) * 0.003;
    const points: Vec3[] = [
      [sx, 0.19 + lift, 0.046],
      [sx + 0.022, 0.172 + lift, 0.068],
      [sx + 0.042, 0.148, 0.073],
      [sx + 0.054, 0.128, 0.066],
    ];
    out.push(mesh(tube(points, 0.0048, { segments: 16, radial: 8, taper: strand }), hair));
  }
  const rng = makeRng(SEED + 3);
  for (let k = 0; k < 36; k++) {
    const a = (rng() - 0.5) * Math.PI * 2;
    const y = 0.11 + rng() * 0.1;
    const p = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const ring = Math.sqrt(Math.max(0, 0.094 ** 2 - (y - centre.y) ** 2));
    p.multiplyScalar(ring).add(new THREE.Vector3(centre.x, y, centre.z));
    if (p.y < hairline(p) + 0.012) continue;
    const r = 0.008 + rng() * 0.006;
    out.push(mesh(sphere(r, 12, 10), hair, "", { at: [p.x, p.y, p.z], scale: [1, 0.8, 1] }));
  }
  for (const s of [-1, 1]) {
    out.push(
      mesh(
        tube(
          [
            [s * 0.066, 0.135, 0.012],
            [s * 0.065, 0.1, 0.018],
          ],
          0.006,
          { segments: 6, radial: 8, taper: strand },
        ),
        hair,
      ),
    );
  }
  return out;
}

function hoodieTorso(): THREE.Mesh {
  const g = lathe(
    [
      [0.14, 0],
      [0.145, 0.05],
      [0.15, 0.12],
      [0.16, 0.2],
      [0.17, 0.26],
      [0.165, 0.29],
      [0.13, 0.31],
      [0.07, 0.325],
      [0.04, 0.33],
    ],
    56,
  );
  displace(g, (p) => {
    const a = Math.atan2(p.x, p.z);
    return 0.004 * (valueNoise(a * 4, p.y * 18, SEED + 4) - 0.5) - 0.003 * bump(Math.abs(p.y - 0.17), 0.03);
  });
  paint(g, (p) => HOODIE_DARK.clone().lerp(HOODIE_LIGHT, valueNoise(p.x * 25, p.y * 25, SEED + 5)));
  return mesh(g, painted, "hoodie", { at: [0, 0.47, 0], scale: [1, 1, 0.62] });
}

function rounded(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  return weld(new RoundedBoxGeometry(w, h, d, 3, r));
}

function torsoParts(): THREE.Object3D[] {
  const strings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const points: Vec3[] = [
      [s * 0.02, 0.79, 0.078],
      [s * 0.024, 0.745, 0.1],
      [s * 0.03, 0.7, 0.11],
    ];
    strings.push(mesh(tube(points, 0.0035, { segments: 10, radial: 6 }), string));
    strings.push(mesh(capsule(0.004, 0.012, 8), string, "", { at: [s * 0.031, 0.692, 0.111] }));
  }
  const torus = weld(new THREE.TorusGeometry(0.058, 0.02, 12, 40));
  return [
    hoodieTorso(),
    mesh(torus, hoodie, "collar", { at: [0, 0.79, -0.01], rot: [90, 0, 0] }),
    mesh(sphere(0.055, 24, 16), hoodie, "hood", { at: [0, 0.8, -0.1], scale: [1.5, 0.7, 0.8] }),
    mesh(sphere(0.055, 24, 16), hoodie, "", { at: [0, 0.84, -0.08], scale: [1.2, 0.5, 0.7] }),
    mesh(rounded(0.1, 0.036, 0.008, 0.004), patch, "patch", { at: [0, 0.67, 0.103] }),
    mesh(new THREE.BoxGeometry(0.11, 0.01, 0.004), red, "", { at: [0, 0.675, 0.108], rot: [0, 0, -12] }),
    mesh(rounded(0.03, 0.009, 0.003, 0.0015), ink, "", { at: [-0.022, 0.661, 0.108] }),
    mesh(rounded(0.03, 0.009, 0.003, 0.0015), ink, "", { at: [0.02, 0.661, 0.108] }),
    mesh(rounded(0.16, 0.075, 0.016, 0.006), hoodie, "pocket", { at: [0, 0.545, 0.097] }),
    mesh(new THREE.BoxGeometry(0.16, 0.003, 0.004), seam, "", { at: [0, 0.583, 0.106] }),
    mesh(new THREE.BoxGeometry(0.004, 0.05, 0.004), seam, "", { at: [-0.075, 0.545, 0.106] }),
    mesh(new THREE.BoxGeometry(0.004, 0.05, 0.004), seam, "", { at: [0.075, 0.545, 0.106] }),
    ...strings,
    mesh(cylinder(0.034, 0.036, 0.05, 32), skin, "neck", { at: [0, 0.795, 0] }),
  ];
}

function hand(w: Vec3, s: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [
    mesh(sphere(0.03, 20, 14), skin, "", { at: [w[0], w[1] - 0.03, w[2] + 0.01], scale: [0.9, 1.25, 0.5] }),
  ];
  for (let k = 0; k < 4; k++) {
    const x = w[0] + (k - 1.5) * 0.013 * s;
    const points: Vec3[] = [
      [x, w[1] - 0.055, w[2] + 0.01],
      [x, w[1] - 0.078, w[2] + 0.018],
      [x, w[1] - 0.098, w[2] + 0.014],
    ];
    out.push(mesh(tube(points, 0.0062, { segments: 10, radial: 8, taper: (t) => 1 - 0.3 * t }), skin));
  }
  const thumb: Vec3[] = [
    [w[0] - 0.024 * s, w[1] - 0.04, w[2] + 0.016],
    [w[0] - 0.036 * s, w[1] - 0.062, w[2] + 0.026],
  ];
  out.push(mesh(tube(thumb, 0.0062, { segments: 8, radial: 8, taper: (t) => 1 - 0.3 * t }), skin));
  return out;
}

function arm(side: number): THREE.Group {
  const shoulder: Vec3 = [side * 0.165, 0.76, 0];
  const elbow: Vec3 = [side * 0.2, 0.57, 0.02];
  const wrist: Vec3 = [side * 0.21, 0.4, 0.05];
  return joint(side > 0 ? "arm-left" : "arm-right", shoulder, [
    limb(shoulder, elbow, 0.05, 0.043, hoodie),
    mesh(sphere(0.043, 20, 14), hoodie, "", { at: elbow }),
    limb(elbow, wrist, 0.043, 0.037, hoodie),
    mesh(sphere(0.039, 20, 14), hoodie, "", { at: wrist }),
    ...hand(wrist, side),
  ]);
}

function leg(side: number): THREE.Group {
  const hip: Vec3 = [side * 0.075, 0.47, 0];
  const knee: Vec3 = [side * 0.08, 0.26, 0.015];
  const ankle: Vec3 = [side * 0.082, 0.07, 0.02];
  const x = side * 0.084;
  return joint(side > 0 ? "leg-left" : "leg-right", hip, [
    limb(hip, knee, 0.06, 0.048, jeans),
    mesh(sphere(0.048, 20, 14), jeans, "", { at: knee }),
    limb(knee, ankle, 0.048, 0.04, jeans),
    mesh(sphere(0.038, 20, 14), jeans, "", { at: ankle }),
    mesh(rounded(0.085, 0.026, 0.19, 0.01), sole, "", { at: [x, 0.013, 0.05] }),
    mesh(capsule(0.036, 0.08, 20), shoe, "", { at: [x, 0.05, 0.045], rot: [90, 0, 0], scale: [1.05, 0.8, 1] }),
    mesh(sphere(0.032, 20, 14), shoe, "", { at: [x, 0.04, 0.12], scale: [1.1, 0.75, 1] }),
    mesh(new THREE.BoxGeometry(0.03, 0.004, 0.06), sole, "", { at: [x, 0.079, 0.07] }),
  ]);
}

export function chinCourtside(): Built {
  const headParts = [head(), ...face(), ...hairParts()];
  for (const part of headParts) part.position.y += 0.8;
  const headGroup = joint("head", [0, 0.8, 0], headParts);
  const torsoGroup = joint("torso", [0, 0.47, 0], [...torsoParts(), headGroup, arm(1), arm(-1)]);
  const root = new THREE.Group();
  root.add(torsoGroup, leg(1), leg(-1));
  return {
    root,
    clips: [
      { name: "Idle", tracks: [swing("head", [0, 4, 0], 2.6), swing("torso", [0, 0, 1], 2.6, Math.PI / 2)] },
      { name: "Walk", tracks: walk(1.0, "torso", 25, 20, 0.012) },
      {
        name: "SideEye",
        tracks: [
          poses("head", [
            [0, [0, 0, 0]],
            [0.4, [-6, 22, 0]],
            [1.1, [-6, 22, 0]],
            [1.6, [0, 0, 0]],
          ]),
        ],
      },
    ],
  };
}
