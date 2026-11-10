// Rules, bouts, scoring, deflection. You cannot attack: every point comes from sending a bolt home.
import * as THREE from 'three';
import { Enemy, TYPES } from './enemies.js';
import { Bolts } from './bolts.js';
import { clamp, rand, pick, distPointSeg, lerp } from '../core/util.js';
import { ROMAN } from '../ui/hud.js';

const WHITE = new THREE.Color(1, 1, 1);
const _v = new THREE.Vector3(), _c = new THREE.Color();
const TEMPO_MAX = 18, TEMPO_TIME = 6.5;
const RANKS = [[0, 'Novice'], [1500, 'Initiate'], [5000, 'Duelist'], [12000, 'Bretteur'], [24000, 'Maître'], [45000, 'Grand Maître']];

function boutConfig(n) {
  const base = [
    null,
    { queue: ['wisp', 'wisp', 'wisp'], maxAlive: 1, dur: 2.0, maxBolts: 1, cd: 1.0, sub: 'Swipe through the ring as it closes' },
    { queue: ['wisp', 'wisp', 'twin', 'wisp', 'twin'], maxAlive: 2, dur: 1.85, maxBolts: 2, cd: 1.0, sub: 'One swing can return two' },
    { queue: ['wisp', 'lancer', 'twin', 'wisp', 'lancer', 'twin'], maxAlive: 3, dur: 1.75, maxBolts: 3, cd: 0.95, sub: 'Lancers aim before they fire' },
    { queue: ['bulwark', 'wisp', 'lancer', 'bulwark', 'twin', 'wisp', 'lancer'], maxAlive: 3, dur: 1.65, maxBolts: 3, cd: 0.9, sub: 'A perfect return breaks any shield' },
    { queue: ['maestro'], maxAlive: 3, dur: 1.9, maxBolts: 7, cd: 1.0, boss: true, sub: 'It conducts. You answer.' },
  ];
  if (n <= 5) return base[n];
  const k = n - 5;
  if (n % 5 === 0) return { queue: ['maestro'], maxAlive: 3, dur: Math.max(1.3, 1.9 - k * 0.04), maxBolts: 8, cd: 0.85, boss: true, bossHp: 12 + k * 2, sub: 'Da capo' };
  const count = Math.min(14, 6 + k), bag = ['wisp', 'wisp', 'twin', 'twin', 'lancer', 'lancer', 'bulwark'];
  return { queue: Array.from({ length: count }, () => pick(bag)), maxAlive: Math.min(5, 3 + Math.floor(k / 2)), dur: Math.max(1.05, 1.6 - k * 0.06), maxBolts: Math.min(6, 3 + Math.floor(k / 2)), cd: Math.max(0.6, 0.9 - k * 0.04), sub: pick(['En garde', 'Allez', 'Tempo rising', 'Hold the line']) };
}

export class Game {
  constructor(app) {
    this.app = app;
    this.bolts = new Bolts(app);
    this.enemies = [];
    this.state = 'title'; this.paused = false;
    this.timers = [];
    this.prevSeg = null; this.prevPtr = null; this.swipe = 0;
    this.slowT = 0; this.slowScale = 1; this.stopT = 0;
    this.tempo = 0; this.tempoLive = 0;
    this.hitFlash = 0; this.invuln = 0; this.lastFire = 0; this.clock = 0;
    this.cdScale = 1; this.cfg = boutConfig(1);
    this.reset();
    try { this.best = +localStorage.getItem('riposte.best') || 0; } catch { this.best = 0; }
  }
  reset() {
    this.score = 0; this.combo = 0; this.streak = 0; this.returned = 0; this.perfects = 0; this.bout = 0; this.integrity = 3;
    this.tempo = 0; this.tempoLive = 0; this.chain = 0; this.lastDeflect = -9; this.firstReturn = false;
  }
  after(sec, fn, real = false) { this.timers.push({ t: sec, fn, real }); }
  get timeScale() {
    if (this.paused) return 0;
    if (this.stopT > 0) return 0.03;
    if (this.slowT > 0) return this.slowScale;
    return this.tempoLive > 0 ? 0.5 : 1;
  }

