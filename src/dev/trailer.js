// Dev only (?trailer). Directs the trailer and captures it frame by frame, so it is 60 fps no matter how fast
// this machine renders. Nothing here ships: app.js only imports it under import.meta.env.DEV.
//   __trailer.still(id, t, name)  one composed frame of a shot, saved to .shots/trailer/p_<name>.jpg
//   __trailer.capture([ids])      every frame of the chosen shots (all if omitted) to .shots/trailer/f_#####.jpg
//   __trailer.audio()             renders the soundtrack offline from the recorded sound events + music cues
// Sound: while frames are captured, every call the game makes to its audio engine is written to a tape. The tape is
// then replayed into an OfflineAudioContext running the game's own synth and adaptive score, so the picture and the
// sound are the same events, sample-accurate.
import { lettering } from '../boot/boot.js';
import { Audio } from '../audio/audio.js';

const FPS = 60, W = 1920, H = 1080, BAR = 104;
const BEAT = 60 / 123.07, TB = 23.0, bar = (n) => TB + 0.028 + n * 4 * BEAT;      // the battle bed's grid
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };
const io = (t, a, b, c, d) => ss(a, b, t) * (1 - ss(c, d, t));
const mix = (a, b, k) => a + (b - a) * k;

let R, app, G, UI, cv, g, now = 0, rec = null, recF = 0, status = { state: 'idle' };
const img = {};

// ---------- deterministic randomness, so a shot can be re-captured and come out the same
let seedV = 1;
const rng = () => { let t = (seedV += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seed = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); seedV = h >>> 0; };

