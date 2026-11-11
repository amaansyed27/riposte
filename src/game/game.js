// Rules, bouts, scoring, deflection. You cannot attack: every point comes from sending a bolt home.
import * as THREE from 'three';
import { Enemy, TYPES } from './enemies.js';
import { Bolts, REACH_FAR } from './bolts.js';
import { clamp, rand, pick, distPointSeg, lerp } from '../core/util.js';
import { ROMAN } from '../ui/hud.js';

const WHITE = new THREE.Color(1, 1, 1), GOLD = new THREE.Color(1, 0.82, 0.45);
const _v = new THREE.Vector3(), _c = new THREE.Color();
const TEMPO_MAX = 16, TEMPO_TIME = 6.5;
export const STRIKE_D = 1.6;            // depth of the plane where bolts meet the blade
const RANKS = [[0, 'Novice'], [1500, 'Initiate'], [5000, 'Duelist'], [12000, 'Bretteur'], [24000, 'Maître'], [45000, 'Grand Maître']];
const BOSSES = ['maestro', 'hydra', 'bastion'];
const BOSS_SUB = { maestro: 'It conducts. You answer.', hydra: 'Cut the leashes. Then the heart.', bastion: 'Only a hard swing cracks it.' };

function boutConfig(n) {
  if (n === 1) return { queue: ['wisp', 'wisp', 'wisp'], maxAlive: 1, dur: 2.1, maxBolts: 1, cd: 1.0, sub: 'Put your blade in the bolt’s path' };
  if (n === 2) return { queue: ['wisp', 'wisp', 'twin', 'wisp', 'twin'], maxAlive: 2, dur: 1.9, maxBolts: 2, cd: 1.0, sub: 'Swing hard for a riposte — double damage' };
  if (n === 3) return { queue: ['wisp', 'lancer', 'bulwark', 'twin', 'lancer', 'bulwark'], maxAlive: 3, dur: 1.8, maxBolts: 3, cd: 0.95, sub: 'Lancers aim first. Bulwarks need two.' };
  if (n % 4 === 0) {
    const i = n / 4 - 1, kind = BOSSES[i % 3], tier = Math.floor(i / 3);
    return { boss: kind, tier, queue: [kind], maxAlive: 4, dur: Math.max(1.35, 1.9 - tier * 0.15), maxBolts: 8, cd: Math.max(0.7, 1 - tier * 0.12), sub: BOSS_SUB[kind] };
  }
  const k = n - 3, count = Math.min(14, 5 + k), bag = ['wisp', 'wisp', 'twin', 'twin', 'lancer', 'lancer', 'bulwark'];
  return { queue: Array.from({ length: count }, () => pick(bag)), maxAlive: Math.min(5, 3 + Math.floor(k / 3)), dur: Math.max(1.05, 1.75 - k * 0.05), maxBolts: Math.min(6, 3 + Math.floor(k / 3)), cd: Math.max(0.6, 0.95 - k * 0.03), sub: pick(['En garde', 'Allez', 'Tempo rising', 'Hold the line']) };
}

export class Game {
  constructor(app) {
    this.app = app;
    this.bolts = new Bolts(app);
    this.enemies = [];
    this.state = 'menu'; this.paused = false;
    this.timers = [];
    this.hist = []; this.prevPtr = null; this.swipe = 0; this.real = 0;
    this.slowT = 0; this.slowScale = 1; this.stopT = 0;
    this.hitFlash = 0; this.invuln = 0; this.cdScale = 1; this.cfg = boutConfig(1); this.queue = [];
    this.reset();
    try { this.best = +localStorage.getItem('riposte.best') || 0; } catch { this.best = 0; }
  }
  reset() {
    this.score = 0; this.combo = 0; this.streak = 0; this.returned = 0; this.ripostes = 0; this.bout = 0; this.integrity = 3;
    this.tempo = 0; this.tempoLive = 0; this.chain = 0; this.lastDeflect = -9; this.lastFire = -9; this.clock = 0;
    this.slowT = 0; this.stopT = 0; this.invuln = 0; this.hitFlash = 0; this.timers = []; this.paused = false; this.boss = null;
  }
  after(sec, fn, real = false) { this.timers.push({ t: sec, fn, real }); }
  get timeScale() {
    if (this.paused) return 0;
    if (this.hold) return 0.04;
    if (this.stopT > 0) return 0.03;
    if (this.slowT > 0) return this.slowScale;
    return this.tempoLive > 0 ? 0.5 : 1;
  }
  get mult() { return 1 + Math.floor(this.combo / 5); }
  clearField() { for (const e of this.enemies) e.dispose(); this.enemies = []; this.bolts.clear(); }