  // ---------- flow
  primary() {
    if (this.state === 'title') this.start();
  }
  start() {
    const { app } = this;
    this.reset(); this.state = 'starting'; this.clock = 0;
    for (const e of this.enemies) e.dispose(); this.enemies = []; this.bolts.clear();
    app.hud.showTitle(false); app.hud.showEnd(false);
    app.hud.setScore(0); app.hud.setCombo(0); app.hud.setPips(3); app.hud.setTempo(0, false);
    app.sword.setIntegrity(3); app.sword.overTarget = 0;
    app.sword.ignite();
    app.pose = 'title';
    this.after(1.25, () => { app.pose = 'play'; app.hud.showHud(true); this.beginBout(1); });
  }
  beginBout(n) {
    const { app } = this;
    this.bout = n; this.cfg = boutConfig(n); this.queue = [...this.cfg.queue]; this.cdScale = this.cfg.cd;
    this.state = 'play'; this.spawnT = 1.1; this.escortT = 7;
    app.hud.setBout(n); app.hud.banner(this.cfg.boss ? 'The Maestro' : 'En garde', `BOUT ${ROMAN(n)}`, this.cfg.sub, 2100);
    app.audio.stinger(n); app.audio.setPlaying(true);
  }
  endBout() {
    const { app } = this;
    this.state = 'intermission';
    this.after(1.0, () => { app.sword.retract(); app.pose = 'rest'; app.audio.setPlaying(false); });
    this.after(1.3, () => {
      const heal = this.integrity < 3;
      if (heal) { this.integrity++; app.hud.setPips(this.integrity); app.sword.setIntegrity(this.integrity); }
      app.hud.banner('Bout cleared', 'TOUCHÉ', heal ? 'Integrity restored' : `${this.score.toLocaleString('en-US')} points`, 1500);
    });
    this.after(3.1, () => { app.sword.ignite(); app.pose = 'play'; });
    this.after(3.7, () => this.beginBout(this.bout + 1));
  }
  die() {
    const { app } = this;
    this.state = 'dead'; this.tempoLive = 0; app.sword.overTarget = 0;
    app.audio.setPlaying(false); app.audio.death();
    app.sword.disturb(1.6);
    for (const b of this.bolts.items) if (b.live) { app.fx.sparks.burst(b.pos, b.color, 8, 4, { life: 0.4 }); this.bolts.kill(b); }
    this.slowT = 1.6; this.slowScale = 0.25;
    this.after(0.45, () => { app.sword.retract(); app.pose = 'rest'; }, true);
    this.after(2.3, () => {
      const newBest = this.score > this.best;
      if (newBest) { this.best = this.score; try { localStorage.setItem('riposte.best', this.best); } catch {} }
      let rank = RANKS[0][1]; for (const [s, r] of RANKS) if (this.score >= s) rank = r;
      this.result = { score: this.score, returned: this.returned, perfect: this.perfects, streak: this.streak, bout: this.bout, rank, newBest, best: this.best };
      app.hud.showHud(false); app.hud.showEnd(true, this.result);
    }, true);
  }
  togglePause() {
    const { app } = this;
    if (this.state !== 'play' && !this.paused) return;
    if (!this.paused) { this.paused = true; app.sword.retract(); app.pose = 'rest'; app.hud.showPaused(true); app.audio.setPlaying(false); }
    else { app.hud.showPaused(false); app.sword.ignite(); app.pose = 'play'; this.after(0.7, () => { this.paused = false; app.audio.setPlaying(true); }, true); }
  }
  shareText() {
    const r = this.result; if (!r) return '';
    return `I returned ${r.returned} bolts to sender and reached Bout ${ROMAN(r.bout)} in RIPOSTE — ${r.score.toLocaleString('en-US')} pts, rank ${r.rank}.\nYou can't attack. You can only send it back.`;
  }

