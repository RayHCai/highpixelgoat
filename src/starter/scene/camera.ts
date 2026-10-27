import * as THREE from "three";
import { valueNoise } from "./noise";

/**
 * Auto-framing camera. The subject can grow a thousandfold over the video, so
 * the camera backs off in proportion and keeps the subject in the lower part
 * of the 9:16 frame where it reads against the receding scene, leaving the
 * top third for the text overlay. The camera always stays on the +z side of
 * the subject (every setting keeps that side open), orbiting slowly from a
 * per-setting start angle. Pure in its inputs: no frame-to-frame state.
 */

export interface CameraFrame {
  /** Height the camera should frame for, in world units. */
  size: number;
  /** Height of the surface the subject stands on (ground, floor, or what has piled up). */
  groundY: number;
  /** Where the subject stands; the camera orbits this point and follows it. */
  focus: { x: number; z: number };
  /** Seconds, drives the slow orbit. */
  t: number;
  /** 0..1 shake intensity. */
  shake: number;
}

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Distance from the subject after the last update, for fog and shadows. */
  distance = 10;
  private target = new THREE.Vector3();
  private pos = new THREE.Vector3();

  constructor(
    aspect: number,
    private readonly azimuth0 = -0.55,
    private readonly azimuthRate = 0.035,
  ) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 4000);
  }

  update(f: CameraFrame): void {
    // Distance grows with the subject; the constant keeps a tiny subject from
    // being shot from inside the ground.
    // Keeps the subject at roughly a quarter of the frame height at every scale.
    const distance = f.size * 5.5 + 1.5;
    this.distance = distance;

    const azimuth = this.azimuth0 + f.t * this.azimuthRate;
    // Look down more steeply as the subject grows, so a continent-sized shot
    // is filled with ground rather than horizon (log-scaled: 0.5 -> 70 units).
    const k = Math.min(1, Math.max(0, Math.log(f.size / 0.5) / Math.log(140)));
    const elevation = 0.55 + 0.32 * k; // radians above the horizon
    const centreY = f.groundY + f.size * 0.42;

    this.pos.set(
      f.focus.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      centreY + Math.sin(elevation) * distance,
      f.focus.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    // Aim above the subject so it sits about two thirds of the way down the
    // frame: the visible height at the subject is ~0.77 x distance (42 deg fov),
    // so an offset of 0.14 x distance moves it 18% of the frame below centre.
    this.target.set(f.focus.x, centreY + distance * 0.14, f.focus.z);

    if (f.shake > 0) {
      const n = f.t * 40;
      const amp = f.shake * distance * 0.012;
      this.pos.x += (valueNoise(n, 1.3, 7) - 0.5) * amp;
      this.pos.y += (valueNoise(n, 5.1, 7) - 0.5) * amp;
      this.target.x += (valueNoise(n, 9.7, 7) - 0.5) * amp;
    }

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);
    this.camera.near = Math.max(0.05, distance * 0.01);
    this.camera.far = Math.max(600, distance * 8);
    this.camera.updateProjectionMatrix();
  }
}
