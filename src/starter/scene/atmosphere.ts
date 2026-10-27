import * as THREE from "three";
import type { Style, WeatherKind } from "../spec/schema";
import type { TimelineState } from "../spec/timing";
import { clamp01, easeOutCubic } from "../spec/timing";
import { fbm, makeRng } from "./noise";
import { toonGradient } from "./terrain";

/**
 * Everything that moves besides the subject and camera: drifting clouds, the
 * one-shot beat effects (debris burst, dust ring), and the weather (whatever
 * falls over the set, and the sheet of it piling up on the ground). All
 * motion is a pure function of time so capture is deterministic.
 */

function puffMaterial(style: Style): THREE.Material {
  return style === "drawing"
    ? new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: toonGradient() })
    : new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: style === "lowpoly" });
}

function puffGeometry(style: Style): THREE.BufferGeometry {
  return style === "pixels" ? new THREE.BoxGeometry(1, 1, 1) : new THREE.IcosahedronGeometry(0.62, 1);
}

/** Debris is earth and rubble, not cloud: a dusty tan that reads against lawns, roads and floors. */
function debrisMaterial(style: Style): THREE.Material {
  return style === "drawing"
    ? new THREE.MeshToonMaterial({ color: "#b9a888", gradientMap: toonGradient() })
    : new THREE.MeshLambertMaterial({ color: "#b9a888", flatShading: style === "lowpoly" });
}

interface Puff {
  x: number;
  y: number;
  z: number;
  s: number;
  /** Drift speed in units per second. */
  v: number;
}

/** Radius around the subject no cloud enters. */
const CLOUD_CLEARANCE = 60;

export class Clouds {
  readonly mesh: THREE.InstancedMesh;
  private puffs: Puff[] = [];
  private tmp = new THREE.Matrix4();
  private extent: number;

  constructor(style: Style, seed: number, extent: number) {
    this.extent = extent;
    const rng = makeRng(seed + 303);
    // Clusters of 4-9 puffs at two altitudes.
    // Clouds keep well clear of the subject so none drifts between it and the
    // camera at any scale, and they cast no shadow onto it.
    const clusters = 46;
    for (let c = 0; c < clusters; c++) {
      let cx = (rng() - 0.5) * extent * 1.6;
      let cz = (rng() - 0.5) * extent * 1.6;
      const d = Math.hypot(cx, cz);
      if (d < CLOUD_CLEARANCE) {
        const k = (CLOUD_CLEARANCE + rng() * 40) / Math.max(1, d);
        cx *= k;
        cz *= k;
      }
      const low = rng() < 0.65;
      const cy = low ? 28 + rng() * 8 : 52 + rng() * 12;
      const n = 5 + Math.floor(rng() * 6);
      const base = (low ? 3.6 : 6.5) * (0.8 + rng() * 0.6);
      const v = 0.6 + rng() * 0.6;
      for (let i = 0; i < n; i++) {
        this.puffs.push({
          x: cx + (rng() - 0.5) * base * 3,
          y: cy + (rng() - 0.5) * base * 0.8,
          z: cz + (rng() - 0.5) * base * 1.6,
          s: base * (0.55 + rng() * 0.8),
          v,
        });
      }
    }
    this.mesh = new THREE.InstancedMesh(puffGeometry(style), puffMaterial(style), this.puffs.length);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
  }