  // ---------- enemy hooks
  canFire(e) {
    if (this.state !== 'play') return false;
    const inc = this.bolts.incoming.length;
    if (e.type === 'maestro') return inc === 0 || inc < 2;
    return inc < this.cfg.maxBolts && this.clock - this.lastFire > 0.5;
  }
  onCharge(e) {
    this.lastFire = this.clock;
    e.aim = this.pickTarget();
    e.aimW = this.app.ndcToWorld(e.aim.x, e.aim.y, 2.3);
    this.app.audio.charge(this.pan(e));
  }
  onFire(e) {
    const d = this.cfg.dur, a = e.aim || this.pickTarget();
    const asp = this.app.aspect;
    if (e.type === 'wisp') this.fireAt(e, a, d);
    else if (e.type === 'lancer') this.fireAt(e, a, d * 0.58);
    else if (e.type === 'bulwark') this.fireAt(e, a, d * 1.15, { size: 1.5 });
    else if (e.type === 'twin') {
      const ang = rand(0, Math.PI * 2), r = 0.36;
      const b = { x: clamp(a.x + Math.cos(ang) * r / asp, -0.8, 0.8), y: clamp(a.y + Math.sin(ang) * r, -0.5, 0.45) };
      this.fireAt(e, a, d); this.fireAt(e, b, d, { delay: 0.2 });
    } else if (e.type === 'maestro') {
      const p2 = e.phase === 2, pat = pick(p2 ? ['arc', 'arc', 'line', 'burst', 'cross'] : ['arc', 'line', 'burst']);
      const n = p2 ? 6 : 5, gap = p2 ? 0.115 : 0.14, dd = d * (p2 ? 0.9 : 1);
      if (pat === 'arc') {
        const a0 = rand(0, Math.PI * 2), dir = Math.random() < 0.5 ? 1 : -1, R = 0.36;
        for (let i = 0; i < n; i++) { const ang = a0 + dir * i * (2.0 / (n - 1)); this.fireAt(e, { x: Math.cos(ang) * R / asp * Math.min(1, asp), y: Math.sin(ang) * R - 0.03 }, dd, { delay: i * gap }); }
      } else if (pat === 'line') {
        const ang = rand(-0.5, 0.5) + (Math.random() < 0.5 ? Math.PI : 0), L = Math.min(0.62, 0.62 * asp);
        for (let i = 0; i < n; i++) { const k = i / (n - 1) - 0.5; this.fireAt(e, { x: Math.cos(ang) * k * 2 * L, y: Math.sin(ang) * k * 0.7 - 0.02 }, dd, { delay: i * gap }); }
      } else if (pat === 'cross') {
        for (let i = 0; i < 4; i++) { const s = i % 2 ? 1 : -1, k = i < 2 ? 1 : -1; this.fireAt(e, { x: s * 0.32 * Math.min(1, asp), y: k * s * 0.26 }, dd, { delay: i * 0.3 }); }
      } else {
        const c = this.pickTarget();
        for (let i = 0; i < 3; i++) this.fireAt(e, c, dd, { delay: i * 0.34, size: 1.25 });
      }
    }
  }
  fireAt(e, ndc, dur, opts = {}) {
    const T = this.app.ndcToWorld(ndc.x, ndc.y, 2.3);
    const b = this.bolts.fire(e, e.muzzle.clone(), T, dur, opts);
    if (b) { b.ndc = ndc; this.app.audio.fire(e.type, this.pan(e)); }
  }
  pickTarget() {
    const asp = this.app.aspect, mx = asp < 1 ? 0.7 : 0.6;
    let best = null, bestD = -1;
    for (let i = 0; i < 10; i++) {
      const c = { x: rand(-mx, mx), y: rand(-0.44, 0.38) };
      let d = 9;
      for (const b of this.bolts.incoming) if (b.ndc) d = Math.min(d, Math.hypot((b.ndc.x - c.x) * asp, b.ndc.y - c.y));
      if (d > bestD) { bestD = d; best = c; }
      if (d > 0.5) break;
    }
    return best;
  }
  pan(e) { return clamp(this.app.project(e.group.position).nx, -1, 1) * 0.8; }

