// Graphics and display settings: stored in localStorage, applied live, bound to any control carrying data-set="<key>".
const KEY = 'riposte.gfx';
const DEFAULT = { preset: 'high', scale: 100, reflections: 'high', bloom: 'on', rain: 'heavy', film: 'on', shake: 100, adaptive: 'on', fps: 'off' };
const PRESETS = {
  low: { scale: 60, reflections: 'off', bloom: 'on', rain: 'light', film: 'off' },
  medium: { scale: 80, reflections: 'low', bloom: 'on', rain: 'heavy', film: 'on' },
  high: { scale: 100, reflections: 'high', bloom: 'on', rain: 'heavy', film: 'on' },
};

export class Settings {
  constructor(app, root) {
    this.app = app; this.root = root;
    let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
    // phones start one notch down: the mirror pass is the expensive part
    this.v = { ...DEFAULT, ...(app.coarse ? { preset: 'medium', ...PRESETS.medium } : {}), ...saved };
    for (const seg of root.querySelectorAll('.seg[data-set]')) seg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.set(seg.dataset.set, b.dataset.v); });
    for (const r of root.querySelectorAll('input[data-set]')) r.addEventListener('input', () => this.set(r.dataset.set, +r.value));
    this.sync();
  }
  get(k) { return this.v[k]; }
  on(k) { return this.v[k] === 'on'; }
  set(k, val) {
    if (k === 'preset') Object.assign(this.v, PRESETS[val] || {}, { preset: val });
    else { this.v[k] = val; if (k in PRESETS.high) this.v.preset = 'custom'; }
    try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch {}
    this.sync(); this.apply();
  }
  // reflect the stored values in the controls
  sync() {
    for (const seg of this.root.querySelectorAll('.seg[data-set]')) for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.v === String(this.v[seg.dataset.set])));
    for (const r of this.root.querySelectorAll('input[data-set]')) { r.value = this.v[r.dataset.set]; const o = r.parentElement.querySelector('output'); if (o) o.textContent = this.v[r.dataset.set] + '%'; }
  }
  // push the values into the renderer
  apply() {
    const { app } = this, v = this.v;
    app.post.bloom.enabled = v.bloom === 'on';
    const rain = app.env.rain, n = rain.geometry.attributes.position.count;
    rain.visible = v.rain !== 'off'; rain.geometry.setDrawRange(0, v.rain === 'light' ? Math.floor(n * 0.4 / 2) * 2 : n);
    app.audio.setRain(v.rain);
    const fps = document.getElementById('fps'); if (fps) fps.classList.toggle('hidden', v.fps !== 'on');
    if (v.adaptive !== 'on') app.quality = 1;
    app.resize();
  }
}
