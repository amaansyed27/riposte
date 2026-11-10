// HDR post chain: scene -> bloom -> lens fx (shockwaves, CA, vignette, grain) -> ACES output.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const LensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uCA: { value: 0.0015 },
    uVignette: { value: 1 },
    uGrain: { value: 0.035 },
    uHit: { value: 0 },
    uDesat: { value: 0 },
    uFlash: { value: new THREE.Vector3() },
    uShock: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime,uAspect,uCA,uVignette,uGrain,uHit,uDesat;
    uniform vec3 uFlash; uniform vec4 uShock[4]; varying vec2 vUv;
    float hash(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float gauss(float x){ return exp(-x*x); }

    void main(){
      vec2 uv = vUv;
      // refractive shockwaves
      for(int i=0;i<4;i++){
        vec4 s = uShock[i];
        vec2 p = uv - s.xy; p.x *= uAspect;
        float r = length(p);
        float k = s.w * gauss((r - s.z)/0.05);
        uv -= normalize(p + 1e-5) * k * 0.03;
      }
      vec2 c = uv - 0.5;
      float r2 = dot(c,c);
      vec2 off = c * (uCA * (0.5 + r2*5.0));
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      float lum = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(col, vec3(lum)*vec3(0.9,1.0,1.15), uDesat);
      float v = smoothstep(0.92, 0.22, length(c*vec2(1.0, 1.08)));
      col *= mix(1.0, v, uVignette);
      float edge = smoothstep(0.18, 0.75, length(c));
      col = mix(col, col*vec3(1.5,0.3,0.25) + vec3(0.5,0.02,0.03)*edge, uHit*(0.35+0.65*edge));
      col += uFlash;
      float g = hash(gl_FragCoord.xy + fract(uTime)*371.0) - 0.5;
      col += g * uGrain * (0.25 + lum);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, { msaa = 4 } = {}) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.36, 0.5, 0.95);
    this.composer.addPass(this.bloom);
    this.lens = new ShaderPass(LensShader);
    this.composer.addPass(this.lens);
    this.composer.addPass(new OutputPass());
    this.u = this.lens.uniforms;
    this.shocks = [];
  }
  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.u.uAspect.value = w / h;
  }
  // x,y in uv (0..1); strength ~1
  shock(x, y, strength = 1, speed = 0.9) {
    this.shocks.push({ x, y, r: 0, strength, speed });
    if (this.shocks.length > 4) this.shocks.shift();
  }
  update(dt, time) {
    this.u.uTime.value = time;
    for (const s of this.shocks) { s.r += dt * s.speed; s.strength *= Math.exp(-dt * 4.2); }
    this.shocks = this.shocks.filter((s) => s.strength > 0.01);
    const arr = this.u.uShock.value;
    for (let i = 0; i < 4; i++) {
      const s = this.shocks[i];
      if (s) arr[i].set(s.x, s.y, s.r, s.strength); else arr[i].set(0, 0, 0, 0);
    }
  }
  render() { this.composer.render(); }
}
