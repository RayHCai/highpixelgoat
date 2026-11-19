import * as THREE from "three";
import type { Avatar, Style } from "../spec/schema";
import type { ActorState } from "../spec/timing";
import { brick, styledMaterial, unitBall } from "./materials";

/**
 * Blocky avatars: box legs, a box torso and box arms under a rounded block
 * head with a drawn face, the people of a blocky building game. The rig is
 * built in "studs" (a classic avatar is two studs wide and about five tall)
 * and scaled so it is 1 tall, like a normalised part model, so a take sizes
 * it by height. Joints pivot where they would bend: legs at the hips, arms
 * at the shoulders, the head at the neck, the torso at the waist. Every pose
 * is a pure function of time, so a frame is the same however it is reached.
 */

interface Proportions {
  leg: [number, number, number];
  torso: [number, number, number];
  arm: [number, number, number];
  head: [number, number, number];
}

const BUILDS: Record<Avatar["build"], Proportions> = {
  classic: { leg: [1, 2, 1], torso: [2, 2, 1], arm: [1, 2, 1], head: [1.25, 1.2, 1.2] },
  slim: { leg: [0.8, 2.2, 0.8], torso: [1.7, 2, 0.85], arm: [0.75, 2, 0.75], head: [1.2, 1.2, 1.15] },
  chunky: { leg: [1.2, 1.8, 1.2], torso: [2.5, 2.1, 1.4], arm: [1.15, 2, 1.15], head: [1.35, 1.25, 1.3] },
  kid: { leg: [0.9, 1.4, 0.9], torso: [1.8, 1.6, 0.95], arm: [0.85, 1.6, 0.85], head: [1.45, 1.4, 1.4] },
};

export interface AvatarRig {
  /** Scale this (or a parent) to size the avatar: it is 1 tall, feet at y = 0, facing +z. */
  root: THREE.Group;
  /** Everything above the ground: moves for jumps and sitting. */
  body: THREE.Group;
  /** Waist pivot; carries the arms and head. */
  torso: THREE.Group;
  head: THREE.Group;
  armLeft: THREE.Group;
  armRight: THREE.Group;
  legLeft: THREE.Group;
  legRight: THREE.Group;
  /** Top of the head (or hat) in the root's unit space, for a callout. */
  top: number;
  /** Height in studs, the unit the poses move in. */
  studs: number;
  holding: boolean;
}

const D = Math.PI / 180;
const TAU = Math.PI * 2;

/**
 * Build an avatar. `held` is the model for the thing in its right hand (a
 * part model already built for the style), or null.
 */
