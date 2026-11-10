// RIPOSTE — boot, frame loop, camera feel, input, and the glue between systems.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Environment } from './gfx/env.js';
import { Post } from './gfx/post.js';
import { Sparks, Glows, Rings, Debris } from './fx/particles.js';
import { Sword, BLADE_LEN, COLORS } from './sword/sword.js';
import { Game } from './game/game.js';
import { Audio } from './audio/audio.js';
import { Hud } from './ui/hud.js';
import { clamp, damp, lerp, noise1, isTouch } from './core/util.js';

const canvas = document.getElementById('gl');
const params = new URLSearchParams(location.search);
const coarse = isTouch();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  if (!renderer.capabilities.isWebGL2) throw new Error('webgl2');
} catch (e) {
  document.getElementById('fallback').classList.remove('hidden');
  throw e;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.7;

const scene = new THREE.Scene();
const camRig = new THREE.Group();
camRig.position.set(0, 1.55, 0); camRig.rotation.x = 0.105;
const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 900);
camRig.add(camera); scene.add(camRig);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

const timeU = { value: 0 };
const app = {
  renderer, scene, camera, camRig, timeU, coarse,
  time: 0, size: { w: 1, h: 1 }, aspect: 1, pose: 'title', autoplay: false,
  camPos: new THREE.Vector3(0, 1.55, 0),
  trauma: 0, kickV: 0, fovPunch: 0, quality: 1,
  input: {
    ndc: { x: 0.12, y: -0.05 }, px: 0, py: 0, moved: false,
    set(nx, ny) { this.ndc.x = clamp(nx, -1.1, 1.1); this.ndc.y = clamp(ny, -1.1, 1.1); this.px = (this.ndc.x * 0.5 + 0.5) * app.size.w; this.py = (0.5 - this.ndc.y * 0.5) * app.size.h; },
  },
  addTrauma(x) { this.trauma = Math.min(1, this.trauma + x); },
  kick(x) { this.kickV += x; this.fovPunch += x * 1.6; },
  ndcToWorld(nx, ny, depth, out = new THREE.Vector3()) {
    const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return camRig.localToWorld(out.set(nx * th * this.aspect * depth, ny * th * depth, -depth));
  },
  project(p) {
    _p.copy(p).project(camera);
    return { x: (_p.x * 0.5 + 0.5) * this.size.w, y: (0.5 - _p.y * 0.5) * this.size.h, nx: _p.x, ny: _p.y };
  },
  bladeScreen() {
    const s = this.sword;
    _a.lerpVectors(s.A, s.Bfull, 0.14); const a = this.project(_a), b = this.project(s.Bfull);
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
  },
};
const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _r = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3();

app.env = new Environment(scene, { reflRes: 512, rainCount: coarse ? 1500 : 3000 });
app.fx = { sparks: new Sparks(scene, coarse ? 900 : 1600), glows: new Glows(scene), rings: new Rings(scene), debris: new Debris(scene, coarse ? 80 : 150) };
app.fx.debris.onSplash = (p) => { if (Math.random() < 0.35) app.env.ripple(p.x, p.z, 0.35); app.fx.sparks.burst(p, SPLASH, 3, 2.5, { dir: UP, spread: 0.8, life: 0.3, bright: 0.6 }); };
const SPLASH = new THREE.Color(0.5, 0.65, 0.9), UP = new THREE.Vector3(0, 1, 0);
app.post = new Post(renderer, scene, camera, { msaa: coarse ? 0 : 4 });
app.audio = new Audio();
app.hud = new Hud();
app.sword = new Sword({ scene, camera, env: app.env, fx: app.fx, timeUniform: timeU });
app.game = new Game(app);
app.env.onThunder = (d) => app.audio.thunder(d);

// ---------- sword events -> feel
app.sword.onEvent = (ev) => {
  const s = app.sword;
  if (ev === 'ignite-start') app.audio.ignite();
  if (ev === 'ignite-burst') {
    app.kick(1.4); app.addTrauma(0.22);
    app.env.ripple(0, -0.6, 1.5); app.env.courtPulse(0, 0, 1);
    const q = app.project(s.A); app.post.shock(q.x / app.size.w, 1 - q.y / app.size.h, 0.3, 1.3);
    if (navigator.vibrate) { try { navigator.vibrate(18); } catch {} }
  }
  if (ev === 'retract-start') app.audio.retract();
  if (ev === 'retract-done') { app.audio.retractSnap(); app.kick(-0.4); }
};

// ---------- colour
function setColor(name) {
  app.sword.setColor(name); app.hud.setBlade(name);
  try { localStorage.setItem('riposte.color', name); } catch {}
}
app.hud.onColor = (name) => { app.audio.unlock(); app.audio.ui(); setColor(name); };
let saved = 'azure'; try { saved = localStorage.getItem('riposte.color') || 'azure'; } catch {}
setColor(COLORS[saved] ? saved : 'azure');

