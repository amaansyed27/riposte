// Bolts: pooled energy shots. Each incoming bolt flies to a point on the blade's plane; a closing ring marks where and when.
import * as THREE from 'three';
import { makeBeam } from '../sword/beam.js';
import { clamp, lerp } from '../core/util.js';
import { glowTexture } from './enemies.js';

const _d = new THREE.Vector3();
export const RING_R = 0.30; // world radius of the ring quad at the strike plane

export class Bolts {
  constructor(app, n = 44) {
    this.app = app; this.items = [];
    const ringGeo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < n; i++) {
      const beam = makeBeam({ width: 0.55, core: 0.07, white: 0.5, timeUniform: app.timeU });
      beam.visible = false; app.scene.add(beam);
      const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false,
        uniforms: { uColor: { value: new THREE.Color() }, uR: { value: 1 }, uA: { value: 0 }, uHot: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uR,uA,uHot; varying vec2 vUv;
          void main(){ float r = length(vUv); float w = fwidth(r)*1.5;
            float ang = atan(vUv.y, vUv.x);
            float dash = smoothstep(0.30, 0.42, abs(fract(ang*8.0/6.2831853 + uR*1.5) - 0.5)*2.0);
            float outer = smoothstep(0.022+w, 0.0, abs(r-uR)) * mix(1.0, dash, 0.85*(1.0-uHot));
            float inner = smoothstep(0.012+w, 0.0, abs(r-0.24))*0.7 + smoothstep(0.24,0.0,r)*0.10 + smoothstep(0.035+w, 0.015, r)*0.9;
            vec3 c = mix(uColor, vec3(1.0), uHot*0.7);
            gl_FragColor = vec4(c*(outer*(1.2+uHot*2.5) + inner*(0.6+uHot*1.6))*uA, 1.0); }`,
      }));
      ring.visible = false; ring.frustumCulled = false; ring.renderOrder = 8; app.scene.add(ring);
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      head.visible = false; head.renderOrder = 6; app.scene.add(head);
      this.items.push({ live: false, beam, ring, head, S: new THREE.Vector3(), T: new THREE.Vector3(), pos: new THREE.Vector3(), prev: new THREE.Vector3(), color: new THREE.Color(), light: new THREE.Vector3(), last: new THREE.Vector3() });
    }
  }
  get incoming() { return this.items.filter((b) => b.live && b.state === 'in'); }

  fire(enemy, S, T, dur, { size = 1, delay = 0 } = {}) {
    const b = this.items.find((x) => !x.live); if (!b) return null;
    Object.assign(b, { live: true, state: 'in', enemy, t: -delay, dur, size, done: false, strong: false });
    b.S.copy(S); b.T.copy(T); b.pos.copy(S); b.prev.copy(S); b.color.copy(enemy.color);
    b.beam.material.uniforms.uColor.value.copy(b.color);
    b.beam.material.uniforms.uCore.value = 0.07 * size; b.beam.material.uniforms.uWidth.value = 0.55 * size;
    b.ring.material.uniforms.uColor.value.copy(b.color);
    b.ring.position.copy(T); b.ring.scale.setScalar(RING_R * Math.sqrt(size));
    return b;
  }
  // send a bolt back toward an enemy, starting from where the blade met it
  send(b, target, color, strong) {
    b.state = 'out'; b.target = target; b.t = 0; b.strong = strong; b.color.copy(color);
    b.S.copy(b.pos); b.last.copy(target.group.position);
    b.dur = clamp(b.pos.distanceTo(target.group.position) / (strong ? 80 : 55), 0.18, 0.45);
    b.beam.material.uniforms.uColor.value.copy(color);
    b.beam.material.uniforms.uCore.value = strong ? 0.075 : 0.055; b.beam.material.uniforms.uWidth.value = strong ? 0.9 : 0.6;
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
      b.head.visible = true; b.beam.visible = true;
      b.prev.copy(b.pos);
      const u = b.beam.material.uniforms;
      if (b.state === 'in') {
        b.pos.lerpVectors(b.S, b.T, b.t / b.dur);
        _d.subVectors(b.T, b.S).normalize();
        u.uB.value.copy(b.pos); u.uA.value.copy(b.pos).addScaledVector(_d, -Math.min(0.55 * b.size, b.t * 14));
        u.uPower.value = 0.8 + 0.25 * Math.sin(b.t * 40);
        const rem = b.dur - b.t;
        const ra = clamp((1.15 - rem) / 0.3) * clamp((rem + 0.12) / 0.05);
        b.ring.visible = ra > 0.01;
        if (b.ring.visible) {
          b.ring.quaternion.copy(cam.quaternion);
          const ru = b.ring.material.uniforms;
          ru.uR.value = lerp(0.24, 0.95, clamp(rem / 1.0));
          ru.uA.value = ra; ru.uHot.value = rem < 0.16 ? 1 : 0;
        }
        app.env.light(b.light.copy(b.pos), b.color, 1.3 * b.size);
        b.head.position.copy(b.pos); b.head.scale.setScalar((1.25 + 0.2 * Math.sin(b.t * 40)) * b.size); b.head.material.color.copy(b.color).multiplyScalar(2.6).addScalar(0.25);
        if (b.t > b.dur + 0.10) { game.onPlayerHit(b); this.kill(b); }
      } else {
        if (b.target.alive) b.last.copy(b.target.group.position);
        const k = clamp(b.t / b.dur);
        b.pos.lerpVectors(b.S, b.last, k * k * (3 - 2 * k) * 0.35 + k * 0.65);
        _d.subVectors(b.pos, b.prev); const l = _d.length(); if (l > 1e-4) _d.divideScalar(l);
        u.uB.value.copy(b.pos); u.uA.value.copy(b.pos).addScaledVector(_d, -Math.min(2.6, b.t * 60 + 0.3));
        u.uPower.value = b.strong ? 1.8 : 1.3;
        app.env.light(b.light.copy(b.pos), b.color, b.strong ? 3 : 2);
        b.head.position.copy(b.pos); b.head.scale.setScalar(b.strong ? 1.9 : 1.3); b.head.material.color.copy(b.color).multiplyScalar(2.4).addScalar(0.6);
        if (k >= 1) { game.onReturnHit(b); this.kill(b); }
      }
    }
  }
}
