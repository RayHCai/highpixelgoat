import * as THREE from "three";
import { valueNoise } from "../../starter/scene/noise";
import { poses, swing, walk } from "../clips";
import {
  bump,
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
  type Vec3,
} from "../sculpt";
import type { Built } from "./sahur";

/**
 * Locked In Alien, detailed and standing: a lathed bullet head three times
 * taller than it is wide, with the eye sockets, brow ridge, nose and mouth
 * carved into it and shaded dark in the hollows, a long creased neck,
 * sloping shoulders, and a slender matte-white body with long fingers.
 * Unit space, about 1.04 tall, facing +z.
 */

const SEED = 23;
const WHITE = new THREE.Color("#ffffff");
const SHADE = new THREE.Color("#a8a8a6");
const HOLLOW = new THREE.Color("#0c0c0c");

const painted = standard("#ffffff", { roughness: 0.9, vertexColors: true });
const white = standard("#fafaf8", { roughness: 0.9 });
const black = standard("#050505", { roughness: 0.6 });

/** The porcelain speckle every white surface carries. */
function speckle(p: THREE.Vector3, scale: number): number {
  return valueNoise(p.x * scale + p.z * scale * 0.7, p.y * scale + 11, SEED) - 0.5;
}

/** Head in its own space: chin at y = 0, crown at 0.24, widest 0.08 across at the eyes. */
function head(): THREE.Object3D[] {
  const g = lathe(
    [
      [0, 0],
      [0.018, 0.004],
      [0.03, 0.015],
      [0.036, 0.035],
      [0.039, 0.06],
      [0.04, 0.09],
      [0.04, 0.12],
      [0.039, 0.145],
      [0.036, 0.17],
      [0.03, 0.195],
      [0.022, 0.215],
      [0.012, 0.232],
      [0, 0.24],
    ],
    96,
  );
  const socket = (p: THREE.Vector3): number =>
    Math.max(
      bump(Math.hypot((p.x - 0.02) * 1.15, (p.y - 0.126) * 0.8), 0.033),
      bump(Math.hypot((p.x + 0.02) * 1.15, (p.y - 0.126) * 0.8), 0.033),
    );
  const mouth = (p: THREE.Vector3): number => bump(Math.hypot(p.x * 1.1, (p.y - 0.022) * 2.0), 0.015);
  displace(g, (p, n) => {
    const front = Math.max(0, n.z);
    let d = 0.0007 * speckle(p, 140);
    if (front > 0) {
      d -= 0.016 * socket(p) * front;
      d += 0.004 * bump(Math.abs(p.y - 0.154), 0.018) * front * (1 - socket(p));
      d += 0.0045 * bump(Math.hypot(p.x * 2.5, p.y - 0.095), 0.03) * front;
      d -= 0.006 * mouth(p) * front;
    }
    return d;
  });
  paint(g, (p) => {
    const c = WHITE.clone().lerp(SHADE, 0.04 + 0.08 * speckle(p, 60));
    const hollow = p.z > 0 ? Math.max(socket(p), mouth(p)) : 0;
    return c.lerp(HOLLOW, Math.min(1, Math.pow(hollow, 0.6) * 1.2));
  });
  return [
    mesh(g, painted, "skull"),
    mesh(sphere(0.013, 24, 16), black, "eye-left", { at: [0.02, 0.126, 0.018], scale: [1.3, 1.8, 0.8] }),
    mesh(sphere(0.013, 24, 16), black, "eye-right", { at: [-0.02, 0.126, 0.018], scale: [1.3, 1.8, 0.8] }),
    mesh(sphere(0.01, 20, 14), black, "mouth", { at: [0, 0.022, 0.023], scale: [1.5, 0.7, 0.8] }),
    mesh(sphere(0.005, 12, 8), black, "", { at: [0.039, 0.112, 0.002], scale: [0.7, 1.4, 1] }),
    mesh(sphere(0.005, 12, 8), black, "", { at: [-0.039, 0.112, 0.002], scale: [0.7, 1.4, 1] }),
  ];
}

/** The long neck, with the vertical crease the reference shows down its front. */
function neck(): THREE.Mesh {
  const g = cylinder(0.022, 0.027, 0.17, 48);
  const crease = (p: THREE.Vector3): number => {
    const a = Math.atan2(p.x, p.z) + 0.35;
    return bump(Math.abs(a), 0.5) * bump(Math.abs(p.y), 0.09);
  };
  displace(g, (p) => -0.005 * crease(p) + 0.0005 * speckle(p, 160));
  paint(g, (p) =>
    WHITE.clone()
      .lerp(SHADE, 0.08 + 0.08 * speckle(p, 60))
      .lerp(HOLLOW, 0.75 * crease(p)),
  );
  return mesh(g, painted, "neck", { at: [0, 0.715, 0] });
}

