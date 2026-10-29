import * as THREE from "three";
import type { GlbDocument } from "../glb-writer";
import { documentFromObject } from "../object-glb";
import { alienFigure } from "./alien";
import { chinCourtside } from "./chin";
import { sahurNightWatch, type Built } from "./sahur";

/**
 * The detailed characters: sculpted three.js trees (one module each) that
 * characters.ts lists in the library under these names. A built model is in
 * unit space; documentFromBuilt scales it to its real size and writes it.
 */

export const DETAILED: Record<string, () => Built> = {
  "tung-tung-tung-sahur/night-watch": sahurNightWatch,
  "locked-in-alien/figure": alienFigure,
  "chopped-chin/courtside": chinCourtside,
};

/** Scale a built model so its largest dimension is `metres` and write it as a document whose root node is `name`. */
export function documentFromBuilt(built: Built, metres: number, name: string): GlbDocument {
  built.root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(built.root).getSize(new THREE.Vector3());
  const root = new THREE.Group();
  root.name = name;
  root.scale.setScalar(metres / Math.max(size.x, size.y, size.z, 1e-6));
  if (!built.root.name) built.root.name = "model";
  root.add(built.root);
  return documentFromObject(root, built.clips);
}