  spawn(type) {
    const { app } = this;
    const e = new Enemy(type, app);
    if (type === 'maestro') { if (this.cfg.bossHp) e.hp = e.maxHp = this.cfg.bossHp; e.place(app.ndcToWorld(0, 0.36, 19)); }
    else e.place(this.pickSlot());
    this.enemies.push(e);
    return e;
  }
  pickSlot() {
    const { app } = this; let best = null, bd = -1;
    for (let i = 0; i < 8; i++) {
      const c = { x: rand(-0.72, 0.72), y: rand(0.06, 0.58), z: rand(9, 14) };
      let d = 9;
      for (const e of this.enemies) if (e.ndcSlot) d = Math.min(d, Math.hypot(e.ndcSlot.x - c.x, (e.ndcSlot.y - c.y) * 1.4));
      if (d > bd) { bd = d; best = c; }
    }
    const w = app.ndcToWorld(best.x, best.y, best.z);
    w.y = Math.max(w.y, 1.4);
    this._lastSlot = best;
    return w;
  }

  // ---------- deflection
  inWindow(b) { return b.state === 'in' && !b.done && b.t >= b.dur - 0.25 && b.t <= b.dur + 0.10; }

  checkDeflect(rdt) {
    const { app } = this; const H = app.size.h;
    const seg = app.bladeScreen(), ptr = { x: app.input.px, y: app.input.py };
    const prev = this.prevSeg || seg, pp = this.prevPtr || ptr;
    const speed = (Math.hypot(seg.bx - prev.bx, seg.by - prev.by) + Math.hypot(ptr.x - pp.x, ptr.y - pp.y) * 0.6) / H / Math.max(rdt, 1e-3);
    this.swipe = Math.max(speed, this.swipe * Math.exp(-rdt * 9));
    if (app.sword.canDeflect && this.state === 'play') {
      for (const b of this.bolts.items) {
        if (!b.live || !this.inWindow(b)) continue;
        const q = app.project(b.T);
        const rad = H * (0.066 * Math.sqrt(b.size) + (app.coarse ? 0.02 : 0));
        let d = distPointSeg(q.x, q.y, pp.x, pp.y, ptr.x, ptr.y);
        for (let s = 0; s <= 1.001; s += 0.25) {
          d = Math.min(d, distPointSeg(q.x, q.y, lerp(prev.ax, seg.ax, s), lerp(prev.ay, seg.ay, s), lerp(prev.bx, seg.bx, s), lerp(prev.by, seg.by, s)));
        }
        if (d > rad) continue;
        if (this.swipe > 0.5 || this.tempoLive > 0) this.riposte(b, q); else this.block(b, q);
      }
    }
    this.prevSeg = seg; this.prevPtr = ptr;
  }

  block(b, q) {
    const { app } = this;
    b.done = true;
    app.fx.sparks.burst(b.pos, b.color, 16, 5, { life: 0.35, bright: 3 });
    app.fx.glows.emit(b.pos, b.color, 0.35, 0.2, { bright: 2.2 });
    app.env.flash(b.pos, b.color, 2, 0.2);
    app.audio.block(q.nx * 0.6); app.addTrauma(0.15); app.sword.disturb(0.35);
    app.hud.callout('PARRY');
    if (!this.firstReturn) app.hud.hint('A still blade only blocks — swing through it');
    this.bolts.kill(b);
  }

