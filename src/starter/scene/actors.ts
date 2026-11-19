import * as THREE from "three";
import type { ScenarioSpec, Style } from "../spec/schema";
import type { ActorState } from "../spec/timing";
import { poseAvatar, type AvatarRig } from "./avatar";
import { avatarModel, buildModel } from "./subject";

/**
 * The extras: every other person, animal, vehicle or object in the scene.
 * Each is a small part model like the subject, or a blocky avatar, life-sized
 * and moved along its keyframes by the timeline (resolveActors) so the
 * hypothetical plays out around the subject while it grows. Avatars walk
 * between keyframes and do their keyframe's action while they stand.
 */
export class Actors {
  readonly group = new THREE.Group();
  private readonly nodes: { node: THREE.Object3D; avatar: AvatarRig | null; size: number }[] = [];

  constructor(spec: ScenarioSpec, style: Style) {
    for (const actor of spec.actors) {
      const avatar = actor.avatar ? avatarModel(actor.avatar, style) : null;
      const node = avatar ? avatar.root : buildModel(actor.parts, style);
      const holder = new THREE.Group();
      holder.add(node);
      holder.scale.setScalar(actor.size);
      holder.visible = false;
      this.group.add(holder);
      this.nodes.push({ node: holder, avatar, size: actor.size });
    }
  }

  /** Place every extra for this frame. `ground` gives the height extra `i` stands at for a point. */
  update(states: ActorState[], ground: (x: number, z: number, i: number) => number, t: number): void {
    states.forEach((s, i) => {
      const entry = this.nodes[i];
      if (!entry) return;
      const { node, avatar, size } = entry;
      node.visible = s.visible;
      if (!s.visible) return;
      node.position.set(s.x, ground(s.x, s.z, i) + s.y, s.z);
      node.rotation.set(0, s.ry, 0);
      if (avatar) poseAvatar(avatar, s, t, size);
    });
  }
}
