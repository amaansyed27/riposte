// Everything you hear is synthesised: hum, ignition, retraction, deflect chimes, enemies, rain, thunder and a reactive score.
import { clamp, rand } from '../core/util.js';
import { Score } from './score.js';

const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24]; // D minor pentatonic, climbing with your streak
const ROOT = 146.83; // D3
const note = (semi) => ROOT * Math.pow(2, semi / 12);

export class Audio {
  constructor() { this.vol = { music: 0.8, sfx: 0.85, amb: 0.6 }; try { for (const k of ['music', 'sfx', 'amb']) { const v = localStorage.getItem('riposte.vol.' + k); if (v !== null && v !== '') this.vol[k] = +v; } } catch {} this.ctx = null; this.muted = false; this.ready = false; this.intensity = 0; this.playing = false; this.step = 0; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    ctx.onstatechange = () => { if (this.onState) this.onState(ctx.state); };
    const master = (this.master = ctx.createGain()); master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.duck = ctx.createBiquadFilter(); this.duck.type = 'lowpass'; this.duck.frequency.value = 20000;
    master.connect(this.duck).connect(comp).connect(ctx.destination);
    // reverb
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const conv = ctx.createConvolver(); conv.buffer = ir; this.conv = conv;
    this.wet = ctx.createGain(); this.wet.gain.value = 0.38; this.wet.connect(conv).connect(master);
    this.dry = ctx.createGain(); this.dry.connect(master);
    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
    this._hum(); this._rain(); this._pad();
    // the adaptive orchestral score; until its beds have loaded (or if they fail) the synthesized pad stands in
    this.score = new Score(ctx, master, conv);
    this.score.setState(this._musicState || 'off'); this._applyVol();
    // the synthesized pad only ever plays if the real beds cannot be loaded
    this.score.load(import.meta.env.BASE_URL + 'audio/').then((ok) => { if (ok) this.useScore = true; else this.padGain.gain.setTargetAtTime(0.5, ctx.currentTime, 2.5); });
    this.ready = true;
    this._sched = setInterval(() => this._music(), 40);
    this.nextT = ctx.currentTime + 0.1;
  }

  setMuted(m) { this.muted = m; try { localStorage.setItem('riposte.mute', m ? '1' : ''); } catch {} if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }

