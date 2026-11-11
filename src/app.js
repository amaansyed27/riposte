// RIPOSTE — boot, frame loop, camera feel, input, and the glue between systems.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Environment } from './gfx/env.js';
import { Post } from './gfx/post.js';
import { Sparks, Glows, Rings, Debris } from './fx/particles.js';
import { Sword, BLADE_LEN, COLORS } from './sword/sword.js';
import { Game } from './game/game.js';
import { Enemy, TYPES } from './game/enemies.js';
import { runBoot } from './boot/boot.js';
import { ROMAN } from './ui/hud.js';
import { Audio } from './audio/audio.js';
import { Hud } from './ui/hud.js';
import { Gamepads } from './input/gamepad.js';
import { Remote } from './input/remote.js';
import { Nav } from './ui/nav.js';
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
  trauma: 0, kickV: 0, fovPunch: 0, quality: 1, hand: { on: false, x: 0, y: 0 },
  input: {
    ndc: { x: 0.12, y: -0.05 }, px: 0, py: 0, moved: false, roll: 0, rollT: -9,
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
  // distance in front of the camera
  depth(p) { return -_p.copy(p).applyMatrix4(camera.matrixWorldInverse).z; },
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

// ---------- small real-time scheduler (runs inside the frame so the debug stepper stays deterministic)
const laters = [];
app.later = (sec, fn) => laters.push({ t: sec, fn });

// ---------- controllers
const $ = (id) => document.getElementById(id);
const pads = new Gamepads(app, {
  onConfirm: () => { nav.setPad(true); confirm(); }, onPause: () => app.game.togglePause(),
  onNav: (d, side) => { nav.setPad(true); if (side) nav.side(d); else nav.move(d); }, onBack: () => { nav.setPad(true); back(); }, onHold: (on) => { roll.fast = on; },
  onStatus: (t, ok) => { const el = $('padStatus'); el.textContent = t; el.classList.toggle('ok', !!ok); },
});
const remote = new Remote(app, {
  onButton: (k) => { if (k === 'confirm') confirm(); else if (k === 'pause') app.game.togglePause(); },
  onStatus: (t, ok) => { const el = $('pairStatus'); el.textContent = t; el.style.color = ok ? '#7dffb0' : ''; },
});
// one haptic vocabulary for every device: phone vibration, gamepad rumble, paired phone
const HAPTIC = { return: [10, 0.25, 0.5, 60], riposte: [24, 0.7, 0.9, 110], kill: [16, 0.5, 0.4, 120], boss: [[40, 30, 80], 1, 1, 420], hit: [[60, 40, 90], 1, 0.6, 320], ignite: [18, 0.4, 0.8, 160] };
app.feedback = (k) => {
  const h = HAPTIC[k]; if (!h) return;
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) { try { navigator.vibrate(h[0]); } catch {} }
  pads.rumble(h[1], h[2], h[3]);
  remote.send({ t: 'f', k });
};
// device tilt leans the camera (phones); needs a tap to grant on iOS
const motion = { on: false, x: 0, y: 0, tx: 0, ty: 0, b0: null, g0: null, aim: false, raw: { b: 0, g: 0 } };
async function enableMotion() {
  try {
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('No motion sensor here');
    if (DeviceOrientationEvent.requestPermission && (await DeviceOrientationEvent.requestPermission()) !== 'granted') throw new Error('Permission denied');
    if (!motion.on) addEventListener('deviceorientation', (e) => {
      if (e.gamma == null) return;
      motion.raw.b = e.beta; motion.raw.g = e.gamma;
      if (motion.b0 == null) { motion.b0 = e.beta; motion.g0 = e.gamma; }
      if (motion.aim) {
        // tilt-to-aim: the phone is the hilt. ±20° of roll and pitch sweep the whole screen
        app.input.set(clamp((e.gamma - motion.g0) / 20, -1.1, 1.1), clamp(-(e.beta - motion.b0) / 18, -1.1, 1.1));
        motion.tx = motion.ty = 0;
      } else {
        motion.gl = motion.gl ?? e.gamma; motion.bl = motion.bl ?? e.beta;
        motion.gl += (e.gamma - motion.gl) * 0.012; motion.bl += (e.beta - motion.bl) * 0.012;      // baseline follows your grip
        motion.tx = clamp((e.gamma - motion.gl) / 18, -1, 1); motion.ty = clamp((e.beta - motion.bl) / 18, -1, 1);
      }
    });
    motion.on = true;
    return true;
  } catch (e) { return e.message || 'Unavailable'; }
}

