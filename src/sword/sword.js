// The sword: hilt + blade core + halo + swing trail + the whole ignite / hum / retract lifecycle.
import * as THREE from 'three';
import { buildHilt } from './hilt.js';
import { makeBeam } from './beam.js';
import { GLSL_NOISE, clamp, lerp, damp, noise1, rand, easeOutCubic } from '../core/util.js';

export const BLADE_LEN = 1.12;
const BLADE_RAD = 0.0125;
const TRAIL_N = 22;

export const COLORS = {
  azure: new THREE.Color(0.06, 0.48, 1.0),
  verdant: new THREE.Color(0.10, 1.0, 0.30),
  violet: new THREE.Color(0.55, 0.16, 1.0),
  ember: new THREE.Color(1.0, 0.36, 0.05),
  blanc: new THREE.Color(0.62, 0.80, 1.0),
};
const HEAT = new THREE.Color(1.0, 0.32, 0.06);
const GOLD = new THREE.Color(1.0, 0.72, 0.25);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

function coreGeometry() {
  const rad = 14, seg = 40;
  const pos = [], idx = [];
  for (let j = 0; j <= seg; j++) {
    // denser rings toward the tip cap
    const v = j / seg;
    for (let i = 0; i <= rad; i++) { const a = (i / rad) * Math.PI * 2; pos.push(Math.cos(a), v, Math.sin(a)); }
  }
  for (let j = 0; j < seg; j++) for (let i = 0; i < rad; i++) {
    const a = j * (rad + 1) + i, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Sword {
  constructor({ scene, camera, env, fx, timeUniform }) {
    this.scene = scene; this.camera = camera; this.env = env; this.fx = fx;
    this.time = timeUniform;
    this.state = 'off'; this.t = 0;
    this.len = 0; this.power = 0; this.instab = 0; this.heat = 0; this.crystal = 0; this.tipFlare = 0;
    this.light = 0; this.over = 0; this.disturbed = 0; this.dropout = 0;
    this.color = COLORS.azure.clone(); this.baseColor = COLORS.azure.clone();
    this.integrity = 3;
    this.swing = 0; this.tipSpeed = 0;
    this.onEvent = () => {};

    const h = buildHilt();
    this.h = h;
    for (const k of ['steel', 'dark', 'brass', 'grip']) h.M[k].side = THREE.DoubleSide;
    for (const fin of h.fins) fin.material.side = THREE.DoubleSide;
    this.rig = new THREE.Group();
    this.rig.add(h.group);
    camera.add(this.rig);
    camera.add(h.arm);
    this.elbow = new THREE.Vector3(0.27, -0.74, 0.16); this.clashK = 0;

    // blade core
    this.coreMat = new THREE.ShaderMaterial({
      fog: false, side: THREE.DoubleSide,
      uniforms: { uLen: { value: 0 }, uRad: { value: BLADE_RAD }, uInstab: { value: 0 }, uTime: timeUniform, uColor: { value: this.color }, uPower: { value: 0 }, uTip: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uLen,uRad,uInstab,uTime; varying vec3 vN; varying vec3 vV; varying float vY;
        ${GLSL_NOISE}
        void main(){
          float v = position.y;
          float cap = min(uRad*3.5, uLen); float body = uLen - cap; float y; float r;
          if(v < 0.86){ y = v/0.86*body; r = 1.0; } else { float c = (v-0.86)/0.14; y = body + cap*sin(c*1.5708); r = cos(c*1.5708); }
          float wob = max(0.3, 1.0 + uInstab*(vnoise(vec2(y*34.0 - uTime*44.0, 2.0))-0.5)*1.5 + 0.05*sin(y*40.0 - uTime*31.0));
          r *= uRad*wob*(0.72 + 0.28*smoothstep(0.0, 0.05, y));
          vec3 p = vec3(position.x*r, y - 0.012, position.z*r);
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          vN = normalMatrix*vec3(position.x, 0.0, position.z); vV = -mv.xyz; vY = y;
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uPower,uLen,uTip,uTime; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float streak = 0.5 + 0.5*sin(vY*46.0 - uTime*38.0 + sin(vY*9.0 + uTime*5.0)*2.0);
          vec3 col = mix(vec3(1.0), uColor*1.6 + 0.12, clamp(pow(f, 1.4)*0.95 + streak*0.14, 0.0, 1.0));
          float front = uTip*exp(-(uLen - vY)*14.0);
          gl_FragColor = vec4(col*(3.2 + front*4.0)*uPower, 1.0);
        }`,
    });
    this.core = new THREE.Mesh(coreGeometry(), this.coreMat);
    this.core.frustumCulled = false; this.core.visible = false;
    this.rig.add(this.core);

    // halo
    this.halo = makeBeam({ width: 0.62, core: BLADE_RAD, timeUniform });
    this.halo.material.uniforms.uColor.value = this.color;
    scene.add(this.halo);

    // swing trail (world space ribbon)
    const tg = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(TRAIL_N * 2 * 3); this.trailCol = new Float32Array(TRAIL_N * 2 * 3);
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3).setUsage(THREE.DynamicDrawUsage));
    const ti = [];
    for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; ti.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    tg.setIndex(ti);
    this.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.trail.frustumCulled = false; this.trail.renderOrder = 4;
    scene.add(this.trail);
    this.hist = [];

    // pose springs (camera space)
    this.root = new THREE.Vector3(0, -0.6, -1.4); this.tip = new THREE.Vector3(0.2, 0.4, -2.2);
    this.tipVel = new THREE.Vector3();
    this.rootT = this.root.clone(); this.tipT = this.tip.clone();
    this.A = new THREE.Vector3(); this.B = new THREE.Vector3(); this.Bfull = new THREE.Vector3();
    this.prevTipW = new THREE.Vector3();
    this.sizzleT = 0; this.smoke = 0;
    this.setColor('azure');
    this.setIntegrity(3);
  }

  setColor(name) { this.colorName = name; this.baseColor.copy(COLORS[name]); }
  setIntegrity(n) { this.integrity = n; }
  get isOn() { return this.state === 'on' || this.state === 'igniting'; }
  get canDeflect() { return this.isOn && this.len > 0.6; }

  ignite() {
    if (this.state === 'igniting' || this.state === 'on') return false;
    this.state = 'igniting'; this.t = 0; this._fired = false;
    this.onEvent('ignite-start');
    return true;
  }
  retract() {
    if (this.state === 'off' || this.state === 'retracting') return false;
    this.state = 'retracting'; this.t = 0; this.len0 = this.len;
    this.onEvent('retract-start');
    return true;
  }
  toggle() { return this.isOn ? this.retract() : this.ignite(); }
  disturb(k = 1) { this.disturbed = Math.max(this.disturbed, k); }
  // a bolt just met the blade: the whole blade flares for a beat
  clash(k = 1) { this.clashK = Math.max(this.clashK, k); }

  setTargets(root, tip) { this.rootT.copy(root); this.tipT.copy(tip); }
  snapPose() { this.root.copy(this.rootT); this.tip.copy(this.tipT); this.tipVel.set(0, 0, 0); this.hist.length = 0; }

  emitterWorld(out) { return out.copy(this.A); }

  update(dt, time) {
    const { fx, env } = this;
    dt = Math.min(dt, 0.05);
    // ---------- pose: root follows tightly, tip is a springy mass (lag + follow-through)
    this.root.x = damp(this.root.x, this.rootT.x, 30, dt); this.root.y = damp(this.root.y, this.rootT.y, 30, dt); this.root.z = damp(this.root.z, this.rootT.z, 30, dt);
    const K = 520, C = 30;
    const sub = 3, h = dt / sub;
    for (let i = 0; i < sub; i++) {
      _a.subVectors(this.tipT, this.tip).multiplyScalar(K).addScaledVector(this.tipVel, -C);
      this.tipVel.addScaledVector(_a, h); this.tip.addScaledVector(this.tipVel, h);
    }
    _y.subVectors(this.tip, this.root).normalize();
    _x.crossVectors(_y, _z.set(0, 0, 1)).normalize();
    _z.crossVectors(_x, _y);
    _m.makeBasis(_x, _y, _z);
    this.rig.quaternion.setFromRotationMatrix(_m);
    this.rig.position.copy(this.root);
    // forearm IK: from the wrist to an elbow anchored below the view, so the limb always leaves the frame
    _a.copy(this.h.wrist).applyQuaternion(this.rig.quaternion).add(this.root);
    _b.set(this.elbow.x + this.root.x * 0.35, this.elbow.y, this.elbow.z).sub(_a);
    const armLen = _b.length();
    this.h.arm.position.copy(_a);
    this.h.arm.quaternion.setFromUnitVectors(_up, _b.divideScalar(armLen));
    this.h.fore.scale.y = Math.max(0.2, armLen + 0.1);

    // ---------- lifecycle
    this.t += dt;
    const t = this.t;
    let tipFlare = 0;
    if (this.state === 'igniting') {
      const T0 = 0.085;
      this.crystal = clamp(t / 0.07) * (0.75 + 0.25 * Math.sin(t * 160));
      if (t >= T0) {
        const x = (t - T0) / 0.32;
        this.len = x < 1 ? 1.045 * (1 - Math.pow(1 - x, 2.2)) : 1 + 0.045 * Math.exp(-(x - 1) * 7) * Math.cos((x - 1) * 11);
        this.power = 1 + 0.9 * Math.exp(-(t - T0) * 6.5);
        this.instab = 0.10 + 1.0 * Math.exp(-(t - T0) * 4.2);
        tipFlare = (x < 1 ? 0.7 : 0) + 0.8 * Math.exp(-(t - T0) * 8);
        if (!this._fired) { this._fired = true; this._igniteBurst(); }
        if (x < 1 && Math.random() < dt * 90) {
          // sparks shed from the plasma front as it travels
          this.rig.updateWorldMatrix(true, false);
          _a.set(0, this.len * BLADE_LEN, 0).applyMatrix4(this.rig.matrixWorld);
          _b.set(0, 1, 0).transformDirection(this.rig.matrixWorld);
          fx.sparks.burst(_a, this.color, 2, 3.5, { dir: _b, spread: 1.4, life: 0.3, grav: 4, bright: 4 });
        }
      } else { this.len = 0; this.power = 0; this.instab = 1; }
      if (t > 1.1) { this.state = 'on'; this.onEvent('ignite-done'); }
    } else if (this.state === 'on') {
      this.len = damp(this.len, 1, 12, dt); this.crystal = damp(this.crystal, 1, 8, dt);
      this.power = damp(this.power, 1, 6, dt); this.instab = damp(this.instab, 0.10, 4, dt);
    } else if (this.state === 'retracting') {
      const x = clamp(t / 0.30);
      this.len = this.len0 * (1 - Math.pow(x, 1.45));
      this.power = 1 + 0.9 * x; this.instab = 0.12 + 0.5 * x; tipFlare = 1.5 * x;
      this.crystal = 1 - 0.3 * x;
      if (x >= 1) {
        this.state = 'off'; this.t = 0; this.len = 0; this.power = 0; this.heat = 1; this.smoke = 0.9;
        this._retractSnap();
      }
    } else {
      this.len = 0; this.power = 0;
      this.crystal = damp(this.crystal, 0, 3.2, dt);
      this.heat *= Math.exp(-dt * 0.75);
    }
    this.tipFlare = tipFlare;
    this.disturbed = Math.max(0, this.disturbed - dt * 1.6);
    this.clashK = Math.max(0, this.clashK - dt * 7);
    this.over = damp(this.over, this.overTarget || 0, 5, dt);

    // ---------- flicker (the blade is never perfectly still)
    this.dropout = Math.max(0, this.dropout - dt);
    if (this.state === 'on' && Math.random() < dt * (0.35 + this.disturbed * 14)) this.dropout = rand(0.02, 0.05);
    const fl = 1 + 0.07 * (noise1(time * 57) - 0.5) + 0.035 * Math.sin(time * 331) + 0.03 * Math.sin(time * 6.2)
      - (this.dropout > 0 ? 0.22 + this.disturbed * 0.4 : 0);
    const instab = this.instab + this.disturbed * 0.9 + this.swing * 0.12;
    const P = this.power * fl;
    this.color.copy(this.baseColor).lerp(GOLD, this.over * 0.85);

    // ---------- world endpoints
    this.rig.updateWorldMatrix(true, false);
    const mw = this.rig.matrixWorld;
    this.A.set(0, -0.004, 0).applyMatrix4(mw);
    this.B.set(0, Math.max(this.len, 0.0001) * BLADE_LEN, 0).applyMatrix4(mw);
    this.Bfull.set(0, BLADE_LEN, 0).applyMatrix4(mw);
    const tipMove = this.prevTipW.distanceTo(this.Bfull) / Math.max(dt, 1e-4);
    this.prevTipW.copy(this.Bfull);
    this.tipSpeed = lerp(this.tipSpeed, tipMove, 0.5);
    this.swing = damp(this.swing, clamp((this.tipSpeed - 1.2) / 12), 16, dt);

    // ---------- visuals
    const cu = this.coreMat.uniforms;
    this.core.visible = this.len > 0.001;
    cu.uLen.value = this.len * BLADE_LEN; cu.uInstab.value = instab; cu.uPower.value = P; cu.uTip.value = tipFlare;
    cu.uRad.value = BLADE_RAD * (1 + this.over * 0.35 + (this.state === 'igniting' ? 0.6 * Math.exp(-Math.max(0, t - 0.085) * 6) : 0));
    const hu = this.halo.material.uniforms;
    hu.uA.value.copy(this.A); hu.uB.value.copy(this.B);
    hu.uPower.value = P * (1 + this.swing * 0.5 + this.over * 0.5 + this.clashK * 0.5) * (this.len > 0.001 ? 1 : 0);
    hu.uInstab.value = instab; hu.uTip.value = tipFlare; hu.uCore.value = cu.uRad.value;
    this.halo.visible = this.len > 0.001;

    // light the world
    this.light = P * Math.pow(clamp(this.len), 0.7) * (1 + this.over * 0.6);
    env.setBlade(this.A, this.B, this.color, this.light);

    // hilt details
    const M = this.h.M;
    const cg = this.crystal * (0.8 + 0.2 * fl) * (this.dropout > 0 ? 0.6 : 1);
    M.crystal.color.copy(this.color).multiplyScalar(cg * 5.5).addScalar(cg * 1.2 + 0.012);
    const lit = clamp(this.len * 4) * P;
    M.throat.emissive.copy(this.color).multiplyScalar(lit * 6).add(_c0.copy(HEAT).multiplyScalar(Math.pow(this.heat, 1.6) * 5));
    for (let i = 0; i < this.h.fins.length; i++) {
      const k = Math.pow(this.heat, 2.2) * (0.25 + 0.75 * (i / 4));
      this.h.fins[i].material.emissive.copy(HEAT).multiplyScalar(k * 1.6);
    }
    const studOn = this.state === 'igniting' || this.state === 'on';
    M.stud.emissive.copy(studOn ? this.color : _c0.setRGB(1, 0.08, 0.03)).multiplyScalar(studOn ? 3.2 : 0.55 + 0.35 * Math.sin(time * 2.2));
    const press = this.state === 'igniting' ? clamp(1 - t / 0.16) : this.state === 'retracting' ? clamp(1 - t / 0.12) : 0;
    this.h.stud.position.set(Math.sin(this.h.studPhi), 0, Math.cos(this.h.studPhi)).multiplyScalar(0.0222 - press * 0.0016).setY(-0.134);
    M.seam.color.copy(this.color).multiplyScalar(0.25 + this.crystal * 2.2);
    for (let i = 0; i < 3; i++) {
      const on = i < this.integrity;
      this.h.pips[i].material.color.copy(on ? this.color : _c0.setRGB(0.5, 0.02, 0.01)).multiplyScalar(on ? 1.2 + this.crystal * 2.5 : 0.5);
    }

    // rain sizzling off the blade + residual smoke from the hot emitter
    if (this.state === 'on') {
      this.sizzleT -= dt;
      if (this.sizzleT <= 0) {
        this.sizzleT = rand(0.05, 0.22);
        _a.lerpVectors(this.A, this.B, rand(0.1, 1));
        fx.sparks.burst(_a, _c0.copy(this.color).lerp(_white, 0.6), 2, 1.4, { dir: _up, spread: 1.2, life: 0.22, grav: 3, bright: 2.5 });
        if (Math.random() < 0.3) fx.glows.emit(_a, _steam, 0.07, 0.5, { vel: _b.set(rand(-0.1, 0.1), 0.5, 0), grow: 2.5, bright: 0.25 });
      }
    }
    if (this.smoke > 0) {
      this.smoke -= dt;
      if (Math.random() < dt * 28) fx.glows.emit(this.A, _steam, 0.05, 1.1, { vel: _b.set(rand(-0.06, 0.06), rand(0.18, 0.4), rand(-0.06, 0.06)), grow: 4, bright: 0.22 * this.smoke });
    }
    this._trail(dt);
  }

  _igniteBurst() {
    const { fx, env } = this;
    this.rig.updateWorldMatrix(true, false);
    const a = _a.set(0, 0, 0).applyMatrix4(this.rig.matrixWorld);
    const d = _b.set(0, 1, 0).transformDirection(this.rig.matrixWorld);
    fx.glows.emit(a, this.color, 0.26, 0.24, { bright: 3.5, grow: 1.2 });
    fx.glows.emit(a, _white, 0.07, 0.14, { bright: 6 });
    fx.sparks.burst(a, _c0.copy(this.color).lerp(_white, 0.35), 34, 7, { dir: d, spread: 0.55, life: 0.55, grav: 7, bright: 5 });
    fx.rings.emit(a, this.color, { r0: 0.02, r1: 0.20, life: 0.26, bright: 2.2, thin: 0.07, normal: d.clone() });
    env.flash(a, this.color, 1.4, 0.35);
    this.onEvent('ignite-burst');
  }
  _retractSnap() {
    const { fx, env } = this;
    const a = this.A;
    fx.glows.emit(a, this.color, 0.16, 0.2, { bright: 3 });
    fx.glows.emit(a, _white, 0.05, 0.12, { bright: 6 });
    fx.sparks.burst(a, _c0.copy(HEAT).lerp(this.color, 0.4), 12, 2.4, { dir: _b.set(0, 1, 0).transformDirection(this.rig.matrixWorld), spread: 0.9, life: 0.5, grav: 6, bright: 4 });
    env.flash(a, this.color, 1.0, 0.25);
    this.onEvent('retract-done');
  }

  _trail(dt) {
    // history of (base, tip) pairs in world space; fades with age, scaled by swing speed
    const hist = this.hist;
    if (this.len > 0.5) {
      const a = _a.lerpVectors(this.A, this.B, 0.12).clone(), b = this.B.clone();
      const last = hist[0];
      if (last && last.b.distanceTo(b) > 0.16) {
        // subdivide fast swings so the ribbon stays smooth
        hist.unshift({ a: last.a.clone().lerp(a, 0.5), b: last.b.clone().lerp(b, 0.5).sub(this.A).setLength(b.distanceTo(this.A)).add(this.A), age: dt * 0.5, k: this.swing });
      }
      hist.unshift({ a, b, age: 0, k: this.swing });
    }
    const LIFE = 0.11;
    for (const s of hist) s.age += dt;
    while (hist.length && (hist[hist.length - 1].age > LIFE || hist.length > TRAIL_N)) hist.pop();
    const P = this.trailPos, Cc = this.trailCol, col = this.color;
    for (let i = 0; i < TRAIL_N; i++) {
      const s = hist[Math.min(i, hist.length - 1)];
      const o = i * 6;
      if (!s) { P.fill(0, o, o + 6); Cc.fill(0, o, o + 6); continue; }
      P[o] = s.a.x; P[o + 1] = s.a.y; P[o + 2] = s.a.z; P[o + 3] = s.b.x; P[o + 4] = s.b.y; P[o + 5] = s.b.z;
      const f = i >= hist.length ? 0 : Math.pow(1 - s.age / LIFE, 1.5) * clamp(s.k * 1.6) * this.power;
      Cc[o] = col.r * f * 0.25; Cc[o + 1] = col.g * f * 0.25; Cc[o + 2] = col.b * f * 0.25;
      Cc[o + 3] = (col.r + 0.25) * f * 0.9; Cc[o + 4] = (col.g + 0.25) * f * 0.9; Cc[o + 5] = (col.b + 0.25) * f * 0.9;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.color.needsUpdate = true;
    this.trail.visible = hist.length > 1;
  }
}
const _c0 = new THREE.Color(), _white = new THREE.Color(1, 1, 1), _steam = new THREE.Color(0.5, 0.6, 0.75), _up = new THREE.Vector3(0, 1, 0);
