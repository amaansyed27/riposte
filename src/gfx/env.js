// The Mirror Court: eclipse sky, flooded reflective floor, colonnade, rain, lightning, light bus.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GLSL_NOISE, rand, clamp } from '../core/util.js';

const FOG = new THREE.Color(0.010, 0.017, 0.030);
export const ECLIPSE_DIR = new THREE.Vector3(0, 0.275, -1).normalize();
const MAXL = 6;
const WHITE = new THREE.Color(1, 1, 1);

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
      uCC: { value: new THREE.Color(1.0, 0.86, 0.72) },
    };
    this.ripIdx = 0; this.lanterns = []; this.streak = 0; this.mood = new THREE.Color(1.0, 0.86, 0.72); this.gather = 0;
    this.pulse = { r: 0, s: 0 };
    this.flashes = [];
    this.frameLights = [];

    this._sky();
    this._floor(reflRes);
    this._colonnade();
    this._rain(rainCount);
    this._moths();
    this._lights();
    this.lightningT = rand(5, 9);
    this.lightningSeq = [];
    this.onThunder = null;
  }

  _sky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: this.u.uTime, uFlash: this.u.uFlash, uE: this.u.uEclipse, uCC: this.u.uCC },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*viewMatrix*vec4(position + cameraPosition,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime,uFlash; uniform vec3 uE, uCC; varying vec3 vDir;
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
          vec3 cc = uCC;
          float corona = exp(-o*7.0)*0.07*rays + exp(-o*30.0)*0.40*rays + exp(-o*120.0)*0.9;
          float disc = smoothstep(R + 0.002, R - 0.002, ang);
          col += cc * corona * (1.0 - disc);
          col += cc * 2.6 * gauss((ang - R)/0.0024);
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
              float w = sin((r-fr)*4.5) * gauss((r-fr)*0.8) * rp.w * exp(-age*0.85) / (1.0 + r*0.12);
              n += (q/(r+1e-3))*w*0.09;
            }
          }
          vec3 N = normalize(vec3(n.x, 1.0, n.y));
          // planar reflection with ripple distortion
          vec2 ruv = vUvP.xy / vUvP.w + n * (0.16*nearFade + 0.05);
          // wet-floor streak: smear the reflection along the view's vertical so highlights pull into long shimmering pillars
          float sm = (0.02 + 0.11*nearFade) * (0.6 + 0.8*vnoise(P.xz*5.0 + uTime*0.6));
          vec3 refl = texture2D(tDiffuse, ruv).rgb*0.30;
          refl += texture2D(tDiffuse, ruv + vec2(0.0, sm*0.45)).rgb*0.22 + texture2D(tDiffuse, ruv - vec2(0.0, sm*0.45)).rgb*0.22;
          refl += texture2D(tDiffuse, ruv + vec2(0.0, sm)).rgb*0.13 + texture2D(tDiffuse, ruv - vec2(0.0, sm)).rgb*0.13;
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
          float pulse = uPulse.w*gauss((pd-uPulse.z)/1.3);
          vec3 col = albedo*light*(1.0-F*0.6) + refl*F;
          col += uBladeCol*lines*(0.035*uBladePow + pulse*1.6) + uBladeCol*pulse*0.05;
          float fog = 1.0 - gauss(dist*uFogDen);
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
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512; const cx = cv.getContext('2d');
    cx.fillStyle = '#8a8f99'; cx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 2600; i++) { const v = 90 + Math.random() * 90 | 0; cx.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 8) + ',0.35)'; cx.fillRect(Math.random() * 256, Math.random() * 512, 2 + Math.random() * 10, 1 + Math.random() * 3); }
    cx.fillStyle = 'rgba(10,12,16,0.85)';
    for (let y = 0; y < 512; y += 64) cx.fillRect(0, y, 256, 4);                       // stone courses
    for (let y = 0; y < 512; y += 64) for (let x = (y / 64 % 2) * 64; x < 256; x += 128) cx.fillRect(x, y, 4, 64);
    cx.strokeStyle = 'rgba(10,12,16,0.7)'; cx.lineWidth = 3;                            // carved glyphs
    for (let y = 20; y < 512; y += 64) for (let x = 40; x < 256; x += 128) { cx.beginPath(); const k = Math.random(); if (k < 0.4) cx.arc(x, y + 14, 10, 0, 7); else if (k < 0.7) { cx.moveTo(x - 10, y + 4); cx.lineTo(x + 10, y + 24); cx.moveTo(x + 10, y + 4); cx.lineTo(x - 10, y + 24); } else { cx.moveTo(x, y + 2); cx.lineTo(x, y + 26); cx.moveTo(x - 9, y + 14); cx.lineTo(x + 9, y + 14); } cx.stroke(); }
    const stoneTex = new THREE.CanvasTexture(cv); stoneTex.colorSpace = THREE.SRGBColorSpace; stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.repeat.set(2, 5); stoneTex.anisotropy = 8;
    const stone = new THREE.MeshStandardMaterial({ color: 0x3a4152, map: stoneTex, bumpMap: stoneTex, bumpScale: 3, roughness: 0.82, metalness: 0.15, envMapIntensity: 0.2 });
    const obelisk = new THREE.CylinderGeometry(0.42, 0.72, 1, 4, 1); obelisk.rotateY(Math.PI / 4);
    const capG = new THREE.ConeGeometry(0.60, 1, 4); capG.rotateY(Math.PI / 4);
    this.glyphMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.6).multiplyScalar(0.5), fog: true });
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 9; i++) {
      for (const s of [-1, 1]) {
        const h = 9 + i * 1.6 + rand(0, 5);
        const w = 1.7 + rand(0, 0.7);
        const m = new THREE.Mesh(obelisk, stone);
        const x = s * (7.5 + i * 1.5 + rand(0, 1.2)), z = -7 - i * 9.5 + rand(-1.5, 1.5);
        m.scale.set(w, h, w * 0.8);
        m.position.set(x, h / 2 - 0.2, z);
        m.rotation.y = rand(-0.12, 0.12); m.rotation.z = rand(-0.02, 0.02);
        g.add(m);
        const cap = new THREE.Mesh(capG, stone); cap.scale.set(w, w * 1.3, w * 0.8); cap.position.set(x, h - 0.2 + w * 0.65, z); cap.rotation.y = m.rotation.y; g.add(cap);
        const strip = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x000000, fog: true })); this.lanterns.push({ m: strip.material, k: 0 });
        strip.scale.set(0.05, h * 0.55, 0.05);
        strip.position.set(x - s * (w * 0.43 + 0.03), h * 0.42, z);
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
          c += uBladeCol*uBladePow*(0.8/(1.0+d2*6.0) + 0.035/(1.0+d2*0.2));
          for(int i=0;i<3;i++){ vec3 l = uLPos[i]-p; c += uLCol[i]*0.07/(1.0+dot(l,l)*5.0); }
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
    this.fill = new THREE.DirectionalLight(0xffffff, 0);
    this.fill.position.set(0.3, 2.2, 6); this.fill.target.position.set(0, 4, -20);
    this.scene.add(this.fill, this.fill.target);
    this.bladeLights = [0, 1].map(() => { const l = new THREE.PointLight(0xffffff, 0, 0, 1.5); this.scene.add(l); return l; });
    this.dyn = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 0, 1.6); this.scene.add(l); return l; });
  }

  // moths to a flame: motes that spiral in around the blade while it burns and drift off when it is sheathed
  _moths() {
    const n = 46, seed = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) seed[i] = Math.random();
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(seed, 3));
    const u = this.u; this.uGather = { value: 0 };
    const m = new THREE.Points(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime: u.uTime, uBladeA: u.uBladeA, uBladeB: u.uBladeB, uBladeCol: u.uBladeCol, uGather: this.uGather },
      vertexShader: `uniform float uTime,uGather; uniform vec3 uBladeA,uBladeB,uBladeCol; varying vec3 vC;
        void main(){ vec3 s = position; float t = uTime*(0.25+s.x*0.5) + s.y*40.0;
          vec3 ax = normalize(uBladeB-uBladeA + vec3(1e-4)); vec3 sd = normalize(cross(ax, vec3(0.3,0.2,1.0))); vec3 up = cross(ax, sd);
          float r = mix(1.6 + s.z*2.2, 0.07 + s.z*0.22, uGather) + 0.05*sin(t*7.0);
          vec3 p = mix(uBladeA, uBladeB, fract(s.y + uTime*0.03*(s.x-0.5))) + (sd*cos(t*3.0) + up*sin(t*3.0))*r;
          p.y += (1.0-uGather)*(0.4*sin(t) + 0.6);
          vec4 mv = viewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
          float fl = 0.6 + 0.4*sin(t*23.0);
          vC = mix(vec3(0.9,0.75,0.4)*0.5, uBladeCol*1.5 + 0.5, uGather)*fl;
          gl_PointSize = clamp(26.0/max(-mv.z,0.3), 1.5, 9.0); }`,
      fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5)*2.0; gl_FragColor = vec4(vC*pow(max(1.0-d,0.0),2.0), 1.0); }`,
    }));
    m.frustumCulled = false; m.renderOrder = 7; this.scene.add(m);
  }
  setStreak(n) { this.streak = n; }
  // tint the eclipse toward a colour (bosses), or back to its own light
  setMood(color) { if (color) this.mood.setRGB(1.0, 0.86, 0.72).lerp(color, 0.7); else this.mood.setRGB(1.0, 0.86, 0.72); }
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
    this.fill.color.copy(color).lerp(WHITE, 0.25); this.fill.intensity = 0.10 + power * 0.9 * Math.min(1, len);
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
    // the court keeps count: one lantern lights down the colonnade for every bolt returned in a row
    for (let i = 0; i < this.lanterns.length; i++) {
      const L = this.lanterns[i], lit = i < this.streak;
      L.k += ((lit ? 1 : 0) - L.k) * clamp(vdt * (lit ? 14 : 3));
      const base = 0.22 + u.uBladePow.value * 0.15 + this.pulse.s * 2.0;
      L.m.color.setRGB(1.0, 0.72, 0.42).multiplyScalar(base * (1 - L.k)); L.m.color.r += L.k * 3.2; L.m.color.g += L.k * 2.1; L.m.color.b += L.k * 0.7;
    }
    u.uCC.value.lerp(this.mood, clamp(vdt * 1.2));
    this.gather += ((u.uBladePow.value > 0.3 ? 1 : 0) - this.gather) * clamp(vdt * 1.6); this.uGather.value = this.gather;

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