  // ---------- flow
  start() {
    const { app } = this;
    this.clearField(); this.reset(); this.state = 'starting'; this.hold = false; app.audio.tempo(false); app.audio.muffle(false); app.audio.music('rest');
    let seen = false; try { seen = !!localStorage.getItem('riposte.tut'); } catch {}
    this.tut = seen ? 0 : 1; app.env.setStreak(0); app.env.setMood(null); app.env.heart = false;
    app.hud.screen(null);
    app.hud.setScore(0); app.hud.setCombo(0, 1); app.hud.setPips(3); app.hud.setTempo(0, false); app.hud.boss(null);
    app.sword.setIntegrity(3); app.sword.overTarget = 0;
    if (!app.sword.isOn) app.sword.ignite();
    app.pose = 'play'; app.hud.showHud(true);
    this.after(0.9, () => this.beginBout(1));
  }
  home() {
    const { app } = this;
    this.clearField(); this.reset(); this.state = 'menu'; this.visitT = 5; app.env.setStreak(0); app.env.setMood(null); app.env.heart = false; app.hud.el.banner.classList.remove('show');
    app.audio.setPlaying(false); app.audio.music('menu'); app.audio.muffle(false); app.audio.tempo(false); app.sword.overTarget = 0; app.sword.retract();
    app.hud.showHud(false); app.hud.boss(null); app.hud.hint(null); app.hud.screen('intro'); app.pose = 'title';
  }
  beginBout(n) {
    const { app } = this;
    this.bout = n; this.cfg = boutConfig(n); this.queue = [...this.cfg.queue]; this.cdScale = this.cfg.cd;
    this.state = 'play'; this.spawnT = 1.1; this.escortT = 6;
    const boss = this.cfg.boss;
    const name = boss ? `${TYPES[boss].name}${this.cfg.tier ? ' ' + ROMAN(this.cfg.tier + 1) : ''}` : null;
    app.hud.setBout(n); app.hud.banner(boss ? 'A master approaches' : 'En garde', boss ? name.toUpperCase() : `BOUT ${ROMAN(n)}`, this.cfg.sub, 2300);
    app.audio.music(boss ? 'boss' : 'bout'); app.audio.stinger(n); if (boss) app.audio.accent('boss'); app.audio.setPlaying(true);
    app.env.setMood(boss ? TYPES[boss].color : null);
  }
  endBout() {
    const { app } = this;
    if (this.tut) { this.tut = 0; this.hold = false; app.hud.hint(null); try { localStorage.setItem('riposte.tut', '1'); } catch {} }
    const wasBoss = !!this.cfg.boss, ext = wasBoss ? 4.5 : 0;     // after a master falls, let the theme breathe
    app.audio.music(wasBoss ? 'win' : 'rest'); app.audio.accent(wasBoss ? 'win' : 'clear');
    this.state = 'intermission'; this.boss = null; app.hud.boss(null); app.env.setMood(null); app.env.courtPulse(0, 0, 1.4);
    this.after(1.0, () => { app.sword.retract(); app.pose = 'rest'; app.audio.setPlaying(false); });
    this.after(1.3, () => {
      const heal = this.integrity < 3;
      if (heal) { app.env.heart = false; this.integrity++; app.hud.setPips(this.integrity, true); app.sword.setIntegrity(this.integrity); }
      app.hud.banner('Bout cleared', 'TOUCHÉ', heal ? '+1 guard restored' : `${this.score.toLocaleString('en-US')} points`, 1500);
    });
    this.after(3.1 + ext, () => { app.sword.ignite(); app.pose = 'play'; });
    this.after(3.7 + ext, () => this.beginBout(this.bout + 1));
  }
  die() {
    const { app } = this;
    this.state = 'dead'; this.tempoLive = 0; this.hold = false; app.hud.hint(null); app.sword.overTarget = 0; app.hud.setTempo(0, false);
    app.audio.setPlaying(false); app.audio.death();
    app.sword.disturb(1.6);
    for (const b of this.bolts.items) if (b.live) { app.fx.sparks.burst(b.pos, b.color, 8, 4, { life: 0.4 }); this.bolts.kill(b); }
    this.slowT = 1.6; this.slowScale = 0.25;
    this.after(0.45, () => { app.sword.retract(); app.pose = 'rest'; }, true);
    this.after(2.3, () => {
      if (this.state !== 'dead') return;
      const newBest = this.score > this.best;
      if (newBest) { this.best = this.score; try { localStorage.setItem('riposte.best', this.best); } catch {} }
      let rank = RANKS[0][1]; for (const [s, r] of RANKS) if (this.score >= s) rank = r;
      this.result = { score: this.score, returned: this.returned, perfect: this.ripostes, streak: this.streak, bout: this.bout, rank, newBest, best: this.best };
      app.hud.showHud(false); app.hud.boss(null); app.hud.showEnd(this.result); app.hud.setBest(this.best); app.audio.music('dead');
    }, true);
  }
  togglePause() {
    const { app } = this;
    if (this.state !== 'play' && !this.paused) return;
    if (!this.paused) { this.paused = true; app.sword.retract(); app.pose = 'rest'; app.hud.screen('paused'); app.audio.setPlaying(false); app.audio.muffle(true); }
    else { app.hud.screen(null); app.sword.ignite(); app.pose = 'play'; app.audio.muffle(false); this.after(0.7, () => { this.paused = false; app.audio.setPlaying(true); }, true); }
  }
  shareText() {
    const r = this.result; if (!r) return '';
    return `I returned ${r.returned} bolts to sender and reached Bout ${ROMAN(r.bout)} in RIPOSTE — ${r.score.toLocaleString('en-US')} pts, rank ${r.rank}.\nYou can't attack. You can only send it back.`;
  }