export function buildAvatar(a: Avatar, style: Style, held: THREE.Object3D | null): AvatarRig {
  const p = BUILDS[a.build];
  const mats = new Map<string, THREE.Material>();
  const mat = (color: string): THREE.Material => {
    let m = mats.get(color);
    if (!m) mats.set(color, (m = styledMaterial(style, { color })));
    return m;
  };
  const mesh = (geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geometry, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const [lw, lh, ld] = p.leg;
  const [tw, th, td] = p.torso;
  const [aw, ah, ad] = p.arm;
  const [hw, hh, hd] = p.head;
  const shoe = Math.min(0.45, lh * 0.2);

  const leg = (side: 1 | -1): THREE.Group => {
    const g = new THREE.Group();
    g.position.set((side * lw) / 2, lh, 0);
    g.add(mesh(brick(lw * 0.98, lh - shoe, ld), a.pants, 0, -(lh - shoe) / 2, 0));
    g.add(mesh(brick(lw * 0.98, shoe, ld * 1.08), a.shoes, 0, -lh + shoe / 2, ld * 0.04));
    body.add(g);
    return g;
  };
  const legLeft = leg(1);
  const legRight = leg(-1);

  const torso = new THREE.Group();
  torso.position.set(0, lh, 0);
  body.add(torso);
  torso.add(mesh(brick(tw, th, td, 0.1), a.shirt, 0, th / 2, 0));
  // A belt line where the shirt meets the trousers.
  torso.add(mesh(brick(tw * 1.01, th * 0.1, td * 1.01, 0.04), a.pants, 0, th * 0.05, 0));

  const sleeve = ah * 0.55;
  const arm = (side: 1 | -1): THREE.Group => {
    const g = new THREE.Group();
    // Pivot half an arm-width below the top of the shoulder, so raised arms swing about the joint.
    g.position.set(side * (tw / 2 + aw / 2), th - aw / 2, 0);
    g.add(mesh(brick(aw, sleeve, ad), a.shirt, 0, aw / 2 - sleeve / 2, 0));
    g.add(mesh(brick(aw * 0.96, ah - sleeve, ad * 0.96), a.skin, 0, aw / 2 - sleeve - (ah - sleeve) / 2, 0));
    torso.add(g);
    return g;
  };
  const armLeft = arm(1);
  const armRight = arm(-1);

  const head = new THREE.Group();
  head.position.set(0, th + 0.02, 0);
  torso.add(head);
  head.add(mesh(brick(hw, hh, hd, Math.min(hw, hh) * 0.28), a.skin, 0, hh / 2, 0));
  if (a.face !== "blank") {
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(hw * 0.86, hh * 0.86),
      styledMaterial(style, { map: faceTexture(a.face), alphaTest: 0.5 }),
    );
    face.position.set(0, hh / 2, hd / 2 + 0.012);
    head.add(face);
  }
  let top = hairAndHat(a, head, mesh, hw, hh, hd, style);
  top += lh + th + 0.02;

  let holding = false;
  if (held) {
    const s = a.heldSize * (lh + th + hh);
    held.scale.setScalar(s);
    // Held in front of the fist: its back against the hand, centred on it.
    const box = new THREE.Box3().setFromObject(held);
    const handY = aw / 2 - ah + aw * 0.5;
    held.position.set(-(box.min.x + box.max.x) / 2, handY - (box.min.y + box.max.y) / 2, ad / 2 - box.min.z + 0.02);
    armRight.add(held);
    holding = true;
  }

  const studs = lh + th + hh;
  root.scale.setScalar(1 / studs);
  return { root, body, torso, head, armLeft, armRight, legLeft, legRight, top: top / studs, studs, holding };
}

