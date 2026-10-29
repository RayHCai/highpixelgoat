import type { ObjectClip, ObjectTrack } from "./object-glb";

/**
 * Clip authoring for the built-in characters: sampled sine swings that loop
 * seamlessly, a vertical bob, explicit poses, and the standard two-legged
 * walk. Rotation keys are degrees about a joint's pivot; translation keys
 * are offsets from the node's rest position in its parent's space.
 */

export type Clip = ObjectClip;
export type Track = ObjectTrack;
type Vec3 = [number, number, number];

const SAMPLES = 8;

export function swing(node: string, amplitude: Vec3, seconds: number, phase = 0): Track {
  const keys: Track["keys"] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const s = Math.sin((i / SAMPLES) * Math.PI * 2 + phase);
    keys.push([(i / SAMPLES) * seconds, [amplitude[0] * s, amplitude[1] * s, amplitude[2] * s]]);
  }
  return { node, path: "rotation", keys };
}

/** A vertical bob of `amplitude`, `cycles` times per loop (a walk dips twice per stride). */
export function bob(node: string, amplitude: number, seconds: number, cycles = 2): Track {
  const keys: Track["keys"] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    keys.push([(i / SAMPLES) * seconds, [0, amplitude * Math.sin((i / SAMPLES) * Math.PI * 2 * cycles), 0]]);
  }
  return { node, path: "translation", keys };
}

/** Explicit rotation keys; end where you start so the loop is seamless. */
export function poses(node: string, keys: [number, Vec3][]): Track {
  return { node, path: "rotation", keys };
}

/** Legs alternate, arms counter-swing, the body bobs. */
export function walk(
  seconds: number,
  body: string,
  legs: number,
  arms: number,
  dip: number,
  armsRight = arms,
): Track[] {
  return [
    swing("leg-left", [legs, 0, 0], seconds),
    swing("leg-right", [legs, 0, 0], seconds, Math.PI),
    swing("arm-left", [arms, 0, 0], seconds, Math.PI),
    swing("arm-right", [armsRight, 0, 0], seconds),
    bob(body, dip, seconds),
  ];
}
