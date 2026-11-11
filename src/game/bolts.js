// Bolts: pooled blaster shots. Each one flies a straight line from its shooter through a point within your reach
// and on into you. A ring marks where it is heading. Returned bolts leave the blade on a curve set by your swing.
import * as THREE from 'three';
import { makeBeam } from '../sword/beam.js';
import { clamp, lerp } from '../core/util.js';
import { glowTexture } from './enemies.js';

const _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);
export const RING_R = 0.30;        // world radius of the ring quad at the strike plane
export const REACH_FAR = 3.6;      // a bolt can be met by the blade from this depth...
export const REACH_NEAR = 0.75;    // ...down to this one; closer than that, it has hit you

export class Bolts {
  constructor(app, n = 44) {
    this.app = app; this.items = [];
    const ringGeo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < n; i++) {
      const beam = makeBeam({ width: 0.5, core: 0.05, white: 1.3, timeUniform: app.timeU });
      beam.visible = false; app.scene.add(beam);
      const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uColor: { value: new THREE.Color() }, uR: { value: 1 }, uA: { value: 0 }, uHot: { value: 0 }, uLock: { value: 0 }, uLockCol: { value: new THREE.Color(1, 1, 1) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uColor, uLockCol; uniform float uR,uA,uHot,uLock; varying vec2 vUv;
          void main(){ float r = length(vUv); float w = fwidth(r)*1.5;
            float ang = atan(vUv.y, vUv.x);
            float dash = smoothstep(0.30, 0.42, abs(fract(ang*8.0/6.2831853 + uR*1.5) - 0.5)*2.0);
            float outer = smoothstep(0.022+w, 0.0, abs(r-uR)) * mix(1.0, dash, 0.85*(1.0-max(uHot,uLock)));
            float inner = smoothstep(0.012+w, 0.0, abs(r-0.24))*0.7 + smoothstep(0.24,0.0,r)*0.10 + smoothstep(0.035+w, 0.015, r)*0.9;
            vec3 c = mix(uColor, vec3(1.0), uHot*0.7);
            // covered by your blade: the target fills in your colour and gains a bracket ring
            float fill = smoothstep(0.25, 0.21, r)*0.55 + smoothstep(0.02+w, 0.0, abs(r-0.31))*1.4;
            vec3 col = c*(outer*(1.2+uHot*2.5) + inner*(0.6+uHot*1.6));
            col = mix(col, (uLockCol*1.5 + 0.25)*(fill + outer*1.5 + inner), uLock);
            gl_FragColor = vec4(col*uA, 1.0); }`,
      }));
      ring.visible = false; ring.frustumCulled = false; ring.renderOrder = 8; app.scene.add(ring);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      head.visible = false; head.renderOrder = 6; app.scene.add(head);
      this.items.push({ live: false, beam, ring, head, S: new THREE.Vector3(), T: new THREE.Vector3(), C: new THREE.Vector3(), pos: new THREE.Vector3(), prev: new THREE.Vector3(), color: new THREE.Color(), light: new THREE.Vector3(), last: new THREE.Vector3(), depth: 99 });
    }
  }
  get incoming() { return this.items.filter((b) => b.live && b.state === 'in'); }

  // fire from world S through world T (a point within reach), arriving at T after dur seconds
  fire(enemy, S, T, dur, { size = 1, delay = 0 } = {}) {
    const b = this.items.find((x) => !x.live); if (!b) return null;
    Object.assign(b, { live: true, state: 'in', enemy, t: -delay, dur, size, done: false, strong: false, lock: 0, depth: 99, flashed: false });
    b.S.copy(S); b.T.copy(T); b.pos.copy(S); b.prev.copy(S); b.color.copy(enemy.color);
    b.beam.material.uniforms.uColor.value.copy(b.color);
    b.beam.material.uniforms.uCore.value = 0.05 * size; b.beam.material.uniforms.uWidth.value = 0.5 * size; b.beam.material.uniforms.uWhite.value = 1.3;
    b.ring.material.uniforms.uColor.value.copy(b.color);
    b.ring.position.copy(T); b.ring.scale.setScalar(RING_R * Math.sqrt(size));
    return b;
  }
  // turn a bolt at the point where the blade met it. `fling` (world vector) bends its first stretch the way you swung.
  send(b, target, color, strong, fling = null) {
    b.state = 'out'; b.target = target; b.t = 0; b.strong = strong; b.color.copy(color);
    b.S.copy(b.pos); b.last.copy(target.group.position);
    const dist = b.pos.distanceTo(b.last);
    b.dur = clamp(dist / (strong ? 46 : 34), 0.26, 0.6);
    // control point: a third of the way home, pushed sideways by the swing
    _d.subVectors(b.last, b.S).normalize();
    b.C.copy(b.S).addScaledVector(_d, dist * 0.35);
    if (fling) b.C.add(fling);
    const u = b.beam.material.uniforms;
    u.uColor.value.copy(color); u.uWhite.value = 1.6;
    u.uCore.value = strong ? 0.034 : 0.026; u.uWidth.value = strong ? 0.34 : 0.26;
    b.ring.visible = false;
  }
  echo(from, target, color) {
    const b = this.items.find((x) => !x.live); if (!b) return;
    Object.assign(b, { live: true, state: 'out', enemy: target, size: 1, done: false, flashed: true });
    b.pos.copy(from); b.prev.copy(from);
    this.send(b, target, color, true);
  }
  kill(b) { b.live = false; b.beam.visible = false; b.ring.visible = false; b.head.visible = false; }
  clear() { for (const b of this.items) this.kill(b); }

  update(dt, game) {
    const { app } = this; const cam = app.camera;
    for (const b of this.items) {
      if (!b.live) continue;
      b.t += dt;
      if (b.t < 0) { b.beam.visible = false; b.head.visible = false; continue; }
      b.head.visible = true; b.beam.visible = true;
      b.prev.copy(b.pos);
      const u = b.beam.material.uniforms;
      if (b.state === 'in') {
        if (!b.flashed) {
          // muzzle flash where it leaves the barrel
          b.flashed = true;
          app.fx.glows.emit(b.S, b.color, 1.1 * b.size, 0.14, { bright: 3 });
          app.fx.glows.emit(b.S, WHITE, 0.4 * b.size, 0.08, { bright: 4 });
          _d.subVectors(b.T, b.S).normalize();
          app.fx.sparks.burst(b.S, b.color, 8, 6, { dir: _d, spread: 0.5, life: 0.25, bright: 3, grav: 0 });
          app.env.flash(b.S, b.color, 3, 0.15);
        }
        // one straight line: shooter -> point within reach -> on into you
        b.pos.lerpVectors(b.S, b.T, b.t / b.dur);
        _d.subVectors(b.T, b.S).normalize();
        b.depth = app.depth(b.pos);
        const len = Math.min(1.25 * b.size, b.t * 16);
        u.uB.value.copy(b.pos); u.uA.value.copy(b.pos).addScaledVector(_d, -len);
        u.uPower.value = 0.95 + 0.15 * Math.sin(b.t * 55);
        const rem = b.dur - b.t;
        const ra = clamp((1.15 - rem) / 0.3);
        b.ring.visible = ra > 0.01;
        if (b.ring.visible) {
          b.ring.quaternion.copy(cam.quaternion);
          const ru = b.ring.material.uniforms;
          ru.uR.value = lerp(0.24, 0.95, clamp(rem / 1.0));
          ru.uA.value = ra; ru.uHot.value = b.depth < REACH_FAR ? 1 : 0; ru.uLock.value = b.lock || 0; ru.uLockCol.value.copy(app.sword.color);
        }
        app.env.light(b.light.copy(b.pos), b.color, 1.3 * b.size);
        b.head.position.copy(b.pos); b.head.scale.setScalar((0.8 + 0.12 * Math.sin(b.t * 55)) * b.size); b.head.material.color.copy(b.color).multiplyScalar(2.4).addScalar(0.35);
        if (b.depth < REACH_NEAR) { game.onPlayerHit(b); this.kill(b); }
      } else {
        if (b.target.alive) b.last.copy(b.target.group.position);
        const k = clamp(b.t / b.dur), e = k * k * (3 - 2 * k) * 0.3 + k * 0.7;
        // quadratic curve: off the blade, bending with the swing, then home
        _a.lerpVectors(b.S, b.C, e); _b.lerpVectors(b.C, b.last, e); b.pos.lerpVectors(_a, _b, e);
        _d.subVectors(b.pos, b.prev); const l = _d.length(); if (l > 1e-4) _d.divideScalar(l);
        u.uB.value.copy(b.pos); u.uA.value.copy(b.pos).addScaledVector(_d, -Math.min(2.2, b.t * 30 + 0.15));
        u.uPower.value = b.strong ? 1.7 : 1.25;
        app.env.light(b.light.copy(b.pos), b.color, b.strong ? 3 : 2);
        b.head.position.copy(b.pos); b.head.scale.setScalar((b.strong ? 0.5 : 0.36) * (1 + k * 1.6)); b.head.material.color.copy(b.color).multiplyScalar(2.4).addScalar(0.6);
        if (k >= 1) { game.onReturnHit(b); this.kill(b); }
      }
    }
  }
}
