// Gamepad: the stick aims the blade, A confirms / sheathes, B goes back, Start pauses, d-pad moves through menus,
// rumble on hits. Optional motion aiming for DualSense through WebHID (the Gamepad API exposes no gyro).
import { clamp } from '../core/util.js';

const DPS = 2000 / 32768;                 // gyro: degrees per second per unit
const RAD = Math.PI / 180;

export class Gamepads {
  constructor(app, { onConfirm, onPause, onStatus, onNav, onBack, onHold }) {
    this.app = app; this.onConfirm = onConfirm; this.onPause = onPause; this.onStatus = onStatus;
    this.onNav = onNav || (() => {}); this.onBack = onBack || (() => {}); this.onHold = onHold || (() => {});
    this.prev = []; this.active = false; this.name = ''; this.navT = 0; this.stick = { x: 0, y: 0 };
    this.gyro = null; this.yaw = 0; this.pitch = 0; this.reports = 0; this.lastReport = 0; this.reportId = 0; this.diag = '';
    addEventListener('gamepadconnected', (e) => { this.name = e.gamepad.id.replace(/\s*\(.*\)/, ''); onStatus(this.name || 'Connected', true); });
    addEventListener('gamepaddisconnected', () => { this.active = false; onStatus('Press any button', false); });
  }
  pad() { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of l) if (p && p.connected) return p; return null; }
  // right stick on a standard pad; on an unmapped pad the right stick usually arrives on axes 2 and 5
  sticks(p) {
    const a = p.axes, std = p.mapping === 'standard' || a.length <= 4;
    const rx = a[2] ?? 0, ry = std ? (a[3] ?? 0) : (a[5] ?? a[3] ?? 0);
    return { lx: a[0] ?? 0, ly: a[1] ?? 0, rx, ry };
  }
  update(dt) {
    const p = this.pad(), inMenu = !!this.app.hud.current, inp = this.app.input;
    let sx = 0, sy = 0;
    if (p) {
      const s = this.sticks(p);
      // whichever stick is pushed further aims
      let x = s.rx, y = s.ry; if (Math.hypot(s.lx, s.ly) > Math.hypot(x, y)) { x = s.lx; y = s.ly; }
      const m = Math.hypot(x, y), k = m > 0.12 ? Math.min(1, (m - 0.12) / 0.8) / m : 0;
      sx = x * k; sy = -y * k; this.stick.x = sx; this.stick.y = sy;
      // a deliberate push takes the blade; once taken the stick keeps it (centre = centre) until the mouse moves
      if (m > 0.3) this.active = true;
      if (inMenu) this.active = false;
      const b = p.buttons.map((v) => v.pressed);
      if (b.some(Boolean) && !this.name) { this.name = p.id.replace(/\s*\(.*\)/, ''); this.onStatus(this.name, true); }
      if ((b[0] && !this.prev[0]) || (b[7] && !this.prev[7])) this.onConfirm();
      if (b[9] && !this.prev[9]) this.onPause();
      if (b[1] && !this.prev[1]) this.onBack();
      if ((b[11] && !this.prev[11]) || (b[17] && !this.prev[17])) this.recenter();      // R3 or touchpad click
      if (inMenu) {
        let d = 0, sd = 0;
        if (b[12] && !this.prev[12]) d = -1; else if (b[13] && !this.prev[13]) d = 1; else if (b[14] && !this.prev[14]) sd = -1; else if (b[15] && !this.prev[15]) sd = 1;
        this.navT -= dt;
        if (!d && !sd && this.navT <= 0) { if (Math.abs(s.ly) > 0.6) { d = Math.sign(s.ly); this.navT = 0.24; } else if (Math.abs(s.lx) > 0.6) { sd = Math.sign(s.lx); this.navT = 0.24; } }
        if (Math.abs(s.ly) < 0.3 && Math.abs(s.lx) < 0.3) this.navT = 0;
        if (d) this.onNav(d, false); if (sd) this.onNav(sd, true);
        this.onHold(!!b[13] || s.ly > 0.6);
      }
      this.prev = b;
    }
    const now = performance.now();
    const gyroLive = this.gyro && now - this.lastReport < 600;
    if (gyroLive && !inMenu) {
      // motion aims the blade as a direction; the stick nudges on top of it
      inp.aim.yaw = clamp(this.yaw + sx * 0.9, -1.9, 1.9); inp.aim.pitch = clamp(this.pitch + sy * 0.7, -1.2, 2.0); inp.aim.t = this.app.time;
    } else if (this.active && !inMenu) {
      const tx = sx * 0.92, ty = sy * 0.82, a = 1 - Math.exp(-dt * 26);
      inp.set(inp.ndc.x + (tx - inp.ndc.x) * a, inp.ndc.y + (ty - inp.ndc.y) * a);
    }
    this.diag = (p ? `stick ${sx.toFixed(2)}, ${sy.toFixed(2)}` : 'no pad') + (this.gyro ? ` · motion ${gyroLive ? 'live' : 'silent'} (report 0x${this.reportId.toString(16)}, ${this.reports})` : '');
  }
  rumble(strong = 0.5, weak = 0.5, ms = 80) {
    const p = this.pad(); const v = p && p.vibrationActuator;
    if (v && v.playEffect) v.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
  // DualSense motion over WebHID. USB sends the full report (0x01) straight away. Over Bluetooth the pad sends a
  // short report with no motion data until the host reads its calibration feature report; then it switches to 0x31.
  async enableGyro() {
    if (!navigator.hid) throw new Error('WebHID is not available in this browser');
    const [dev] = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x054c, productId: 0x0ce6 }, { vendorId: 0x054c, productId: 0x0df2 }] });
    if (!dev) throw new Error('No controller chosen');
    if (!dev.opened) await dev.open();
    let last = performance.now();
    dev.addEventListener('inputreport', (e) => {
      const d = e.data; this.reportId = e.reportId;
      // gyro x, y, z as int16 LE: at 15 in the USB report, 16 in the Bluetooth one (one extra leading byte)
      const off = e.reportId === 0x31 ? 16 : e.reportId === 0x01 && d.byteLength >= 40 ? 15 : -1;
      if (off < 0 || d.byteLength < off + 6) return;
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; this.lastReport = now; this.reports++;
      const gx = d.getInt16(off, true) * DPS, gy = d.getInt16(off + 2, true) * DPS;
      const dead = (v) => (Math.abs(v) < 1.2 ? 0 : v);                 // ignore sensor noise at rest
      // turning the pad left/right sweeps the blade; tipping it up/down pitches it
      this.yaw = clamp(this.yaw - dead(gy) * dt * RAD * 1.6, -1.9, 1.9);
      this.pitch = clamp(this.pitch + dead(gx) * dt * RAD * 1.6, -1.2, 2.0);
    });
    try { await dev.receiveFeatureReport(0x05); } catch {}             // wakes the full report over Bluetooth
    this.gyro = dev; this.recenter();
    return dev.productName || 'DualSense';
  }
  recenter() { this.yaw = 0; this.pitch = 0; }
}