  // ---------- enemy hooks
  canFire(e) {
    if (this.state !== 'play') return false;
    const inc = this.bolts.incoming.length;
    if (e.shielded) return false;
    if (e.boss) return inc < 2;
    return inc < this.cfg.maxBolts && this.clock - this.lastFire > 0.5;
  }
  onCharge(e) {
    this.lastFire = this.clock;
    e.aim = this.pickTarget();
    e.aimW = this.app.ndcToWorld(e.aim.x, e.aim.y, STRIKE_D);
    this.app.audio.charge(this.pan(e));
    if (e.type === 'maestro') this.app.audio.chirp('tap', 0);
  }
  onFire(e) {
    const d = this.cfg.dur, a = e.aim || this.pickTarget(), asp = this.app.aspect, sx = Math.min(1, asp);
    const arc = (n, gap, dd, size = 1) => { const a0 = rand(0, Math.PI * 2), dir = Math.random() < 0.5 ? 1 : -1, R = 0.36; for (let i = 0; i < n; i++) { const ang = a0 + dir * i * (2.0 / (n - 1)); this.fireAt(e, { x: Math.cos(ang) * R / asp * sx, y: Math.sin(ang) * R - 0.03 }, dd, { delay: i * gap, size }); } };
    const line = (n, gap, dd, size = 1) => { const ang = rand(-0.5, 0.5) + (Math.random() < 0.5 ? Math.PI : 0), L = Math.min(0.62, 0.62 * asp); for (let i = 0; i < n; i++) { const k = i / (n - 1) - 0.5; this.fireAt(e, { x: Math.cos(ang) * k * 2 * L, y: Math.sin(ang) * k * 0.7 - 0.02 }, dd, { delay: i * gap, size }); } };
    const burst = (n, gap, dd, size) => { const c = this.pickTarget(); for (let i = 0; i < n; i++) this.fireAt(e, c, dd, { delay: i * gap, size }); };
    const cross = (dd, size = 1) => { for (let i = 0; i < 4; i++) { const s = i % 2 ? 1 : -1, k = i < 2 ? 1 : -1; this.fireAt(e, { x: s * 0.32 * sx, y: k * s * 0.26 }, dd, { delay: i * 0.3, size }); } };
    const p2 = e.phase === 2;
    if (e.type === 'wisp') this.fireAt(e, a, d);
    else if (e.type === 'lancer') this.fireAt(e, a, d * 0.58);
    else if (e.type === 'bulwark') this.fireAt(e, a, d * 1.15, { size: 1.5 });
    else if (e.type === 'twin') {
      const ang = rand(0, Math.PI * 2), r = 0.36;
      const b = { x: clamp(a.x + Math.cos(ang) * r / asp, -0.8, 0.8), y: clamp(a.y + Math.sin(ang) * r, -0.5, 0.45) };
      this.fireAt(e, a, d); this.fireAt(e, b, d, { delay: 0.2, eye: 1 });
    } else if (e.type === 'maestro') {
      const pat = pick(p2 ? ['arc', 'arc', 'line', 'burst', 'cross'] : ['arc', 'line', 'burst']);
      const n = p2 ? 6 : 5, gap = p2 ? 0.115 : 0.14, dd = d * (p2 ? 0.9 : 1);
      if (pat === 'arc') arc(n, gap, dd); else if (pat === 'line') line(n, gap, dd); else if (pat === 'cross') cross(dd); else burst(3, 0.34, dd, 1.25);
    } else if (e.type === 'hydra') {
      if (Math.random() < 0.5) burst(p2 ? 4 : 3, 0.26, d * 0.9, 1.1); else arc(p2 ? 5 : 4, 0.16, d);
    } else if (e.type === 'bastion') {
      const pat = pick(p2 ? ['wall', 'cross', 'burst', 'wall'] : ['burst', 'cross', 'wall']);
      if (pat === 'wall') line(p2 ? 7 : 6, 0.09, d * 1.05, 1.2); else if (pat === 'cross') cross(d, 1.5); else burst(3, 0.4, d * 1.1, 1.7);
    }
  }
  fireAt(e, ndc, dur, opts = {}) {
    if (!e.boss) {
      const asp = this.app.aspect;
      for (let pass = 0; pass < 4; pass++) {
        const arr = this.clock + (opts.delay || 0) + dur; let clash = 0;
        for (const o of this.bolts.incoming) {
          if (!o.ndc || o.arr === undefined) continue;
          const far = Math.hypot((o.ndc.x - ndc.x) * asp, o.ndc.y - ndc.y) > 0.3;
          if (far && Math.abs(arr - o.arr) < 0.5) clash = Math.max(clash, o.arr + 0.55 - arr);
        }
        if (clash <= 0) break; dur += clash;
      }
    }
    const T = this.app.ndcToWorld(ndc.x, ndc.y, STRIKE_D);
    const b = this.bolts.fire(e, e.muzzleOf(opts.eye || 0).clone(), T, dur, opts);
    if (b) { b.ndc = ndc; b.lock = 0; b.arr = this.clock + (opts.delay || 0) + dur; this.app.audio.fire(e.type, this.pan(e)); }
  }
  pickTarget() {
    const asp = this.app.aspect, mx = asp < 1 ? 0.7 : 0.6;
    let best = null, bestD = -1;
    for (let i = 0; i < 10; i++) {
      const c = { x: rand(-mx, mx), y: rand(-0.42, 0.36) };
      let d = 9;
      for (const b of this.bolts.incoming) if (b.ndc) d = Math.min(d, Math.hypot((b.ndc.x - c.x) * asp, b.ndc.y - c.y));
      if (d > bestD) { bestD = d; best = c; }
      if (d > 0.5) break;
    }
    return best;
  }
  pan(e) { return clamp(this.app.project(e.group.position).nx, -1, 1) * 0.8; }