// ---------- sword events -> feel
app.sword.onEvent = (ev) => {
  const s = app.sword;
  if (ev === 'ignite-start') { app.audio.ignite(); remote.send({ t: 'blade', on: true }); }
  if (ev === 'ignite-burst') {
    app.kick(1.4); app.addTrauma(0.22);
    app.env.ripple(0, -0.6, 1.5); app.env.courtPulse(0, 0, 1);
    const q = app.project(s.A); app.post.shock(q.x / app.size.w, 1 - q.y / app.size.h, 0.3, 1.3);
    app.feedback('ignite');
  }
  if (ev === 'retract-start') { app.audio.retract(); remote.send({ t: 'blade', on: false }); }
  if (ev === 'retract-done') { app.audio.retractSnap(); app.kick(-0.4); }
};

// ---------- colour: choosing a blade sheathes it and re-ignites in the new colour
function setColor(name) {
  app.sword.setColor(name); app.hud.setBlade(name); remote.send({ t: 'color', color: name });
  try { localStorage.setItem('riposte.color', name); } catch {}
}
let recolor = 0;
app.hud.onColor = (name) => {
  if (name === app.sword.colorName) return;
  app.audio.unlock(); app.audio.ui(); app.hud.setBlade(name);
  const id = ++recolor;
  if (app.sword.isOn) { app.sword.retract(); app.later(0.42, () => { if (id !== recolor) return; setColor(name); if (app.hud.current === 'select') app.sword.ignite(); }); }
  else { setColor(name); if (app.hud.current === 'select') app.sword.ignite(); }
};
let saved = 'azure'; try { saved = localStorage.getItem('riposte.color') || 'azure'; } catch {}
setColor(COLORS[saved] ? saved : 'azure');
app.hud.setBest(app.game.best);

// ---------- pages
let leaving = false;
function toSelect(resume = false) {
  if (leaving) return;
  app.audio.unlock();
  if (coarse && !motion.on) enableMotion();       // tilt effects on phones; silently skipped if refused
  // the first click IS the ignition: the blade lights in your hand on the opening page, then the page turns
  leaving = true; app.pose = 'title'; app.sword.ignite(); $('intro').classList.add('out'); app.audio.music('select'); app.audio.accent('ignite');
  app.later(1.15, () => { leaving = false; $('intro').classList.remove('out'); if (app.hud.current !== 'intro') return; if (resume === true && app.game.saved()) app.game.start(true); else app.hud.screen('select'); });
}
function toIntro() { recolor++; app.audio.ui(); app.audio.music('menu'); app.sword.retract(); app.hud.screen('intro'); app.pose = 'title'; }
// "the obvious next thing": used by Enter, gamepad A and the paired phone
function confirm() {
  app.audio.unlock();
  if (app.hud.current === 'credits') { if (nav.sel && nav.sel.id === 'btnCreditsClose') closeCredits(); else toggleRoll(); return; }
  if (app.hud.current) { if (!nav.activate()) nav.sync(); return; }
  if (app.game.state === 'play') app.sword.toggle();
}
// "take me back one step", wherever you are
function back() {
  const c = app.hud.current;
  if (c === 'credits') closeCredits(); else if (c === 'controls' || c === 'select') toIntro();
  else if (c === 'paused') app.game.togglePause(); else if (c === 'end') app.game.home();
  else if (!c) app.game.togglePause();
}
// every screen change: cursor back, one item selected, the right hints
const nav = new Nav(app);
const _screen = app.hud.screen.bind(app.hud);
app.hud.screen = (name) => { _screen(name); document.body.classList.toggle('menu', !!name); nav.sync(); };