/** Shoulders and torso as one smooth mound, local y from the hips (0) to the neck base (0.26). */
function torso(): THREE.Mesh {
  const g = lathe(
    [
      [0.06, 0],
      [0.068, 0.03],
      [0.08, 0.09],
      [0.1, 0.15],
      [0.122, 0.19],
      [0.118, 0.208],
      [0.085, 0.222],
      [0.05, 0.228],
      [0.03, 0.23],
    ],
    64,
  );
  displace(g, (p) => 0.0006 * speckle(p, 120));
  paint(g, (p) => WHITE.clone().lerp(SHADE, 0.06 + 0.08 * speckle(p, 50)));
  return mesh(g, painted, "chest", { at: [0, 0.4, 0] });
}

/** A hand with long thin fingers, hanging open. `s` is the side (+1 left, -1 right). */
function hand(w: Vec3, s: number): THREE.Object3D[] {
  const out: THREE.Object3D[] = [
    mesh(sphere(0.019, 20, 14), white, "", { at: [w[0], w[1] - 0.02, w[2] + 0.004], scale: [0.9, 1.3, 0.5] }),
  ];
  for (let k = 0; k < 4; k++) {
    const x = w[0] + (k - 1.5) * 0.0085 * s;
    const points: Vec3[] = [
      [x, w[1] - 0.036, w[2] + 0.004],
      [x, w[1] - 0.06, w[2] + 0.012],
      [x, w[1] - 0.084, w[2] + 0.01],
    ];
    out.push(mesh(tube(points, 0.0038, { segments: 10, radial: 8, taper: (t) => 1 - 0.35 * t }), white));
  }
  const thumb: Vec3[] = [
    [w[0] - 0.016 * s, w[1] - 0.026, w[2] + 0.01],
    [w[0] - 0.026 * s, w[1] - 0.052, w[2] + 0.02],
  ];
  out.push(mesh(tube(thumb, 0.0038, { segments: 8, radial: 8, taper: (t) => 1 - 0.35 * t }), white));
  return out;
}

function arm(side: number): THREE.Group {
  const shoulder: Vec3 = [side * 0.112, 0.595, 0];
  const elbow: Vec3 = [side * 0.128, 0.44, 0.012];
  const wrist: Vec3 = [side * 0.136, 0.295, 0.03];
  return joint(side > 0 ? "arm-left" : "arm-right", shoulder, [
    limb(shoulder, elbow, 0.017, 0.015, white),
    mesh(sphere(0.015, 16, 12), white, "", { at: elbow }),
    limb(elbow, wrist, 0.015, 0.012, white),
    mesh(sphere(0.012, 16, 12), white, "", { at: wrist }),
    ...hand(wrist, side),
  ]);
}

function leg(side: number): THREE.Group {
  const hip: Vec3 = [side * 0.045, 0.405, 0];
  const knee: Vec3 = [side * 0.05, 0.215, 0.01];
  const ankle: Vec3 = [side * 0.052, 0.045, 0.012];
  return joint(side > 0 ? "leg-left" : "leg-right", hip, [
    limb(hip, knee, 0.026, 0.022, white),
    mesh(sphere(0.022, 16, 12), white, "", { at: knee }),
    limb(knee, ankle, 0.022, 0.017, white),
    mesh(sphere(0.017, 16, 12), white, "", { at: ankle }),
    mesh(capsule(0.024, 0.075, 16), white, "", { at: [side * 0.054, 0.024, 0.05], rot: [90, 0, 0] }),
  ]);
}

export function alienFigure(): Built {
  // The head is sculpted with its chin at the origin; lift it onto the neck before the joint re-bases it.
  const headParts = head();
  for (const part of headParts) part.position.y += 0.8;
  const headGroup = joint("head", [0, 0.8, 0], headParts);
  const torsoGroup = joint("torso", [0, 0.4, 0], [torso(), neck(), headGroup, arm(1), arm(-1)]);
  const root = new THREE.Group();
  root.add(torsoGroup, leg(1), leg(-1));
  return {
    root,
    clips: [
      { name: "Idle", tracks: [swing("torso", [0, 0, 1.5], 3.0), swing("head", [0, 5, 0], 3.0, Math.PI / 2)] },
      { name: "Walk", tracks: walk(1.1, "torso", 25, 18, 0.012) },
      {
        name: "Stare",
        tracks: [
          poses("head", [
            [0, [0, 0, 0]],
            [0.5, [14, 0, 0]],
            [1.4, [14, 0, 0]],
            [2.0, [0, 0, 0]],
          ]),
        ],
      },
    ],
  };
}