// ---------- drawing
function txt(s, x, y, { size = 40, weight = 300, family = UI, ls = 0.34, alpha = 1, color = '#fff', align = 'center', blur = 0, glow = null } = {}) {
  if (alpha <= 0.004) return;
  g.save(); g.globalAlpha = clamp(alpha); g.font = `${weight} ${size}px ${family}`; g.letterSpacing = `${ls * size}px`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = color;
  if (blur > 0.3) g.filter = `blur(${blur.toFixed(1)}px)`;
  if (glow) { g.shadowColor = glow[0]; g.shadowBlur = glow[1]; }
  g.fillText(s, x + (align === 'center' ? ls * size / 2 : 0), y); g.restore();
}
// a line that gathers: wide and soft, then tight and sharp; leaves by fading
function line(s, x, y, t, t0, t1, o = {}) {
  const a = io(t, t0, t0 + 0.8, t1 - 0.55, t1), k = 1 - ss(t0, t0 + 1.5, t);
  txt(s, x, y, { glow: ['rgba(0,0,0,.9)', 18], ...o, ls: (o.ls ?? 0.34) + 0.2 * k, alpha: a * (o.alpha ?? 1), blur: 9 * k });
}
const shade = (a, c = '0,0,0') => { if (a <= 0.004) return; g.save(); g.fillStyle = `rgba(${c},${clamp(a)})`; g.fillRect(0, 0, W, H); g.restore(); };
function rule(x, y, w, a) { if (a <= 0.004) return; g.save(); const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0); gr.addColorStop(0, 'rgba(168,200,240,0)'); gr.addColorStop(0.5, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(168,200,240,0)'); g.fillStyle = gr; g.fillRect(x - w / 2, y, w, 1.5); g.restore(); }
const ROMAN = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'][n] || String(n);
// the game's HUD, redrawn from live game state (the real one is DOM and is not in the WebGL frame)
function hud(a = 1) {
  const c = `rgb(${app.sword.baseColor.r * 255 | 0},${app.sword.baseColor.g * 255 | 0},${app.sword.baseColor.b * 255 | 0})`;
  txt(G.score.toLocaleString('en-US'), W / 2, BAR + 58, { size: 54, weight: 200, ls: 0.06, alpha: a, glow: ['rgba(0,0,0,.8)', 12] });
  if (G.combo > 1) txt(`×${G.mult}   ${G.combo} RETURNED IN A ROW`, W / 2, BAR + 106, { size: 15, weight: 600, ls: 0.3, alpha: a * 0.85 });
  txt('GUARD', 92, BAR + 40, { size: 13, weight: 600, ls: 0.4, alpha: a * 0.7, align: 'left' });
  for (let i = 0; i < 3; i++) { g.save(); g.globalAlpha = a * (i < G.integrity ? 1 : 0.2); g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 14; g.beginPath(); const x = 104 + i * 34, y = BAR + 72; g.moveTo(x - 11, y - 10); g.lineTo(x + 11, y - 10); g.lineTo(x + 11, y + 2); g.lineTo(x, y + 13); g.lineTo(x - 11, y + 2); g.closePath(); g.fill(); g.restore(); }
  txt(`BOUT ${ROMAN(G.bout)}`, 92, BAR + 112, { size: 15, weight: 600, ls: 0.4, alpha: a * 0.8, align: 'left' });
}
function lowerThird(name, sub, t, t0, t1, col = '255,255,255') {
  const a = io(t, t0, t0 + 0.5, t1 - 0.5, t1), k = 1 - ss(t0, t0 + 1.2, t), x = 150, y = H - BAR - 190;
  txt('A MASTER APPROACHES', x, y - 62, { size: 15, weight: 600, ls: 0.5 + 0.2 * k, alpha: a * 0.75, align: 'left' });
  txt(name, x - 4, y, { size: 92, weight: 200, ls: 0.24 + 0.14 * k, alpha: a, align: 'left', blur: 8 * k, glow: [`rgba(${col},.55)`, 30] });
  g.save(); g.globalAlpha = a; g.fillStyle = `rgb(${col})`; g.shadowColor = `rgb(${col})`; g.shadowBlur = 16; g.fillRect(x, y + 62, 420 * ss(t0 + 0.2, t0 + 1.1, t), 2); g.restore();
  txt(sub, x, y + 98, { size: 20, weight: 400, ls: 0.3, alpha: a * 0.85, align: 'left' });
}

// ---------- staging
const HOME = [0, 1.55, 0];
function resetCam() { app.cine = null; R.camRig.position.set(...HOME); R.camRig.rotation.set(0.105, 0, 0); app.baseFov = 60; }
function guard(s) { app.quality = 1; G.paused = false; if (R.canvas.width !== W || R.canvas.height !== H) app.resize(); if (!s || !s.storm) app.env.lightningT = Math.max(app.env.lightningT, 2); if (G.state === 'play') G.invuln = Math.max(G.invuln, 0.4); }
function sim(sec, s) { const n = Math.round(sec * FPS); for (let i = 0; i < n; i++) { guard(s); R.frame(1 / FPS, false); } }
function settle() { R.frame(1 / 2000, false); app.sword.snapPose(); R.frame(1 / 2000, false); }
function idle({ blade = false, pose = 'away', pre = 1.4 } = {}) {
  resetCam(); app.autoplay = false; G.clearField(); G.reset(); G.state = 'menu'; G.visitT = 1e9;
  app.env.setStreak(0); app.env.setMood(null); app.env.heart = false; app.sword.overTarget = 0; app.sword.setIntegrity(3);
  app.pose = pose; app.input.set(0.1, -0.05);
  if (blade && !app.sword.isOn) app.sword.ignite(); if (!blade && app.sword.isOn) app.sword.retract();
  sim(pre);
}
function bout(n, { color = 'verdant', bot = 'swing', pre = 1.6, score = 0, combo = 0 } = {}) {
  resetCam(); R.color(color); app.autoplay = false; app.pose = 'play';
  try { localStorage.setItem('riposte.tut', '1'); } catch {}
  G.start(); G.timers.length = 0; G.tut = 0; G.hold = false;
  G.beginBout(n); G.score = score; G.combo = combo; G.streak = combo; app.env.setStreak(combo);
  app.autoplay = bot; app.input.set(0.1, -0.1);
  if (typeof pre === 'function') { let i = 0; while (!pre() && i++ < 2400) { guard(); R.frame(1 / FPS, false); } } else sim(pre);
}
const cue = (name, ...a) => { if (rec) rec.push([recF, name, a]); };
const rig = (fn) => { app.cine = (r, c) => fn(r, c, now); };

// ---------- the film
const quote1 = ['THE BLADE ASKS NOTHING.', 'IT ONLY ANSWERS.'];
const SHOTS = [];
const shot = (id, t0, t1, def) => SHOTS.push({ id, t0, t1, f0: Math.round(t0 * FPS), f1: Math.round(t1 * FPS), dur: t1 - t0, ...def });

shot('dawn', 0, 4.4, {
  setup() { idle(); },
  over(t) {
    shade(1);
    const a = io(t, 0.5, 1.5, 3.3, 4.1), s = 250 * (0.94 + 0.06 * ss(0.4, 3.6, t));
    g.save(); g.globalAlpha = a; g.drawImage(img.dawn, W / 2 - s / 2, H / 2 - 190 - s / 2 + 60, s, s); g.restore();
    txt('DAWNLIGHT LABS', W / 2, H / 2 + 80, { size: 46, family: 'Azonix', weight: 400, ls: 0.16 + 0.1 * (1 - ss(0.5, 2.2, t)), alpha: a, color: '#eaf3ff' });
    txt('PRESENTS', W / 2, H / 2 + 150, { size: 17, weight: 400, ls: 0.8, alpha: io(t, 1.4, 2.2, 3.2, 4.0) * 0.75 });
  },
});
shot('court', 4.4, 9.2, {
  setup() { idle(); rig((r, c, t) => { const k = t / 4.8; r.position.set(0.0, mix(0.5, 0.78, k), mix(5.2, 2.6, k)); r.rotation.set(mix(0.10, 0.15, k), 0, 0); c.fov = 52; }); settle(); },
  over(t) { shade(1 - ss(0, 1.6, t)); line('IN THE MIRROR COURT', W / 2, H * 0.71, t, 1.2, 4.6, { size: 42, weight: 400, ls: 0.6 }); shade(ss(4.5, 4.8, t)); },
});
shot('storm', 9.2, 13.8, {
  storm: true,
  setup() { idle(); app.env.lightningT = 99; rig((r, c, t) => { const k = ss(0, 4.2, t); r.position.set(1.1, 1.05, -1.2); r.rotation.set(mix(-0.36, 0.2, k), mix(-0.1, -0.02, k), 0); c.fov = 46; }); settle(); },
  tick(t, i) { if (i === 96) app.env.lightningT = 0; },
  over(t) { shade(1 - ss(0, 0.5, t)); line('NO ONE IS ALLOWED TO STRIKE.', W / 2, H * 0.71, t, 1.5, 4.5, { size: 42, weight: 400, ls: 0.5 }); shade(ss(4.3, 4.6, t)); },
});
shot('hilt', 13.8, 17.2, {
  setup() { R.color('verdant'); app.poseFn = (r, d) => { const k = now / 3.4; r.set(mix(0.24, 0.10, k), -0.03, -0.46); d.set(1, mix(0.10, 0.05, k), mix(-0.06, -0.16, k)); }; idle({ pose: 'cine' }); settle(); },
  over(t) { shade(1 - ss(0, 0.9, t)); line('SO THEY LEARNED TO ANSWER.', W / 2, H * 0.75, t, 0.5, 3.3, { size: 42, weight: 400, ls: 0.5 }); shade(ss(3.1, 3.4, t)); },
});
shot('ignite', 17.2, 21.0, {
  setup() { R.color('verdant'); app.poseFn = (r, d) => { const k = ss(1.6, 3.8, now); r.set(mix(0.42, -0.06, k), -0.36, -1.5); d.set(mix(-0.56, 0.2, k), 0.82, -0.2); }; idle({ pose: 'cine' }); settle(); },
  tick(t, i) { if (i === 36) { app.sword.ignite(); cue('accent', 'ignite'); } },
  over(t) { shade(1 - ss(0, 0.5, t)); },
});
shot('cannot', 21.0, bar(0), {
  setup() { idle({ pre: 0.2 }); },
  over(t) { shade(1); const k = ss(0.05, 1.9, t); txt('YOU CANNOT STRIKE.', W / 2, H / 2, { size: 74 * (0.96 + 0.04 * k), weight: 300, ls: 0.5, alpha: ss(0.05, 0.3, t) }); },
});
{
  let slowT = -1, lastRet = 0;
  shot('first', bar(0), bar(2), {
    setup() { slowT = -1; bout(1, { color: 'verdant', bot: true, pre: () => { const b = G.bolts.incoming[0]; return G.clock > 2 && b && b.dur - b.t < 1.15; } }); lastRet = G.returned; },
    speed(t) { if (G.returned !== lastRet) { lastRet = G.returned; slowT = t + 0.3; } return G.bolts.incoming.some((b) => b.dur - b.t < 0.2) || t < slowT ? 0.28 : 1; },
    over(t) { shade(0.6 * (1 - ss(0, 0.14, t)), '255,255,255'); },
  });
}
shot('only', bar(2), bar(2) + 2 * BEAT, { setup() { idle({ pre: 0.1 }); }, over(t) { shade(1); txt('ONLY RETURN.', W / 2, H / 2, { size: 74, weight: 300, ls: 0.5, alpha: ss(0, 0.08, t) }); } });
const play = (id, t0, t1, n, o, extra = {}) => shot(id, t0, t1, { setup() { bout(n, o); }, over(t) { shade(0.45 * (1 - ss(0, 0.12, t)), '255,255,255'); hud(io(t, 0.0, 0.3, t1 - t0 - 0.2, t1 - t0)); }, ...extra });
play('azure', bar(2) + 2 * BEAT, bar(4), 3, { color: 'azure', pre: 5.0, score: 2350, combo: 7 });
play('violet', bar(4), bar(5), 5, { color: 'violet', pre: 6.2, score: 8120, combo: 12 });
play('ember', bar(5), bar(6), 6, { color: 'ember', pre: 5.4, score: 11480, combo: 16 });
play('blanc', bar(6), bar(7), 7, { color: 'blanc', pre: 6.6, score: 15900, combo: 21 });
shot('tempo', bar(7), bar(9), {
  setup() { bout(9, { color: 'verdant', pre: 6.0, score: 24300, combo: 26 }); G.startTempo(); sim(0.25); },
  tick() { G.tempoLive = Math.max(G.tempoLive, 2); },
  over(t) {
    shade(0.5); { const gr = g.createLinearGradient(0, H / 2 - 230, 0, H / 2 + 250); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.5, "rgba(0,0,0,.78)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, H / 2 - 230, W, 480); }
    line(quote1[0], W / 2, H / 2 - 44, t, 0.25, 3.7, { size: 52, weight: 300, ls: 0.42 });
    line(quote1[1], W / 2, H / 2 + 36, t, 1.0, 3.7, { size: 52, weight: 300, ls: 0.42 });
    line('— FIRST RULE OF THE COURT', W / 2, H / 2 + 118, t, 1.7, 3.7, { size: 16, weight: 600, ls: 0.5, alpha: 0.7 });
  },
});
play('cutA', bar(9), bar(9) + 2 * BEAT, 10, { color: 'azure', pre: 7.0, score: 31200, combo: 9 });
play('cutB', bar(9) + 2 * BEAT, bar(10), 10, { color: 'ember', pre: 9.5, score: 33950, combo: 14 });
play('storm2', bar(10), bar(12), 13, { color: 'verdant', pre: 8.0, score: 52700, combo: 31 }, { over(t) { shade(0.45 * (1 - ss(0, 0.12, t)), '255,255,255'); hud(io(t, 0, 0.3, 3.2, 3.6)); shade(ss(3.62, 3.9, t), '255,255,255'); } });
const BOSS = [['maestro', 4, 'THE MAESTRO', 'It conducts. You answer.', 'verdant'], ['hydra', 8, 'THE HYDRA', 'Cut the leashes. Then the heart.', 'azure'], ['bastion', 12, 'THE BASTION', 'Only a hard swing cracks it.', 'violet']];
const BT = [bar(12), 51.3, 56.1, 60.6];
BOSS.forEach(([id, n, name, sub, color], i) => shot(id, BT[i], BT[i + 1], {
  setup() { bout(n, { color, pre: i === 1 ? 1.2 : 0.7, score: [61400, 148200, 287600][i], combo: 0 }); },
  over(t) { shade(1 - ss(0, i ? 0.12 : 0.5, t), i ? '0,0,0' : '255,255,255'); const c = G.boss ? G.boss.color : null; lowerThird(name, sub, t, 0.7, BT[i + 1] - BT[i] - 0.1, c ? `${Math.min(255, c.r * 255 + 60) | 0},${Math.min(255, c.g * 255 + 60) | 0},${Math.min(255, c.b * 255 + 60) | 0}` : undefined); },
}));
{
  shot('kill', 60.6, 63.8, {
    setup() { bout(4, { color: 'verdant', bot: true, pre: 3.4, score: 61400, combo: 18 }); let k = 0; while (k++ < 1500 && !(G.boss && G.bolts.incoming.some((x) => x.dur - x.t < 0.55))) { if (G.boss) G.boss.hp = 1; guard(); R.frame(1 / FPS, false); } if (G.boss) G.boss.hp = 1; },
    tick(t) { if (t > 1.9 && G.boss && G.boss.alive && G.boss.hp > 0) G.kill(G.boss, true); },
    over(t) { shade(1 - ss(0, 0.12, t)); shade(ss(2.75, 3.2, t), '255,255,255'); },
  });
}
shot('title', 63.8, 70.0, {
  setup() { R.color('verdant'); app.poseFn = (r, d) => { r.set(0.62, -0.5, -1.45); d.set(-0.06 + Math.sin(now * 0.7) * 0.02, 1, -0.22); }; idle({ blade: true, pose: 'cine', pre: 2.2 }); rig((r, c, t) => { r.position.set(0, 1.55, mix(0.5, 0, ss(0, 6.2, t))); r.rotation.set(0.105, 0.22, 0); c.fov = 60; }); settle(); },
  over(t) {
    shade(1 - ss(0, 1.3, t), '255,255,255');
    const a = ss(0.25, 1.5, t), k = 1 - ss(0.25, 2.4, t), x = W * 0.36, y = H * 0.47;
    const o = img.word, wg = o.getContext('2d'), size = 150, ls = 0.44 + 0.16 * k;
    wg.clearRect(0, 0, o.width, o.height); wg.font = `200 ${size}px ${UI}`; wg.letterSpacing = `${ls * size}px`; wg.textAlign = 'center'; wg.textBaseline = 'middle'; wg.fillStyle = '#fff';
    wg.globalCompositeOperation = 'source-over'; wg.fillText('RIPOSTE', o.width / 2 + ls * size / 2, o.height / 2);
    wg.globalCompositeOperation = 'destination-out'; wg.lineWidth = 5; wg.beginPath(); wg.moveTo(0, o.height / 2 + 34); wg.lineTo(o.width, o.height / 2 - 22); wg.stroke();
    g.save(); g.globalAlpha = a; if (k > 0.03) g.filter = `blur(${(10 * k).toFixed(1)}px)`; g.shadowColor = 'rgba(70,255,140,.75)'; g.shadowBlur = 44; g.drawImage(o, x - o.width / 2, y - o.height / 2); g.restore();
    g.save(); g.globalAlpha = a * 0.13; g.translate(0, 2 * y + 150); g.scale(1, -1); g.filter = 'blur(3px)'; g.drawImage(o, x - o.width / 2, y - o.height / 2); g.restore();
    line('YOU CANNOT STRIKE.   ONLY RETURN.', x, y + 128, t, 1.7, 6.6, { size: 22, weight: 400, ls: 0.6 });
    shade(ss(5.8, 6.2, t));
  },
});
shot('ways', 70.0, 74.4, {
  setup() { bout(6, { color: 'azure', pre: 7.4, score: 12600, combo: 11 }); },
  over(t) {
    shade(1 - ss(0, 0.4, t)); shade(0.68);
    txt('PLAY IT WITH', W / 2, H / 2 - 82, { size: 16, weight: 600, ls: 0.6, alpha: io(t, 0.2, 0.8, 3.9, 4.3) * 0.75 });
    line('MOUSE  ·  TOUCH  ·  GAMEPAD', W / 2, H / 2, t, 0.3, 2.3, { size: 48, weight: 300, ls: 0.4 });
    line('OR YOUR PHONE AS THE HILT', W / 2, H / 2, t, 2.2, 4.3, { size: 48, weight: 300, ls: 0.4 });
    shade(ss(4.1, 4.4, t));
  },
});
shot('name', 74.4, 78.6, {
  setup() { idle({ pre: 0.1 }); },
  over(t) {
    shade(1);
    const a = io(t, 0.3, 1.5, 3.5, 4.1), k = 1 - ss(0.3, 2.0, t), w = 900 * (1 + 0.3 * k) * (1 + 0.012 * t), h = 900 / img.nameAr, o = img.nameCv, og = o.getContext('2d');
    og.globalCompositeOperation = 'source-over'; og.clearRect(0, 0, o.width, o.height); og.drawImage(img.name, 0, 0, o.width, o.height);
    og.globalCompositeOperation = 'source-in'; const gr = og.createLinearGradient(0, 0, 0, o.height); gr.addColorStop(0, '#fff'); gr.addColorStop(0.38, '#e9f0fa'); gr.addColorStop(0.55, '#9fb1cb'); gr.addColorStop(0.7, '#c9d6e9'); gr.addColorStop(1, '#f3f7fd'); og.fillStyle = gr; og.fillRect(0, 0, o.width, o.height);
    og.globalCompositeOperation = 'source-atop'; const sx = mix(-0.3, 1.3, ss(1.6, 3.0, t)) * o.width, sw = og.createLinearGradient(sx - 90, 0, sx + 90, 0); sw.addColorStop(0, 'rgba(255,255,255,0)'); sw.addColorStop(0.5, '#fff'); sw.addColorStop(1, 'rgba(255,255,255,0)'); og.fillStyle = sw; og.fillRect(0, 0, o.width, o.height);
    txt('A GAME BY', W / 2, H / 2 - 128, { size: 16, weight: 400, ls: 0.7 + 0.3 * k, alpha: io(t, 0.2, 1.0, 3.5, 4.1) * 0.7 });
    rule(W / 2, H / 2 - 84, 620 * ss(0.4, 1.8, t), a * 0.9); rule(W / 2, H / 2 + 84, 620 * ss(0.4, 1.8, t), a * 0.9);
    g.save(); g.globalAlpha = a; if (k > 0.03) g.filter = `blur(${(14 * k).toFixed(1)}px)`; g.shadowColor = 'rgba(110,170,255,.5)'; g.shadowBlur = 30; g.drawImage(o, W / 2 - w / 2, H / 2 - h / 2, w, h); g.restore();
    txt('DAWNLIGHT LABS  ·  MMXXVI', W / 2, H / 2 + 128, { size: 15, weight: 400, ls: 0.55, alpha: io(t, 1.6, 2.4, 3.5, 4.1) * 0.6 });
  },
});
shot('claude', 78.6, 81.8, {
  setup() { idle({ pre: 0.1 }); },
  over(t) {
    shade(1);
    const a = io(t, 0.15, 0.5, 2.7, 3.1), u = 15, hop = t < 0.9 ? -Math.abs(Math.sin(clamp(t / 0.9) * Math.PI)) * 46 : 0, x0 = W / 2 - 7.5 * u, y0 = H / 2 - 150 + hop;
    const leg = (i) => (t > 0.9 && t < 2.2 && Math.floor(t * 8 + i) % 2 ? -0.5 : 0), blink = t > 1.5 && t < 1.62 ? 0.15 : 1, wave = t > 1.9 && t < 2.5 && Math.floor(t * 7) % 2 ? -1.5 : 0;
    g.save(); g.globalAlpha = a; g.fillStyle = '#d97757'; const rct = (x, y, w, h) => g.fillRect(Math.round(x0 + x * u), Math.round(y0 + y * u), Math.round(w * u), Math.round(h * u));
    rct(2.5, 0, 10, 6.6); rct(0, 3, 2.5, 2); rct(12.5, 3 + wave, 2.5, 2); [3.5, 5.6, 8.3, 10.4].forEach((x, i) => rct(x, 6.6 + leg(i), 1.1, 2.7));
    g.fillStyle = '#0a0a0a'; rct(4.1, 1.5 + 0.6 * (1 - blink), 1.2, 1.2 * blink); rct(9.7, 1.5 + 0.6 * (1 - blink), 1.2, 1.2 * blink); g.restore();
    txt('BUILT WITH CLAUDE', W / 2, H / 2 + 52, { size: 19, weight: 400, ls: 0.5, alpha: io(t, 0.6, 1.1, 2.7, 3.1) * 0.75 });
    txt('FABLE 5.2', W / 2, H / 2 + 118, { size: 60, weight: 300, ls: 0.2, alpha: io(t, 0.85, 1.4, 2.7, 3.1), color: '#f4efe9' });
  },
});
shot('end', 81.8, 87.2, {
  setup() { R.color('verdant'); idle({ blade: true, pose: 'rest', pre: 2.0 }); settle(); },
  tick(t, i) { if (i === 48) app.sword.retract(); },
  over(t) {
    shade(1 - ss(0, 0.4, t)); shade(0.55 * ss(1.2, 2.2, t));
    line('PLAY IT FREE IN YOUR BROWSER', W / 2, H / 2 - 40, t, 1.5, 5.2, { size: 22, weight: 400, ls: 0.6, alpha: 0.8 });
    line('riposte.amaansyed27.dev', W / 2, H / 2 + 28, t, 1.9, 5.2, { size: 46, weight: 300, ls: 0.12 });
    shade(ss(4.7, 5.3, t));
  },
});

// music and trailer-only sound cues, in film seconds. Game sound effects come from the tapes.
const CUES = [
  [0.2, 'setScene', [true]], [0.6, 'logo', ['dawn']], [1.4, 'music', ['menu']],
  [20.2, 'music', ['off']], [21.0, 'accent', ['phase']], [21.0, 'setIntensity', [0.85]], [21.42, 'accent', ['bout']],
  [TB, 'music', ['bout']], [TB + 0.05, '_I', [0.8]],
  [bar(7) - 0.3, 'setIntensity', [0.1]], [bar(7), '_I', [0.25]], [bar(7), 'accent', ['tempo']],
  [bar(9) - 0.2, 'setIntensity', [1]], [bar(9) - 0.05, '_I', [0.92]],
  [bar(12) - 0.72, 'accent', ['boss']], [bar(12), 'music', ['boss']], [bar(12), 'setIntensity', [0.9]],
  [63.8 - 0.9, 'accent', ['win']], [63.8 - 0.2, 'music', ['win']],
  [74.7, 'logo', ['author']], [78.8, 'logo', ['clawd']],
  [85.0, 'music', ['off']], [86.2, 'setScene', [false]],
];

// ---------- capture
function compose(s, t) {
  g.globalAlpha = 1; g.filter = 'none'; g.globalCompositeOperation = 'source-over';
  g.drawImage(R.canvas, 0, 0, W, H);
  if (s.over) s.over(t);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, BAR); g.fillRect(0, H - BAR, W, BAR);
}
const post = async (name, body, ext = 'jpg') => { await fetch(`/__shot?dir=trailer&name=${name}&ext=${ext}`, { method: 'POST', body }); };
// toBlob is scheduled as an idle task here (about a second each); toDataURL is synchronous and ten times faster
const jpeg = (c, q = 0.92) => { const b = atob(c.toDataURL('image/jpeg', q).split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
function begin(s) { seed(s.id); rec = null; now = 0; s.setup && s.setup(); now = 0; }
function step(s, i, draw) { now = i / FPS; recF = i; guard(s); if (s.tick) s.tick(now, i); R.frame((s.speed ? s.speed(now) : 1) / FPS, draw); }

async function capture(ids) {
  status = { state: 'capturing', shot: '', done: 0, total: SHOTS.filter((s) => !ids || ids.includes(s.id)).reduce((n, s) => n + s.f1 - s.f0, 0), t0: performance.now() };
  try {
    for (const s of SHOTS) {
      if (ids && !ids.includes(s.id)) continue;
      status.shot = s.id; begin(s); rec = []; const r0 = G.returned, sc0 = G.score;
      for (let i = 0, n = s.f1 - s.f0; i < n; i++) { step(s, i, true); compose(s, now); await post('f_' + String(s.f0 + i).padStart(5, '0'), await jpeg(cv)); status.done++; }
      const tape = rec; rec = null; (status.log = status.log || {})[s.id] = [G.returned - r0, G.score - sc0, G.state];
      await post('tape_' + s.id, JSON.stringify(tape.map(([f, n, a]) => [f, n, a.map((v) => (typeof v === 'number' ? +v.toFixed(4) : v))])), 'json');
    }
    status.state = 'done'; status.sec = Math.round((performance.now() - status.t0) / 1000);
  } catch (e) { status.state = 'error'; status.error = String(e && e.stack || e); }
  return status;
}
async function still(id, t, name = id) {
  const s = SHOTS.find((x) => x.id === id); begin(s);
  const n = Math.round(t * FPS); for (let i = 0; i < n; i++) step(s, i, false);
  step(s, n, true); compose(s, now);
  const c = document.createElement('canvas'); c.width = 960; c.height = 540; c.getContext('2d').drawImage(cv, 0, 0, 960, 540);
  await post('p_' + name, await jpeg(c, 0.85));
  return { id, t, canvas: [R.canvas.width, R.canvas.height], game: G.state, enemies: G.enemies.length, bolts: G.bolts.incoming.length, killAt: status.killAt };
}

// ---------- soundtrack: the game's own audio engine, run offline against the tapes
async function audio() {
  status = { state: 'audio' };
  try {
    const dur = SHOTS[SHOTS.length - 1].t1 + 0.6, sr = 48000, ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
    const A = new Audio(ctx); A.vol = { music: 0.8, sfx: 0.85, amb: 0.6 }; A.muted = false; A.rainLevel = 'heavy'; A.scene = false; A.unlock();
    for (let i = 0; i < 400 && !A.useScore; i++) await new Promise((r) => setTimeout(r, 50));
    if (!A.useScore) throw new Error('score beds did not load');
    const ev = new Map(), add = (f, n, a) => { if (!ev.has(f)) ev.set(f, []); ev.get(f).push([n, a]); };
    let missing = [];
    for (const s of SHOTS) { try { const tape = await (await fetch(`/__shot?dir=trailer&name=tape_${s.id}&ext=json`)).json(); for (const [f, n, a] of tape) if (f < s.f1 - s.f0) add(s.f0 + f, n, a); } catch { missing.push(s.id); } }
    for (const [t, n, a] of CUES) add(Math.round(t * FPS), n, a);
    const run = (f) => { for (const [n, a] of ev.get(f) || []) { if (n === '_I') A.score.I = a[0]; else if (typeof A[n] === 'function') A[n](...a); } A.score._tick(); };
    const N = Math.floor(dur * FPS);
    for (let f = 1; f < N; f++) ctx.suspend(f / FPS).then(() => { try { run(f); } finally { ctx.resume(); } });
    run(0);
    const buf = await ctx.startRendering();
    // 16-bit WAV
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1), n = L.length, dv = new DataView(new ArrayBuffer(44 + n * 4)), w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 4, true);
    let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rr[i]));
    const k = peak > 0.97 ? 0.97 / peak : 1;            // never clip: scale the whole track instead
    for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, L[i] * k * 32767, true); dv.setInt16(46 + i * 4, Rr[i] * k * 32767, true); }
    await post('audio', dv.buffer, 'wav');
    status = { state: 'done', audio: true, dur, peak: +peak.toFixed(3), missing };
  } catch (e) { status = { state: 'error', error: String(e && e.stack || e) }; }
  return status;
}