  // ---- helpers
  _noise(loop = true) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = loop; s.start(0, Math.random() * 1.5); return s; }
  _env(g, t, a, peak, d, curve = 'exp') { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  _out(pan = 0, wet = 0.3) {
    const ctx = this.ctx, g = ctx.createGain();
    let node = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); node = p; }
    node.connect(this.dry); const w = ctx.createGain(); w.gain.value = wet; node.connect(w).connect(this.wet);
    return g;
  }
  _tone(type, f0, f1, dur, peak, { pan = 0, wet = 0.3, attack = 0.004, delay = 0, filter = null } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), g = this._out(pan, wet);
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    let n = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.f; f.Q.value = filter.q || 0.7; o.connect(f); n = f; }
    n.connect(g); this._env(g, t, attack, peak, dur);
    o.start(t); o.stop(t + dur + attack + 0.05);
  }
  _burst(type, f0, f1, q, dur, peak, { pan = 0, wet = 0.3, attack = 0.003, delay = 0 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + delay, s = this._noise(false), f = ctx.createBiquadFilter(), g = this._out(pan, wet);
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    s.connect(f).connect(g); this._env(g, t, attack, peak, dur);
    s.stop(t + dur + 0.1);
  }

  // ---- continuous layers
  _hum() {
    const ctx = this.ctx;
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    this.humLP = ctx.createBiquadFilter(); this.humLP.type = 'lowpass'; this.humLP.frequency.value = 380; this.humLP.Q.value = 3;
    const am = ctx.createGain(); am.gain.value = 0.8;
    this.humOsc = [[46.2, 'sawtooth', 0.5], [92.9, 'square', 0.22], [139.1, 'sawtooth', 0.26], [185.3, 'sawtooth', 0.1]].map(([f, type, v]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; g.gain.value = v; o.connect(g).connect(am); o.start(); o.base = f; return o;
    });
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 23; lg.gain.value = 0.2; lfo.connect(lg).connect(am.gain); lfo.start();
    const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain(); lfo2.frequency.value = 0.6; lg2.gain.value = 0.1; lfo2.connect(lg2).connect(am.gain); lfo2.start();
    am.connect(this.humLP).connect(this.humGain);
    this.humFl = ctx.createDelay(0.03); this.humFl.delayTime.value = 0.0065;
    const fb = ctx.createGain(); fb.gain.value = 0.5; const flg = ctx.createGain(); flg.gain.value = 0.55;
    this.humLP.connect(this.humFl); this.humFl.connect(fb).connect(this.humFl); this.humFl.connect(flg).connect(this.humGain);
    this.humGain.connect(this.dry); const w = ctx.createGain(); w.gain.value = 0.25; this.humGain.connect(w).connect(this.wet);
    // swing whoosh
    this.swGain = ctx.createGain(); this.swGain.gain.value = 0;
    this.swBP = ctx.createBiquadFilter(); this.swBP.type = 'bandpass'; this.swBP.frequency.value = 500; this.swBP.Q.value = 1.4;
    this._noise().connect(this.swBP).connect(this.swGain).connect(this.dry);
  }
  setHum(power, swing, over = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(clamp(power, 0, 1.6) * (0.085 + swing * 0.15), t, 0.03);
    this.humLP.frequency.setTargetAtTime(340 + swing * 2400 + power * 120 + over * 600, t, 0.04);
    const det = swing * 420 + (power - 1) * 500 + over * 700;
    for (const o of this.humOsc) o.detune.setTargetAtTime(det, t, 0.05);
    this.swGain.gain.setTargetAtTime(Math.min(1, power) * swing * swing * 0.26, t, 0.03);
    this.swBP.frequency.setTargetAtTime(420 + swing * 2300, t, 0.04);
    this.humFl.delayTime.setTargetAtTime(0.0065 - swing * 0.0042, t, 0.035);
  }
  _rain() {
    const ctx = this.ctx, hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    this.ambG = ctx.createGain(); this.ambG.gain.value = this.vol.amb * (this.scene ? 1 : 0); this.ambG.connect(this.master);
    // rain is a soft, dark patter rather than a hiss, and it follows the Rain graphics setting (off = silent)
    hp.type = 'highpass'; hp.frequency.value = 700; lp.type = 'lowpass'; lp.frequency.value = 3600; lp.Q.value = 0.3; g.gain.value = 0.03 * this._rainK();
    this.rainG = g;
    this._noise().connect(hp).connect(lp).connect(g).connect(this.ambG);
    // low wind
    const bp = ctx.createBiquadFilter(), g2 = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = 0.6; g2.gain.value = 0.05;
    const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 0.09; lg.gain.value = 90; l.connect(lg).connect(bp.frequency); l.start();
    this._noise().connect(bp).connect(g2).connect(this.ambG);
  }
  _rainK() { return { off: 0, light: 0.45 }[this.rainLevel] ?? 1; }
  setRain(level) { this.rainLevel = level; if (this.rainG) this.rainG.gain.setTargetAtTime(0.03 * this._rainK(), this.ctx.currentTime, 0.3); }
  // the weather is only heard once the court is on screen (not under the opening cards)
  setScene(on) { this.scene = on; if (this.ambG) this.ambG.gain.setTargetAtTime(on ? this.vol.amb : 0, this.ctx.currentTime, on ? 0.9 : 0.1); }
  _pad() {
    const ctx = this.ctx;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.0;
    this.padLP = ctx.createBiquadFilter(); this.padLP.type = 'lowpass'; this.padLP.frequency.value = 500; this.padLP.Q.value = 0.8;
    this.padOsc = [];
    for (const semi of [-12, 0, 7, 10, 15]) for (const det of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = note(semi); o.detune.value = det + rand(-3, 3);
      const g = ctx.createGain(); g.gain.value = 0.045; o.connect(g).connect(this.padLP); o.start(); o.semi = semi; this.padOsc.push(o);
    }
    this.padLP.connect(this.padGain); this.padGain.connect(this.wet); const d = ctx.createGain(); d.gain.value = 0.4; this.padGain.connect(d).connect(this.dry);
  }
  setIntensity(x) { this.intensity = clamp(x); if (this.score) this.score.setIntensity(x); }
  // where the game is: menu | select | bout | boss | rest | win | dead
  music(state) { this._musicState = state; if (this.score) this.score.setState(state); }
  pace(p) { if (this.score) this.score.setPace(p); this._pace = p; }
  accent(kind) { if (this.useScore) this.score.accent(kind); }
  muffle(on) { if (this.score) this.score.setMuffle(on); }
  setPlaying(p) { this.playing = p; }
  _music() {
    if (!this.ready || this.ctx.state !== 'running') return;
    const ctx = this.ctx, spb = 60 / 104 / 2; // 8th notes
    if (this.nextT < ctx.currentTime) this.nextT = ctx.currentTime + 0.05;
    while (this.nextT < ctx.currentTime + 0.12) {
      const s = this.step++, t = this.nextT - ctx.currentTime, I = this.intensity, bar = Math.floor(s / 16) % 4;
      const rootShift = [0, 0, -4, -2][bar];
      if (s % 16 === 0) {
        const tt = this.nextT;
        for (const o of this.padOsc) o.frequency.setTargetAtTime(note(o.semi + rootShift), tt, 0.6);
        this.padLP.frequency.setTargetAtTime(420 + I * 1500, tt, 1.2);
      }
      if (this.playing && !this.useScore) {
        // heartbeat bass
        if (s % 4 === 0 || (I > 0.45 && s % 4 === 3)) this._tone('sawtooth', note(-24 + rootShift), note(-24 + rootShift), 0.22, 0.2 + I * 0.1, { delay: t, wet: 0.1, filter: { f: 160 + I * 500, q: 4 } });
        if (s % 8 === 0) this._tone('sine', 110, 38, 0.16, 0.5, { delay: t, wet: 0.05 });
        if (I > 0.3 && s % 2 === 1) this._burst('highpass', 7000, 9000, 0.7, 0.03, 0.05 + I * 0.07, { delay: t, wet: 0.1 });
        if (I > 0.6) { const a = [0, 7, 12, 15, 19, 15, 12, 7][s % 8]; this._tone('triangle', note(a + rootShift + 12), note(a + rootShift + 12), 0.16, 0.05, { delay: t, wet: 0.7, pan: (s % 2) * 0.8 - 0.4 }); }
      }
      this.nextT += spb;
    }
  }

  // ---- one-shots
  ignite() {
    if (!this.ready) return;
    this._burst('highpass', 5000, 3000, 1, 0.02, 0.5, { wet: 0.1 });                // stud click
    this._tone('square', 1900, 1900, 0.03, 0.08, { wet: 0.2 });
    this._burst('bandpass', 380, 3800, 2.2, 0.38, 0.75, { delay: 0.07, wet: 0.5 });  // plasma rush
    this._burst('bandpass', 3000, 700, 1.2, 0.5, 0.3, { delay: 0.2, wet: 0.6 });
    this._tone('sawtooth', 38, 93, 0.42, 0.42, { delay: 0.07, wet: 0.4, filter: { f: 900, q: 2 } });
    this._tone('sine', 95, 34, 0.5, 0.9, { delay: 0.08, wet: 0.3 });                 // chest thump
    this._tone('sine', note(12), note(12), 1.6, 0.06, { delay: 0.25, wet: 1 });      // settling shimmer
    this._tone('sine', note(19), note(19), 1.8, 0.04, { delay: 0.3, wet: 1 });
  }
  retract() {
    if (!this.ready) return;
    this._burst('bandpass', 2600, 180, 1.8, 0.32, 0.6, { wet: 0.4 });
    this._tone('sawtooth', 110, 30, 0.3, 0.4, { wet: 0.3, filter: { f: 700, q: 2 } });
  }
  retractSnap() {
    if (!this.ready) return;
    this._tone('sine', 150, 55, 0.09, 0.8, { wet: 0.2 });
    this._burst('highpass', 3500, 2500, 1, 0.025, 0.45, { wet: 0.15 });
    this._burst('bandpass', 5000, 2500, 3, 0.9, 0.035, { delay: 0.08, wet: 0.5 });   // metal ticking as it cools
  }
  deflect(perfect, combo, pan = 0) {
    if (!this.ready) return;
    this._burst('bandpass', 3200, 900, 3, 0.11, 0.9, { pan, wet: 0.4 });
    this._tone('sine', 2100, 240, 0.16, 0.55, { pan, wet: 0.35 });
    this._tone('square', 320, 80, 0.1, 0.25, { pan, wet: 0.2, filter: { f: 1200 } });
    const n = note(SCALE[Math.min(combo, SCALE.length - 1)] + 12);
    this._tone('triangle', n, n, 0.9, 0.3, { pan: pan * 0.5, wet: 0.9 });
    this._tone('sine', n * 2, n * 2, 0.7, 0.12, { pan: pan * 0.5, wet: 1 });
    if (perfect) { this._tone('sine', n * 3, n * 3, 1.3, 0.14, { wet: 1, delay: 0.03 }); this._tone('sine', n * 4, n * 4, 1.5, 0.08, { wet: 1, delay: 0.06 }); }
  }
  block(pan = 0) { if (!this.ready) return; this._burst('bandpass', 1500, 500, 2, 0.12, 0.5, { pan }); this._tone('sawtooth', 180, 70, 0.14, 0.3, { pan, filter: { f: 900 } }); }
  fire(kind, pan = 0) {
    if (!this.ready) return;
    const hi = kind === 'lancer' ? 2400 : kind === 'maestro' ? 700 : 1200;
    this._tone('sine', hi * 1.7, hi * 0.11, 0.17, 0.3, { pan, wet: 0.35 });
    this._tone('sawtooth', hi * 1.2, hi * 0.1, 0.13, 0.12, { pan, wet: 0.3, filter: { f: 3400, q: 3 } });
    this._tone('sine', hi * 1.5, hi * 0.11, 0.15, 0.09, { pan: -pan * 0.6, wet: 0.8, delay: 0.09 });
    this._tone('square', hi, hi * 0.18, 0.22, 0.2, { pan, wet: 0.5, filter: { f: 2600, q: 2 } });
    this._burst('bandpass', hi * 1.5, hi * 0.4, 2, 0.14, 0.25, { pan, wet: 0.4 });
  }
  charge(pan = 0) { if (!this.ready) return; this._tone('sine', 220, 880, 0.5, 0.05, { pan, wet: 0.8, attack: 0.3 }); }
  explode(big, pan = 0) {
    if (!this.ready) return;
    if (big && this.score) this.score.duck(0.5, 1.4);
    this._burst('lowpass', big ? 2600 : 1800, 70, 0.8, big ? 1.3 : 0.6, big ? 1.2 : 0.8, { pan, wet: 0.7 });
    this._tone('sine', big ? 120 : 150, 28, big ? 0.9 : 0.4, 1.0, { pan, wet: 0.3 });
    this._burst('highpass', 4000, 1500, 0.8, 0.25, 0.3, { pan, wet: 0.5 });
  }
  shield(pan = 0) { if (!this.ready) return; for (let i = 0; i < 5; i++) this._tone('sine', 1800 + i * 430 + rand(-60, 60), 1500 + i * 400, 0.35, 0.09, { pan, wet: 0.9, delay: i * 0.018 }); }
  hit() {
    if (!this.ready) return;
    if (this.score) this.score.duck(0.65, 1.1);          // the blow you took is the loudest thing in the room
    const t = this.ctx.currentTime;
    this._burst('lowpass', 3000, 90, 1, 0.6, 1.3, { wet: 0.5 });
    this._tone('sawtooth', 90, 24, 0.7, 0.8, { wet: 0.3, filter: { f: 500, q: 3 } });
    this.duck.frequency.cancelScheduledValues(t); this.duck.frequency.setValueAtTime(380, t); this.duck.frequency.exponentialRampToValueAtTime(20000, t + 1.3);
  }
  death() { if (!this.ready) return; if (this.useScore) { this.score.death(); return; } this._tone('sawtooth', note(-12), note(-24), 2.4, 0.4, { wet: 1, filter: { f: 600, q: 2 } }); this._tone('sine', note(3), note(-9), 2.8, 0.2, { wet: 1 }); }
  thunder(delay = 1) {
    if (!this.ready) return;
    const a = this.vol.amb;    // thunder belongs to the weather, and sits behind the music
    if (a <= 0.01) return;
    this._burst('lowpass', 420, 60, 0.6, 3.4, 0.5 * a, { delay, wet: 1, attack: 0.08 });
    this._burst('lowpass', 1500, 120, 0.8, 0.6, 0.22 * a, { delay, wet: 0.8, attack: 0.01 });
  }
  tempo(on) {
    if (!this.ready) return;
    if (this.score) { this.score.setTempo(on); if (on) this.accent('tempo'); }
    if (on) { for (let i = 0; i < 6; i++) this._tone('sine', note(SCALE[i * 2 % SCALE.length] + 12), note(SCALE[i * 2 % SCALE.length] + 12), 1.6, 0.12, { delay: i * 0.05, wet: 1 }); this._tone('sine', 60, 180, 0.6, 0.5, { wet: 0.4, attack: 0.3 }); }
    else this._tone('sine', 400, 60, 0.7, 0.3, { wet: 0.8 });
  }
  stinger(n = 0) {
    if (!this.ready) return;
    if (this.useScore) { this.score.accent('bout'); return; }
    for (const [i, s] of [0, 7, 12, 19].entries()) this._tone('triangle', note(s + (n % 2 ? 3 : 0)), note(s + (n % 2 ? 3 : 0)), 1.8, 0.14, { delay: i * 0.09, wet: 1 });
  }
  // droid chatter: hello (curious), yelp (its own bolt is coming back), laugh (it got you), tap (the Maestro's baton)
  chirp(kind, pan = 0) {
    if (!this.ready) return; const now = this.ctx.currentTime; if (now - (this._chirp || 0) < 0.22) return; this._chirp = now;
    const R = (a, b) => a + Math.random() * (b - a);
    const seq = kind === 'hello' ? Array.from({ length: 4 + (Math.random() * 3 | 0) }, () => [R(700, 2000), R(0.8, 1.3)])
      : kind === 'yelp' ? [[900, 1.8], [1500, 1.7], [2300, 1.4]]
      : kind === 'laugh' ? [[1500, 0.8], [1300, 0.8], [1100, 0.8], [900, 0.7], [1100, 0.8], [900, 0.6]]
      : [[2600, 1], [2600, 1]];
    const gap = kind === 'tap' ? 0.16 : kind === 'yelp' ? 0.05 : 0.075;
    seq.forEach(([fq, glide], i) => this._tone(kind === 'tap' ? 'triangle' : i % 2 ? 'square' : 'triangle', fq, fq * glide, kind === 'tap' ? 0.03 : 0.055, kind === 'tap' ? 0.16 : 0.06, { pan, wet: 0.35, delay: i * gap, filter: { f: 3200, q: 1 } }));
  }
  lanterns() { if (!this.ready) return; this._tone('sine', 220, 70, 0.5, 0.25, { wet: 0.9 }); }
  // one short signature per opening card
  logo(kind) {
    if (!this.ready) return;
    if (kind === 'dawn') { [0, 7, 12, 19].forEach((sm, i) => this._tone('sine', note(sm), note(sm), 2.4, 0.09, { delay: i * 0.16, wet: 1, attack: 0.25 })); this._burst('highpass', 5000, 9000, 0.7, 1.6, 0.03, { wet: 1, attack: 0.8 }); }
    else if (kind === 'clawd') { this._chirp = 0; this.chirp('hello', 0); [0, 4, 7].forEach((sm, i) => this._tone('square', note(sm + 12), note(sm + 12), 0.09, 0.05, { delay: 0.75 + i * 0.09, wet: 0.3, filter: { f: 2400 } })); }
    else if (kind === 'engine') { this._burst('bandpass', 200, 2600, 2, 1.1, 0.22, { wet: 0.7, attack: 0.5 }); this._tone('sawtooth', note(-24), note(-24), 1.8, 0.14, { wet: 0.6, attack: 0.4, filter: { f: 500, q: 2 } }); }
    else if (kind === 'author') { for (let i = 0; i < 7; i++) this._tone('sine', note(24 + [0, 3, 7, 10, 12, 15, 19][i]), note(24 + [0, 3, 7, 10, 12, 15, 19][i]), 1.6, 0.035, { delay: 0.5 + i * 0.07, wet: 1, pan: (i % 2) * 0.8 - 0.4 }); this._tone('sawtooth', note(-12), note(-12), 2.6, 0.16, { wet: 0.8, attack: 0.5, filter: { f: 700, q: 1.5 } }); this._tone('sine', 70, 40, 0.8, 0.5, { delay: 0.45, wet: 0.4 }); }
  }
  // the faintest click when the selection moves
  tick() { if (!this.ready || this.ctx.state !== 'running') return; this._tone('sine', 1500, 1200, 0.03, 0.05, { wet: 0.15 }); this._burst('highpass', 6000, 5000, 1, 0.012, 0.03, { wet: 0.05 }); }
  // music and effects volume, 0..1, remembered
  setVol(kind, v) { this.vol[kind] = Math.max(0, Math.min(1, v)); try { localStorage.setItem('riposte.vol.' + kind, String(this.vol[kind])); } catch {} this._applyVol(); }
  _applyVol() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.dry.gain.setTargetAtTime(this.vol.sfx, t, 0.05); this.wet.gain.setTargetAtTime(0.38 * this.vol.sfx, t, 0.05);
    if (this.ambG) this.ambG.gain.setTargetAtTime(this.scene ? this.vol.amb : 0, t, 0.05);
    if (this.score) { const m = this.vol.music / 0.8; this.score.bus.gain.setTargetAtTime(0.72 * m, t, 0.05); this.score.acc.gain.setTargetAtTime(0.85 * m, t, 0.05); this.score.rh.gain.setTargetAtTime(0.8 * m, t, 0.05); }
  }
  ui() { if (!this.ready) return; this._tone('sine', 880, 1320, 0.07, 0.12, { wet: 0.4 }); }
  sizzle() { if (!this.ready) return; this._burst('highpass', 6000, 9000, 1, 0.05, 0.03, { pan: rand(-0.3, 0.3), wet: 0.3 }); }
}
