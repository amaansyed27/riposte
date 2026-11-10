// Bolts: pooled energy shots. Incoming ones carry an approach ring showing where and when to swipe.
import * as THREE from 'three';
import { makeBeam } from '../sword/beam.js';
import { clamp, lerp } from '../core/util.js';
import { glowTexture } from './enemies.js';

const _d = new THREE.Vector3(), _p = new THREE.Vector3();
const WHITE = new THREE.Color(1, 1, 1);

export class Bolts {
  constructor(app, n = 40) {
    this.app = app; this.items = [];
    const ringGeo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < n; i++) {
      const beam = makeBeam({ width: 0.7, core: 0.06, white: 2.6, timeUniform: app.timeU });
      beam.visible = false; app.scene.add(beam);
      const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uColor: { value: new THREE.Color() }, uR: { value: 1 }, uA: { value: 0 }, uHot: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uR,uA,uHot; varying vec2 vUv;
          void main(){ float r = length(vUv); float w = fwidth(r)*1.5;
            float outer = smoothstep(0.022+w, 0.0, abs(r-uR));
            float inner = smoothstep(0.012+w, 0.0, abs(r-0.24))*0.55 + smoothstep(0.24,0.0,r)*0.10;
            float ticks = outer * 0.0;
            vec3 c = mix(uColor, vec3(1.0), uHot*0.7);
            gl_FragColor = vec4(c*(outer*(1.2+uHot*2.5) + inner*(0.6+uHot*1.6))*uA, 1.0); }`,
      }));
      ring.visible = false; ring.frustumCulled = false; ring.renderOrder = 8; app.scene.add(ring);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      head.visible = false; head.renderOrder = 6; app.scene.add(head);
      this.items.push({ live: false, beam, ring, head, S: new THREE.Vector3(), T: new THREE.Vector3(), pos: new THREE.Vector3(), prev: new THREE.Vector3(), color: new THREE.Color(), light: new THREE.Vector3() });
    }
  }
  get incoming() { return this.items.filter((b) => b.live && b.state === 'in'); }

  // fire from world S toward world T, arriving after dur seconds
  fire(enemy, S, T, dur, { size = 1, delay = 0 } = {}) {
    const b = this.items.find((x) => !x.live); if (!b) return null;
    Object.assign(b, { live: true, state: 'in', enemy, t: -delay, dur, size, done: false, perfect: false });
    b.S.copy(S); b.T.copy(T); b.pos.copy(S); b.prev.copy(S); b.color.copy(enemy.color);
    b.beam.material.uniforms.uColor.value.copy(b.color);
    b.beam.material.uniforms.uCore.value = 0.06 * size; b.beam.material.uniforms.uWidth.value = 0.7 * size;
    b.ring.material.uniforms.uColor.value.copy(b.color);
    b.ring.position.copy(T); b.ring.scale.setScalar(0.42);
    return b;
  }
  // send a bolt back (or spawn an echo) toward an enemy
  send(b, target, color, perfect) {
    b.state = 'out'; b.target = target; b.t = 0; b.perfect = perfect; b.color.copy(color);
    b.S.copy(b.pos); b.dur = clamp(b.pos.distanceTo(target.group.position) / (perfect ? 95 : 70), 0.16, 0.42);
    b.beam.material.uniforms.uColor.value.copy(color);
    b.beam.material.uniforms.uCore.value = perfect ? 0.075 : 0.055; b.beam.material.uniforms.uWidth.value = perfect ? 0.9 : 0.6;
    b.ring.visible = false;
  }
  echo(from, target, color) {
    const b = this.items.find((x) => !x.live); if (!b) return;
    Object.assign(b, { live: true, state: 'out', enemy: target, size: 1, done: false });
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
      b.head.visible = true;
      b.prev.copy(b.pos);
      const u = b.beam.material.uniforms;
      if (b.state === 'in') {
        const k = b.t / b.dur;
        b.pos.lerpVectors(b.S, b.T, k);
        _d.subVectors(b.T, b.S).normalize();
        u.uB.value.copy(b.pos); u.uA.value.copy(b.pos).addScaledVector(_d, -Math.min(1.8 * b.size, b.t * 14));
        u.uPower.value = 1.0;
        b.beam.visible = true;
        // approach ring: appears for the last ~1.1s, closes onto the target circle at impact
        const rem = b.dur - b.t;
        const ra = clamp((1.15 - rem) / 0.3) * clamp((rem + 0.12) / 0.05);
        b.ring.visible = ra > 0.01;
        if (b.ring.visible) {
          b.ring.quaternion.copy(cam.quaternion);
          const ru = b.ring.material.uniforms;
          ru.uR.value = lerp(0.24, 0.95, clamp(rem / 1.0));
          ru.uA.value = ra; ru.uHot.value = game.inWindow(b) ? 1 : 0;
        }
        app.env.light(b.light.copy(b.pos), b.color, 1.3 * b.size);
        b.head.position.copy(b.pos); b.head.scale.setScalar(1.15 * b.size); b.head.material.color.copy(b.color).multiplyScalar(2.2).addScalar(0.5);
        if (b.t > b.dur + 0.11) { game.onPlayerHit(b); this.kill(b); }
      } else {
        const tp = b.target.alive ? b.target.group.position : b.lastTarget || b.target.group.position;
        if (b.target.alive) (b.lastTarget = b.lastTarget || new THREE.Vector3()).copy(tp);
        const k = clamp(b.t / b.dur);
        b.pos.lerpVectors(b.S, tp, k * k * (3 - 2 * k) * 0.35 + k * 0.65);
        _d.subVectors(b.pos, b.prev); const l = _d.length(); if (l > 1e-4) _d.divideScalar(l);
        u.uB.value.copy(b.pos); u.uA.value.copy(b.pos).addScaledVector(_d, -Math.min(2.6, b.t * 60 + 0.3));
        u.uPower.value = b.perfect ? 1.8 : 1.3;
        b.beam.visible = true;
        app.env.light(b.light.copy(b.pos), b.color, b.perfect ? 3 : 2);
        b.head.position.copy(b.pos); b.head.scale.setScalar(b.perfect ? 2.2 : 1.5); b.head.material.color.copy(b.color).multiplyScalar(2.4).addScalar(0.6);
        if (k >= 1) { game.onReturnHit(b); this.kill(b); }
      }
    }
  }
}
