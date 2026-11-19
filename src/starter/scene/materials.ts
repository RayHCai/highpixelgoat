import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Style } from "../spec/schema";

/**
 * How each style shades and shapes solid things, in one place: toon steps
 * for "drawing", flat facets for "lowpoly", plain Lambert for "pixels" (its
 * look comes from voxels and the pixelating post pass), and glossy plastic
 * with rounded edges for "blocks". Everything that builds a mesh asks here,
 * so a new style is a change to this file and the style's palette entry.
 */

export interface SurfaceOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  alphaTest?: number;
  side?: THREE.Side;
  name?: string;
}

/** A material for a solid surface, shaded the way the style shades everything. */
export function styledMaterial(style: Style, options: SurfaceOptions = {}): THREE.Material {
  // three warns about parameters that are present but undefined.
  const o = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) as SurfaceOptions;
  switch (style) {
    case "drawing":
      return new THREE.MeshToonMaterial({ ...o, gradientMap: toonGradient() });
    case "blocks":
      return new THREE.MeshPhongMaterial({ ...o, shininess: 42, specular: new THREE.Color("#3a3a3a") });
    case "lowpoly":
    case "pixels":
      return new THREE.MeshLambertMaterial({ ...o, flatShading: style === "lowpoly" });
  }
}

/** A unit box centred on the origin: rounded at the edges in the blocks style. */
export function unitBox(style: Style): THREE.BufferGeometry {
  return style === "blocks" ? new RoundedBoxGeometry(1, 1, 1, 2, 0.05) : new THREE.BoxGeometry(1, 1, 1);
}

/**
 * A unit ball centred on the origin: an icosphere (faceted for lowpoly), a
 * cube for pixels, and a soft rounded block for blocks, where nothing is
 * truly round.
 */
export function unitBall(style: Style): THREE.BufferGeometry {
  if (style === "pixels") return new THREE.BoxGeometry(1, 1, 1);
  if (style === "blocks") return new RoundedBoxGeometry(1, 1, 1, 3, 0.3);
  return new THREE.IcosahedronGeometry(0.5, style === "lowpoly" ? 1 : 2);
}

/** A rounded brick of a real size, for models built at their own scale (the avatars). */
export function brick(w: number, h: number, d: number, radius = 0.08): THREE.BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 2, h / 2, d / 2));
}

let gradientTexture: THREE.DataTexture | null = null;
/** Three-step gradient for toon shading, shared by all drawing materials. */
export function toonGradient(): THREE.DataTexture {
  if (gradientTexture) return gradientTexture;
  const data = new Uint8Array([90, 160, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  gradientTexture = tex;
  return tex;
}

let studs: THREE.CanvasTexture | null = null;
/**
 * The top of a baseplate cell: a four by four grid of raised studs (a tile of
 * two by two, repeated) inside a fine seam, near-white so the cell's own
 * colour tints it, sized so an avatar stands about two studs wide. Shared, mipmapped
 * so the grid fades to a soft texture in the distance instead of shimmering.
 */
export function studTexture(): THREE.CanvasTexture {
  if (studs) return studs;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f1f1f1";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#b9b9b9";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
  const r = size * 0.15;
  for (const cy of [0.27, 0.73]) {
    for (const cx of [0.27, 0.73]) {
      const x = cx * size;
      const y = cy * size;
      // A soft drop shadow, the stud, and a highlight toward the light.
      ctx.fillStyle = "#c9c9c9";
      ctx.beginPath();
      ctx.arc(x + 3, y + 4, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fbfbfb";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#d2d2d2";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  studs = tex;
  return tex;
}
