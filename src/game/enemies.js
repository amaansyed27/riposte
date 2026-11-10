// Sentinels: procedurally built machines that drift out of the fog, charge, and fire.
import * as THREE from 'three';
import { rand, clamp, lerp, easeOutCubic, pick } from '../core/util.js';
import { makeBeam } from '../sword/beam.js';

export const TYPES = {
  wisp: { hp: 1, score: 100, color: new THREE.Color(1.0, 0.22, 0.10), scale: 1.45, charge: 0.55, cd: [1.5, 2.6] },
  twin: { hp: 1, score: 180, color: new THREE.Color(1.0, 0.10, 0.48), scale: 1.45, charge: 0.6, cd: [2.0, 3.0] },
  lancer: { hp: 1, score: 300, color: new THREE.Color(1.0, 0.72, 0.18), scale: 1.4, charge: 1.0, cd: [2.4, 3.6] },
  bulwark: { hp: 2, score: 400, color: new THREE.Color(1.0, 0.36, 0.06), scale: 1.7, charge: 0.7, cd: [1.9, 2.9] },
  maestro: { hp: 12, score: 2500, color: new THREE.Color(1.0, 0.08, 0.14), scale: 1.25, charge: 0.9, cd: [1.6, 2.2] },
};

let shared = null;
function assets() {
  if (shared) return shared;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(c);
  shared = {
    glowTex,
    hull: new THREE.MeshStandardMaterial({ color: 0x2a303b, metalness: 0.85, roughness: 0.38, envMapIntensity: 1.6, flatShading: true }),
    hull2: new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 1, roughness: 0.25, envMapIntensity: 1.0 }),
    octa: new THREE.OctahedronGeometry(0.55, 0),
    ico: new THREE.IcosahedronGeometry(0.7, 0),
    ico1: new THREE.IcosahedronGeometry(1, 1),
    ring: new THREE.TorusGeometry(0.9, 0.03, 8, 56),
    ringThick: new THREE.TorusGeometry(0.9, 0.06, 6, 6),
    eye: new THREE.SphereGeometry(0.15, 16, 12),
    fin: new THREE.ConeGeometry(0.12, 0.9, 4),
    needle: new THREE.ConeGeometry(0.26, 2.3, 5),
    sphere: new THREE.SphereGeometry(1, 32, 20),
  };
  return shared;
}

function shieldMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uHit: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalMatrix*normal; vV = -mv.xyz; vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime,uHit; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0-abs(dot(normalize(vN),normalize(vV))), 2.2);
        vec3 q = vP*7.0; float hex = abs(sin(q.x+uTime)*sin(q.y*1.15-uTime*0.7)*sin(q.z)); float grid = smoothstep(0.05,0.0,hex);
        gl_FragColor = vec4(uColor*(f*1.6 + grid*(0.35+uHit*3.0) + uHit*0.6), 1.0); }`,
  });
}

export const glowTexture = () => assets().glowTex;

export class Enemy {
  constructor(type, app) {
    const A = assets(); const T = TYPES[type];
    this.type = type; this.T = T; this.app = app;
    this.hp = T.hp; this.maxHp = T.hp; this.color = T.color; this.alive = true;
    this.state = 'enter'; this.t = 0; this.chargeK = 0; this.cool = rand(0.5, 1.2); this.flinch = 0; this.spin = rand(0.5, 1.5);
    this.pos = new THREE.Vector3(); this.from = new THREE.Vector3(); this.slot = new THREE.Vector3();
    this.seed = rand(0, 100);
    const g = (this.group = new THREE.Group());
    this.eyeMat = new THREE.MeshBasicMaterial({ color: T.color.clone().multiplyScalar(3), fog: false });
    this.rings = []; this.eyes = [];
    // trim: every ring glows faintly in the sentinel's colour so the silhouette reads against the dark
    this.trim = new THREE.MeshStandardMaterial({ color: 0x3a4150, metalness: 1, roughness: 0.3, envMapIntensity: 1.4, emissive: T.color.clone(), emissiveIntensity: 0.35 });
    const addEye = (x, y, z, s = 1) => {
      const e = new THREE.Mesh(A.eye, this.eyeMat); e.position.set(x, y, z); e.scale.setScalar(s); g.add(e);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowTex, color: T.color.clone(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      sp.position.set(x, y, z + 0.1); sp.scale.setScalar(1.1 * s); g.add(sp);
      this.eyes.push({ e, sp, s });
    };
    const addRing = (r, geo = A.ring, ax = 0, az = 0) => { const m = new THREE.Mesh(geo, this.trim); m.scale.setScalar(r); m.rotation.set(ax, 0, az); g.add(m); this.rings.push(m); return m; };
    if (type === 'wisp') {
      const b = new THREE.Mesh(A.octa, A.hull); b.scale.set(1, 1.25, 1); g.add(b); this.body = b;
      addRing(1); addEye(0, 0, 0.5);
      for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(A.fin, A.hull); const a = i * 2.094 + 0.5; f.position.set(Math.cos(a) * 0.75, -0.35, Math.sin(a) * 0.3 - 0.2); f.rotation.z = Math.PI + Math.cos(a) * 0.5; f.scale.setScalar(0.8); g.add(f); }
    } else if (type === 'twin') {
      for (const s of [-1, 1]) { const b = new THREE.Mesh(A.octa, A.hull); b.position.x = s * 0.7; b.scale.setScalar(0.8); g.add(b); addEye(s * 0.7, 0, 0.42, 0.85); }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), A.hull2); bar.rotation.z = Math.PI / 2; g.add(bar);
      addRing(0.62, A.ring, 0, 0).position.x = -0.7; addRing(0.62, A.ring, 0, 0).position.x = 0.7;
    } else if (type === 'lancer') {
      const n = new THREE.Mesh(A.needle, A.hull); n.rotation.x = Math.PI / 2; n.position.z = -0.7; g.add(n);
      const n2 = new THREE.Mesh(A.needle, A.hull2); n2.rotation.x = -Math.PI / 2; n2.scale.set(0.5, 0.35, 0.5); n2.position.z = 0.75; g.add(n2);
      addRing(0.55, A.ringThick, 0, 0); addRing(0.8, A.ring, 0, 0).position.z = -0.5; addEye(0, 0, 0.95, 0.7);
    } else if (type === 'bulwark') {
      const b = new THREE.Mesh(A.ico, A.hull); g.add(b); this.body = b;
      addRing(1.05, A.ringThick, Math.PI / 2, 0); addEye(0, 0, 0.66, 1.2);
      this.shield = new THREE.Mesh(A.sphere, shieldMaterial(T.color)); this.shield.scale.setScalar(1.3); this.shield.renderOrder = 3; g.add(this.shield);
    } else if (type === 'maestro') {
      const b = new THREE.Mesh(A.ico1, A.hull); b.scale.setScalar(1.25); g.add(b); this.body = b;
      addRing(2.1, A.ring, 0.3, 0); addRing(2.6, A.ringThick, 1.2, 0.4); addRing(3.2, A.ring, -0.7, 1.1);
      addEye(0, 0, 1.2, 2.4);
      for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(A.fin, A.hull2); const a = i * 1.047; f.position.set(Math.cos(a) * 1.7, Math.sin(a) * 1.7, -0.3); f.rotation.z = a - Math.PI / 2; f.scale.set(1.4, 1.6, 1.4); g.add(f); }
      this.phase = 1;
    }
    g.scale.setScalar(T.scale);
    app.scene.add(g);
    if (type === 'lancer') { this.sight = makeBeam({ width: 0.09, core: 0.007, timeUniform: app.timeU }); this.sight.material.uniforms.uColor.value.copy(T.color); this.sight.visible = false; app.scene.add(this.sight); }
  }
  get muzzle() { return this._m.copy(this.eyes[0].e.position).applyMatrix4(this.group.matrixWorld); }
  _m = new THREE.Vector3();

  place(slot) {
    this.slot.copy(slot);
    this.from.set(slot.x * 2.2 + rand(-6, 6), slot.y + rand(10, 22), slot.z - rand(40, 60));
    this.pos.copy(this.from); this.group.position.copy(this.pos);
  }
  moveTo(slot) { this.from.copy(this.pos); this.slot.copy(slot); this.moveT = 0; }

  update(dt, time, game) {
    this.t += dt;
    const g = this.group;
    if (this.state === 'enter') {
      const k = easeOutCubic(this.t / 1.5);
      this.pos.lerpVectors(this.from, this.slot, k);
      if (this.t >= 1.5) { this.state = 'idle'; this.t = 0; }
    } else {
      if (this.moveT !== undefined) {
        this.moveT += dt / 1.2; const k = easeOutCubic(this.moveT);
        this.pos.lerpVectors(this.from, this.slot, k);
        if (this.moveT >= 1) this.moveT = undefined;
      } else this.pos.copy(this.slot);
    }
    const bob = this.type === 'maestro' ? 0.5 : 0.3;
    g.position.set(this.pos.x + Math.sin(time * 0.7 + this.seed) * bob, this.pos.y + Math.sin(time * 1.1 + this.seed * 2) * bob * 0.7, this.pos.z);
    // face the player
    g.lookAt(this.app.camPos);
    this.flinch = Math.max(0, this.flinch - dt * 3);
    if (this.flinch > 0) { g.rotateZ(Math.sin(time * 60) * 0.25 * this.flinch); g.position.z -= this.flinch * 1.2; }

    if (this.state === 'idle') {
      this.cool -= dt;
      if (this.cool <= 0 && game.canFire(this)) { this.state = 'charge'; this.t = 0; game.onCharge(this); }
      this.chargeK = Math.max(0, this.chargeK - dt * 3);
    } else if (this.state === 'charge') {
      this.chargeK = clamp(this.t / this.T.charge);
      if (this.t >= this.T.charge) { this.state = 'idle'; this.t = 0; this.cool = rand(...this.T.cd) * game.cdScale; this.chargeK = 1.3; game.onFire(this); }
    }
    const ck = this.chargeK;
    const sp = this.spin * (1 + ck * 7) * (this.phase === 2 ? 1.8 : 1);
    this.rings.forEach((r, i) => { if (this.type === 'maestro' || this.type === 'bulwark') { r.rotation.x += dt * sp * (0.5 + i * 0.3); r.rotation.y += dt * sp * 0.4; } else r.rotation.z += dt * sp * (i % 2 ? -1 : 1) * 1.6; });
    const pulse = 1 + 0.15 * Math.sin(time * 5 + this.seed);
    this.eyeMat.color.copy(this.color).multiplyScalar((2.2 + ck * 9) * pulse).addScalar(ck * ck * 2.5);
    for (const { sp: s, s: sc } of this.eyes) { s.scale.setScalar(sc * (1.1 + ck * 1.3) * pulse); s.material.color.copy(this.color).multiplyScalar(0.55 + ck * 1.1); }
    if (this.shield) { const u = this.shield.material.uniforms; u.uTime.value = time; u.uHit.value = Math.max(0, u.uHit.value - dt * 3); }
    this.trim.emissiveIntensity = 0.35 + ck * 1.6 + this.flinch * 2;
    g.updateMatrixWorld(true);
    if (this.sight) {
      this.sight.visible = this.state === 'charge' && !!this.aimW;
      if (this.sight.visible) { const u = this.sight.material.uniforms; u.uA.value.copy(this.muzzle); u.uB.value.copy(this.aimW); u.uPower.value = 0.25 + ck * ck * 1.4; }
    }
    // glow of the eye onto the wet floor
    if (ck > 0.05) this.app.env.light(this.muzzle.clone(), this.color, ck * 1.2);
  }

  damage(n) {
    this.hp -= n; this.flinch = 1;
    if (this.shield) {
      if (this.hp <= 1) { this.group.remove(this.shield); this.shield = null; return this.hp <= 0 ? 'dead' : 'shield'; }
      this.shield.material.uniforms.uHit.value = 1;
    }
    if (this.type === 'maestro' && this.hp <= this.maxHp / 2 && this.phase === 1) { this.phase = 2; return this.hp <= 0 ? 'dead' : 'phase'; }
    return this.hp <= 0 ? 'dead' : 'hurt';
  }
  dispose() { this.alive = false; this.app.scene.remove(this.group); this.trim.dispose(); if (this.sight) { this.app.scene.remove(this.sight); this.sight.material.dispose(); } for (const { sp } of this.eyes) sp.material.dispose(); this.eyeMat.dispose(); }
}
