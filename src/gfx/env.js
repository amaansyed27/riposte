// The Mirror Court: eclipse sky, flooded reflective floor, colonnade, rain, lightning, light bus.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLSL_NOISE, rand, clamp } from '../core/util.js';

const FOG = new THREE.Color(0.010, 0.017, 0.030);
export const ECLIPSE_DIR = new THREE.Vector3(0, 0.36, -1).normalize();
const MAXL = 6;

export class Environment {
  constructor(scene, { reflRes = 1024, rainCount = 2600 } = {}) {
    this.scene = scene;
    scene.fog = new THREE.FogExp2(FOG, 0.017);
    scene.background = FOG.clone();

    // uniforms shared by floor / rain / sky
    this.u = {
      uTime: { value: 0 },
      uBladeA: { value: new THREE.Vector3() },
      uBladeB: { value: new THREE.Vector3(0, 1, 0) },
      uBladeCol: { value: new THREE.Color(0.2, 0.7, 1) },
      uBladePow: { value: 0 },
      uLPos: { value: Array.from({ length: MAXL }, () => new THREE.Vector3()) },
      uLCol: { value: Array.from({ length: MAXL }, () => new THREE.Vector3()) },
      uRip: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)) },
      uPulse: { value: new THREE.Vector4(0, 0, 0, 0) },
      uFogCol: { value: FOG },
      uFogDen: { value: 0.017 },
      uFlash: { value: 0 },
      uEclipse: { value: ECLIPSE_DIR },
    };
    this.ripIdx = 0;
    this.pulse = { r: 0, s: 0 };
    this.flashes = [];
    this.frameLights = [];

    this._sky();
    this._floor(reflRes);
    this._colonnade();
    this._rain(rainCount);
    this._lights();
    this.lightningT = rand(5, 9);
    this.lightningSeq = [];
    this.onThunder = null;
  }

  _sky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: this.u.uTime, uFlash: this.u.uFlash, uE: this.u.uEclipse },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*viewMatrix*vec4(position + cameraPosition,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime,uFlash; uniform vec3 uE; varying vec3 vDir;
        ${GLSL_NOISE}
        void main(){
          vec3 d = normalize(vDir);
          float h = max(d.y, 0.0);
          vec3 horizon = vec3(0.016,0.028,0.052), zenith = vec3(0.0015,0.003,0.008);
          vec3 col = mix(horizon, zenith, pow(h, 0.42));
          // eclipse
          float ang = acos(clamp(dot(d,uE), -1.0, 1.0));
          float R = 0.105;
          vec3 up = normalize(cross(uE, vec3(1,0,0)));
          vec3 rt = normalize(cross(up, uE));
          float az = atan(dot(d,up), dot(d,rt));
          float rays = 0.55 + 0.45*vnoise(vec2(az*5.0, 1.7)) + 0.35*vnoise(vec2(az*17.0 + uTime*0.05, 4.2));
          float o = max(ang - R, 0.0);
          vec3 cc = vec3(1.0, 0.86, 0.72);
          float corona = exp(-o*7.0)*0.07*rays + exp(-o*30.0)*0.40*rays + exp(-o*120.0)*0.9;
          float disc = smoothstep(R + 0.002, R - 0.002, ang);
          col += cc * corona * (1.0 - disc);
          col += cc * 2.6 * exp(-pow((ang - R)/0.0024, 2.0));
          // diamond-ring bead
          vec3 bead = normalize(uE + rt*R*0.72 + up*R*0.70);
          float bd = acos(clamp(dot(d,bead),-1.0,1.0));
          col += vec3(1.0,0.95,0.9) * (7.0*exp(-bd*bd*14000.0) + 0.16*exp(-bd*30.0));
          col = mix(col, vec3(0.0015,0.002,0.004), disc*0.985);
          // stars
          vec2 sp = d.xz/(abs(d.y)+0.35)*38.0;
          vec2 id = floor(sp); vec2 f = fract(sp)-0.5;
          float rnd = hash21(id);
          float star = step(0.955, rnd) * smoothstep(0.09, 0.0, length(f - (hash22(id)-0.5)*0.6));
          star *= 0.5 + 0.5*sin(uTime*(1.0+rnd*3.0) + rnd*40.0);
          // clouds
          vec2 cp = d.xz/(d.y+0.22)*1.3 + vec2(uTime*0.006, uTime*0.003);
          float cl = smoothstep(0.42, 0.78, fbm(cp*1.6));
          cl *= smoothstep(0.0, 0.25, h);
          col += vec3(0.8,0.9,1.0) * star * (1.0-cl) * smoothstep(0.02,0.2,h) * 1.6;
          vec3 cloudCol = vec3(0.012,0.018,0.030) + cc*0.10*exp(-o*5.0) + vec3(0.55,0.65,0.9)*uFlash*(0.4+fbm(cp*3.0));
          col = mix(col, cloudCol, cl*0.75*(1.0-disc)*smoothstep(0.02, 0.12, o + 0.02));
          col += horizon*0.5*exp(-h*14.0);
          col += vec3(0.25,0.3,0.45)*uFlash*0.25;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat);
    sky.frustumCulled = false; sky.renderOrder = -10;
    this.scene.add(sky);
    this.sky = sky;
  }

  _floor(res) {
    const u = this.u;
    const shader = {
      name: 'MirrorCourt',
      uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix; varying vec4 vUvP; varying vec3 vW;
        void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vUvP = textureMatrix*vec4(position,1.0); gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse; varying vec4 vUvP; varying vec3 vW;
        uniform float uTime, uBladePow, uFogDen, uFlash;
        uniform vec3 uBladeA, uBladeB, uBladeCol, uFogCol;
        uniform vec3 uLPos[${MAXL}]; uniform vec3 uLCol[${MAXL}];
        uniform vec4 uRip[6]; uniform vec4 uPulse;
        ${GLSL_NOISE}
        vec2 rainRings(vec2 p, float t){
          vec2 id=floor(p); vec2 f=fract(p)-0.5; vec2 rnd=hash22(id);
          float ph = fract(t*(0.5+rnd.x*0.7) + rnd.y);
          vec2 q = f - (hash22(id+7.7)-0.5)*0.45; float r = length(q);
          float x = r - ph*0.42;
          float ring = sin(x*46.0) * exp(-x*x*90.0) * (1.0-ph)*(1.0-ph);
          return (q/(r+1e-4))*ring;
        }
        float aaline(float x, float w){ float a = fwidth(x)*1.2; return 1.0 - smoothstep(w-a, w+a, abs(x)); }
        void main(){
          vec3 P = vW; vec3 toC = cameraPosition - P; float dist = length(toC); vec3 V = toC/dist;
          float nearFade = 1.0/(1.0 + dist*0.06);
          // surface normal: slow swell + rain rings + event ripples
          vec2 n = 0.012*vec2(sin(P.x*2.3 + uTime*1.1 + sin(P.z*1.7)), cos(P.z*2.9 - uTime*0.9 + sin(P.x*1.3)));
          n += 0.006*vec2(vnoise(P.xz*3.0 + uTime*0.4)-0.5, vnoise(P.zx*3.0 - uTime*0.35)-0.5)*4.0;
          float rf = smoothstep(34.0, 4.0, dist);
          n += (rainRings(P.xz*1.3, uTime) + rainRings(P.xz*2.1 + 13.7, uTime*1.13)*0.7) * 0.05 * rf;
          for(int i=0;i<6;i++){
            vec4 rp = uRip[i]; float age = uTime - rp.z;
            if(age > 0.0 && age < 5.0){
              vec2 q = P.xz - rp.xy; float r = length(q); float fr = age*5.5;
              float w = sin((r-fr)*4.5) * exp(-pow((r-fr)*0.8,2.0)) * rp.w * exp(-age*0.85) / (1.0 + r*0.12);
              n += (q/(r+1e-3))*w*0.09;
            }
          }
          vec3 N = normalize(vec3(n.x, 1.0, n.y));
          // planar reflection with ripple distortion
          vec2 ruv = vUvP.xy / vUvP.w + n * (0.55*nearFade + 0.10);
          vec3 refl = texture2D(tDiffuse, ruv).rgb;
          float cosT = max(dot(N,V), 0.0);
          float F = mix(0.16, 1.0, pow(1.0-cosT, 3.2));
          // stone court under the water
          float tile = vnoise(floor(P.xz/2.2)*3.1);
          vec3 albedo = vec3(0.030,0.034,0.042)*(0.55+0.6*tile);
          vec2 g = abs(fract(P.xz/2.2)-0.5);
          albedo *= 1.0 - 0.6*smoothstep(0.485,0.5,max(g.x,g.y));
          // piste + seal markings
          float r0 = length(P.xz);
          float lines = aaline(abs(P.x)-1.15, 0.03)*step(P.z, 3.0)
                      + aaline(P.z+4.0, 0.03)*step(abs(P.x),1.15)
                      + aaline(P.z+9.0, 0.03)*step(abs(P.x),1.15)
                      + aaline(r0-3.4, 0.035) + aaline(r0-3.62, 0.012) + aaline(r0-13.0, 0.05);
          float ang = atan(P.z,P.x);
          lines += aaline(fract(ang*12.0/6.2831853)-0.5, 0.012/max(r0,0.5)*2.0)*step(3.62,r0)*step(r0,3.95);
          lines = clamp(lines,0.0,1.0) * smoothstep(60.0, 12.0, dist);
          albedo += vec3(0.20,0.21,0.23)*lines;
          // blade as a line light
          vec3 ab = uBladeB-uBladeA; float tt = clamp(dot(P-uBladeA,ab)/max(dot(ab,ab),1e-5),0.0,1.0);
          vec3 Lp = uBladeA + ab*tt - P; float d2 = dot(Lp,Lp);
          float ndl = max(dot(N, normalize(Lp)), 0.0);
          vec3 light = uBladeCol*uBladePow*ndl*3.2/(1.0+d2*0.30);
          for(int i=0;i<${MAXL};i++){
            vec3 L = uLPos[i]-P; float dd = dot(L,L);
            light += uLCol[i]*max(dot(N,normalize(L)),0.0)/(1.0+dd*0.22);
          }
          light += vec3(0.5,0.6,0.9)*uFlash*0.6 + vec3(0.010,0.013,0.02);
          float pd = length(P.xz-uPulse.xy);
          float pulse = uPulse.w*exp(-pow((pd-uPulse.z)/1.3,2.0));
          vec3 col = albedo*light*(1.0-F*0.6) + refl*F;
          col += uBladeCol*lines*(0.035*uBladePow + pulse*1.6) + uBladeCol*pulse*0.05;
          float fog = 1.0 - exp(-pow(dist*uFogDen,2.0));
          col = mix(col, uFogCol + vec3(0.2,0.25,0.4)*uFlash*0.1, fog);
          gl_FragColor = vec4(col,1.0);
        }`,
    };
    const floor = new Reflector(new THREE.PlaneGeometry(700, 700), { textureWidth: res, textureHeight: res, clipBias: 0.003, shader, multisample: 0 });
    floor.rotation.x = -Math.PI / 2;
    const mu = floor.material.uniforms;
    for (const k of ['uTime', 'uBladeA', 'uBladeB', 'uBladeCol', 'uBladePow', 'uLPos', 'uLCol', 'uRip', 'uPulse', 'uFogCol', 'uFogDen', 'uFlash']) mu[k] = u[k];
    floor.material.extensions = { derivatives: true };
    this.scene.add(floor);
    this.floor = floor;
  }

  setReflectionSize(w, h) { this.floor.getRenderTarget().setSize(w, h); }

  _colonnade() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x0c0f15, roughness: 0.78, metalness: 0.25, envMapIntensity: 0.12 });
    this.glyphMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.6).multiplyScalar(0.5), fog: true });
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 9; i++) {
      for (const s of [-1, 1]) {
        const h = 9 + i * 1.6 + rand(0, 5);
        const w = 1.7 + rand(0, 0.7);
        const m = new THREE.Mesh(box, stone);
        const x = s * (7.5 + i * 1.5 + rand(0, 1.2)), z = -7 - i * 9.5 + rand(-1.5, 1.5);
        m.scale.set(w, h, w * 0.8);
        m.position.set(x, h / 2 - 0.2, z);
        m.rotation.y = rand(-0.12, 0.12); m.rotation.z = rand(-0.02, 0.02);
        g.add(m);
        const strip = new THREE.Mesh(box, this.glyphMat);
        strip.scale.set(0.05, h * 0.55, 0.05);
        strip.position.set(x - s * (w / 2 + 0.03), h * 0.42, z);
        g.add(strip);
      }
    }
    // colossal, half-seen shapes far out in the fog
    const far = new THREE.MeshBasicMaterial({ color: 0x04070c, fog: false });
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(box, far);
      const s = i % 2 ? 1 : -1;
      const h = rand(70, 170);
      m.scale.set(rand(14, 30), h, 12);
      m.position.set(s * rand(45, 190), h / 2 - 4, -rand(230, 380));
      m.rotation.z = rand(-0.07, 0.07);
      g.add(m);
    }
    this.scene.add(g);
  }

  _rain(count) {
    const seeds = new Float32Array(count * 2 * 3), ends = new Float32Array(count * 2), rnds = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random(), y = Math.random(), z = Math.random(), r = Math.random();
      for (let k = 0; k < 2; k++) {
        seeds.set([x, y, z], (i * 2 + k) * 3);
        ends[i * 2 + k] = k; rnds[i * 2 + k] = r;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnds, 1));
    const u = this.u;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: u.uTime, uBladeA: u.uBladeA, uBladeB: u.uBladeB, uBladeCol: u.uBladeCol, uBladePow: u.uBladePow, uFlash: u.uFlash, uLPos: u.uLPos, uLCol: u.uLCol },
      vertexShader: /* glsl */ `
        attribute float aEnd, aRnd; uniform float uTime, uBladePow, uFlash; uniform vec3 uBladeA,uBladeB,uBladeCol;
        uniform vec3 uLPos[${MAXL}]; uniform vec3 uLCol[${MAXL}];
        varying vec3 vCol;
        void main(){
          vec3 box = vec3(16.0, 11.0, 16.0);
          vec3 p = position*box;
          float sp = 9.0 + aRnd*5.0;
          p.y -= uTime*sp; p.x += uTime*1.1;
          p = mod(p - cameraPosition + box*0.5, box) - box*0.5 + cameraPosition;
          p.y += aEnd*(0.16 + aRnd*0.16); p.x -= aEnd*0.02;
          vec3 ab = uBladeB-uBladeA; float tt = clamp(dot(p-uBladeA,ab)/max(dot(ab,ab),1e-5),0.0,1.0);
          vec3 L = uBladeA + ab*tt - p; float d2 = dot(L,L);
          vec3 c = vec3(0.045,0.06,0.09)*(0.4+aRnd) + vec3(0.5,0.6,0.9)*uFlash*0.5;
          c += uBladeCol*uBladePow*(1.4/(1.0+d2*5.0) + 0.05/(1.0+d2*0.2));
          for(int i=0;i<3;i++){ vec3 l = uLPos[i]-p; c += uLCol[i]*0.25/(1.0+dot(l,l)*1.5); }
          float dc = length(p-cameraPosition);
          vCol = c * smoothstep(0.25, 1.2, dc) * (0.35 + 0.65*aEnd);
          gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0);
        }`,
      fragmentShader: /* glsl */ `varying vec3 vCol; void main(){ gl_FragColor = vec4(vCol, 1.0); }`,
    });
    const rain = new THREE.LineSegments(geo, mat);
    rain.frustumCulled = false;
    this.scene.add(rain);
    this.rain = rain;
  }

  _lights() {
    this.moon = new THREE.DirectionalLight(new THREE.Color(0.75, 0.82, 1.0), 0.55);
    this.moon.position.copy(ECLIPSE_DIR).multiplyScalar(100);
    this.scene.add(this.moon);
    this.hemi = new THREE.HemisphereLight(0x25344d, 0x040506, 0.5);
    this.scene.add(this.hemi);
    this.flashLight = new THREE.DirectionalLight(new THREE.Color(0.7, 0.8, 1.0), 0);
    this.flashLight.position.set(-30, 60, -40);
    this.scene.add(this.flashLight);
    this.bladeLights = [0, 1].map(() => { const l = new THREE.PointLight(0xffffff, 0, 0, 1.5); this.scene.add(l); return l; });
    this.dyn = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 0, 1.6); this.scene.add(l); return l; });
  }

  ripple(x, z, strength = 1) {
    this.u.uRip.value[this.ripIdx].set(x, z, this.u.uTime.value, strength);
    this.ripIdx = (this.ripIdx + 1) % 6;
  }
  courtPulse(x, z, strength = 1) { this.pulse = { r: 0.3, s: strength }; this.u.uPulse.value.set(x, z, 0.3, strength); }
  // transient light (explosions, impacts). color: THREE.Color (linear), power in HDR units
  flash(pos, color, power, life = 0.4) { this.flashes.push({ pos: pos.clone(), color: color.clone(), power, life, t: 0 }); }
  // per-frame moving light (bolts)
  light(pos, color, power) { this.frameLights.push({ pos, color, power }); }

  setBlade(a, b, color, power) {
    this.u.uBladeA.value.copy(a); this.u.uBladeB.value.copy(b);
    this.u.uBladeCol.value.copy(color); this.u.uBladePow.value = power;
    const [l1, l2] = this.bladeLights;
    l1.position.lerpVectors(a, b, 0.3); l2.position.lerpVectors(a, b, 0.8);
    l1.color.copy(color); l2.color.copy(color);
    const len = a.distanceTo(b);
    l1.intensity = power * 2.4 * Math.min(1, len * 3);
    l2.intensity = power * 2.8 * Math.min(1, len * 1.2);
  }

  update(dt, time, vdt) {
    const u = this.u;
    u.uTime.value = time;
    // court pulse ring
    if (this.pulse.s > 0.002) {
      this.pulse.r += vdt * 16; this.pulse.s *= Math.exp(-vdt * 1.5);
      u.uPulse.value.z = this.pulse.r; u.uPulse.value.w = this.pulse.s;
    } else u.uPulse.value.w = 0;
    // lightning
    this.lightningT -= vdt;
    if (this.lightningT <= 0) {
      this.lightningT = rand(11, 24);
      this.lightningSeq = [[0, 1], [0.07, 0.15], [0.13, 0.8], [0.2, 0.1], [0.33, 0.45], [0.42, 0]];
      this.lightningClock = 0;
      if (this.onThunder) this.onThunder(rand(0.5, 1.8));
    }
    let target = 0;
    if (this.lightningSeq.length) {
      this.lightningClock += vdt;
      while (this.lightningSeq.length > 1 && this.lightningClock > this.lightningSeq[1][0]) this.lightningSeq.shift();
      target = this.lightningSeq[0][1];
      if (this.lightningSeq.length === 1) this.lightningSeq = [];
    }
    u.uFlash.value += (target - u.uFlash.value) * clamp(vdt * 40);
    if (u.uFlash.value < 0.001) u.uFlash.value = 0;
    this.flashLight.intensity = u.uFlash.value * 2.2;
    this.glyphMat.color.setRGB(1.0, 0.8, 0.6).multiplyScalar(0.35 + u.uBladePow.value * 0.25 + this.pulse.s * 2.0);

    // light bus -> floor uniforms + 3 real point lights
    const all = this.frameLights;
    for (const f of this.flashes) {
      f.t += dt;
      const k = Math.pow(1 - clamp(f.t / f.life), 2);
      all.push({ pos: f.pos, color: f.color, power: f.power * k });
    }
    this.flashes = this.flashes.filter((f) => f.t < f.life);
    all.sort((a, b) => b.power - a.power);
    for (let i = 0; i < MAXL; i++) {
      const L = all[i];
      if (L) { u.uLPos.value[i].copy(L.pos); u.uLCol.value[i].set(L.color.r, L.color.g, L.color.b).multiplyScalar(L.power); }
      else u.uLCol.value[i].set(0, 0, 0);
      if (i < 3) {
        const pl = this.dyn[i];
        if (L) { pl.position.copy(L.pos); pl.color.copy(L.color); pl.intensity = L.power * 3.0; } else pl.intensity = 0;
      }
    }
    this.frameLights = [];
  }
}