  spawn(type, slotNdc) {
    const { app } = this;
    const e = new Enemy(type, app);
    if (e.boss) {
      const hp = { maestro: 12, hydra: 9, bastion: 16 }[type] + (this.cfg.tier || 0) * { maestro: 5, hydra: 4, bastion: 7 }[type];
      e.hp = e.maxHp = hp; e.ndcSlot = { x: 0, y: 0.34 }; e.place(app.ndcToWorld(0, 0.34, 14.5));
      this.boss = e; app.hud.boss(`${e.T.name}${this.cfg.tier ? ' ' + ROMAN(this.cfg.tier + 1) : ''}`, 1);
      if (type === 'hydra') this.after(1.6, () => this.leashes(e));
    } else {
      const s = slotNdc || this.pickSlot(); e.ndcSlot = s;
      const w = app.ndcToWorld(s.x, s.y, s.z); w.y = Math.max(w.y, 1.5); e.place(w);
    }
    this.enemies.push(e);
    app.audio.chirp('hello', this.pan(e));
    return e;
  }
  leashes(boss) {
    if (!boss.alive || this.state !== 'play') return;
    const n = 3 + Math.min(2, this.cfg.tier || 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(0, 0.5);
      const e = this.spawn('wisp', { x: Math.cos(a) * 0.55 / Math.max(1, this.app.aspect * 0.8), y: 0.34 + Math.sin(a) * 0.24, z: 13 });
      e.leashTo(boss);
    }
    boss.shielded = true; boss.leashHp = boss.hp;
    this.app.hud.callout('LEASHED');
  }
  pickSlot() {
    let best = null, bd = -1;
    for (let i = 0; i < 8; i++) {
      const mx = this.app.aspect < 1 ? 0.5 : 0.7; const c = { x: rand(-mx, mx), y: rand(0.10, 0.56), z: this.app.aspect < 1 ? rand(10.5, 14.5) : rand(6.5, 10) };
      let d = 9;
      for (const e of this.enemies) if (e.ndcSlot) d = Math.min(d, Math.hypot(e.ndcSlot.x - c.x, (e.ndcSlot.y - c.y) * 1.4));
      if (d > bd) { bd = d; best = c; }
    }
    return best;
  }

