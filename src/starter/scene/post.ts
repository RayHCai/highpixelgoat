import * as THREE from "three";

/**
 * One post pass for every style: the scene renders into an offscreen target,
 * then a fullscreen shader writes it to the canvas. The target can be lower
 * resolution with nearest filtering (pixel art), higher resolution for
 * supersampled smooth edges, and the shader can ink outlines wherever depth
 * changes sharply (drawing style).
 */

export interface PostOptions {
  /** Render-target scale: 0.5 renders at half size (pixelated), 1.5 supersamples. */
  scale: number;
  /** Nearest-neighbour upscaling for the pixel look. */
  nearest: boolean;
  /** 0 disables outlines; 1 is full-strength ink. */
  outline: number;
  /** Ink colour for outlines. */
  inkColor: string;
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 texel;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float outlineStrength;
  uniform vec3 inkColor;
  varying vec2 vUv;

  float linearDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x;
    float ndc = z * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - ndc * (cameraFar - cameraNear));
  }

  void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    if (outlineStrength > 0.0) {
      float d = linearDepth(vUv);
      float dl = linearDepth(vUv - vec2(texel.x, 0.0));
      float dr = linearDepth(vUv + vec2(texel.x, 0.0));
      float du = linearDepth(vUv + vec2(0.0, texel.y));
      float dd = linearDepth(vUv - vec2(0.0, texel.y));
      // Relative depth step so the threshold works at every camera distance.
      float edge = (abs(dl - d) + abs(dr - d) + abs(du - d) + abs(dd - d)) / d;
      float ink = smoothstep(0.015, 0.05, edge) * outlineStrength;
      color.rgb = mix(color.rgb, inkColor, ink);
    }
    gl_FragColor = color;
    #include <colorspace_fragment>
  }
`;

export class PostPass {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    width: number,
    height: number,
    options: PostOptions,
  ) {
    const w = Math.max(1, Math.round(width * options.scale));
    const h = Math.max(1, Math.round(height * options.scale));
    const filter = options.nearest ? THREE.NearestFilter : THREE.LinearFilter;
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.UnsignedIntType;
    this.target = new THREE.WebGLRenderTarget(w, h, {
      minFilter: filter,
      magFilter: filter,
      depthBuffer: true,
      depthTexture,
    });
    // Outline sampling distance: about 1.5 output pixels regardless of scale.
    const px = 1.5 * options.scale;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        tDiffuse: { value: this.target.texture },
        tDepth: { value: depthTexture },
        texel: { value: new THREE.Vector2(px / w, px / h) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
        outlineStrength: { value: options.outline },
        inkColor: { value: new THREE.Color(options.inkColor) },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.material.uniforms.cameraNear!.value = camera.near;
    this.material.uniforms.cameraFar!.value = camera.far;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}
