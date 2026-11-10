// DOM overlay: title, HUD, callouts, banners, end card.
const $ = (id) => document.getElementById(id);
export const ROMAN = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'][n] || String(n);
const RGB = { azure: '56,150,255', verdant: '60,255,120', violet: '170,90,255', ember: '255,140,50', blanc: '190,220,255' };

export class Hud {
  constructor() {
    this.el = { title: $('title'), hud: $('hud'), score: $('score'), combo: $('combo'), comboN: $('comboN'), bout: $('bout'), pips: [...$('pips').children],
      callout: $('callout'), banner: $('banner'), floaters: $('floaters'), hint: $('hint'), end: $('end'), paused: $('paused'), tempo: $('tempo'), tempoFill: $('tempoFill'),
      btnPause: $('btnPause'), btnSound: $('btnSound'), swatches: $('swatches') };
    this.root = document.documentElement.style;
    this.onColor = () => {};
    for (const name of Object.keys(RGB)) {
      const b = document.createElement('button');
      b.style.setProperty('--c', RGB[name]); b.dataset.c = name; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.onColor(name); });
      this.el.swatches.appendChild(b);
    }
    this._lit = -1;
  }
  setBlade(name) {
    this.root.setProperty('--blade', RGB[name]);
    for (const b of this.el.swatches.children) b.setAttribute('aria-checked', b.dataset.c === name);
  }
  setLit(v) { v = Math.round(v * 50) / 50; if (v !== this._lit) { this._lit = v; this.root.setProperty('--lit', v); } }
  showTitle(on) { this._fade(this.el.title, on); }
  showHud(on) { this.el.hud.classList.toggle('hidden', !on); this.el.btnPause.classList.toggle('hidden', !on); }
  _fade(el, on) {
    if (on) { el.classList.remove('hidden'); requestAnimationFrame(() => el.classList.remove('out')); }
    else { el.classList.add('out'); setTimeout(() => { if (el.classList.contains('out')) el.classList.add('hidden'); }, 600); }
  }
  setScore(n) { this.el.score.textContent = n.toLocaleString('en-US'); this.el.score.classList.remove('bump'); void this.el.score.offsetWidth; this.el.score.classList.add('bump'); }
  setCombo(n) { this.el.comboN.textContent = n; this.el.combo.classList.toggle('on', n >= 2); }
  setBout(n, label) { this.el.bout.textContent = label || `BOUT ${ROMAN(n)}`; }
  setPips(n) { this.el.pips.forEach((p, i) => p.classList.toggle('off', i >= n)); }
  setTempo(frac, live) { this.el.tempoFill.style.width = `${Math.round(frac * 100)}%`; this.el.tempo.classList.toggle('live', !!live); }
  callout(text, gold = false) {
    const c = this.el.callout; c.textContent = text; c.classList.remove('show'); c.classList.toggle('gold', gold); void c.offsetWidth; c.classList.add('show');
  }
  banner(top, main, sub, ms = 1800) {
    $('bannerTop').textContent = top || ''; $('bannerMain').textContent = main || ''; $('bannerSub').textContent = sub || '';
    this.el.banner.classList.add('show'); clearTimeout(this._bt);
    this._bt = setTimeout(() => this.el.banner.classList.remove('show'), ms);
  }
  floater(x, y, text, gold = false) {
    const s = document.createElement('span'); s.textContent = text; if (gold) s.className = 'gold';
    s.style.left = `${x}px`; s.style.top = `${y}px`;
    this.el.floaters.appendChild(s); setTimeout(() => s.remove(), 950);
  }
  hint(text) { const h = this.el.hint; if (text) { h.textContent = text; h.classList.add('show'); } else h.classList.remove('show'); }
  showPaused(on) { this.el.paused.classList.toggle('hidden', !on); }
  showEnd(on, s) {
    if (on && s) {
      $('rank').textContent = s.rank; $('finalScore').textContent = s.score.toLocaleString('en-US');
      $('stReturned').textContent = s.returned; $('stPerfect').textContent = s.perfect; $('stStreak').textContent = s.streak; $('stBout').textContent = ROMAN(s.bout);
      $('best').textContent = s.newBest ? 'New personal best' : s.best ? `Best ${s.best.toLocaleString('en-US')}` : '';
    }
    this.el.end.classList.toggle('hidden', !on);
  }
}