  // ---------- deflection: the bolt returns if the blade is in its path when it arrives
  // Deflection is physical: every frame the bolt's own position is tested against the area the blade just swept.
  // If they meet anywhere within arm's reach, the bolt turns at that exact point. No timing window.
  checkDeflect(rdt) {
    const { app } = this; const H = app.size.h;
    this.real += rdt;
    const seg = app.bladeScreen();
    const last = this.hist[this.hist.length - 1] || seg;
    const speed = (Math.hypot(seg.bx - last.bx, seg.by - last.by) + Math.hypot(seg.ax - last.ax, seg.ay - last.ay) * 0.5) / H / Math.max(rdt, 1e-3);
    this.swipe = Math.max(speed, this.swipe * Math.exp(-rdt * 7));
    seg.t = this.real; this.hist.push(seg);
    while (this.hist.length > 2 && this.real - this.hist[0].t > 0.09) this.hist.shift();   // the sweep of the last few frames
    const live = app.sword.canDeflect && this.state === 'play';
    let hold = false;
    for (const b of this.bolts.items) {
      if (!b.live || b.state !== 'in' || b.done || b.t < 0) continue;
      const rad = H * (0.04 * Math.sqrt(b.size) + (app.coarse ? 0.018 : 0)) * (this.tempoLive > 0 ? 1.4 : 1);
      // guidance: the ring fills when your blade lies across where the bolt is heading
      const qt = app.project(b.T);
      const onRing = live && distPointSeg(qt.x, qt.y, seg.ax, seg.ay, seg.bx, seg.by) <= rad;
      b.lock = (b.lock || 0) + ((onRing ? 1 : 0) - (b.lock || 0)) * clamp(rdt * 22);
      if (!live || b.depth > REACH_FAR) continue;
      // the bolt itself, where it is right now, against the blade and its recent sweep
      const q = app.project(b.pos), qp = app.project(b.prev);
      let d = 1e9;
      for (let i = 0; i < this.hist.length; i++) {
        const s2 = this.hist[i], p = this.hist[Math.max(0, i - 1)];
        for (let k = 0; k <= 1; k += 0.5) {
          const ax = lerp(p.ax, s2.ax, k), ay = lerp(p.ay, s2.ay, k), bx = lerp(p.bx, s2.bx, k), by = lerp(p.by, s2.by, k);
          d = Math.min(d, distPointSeg(q.x, q.y, ax, ay, bx, by), distPointSeg((q.x + qp.x) / 2, (q.y + qp.y) / 2, ax, ay, bx, by));
        }
      }
      if (d <= rad) { this.riposte(b, q, this.swipe > 0.85 || this.tempoLive > 0); continue; }
      // first run: the very first bolt hangs just short of you until your blade is across it
      if (this.tut === 1 && b.depth < 1.75) hold = true;
    }
    if (hold !== this.hold) { this.hold = hold; app.hud.hint(hold ? (app.coarse ? 'Drag your blade across the bolt' : 'Move your blade across the bolt') : null); }
  }

  riposte(b, q, strong) {
    const { app } = this; const sw = app.sword;
    b.done = true;
    this.combo++; this.returned++; this.streak = Math.max(this.streak, this.combo); if (strong) this.ripostes++;
    this.chain = this.clock - this.lastDeflect < 0.3 ? this.chain + 1 : 1; this.lastDeflect = this.clock;
    const mult = this.mult;
    const pts = 50 * mult * (strong ? 2 : 1) + (this.chain > 1 ? 100 * (this.chain - 1) : 0);
    this.addScore(pts);
    app.hud.setCombo(this.combo, mult);
    // guided first steps: cover one, then swing through one
    if (this.tut === 1) { this.tut = 2; this.hold = false; app.hud.hint('Good. Now swing through the next one — a hard swing is a riposte'); }
    else if (this.tut === 2 && strong) { this.tut = 0; app.hud.hint(null); try { localStorage.setItem('riposte.tut', '1'); } catch {} }
    const target = b.enemy.alive ? b.enemy : this.nearest(b.pos);
    const col = sw.color;
    _v.subVectors(b.S, b.T).normalize();
    app.fx.sparks.burst(b.pos, _c.copy(col).lerp(WHITE, 0.5), strong ? 46 : 22, strong ? 11 : 7, { dir: _v, spread: 0.8, life: 0.5, bright: strong ? 6 : 4 });
    app.fx.sparks.burst(b.pos, b.color, 10, 5, { life: 0.3, bright: 3 });
    app.fx.glows.emit(b.pos, WHITE, strong ? 0.16 : 0.11, 0.1, { bright: strong ? 4 : 3 });
    app.fx.glows.emit(b.pos, col, strong ? 0.2 : 0.14, 0.2, { bright: 1.0 });
    app.fx.rings.emit(b.pos, strong ? GOLD : col, { r0: 0.06, r1: strong ? 0.5 : 0.3, life: 0.26, bright: strong ? 2.6 : 1.8 });
    app.env.flash(b.pos, col, strong ? 2.4 : 1.5, 0.3);
    app.post.shock(q.x / app.size.w, 1 - q.y / app.size.h, strong ? 0.7 : 0.3, 1.1);
    app.addTrauma(strong ? 0.28 : 0.12); app.kick(strong ? 1 : 0.4); sw.clash(strong ? 0.7 : 0.4);
    this.stopT = strong ? 0.07 : 0.03;
    app.audio.deflect(strong, this.combo - 1, q.nx * 0.7); if (strong) app.audio.accent('riposte');
    app.feedback(strong ? 'riposte' : 'return');
    if (this.chain === 2) app.hud.callout('DOUBLE'); else if (this.chain === 3) app.hud.callout('TRIPLE'); else if (this.chain >= 4) app.hud.callout('FLÈCHE', true);
    else if (strong) app.hud.callout('RIPOSTE', true);
    else if (this.combo % 10 === 0) app.hud.callout(`${this.combo} RETURNED`);
    app.hud.floater(q.x, q.y - 26, `+${pts}`, strong);
    app.env.setStreak(this.combo);
    if (target) {
      target.scared = 1; app.audio.chirp('yelp', this.pan(target));
      // the return leaves the blade bent the way you were swinging
      _v.copy(sw.tipVel); const sp = _v.length(); if (sp > 1e-3) _v.divideScalar(sp).transformDirection(app.camera.matrixWorld).multiplyScalar(clamp(sp * 0.35, 0, 3.2)); else _v.set(0, 0, 0);
      this.bolts.send(b, target, col, strong, _v);
      if (this.tempoLive > 0) { const other = this.enemies.find((e) => e !== target && e.alive && !e.shielded); if (other) this.bolts.echo(b.pos, other, GOLD); }
    } else this.bolts.kill(b);
    if (this.tempoLive <= 0) {
      this.tempo = Math.min(TEMPO_MAX, this.tempo + (strong ? 2 : 1));
      if (this.tempo >= TEMPO_MAX) this.startTempo(); else app.hud.setTempo(this.tempo / TEMPO_MAX, false);
    }
  }
  startTempo() {
    const { app } = this;
    this.tempoLive = TEMPO_TIME; this.tempo = 0; app.sword.overTarget = 1;
    app.hud.callout('TEMPO — TIME BENDS', true); app.audio.tempo(true); app.addTrauma(0.3);
    app.env.courtPulse(0, 0, 1.2);
  }
  nearest(p) { let best = null, bd = 1e9; for (const e of this.enemies) { const d = e.group.position.distanceTo(p); if (e.alive && !e.shielded && d < bd) { bd = d; best = e; } } return best; }
  addScore(n) { this.score += n; this.app.hud.setScore(this.score); }

