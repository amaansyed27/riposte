// Pooled effects: streak sparks, soft glows, expanding rings, tumbling debris.
import * as THREE from 'three';
import { rand, clamp } from '../core/util.js';

const _v = new THREE.Vector3();

export class Sparks {
  constructor(scene, n = 1400) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.col = new Float32Array(n * 3);
    this.grav = new Float32Array(n); this.drag = new Float32Array(n);
    this.gp = new Float32Array(n * 6); this.gc = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.gp, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.gc, 3).setUsage(THREE.DynamicDrawUsage));
    this.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.onSplash = null;
  }
  emit(p, v, color, life = 0.5, grav = 9, drag = 1.2) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.life[i] = this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag;
  }
  // cone/sphere burst. dir optional (THREE.Vector3), spread 0..1 (1 = sphere)
  burst(p, color, count, speed, { dir = null, spread = 1, life = 0.5, grav = 9, drag = 1.2, bright = 3 } = {}) {
    const c = { r: color.r * bright, g: color.g * bright, b: color.b * bright };
    for (let k = 0; k < count; k++) {
      _v.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      if (dir) _v.multiplyScalar(spread).add(dir).normalize();
      _v.multiplyScalar(speed * rand(0.25, 1));
      const w = rand(0.5, 1.4);
      this.emit(p, _v, { r: c.r * w, g: c.g * w, b: c.b * w }, life * rand(0.4, 1), grav, drag);
    }
  }
  update(dt) {
    const { pos, vel, life, max, col, gp, gc, n } = this;
    const streak = 0.028;
    for (let i = 0; i < n; i++) {
      const o = i * 3, o6 = i * 6;
      if (life[i] <= 0) { gp[o6] = gp[o6 + 3] = 0; gp[o6 + 1] = gp[o6 + 4] = -50; gp[o6 + 2] = gp[o6 + 5] = 0; continue; }
      life[i] -= dt;
      const dr = Math.exp(-this.drag[i] * dt);
      vel[o] *= dr; vel[o + 1] = vel[o + 1] * dr - this.grav[i] * dt; vel[o + 2] *= dr;
      pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
      if (pos[o + 1] < 0.01 && vel[o + 1] < 0) {
        pos[o + 1] = 0.01; vel[o + 1] *= -0.3; vel[o] *= 0.6; vel[o + 2] *= 0.6; life[i] *= 0.55;
      }
      const k = clamp(life[i] / max[i]); const f = k * k;
      gp[o6] = pos[o]; gp[o6 + 1] = pos[o + 1]; gp[o6 + 2] = pos[o + 2];
      gp[o6 + 3] = pos[o] - vel[o] * streak; gp[o6 + 4] = pos[o + 1] - vel[o + 1] * streak; gp[o6 + 5] = pos[o + 2] - vel[o + 2] * streak;
      gc[o6] = col[o] * f; gc[o6 + 1] = col[o + 1] * f; gc[o6 + 2] = col[o + 2] * f;
      gc[o6 + 3] = gc[o6 + 4] = gc[o6 + 5] = 0;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}

export class Glows {
  constructor(scene, n = 160) {
    this.n = n; this.i = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.c = new Float32Array(n * 3);
    this.s = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.grow = new Float32Array(n); this.c0 = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    this.uScale = { value: 600 };
    this.mesh = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uScale: this.uScale },
      vertexShader: /* glsl */ `attribute float aSize; attribute vec3 color; varying vec3 vC; uniform float uScale;
        void main(){ vC=color; vec4 mv = viewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = min(aSize*uScale/max(-mv.z,0.05), 900.0); }`,
      fragmentShader: /* glsl */ `varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = pow(max(1.0-d,0.0),2.2); gl_FragColor = vec4(vC*a,1.0); }`,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7;
    scene.add(this.mesh);
  }
  emit(p, color, size, life, { vel = null, grow = 0, bright = 1 } = {}) {
    const i = this.i; this.i = (i + 1) % this.n;
    this.p.set([p.x, p.y, p.z], i * 3);
    this.v.set(vel ? [vel.x, vel.y, vel.z] : [0, 0, 0], i * 3);
    this.c0.set([color.r * bright, color.g * bright, color.b * bright], i * 3);
    this.s0[i] = size; this.grow[i] = grow; this.life[i] = this.max[i] = life;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      if (this.life[i] <= 0) { this.s[i] = 0; continue; }
      this.life[i] -= dt;
      const k = clamp(this.life[i] / this.max[i]);
      this.p[o] += this.v[o] * dt; this.p[o + 1] += this.v[o + 1] * dt; this.p[o + 2] += this.v[o + 2] * dt;
      this.s[i] = this.s0[i] * (1 + this.grow[i] * (1 - k));
      const f = k * k;
      this.c[o] = this.c0[o] * f; this.c[o + 1] = this.c0[o + 1] * f; this.c[o + 2] = this.c0[o + 2] * f;
    }
    const a = this.mesh.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.aSize.needsUpdate = true;
  }
}

