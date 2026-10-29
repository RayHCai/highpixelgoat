import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Sculpting helpers for the detailed built-in characters: dense smooth
 * surfaces (lathes, tubes, capsules) that are then pushed along their
 * normals to carve sockets, ridges and creases, and painted per vertex for
 * wood grain, skin tone and the shade inside a hollow. Everything is local
 * three.js geometry; object-glb.ts turns the finished tree into a .glb.
 */

export type Vec3 = [number, number, number];

/** Weld the duplicated seam vertices of a generated geometry so its shading is smooth all the way round. */
export function weld(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute("uv");
  const merged = mergeVertices(g, 1e-5);
  merged.computeVertexNormals();
  return merged;
}

/** A surface of revolution about y through (radius, y) profile points, bottom to top. */
export function lathe(profile: [number, number][], segments = 48): THREE.BufferGeometry {
  const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y));
  return weld(new THREE.LatheGeometry(points, segments));
}

export function sphere(radius: number, w = 32, h = 20): THREE.BufferGeometry {
  return weld(new THREE.SphereGeometry(radius, w, h));
}

/** A capsule along y, centred at the origin: `length` is the straight part between the hemispheres. */
export function capsule(radius: number, length: number, radial = 16): THREE.BufferGeometry {
  return weld(new THREE.CapsuleGeometry(radius, length, 6, radial));
}

/** A cylinder along y, centred at the origin, with different top and bottom radii. */
export function cylinder(top: number, bottom: number, height: number, radial = 32): THREE.BufferGeometry {
  return weld(new THREE.CylinderGeometry(top, bottom, height, radial, 1));
}

/**
 * A smooth tube along a curve through `points`. `taper(t)` scales the radius
 * along the length (t from 0 at the first point to 1 at the last), for hair
 * strands and fingers that thin toward the tip.
 */
export function tube(
  points: Vec3[],
  radius: number,
  o: { segments?: number; radial?: number; closed?: boolean; taper?: (t: number) => number } = {},
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    o.closed ?? false,
    "centripetal",
  );
  const segments = o.segments ?? 24;
  const radial = o.radial ?? 10;
  const g = new THREE.TubeGeometry(curve, segments, radius, radial, o.closed ?? false);
  if (o.taper) {
    // TubeGeometry lays rings out in order: ring i holds vertices i * (radial + 1) .. + radial.
    const pos = g.getAttribute("position");
    const centre = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i <= segments; i++) {
      const k = o.taper(i / segments);
      curve.getPointAt(i / segments, centre);
      for (let j = 0; j <= radial; j++) {
        const index = i * (radial + 1) + j;
        p.fromBufferAttribute(pos, index).sub(centre).multiplyScalar(k).add(centre);
        pos.setXYZ(index, p.x, p.y, p.z);
      }
    }
  }
  return weld(g);
}

/** Move every vertex along its normal by `amount(p, n)` (local space), then re-smooth. */
export function displace(
  g: THREE.BufferGeometry,
  amount: (p: THREE.Vector3, n: THREE.Vector3) => number,
): THREE.BufferGeometry {
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const d = amount(p, n);
    pos.setXYZ(i, p.x + n.x * d, p.y + n.y * d, p.z + n.z * d);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Colour every vertex from its local position (the material then needs vertexColors). */
export function paint(g: THREE.BufferGeometry, color: (p: THREE.Vector3) => THREE.Color): THREE.BufferGeometry {
  const pos = g.getAttribute("position");
  const out = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = color(p);
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(out, 3));
  return g;
}

/** A smooth bump of height 1 at distance 0 falling to 0 at `radius`. */
export function bump(distance: number, radius: number): number {
  const t = Math.min(1, Math.max(0, distance / radius));
  return 1 - t * t * (3 - 2 * t);
}

/** A spherical cap around +y of half-angle `angle` radians: an iris, a pupil or an eyelid once rotated onto the eye. */
export function cap(radius: number, angle: number, w = 32, h = 12): THREE.BufferGeometry {
  return weld(new THREE.SphereGeometry(radius, w, h, 0, Math.PI * 2, 0, angle));
}

/** A tapered limb segment from `a` (radius `ra`) to `b` (radius `rb`). */
export function limb(a: Vec3, b: Vec3, ra: number, rb: number, material: THREE.Material, name = ""): THREE.Mesh {
  const from = new THREE.Vector3(a[0], a[1], a[2]);
  const to = new THREE.Vector3(b[0], b[1], b[2]);
  const dir = to.clone().sub(from);
  const out = new THREE.Mesh(cylinder(ra, rb, dir.length(), 20), material);
  out.name = name;
  out.position.copy(from).add(to).multiplyScalar(0.5);
  // The cylinder's top (+y, radius ra) points back at `a`.
  out.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize().negate());
  return out;
}

export function standard(
  color: string,
  o: { roughness?: number; metalness?: number; vertexColors?: boolean; doubleSide?: boolean } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.roughness ?? 0.85,
    metalness: o.metalness ?? 0,
    vertexColors: o.vertexColors ?? false,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
}

export interface Placement {
  at?: Vec3;
  /** Degrees, XYZ. */
  rot?: Vec3;
  scale?: Vec3 | number;
}

export function place<T extends THREE.Object3D>(obj: T, o: Placement = {}): T {
  if (o.at) obj.position.set(o.at[0], o.at[1], o.at[2]);
  if (o.rot) {
    obj.rotation.set(
      THREE.MathUtils.degToRad(o.rot[0]),
      THREE.MathUtils.degToRad(o.rot[1]),
      THREE.MathUtils.degToRad(o.rot[2]),
      "XYZ",
    );
  }
  if (o.scale !== undefined) {
    if (typeof o.scale === "number") obj.scale.setScalar(o.scale);
    else obj.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  }
  return obj;
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, name = "", o: Placement = {}): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.name = name;
  return place(out, o);
}

/**
 * A named joint at `pivot`, in the same space as its children, which are
 * positioned absolutely and re-based onto the pivot. Rotating the group
 * rotates them about the joint.
 */
export function joint(name: string, pivot: Vec3, children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(pivot[0], pivot[1], pivot[2]);
  for (const c of children) {
    c.position.sub(g.position);
    g.add(c);
  }
  return g;
}

/** The same object mirrored across x = 0: positions and the y and z rotations flip, "-left" and "-right" swap. */
export function mirror(obj: THREE.Object3D): THREE.Object3D {
  const out = obj.clone(true);
  out.traverse((o) => {
    o.position.x = -o.position.x;
    o.rotation.set(o.rotation.x, -o.rotation.y, -o.rotation.z, "XYZ");
    if (o.name.includes("-left")) o.name = o.name.replace("-left", "-right");
    else if (o.name.includes("-right")) o.name = o.name.replace("-right", "-left");
    if (o instanceof THREE.Mesh) {
      // A mirrored mesh keeps its geometry: scale x by -1 would turn it inside out, so flip the geometry itself.
      const g = (o.geometry as THREE.BufferGeometry).clone();
      const pos = g.getAttribute("position");
      for (let i = 0; i < pos.count; i++) pos.setX(i, -pos.getX(i));
      const index = g.getIndex();
      if (index) {
        for (let i = 0; i < index.count; i += 3) {
          const a = index.getX(i + 1);
          index.setX(i + 1, index.getX(i + 2));
          index.setX(i + 2, a);
        }
      }
      g.computeVertexNormals();
      o.geometry = g;
    }
  });
  return out;
}