export async function init(harness) {
  R = harness; app = R.app; G = app.game;
  UI = getComputedStyle(document.body).fontFamily;
  Math.random = rng;
  cv = document.createElement('canvas'); cv.width = W; cv.height = H; g = cv.getContext('2d');
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const dawn = document.querySelector('.dl-mark svg');
  if (dawn) img.dawn = await load('data:image/svg+xml,' + encodeURIComponent(dawn.outerHTML.replace('<svg ', '<svg width="500" height="500" ')));
  const L = lettering('AMAAN SYED'); img.nameAr = L.ar;
  img.name = await load('data:image/svg+xml,' + encodeURIComponent(decodeURIComponent(L.url.slice(5, -2).replace('data:image/svg+xml,', '')).replace('<svg ', '<svg width="' + Math.round(208 * L.ar) + '" height="208" ')));
  img.nameCv = document.createElement('canvas'); img.nameCv.width = 1800; img.nameCv.height = Math.round(1800 / L.ar);
  img.word = document.createElement('canvas'); img.word.width = 1700; img.word.height = 320;
  try { await Promise.all([document.fonts.load('400 40px Azonix'), document.fonts.load(`200 40px ${UI}`)]); } catch {}
  // every sound the game makes while a shot is being recorded goes on that shot's tape (music is scored separately)
  const SKIP = new Set(['constructor', 'unlock', 'setMuted', 'setVol', 'music', 'pace', 'accent', 'setIntensity', 'stinger', 'muffle', 'tempo', 'death', 'setPlaying', 'ui', 'tick', 'setRain', 'setScene', 'logo', 'lanterns']);
  for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(app.audio))) {
    if (k.startsWith('_') || SKIP.has(k) || typeof app.audio[k] !== 'function') continue;
    const orig = app.audio[k].bind(app.audio); app.audio[k] = (...a) => { if (rec) rec.push([recF, k, a]); return orig(...a); };
  }
  // the film is 1920x1080 whatever size the window happens to be
  for (const [k, v] of [['innerWidth', W], ['innerHeight', H], ['devicePixelRatio', 1]]) Object.defineProperty(window, k, { get: () => v, configurable: true });
  Object.assign(app.settings.v, { preset: 'high', scale: 100, reflections: 'high', bloom: 'on', rain: 'heavy', film: 'on', shake: 100, adaptive: 'off', fps: 'off' }); app.settings.apply();
  R.manual(true);
  window.__trailer = { capture, still, audio, SHOTS, get status() { return status.state === 'capturing' ? { ...status, pct: Math.round(100 * status.done / status.total) } : status; } };
}
