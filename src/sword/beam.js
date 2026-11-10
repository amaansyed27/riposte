// Camera-facing energy beam (used for the blade halo and for bolts): a capsule-distance glow on a billboard.
import * as THREE from 'three';
import { GLSL_NOISE } from '../core/util.js';

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
geo.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, 1, 1, -1, 1]), 2));
geo.setIndex([0, 1, 2, 0, 2, 3]);
export const beamGeometry = geo;

export function makeBeamMaterial({ width = 0.6, core = 0.012, white = 0, timeUniform } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    uniforms: {
      uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3(0, 1, 0) },
      uColor: { value: new THREE.Color(0.2, 0.6, 1) },
      uPower: { value: 1 }, uWidth: { value: width }, uCore: { value: core },
      uInstab: { value: 0 }, uTip: { value: 0 }, uWhite: { value: white }, uTime: timeUniform || { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uA,uB; uniform float uWidth; attribute vec2 aCorner; varying vec2 vP; varying float vLen;
      void main(){
        vec3 a = (viewMatrix*vec4(uA,1.0)).xyz, b = (viewMatrix*vec4(uB,1.0)).xyz;
        vec3 d = b-a; float len = length(d); vec3 dir = len>1e-5 ? d/len : vec3(0.0,1.0,0.0);
        vec3 toCam = normalize(-(a+b)*0.5);
        vec3 side = cross(dir,toCam); float sl = length(side); side = sl>1e-4 ? side/sl : vec3(1.0,0.0,0.0);
        float along = mix(-uWidth, len+uWidth, aCorner.y);
        vec3 p = a + dir*along + side*aCorner.x*uWidth;
        vP = vec2(along, aCorner.x*uWidth); vLen = len;
        gl_Position = projectionMatrix*vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uPower,uWidth,uCore,uInstab,uTip,uTime,uWhite; varying vec2 vP; varying float vLen;
      ${GLSL_NOISE}
      void main(){
        float x = clamp(vP.x, 0.0, vLen);
        float d = length(vec2(vP.x-x, vP.y));
        float t = vP.x/max(vLen,1e-3);
        float n = vnoise(vec2(vP.x*38.0 - uTime*46.0, uTime*9.0));
        float n2 = vnoise(vec2(vP.x*7.0 - uTime*13.0, 3.0));
        float rc = uCore*max(0.3, 1.0 + uInstab*(n-0.5)*1.6 + 0.10*(n2-0.5));
        float mid = pow(rc*2.0/(d+rc*2.0), 2.3);
        float wide = exp(-d/(uWidth*0.20));
        float edge = smoothstep(uWidth, uWidth*0.35, d);
        // plasma front at the tip while extending
        float tipD = length(vec2(vP.x - vLen, vP.y));
        float tip = uTip*(pow(rc*4.0/(tipD+rc*4.0), 2.2)*1.6 + exp(-tipD/(uWidth*0.12))*0.22);
        float pulse = 1.0 + 0.10*sin(vP.x*24.0 - uTime*30.0)*step(0.0,t)*step(t,1.0);
        vec3 col = uColor*(mid*1.15*pulse + wide*0.085 + tip);
        col += vec3(1.0)*tip*0.25;
        col += vec3(1.0)*exp(-pow(d/(rc*0.85), 2.0))*uWhite;
        gl_FragColor = vec4(col*uPower*edge*smoothstep(0.0,0.02,vLen), 1.0);
      }`,
  });
}

export function makeBeam(opts) {
  const m = new THREE.Mesh(beamGeometry, makeBeamMaterial(opts));
  m.frustumCulled = false;
  m.renderOrder = 5;
  return m;
}