// ---------- rolling credits: scrolls over the court to the theme; pause, hold to hurry, back out any time
const roll = { y: 0, paused: false, fast: false, el: $('roll') };
function openCredits() { app.audio.unlock(); app.audio.ui(); roll.y = innerHeight * 0.92; roll.paused = false; roll.fast = false; $('credits').classList.remove('paused'); $('btnRollPause').textContent = 'Pause'; app.pose = 'away'; app.hud.screen('credits'); app.audio.music('credits'); roll.el.style.transform = 'translate3d(0,' + roll.y + 'px,0)'; }
function closeCredits() { app.audio.ui(); app.audio.muffle(false); app.pose = 'title'; app.sword.snapPose(); app.hud.screen('intro'); app.audio.music('menu'); }
function toggleRoll() { roll.paused = !roll.paused; $('credits').classList.toggle('paused', roll.paused); $('btnRollPause').textContent = roll.paused ? 'Resume' : 'Pause'; app.audio.muffle(roll.paused); }
$('btnRollPause').addEventListener('click', toggleRoll);
$('credits').addEventListener('pointerdown', (e) => { if (!e.target.closest('button, a')) roll.fast = true; });
addEventListener('pointerup', () => { roll.fast = false; });
$('btnPlay').addEventListener('click', () => toSelect(false));
$('btnContinue').addEventListener('click', () => toSelect(true));
// the menu offers Continue when a run is saved
app.refreshMenu = () => {
  const sv = app.game.saved();
  $('btnContinue').classList.toggle('hidden', !sv); if (sv) $('btnContinue').textContent = 'Continue · Bout ' + ROMAN(sv.bout);
  $('btnPlay').textContent = sv ? 'New run' : 'Play'; $('btnPlay').classList.toggle('primary', !sv); $('btnPlay').classList.toggle('big', !sv);
  app.hud.setBest(app.game.best);
};
$('btnBack').addEventListener('click', toIntro);
$('btnEnter').addEventListener('click', () => { app.audio.unlock(); app.game.start(); });
$('btnControls').addEventListener('click', () => { app.audio.unlock(); app.audio.ui(); app.hud.screen('controls'); });
$('btnCtlClose').addEventListener('click', () => { app.audio.ui(); app.hud.screen('intro'); });
$('btnCredits').addEventListener('click', openCredits);
$('btnCreditsClose').addEventListener('click', closeCredits);
for (const [id, kind] of [['volMusic', 'music'], ['volSfx', 'sfx']]) { const el = $(id); el.value = Math.round(app.audio.vol[kind] * 100); el.addEventListener('input', () => { app.audio.unlock(); app.audio.setVol(kind, el.value / 100); if (kind === 'sfx') app.audio.tick(); }); }
$('btnPhone').addEventListener('click', async () => {
  $('pairBox').classList.remove('hidden');
  try { $('pairUrl').textContent = await remote.start($('qr')); } catch (e) { $('pairStatus').textContent = 'Could not start pairing: ' + (e.message || e); }
});
$('btnGyro').addEventListener('click', async (e) => {
  try { e.target.textContent = await pads.enableGyro(); e.target.disabled = true; } catch (err) { e.target.textContent = 'Unavailable'; $('gyroRow').querySelector('span').textContent = err.message || String(err); }
});
async function setAim(tilt) {
  if (tilt) { const r = await enableMotion(); if (r !== true) { $('btnAim').textContent = 'Tilt unavailable: ' + r; $('btnMotion').textContent = r; return; } motion.b0 = motion.raw.b; motion.g0 = motion.raw.g; }
  motion.aim = tilt; $('btnAim').textContent = tilt ? 'Aim: tilt (tap to recentre / switch)' : 'Aim: touch'; $('btnMotion').textContent = tilt ? 'On' : 'Enable';
  try { localStorage.setItem('riposte.aim', tilt ? 'tilt' : 'touch'); } catch {}
}
$('btnMotion').addEventListener('click', () => setAim(!motion.aim));
$('btnAim').addEventListener('click', () => setAim(!motion.aim));
$('btnSaber').addEventListener('click', () => { app.audio.unlock(); app.audio.ui(); app.hud.screen('controls'); $('btnPhone').click(); });
if (!navigator.hid) $('gyroRow').classList.add('hidden');
if (!coarse) $('motionRow').classList.add('hidden');