// ---------- input
function pointer(e) {
  const r = canvas.getBoundingClientRect();
  app.input.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  app.input.moved = true;
}
canvas.addEventListener('pointermove', (e) => { for (const c of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) pointer(c); });
canvas.addEventListener('pointerdown', (e) => {
  app.audio.unlock();
  pointer(e);
  if (e.pointerType !== 'mouse') app.game.prevPtr = { x: app.input.px, y: app.input.py }; // a tap is not a swipe across the screen
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  app.game.primary();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); app.audio.unlock(); if (app.game.state === 'title' || app.game.state === 'play') app.sword.toggle(); }
  else if (e.code === 'Enter' && app.game.state === 'title') { app.audio.unlock(); app.game.primary(); }
  else if (e.code === 'KeyM') toggleSound();
  else if (e.code === 'Escape' || e.code === 'KeyP') app.game.togglePause();
});
function toggleSound() { const m = !app.audio.muted; app.audio.setMuted(m); app.hud.el.btnSound.classList.toggle('off', m); }
app.hud.el.btnSound.addEventListener('click', () => { app.audio.unlock(); toggleSound(); });
app.hud.el.btnPause.addEventListener('click', () => app.game.togglePause());
document.getElementById('resume').addEventListener('click', () => app.game.togglePause());
document.getElementById('again').addEventListener('click', () => { app.audio.unlock(); app.game.start(); });
document.getElementById('share').addEventListener('click', async () => {
  const text = app.game.shareText(), url = location.href.split('?')[0];
  if (navigator.share) { try { await navigator.share({ title: 'RIPOSTE', text, url }); return; } catch {} }
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
});
document.getElementById('copy').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText(`${app.game.shareText()}\n${location.href.split('?')[0]}`); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Copy failed'; }
  setTimeout(() => (e.target.textContent = 'Copy result'), 1600);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && app.game.state === 'play' && !app.game.paused) app.game.togglePause(); });