export class Rings {
  constructor(scene, n = 10) {
    this.items = [];
    const geo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color() }, uK: { value: 0 }, uThin: { value: 0.06 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uK,uThin; varying vec2 vUv;
float gauss(float x){ return exp(-x*x); }

          void main(){ float r=length(vUv); float ring=gauss((r-0.86)/uThin) + 0.25*gauss((r-0.86)/(uThin*4.0))*step(r,0.86); gl_FragColor=vec4(uColor*ring*uK,1.0); }`,
      });
      const m = new THREE.Mesh(geo, mat); m.visible = false; m.frustumCulled = false; m.renderOrder = 6;
      scene.add(m);
      this.items.push({ m, t: 0, life: 0, r0: 0, r1: 1, bill: false });
    }
    this.i = 0;
  }
  emit(pos, color, { r0 = 0.2, r1 = 4, life = 0.6, flat = false, bright = 2, thin = 0.06, normal = null } = {}) {
    const it = this.items[this.i]; this.i = (this.i + 1) % this.items.length;
    it.m.position.copy(pos); it.m.visible = true;
    it.m.material.uniforms.uColor.value.copy(color).multiplyScalar(bright);
    it.m.material.uniforms.uThin.value = thin;
    it.t = 0; it.life = life; it.r0 = r0; it.r1 = r1; it.bill = !flat && !normal;
    if (flat) it.m.rotation.set(-Math.PI / 2, 0, 0);
    else if (normal) it.m.quaternion.setFromUnitVectors(_v.set(0, 0, 1), normal);
  }
  update(dt, camera) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.t += dt; const k = it.t / it.life;
      if (k >= 1) { it.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3);
      it.m.scale.setScalar(it.r0 + (it.r1 - it.r0) * e);
      it.m.material.uniforms.uK.value = Math.pow(1 - k, 1.6);
      if (it.bill) it.m.quaternion.copy(camera.quaternion);
    }
  }
}

export class Debris {
  constructor(scene, n = 140) {
    this.n = n; this.i = 0;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.45, metalness: 0.85, emissive: 0xff5a2a, emissiveIntensity: 0, envMapIntensity: 0.5 });
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.16), mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.items = Array.from({ length: n }, () => ({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0, life: 0 }));
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
    scene.add(this.mesh);
    this.dummy = new THREE.Object3D();
    this.onSplash = null;
  }
  burst(pos, count, speed, scale = 1) {
    for (let k = 0; k < count; k++) {
      const it = this.items[this.i]; this.i = (this.i + 1) % this.n;
      it.p.copy(pos);
      it.v.set(rand(-1, 1), rand(-0.6, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.3, 1));
      it.w.set(rand(-9, 9), rand(-9, 9), rand(-9, 9));
      it.s = scale * rand(0.4, 1.3); it.life = rand(1.6, 2.6); it.heat = 1;
    }
  }
  update(dt) {
    const d = this.dummy; const col = this.mesh.instanceColor.array;
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      if (it.life > 0) {
        it.life -= dt;
        it.v.y -= 9.8 * dt; it.v.multiplyScalar(Math.exp(-0.4 * dt));
        it.p.addScaledVector(it.v, dt);
        it.r.x += it.w.x * dt; it.r.y += it.w.y * dt; it.r.z += it.w.z * dt;
        it.heat = Math.max(0, it.heat - dt * 1.2);
        if (it.p.y < 0 && it.v.y < 0) { if (this.onSplash) this.onSplash(it.p); it.life = 0; }
        d.position.copy(it.p); d.rotation.copy(it.r); d.scale.setScalar(it.life > 0 ? it.s : 0);
      } else { d.position.set(0, -50, 0); d.scale.setScalar(0); }
      d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix);
      const h = it.heat || 0;
      col[i * 3] = 1 + h * 14; col[i * 3 + 1] = 1 + h * 4; col[i * 3 + 2] = 1 + h * 1.2;
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}