  onReturnHit(b) {
    const { app } = this; const e = b.target; const col = b.color;
    if (!e.alive) { app.fx.sparks.burst(b.pos, col, 14, 6, { life: 0.4 }); return; }
    const dmg = e.type === 'bastion' ? (b.strong ? 3 : 1) : (b.strong ? 2 : 1);
    const res = e.damage(dmg);
    const p = e.group.position, q = app.project(p), pan = q.nx * 0.8;
    app.fx.sparks.burst(p, _c.copy(col).lerp(WHITE, 0.4), 22, 9, { life: 0.5, bright: e.boss ? 2.5 : 5 });
    app.env.flash(p, col, e.boss ? 2 : 4, 0.3);
    if (res === 'dead') return this.kill(e, b.strong);
    if (res === 'immune') { app.hud.floater(q.x, q.y, 'SHIELDED'); app.audio.shield(pan); return; }
    if (res === 'shield') { app.fx.sparks.burst(p, e.color, 60, 12, { life: 0.7, bright: 4 }); app.fx.debris.burst(p, 9, 8, 1.3); app.fx.rings.emit(p, e.color, { r0: 1, r1: 4, life: 0.5, bright: 3 }); app.audio.shield(pan); app.hud.floater(q.x, q.y, 'ARMOUR BROKEN'); }
    else if (res === 'phase') { app.hud.callout(e.type === 'bastion' ? 'SHELL SHATTERED' : 'SECOND MOVEMENT', true); app.fx.debris.burst(p, 26, 12, 1.6); app.fx.rings.emit(p, e.color, { r0: 1, r1: 5, life: 0.7, bright: 2 }); app.audio.explode(false, pan); app.audio.accent('phase'); app.addTrauma(0.4); this.slowT = 0.5; this.slowScale = 0.3; }
    else { app.audio.explode(false, pan); app.fx.glows.emit(p, col, 0.7, 0.18, { bright: 1.2 }); if (e.boss) app.hud.floater(q.x, q.y, `−${dmg}`, b.strong); }
    if (e.boss) {
      app.hud.boss(null, clamp(e.hp / e.maxHp));
      // the Hydra regrows its leashes each time it loses three
      if (e.type === 'hydra' && e.leashHp - e.hp >= 3) this.after(0.6, () => this.leashes(e));
    }
    app.post.shock(q.x / app.size.w, 1 - q.y / app.size.h, 0.3, 1.2);
  }