  riposte(b, q) {
    const { app } = this; const sw = app.sword;
    const perfect = this.tempoLive > 0 || Math.abs(b.t - (b.dur - 0.035)) < 0.075;
    b.done = true;
    this.combo++; this.returned++; this.streak = Math.max(this.streak, this.combo); if (perfect) this.perfects++;
    this.chain = this.clock - this.lastDeflect < 0.3 ? this.chain + 1 : 1; this.lastDeflect = this.clock;
    const mult = 1 + Math.floor(this.combo / 5);
    let pts = 50 * mult * (perfect ? 2 : 1) + (this.chain > 1 ? 100 * (this.chain - 1) : 0);
    this.addScore(pts);
    app.hud.setCombo(this.combo);
    if (!this.firstReturn) { this.firstReturn = true; app.hud.hint(null); }
    // where it goes: back to whoever fired it (or the nearest survivor if they are already gone)
    let target = b.enemy.alive ? b.enemy : this.nearest(b.pos);
    const col = sw.color;
    // impact dressing
    _v.subVectors(b.S, b.T).normalize();
    app.fx.sparks.burst(b.pos, _c.copy(col).lerp(WHITE, 0.5), perfect ? 46 : 24, perfect ? 11 : 8, { dir: _v, spread: 0.8, life: 0.5, bright: perfect ? 6 : 4 });
    app.fx.sparks.burst(b.pos, b.color, 10, 5, { life: 0.3, bright: 3 });
    app.fx.glows.emit(b.pos, WHITE, perfect ? 0.42 : 0.3, 0.14, { bright: perfect ? 4.5 : 3 });
    app.fx.glows.emit(b.pos, col, perfect ? 0.95 : 0.6, 0.28, { bright: 1.4 });
    app.fx.rings.emit(b.pos, perfect ? _c.setRGB(1, 0.85, 0.5) : col, { r0: 0.08, r1: perfect ? 0.6 : 0.4, life: 0.28, bright: perfect ? 2.6 : 1.8 });
    app.env.flash(b.pos, col, perfect ? 3.5 : 2.2, 0.3);
    app.post.shock(q.x / app.size.w, 1 - q.y / app.size.h, perfect ? 0.8 : 0.4, 1.1);
    app.addTrauma(perfect ? 0.3 : 0.16); app.kick(perfect ? 1 : 0.5);
    this.stopT = perfect ? 0.075 : 0.035;
    app.audio.deflect(perfect, this.combo - 1, q.nx * 0.7);
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive) { try { navigator.vibrate(perfect ? 22 : 10); } catch {} }
    if (this.chain === 2) app.hud.callout('DOUBLE'); else if (this.chain === 3) app.hud.callout('TRIPLE'); else if (this.chain >= 4) app.hud.callout('FLÈCHE', true);
    else if (perfect) app.hud.callout('PERFECT', true);
    else if (this.combo % 10 === 0) app.hud.callout(`${this.combo} RETURNED`);
    app.hud.floater(q.x, q.y - 26, `+${pts}`, perfect);
    if (target) {
      this.bolts.send(b, target, col, perfect);
      if (this.tempoLive > 0) { const other = this.enemies.find((e) => e !== target && e.alive); if (other) this.bolts.echo(b.pos, other, _c.setRGB(1, 0.8, 0.4)); }
    } else this.bolts.kill(b);
    // tempo meter
    if (this.tempoLive <= 0) {
      this.tempo = Math.min(TEMPO_MAX, this.tempo + (perfect ? 2 : 1));
      if (this.tempo >= TEMPO_MAX) this.startTempo(); else app.hud.setTempo(this.tempo / TEMPO_MAX, false);
    }
  }
  startTempo() {
    const { app } = this;
    this.tempoLive = TEMPO_TIME; this.tempo = 0; app.sword.overTarget = 1;
    app.hud.callout('TEMPO', true); app.audio.tempo(true); app.addTrauma(0.3);
    app.env.courtPulse(0, 0, 1.2);
  }
  nearest(p) { let best = null, bd = 1e9; for (const e of this.enemies) { const d = e.group.position.distanceTo(p); if (e.alive && d < bd) { bd = d; best = e; } } return best; }
  addScore(n) { this.score += n; this.app.hud.setScore(this.score); }

  onReturnHit(b) {
    const { app } = this; const e = b.target; const col = b.color;
    if (!e.alive) { app.fx.sparks.burst(b.pos, col, 14, 6, { life: 0.4 }); return; }
    const res = e.damage(b.perfect ? 2 : 1);
    const p = e.group.position, q = app.project(p), pan = q.nx * 0.8;
    app.fx.sparks.burst(p, _c.copy(col).lerp(WHITE, 0.4), 22, 9, { life: 0.5, bright: 5 });
    app.env.flash(p, col, 5, 0.3);
    if (res === 'dead') return this.kill(e, b.perfect);
    if (res === 'shield') { app.fx.sparks.burst(p, e.color, 60, 12, { life: 0.7, bright: 4 }); app.fx.rings.emit(p, e.color, { r0: 1, r1: 4, life: 0.5, bright: 3 }); app.audio.shield(pan); app.hud.floater(q.x, q.y, 'SHIELD DOWN'); }
    else if (res === 'phase') { app.hud.callout('SECOND MOVEMENT', true); app.fx.rings.emit(p, e.color, { r0: 1, r1: 9, life: 0.8, bright: 4 }); app.audio.explode(false, pan); app.addTrauma(0.4); this.slowT = 0.5; this.slowScale = 0.3; }
    else { app.audio.explode(false, pan); app.fx.glows.emit(p, col, 2.5, 0.25, { bright: 3 }); }
    if (e.type === 'maestro') app.hud.setBout(this.bout, `MAESTRO  ${'▮'.repeat(Math.max(0, e.hp))}${'▯'.repeat(Math.max(0, e.maxHp - e.hp))}`);
    app.post.shock(q.x / app.size.w, 1 - q.y / app.size.h, 0.3, 1.2);
  }

  kill(e, perfect) {
    const { app } = this; const p = e.group.position.clone(), q = app.project(p);
    const big = e.type === 'maestro', s = big ? 3 : e.T.scale;
    const mult = 1 + Math.floor(this.combo / 5), pts = e.T.score * mult;
    this.addScore(pts);
    app.hud.floater(q.x, q.y, `+${pts.toLocaleString('en-US')}`, perfect);
    app.fx.sparks.burst(p, e.color, big ? 220 : 70, big ? 22 : 13, { life: 0.9, bright: 5, grav: 6, drag: 1.6 });
    app.fx.sparks.burst(p, WHITE, big ? 80 : 26, big ? 30 : 18, { life: 0.45, bright: 6, grav: 2 });
    app.fx.debris.burst(p, big ? 60 : 12, big ? 16 : 9, big ? 1.8 : 1);
    app.fx.glows.emit(p, WHITE, 2.0 * s, 0.2, { bright: 4 });
    app.fx.glows.emit(p, e.color, 4.5 * s, 0.5, { bright: 1.3 });
    app.fx.rings.emit(p, e.color, { r0: 0.4, r1: 5.5 * s, life: 0.6, bright: 3.5 });
    app.fx.rings.emit(_v.set(p.x, 0.03, p.z), e.color, { r0: 0.5, r1: 7 * s, life: 0.9, flat: true, bright: 1.6, thin: 0.03 });
    app.env.flash(p, e.color, big ? 22 : 9, big ? 1.0 : 0.5);
    app.env.ripple(p.x, p.z, big ? 2.4 : 1.2);
    app.post.shock(q.x / app.size.w, 1 - q.y / app.size.h, big ? 1.4 : 0.7, 0.8);
    app.addTrauma(big ? 0.9 : 0.3);
    app.audio.explode(big, q.nx * 0.8);
    if (big) {
      for (let i = 1; i <= 5; i++) this.after(i * 0.16, () => { _v.copy(p).add(new THREE.Vector3(rand(-3, 3), rand(-2, 2), rand(-1, 1))); app.fx.sparks.burst(_v, e.color, 60, 14, { life: 0.8, bright: 5 }); app.fx.glows.emit(_v, WHITE, 4, 0.25, { bright: 5 }); app.env.flash(_v, e.color, 12, 0.4); app.audio.explode(i === 5, rand(-0.5, 0.5)); app.addTrauma(0.4); });
      app.env.courtPulse(0, 0, 2);
    }
    e.dispose(); this.enemies = this.enemies.filter((x) => x !== e);
    if (this.state === 'play' && !this.queue.length && !this.enemies.length) {
      // the last touch of the bout: breathe
      this.slowT = big ? 1.8 : 1.0; this.slowScale = 0.22;
      app.hud.callout(big ? 'MAESTRO SILENCED' : 'TOUCHÉ', true);
      for (const b of this.bolts.items) if (b.live && b.state === 'in') { app.fx.sparks.burst(b.pos, b.color, 8, 4, { life: 0.4 }); this.bolts.kill(b); }
      this.endBout();
    } else if (big) {
      for (const x of [...this.enemies]) this.after(rand(0.2, 0.8), () => x.alive && this.kill(x, false));
    }
  }

  onPlayerHit(b) {
    const { app } = this;
    if (this.state !== 'play' || this.invuln > 0) return;
    this.integrity--; this.combo = 0; this.invuln = 0.9; this.hitFlash = 1;
    app.hud.setPips(this.integrity); app.hud.setCombo(0); app.sword.setIntegrity(this.integrity);
    app.addTrauma(0.85); app.sword.disturb(1.2); app.audio.hit();
    app.post.shock(0.5, 0.5, 1.2, 1.4);
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive) { try { navigator.vibrate([40, 30, 60]); } catch {} }
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
      // spawning
      this.spawnT -= gdt;
      if (this.queue.length && this.enemies.length < this.cfg.maxAlive && this.spawnT <= 0) {
        const e = this.spawn(this.queue.shift()); e.ndcSlot = this._lastSlot; this.spawnT = rand(0.7, 1.3);
      }
      if (this.cfg.boss && this.enemies.some((e) => e.type === 'maestro')) {
        this.escortT -= gdt;
        if (this.escortT <= 0 && this.enemies.length < 3) { const e = this.spawn(pick(['wisp', 'wisp', 'twin'])); e.ndcSlot = this._lastSlot; this.escortT = rand(7, 10); }
      }
      if (this.tempoLive > 0) {
        this.tempoLive -= rdt; app.hud.setTempo(clamp(this.tempoLive / TEMPO_TIME), true);
        if (this.tempoLive <= 0) { app.sword.overTarget = 0; app.audio.tempo(false); app.hud.setTempo(0, false); }
      }
    }
    for (const e of this.enemies) e.update(gdt, app.time, this);
    this.bolts.update(gdt, this);
    this.checkDeflect(rdt);
    if (app.autoplay) this.bot();
    app.audio.setIntensity(clamp(this.combo / 22 + (this.bout - 1) * 0.1 + (this.tempoLive > 0 ? 0.3 : 0) + (this.cfg.boss ? 0.25 : 0)));
  }

  // debug/attract bot: sweeps the pointer through whichever ring is about to close
  bot() {
    const inc = this.bolts.incoming.filter((b) => !b.done).sort((a, b) => (a.dur - a.t) - (b.dur - b.t))[0];
    const inp = this.app.input;
    if (!inc) { inp.set(Math.sin(this.app.time * 0.7) * 0.2, -0.1 + Math.sin(this.app.time * 0.9) * 0.1); return; }
    const rem = inc.dur - inc.t;
    if (rem > 0.1) inp.set(lerp(inp.ndc.x, inc.ndc.x - 0.22, 0.2), lerp(inp.ndc.y, inc.ndc.y - 0.12, 0.2));
    else { const s = Math.sin((0.1 - rem) * 38); inp.set(inc.ndc.x + s * 0.24, inc.ndc.y + s * 0.13); }
  }
}