type MeshFn = (geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => THREE.Mesh;

/** Hair and hat on the head group (origin at the neck). Returns the top of the head in studs above the neck. */
function hairAndHat(
  a: Avatar,
  head: THREE.Group,
  mesh: MeshFn,
  hw: number,
  hh: number,
  hd: number,
  style: Style,
): number {
  const c = a.hairColor;
  let top = hh;
  const cap = (): void => {
    head.add(mesh(brick(hw * 1.07, hh * 0.3, hd * 1.07, 0.12), c, 0, hh * 0.88, 0));
    head.add(mesh(brick(hw * 1.07, hh * 0.72, hd * 0.26, 0.08), c, 0, hh * 0.6, -hd * 0.42));
    top = hh * 1.03;
  };
  switch (a.hair) {
    case "none":
      break;
    case "short":
      cap();
      head.add(mesh(brick(hw * 1.07, hh * 0.13, hd * 0.2, 0.05), c, 0, hh * 0.78, hd * 0.45));
      break;
    case "long":
      cap();
      head.add(mesh(brick(hw * 1.08, hh * 1.35, hd * 0.26, 0.08), c, 0, hh * 0.3, -hd * 0.44));
      for (const s of [1, -1]) {
        head.add(mesh(brick(hw * 0.14, hh * 1.0, hd * 0.9, 0.05), c, s * hw * 0.5, hh * 0.45, 0));
      }
      break;
    case "spiky": {
      cap();
      const spike = new THREE.ConeGeometry(hw * 0.17, hh * 0.42, 4);
      [-0.32, -0.11, 0.11, 0.32].forEach((x, i) => {
        const m = mesh(spike, c, x * hw, hh * 1.12, (i % 2 ? -0.1 : 0.1) * hd);
        m.rotation.z = -x * 0.9;
        head.add(m);
      });
      top = hh * 1.3;
      break;
    }
    case "bun": {
      cap();
      const bun = mesh(unitBall(style), c, 0, hh * 1.14, -hd * 0.22);
      bun.scale.set(hw * 0.42, hh * 0.36, hd * 0.42);
      head.add(bun);
      top = hh * 1.32;
      break;
    }
    case "afro":
      head.add(mesh(brick(hw * 1.5, hh * 1.0, hd * 1.4, 0.4), c, 0, hh * 0.86, -hd * 0.28));
      top = hh * 1.36;
      break;
  }
  const k = a.hatColor;
  switch (a.hat) {
    case "none":
      break;
    case "cap":
      head.add(mesh(brick(hw * 1.1, hh * 0.32, hd * 1.1, 0.12), k, 0, hh * 0.95, 0));
      head.add(mesh(brick(hw * 0.92, hh * 0.06, hd * 0.5, 0.02), k, 0, hh * 0.8, hd * 0.66));
      top = Math.max(top, hh * 1.11);
      break;
    case "beanie":
      head.add(mesh(brick(hw * 1.1, hh * 0.46, hd * 1.1, 0.2), k, 0, hh * 0.97, 0));
      head.add(mesh(brick(hw * 1.14, hh * 0.15, hd * 1.14, 0.05), k, 0, hh * 0.76, 0));
      top = Math.max(top, hh * 1.2);
      break;
    case "tophat":
      head.add(mesh(new THREE.CylinderGeometry(hw * 0.82, hw * 0.82, hh * 0.06, 24), k, 0, hh * 1.04, 0));
      head.add(mesh(new THREE.CylinderGeometry(hw * 0.5, hw * 0.5, hh * 0.85, 24), k, 0, hh * 1.47, 0));
      head.add(mesh(new THREE.CylinderGeometry(hw * 0.51, hw * 0.51, hh * 0.12, 24), "#b3261e", 0, hh * 1.13, 0));
      top = Math.max(top, hh * 1.9);
      break;
    case "crown": {
      head.add(mesh(new THREE.CylinderGeometry(hw * 0.5, hw * 0.5, hh * 0.2, 20), k, 0, hh * 1.06, 0));
      const point = new THREE.ConeGeometry(hw * 0.11, hh * 0.24, 4);
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU;
        head.add(mesh(point, k, Math.sin(ang) * hw * 0.44, hh * 1.27, Math.cos(ang) * hw * 0.44));
      }
      top = Math.max(top, hh * 1.4);
      break;
    }
    case "headphones":
      head.add(mesh(brick(hw * 1.24, hh * 0.09, hd * 0.2, 0.03), k, 0, hh * 1.05, 0));
      for (const s of [1, -1]) {
        head.add(mesh(brick(hw * 0.09, hh * 0.45, hd * 0.2, 0.03), k, s * hw * 0.6, hh * 0.82, 0));
        head.add(mesh(brick(hw * 0.2, hh * 0.44, hd * 0.44, 0.08), "#222228", s * hw * 0.62, hh * 0.5, 0));
      }
      top = Math.max(top, hh * 1.1);
      break;
  }
  return top;
}

const faces = new Map<Avatar["face"], THREE.CanvasTexture>();