  update(t: number): void {
    const span = this.extent * 1.6;
    this.puffs.forEach((p, i) => {
      // Wrap drifting clouds so the sky never empties out, and hold them off
      // the clearance circle as they pass over it.
      let x = p.x + p.v * t;
      x = ((((x + span / 2) % span) + span) % span) - span / 2;
      const d = Math.hypot(x, p.z);
      if (d < CLOUD_CLEARANCE) x = x < 0 ? -CLOUD_CLEARANCE : CLOUD_CLEARANCE;
      this.tmp.makeScale(p.s, p.s * 0.7, p.s);
      this.tmp.setPosition(x, p.y, p.z);
      this.mesh.setMatrixAt(i, this.tmp);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

interface Chunk {
  dx: number;
  dz: number;
  /** Starting radius as a fraction of subject size, so the burst is not a ring. */
  r0: number;
  up: number;
  speed: number;
  s: number;
  spin: number;
}

/** Seconds a debris burst stays on screen. */
const DEBRIS_LIFE = 2.6;

export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private chunks: Chunk[] = [];
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(style: Style, seed: number) {
    const rng = makeRng(seed + 505);
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      // Chunks fly sideways and away, never toward the camera (+z), so a
      // burst cannot land in front of the subject.
      const dz = Math.sin(a);
      this.chunks.push({
        dx: Math.cos(a),
        dz: dz > 0.25 ? -dz : dz,
        r0: 0.15 + rng() * 0.35,
        up: 0.6 + rng() * 1.2,
        speed: 0.7 + rng() * 1.0,
        s: 0.025 + rng() * 0.065,
        spin: rng() * Math.PI * 2,
      });
    }
    this.mesh = new THREE.InstancedMesh(puffGeometry(style), debrisMaterial(style), n);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.update(null, 1, 0);
  }

  /**
   * @param age seconds since the burst fired, or null for no burst
   * @param size current subject size in world units
   * @param groundY ground height under the subject
   */
  update(age: number | null, size: number, groundY: number): void {
    const active = age !== null && age >= 0 && age < DEBRIS_LIFE;
    this.chunks.forEach((c, i) => {
      if (!active) {
        this.mesh.setMatrixAt(i, this.hidden);
        return;
      }
      const a = age as number;
      const p = clamp01(a / DEBRIS_LIFE);
      const reach = easeOutCubic(p) * size * (0.9 + c.speed * 0.5);
      const x = c.dx * (size * c.r0 + reach);
      const z = c.dz * (size * c.r0 + reach);
      // Parabolic arc: up fast, then settle to the ground.
      const y = groundY + Math.max(0, size * c.up * (1 - p) * p * 2.2) + size * c.s;
      const fade = p > 0.8 ? 1 - (p - 0.8) / 0.2 : 1;
      const s = size * c.s * fade;
      this.e.set(c.spin + a * 2, c.spin * 1.7, a);
      this.q.setFromEuler(this.e);
      this.tmp.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(s, s, s));
      this.mesh.setMatrixAt(i, this.tmp);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Seconds a dust ring stays on screen. */
const DUST_LIFE = 1.4;

export class DustRing {
  readonly mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: "#f6f1e4",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 32), this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
  }

  update(age: number | null, size: number, groundY: number): void {
    const active = age !== null && age >= 0 && age < DUST_LIFE;
    this.mesh.visible = active;
    if (!active) return;
    const p = clamp01((age as number) / DUST_LIFE);
    const r = size * (0.5 + easeOutCubic(p) * 1.6);
    this.mesh.scale.set(r, r, 1);
    this.mesh.position.y = groundY + 0.05 + size * 0.01;
    this.material.opacity = 0.75 * (1 - p);
  }
}

/** Age of a named effect in the current state, or null if it is not firing. */
export function effectAge(state: TimelineState, name: TimelineState["effects"][number]["name"]): number | null {
  const e = state.effects.find((x) => x.name === name);
  return e ? e.age : null;
}

type Falling = Exclude<WeatherKind, "none">;

interface Flake {
  /** Start position inside the unit column. */
  x: number;
  y: number;
  z: number;
  /** Speed and sway multipliers. */
  speed: number;
  drift: number;
  spin: number;
}

/** How each kind of weather moves and looks, relative to the camera distance. */
const FALLS: Record<
  Falling,
  { size: number; speed: number; sway: number; spin: number; shape: [number, number, number] }
> = {
  snow: { size: 0.0045, speed: 0.1, sway: 3, spin: 0, shape: [1, 1, 1] },
  rain: { size: 0.003, speed: 1.3, sway: 0, spin: 0, shape: [0.2, 2.4, 0.2] },
  ash: { size: 0.006, speed: 0.07, sway: 5, spin: 1.5, shape: [1.4, 0.25, 1.4] },
  confetti: { size: 0.005, speed: 0.16, sway: 4, spin: 4, shape: [1.3, 0.12, 0.9] },
};

function weatherMaterial(style: Style, color: string, perInstance: boolean): THREE.Material {
  const c = perInstance ? "#ffffff" : color;
  return style === "drawing"
    ? new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() })
    : new THREE.MeshLambertMaterial({ color: c, flatShading: style === "lowpoly" });
}

/**
 * Whatever is falling: a column of flakes, drops or scraps around the point
 * the camera looks at, sized and spaced to the camera distance so the fall
 * reads the same on a close shot of a person and a wide shot of a skyline.
 * Intensity hides a share of the column.
 */
export class Weather {
  readonly mesh: THREE.InstancedMesh;
  private readonly flakes: Flake[] = [];
  private readonly look: (typeof FALLS)[Falling];
  private readonly tmp = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(style: Style, seed: number, kind: Falling, color: string) {
    this.look = FALLS[kind];
    const rng = makeRng(seed + 808);
    const n = 1400;
    for (let i = 0; i < n; i++) {
      this.flakes.push({
        x: rng(),
        y: rng(),
        z: rng(),
        speed: 0.7 + rng() * 0.6,
        drift: rng() * Math.PI * 2,
        spin: rng() * Math.PI * 2,
      });
    }
    const [sx, sy, sz] = this.look.shape;
    const geometry =
      style === "pixels" || kind !== "snow"
        ? new THREE.BoxGeometry(sx, sy, sz)
        : new THREE.IcosahedronGeometry(0.55, 0);
    const confetti = kind === "confetti";
    this.mesh = new THREE.InstancedMesh(geometry, weatherMaterial(style, color, confetti), n);
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;
    if (confetti) {
      // Scraps in a spread of hues around the chosen colour.
      const base = new THREE.Color(color);
      const hsl = { h: 0, s: 0, l: 0 };
      base.getHSL(hsl);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        c.setHSL((hsl.h + ((i * 0.37) % 1) * 0.9) % 1, Math.max(0.6, hsl.s), 0.55);
        this.mesh.setColorAt(i, c);
      }
    }
    this.update(0, 0, { x: 0, z: 0 }, 0, 10, new THREE.Vector3(0, 5, 10));
  }