  kill(e, strong) {
    const { app } = this; const p = e.group.position.clone(), q = app.project(p);
    const big = e.boss, s = big ? 2 : 1.3;
    this.glanceP = p; this.glanceT = 0.6;
    const pts = e.T.score * this.mult;
    this.addScore(pts);
    app.hud.floater(q.x, q.y, `+${pts.toLocaleString('en-US')}`, strong);
    app.fx.sparks.burst(p, e.color, big ? 220 : 70, big ? 22 : 13, { life: 0.9, bright: 5, grav: 6, drag: 1.6 });
    app.fx.sparks.burst(p, WHITE, big ? 80 : 26, big ? 30 : 18, { life: 0.45, bright: 6, grav: 2 });
    app.fx.debris.burst(p, big ? 60 : 12, big ? 16 : 9, big ? 1.8 : 1);
    app.fx.glows.emit(p, WHITE, 1.2 * s, 0.16, { bright: 3.5 });
    app.fx.glows.emit(p, e.color, 2.8 * s, 0.45, { bright: 1.1 });
    app.fx.rings.emit(p, e.color, { r0: 0.4, r1: 3.0 * s, life: 0.55, bright: 3 });
    app.fx.rings.emit(_v.set(p.x, 0.03, p.z), e.color, { r0: 0.5, r1: 4 * s, life: 0.9, flat: true, bright: 1.4, thin: 0.03 });
    app.env.flash(p, e.color, big ? 22 : 9, big ? 1.0 : 0.5);
    app.env.ripple(p.x, p.z, big ? 2.4 : 1.2);
    app.post.shock(q.x / app.size.w, 1 - q.y / app.size.h, big ? 1.4 : 0.7, 0.8);
    app.addTrauma(big ? 0.9 : 0.3);
    app.audio.explode(big, q.nx * 0.8); app.feedback(big ? 'boss' : 'kill'); if (!big) app.audio.accent('kill');
    if (big) {
      for (let i = 1; i <= 5; i++) this.after(i * 0.16, () => { _v.copy(p).add(new THREE.Vector3(rand(-3, 3), rand(-2, 2), rand(-1, 1))); app.fx.sparks.burst(_v, e.color, 60, 14, { life: 0.8, bright: 5 }); app.fx.glows.emit(_v, WHITE, 4, 0.25, { bright: 5 }); app.env.flash(_v, e.color, 12, 0.4); app.audio.explode(i === 5, rand(-0.5, 0.5)); app.addTrauma(0.4); });
      app.env.courtPulse(0, 0, 2); app.hud.boss(null, 0);
    }
    e.dispose(); this.enemies = this.enemies.filter((x) => x !== e);
    // a Hydra with no leashes left is exposed
    if (e.tetherTo && e.tetherTo.alive && !this.enemies.some((x) => x.tetherTo === e.tetherTo)) { e.tetherTo.shielded = false; app.hud.callout('EXPOSED', true); }
    if (this.state !== 'play') return;
    const bossGone = big || !this.enemies.some((x) => x.boss);
    if (!this.queue.length && (!this.enemies.length || (this.cfg.boss && bossGone))) {
      this.slowT = big ? 1.8 : 1.0; this.slowScale = 0.22;
      app.hud.callout(big ? `${e.T.name.replace('The ', '').toUpperCase()} SILENCED` : 'TOUCHÉ', true);
      for (const b of this.bolts.items) if (b.live && b.state === 'in') { app.fx.sparks.burst(b.pos, b.color, 8, 4, { life: 0.4 }); this.bolts.kill(b); }
      const rest = [...this.enemies]; this.enemies = [];
      rest.forEach((x, i) => { app.fx.sparks.burst(x.group.position, x.color, 40, 10, { life: 0.6, bright: 4 }); app.fx.debris.burst(x.group.position, 8, 8); x.dispose(); });
      this.endBout();
    }
  }

  onPlayerHit(b) {
    const { app } = this;
    if (this.state !== 'play' || this.invuln > 0) return;
    this.integrity--; this.combo = 0; this.invuln = 0.9; this.hitFlash = 0.6;
    if (b && b.T) { const q = app.project(b.T); app.hud.floater(q.x, q.y, 'MISSED'); app.fx.rings.emit(b.T, b.color, { r0: 0.05, r1: 0.5, life: 0.4, bright: 2.5 }); }
    app.hud.setPips(this.integrity); app.hud.setCombo(0, 1); app.sword.setIntegrity(this.integrity);
    app.addTrauma(0.85); app.sword.disturb(1.2); app.audio.hit(); app.feedback('hit');
    app.env.setStreak(0); app.audio.lanterns(); app.env.heart = this.integrity === 1;
    for (const e of this.enemies) e.gloat = 1;
    this.after(0.35, () => app.audio.chirp('laugh', 0));
    app.post.shock(0.5, 0.5, 0.6, 1.4);
    if (this.integrity <= 0) this.die(); else app.hud.callout(this.integrity === 1 ? 'LAST GUARD' : 'TOUCHED');
  }

