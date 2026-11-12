// The adaptive score.
//
// Beds: loops cut from four orchestral pieces by Luis_Humanoide (Pixabay Content License; see README credits):
//   menu   - "The Path of the Force"                           -> opening page and blade select
//   calm   - quiet opening of "Secrets of the Jedi"            -> the breath between bouts
//   theme  - the heroic swell of the same piece                 -> a master falls, the credits
//   battle - "Star Wars Style Battle Music"                     -> bouts
//   boss   - "Temple of the Dark Side"                          -> masters
//
// How it adapts (states for WHERE you are, layers for HOW HARD it is):
//   horizontal - the game state picks ONE bed; the others are faded out and stopped, never left running underneath
//   vertical   - the bed is split live into low / mid / high bands; a smoothed intensity value (bolts in the air,
//                orbs alive, your streak, your last guard) brings the weight and the brilliance in and out
//   rhythm     - our own synthesized drums. In bouts they are locked to the battle bed's measured beat grid
//                (123.07 BPM) and thicken with intensity: halves, then every beat, then eighths, then a gallop of
//                sixteenths. Against the free-time boss bed they run on their own clock, which speeds up as the
//                fight does.
//   pace       - each bout plays the bed (and the drums locked to it) a little faster than the last
//   accents    - timpani, low brass, cymbal swells and a four-note horn call land on what YOU do
//   time       - Tempo slows the tape and closes the filter; death lets it run down; pause muffles it
import { clamp, lerp, sstep } from '../core/util.js';

const XF = 2.6;                                  // loop crossfade, seconds
const FILES = ['menu', 'calm', 'theme', 'battle', 'boss'];
const STATES = {
  off: { bed: null, level: 0 },
  menu: { bed: 'menu', level: 0.85, flat: true },
  select: { bed: 'menu', level: 0.95, flat: true },
  rest: { bed: 'calm', level: 0.7, flat: true },
  bout: { bed: 'battle', level: 0.95, drums: 'grid' },
  boss: { bed: 'boss', level: 1.0, floor: 0.4, drums: 'free' },
  win: { bed: 'theme', level: 1.0, flat: true },
  credits: { bed: 'theme', level: 0.95, flat: true },
  dead: { bed: 'calm', level: 0.32, flat: true },
};
const GRID = { bpm: 123.07, phase: 0.028 };      // measured from public/audio/battle.mp3
const N = (semi) => 220 * Math.pow(2, semi / 12);   // A3 = 0

class Loop {
  constructor(ctx, buffer, out) {
    this.ctx = ctx; this.buf = buffer; this.dur = buffer.duration; this.pos = 0; this.rate = 1; this.voices = []; this.on = false; this.level = 0; this.wrapped = false;
    this.inp = ctx.createGain();
    this.g = ctx.createGain(); this.g.gain.value = 0.0001; this.g.connect(out);
    const f = (type, freq, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = freq; n.Q.value = q; return n; };
    this.low = ctx.createGain(); this.mid = ctx.createGain(); this.high = ctx.createGain();
    this.midLP = f('lowpass', 2600);
    this.inp.connect(f('lowpass', 170)).connect(this.low).connect(this.g);
    this.inp.connect(f('highpass', 170)).connect(this.midLP).connect(this.mid).connect(this.g);
    this.inp.connect(f('highpass', 2600)).connect(this.high).connect(this.g);
  }
  _voice(offset, fadeIn) {
    const { ctx } = this, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.buf; src.playbackRate.value = this.rate;
    const vg = ctx.createGain(); vg.gain.setValueAtTime(fadeIn ? 0.0001 : 1, t); if (fadeIn) vg.gain.linearRampToValueAtTime(1, t + fadeIn);
    src.connect(vg).connect(this.inp); src.start(t, offset);
    const v = { src, vg }; this.voices.push(v);
    src.onended = () => { this.voices = this.voices.filter((x) => x !== v); };
  }
  start() { clearTimeout(this._off); if (this.on) return; this.on = true; if (this.pos > this.dur - XF - 1) this.pos = 0; this._voice(this.pos, 0.05); }
  stop() { this.on = false; for (const v of this.voices) { try { v.src.stop(); } catch {} } this.voices = []; }
  // fade to silence, then actually stop: nothing is ever left playing under another bed
  retire(sec = 0.9) {
    if (!this.on) return; this.level = 0;
    const t = this.ctx.currentTime, g = this.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(0.0001, t + sec);
    clearTimeout(this._off); this._off = setTimeout(() => { if (this.level === 0) this.stop(); }, sec * 1000 + 80);
  }
  setRate(r) { this.rate = r; for (const v of this.voices) v.src.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.25); }
  tick(dt) {
    if (!this.on) return;
    this.pos += dt * this.rate; this.wrapped = false;
    if (this.pos >= this.dur - XF) {
      const t = this.ctx.currentTime, old = this.voices[this.voices.length - 1];
      if (old) { old.vg.gain.cancelScheduledValues(t); old.vg.gain.setValueAtTime(1, t); old.vg.gain.linearRampToValueAtTime(0.0001, t + XF / this.rate); try { old.src.stop(t + XF / this.rate + 0.05); } catch {} }
      this.pos = 0; this.wrapped = true; this._voice(0, XF / this.rate);
    }
  }
}

