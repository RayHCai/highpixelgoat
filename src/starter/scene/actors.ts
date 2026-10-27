import * as THREE from "three";
import type { ScenarioSpec, Style } from "../spec/schema";
import type { ActorState } from "../spec/timing";
import { buildModel } from "./subject";

/**
 * The extras: every other person, animal, vehicle or object in the scene.
 * Each is a small part model like the subject, life-sized, moved along its
 * keyframes by the timeline (resolveActors) so the hypothetical plays out
 * around the subject while it grows.
 */
export class Actors {
  readonly group = new THREE.Group();
  private readonly nodes: THREE.Object3D[] = [];

  constructor(spec: ScenarioSpec, style: Style) {
    for (const actor of spec.actors) {
      const node = buildModel(actor.parts, style);
      node.scale.setScalar(actor.size);
      node.visible = false;
      this.group.add(node);
      this.nodes.push(node);
    }
  }

  /** Place every extra for this frame. `ground` gives the height extra `i` stands at for a point. */
  update(states: ActorState[], ground: (x: number, z: number, i: number) => number): void {
    states.forEach((s, i) => {
      const node = this.nodes[i];
      if (!node) return;
      node.visible = s.visible;
      if (!s.visible) return;
      node.position.set(s.x, ground(s.x, s.z, i) + s.y, s.z);
      node.rotation.set(0, s.ry, 0);
    });
  }
}