// ---------- input
function pointer(e) {
  if (motion.aim && e.pointerType !== 'mouse') { if (e.type === 'pointerdown') { motion.b0 = motion.raw.b; motion.g0 = motion.raw.g; } return; }   // tilt mode: a tap recentres
  const r = canvas.getBoundingClientRect();
  app.input.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  app.input.moved = true; pads.active = false;
}
// some browsers hand back an empty coalesced list; never drop the move itself
canvas.addEventListener('pointermove', (e) => { const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null; if (list && list.length) for (const c of list) pointer(c); else pointer(e); });
canvas.addEventListener('pointerdown', (e) => {
  app.audio.unlock();
  pointer(e);
  // a sheathed blade in the middle of a bout is almost always an accident: any click or tap lights it again
  if (app.game.state === 'play' && !app.game.paused && app.sword.state === 'off') app.sword.ignite();
  try { canvas.setPointerCapture(e.pointerId); } catch {}
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  const c = app.hud.current, k = e.code;
  if (c === 'credits' && (k === 'ArrowDown' || k === 'KeyS')) { roll.fast = true; e.preventDefault(); return; }
  if (e.repeat && !(c && /^Arrow/.test(k))) return;
  if (document.getElementById('boot')) { if (k === 'KeyF') toggleFs(); return; }
  nav.setPad(false);
  if (c) {
    // menus: arrows or WASD move, Enter or Space confirm, Esc goes back
    if (k === 'ArrowUp' || k === 'KeyW') { e.preventDefault(); nav.move(-1); }
    else if (k === 'ArrowDown' || k === 'KeyS') { e.preventDefault(); nav.move(1); }
    else if (k === 'ArrowLeft' || k === 'KeyA') { e.preventDefault(); nav.side(-1); }
    else if (k === 'ArrowRight' || k === 'KeyD') { e.preventDefault(); nav.side(1); }
    else if (k === 'Enter' || k === 'Space') { e.preventDefault(); confirm(); }
    else if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); back(); }
    else if (k === 'KeyM') toggleSound(); else if (k === 'KeyF') toggleFs();
    return;
  }
  if (k === 'Space') { e.preventDefault(); app.audio.unlock(); if (app.game.state === 'play') app.sword.toggle(); }
  else if (k === 'KeyM') toggleSound();
  else if (k === 'KeyF') toggleFs();
  else if (k === 'KeyR') pads.recenter();
  else if (k === 'Escape' || k === 'KeyP') app.game.togglePause();
});
addEventListener('keyup', (e) => { if (e.code === 'ArrowDown' || e.code === 'KeyS') roll.fast = false; });
addEventListener('blur', () => { roll.fast = false; if (app.game.state === 'play' && !app.game.paused) app.game.togglePause(); });
// ---------- fullscreen (opening gate, menu, settings, corner icon, F)
const fsRoot = document.documentElement;
const canFs = !!(fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen);
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function toggleFs() {
  try {
    if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else { const p = (fsRoot.requestFullscreen || fsRoot.webkitRequestFullscreen).call(fsRoot, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); }
  } catch {}
}
function syncFs() {
  const on = isFs();
  $('btnFs').classList.toggle('on', on); $('btnFsMenu').textContent = on ? 'Exit fullscreen' : 'Fullscreen'; $('btnFsCtl').textContent = on ? 'Exit' : 'Enter';
  const b = $('bootFs'); if (b) b.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
}
for (const id of ['btnFs', 'btnFsMenu', 'btnFsCtl', 'bootFs']) { const el = $(id); if (!el) continue; if (!canFs) el.classList.add('hidden'); else el.addEventListener('click', (e) => { e.stopPropagation(); toggleFs(); }); }
if (!canFs) $('fsRow').classList.add('hidden');
document.addEventListener('fullscreenchange', syncFs); document.addEventListener('webkitfullscreenchange', syncFs);

// ---------- sound wake-up. Browsers keep audio silent until the page has been interacted with, so after a reload
// (when the opening and its "click to begin" are skipped) the first click, tap or key anywhere starts it.
const soundOk = () => !!(app.audio.ctx && app.audio.ctx.state === 'running');
function checkSound() { $('soundHint').classList.toggle('hidden', booting || soundOk() || app.audio.muted); }
function wake() { app.audio.unlock(); setTimeout(checkSound, 300); }
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, wake, { capture: true, passive: true });
app.audio.onState = () => checkSound();
document.addEventListener('visibilitychange', () => { if (!document.hidden && app.audio.ctx && app.audio.ctx.state === 'suspended') app.audio.ctx.resume().catch(() => {}); });
try { if (localStorage.getItem('riposte.mute')) { app.audio.muted = true; app.hud.el.btnSound.classList.add('off'); } } catch {}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); const fb = document.getElementById('fallback'); fb.textContent = 'The graphics context was lost. Reload the page to continue — your run is saved.'; fb.classList.remove('hidden'); });

