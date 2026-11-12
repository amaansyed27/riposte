// The opening: a run of cards on an eclipse chart while everything the game needs is compiled and loaded behind it.
//   first visit            -> the full sequence
//   back within a week     -> straight to the menu (a short loader only if something still has to compile)
//   back after a long gap  -> the sequence again, with Skip, since the browser's shader cache is probably cold
import '@fontsource/cinzel/700.css';

const $ = (id) => document.getElementById(id);
const WEEK = 7 * 24 * 3600 * 1000;
const OUT = 'cubic-bezier(0.165, 0.84, 0.44, 1)';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LABELS = ['Reading the sky', 'Forging the blade', 'Waking the sentinels', 'Tempering shaders', 'Tuning the orchestra', 'Ready'];

function mode() {
  const q = new URLSearchParams(location.search);
  if (q.has('nointro')) return 'warm';
  if (q.has('intro')) return 'first';
  let seen = 0; try { seen = +localStorage.getItem('riposte.seenAt') || 0; } catch {}
  if (!seen) return 'first';
  return Date.now() - seen > WEEK ? 'cold' : 'warm';
}

// ---------- cards
function dawnlight(root) {
  // Dawnlight Labs' own mark animation (crescent swipe over a parallax orb), re-timed with the Web Animations API
  const A = (sel, from, dur, delay) => root.querySelectorAll(sel).forEach((el) => el.animate([{ transform: `translate(${from[0]}px, ${from[1]}px)` }, { transform: 'translate(0px, 0px)' }], { duration: dur, delay, easing: OUT, fill: 'both' }));
  root.querySelector('.dl-mark').animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 700, easing: OUT, fill: 'both' });
  A('.swipe-lead', [-430, -410], 1250, 120); A('.swipe-trail', [-410, -390], 1650, 230);
  A('.parallax-mid', [95, 50], 1800, 0); A('.parallax-core', [160, 90], 1800, 0); A('.parallax-rim', [-70, -40], 1800, 0);
  root.querySelector('.dl-words').animate([{ opacity: 0, transform: 'translateY(14px)', clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, transform: 'none', clipPath: 'inset(0 0% 0 0)' }], { duration: 800, delay: 1050, easing: 'ease-out', fill: 'both' });
}
function clawd(root) {
  const c = root.querySelector('.clawd');
  c.animate([{ transform: 'translateY(120%) scale(1,1)' }, { transform: 'translateY(-14%) scale(.94,1.08)', offset: 0.5 }, { transform: 'translateY(0) scale(1.08,.9)', offset: 0.72 }, { transform: 'translateY(0) scale(1,1)' }], { duration: 760, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
  c.querySelectorAll('.leg').forEach((l, i) => l.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-0.55px)' }, { transform: 'translateY(0)' }], { duration: 260, delay: 800 + (i % 2) * 130, iterations: 5, easing: 'steps(2)' }));
  c.querySelectorAll('.eye').forEach((e) => e.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.1)' }, { transform: 'scaleY(1)' }], { duration: 170, delay: 1500, iterations: 2, easing: 'steps(2)' }));
  c.querySelector('.arm-r').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-1.6px)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-1.6px)' }, { transform: 'translateY(0)' }], { duration: 620, delay: 1900, easing: 'steps(4)' });
  root.querySelectorAll('.cl-text > *').forEach((t, i) => t.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 700 + i * 220, easing: 'ease-out', fill: 'both' }));
}
function engine(root) {
  // a wireframe icosahedron turning in real time: the engine introducing itself
  const cv = root.querySelector('canvas'), g = cv.getContext('2d'), P = (1 + Math.sqrt(5)) / 2;
  const V = [[-1, P, 0], [1, P, 0], [-1, -P, 0], [1, -P, 0], [0, -1, P], [0, 1, P], [0, -1, -P], [0, 1, -P], [P, 0, -1], [P, 0, 1], [-P, 0, -1], [-P, 0, 1]];
  const E = []; for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { const d = Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]); if (Math.abs(d - 2) < 0.01) E.push([i, j]); }
  const t0 = performance.now(); let live = true;
  const draw = () => {
    if (!live) return; requestAnimationFrame(draw);
    const t = (performance.now() - t0) / 1000, a = t * 0.9, b = t * 0.55, s = cv.width;
    g.clearRect(0, 0, s, s); g.lineWidth = s / 130; g.lineCap = 'round';
    const pr = V.map(([x, y, z]) => { const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a), y1 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b); const k = 3.6 / (5 + z2); return [s / 2 + x1 * k * s * 0.19, s / 2 + y1 * k * s * 0.19, z2]; });
    const grow = Math.min(1, t / 1.1);
    E.forEach(([i, j], n) => { if (n / E.length > grow) return; const z = (pr[i][2] + pr[j][2]) / 2; g.strokeStyle = `rgba(215,232,255,${0.22 + 0.6 * (1 - (z + 2) / 4)})`; g.beginPath(); g.moveTo(pr[i][0], pr[i][1]); g.lineTo(pr[j][0], pr[j][1]); g.stroke(); });
  };
  draw();
  root.querySelectorAll('.en-text > *').forEach((t, i) => t.animate([{ opacity: 0, letterSpacing: '.6em' }, { opacity: 1, letterSpacing: '.28em' }], { duration: 900, delay: 350 + i * 250, easing: 'ease-out', fill: 'both' }));
  return () => { live = false; };
}
// The name is drawn, not typed: monoline capitals built from a few strokes (open-topped A, no crossbar),
// with one fine cut running through the whole word like a blade's path. Used as a mask over brushed silver.
const GLYPH = {
  A: [86, 'M9,114 L43,0 L77,114'],
  M: [86, 'M8,110 V0 L43,62 L78,0 V110'],
  N: [74, 'M8,110 V0 L66,104 V-6'],
  S: [64, 'M57,26 C57,12 46,8 32,8 C17,8 7,17 7,30 C7,46 20,50 32,54 C46,58 57,63 57,78 C57,92 46,96 32,96 C17,96 7,90 7,76'],
  Y: [88, 'M7,-10 L44,54 L81,-10 M44,52 V110'],
  E: [58, 'M58,8 H8 V96 H58 M8,52 H48'],
  D: [72, 'M8,8 H30 A44,44 0 0 1 30,96 H8 Z'],
};
export function lettering(text, gap = 40, space = 56) {
  let x = 0, d = '';
  for (const ch of text) { if (ch === ' ') { x += space; continue; } const [w, p] = GLYPH[ch]; d += `<path transform="translate(${x} 0)" d="${p}"/>`; x += w + gap; }
  const W = x - gap, H = 104;
  // letters are clipped to the cap height so every stroke ends square; the cut is a thin slanted gap
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><clipPath id="c"><rect y="0" width="${W}" height="${H}"/></clipPath><mask id="m"><rect width="${W}" height="${H}" fill="#fff"/><path d="M-10,${H * 0.66} L${W + 10},${H * 0.4}" stroke="#000" stroke-width="3.2"/></mask></defs><g clip-path="url(#c)" mask="url(#m)" fill="none" stroke="#fff" stroke-width="16" stroke-linejoin="miter" stroke-miterlimit="1.6">${d}</g></svg>`;
  return { url: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, ar: W / H };
}
function author(root) {
  // restraint reads as royal: the capitals gather out of a wide, soft haze, two hairlines open from the centre,
  // then a single light crosses the silver and catches on the last letter
  const q = (c) => root.querySelector(c), EASE = 'cubic-bezier(.16,.7,.2,1)';
  const L = lettering('AMAAN SYED'); q('.au-name').style.setProperty('--letters', L.url); q('.au-name').style.setProperty('--ar', L.ar);
  q('.au-haze').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 2400, easing: 'ease-out', fill: 'both' });
  q('.au-by').animate([{ opacity: 0, letterSpacing: '1.1em' }, { opacity: 1, letterSpacing: '.7em' }], { duration: 1000, easing: 'ease-out', fill: 'both' });
  root.querySelectorAll('.au-rule').forEach((r) => r.animate([{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 1300, delay: 300, easing: EASE, fill: 'both' }));
  const SH = 'drop-shadow(0 0 2px rgba(190,220,255,.5)) drop-shadow(0 0 28px rgba(110,170,255,.38))';
  q('.au-name').animate([{ opacity: 0, transform: 'scaleX(1.32)', filter: `blur(16px) ${SH}` }, { opacity: 1, offset: 0.55 }, { opacity: 1, transform: 'scaleX(1)', filter: `blur(0px) ${SH}` }], { duration: 1700, delay: 350, easing: EASE, fill: 'both' });
  q('.au-ink').animate([{ backgroundPosition: '120% 0, 0 0' }, { backgroundPosition: '-20% 0, 0 0' }], { duration: 1500, delay: 1750, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'both' });
  q('.au-star').animate([{ transform: 'translate(50%,-50%) scale(0) rotate(0deg)', opacity: 0 }, { transform: 'translate(50%,-50%) scale(1) rotate(35deg)', opacity: 1, offset: 0.35 }, { transform: 'translate(50%,-50%) scale(0) rotate(80deg)', opacity: 0 }], { duration: 900, delay: 2750, easing: 'ease-out', fill: 'both' });
  q('.au-sub').animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 1900, easing: 'ease-out', fill: 'both' });
  root.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }], { duration: 4700, easing: 'linear', fill: 'both' });
}
const CARDS = [
  { id: 'cDawn', run: dawnlight, hold: 2900, sound: 'dawn' },
  { id: 'cClawd', run: clawd, hold: 3100, sound: 'clawd' },
  { id: 'cEngine', run: engine, hold: 2700, sound: 'engine' },
  { id: 'cAuthor', run: author, hold: 4100, sound: 'author' },
];

// ---------- the boot itself. preload(onProgress) resolves when the game can run without hitching.
export async function runBoot(app, preload) {
  const el = $('boot'), bar = $('bootBeam'), pct = $('bootPct'), lab = $('bootLabel'), gate = $('bootGate'), skip = $('bootSkip');
  const m = mode();
  el.dataset.mode = m; el.classList.remove('hidden');
  let done = false, shown = 0;
  const loading = preload((p, step) => { shown = Math.max(shown, p); bar.style.transform = `scaleX(${shown})`; pct.textContent = `${Math.round(shown * 100)}`; if (step !== undefined) lab.textContent = LABELS[step] || ''; }).then(() => { done = true; bar.style.transform = 'scaleX(1)'; pct.textContent = '100'; lab.textContent = LABELS[5]; el.classList.add('loaded'); });
  const finish = async () => {
    await loading;
    try { localStorage.setItem('riposte.seenAt', String(Date.now())); } catch {}
    el.classList.add('out'); app.onBootDone();
    await wait(1100); el.classList.add('hidden'); el.remove();
  };
  if (m === 'warm') { gate.classList.add('hidden'); return finish(); }

  // audio needs a gesture, and the sequence is better with sound: one click starts it
  await new Promise((res) => { const go = (e) => { if (e && e.target && e.target.closest && e.target.closest('#bootFs')) return; if (e && e.code === 'KeyF') return; removeEventListener('pointerdown', go); removeEventListener('keydown', go); res(); }; addEventListener('pointerdown', go); addEventListener('keydown', go); });
  app.audio.unlock();
  gate.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'both' });
  el.classList.add('playing');
  let skipped = false;
  if (m === 'cold') { skip.classList.remove('hidden'); skip.onclick = () => { skipped = true; }; }
  await wait(500);
  for (const c of CARDS) {
    if (skipped) break;
    const root = $(c.id); root.classList.remove('hidden');
    root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, fill: 'both' });
    app.audio.logo(c.sound);
    const stop = c.run(root);
    for (let t = 0; t < c.hold && !skipped; t += 100) await wait(100);
    await root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: skipped ? 200 : 550, fill: 'both' }).finished;
    root.classList.add('hidden'); if (stop) stop();
  }
  return finish();
}
