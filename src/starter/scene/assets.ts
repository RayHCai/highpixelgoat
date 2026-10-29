import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Style } from "../spec/schema";
import { toonGradient } from "./terrain";

/**
 * Models from the author's 3D asset library. The asset tool copies a .glb
 * into src/assets/; import it with ?url (inlined into player.js) and load it
 * with a top-level await, so it is ready before the player draws a frame:
 *
 *   import robotUrl from "../assets/robot.glb?url";
 *   const robot = await loadAsset(robotUrl);
 *
 * placeAsset makes a copy sized in world units, standing on y = 0 and
 * restyled to match the take; poseAsset sets an animated copy to an exact
 * time in one of its clips, so frames stay pure functions of t.
 */

export interface Asset {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
}

/** Load a .glb imported with ?url. */
export async function loadAsset(url: string): Promise<Asset> {
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    return { scene: gltf.scene, clips: gltf.animations };
  } catch (err) {
    const message = `could not load a 3D asset: ${err instanceof Error ? err.message : String(err)}`;
    // A top-level await that throws stops the bundle before the player starts: report it instead of never being ready.
    window.__hpg = { ready: false, error: message };
    throw new Error(message, { cause: err });
  }
}

export interface PlaceOptions {
  /** Re-shade to match the starter's own models (spec.style); leave it out to keep the authored materials. */
  style?: Style;
  /** Cast and receive shadows like the starter's models. Default true. */
  shadows?: boolean;
}

const restyled = new Map<Style, WeakMap<THREE.Material, THREE.Material>>();

function restyle(material: THREE.Material, style: Style): THREE.Material {
  if (!(material instanceof THREE.MeshStandardMaterial)) return material;
  const cache = restyled.get(style) ?? new WeakMap<THREE.Material, THREE.Material>();
  restyled.set(style, cache);
  const hit = cache.get(material);
  if (hit) return hit;
  const shared = {
    name: material.name,
    color: material.color,
    map: material.map,
    vertexColors: material.vertexColors,
    transparent: material.transparent,
    opacity: material.opacity,
    alphaTest: material.alphaTest,
    side: material.side,
  };
  // The starter lights with a sun and a hemisphere and no environment map, under which metallic PBR turns black.
  const out =
    style === "drawing"
      ? new THREE.MeshToonMaterial({ ...shared, gradientMap: toonGradient() })
      : new THREE.MeshLambertMaterial({ ...shared, flatShading: style === "lowpoly" });
  cache.set(material, out);
  return out;
}

/**
 * A copy of `asset` whose largest dimension is `size` world units, centred on
 * x and z and standing on y = 0. glTF models face +z, toward the starter's
 * camera. Move, turn and scale the copy through the returned group.
 */
export function placeAsset(asset: Asset, size: number, o: PlaceOptions = {}): THREE.Group {
  const model = clone(asset.scene);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const dims = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = size / Math.max(dims.x, dims.y, dims.z, 1e-6);

  const fit = new THREE.Group();
  fit.add(model);
  fit.scale.setScalar(scale);
  fit.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
  const root = new THREE.Group();
  root.add(fit);

  const style = o.style;
  model.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.castShadow = o.shadows ?? true;
    obj.receiveShadow = o.shadows ?? true;
    // A posed skin can leave its bind-pose bounds; culling it by them makes limbs pop out of frame.
    if (obj instanceof THREE.SkinnedMesh) obj.frustumCulled = false;
    if (style) {
      obj.material = Array.isArray(obj.material)
        ? obj.material.map((m: THREE.Material) => restyle(m, style))
        : restyle(obj.material as THREE.Material, style);
    }
  });
  return root;
}

const mixers = new WeakMap<THREE.Object3D, THREE.AnimationMixer>();

/**
 * Pose a copy from placeAsset at `seconds` into the clip named `clip`,
 * looping, replacing whatever pose it had. The same arguments always give
 * the same pose; derive `seconds` from t (for example the seconds since a beat
 * started), never from the previous frame.
 */
export function poseAsset(copy: THREE.Object3D, asset: Asset, clip: string, seconds: number): void {
  const found = THREE.AnimationClip.findByName(asset.clips, clip);
  if (!found) {
    const names = asset.clips.map((c) => c.name).join(", ") || "none";
    throw new Error(`this asset has no animation "${clip}" (it has: ${names})`);
  }
  let mixer = mixers.get(copy);
  if (!mixer) {
    mixer = new THREE.AnimationMixer(copy);
    mixers.set(copy, mixer);
  }
  mixer.stopAllAction();
  mixer.clipAction(found).play();
  mixer.setTime(Math.max(0, seconds));
}
