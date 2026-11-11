// The opening: a run of cards on an eclipse chart while everything the game needs is compiled and loaded behind it.
//   first visit            -> the full sequence
//   back within a week     -> straight to the menu (a short loader only if something still has to compile)
//   back after a long gap  -> the sequence again, with Skip, since the browser's shader cache is probably cold
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';

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
function author(root) {
  const name = root.querySelector('.au-name'), text = name.dataset.text;
  if (!name.children.length) for (const ch of text) { const sp = document.createElement('span'); if (ch === ' ') sp.className = 'sp'; else sp.textContent = ch; name.appendChild(sp); }
  const letters = [...name.children].filter((x) => !x.classList.contains('sp'));
  // a corona opens behind the name as it is struck
  root.querySelector('.au-sun').animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.55)' }, { opacity: 0.95, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 2600, easing: OUT, fill: 'both' });
  root.querySelector('.au-by').animate([{ opacity: 0, letterSpacing: '1.2em' }, { opacity: 1, letterSpacing: '.6em' }], { duration: 900, easing: 'ease-out', fill: 'both' });
  // each letter is hammered in: it drops, white-hot and oversized, and rings into place
  letters.forEach((el, i) => {
    el.animate([{ opacity: 0, transform: 'translateY(-.45em) scale(1.7)', filter: 'blur(9px) brightness(4)' }, { opacity: 1, transform: 'translateY(.04em) scale(.96)', filter: 'blur(0) brightness(2)', offset: 0.7 }, { opacity: 1, transform: 'none', filter: 'blur(0) brightness(1)' }], { duration: 460, delay: 300 + i * 95, easing: 'cubic-bezier(.3,.9,.3,1)', fill: 'both' });
    // then a light crosses the metal, letter to letter, and settles on the highlight
    el.animate([{ backgroundPosition: '120% 0' }, { backgroundPosition: '-15% 0', offset: 0.6 }, { backgroundPosition: '48% 0' }], { duration: 1500, delay: 1350 + i * 70, easing: 'ease-in-out', fill: 'both' });
  });
  const T = 300 + letters.length * 95 + 200;
  // a blade ignites from the hilt outward under the name
  root.querySelector('.au-blade i').animate([{ transform: 'scaleX(0)', filter: 'brightness(3)' }, { transform: 'scaleX(1.03)', filter: 'brightness(1.6)', offset: 0.75 }, { transform: 'scaleX(1)', filter: 'brightness(1)' }], { duration: 520, delay: T, easing: 'cubic-bezier(.1,.8,.2,1)', fill: 'both' });
  root.querySelector('.au-sub').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: T + 450, easing: 'ease-out', fill: 'both' });
  root.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }], { duration: 4600, easing: 'linear', fill: 'both' });
  // sparks thrown off the blade as it lights
  const cv = root.querySelector('.au-sparks'), g = cv.getContext('2d'), W = cv.width, H = cv.height, P = [];
  let live = true, born = false; const t0 = performance.now();
  const tick = () => {
    if (!live) return; requestAnimationFrame(tick);
    const t = performance.now() - t0;
    if (!born && t > T) { born = true; for (let i = 0; i < 110; i++) { const side = Math.random() < 0.5 ? -1 : 1, u = Math.random(); P.push({ x: W / 2 + side * u * W * 0.4, y: H * 0.5, vx: side * (40 + Math.random() * 260), vy: -(60 + Math.random() * 260) * (Math.random() < 0.8 ? 1 : -0.5), life: 0.5 + Math.random() * 0.9, age: -u * 0.3 }); } }
    g.clearRect(0, 0, W, H); g.lineCap = 'round';
    for (const p of P) {
      p.age += 1 / 60; if (p.age < 0 || p.age > p.life) continue;
      p.vy += 520 / 60; p.x += p.vx / 60; p.y += p.vy / 60;
      const k = 1 - p.age / p.life; g.strokeStyle = `rgba(${200 + 55 * k | 0},255,${225 + 30 * k | 0},${k})`; g.lineWidth = 1 + k * 1.6;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022); g.stroke();
    }
  };
  tick();
  return () => { live = false; };
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