/** The face decal: dark features on a transparent square, drawn once per expression. */
function faceTexture(face: Avatar["face"]): THREE.CanvasTexture {
  const hit = faces.get(face);
  if (hit) return hit;
  const S = 256;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext("2d")!;
  const ink = "#16141a";
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineCap = "round";
  g.lineWidth = 14;
  const eye = (x: number, rx = 15, ry = 27, y = 108): void => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, TAU);
    g.fill();
  };
  const arc = (cx: number, cy: number, r: number, from: number, to: number): void => {
    g.beginPath();
    g.arc(cx, cy, r, from, to);
    g.stroke();
  };
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  switch (face) {
    case "smile":
      eye(92);
      eye(164);
      arc(128, 150, 48, 0.18 * Math.PI, 0.82 * Math.PI);
      break;
    case "grin":
      eye(92);
      eye(164);
      g.beginPath();
      g.moveTo(66, 160);
      g.quadraticCurveTo(128, 246, 190, 160);
      g.closePath();
      g.fill();
      g.fillStyle = "#ffffff";
      g.fillRect(84, 162, 88, 16);
      break;
    case "neutral":
      eye(92);
      eye(164);
      line(98, 178, 158, 178);
      break;
    case "shocked":
      g.fillStyle = "#ffffff";
      for (const x of [88, 168]) {
        g.beginPath();
        g.arc(x, 104, 30, 0, TAU);
        g.fill();
        g.lineWidth = 8;
        g.stroke();
      }
      g.fillStyle = ink;
      eye(88, 12, 12, 106);
      eye(168, 12, 12, 106);
      g.beginPath();
      g.ellipse(128, 186, 20, 28, 0, 0, TAU);
      g.fill();
      break;
    case "smug":
      line(70, 104, 112, 108);
      line(144, 108, 186, 104);
      eye(94, 14, 10, 118);
      eye(162, 14, 10, 118);
      g.beginPath();
      g.moveTo(96, 176);
      g.quadraticCurveTo(150, 190, 180, 156);
      g.stroke();
      break;
    case "sad":
      eye(92, 14, 22, 116);
      eye(164, 14, 22, 116);
      line(70, 82, 108, 70);
      line(148, 70, 186, 82);
      arc(128, 214, 40, 1.2 * Math.PI, 1.8 * Math.PI);
      break;
    case "angry":
      eye(94, 15, 20, 118);
      eye(162, 15, 20, 118);
      g.lineWidth = 16;
      line(66, 74, 114, 96);
      line(142, 96, 190, 74);
      g.lineWidth = 14;
      arc(128, 212, 38, 1.22 * Math.PI, 1.78 * Math.PI);
      break;
    case "sleepy":
      arc(92, 104, 22, 0.1 * Math.PI, 0.9 * Math.PI);
      arc(164, 104, 22, 0.1 * Math.PI, 0.9 * Math.PI);
      g.beginPath();
      g.ellipse(128, 180, 12, 14, 0, 0, TAU);
      g.fill();
      break;
    case "blank":
      break;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  faces.set(face, tex);
  return tex;
}

/** What a pose needs from the timeline: where it is in its action and how fast it moves. */
export type PoseState = Pick<ActorState, "moving" | "speed" | "action" | "since">;

/**
 * Pose the rig for this moment. `t` is the video time (it drives the walk
 * cycle and idle sway), `height` the avatar's height in world units (a walk
 * turns into a run past about one and a half heights a second). Resets
 * every joint first, so poses never leak from one frame to the next.
 */
