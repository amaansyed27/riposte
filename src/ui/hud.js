// DOM overlay: opening, blade select, controllers, HUD, callouts, banners, end card.
const $ = (id) => document.getElementById(id);
export const ROMAN = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'][n] || String(n);
export const BLADES = {
  azure: { rgb: '56,150,255', lore: 'The steadfast' },
  verdant: { rgb: '60,255,120', lore: 'The patient' },
  violet: { rgb: '170,90,255', lore: 'The cunning' },
  ember: { rgb: '255,140,50', lore: 'The relentless' },
  blanc: { rgb: '190,220,255', lore: 'The clear' },
};
const SCREENS = ['intro', 'select', 'controls', 'credits', 'paused', 'end'];

export class Hud {
  constructor() {
    this.el = { hud: $('hud'), score: $('score'), combo: $('combo'), comboN: $('comboN'), mult: $('mult'), bout: $('bout'), pips: [...$('pips').children],
      callout: $('callout'), banner: $('banner'), floaters: $('floaters'), hint: $('hint'), tempo: $('tempo'), tempoFill: $('tempoFill'),
      btnPause: $('btnPause'), btnSound: $('btnSound'), swatches: $('swatches'), bossbar: $('bossbar'), bossName: $('bossName'), bossFill: $('bossFill') };
    this.root = document.documentElement.style;
    this.onColor = () => {};
    this.current = 'intro'; this.pipsN = 3; this.multN = 1;
    for (const name of Object.keys(BLADES)) {
      const b = document.createElement('button');
      b.style.setProperty('--c', BLADES[name].rgb); b.dataset.c = name; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', name);
      b.addEventListener('click', () => this.onColor(name));
      this.el.swatches.appendChild(b);
    }
  }
  // show exactly one full-screen layer (or none)
  screen(name) {
    this.current = name;
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    if (name === 'intro') { const i = $('intro'); i.style.animation = 'none'; }
  }
  setBlade(name) {
    this.root.setProperty('--blade', BLADES[name].rgb);
    $('bladeName').textContent = name; $('bladeLore').textContent = BLADES[name].lore;
    for (const b of this.el.swatches.children) b.setAttribute('aria-checked', b.dataset.c === name);
  }
  setBest(n) { $('introBest').innerHTML = n ? `Best <b>${n.toLocaleString('en-US')}</b>` : ''; }
  showHud(on) { this.el.hud.classList.toggle('hidden', !on); this.el.btnPause.classList.toggle('hidden', !on); }
  setScore(n) { this.el.score.textContent = n.toLocaleString('en-US'); this.el.score.classList.remove('bump'); void this.el.score.offsetWidth; this.el.score.classList.add('bump'); }
  setCombo(n, mult = 1) {
    this.el.comboN.textContent = n; this.el.combo.classList.toggle('on', n >= 2);
    if (mult !== this.multN) { this.multN = mult; this.el.mult.textContent = `×${mult}`; this.el.mult.classList.remove('up'); void this.el.mult.offsetWidth; this.el.mult.classList.add('up'); }
  }
  setBout(n) { this.el.bout.textContent = `BOUT ${ROMAN(n)}`; }
  setPips(n) {
    this.el.pips.forEach((p, i) => {
      p.classList.remove('lost', 'gain'); void p.offsetWidth;
      if (i >= n && i < this.pipsN) p.classList.add('lost');
      if (i < n && i >= this.pipsN) p.classList.add('gain');
      p.classList.toggle('off', i >= n);
    });
    this.pipsN = n;
  }
  setTempo(frac, live) { this.el.tempoFill.style.width = `${Math.round(frac * 100)}%`; this.el.tempo.classList.toggle('live', !!live); if (live) this.el.tempo.classList.add('used'); }
  // boss(name, frac) shows / updates; boss(null) hides; boss(null, frac) updates the bar only
  boss(name, frac) {
    if (name === null && frac === undefined) { this.el.bossbar.classList.add('hidden'); return; }
    if (name) { this.el.bossName.textContent = name; this.el.bossbar.classList.remove('hidden'); }
    if (frac !== undefined) this.el.bossFill.style.width = `${Math.max(0, frac) * 100}%`;
  }
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
  // results: the numbers count up, the bars fill, the rank ladder shows how far the next rank is
  showEnd(s) {
    const fmt = (n) => Math.round(n).toLocaleString('en-US');
    $('rank').textContent = s.rank; $('resQuote').textContent = s.quote || '';
    const b = $('best'); b.textContent = s.newBest ? 'New personal best' : s.best ? 'Best ' + fmt(s.best) : ''; b.classList.toggle('new', !!s.newBest);
    $('stBout').textContent = ROMAN(s.bout);
    $('stPerfectPct').textContent = s.returned ? Math.round(100 * s.perfect / s.returned) + '% of returns' : '';
    // ladder
    const R = s.ranks, top = R[R.length - 1][0], pos = (v) => Math.pow(Math.min(v, top) / top, 0.3) * 100;
    $('ladderMarks').innerHTML = R.map(([v, n]) => '<span style="left:' + pos(v) + '%" class="' + (s.score >= v ? 'got' : '') + '">' + n + '</span>').join('');
    const next = R.find(([v]) => v > s.score);
    $('ladderNext').textContent = next ? fmt(next[0] - s.score) + ' more for ' + next[1] : 'The highest rank there is';
    for (const id of ['ladderFill', 'barBout', 'barReturned', 'barPerfect', 'barStreak']) $(id).style.width = '0';
    this.screen('end');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $('ladderFill').style.width = pos(s.score) + '%';
      $('barBout').style.width = Math.min(100, s.bout / 16 * 100) + '%';
      $('barReturned').style.width = Math.min(100, s.returned / 150 * 100) + '%';
      $('barPerfect').style.width = (s.returned ? 100 * s.perfect / s.returned : 0) + '%';
      $('barStreak').style.width = (s.returned ? Math.min(100, 100 * s.streak / s.returned) : 0) + '%';
    }));
    const t0 = performance.now(), D = 1300; clearInterval(this._count);
    const set = (k) => { const e = 1 - Math.pow(1 - k, 3); $('finalScore').textContent = fmt(s.score * e); $('stReturned').textContent = fmt(s.returned * e); $('stPerfect').textContent = fmt(s.perfect * e); $('stStreak').textContent = fmt(s.streak * e); };
    set(0);
    this._count = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / D); set(k); if (this.onCount && k < 1) this.onCount(); if (k >= 1) clearInterval(this._count); }, 40);
  }
  showPause(s) {
    $('psBout').textContent = ROMAN(s.bout); $('psScore').textContent = s.score.toLocaleString('en-US'); $('psGuard').textContent = s.integrity + ' / 3'; $('psStreak').textContent = s.combo;
    this.screen('paused');
  }
}