export class Score {
  constructor(ctx, out, reverb, manual = false) {
    this.manual = manual;                     // offline rendering: the caller ticks us, and the context is never 'running'
    this.ctx = ctx; this.ready = false; this.loops = {}; this.state = 'off'; this.I = 0; this.target = 0; this.rate = 1; this.pace = 0;
    this.tempoOn = false; this.muffled = false; this.dying = 0; this.lastAccent = {}; this.step = -1; this.free = 0;
    this.bus = ctx.createGain(); this.bus.gain.value = 0.62;
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 20000;
    this.duckG = ctx.createGain();
    this.bus.connect(this.tone).connect(this.duckG).connect(out);
    this.send = ctx.createGain(); this.send.gain.value = 0.05; this.duckG.connect(this.send).connect(reverb);
    // our own orchestra (accents) and drums land here
    this.acc = ctx.createGain(); this.acc.gain.value = 0.9; this.acc.connect(out);
    const aw = ctx.createGain(); aw.gain.value = 0.2; this.acc.connect(aw).connect(reverb);
    this.rh = ctx.createGain(); this.rh.gain.value = 0.42;   // drums sit under the bed: it already carries the pulse this.rh.connect(this.tone);
    const rw = ctx.createGain(); rw.gain.value = 0.06; this.rh.connect(rw).connect(reverb);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; this.noise = nb;
    this._last = ctx.currentTime;
    if (!manual) this._iv = setInterval(() => this._tick(), 40);
  }
  async load(base = 'audio/') {
    for (const name of FILES) {
      try {
        const res = await fetch(`${base}${name}.mp3`); if (!res.ok) throw new Error(res.status);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.loops[name] = new Loop(this.ctx, buf, this.bus);
        this.ready = true; this._apply();
      } catch (e) { console.warn('score: could not load', name, e); }
    }
    return this.ready;
  }
  setState(s) { if (!STATES[s] || s === this.state) return; this.state = s; if (s !== 'dead') this.dying = 0; this.step = -1; this._apply(); }
  setIntensity(x) { this.target = clamp(x); }
  setPace(p) { this.pace = clamp(p); }
  setTempo(on) { this.tempoOn = on; }
  setMuffle(on) { this.muffled = on; }
  duck(amount = 0.5, time = 0.6) { const t = this.ctx.currentTime, g = this.duckG.gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.05, 1 - amount), t); g.linearRampToValueAtTime(1, t + time); }
  death() { this.dying = 0.001; this.accent('fall'); }

  _apply() {
    const S = STATES[this.state], t = this.ctx.currentTime;
    for (const [name, L] of Object.entries(this.loops)) {
      if (S.bed === name) {
        L.start(); L.level = S.level;
        const g = L.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(Math.max(0.0001, L.level * (S.flat ? 1 : 0.4)), t + 0.9);
        L.fadeUntil = t + 0.95;
      } else L.retire(0.9);
    }
  }
  _tick() {
    const ctx = this.ctx, now = ctx.currentTime, dt = Math.min(0.2, now - this._last); this._last = now;
    if (ctx.state !== 'running' && !this.manual) return;
    const S = STATES[this.state];
    // intensity rises fast and lets go slowly, so the music does not flap with every bolt
    const tgt = Math.max(S.floor || 0, this.target);
    this.I += (tgt - this.I) * clamp(dt * (tgt > this.I ? 2.4 : 0.35));
    const I = S.flat ? 1 : this.I;
    if (this.dying > 0) this.dying = Math.min(1, this.dying + dt / 2.2);
    // pace: later bouts run the tape faster. Tempo slows it, dying winds it down.
    const base = S.drums ? 1 + 0.1 * this.pace : 1;
    const rate = this.dying > 0 ? lerp(base, 0.5, this.dying) : this.tempoOn ? base * 0.84 : base;
    if (Math.abs(rate - this.rate) > 0.003) { this.rate = rate; for (const L of Object.values(this.loops)) L.setRate(rate); }
    const cut = this.muffled ? 420 : this.dying > 0 ? lerp(9000, 500, this.dying) : this.tempoOn ? 1500 : 20000;
    this.tone.frequency.setTargetAtTime(cut, now, 0.25);
    this.send.gain.setTargetAtTime(this.tempoOn ? 0.2 : 0.05, now, 0.4);
    const L = S.bed && this.loops[S.bed];
    for (const x of Object.values(this.loops)) x.tick(dt);
    if (L && L.on) {
      if (now > (L.fadeUntil || 0)) {
        const lvl = L.level * (S.flat ? 1 : 0.4 + 0.6 * I) * (this.muffled ? 0.5 : 1) * (this.dying > 0 && this.state !== 'dead' ? 1 - this.dying : 1);
        L.g.gain.setTargetAtTime(Math.max(0.0001, lvl), now, 0.3);
      }
      L.low.gain.setTargetAtTime(lerp(0.3, 1, sstep(0.1, 0.6, I)), now, 0.3);       // weight
      L.mid.gain.setTargetAtTime(lerp(0.6, 1, I), now, 0.3);                        // body
      L.midLP.frequency.setTargetAtTime(700 * Math.pow(2600 / 700, sstep(0, 0.7, I)), now, 0.3);
      L.high.gain.setTargetAtTime(sstep(0.35, 0.9, I), now, 0.3);                   // brilliance
    }
    if (S.drums && L && L.on && !this.muffled && this.dying === 0) this._drums(S.drums, L, dt, now, I);
  }

  // ---------- drums. Sixteenth-note steps; which steps sound depends on how hard the fight is.
  _drums(mode, L, dt, now, I) {
    const LOOK = 0.11;
    let sixteenth, pos;
    if (mode === 'grid') {
      // locked to the battle bed: step times come from the bed's own position, so the lock survives any rate change
      sixteenth = 60 / GRID.bpm / 4; pos = L.pos - GRID.phase;
      if (L.wrapped) this.step = -1;
    } else {
      // free clock against the boss bed: faster as the fight tightens
      const bpm = 96 + 44 * I; sixteenth = 60 / bpm / 4; this.free += dt * this.rate; pos = this.free;
    }
    const span = LOOK * this.rate, first = Math.max(this.step + 1, Math.ceil(pos / sixteenth));
    for (let k = first; k * sixteenth < pos + span; k++) {
      const t = now + (k * sixteenth - pos) / this.rate; if (t < now - 0.01) { this.step = k; continue; }
      this._step(((k % 16) + 16) % 16, Math.floor(k / 16), t, I, mode === 'free');
      this.step = k;
    }
  }
  _step(s, bar, t, I, dark) {
    const v = 0.35 + 0.65 * I;
    if (I > 0.12 && (s === 0 || s === 8)) this._taiko(t, dark ? 46 : 55, 0.85 * v);                       // halves
    if (I > 0.3 && (s === 4 || s === 12)) this._taiko(t, dark ? 52 : 62, 0.6 * v);                        // every beat
    if (I > 0.3 && s % 2 === 0) this._tk(t, 0.035 * v, s % 4 === 0 ? 5200 : 7000);                         // eighths
    if (I > 0.5 && s % 2 === 1) this._tk(t, 0.02 * v, 8500);                                              // sixteenths
    if (I > 0.5 && (s === 4 || s === 12)) this._clack(t, 0.14 * v);                                       // backbeat
    if (I > 0.72 && (s === 6 || s === 7 || s === 14 || s === 15)) this._taiko(t, dark ? 62 : 74, 0.5 * v); // gallop
    if (I > 0.72 && s === 0 && bar % 2 === 0) this._brass(t, dark ? [-24, -17] : [-12, -5], 0.5, 0.2, 0.02, this.rh);
    if (I > 0.9 && s === 10) this._taiko(t, 98, 0.4 * v);
  }
  _env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  _noiseHit(t, type, f0, f1, q, a, d, peak, out = this.acc) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + a + d);
    s.connect(f).connect(g).connect(out); this._env(g, t, a, peak, d); s.start(t, Math.random()); s.stop(t + a + d + 0.1);
  }
  _taiko(t, hz, peak) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(hz * 2.4, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.05);
    o.connect(g).connect(this.rh); this._env(g, t, 0.003, peak, 0.26); o.start(t); o.stop(t + 0.35);
    this._noiseHit(t, 'lowpass', 1400, 200, 0.7, 0.002, 0.07, peak * 0.45, this.rh);
  }
  _tk(t, peak, hz) { this._noiseHit(t, 'highpass', hz, hz, 0.7, 0.001, 0.03, peak, this.rh); }
  _clack(t, peak) { this._noiseHit(t, 'bandpass', 1900, 1500, 1.4, 0.001, 0.09, peak, this.rh); }
  _timp(t, hz = 65.4, peak = 0.9) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(hz * 1.9, t); o.frequency.exponentialRampToValueAtTime(hz, t + 0.07);
    o.connect(g).connect(this.acc); this._env(g, t, 0.004, peak, 1.1); o.start(t); o.stop(t + 1.3);
    this._noiseHit(t, 'lowpass', 900, 120, 0.7, 0.003, 0.22, peak * 0.5);
  }
  _brass(t, semis, dur, peak, attack = 0.09, out = this.acc) {
    const ctx = this.ctx;
    for (const semi of semis) for (const det of [-6, 5]) {
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = N(semi); o.detune.value = det;
      f.type = 'lowpass'; f.Q.value = 1; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1500, t + attack * 1.5); f.frequency.exponentialRampToValueAtTime(500, t + dur);
      o.connect(f).connect(g).connect(out); this._env(g, t, attack, peak / semis.length, dur); o.start(t); o.stop(t + dur + attack + 0.1);
    }
  }
  // kinds: bout, clear, boss, phase, win, riposte, kill, tempo, fall, ignite
  accent(kind) {
    if (!this.ctx || (this.ctx.state !== 'running' && !this.manual)) return;
    const t = this.ctx.currentTime + 0.01, gap = { riposte: 0.28, kill: 0.5 }[kind] || 0;
    if (gap && t - (this.lastAccent[kind] || 0) < gap) return; this.lastAccent[kind] = t;
    if (kind === 'riposte') { this._noiseHit(t, 'bandpass', 2400, 1400, 1.2, 0.002, 0.14, 0.22); this._timp(t, 98, 0.3); }
    else if (kind === 'kill') this._timp(t, 65.4, 0.5);
    else if (kind === 'ignite') { this._brass(t, [-12, -5], 1.6, 0.16, 0.2); }
    else if (kind === 'bout') {
      for (let i = 0; i < 4; i++) this._timp(t + i * 0.085, 65.4, 0.2 + i * 0.12);
      [[0, 0.34], [7, 0.34], [5, 0.34], [10, 1.2]].reduce((at, [semi, len]) => { this._brass(at, [semi, semi - 12], len + 0.25, 0.2, 0.05); return at + len; }, t + 0.36);
    } else if (kind === 'clear') {
      this._noiseHit(t, 'highpass', 4000, 7000, 0.7, 1.0, 1.6, 0.14);
      [[0, 0.3], [7, 0.3], [10, 0.3], [15, 1.6]].reduce((at, [semi, len]) => { this._brass(at, [semi, semi - 12], len + 0.3, 0.2, 0.05); return at + len; }, t + 0.2);
      this._timp(t + 1.1, 65.4, 0.7);
    } else if (kind === 'boss') { this._brass(t, [-21, -14, -9], 3.2, 0.5, 0.3); for (let i = 0; i < 9; i++) this._timp(t + i * 0.07, 49, 0.12 + i * 0.07); this._timp(t + 0.72, 49, 1.0); }
    else if (kind === 'phase') { this._brass(t, [-21, -15], 2.2, 0.45, 0.12); this._timp(t, 49, 0.9); this._noiseHit(t, 'highpass', 5000, 3000, 0.7, 0.01, 1.4, 0.18); }
    else if (kind === 'win') { this._noiseHit(t, 'highpass', 3500, 8000, 0.7, 0.9, 2.4, 0.2); this._timp(t + 0.9, 65.4, 1.0); this._timp(t + 1.25, 98, 0.7); }
    else if (kind === 'tempo') { this._noiseHit(t, 'bandpass', 300, 5000, 2.5, 0.9, 0.5, 0.22); this._noiseHit(t + 0.9, 'highpass', 6000, 3000, 0.7, 0.01, 1.8, 0.18); }
    else if (kind === 'fall') { this._brass(t, [-12, -18], 2.8, 0.4, 0.08); this._brass(t + 0.5, [-14, -21], 3.0, 0.35, 0.1); this._timp(t, 49, 0.9); }
  }
}