  // ---------- frame
  update(gdt, rdt) {
    const { app } = this;
    for (const t of this.timers) t.t -= t.real ? rdt : gdt > 0 ? rdt : 0;
    const due = this.timers.filter((t) => t.t <= 0); this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();
    this.clock += gdt;
    this.stopT = Math.max(0, this.stopT - rdt); this.slowT = Math.max(0, this.slowT - rdt);
    this.invuln = Math.max(0, this.invuln - gdt); this.hitFlash = Math.max(0, this.hitFlash - rdt * 1.6);

    if (this.state === 'play' && !this.paused) {
      this.spawnT -= gdt;
      if (this.queue.length && this.enemies.length < this.cfg.maxAlive && this.spawnT <= 0) { this.spawn(this.queue.shift()); this.spawnT = rand(0.7, 1.3); }
      if (this.cfg.boss === 'maestro' || this.cfg.boss === 'bastion') {
        this.escortT -= gdt;
        if (this.boss && this.boss.alive && this.escortT <= 0 && this.enemies.length < 3) { this.spawn(pick(this.cfg.boss === 'bastion' ? ['lancer', 'wisp'] : ['wisp', 'wisp', 'twin'])); this.escortT = rand(7, 10); }
      }
      if (this.tempoLive > 0) {
        this.tempoLive -= rdt; app.hud.setTempo(clamp(this.tempoLive / TEMPO_TIME), true);
        if (this.tempoLive <= 0) { app.sword.overTarget = 0; app.audio.tempo(false); app.hud.setTempo(0, false); }
      }
    }
    // where the orbs' eyes go: your cursor on the menus, a comrade's explosion for a beat, otherwise your blade
    this.glanceT = (this.glanceT || 0) - rdt;
    app.look = this.state === 'menu' ? app.ndcToWorld(app.input.ndc.x, app.input.ndc.y, 2.5, this._look || (this._look = new THREE.Vector3())) : this.glanceT > 0 ? this.glanceP : null;
    // on the menus a curious Remote drifts in, looks you over, and leaves
    if (this.state === 'menu') {
      this.visitT = (this.visitT ?? 4) - rdt;
      if (this.visitT <= 0 && !this.enemies.length) {
        this.visitT = rand(9, 15);
        const e = this.spawn('wisp', { x: rand(-0.55, 0.55) * Math.min(1, app.aspect), y: rand(0.05, 0.3), z: rand(5.5, 8) });
        this.after(rand(4, 6), () => e.alive && e.leave());
      }
    }
    const sheathed = this.state === 'play' && !this.paused && app.sword.state === 'off';
    if (sheathed !== this.sheathed) { this.sheathed = sheathed; if (sheathed) app.hud.hint(app.coarse ? 'Blade sheathed — tap to ignite' : 'Blade sheathed — click or press Space'); else if (!this.hold && !this.tut) app.hud.hint(null); }
    for (const e of this.enemies) e.update(gdt, app.time, this);
    if (this.enemies.some((e) => e.gone)) { for (const e of this.enemies) if (e.gone) e.dispose(); this.enemies = this.enemies.filter((e) => !e.gone); }
    this.bolts.update(gdt, this);
    this.checkDeflect(rdt);
    if (app.autoplay) this.bot();
    // how hard it is right now: bolts in the air, orbs alive, your streak, your last guard
    app.audio.setIntensity(this.state !== 'play' ? 0 : clamp(this.bolts.incoming.length * 0.17 + this.enemies.length * 0.07 + this.combo / 40 + (this.integrity === 1 ? 0.22 : 0) + (this.tempoLive > 0 ? 0.15 : 0)));
  }

  // debug/attract bot. true = perfect; 'human' = reacts late, aims roughly, then holds; 'swing' = slashes through with sloppy timing
  bot() {
    const mode = this.app.autoplay, inp = this.app.input, dt = 1 / 60;
    const inc = this.bolts.incoming.filter((b) => !b.done && b.t >= 0).sort((a, b) => (a.dur - a.t) - (b.dur - b.t))[0];
    if (!inc) { if (mode === true) inp.set(Math.sin(this.app.time * 0.7) * 0.2, -0.1 + Math.sin(this.app.time * 0.9) * 0.1); return; }
    const rem = inc.dur - inc.t;
    if (mode === 'human') {
      if (inc._e === undefined) { inc._e = { x: rand(-0.035, 0.035), y: rand(-0.045, 0.045), react: rand(0.75, 1.0) }; }
      if (rem > inc._e.react) return;                          // has not noticed it yet
      const tx = inc.ndc.x + inc._e.x, ty = inc.ndc.y + inc._e.y, dx = tx - inp.ndc.x, dy = ty - inp.ndc.y, d = Math.hypot(dx, dy), sp = 3.2 * dt;
      inp.set(inp.ndc.x + (d > sp ? dx / d * sp : dx), inp.ndc.y + (d > sp ? dy / d * sp : dy));
    } else if (mode === 'swing') {
      if (inc._s === undefined) inc._s = { at: rand(0.02, 0.2), a: rand(0, 6.28) };
      const ox = Math.cos(inc._s.a) * 0.3, oy = Math.sin(inc._s.a) * 0.22, k = clamp((inc._s.at + 0.12 - rem) / 0.12);
      if (rem > inc._s.at + 0.12) inp.set(lerp(inp.ndc.x, inc.ndc.x - ox, 0.2), lerp(inp.ndc.y, inc.ndc.y - oy, 0.2));
      else inp.set(inc.ndc.x - ox + 2 * ox * k, inc.ndc.y - oy + 2 * oy * k);
    } else {
      if (rem > 0.12) inp.set(lerp(inp.ndc.x, inc.ndc.x - 0.2, 0.25), lerp(inp.ndc.y, inc.ndc.y - 0.1, 0.25));
      else { const c = 1 - Math.cos((0.12 - rem) * 30); inp.set(inc.ndc.x - 0.2 + c * 0.2, inc.ndc.y - 0.1 + c * 0.1); }
    }
  }
}
