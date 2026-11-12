// Menu navigation for keyboard and gamepad: one selected item per screen, moved with arrows / d-pad / stick,
// confirmed with Enter / A, with a short description of whatever is selected and a control-hint footer.
const HINTS = {
  keys: '<b>↑ ↓</b> Select <i></i> <b>Enter</b> Confirm <i></i> <b>Esc</b> Back',
  pad: '<b>D-pad</b> Select <i></i> <b>A</b> Confirm <i></i> <b>B</b> Back',
  credits: '<b>Space</b> Pause <i></i> <b>Hold ↓</b> Faster <i></i> <b>Esc</b> Back',
  creditsPad: '<b>A</b> Pause <i></i> <b>Hold ↓</b> Faster <i></i> <b>B</b> Back',
};

export class Nav {
  constructor(app) {
    this.app = app; this.sel = null; this.pad = false;
    this.desc = document.getElementById('menuDesc'); this.hint = document.getElementById('navHint');
    // the mouse and the keys share one selection, so there is never a second highlight
    document.addEventListener('mouseover', (e) => { const b = e.target.closest && e.target.closest('#ui button, #ui input'); if (b && this.items().includes(b)) this.select(b, true); });
  }
  root() { const c = this.app.hud.current; return c ? document.getElementById(c) : null; }
  items() { const r = this.root(); return r ? [...r.querySelectorAll('button, input[type=range]')].filter((b) => b.offsetParent !== null && !b.disabled) : []; }
  select(el, byMouse = false) {
    if (this.sel === el) return;
    if (this.sel) this.sel.classList.remove('sel');
    this.sel = el;
    if (el) {
      el.classList.add('sel');
      if (!byMouse) { try { el.focus({ preventScroll: true }); } catch {} if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
      this.app.audio.tick();
      if (!byMouse && el.classList.contains('tab')) el.click();       // moving onto a category opens it
    }
    if (this.desc) this.desc.textContent = (el && el.dataset.desc) || '';
  }
  // call when the screen changes: pick the obvious default
  sync() {
    const it = this.items();
    if (this.sel) { this.sel.classList.remove('sel'); this.sel = null; }
    this.hint.classList.toggle('hidden', !it.length);
    this.setPad(this.pad);
    if (!it.length) { if (this.desc) this.desc.textContent = ''; return; }
    const def = it.find((b) => b.classList.contains('tab') && b.classList.contains('on')) || it.find((b) => b.classList.contains('primary')) || it.find((b) => b.getAttribute('aria-checked') === 'true') || it[0];
    def.classList.add('sel'); this.sel = def;
    if (this.desc) this.desc.textContent = def.dataset.desc || '';
  }
  move(d) {
    const it = this.items(); if (!it.length) return;
    let i = it.indexOf(this.sel); i = i < 0 ? 0 : (i + d + it.length) % it.length;
    this.select(it[i]);
  }
  // left / right: nudge a slider if one is selected, otherwise move like up / down
  side(d) {
    const s = this.sel;
    if (s && s.classList.contains('tab') && d > 0) { const it = this.items(), first = it.find((b) => b.closest('.pane')); if (first) this.select(first); return; }
    if (s && s.closest && s.closest('.pane') && d < 0 && !(s.type === 'range') && !(s.parentElement.classList.contains('seg') && s.previousElementSibling)) { const tab = document.querySelector('#setTabs .tab.on'); if (tab) { this.select(tab); return; } }
    if (s && s.type === 'range') { s.value = Math.max(+s.min, Math.min(+s.max, +s.value + d * 5)); s.dispatchEvent(new Event('input', { bubbles: true })); return; }
    this.move(d);
  }
  activate() { if (this.sel && this.items().includes(this.sel) && this.sel.type !== 'range') { this.sel.click(); return true; } return false; }
  setPad(on) {
    this.pad = on;
    const c = this.app.hud.current;
    this.hint.innerHTML = c === 'credits' ? (on ? HINTS.creditsPad : HINTS.credits) : on ? HINTS.pad : HINTS.keys;
  }
}