function toggleSound() { const m = !app.audio.muted; app.audio.setMuted(m); app.hud.el.btnSound.classList.toggle('off', m); checkSound(); }
app.hud.el.btnSound.addEventListener('click', () => { app.audio.unlock(); toggleSound(); });
app.hud.el.btnPause.addEventListener('click', () => app.game.togglePause());
$('resume').addEventListener('click', () => app.game.togglePause());
$('again').addEventListener('click', () => { app.audio.unlock(); app.game.start(); });
$('homeEnd').addEventListener('click', () => app.game.home());
$('homePause').addEventListener('click', () => app.game.home());
$('share').addEventListener('click', async () => {
  const text = app.game.shareText(), url = location.href.split('?')[0];
  if (navigator.share) { try { await navigator.share({ title: 'RIPOSTE', text, url }); return; } catch {} }
  window.open('https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url), '_blank', 'noopener');
});
$('copy').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText(app.game.shareText() + '\n' + location.href.split('?')[0]); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Copy failed'; }
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
    if (portrait) { _r.set(-0.10, 0.16, -1.2); _d.set(0.24, 0.80, -0.55); }
    else { _r.set(0.24, -0.13, -0.62); _d.set(-0.45, 0.50, -0.74); }      // hilt at the right, menu at the left
    _d.normalize(); _r.x += sway(1) * 0.03; _r.y += sway(2) * 0.03;
    _d.x += sway(3) * 0.06 + app.input.ndc.x * 0.05; _d.y += sway(4) * 0.03 + app.input.ndc.y * 0.03;
  } else if (app.pose === 'away') {
    _r.set(0.25, -1.25, -0.9); _d.set(-0.2, 0.5, -0.84).normalize();
  } else if (app.pose === 'rest') {
    _r.set(portrait ? 0.12 : 0.36, -0.52, -1.15); _d.set(-0.42, 0.42, -0.80).normalize();
    _r.y += sway(2) * 0.03; _d.x += sway(3) * 0.05;
  } else {
    // play: your pointer is the blade; the hilt is towed behind it. Move sideways and the blade lies flat,
    // cut down and it tips over, circle and it spins. Hold still and it keeps the guard you left it in.
    const D = 1.5, px = app.input.ndc.x * th * app.aspect * D, py = app.input.ndc.y * th * D, R = 0.31;
    const hand = app.hand;
    if (!hand.on) { hand.on = true; hand.x = px; hand.y = py - R; }
    if (app.input.rollT > t - 0.4) {
      // gyro (phone as saber, DualSense): the blade takes the device's real roll
      const ang = app.input.roll; hand.x = px - Math.sin(ang) * R; hand.y = py - Math.cos(ang) * R;
    } else {
      let dx = px - hand.x, dy = py - hand.y; const dd = Math.hypot(dx, dy);
      if (dd > 1e-5) { hand.x = px - dx / dd * R; hand.y = py - dy / dd * R; }
    }
    _t.set(px, py, -D);
    _d.set((px - hand.x) / R, (py - hand.y) / R, -0.42).normalize();
    _r.copy(_t).addScaledVector(_d, -0.30 * BLADE_LEN);
    _r.x += sway(1) * 0.01; _r.y += sway(2) * 0.01;
  }
  if (app.pose !== 'play') app.hand.on = false;
  _d.normalize();
  _t.copy(_r).addScaledVector(_d, BLADE_LEN);
  s.setTargets(_r, _t);
}