// ---------- sizing / quality
function resize() {
  const w = innerWidth, h = innerHeight;
  app.size.w = w; app.size.h = h; app.aspect = w / h;
  const pr = Math.min(devicePixelRatio || 1, coarse ? 1.6 : 2) * app.quality;
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  camera.aspect = app.aspect; camera.fov = app.aspect < 0.8 ? 74 : app.aspect < 1.2 ? 66 : 60; app.baseFov = camera.fov;
  camera.updateProjectionMatrix();
  app.post.setSize(w, h, pr);
  const rs = coarse ? 0.4 : 0.55;
  app.env.setReflectionSize(Math.round(w * pr * rs), Math.round(h * pr * rs));
  app.fx.glows.uScale.value = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  app.input.set(app.input.ndc.x, app.input.ndc.y);
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------- sword pose targets (camera space)
function poseTargets(dt) {
  const s = app.sword, t = app.time, portrait = app.aspect < 0.8;
  const th = Math.tan(THREE.MathUtils.degToRad(app.baseFov) / 2);
  const sway = (o) => (noise1(t * 0.5 + o) - 0.5);
  if (app.pose === 'title') {
    if (portrait) { _r.set(-0.03, -0.20, -0.78); _d.set(0.12, 0.72, -0.68); }
    else { _r.set(-0.20, -0.13, -0.62); _d.set(0.45, 0.50, -0.74); }
    _d.normalize(); _r.x += sway(1) * 0.03; _r.y += sway(2) * 0.03;
    _d.x += sway(3) * 0.06 + app.input.ndc.x * 0.05; _d.y += sway(4) * 0.03 + app.input.ndc.y * 0.03;
  } else if (app.pose === 'rest') {
    _r.set(portrait ? 0.12 : 0.36, -0.52, -1.15); _d.set(-0.42, 0.42, -0.80).normalize();
    _r.y += sway(2) * 0.03; _d.x += sway(3) * 0.05;
  } else {
    // play: the pointer rides the middle of the blade; the sword pivots from a point below the view
    const D = 1.5, px = app.input.ndc.x * th * app.aspect * D, py = app.input.ndc.y * th * D;
    _t.set(px, py, -D);
    _a.set(px * 0.30, -1.5, -0.28);
    _d.subVectors(_t, _a).normalize();
    // mouse: the cursor rides the lower blade. touch: the finger IS the hand, so the whole sword sits above it
    _r.copy(_t).addScaledVector(_d, coarse ? 0.24 : -0.30 * BLADE_LEN);
    _r.x += sway(1) * 0.012; _r.y += sway(2) * 0.012;
  }
  _d.normalize();
  _t.copy(_r).addScaledVector(_d, BLADE_LEN);
  s.setTargets(_r, _t);
}

// ---------- frame
let exposure = 1.5, manual = false, last = performance.now(), fpsAcc = 0, fpsN = 0, lowT = 0;
function frame(rdt, draw = true) {
  rdt = Math.min(rdt, 0.05);
  app.time += rdt; timeU.value = app.time;
  const g = app.game, gdt = rdt * g.timeScale;

  // camera feel: breathing sway, trauma shake, recoil kick, fov punch
  app.trauma = Math.max(0, app.trauma - rdt * 1.5);
  const sh = app.trauma * app.trauma, t = app.time;
  app.kickV = damp(app.kickV, 0, 9, rdt); app.fovPunch = damp(app.fovPunch, 0, 7, rdt);
  camera.position.set((noise1(t * 31) - 0.5) * sh * 0.09, (noise1(t * 29 + 7) - 0.5) * sh * 0.09 + Math.sin(t * 0.8) * 0.006, app.kickV * 0.035);
  camera.rotation.set((noise1(t * 27 + 3) - 0.5) * sh * 0.05 + app.kickV * 0.012, (noise1(t * 33 + 9) - 0.5) * sh * 0.05 + Math.sin(t * 0.33) * 0.004, (noise1(t * 25 + 5) - 0.5) * sh * 0.06);
  camera.fov = app.baseFov + app.fovPunch + (g.tempoLive > 0 ? -3 : 0);
  camera.updateProjectionMatrix();
  camRig.updateMatrixWorld(true);
  camera.getWorldPosition(app.camPos);

  poseTargets(rdt);
  app.sword.update(rdt, app.time);
  g.update(gdt, rdt);
  app.fx.sparks.update(gdt || rdt * 0.03); app.fx.glows.update(gdt || rdt * 0.03); app.fx.rings.update(gdt || rdt * 0.03, camera); app.fx.debris.update(gdt);
  app.env.update(gdt, app.time, rdt);

  // audio follows the blade
  app.audio.setHum(app.sword.power * clamp(app.sword.len * 2), app.sword.swing, app.sword.over);
  // eyes adapt: ignition blows out then settles; darkness slowly resolves after retraction
  const target = lerp(1.5, 0.95, clamp(app.sword.light));
  exposure = damp(exposure, target, target < exposure ? 7 : 0.55, rdt);
  renderer.toneMappingExposure = exposure;
  const pu = app.post.u;
  pu.uCA.value = 0.0012 + sh * 0.012 + Math.abs(app.kickV) * 0.0025 + (g.tempoLive > 0 ? 0.002 : 0);
  pu.uHit.value = g.hitFlash; pu.uDesat.value = damp(pu.uDesat.value, g.tempoLive > 0 ? 0.5 : g.state === 'dead' ? 0.7 : 0, 5, rdt);
  app.post.bloom.strength = 0.36 + (g.tempoLive > 0 ? 0.14 : 0) + Math.max(0, app.sword.power - 1) * 0.12;
  app.post.update(rdt, app.time);
  app.hud.setLit(clamp(app.sword.light * 0.9));
  if (draw) app.post.render();
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = (now - last) / 1000; last = now;
  if (manual) { app.post.render(); return; } // keep presenting the frozen frame so captures never stall
  frame(dt);
  // adaptive quality: if we can't hold ~45fps, shed pixels
  fpsAcc += dt; fpsN++;
  if (fpsN >= 45) {
    const avg = fpsAcc / fpsN; fpsAcc = 0; fpsN = 0;
    if (avg > 1 / 42 && !document.hidden) { lowT++; if (lowT >= 2 && app.quality > 0.55) { app.quality = Math.max(0.55, app.quality - 0.15); lowT = 0; resize(); } } else lowT = 0;
  }
}
requestAnimationFrame(loop);

// ---------- debug / capture harness (used by automated critics; harmless in production)
window.__riposte = {
  app,
  manual(on = true) { manual = on; last = performance.now(); return manual; },
  step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) frame(dt, i === n - 1); return { t: +app.time.toFixed(3), state: app.sword.state, len: +app.sword.len.toFixed(3), power: +app.sword.power.toFixed(2), game: app.game.state }; },
  ignite: () => app.sword.ignite(), retract: () => app.sword.retract(),
  start: () => { app.audio.unlock(); app.game.start(); },
  autoplay(on = true) { app.autoplay = on; return on; },
  // render the current state and save the WebGL frame to .shots/<name>.jpg (dev server only)
  async snap(name, width = 960) {
    app.post.render();
    const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * canvas.height / canvas.width);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    await fetch('/__shot?name=' + name, { method: 'POST', body: blob });
    return name;
  },
  // step n frames then snap; returns state
  async stepSnap(name, n = 1, dt = 1 / 60) { const st = this.step(dt, n); await this.snap(name); return st; },
  pointer(nx, ny) { app.input.set(nx, ny); },
  color: setColor,
  info: () => ({ state: app.game.state, bout: app.game.bout, score: app.game.score, combo: app.game.combo, integrity: app.game.integrity, enemies: app.game.enemies.length, bolts: app.game.bolts.incoming.length, sword: app.sword.state, quality: app.quality, fps: 0 }),
};
if (params.has('autoplay')) app.autoplay = true;
