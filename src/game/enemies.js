// Sentinels: floating panelled orbs that dart, charge, and fire. Bosses are bigger orbs with their own rules.
import * as THREE from 'three';
import { rand, clamp, easeOutCubic } from '../core/util.js';
import { makeBeam } from '../sword/beam.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
export const TYPES = {
  wisp: { name: 'Remote', hp: 1, score: 100, color: C(1.0, 0.16, 0.07), r: 0.62, charge: 0.55, cd: [1.5, 2.6] },
  twin: { name: 'Binary', hp: 1, score: 180, color: C(1.0, 0.10, 0.50), r: 0.44, charge: 0.6, cd: [2.0, 3.0] },
  lancer: { name: 'Lancer', hp: 1, score: 300, color: C(1.0, 0.85, 0.30), r: 0.55, charge: 1.0, cd: [2.4, 3.6] },
  bulwark: { name: 'Bulwark', hp: 2, score: 400, color: C(1.0, 0.45, 0.02), r: 0.78, charge: 0.7, cd: [1.9, 2.9] },
  maestro: { name: 'The Maestro', boss: true, hp: 12, score: 2500, color: C(1.0, 0.06, 0.12), r: 1.45, charge: 0.9, cd: [1.6, 2.2] },
  hydra: { name: 'The Hydra', boss: true, hp: 9, score: 3500, color: C(0.80, 0.12, 1.0), r: 1.25, charge: 0.8, cd: [1.4, 2.0] },
  bastion: { name: 'The Bastion', boss: true, hp: 16, score: 5000, color: C(1.0, 0.50, 0.08), r: 1.7, charge: 1.0, cd: [1.5, 2.1] },
};

let shared = null;
function assets() {
  if (shared) return shared;
  // radial glow sprite
  let c = document.createElement('canvas'); c.width = c.height = 128;
  let x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(c);
  // hull panels: plates, seams, rivets, scuffs (equirect, wraps around the sphere)
  c = document.createElement('canvas'); c.width = 1024; c.height = 512; x = c.getContext('2d');
  x.fillStyle = '#a9b0b8'; x.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 70; i++) { const v = 120 + Math.random() * 90 | 0; x.fillStyle = `rgba(${v},${v + 4},${v + 10},0.55)`; const w = 64 * (1 + (Math.random() * 3 | 0)), h = 64 * (1 + (Math.random() * 2 | 0)); x.fillRect((Math.random() * 16 | 0) * 64, (Math.random() * 8 | 0) * 64, w, h); }
  x.strokeStyle = 'rgba(20,24,30,0.9)'; x.lineWidth = 3;
  for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(i * 64, 64); x.lineTo(i * 64, 448); x.stroke(); }
  for (const y of [64, 160, 256, 352, 448]) { x.beginPath(); x.moveTo(0, y); x.lineTo(1024, y); x.stroke(); }
  x.fillStyle = 'rgba(25,28,34,0.9)';
  for (let i = 0; i < 16; i++) for (const y of [72, 168, 264, 360, 440]) { x.beginPath(); x.arc(i * 64 + 9, y, 2.2, 0, 7); x.fill(); x.beginPath(); x.arc(i * 64 + 55, y, 2.2, 0, 7); x.fill(); }
  for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.fillRect(Math.random() * 1024, Math.random() * 512, Math.random() * 40, 1.5); }
  x.fillStyle = 'rgba(30,34,40,0.85)'; x.fillRect(0, 238, 1024, 36);       // equatorial band
  const hullTex = new THREE.CanvasTexture(c); hullTex.colorSpace = THREE.SRGBColorSpace; hullTex.anisotropy = 8; hullTex.wrapS = THREE.RepeatWrapping;
  const hullMat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, map: hullTex, bumpMap: hullTex, bumpScale: 2.5, metalness: 0.8, roughness: 0.42, envMapIntensity: 1.5, ...extra });
  shared = {
    glowTex, hullTex, hullMat,
    hull: hullMat(0xffffff), hullDark: hullMat(0x565c68), hullBoss: hullMat(0x6d7078),
    dark: new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: 0.9, roughness: 0.4, envMapIntensity: 1.0 }),
    plate: new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.9, roughness: 0.35, envMapIntensity: 1.3, flatShading: true }),
    sphere: new THREE.SphereGeometry(1, 40, 28),
    port: new THREE.CylinderGeometry(0.085, 0.11, 0.12, 12),
    lens: new THREE.SphereGeometry(0.06, 10, 8),
    eyeRim: new THREE.TorusGeometry(0.26, 0.05, 10, 28),
    eye: new THREE.SphereGeometry(0.2, 18, 14),
    band: new THREE.TorusGeometry(1.012, 0.022, 8, 64),
    ring: new THREE.TorusGeometry(1, 0.022, 8, 72),
    rod: new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6),
    barrel: new THREE.CylinderGeometry(0.11, 0.16, 1.5, 14),
    petal: new THREE.SphereGeometry(1.2, 18, 14, 0, 1.5, 0.55, 2.0),
    shell: new THREE.IcosahedronGeometry(1.16, 1),
  };
  shared.shellEdges = new THREE.EdgesGeometry(shared.shell, 1);
  return shared;
}
export const glowTexture = () => assets().glowTex;

function shieldMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uHit: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalMatrix*normal; vV = -mv.xyz; vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime,uHit; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float f = pow(1.0-abs(dot(normalize(vN),normalize(vV))), 2.2);
        vec3 q = vP*7.0; float hex = abs(sin(q.x+uTime)*sin(q.y*1.15-uTime*0.7)*sin(q.z)); float grid = smoothstep(0.05,0.0,hex);
        gl_FragColor = vec4(uColor*(f*1.0 + grid*(0.18+uHit*3.0) + uHit*0.6), 1.0); }`,
  });
}
const FIB = Array.from({ length: 14 }, (_, i) => { const y = 1 - (i + 0.5) / 7, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); }).filter((v) => v.z < 0.55);
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export class Enemy {
  constructor(type, app) {
    const A = assets(); const T = TYPES[type];
    this.type = type; this.T = T; this.app = app; this.boss = !!T.boss;
    this.hp = T.hp; this.maxHp = T.hp; this.color = T.color; this.alive = true; this.phase = 1; this.shielded = false;
    this.state = 'enter'; this.t = 0; this.chargeK = 0; this.cool = rand(0.5, 1.2); this.flinch = 0; this.spin = rand(0.6, 1.4);
    this.pos = new THREE.Vector3(); this.from = new THREE.Vector3(); this.slot = new THREE.Vector3();
    this.dart = new THREE.Vector3(); this.dartT = new THREE.Vector3(); this.dartClock = rand(1, 2.5);
    this.seed = rand(0, 100); this._m = new THREE.Vector3();
    const g = (this.group = new THREE.Group());
    this.eyeMat = new THREE.MeshBasicMaterial({ color: T.color.clone().multiplyScalar(3), fog: false });
    this.lensMat = new THREE.MeshBasicMaterial({ color: T.color.clone().multiplyScalar(1.2), fog: false });
    this.trim = new THREE.MeshStandardMaterial({ color: 0x3a4150, metalness: 1, roughness: 0.3, envMapIntensity: 1.4, emissive: T.color.clone(), emissiveIntensity: 0.4 });
    this.rings = []; this.eyes = []; this.extras = [];
    // one orb: panelled sphere, emitter ports, antenna, and a main lens facing +Z
    const orb = (parent, r, mat = A.hull, ports = true) => {
      const o = new THREE.Group(); o.scale.setScalar(r); parent.add(o);
      const s = new THREE.Mesh(A.sphere, mat); s.rotation.y = rand(0, 6); o.add(s);
      o.add(new THREE.Mesh(A.band, A.dark));
      if (ports) for (const d of FIB) {
        const p = new THREE.Mesh(A.port, A.dark); p.position.copy(d).multiplyScalar(1.0); p.quaternion.setFromUnitVectors(Y, d); o.add(p);
        const l = new THREE.Mesh(A.lens, this.lensMat); l.position.copy(d).multiplyScalar(1.07); o.add(l);
      }
      for (const sx of [-1, 1]) { const rod = new THREE.Mesh(A.rod, A.dark); rod.position.set(sx * 0.45, 1.05, -0.2); rod.rotation.z = -sx * 0.35; o.add(rod); }
      const rim = new THREE.Mesh(A.eyeRim, A.dark); rim.position.z = 0.95; o.add(rim);
      const e = new THREE.Mesh(A.eye, this.eyeMat); e.position.z = 0.9; e.scale.set(1, 1, 0.55); o.add(e);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: A.glowTex, color: T.color.clone(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      sp.position.z = 1.05; o.add(sp);
      this.eyes.push({ e, sp, s: 1 });
      return o;
    };
    const ring = (parent, r, ax, az) => { const m = new THREE.Mesh(A.ring, this.trim); m.scale.setScalar(r); m.rotation.set(ax, 0, az); parent.add(m); this.rings.push(m); return m; };
    const beam = (w = 0.1, core = 0.008) => { const b = makeBeam({ width: w, core, timeUniform: app.timeU }); b.material.uniforms.uColor.value.copy(T.color); b.visible = false; app.scene.add(b); this.extras.push(b); return b; };

    if (type === 'wisp') orb(g, T.r);
    else if (type === 'twin') {
      this.spinner = new THREE.Group(); g.add(this.spinner);
      for (const s of [-1, 1]) orb(this.spinner, T.r).position.x = s * 0.85;
      this.tether = beam(0.12, 0.012);
    } else if (type === 'lancer') {
      const o = orb(g, T.r, A.hullDark);
      const b = new THREE.Mesh(A.barrel, A.dark); b.rotation.x = Math.PI / 2; b.position.z = 1.5; o.add(b);
      const tip = new THREE.Mesh(A.eye, this.eyeMat); tip.position.z = 2.3; tip.scale.setScalar(0.45); o.add(tip);
      this.eyes[0].e = tip; this.eyes[0].sp.position.z = 2.35; this.eyes[0].s = 0.6;
      ring(o, 1.35, Math.PI / 2, 0);
      this.sight = beam(0.09, 0.007);
    } else if (type === 'bulwark') {
      const o = orb(g, T.r, A.hullDark, false);
      this.petals = new THREE.Group(); o.add(this.petals);
      for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(A.petal, A.plate); p.rotation.y = i * 2.094; this.petals.add(p); }
      this.shield = new THREE.Mesh(A.sphere, shieldMaterial(T.color)); this.shield.scale.setScalar(1.36); this.shield.renderOrder = 3; o.add(this.shield);
    } else if (type === 'maestro') {
      const o = orb(g, T.r, A.hullBoss);
      ring(o, 1.5, 0.3, 0); ring(o, 1.85, 1.2, 0.4); ring(o, 2.25, -0.7, 1.1);
    } else if (type === 'hydra') {
      const o = orb(g, T.r, A.hullMat(0x3a2c48));
      ring(o, 1.3, Math.PI / 2, 0); ring(o, 1.3, 0, 0);
      this.shield = new THREE.Mesh(A.sphere, shieldMaterial(T.color)); this.shield.scale.setScalar(1.5); this.shield.renderOrder = 3; this.shield.visible = false; o.add(this.shield);
    } else if (type === 'bastion') {
      const o = orb(g, T.r, A.hullBoss, false);
      this.shell = new THREE.Group(); o.add(this.shell);
      this.shell.add(new THREE.Mesh(A.shell, A.plate));
      this.seams = new THREE.LineSegments(A.shellEdges, new THREE.LineBasicMaterial({ color: T.color.clone().multiplyScalar(2.5), fog: false })); this.seams.scale.setScalar(1.004); this.shell.add(this.seams);
      this.eyes[0].e.position.z = 1.18; this.eyes[0].sp.position.z = 1.3;
    }
    app.scene.add(g);
  }
  get muzzle() { return this.muzzleOf(0); }
  muzzleOf(i) { const e = this.eyes[i % this.eyes.length].e; return e.getWorldPosition(this._m); }

  place(slot) {
    this.slot.copy(slot);
    this.from.set(slot.x * 2.2 + rand(-6, 6), slot.y + rand(10, 22), slot.z - rand(40, 60));
    this.pos.copy(this.from); this.group.position.copy(this.pos);
  }

  update(dt, time, game) {
    this.t += dt;
    const g = this.group;
    if (this.state === 'enter') {
      this.pos.lerpVectors(this.from, this.slot, easeOutCubic(this.t / 1.5));
      if (this.t >= 1.5) { this.state = 'idle'; this.t = 0; }
    } else this.pos.copy(this.slot);
    // the orb never sits still: it darts a short way, hovers, darts again
    this.dartClock -= dt;
    if (this.dartClock <= 0 && this.state === 'idle') {
      this.dartClock = rand(1.2, 2.8);
      const k = this.boss ? 0.6 : 1.3; this.dartT.set(rand(-k, k), rand(-k * 0.6, k * 0.6), rand(-0.6, 0.6));
    }
    this.dart.lerp(this.dartT, clamp(dt * 7));
    const bob = this.boss ? 0.35 : 0.16;
    g.position.set(this.pos.x + this.dart.x + Math.sin(time * 0.9 + this.seed) * bob, Math.max(1.0, this.pos.y + this.dart.y + Math.sin(time * 1.3 + this.seed * 2) * bob), this.pos.z + this.dart.z);
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
    const ck = this.chargeK, sp = this.spin * (1 + ck * 6) * (this.phase === 2 ? 1.8 : 1);
    this.rings.forEach((r, i) => { r.rotation.x += dt * sp * (0.5 + i * 0.3); r.rotation.y += dt * sp * 0.4 * (i % 2 ? -1 : 1); });
    if (this.spinner) this.spinner.rotation.z += dt * (1.2 + ck * 5);
    if (this.petals) this.petals.rotation.y += dt * (0.8 + ck * 4);
    if (this.shell) this.shell.rotation.y += dt * 0.25;
    const pulse = 1 + 0.15 * Math.sin(time * 5 + this.seed);
    this.eyeMat.color.copy(this.color).multiplyScalar((2.0 + ck * 8) * pulse).addScalar(ck * ck * 2.2);
    this.lensMat.color.copy(this.color).multiplyScalar(0.7 + ck * 2.5 + this.flinch * 3);
    this.trim.emissiveIntensity = 0.4 + ck * 1.6 + this.flinch * 2;
    for (const { sp: s, s: sc } of this.eyes) { s.scale.setScalar(sc * (0.9 + ck * 1.2) * pulse); s.material.color.copy(this.color).multiplyScalar(0.5 + ck * 1.0); }
    if (this.shield) { const u = this.shield.material.uniforms; u.uTime.value = time; u.uHit.value = Math.max(0, u.uHit.value - dt * 3); if (this.type === 'hydra') this.shield.visible = this.shielded; }
    if (this.seams) this.seams.material.color.copy(this.color).multiplyScalar(1.5 + ck * 4 + this.flinch * 5);
    g.updateMatrixWorld(true);
    if (this.sight) {
      this.sight.visible = this.state === 'charge' && !!this.aimW;
      if (this.sight.visible) { const u = this.sight.material.uniforms; u.uA.value.copy(this.muzzle); u.uB.value.copy(this.aimW); u.uPower.value = 0.25 + ck * ck * 1.4; }
    }
    if (this.tether) { const u = this.tether.material.uniforms; this.tether.visible = true; u.uA.value.copy(this.muzzleOf(0)); u.uB.value.copy(this.muzzleOf(1)); u.uPower.value = 0.35 + ck; }
    if (this.leash) {
      const on = this.tetherTo && this.tetherTo.alive; this.leash.visible = !!on;
      if (on) { const u = this.leash.material.uniforms; u.uA.value.copy(this.tetherTo.group.position); u.uB.value.copy(g.position); u.uPower.value = 0.5 + 0.2 * Math.sin(time * 9 + this.seed); }
    }
    if (ck > 0.05) this.app.env.light(this.muzzle.clone(), this.color, ck * 1.2);
  }
  // bind this orb to a boss with a visible energy leash
  leashTo(boss) { this.tetherTo = boss; this.leash = makeBeam({ width: 0.16, core: 0.014, timeUniform: this.app.timeU }); this.leash.material.uniforms.uColor.value.copy(boss.color); this.app.scene.add(this.leash); this.extras.push(this.leash); }

  // returns 'immune' | 'hurt' | 'shield' | 'phase' | 'dead'
  damage(n) {
    if (this.shielded) { if (this.shield) this.shield.material.uniforms.uHit.value = 1; this.flinch = 0.4; return 'immune'; }
    this.hp -= n; this.flinch = 1;
    if (this.type === 'bulwark' && this.petals) {
      this.petals.parent.remove(this.petals); this.petals = null; this.shield.parent.remove(this.shield); this.shield = null;
      return this.hp <= 0 ? 'dead' : 'shield';
    }
    if (this.hp <= 0) return 'dead';
    if (this.boss && this.hp <= this.maxHp / 2 && this.phase === 1) {
      this.phase = 2;
      if (this.shell) { this.shell.parent.remove(this.shell); this.shell = null; this.seams = null; }
      return 'phase';
    }
    return 'hurt';
  }
  dispose() {
    this.alive = false; this.app.scene.remove(this.group);
    for (const b of this.extras) { this.app.scene.remove(b); b.material.dispose(); }
    for (const { sp } of this.eyes) sp.material.dispose();
    this.eyeMat.dispose(); this.lensMat.dispose(); this.trim.dispose();
  }
}