  /**
   * @param t seconds
   * @param fall 0..1 intensity
   * @param focus where the camera looks
   * @param groundY surface height at the focus
   * @param distance camera distance, which sets the column and flake sizes
   * @param camera where the camera is; flakes about to hit the lens shrink away
   */
  update(
    t: number,
    fall: number,
    focus: { x: number; z: number },
    groundY: number,
    distance: number,
    camera: THREE.Vector3,
  ): void {
    const n = this.flakes.length;
    const shown = Math.round(n * clamp01(fall));
    const look = this.look;
    const size = distance * look.size;
    const span = distance * 1.3;
    const height = distance * 0.8;
    const v = height * look.speed;
    const near = distance * 0.18;
    const comfortable = distance * 0.42;
    for (let i = 0; i < n; i++) {
      if (i >= shown) {
        this.mesh.setMatrixAt(i, this.hidden);
        continue;
      }
      const f = this.flakes[i]!;
      const fallen = f.y * height - v * f.speed * t;
      const y = groundY + (((fallen % height) + height) % height);
      const sway = look.sway * size;
      const x = focus.x + (f.x - 0.5) * span + Math.sin(t * 0.9 * f.speed + f.drift) * sway;
      const z = focus.z + (f.z - 0.5) * span + Math.cos(t * 0.7 * f.speed + f.drift) * sway * 0.5;
      this.p.set(x, y, z);
      // A flake close to the lens would fill the frame; shrink it away instead.
      const toCamera = this.p.distanceTo(camera);
      const s = size * clamp01((toCamera - near) / (comfortable - near));
      this.s.set(s, s, s);
      this.e.set(f.spin + t * look.spin * f.speed, f.spin * 2, f.spin * 0.5 + t * look.spin * 0.6);
      this.q.setFromEuler(this.e);
      this.tmp.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.tmp);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Width of the sheet of fallen weather; wide enough to reach the horizon from the widest shot. */
const COVER_SIZE = 1600;

/**
 * The sheet of whatever has fallen, lying over the whole set at the current
 * depth: a dusting at first, then a surface that buries the cars, then the
 * houses, then everything. Gentle drifts keep it from reading as a plane.
 */
export class Cover {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.Material & { opacity: number };

  constructor(style: Style, color: string, seed: number) {
    const segments = 80;
    const geometry = new THREE.PlaneGeometry(COVER_SIZE, COVER_SIZE, segments, segments);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    // Drifts: a unit-high noise field, scaled with the depth at render time
    // (local z becomes world y once the plane is laid flat).
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, fbm(x / 9, y / 9, seed + 909, 3));
    }
    geometry.computeVertexNormals();
    this.material =
      style === "drawing"
        ? new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), transparent: true })
        : new THREE.MeshLambertMaterial({ color, flatShading: style !== "pixels", transparent: true });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
  }

  /** @param depth world units lying on the ground; @param groundY the ground at the subject */
  update(depth: number, groundY: number): void {
    const active = depth > 0.001;
    this.mesh.visible = active;
    if (!active) return;
    const drift = Math.min(0.6, depth * 0.15);
    this.mesh.scale.set(1, 1, drift);
    this.mesh.position.y = groundY + 0.02 + depth - drift * 0.5;
    this.material.opacity = Math.min(1, depth / 0.04) * 0.97;
  }
}