export function poseAvatar(rig: AvatarRig, s: PoseState, t: number, height: number): void {
  const { body, torso, head, armLeft: al, armRight: ar, legLeft: ll, legRight: lr } = rig;
  for (const j of [body, torso, head, al, ar, ll, lr]) j.rotation.set(0, 0, 0);
  body.position.y = 0;
  const since = s.since;
  // Resting arms hang a few degrees off the body.
  al.rotation.z = 3 * D;
  ar.rotation.z = -3 * D;
  let freeRight = true;

  if (s.moving) {
    const run = s.speed / Math.max(1e-3, height) > 1.6;
    const swing = Math.sin(TAU * (run ? 1.5 : 1.0) * t) * (run ? 55 : 32) * D;
    ll.rotation.x = swing;
    lr.rotation.x = -swing;
    al.rotation.x = -swing * 0.9;
    ar.rotation.x = swing * 0.9;
    if (run) torso.rotation.x = 9 * D;
  } else {
    const breathe = Math.sin(TAU * 0.25 * t);
    switch (s.action) {
      case "idle":
        torso.rotation.x = breathe * 1.2 * D;
        al.rotation.z += breathe * 2 * D;
        ar.rotation.z -= breathe * 2 * D;
        head.rotation.y = Math.sin(TAU * 0.07 * t + 1.3) * 12 * D;
        break;
      case "wave":
        ar.rotation.z = (-150 + Math.sin(TAU * 2.2 * since) * 22) * D;
        head.rotation.z = -4 * D;
        freeRight = false;
        break;
      case "jump": {
        const p = (since % 0.8) / 0.8;
        body.position.y = 4 * p * (1 - p) * rig.studs * 0.3;
        const tuck = Math.sin(Math.PI * p);
        ll.rotation.x = -25 * tuck * D;
        lr.rotation.x = -25 * tuck * D;
        al.rotation.z = (40 + 110 * tuck) * D;
        ar.rotation.z = -(40 + 110 * tuck) * D;
        freeRight = false;
        break;
      }
      case "dance": {
        const b = Math.sin(TAU * 1.0 * since);
        body.rotation.y = b * 20 * D;
        body.position.y = Math.abs(Math.sin(TAU * 1.0 * since)) * rig.studs * 0.04;
        al.rotation.z = (90 + 60 * b) * D;
        ar.rotation.z = -(90 - 60 * b) * D;
        ll.rotation.z = Math.max(0, b) * 14 * D;
        lr.rotation.z = -Math.max(0, -b) * 14 * D;
        head.rotation.y = -b * 15 * D;
        freeRight = false;
        break;
      }
      case "point":
        ar.rotation.x = -90 * D;
        ar.rotation.z = 0;
        torso.rotation.y = -8 * D;
        torso.rotation.x = breathe * 1.2 * D;
        freeRight = false;
        break;
      case "cheer": {
        const pump = Math.sin(TAU * 2 * since) * 10;
        al.rotation.z = (160 + pump) * D;
        ar.rotation.z = -(160 + pump) * D;
        body.position.y = Math.abs(Math.sin(TAU * 1.5 * since)) * rig.studs * 0.06;
        freeRight = false;
        break;
      }
      case "sit":
        ll.rotation.x = -90 * D;
        lr.rotation.x = -90 * D;
        body.position.y = -rig.studs * 0.2;
        al.rotation.x = -30 * D;
        ar.rotation.x = -30 * D;
        torso.rotation.x = breathe * 1.2 * D;
        break;
      case "flail": {
        const f = TAU * 3 * since;
        al.rotation.z = (120 + Math.sin(f) * 60) * D;
        ar.rotation.z = -(120 + Math.sin(f + Math.PI) * 60) * D;
        al.rotation.x = Math.sin(f * 0.77) * 50 * D;
        ar.rotation.x = Math.sin(f * 0.77 + 1) * 50 * D;
        ll.rotation.x = Math.sin(f) * 25 * D;
        lr.rotation.x = -Math.sin(f) * 25 * D;
        body.position.y = Math.abs(Math.sin(f / 2)) * rig.studs * 0.05;
        head.rotation.y = Math.sin(f * 1.3) * 25 * D;
        freeRight = false;
        break;
      }
      case "tpose":
        al.rotation.z = 90 * D;
        ar.rotation.z = -90 * D;
        freeRight = false;
        break;
    }
  }
  // Holding something: the right forearm stays raised in front, swinging less.
  if (rig.holding && freeRight) ar.rotation.x = ar.rotation.x * 0.35 - 38 * D;
}
