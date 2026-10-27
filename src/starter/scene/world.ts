import * as THREE from "three";
import type { ScenarioSpec } from "../spec/schema";
import { resolveActors, type TimelineState } from "../spec/timing";
import { Actors } from "./actors";
import { Clouds, Cover, Debris, DustRing, effectAge, Weather } from "./atmosphere";
import { CameraRig } from "./camera";
import { SETTINGS, STYLE_LOOKS, TERRAIN_PALETTES } from "./palette";
import { PostPass } from "./post";
import { buildProps } from "./props";
import { buildSubject, type SubjectRig } from "./subject";
import { buildTerrainData, buildTerrainMesh, groundHeightAt, TERRAIN_SIZE, type TerrainData } from "./terrain";

/**
 * Assembles the three.js scene for a spec and drives it from TimelineState.
 * The World owns the renderer; the player owns time.
 */

export interface ScreenPoint {
  x: number;
  y: number;
  /** False when the point is behind the camera. */
  visible: boolean;
}

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private readonly spec: ScenarioSpec;
  private readonly terrain: TerrainData;
  private readonly subject: SubjectRig;
  private readonly actors: Actors;
  /** Height of the room floor above the ground, 0 outdoors. */
  private readonly lift: number;
  private readonly clouds: Clouds;
  private readonly debris: Debris;
  private readonly dust: DustRing;
  private readonly weather: Weather | null;
  private readonly cover: Cover | null;
  private readonly sun: THREE.DirectionalLight;
  private readonly fog: THREE.Fog;
  private readonly post: PostPass | null;
  private lastState: TimelineState | null = null;
  /** Where the subject stood after the last update (its feet). */
  private readonly subjectPos = new THREE.Vector3();
  private readonly width: number;
  private readonly height: number;

  constructor(spec: ScenarioSpec, canvas: HTMLCanvasElement) {
    this.spec = spec;
    const { width, height } = spec.format;
    this.width = width;
    this.height = height;
    const look = STYLE_LOOKS[spec.style];
    const palette = TERRAIN_PALETTES[spec.world.terrain];
    const setting = SETTINGS[spec.world.terrain];

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: look.post === null, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = spec.style === "pixels" ? THREE.BasicShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Sky and fog.
    const sky = new THREE.Color(spec.world.sky ?? palette.sky);
    if (look.paper) sky.lerp(new THREE.Color(look.paper), 0.55);
    const fogColor = new THREE.Color(spec.world.fog ?? palette.fog);
    if (look.paper) fogColor.lerp(new THREE.Color(look.paper), 0.55);
    this.scene.background = sky;
    this.fog = new THREE.Fog(fogColor, 20, 200);
    this.scene.fog = this.fog;

    // Lights: soft sky bounce plus one shadow-casting sun.
    const hemi = new THREE.HemisphereLight(sky, new THREE.Color(palette.ground[0]), 0.85);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, spec.style === "drawing" ? 1.2 : 1.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // Ground, then whatever stands on it.
    this.terrain = buildTerrainData(spec);
    const terrainMesh = buildTerrainMesh(spec, this.terrain);
    this.scene.add(terrainMesh.group);
    const props = buildProps(spec, this.terrain, terrainMesh.outer);
    this.scene.add(props.group);
    this.lift = props.lift;

    // Subject, then everyone else.
    this.subject = buildSubject(spec, spec.style);
    this.scene.add(this.subject.group);
    this.actors = new Actors(spec, spec.style);
    this.scene.add(this.actors.group);

    // Clouds, weather and effects.
    this.clouds = new Clouds(spec.style, spec.world.seed, TERRAIN_SIZE);
    this.scene.add(this.clouds.mesh);
    this.debris = new Debris(spec.style, spec.world.seed);
    this.scene.add(this.debris.mesh);
    this.dust = new DustRing();
    this.scene.add(this.dust.mesh);
    const weather = spec.weather;
    this.weather =
      weather.kind === "none" ? null : new Weather(spec.style, spec.world.seed, weather.kind, weather.color);
    if (this.weather) this.scene.add(this.weather.mesh);
    this.cover = weather.kind === "none" ? null : new Cover(spec.style, weather.color, spec.world.seed);
    if (this.cover) this.scene.add(this.cover.mesh);

    // Camera.
    this.rig = new CameraRig(width / height, setting.azimuth, setting.azimuthRate);

    // Post: pixelation for the pixel style, supersampling + ink outlines for
    // the drawing style, nothing for lowpoly.
    this.post = look.post ? new PostPass(this.renderer, width, height, look.post) : null;
  }

  /** Height of the ground (or the room floor) at a point. */
  private groundAt(x: number, z: number): number {
    return groundHeightAt(this.terrain, x, z) + (Math.abs(x) < 1.6 && Math.abs(z) < 1.6 ? this.lift : 0);
  }

  /** Apply a timeline state to every object. Safe to call for any t in any order. */
  update(state: TimelineState): void {
    this.lastState = state;
    const size = state.subjectSize;
    const depth = state.weather.depth;
    const at = state.subjectAt;

    // The subject stands on top of whatever has piled up, and so does the
    // camera's idea of the ground, so a buried city sinks away under it.
    const groundY = this.groundAt(at.x, at.z);
    const surfaceY = groundY + depth;
    this.subjectPos.set(at.x, surfaceY, at.z);
    this.subject.group.position.set(at.x, surfaceY + at.y, at.z);
    this.subject.group.rotation.set(0, at.ry, 0);
    this.subject.group.visible = at.visible;
    this.subject.group.scale.setScalar(size);

    const shakeAge = effectAge(state, "shake");
    const shake = shakeAge === null ? 0 : Math.max(0, 1 - shakeAge / 0.9);
    const focus = { x: at.x, z: at.z };
    this.rig.update({ size: state.cameraSize, groundY: surfaceY, focus, t: state.t, shake });

    const d = this.rig.distance;
    const fogMul = STYLE_LOOKS[this.spec.style].fog * SETTINGS[this.spec.world.terrain].fog;
    this.fog.near = d * 1.3;
    this.fog.far = d * 1.3 + (d * 2.6) / fogMul;

    // Sun follows the subject so shadows stay sharp at every scale.
    const reach = Math.max(size * 2.2, state.cameraSize * 1.2, 10);
    this.sun.position.set(at.x - 0.55 * reach * 3, surfaceY + 1.0 * reach * 3, at.z + 0.45 * reach * 3);
    this.sun.target.position.set(at.x, surfaceY, at.z);
    const cam = this.sun.shadow.camera;
    cam.left = -reach;
    cam.right = reach;
    cam.top = reach;
    cam.bottom = -reach;
    cam.near = reach * 0.5;
    cam.far = reach * 6;
    cam.updateProjectionMatrix();

    this.clouds.update(state.t);
    // The sky rises with whatever has piled up, so clouds never poke through it.
    this.clouds.mesh.position.y = depth;
    // People and animals walk on top of what has fallen; vehicles and objects
    // stay on the ground and get buried by it.
    const actors = this.spec.actors;
    this.actors.update(resolveActors(this.spec, state.t), (x, z, i) => {
      const kind = actors[i]?.kind;
      const rides = kind === "person" || kind === "animal";
      return this.groundAt(x, z) + (rides ? depth : 0);
    });
    this.debris.mesh.position.set(at.x, 0, at.z);
    this.debris.update(effectAge(state, "debris"), size, surfaceY);
    this.dust.mesh.position.set(at.x, 0, at.z);
    this.dust.update(effectAge(state, "dust"), size, surfaceY);
    this.weather?.update(state.t, state.weather.fall, focus, surfaceY, d, this.rig.camera.position);
    this.cover?.update(depth, groundY);
  }

  render(): void {
    const cam = this.rig.camera;
    if (this.post) this.post.render(this.scene, cam);
    else this.renderer.render(this.scene, cam);
  }

  /** Screen position (stage pixels) of the subject's top, for the callout. */
  subjectTopOnScreen(): ScreenPoint {
    const size = this.lastState?.subjectSize ?? this.spec.subject.baseSize;
    const s = this.subjectPos;
    const p = new THREE.Vector3(
      s.x + this.subject.topLocal.x * size,
      s.y + this.subject.topLocal.y * size,
      s.z + this.subject.topLocal.z * size,
    );
    p.project(this.rig.camera);
    return {
      x: ((p.x + 1) / 2) * this.width,
      y: ((1 - p.y) / 2) * this.height,
      visible: p.z < 1 && (this.lastState?.subjectAt.visible ?? true),
    };
  }

  dispose(): void {
    this.renderer.dispose();
    this.post?.dispose();
  }
}