// ---------- frame
let booting = true;
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

  for (const l of laters) l.t -= rdt;
  for (const l of laters.splice(0)) { if (l.t <= 0) l.fn(); else laters.push(l); }
  pads.update(rdt);
  // phone tilt leans the view a little
  motion.x = damp(motion.x, motion.tx, 5, rdt); motion.y = damp(motion.y, motion.ty, 5, rdt);
  // credits: the view lifts toward the eclipse while the roll climbs
  const inCredits = app.hud.current === 'credits';
  app.lift = damp(app.lift || 0, inCredits ? 1 : 0, 1.2, rdt);
  if (inCredits) {
    if (!roll.paused) roll.y -= rdt * (app.size.h / 13) * (roll.fast ? 5 : 1);
    roll.el.style.transform = 'translate3d(0,' + roll.y.toFixed(1) + 'px,0)';
    if (roll.y < -roll.el.offsetHeight) closeCredits();
  }
  camRig.rotation.set(0.105 + motion.y * 0.05 + app.lift * 0.14, -motion.x * 0.09, -motion.x * 0.03);
  poseTargets(rdt);
  app.sword.update(rdt, app.time);
  g.update(gdt, rdt);
  app.fx.sparks.update(gdt || rdt * 0.03); app.fx.glows.update(gdt || rdt * 0.03); app.fx.rings.update(gdt || rdt * 0.03, camera); app.fx.debris.update(gdt);
  app.env.update(gdt, app.time, rdt);

  // audio follows the blade
  app.audio.setHum(app.sword.power * clamp(app.sword.len * 2), app.sword.swing, app.sword.over);
  // eyes adapt: ignition blows out then settles; darkness slowly resolves after retraction
  const target = lerp(1.5, 1.15, clamp(app.sword.light));
  exposure = damp(exposure, target, target < exposure ? 7 : 0.55, rdt);
  renderer.toneMappingExposure = exposure;
  const pu = app.post.u;
  pu.uCA.value = 0.0012 + sh * 0.012 + Math.abs(app.kickV) * 0.0025 + (g.tempoLive > 0 ? 0.002 : 0);
  pu.uHit.value = g.hitFlash; pu.uDesat.value = damp(pu.uDesat.value, g.tempoLive > 0 ? 0.5 : g.state === 'dead' ? 0.7 : 0, 5, rdt);
  app.post.bloom.strength = 0.36 + (g.tempoLive > 0 ? 0.14 : 0) + Math.max(0, app.sword.power - 1) * 0.12;
  app.post.update(rdt, app.time);
  if (draw) app.post.render();
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = (now - last) / 1000; last = now;
  if (booting) return;                       // the opening sequence owns the main thread until everything is compiled
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
  // simulate without drawing until fn() is true (or max frames); returns frames advanced
  until(fn, max = 6000, dt = 1 / 60) { let i = 0; while (!fn() && i++ < max) frame(dt, false); return i; },
  ignite: () => app.sword.ignite(), retract: () => app.sword.retract(),
  start: () => { app.game.start(); },
  select: () => { app.sword.ignite(); app.hud.screen('select'); }, home: () => app.game.home(),
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

// ---------- boot: compile every shader and fetch every bed behind the opening sequence, reporting progress
async function preload(report) {
  // a frame, or 80 ms if the tab is in the background and frames are paused: loading must never stall
  const raf = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(go); setTimeout(go, 80); });
  const base = import.meta.env.BASE_URL;
  report(0.02, 0);
  try { await Promise.all([document.fonts.load('900 40px Cinzel'), document.fonts.load('40px Azonix')]); } catch {}
  report(0.07, 1); await raf();
  // one of every sentinel, parked out of sight, so each material variant exists before compiling
  const temp = []; const types = Object.keys(TYPES);
  for (let i = 0; i < types.length; i++) { const e = new Enemy(types[i], app); e.group.position.set(i * 4 - 12, 8, -30); temp.push(e); report(0.07 + 0.15 * ((i + 1) / types.length), 2); await raf(); }
  report(0.24, 3);
  try { await renderer.compileAsync(scene, camera); } catch (e) { console.warn('compileAsync', e); }
  report(0.56, 3); await raf();
  // a few real frames warm the reflection pass, the bloom chain and the lens pass
  for (let k = 0; k < 4; k++) { frame(1 / 60); report(0.56 + 0.035 * (k + 1), 3); await raf(); }
  for (const e of temp) e.dispose();
  report(0.7, 4);
  const beds = ['menu', 'calm', 'theme', 'battle', 'boss']; let n = 0;
  await Promise.all(beds.map((b) => fetch(base + 'audio/' + b + '.mp3').then((r) => r.arrayBuffer()).catch(() => {}).then(() => report(0.7 + 0.3 * (++n / beds.length), 4))));
}
app.onBootDone = () => {
  booting = false; last = performance.now(); app.refreshMenu(); app.hud.screen('intro'); app.audio.music('menu');
  // try to start sound straight away (allowed when the browser already trusts this page); otherwise the hint asks for a click
  app.audio.unlock(); setTimeout(checkSound, 500);
};
runBoot(app, preload);
