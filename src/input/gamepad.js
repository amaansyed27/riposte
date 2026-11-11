// Gamepad: stick aims the blade, A confirms / sheathes, Start pauses, rumble on hits.
// Optional motion aiming for DualSense through WebHID (browsers do not expose gyro through the Gamepad API).
import { clamp } from '../core/util.js';

export class Gamepads {
  constructor(app, { onConfirm, onPause, onStatus }) {
    this.app = app; this.onConfirm = onConfirm; this.onPause = onPause; this.onStatus = onStatus;
    this.prev = []; this.active = false; this.name = '';
    this.gyro = null; this.gx = 0; this.gy = 0;
    addEventListener('gamepadconnected', (e) => { this.name = e.gamepad.id.replace(/\s*\(.*\)/, ''); onStatus(this.name || 'Connected', true); });
    addEventListener('gamepaddisconnected', () => { this.active = false; onStatus('Press any button', false); });
  }
  pad() { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (const p of l) if (p && p.connected) return p; return null; }
  update(dt) {
    const p = this.pad();
    if (p) {
      // whichever stick is pushed further aims; the stick is absolute, so a flick is a swing
      const ax = p.axes;
      let x = ax[2] ?? 0, y = ax[3] ?? 0;
      if (Math.hypot(ax[0] || 0, ax[1] || 0) > Math.hypot(x, y)) { x = ax[0]; y = ax[1]; }
      const m = Math.hypot(x, y);
      // only a deliberate push takes the blade; letting go hands it back to the mouse
      this.active = m > 0.35 || (this.active && m > 0.15);
      if (this.active && !this.gyro) {
        const k = m > 0.1 ? Math.min(1, (m - 0.1) / 0.85) / m : 0;
        const tx = x * k * 0.92, ty = -y * k * 0.8, cur = this.app.input.ndc;
        const a = 1 - Math.exp(-dt * 26);
        this.app.input.set(cur.x + (tx - cur.x) * a, cur.y + (ty - cur.y) * a);
      }
      const b = p.buttons.map((v) => v.pressed);
      if (b.some(Boolean)) { if (!this.name) { this.name = p.id.replace(/\s*\(.*\)/, ''); this.onStatus(this.name, true); } }
      if ((b[0] && !this.prev[0]) || (b[7] && !this.prev[7])) this.onConfirm();
      if (b[9] && !this.prev[9]) this.onPause();
      this.prev = b;
    }
    if (this.gyro) {
      this.active = true;
      this.app.input.set(clamp(this.gx, -1.1, 1.1), clamp(this.gy, -1.1, 1.1));
      this.app.input.roll = this.groll || 0; this.app.input.rollT = this.app.time;
    }
  }
  rumble(strong = 0.5, weak = 0.5, ms = 80) {
    const p = this.pad(); const v = p && p.vibrationActuator;
    if (v && v.playEffect) v.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
  // DualSense motion over WebHID. Report layouts differ between USB (0x01) and Bluetooth (0x31).
  async enableGyro() {
    if (!navigator.hid) throw new Error('WebHID is not available in this browser');
    const [dev] = await navigator.hid.requestDevice({ filters: [{ vendorId: 0x054c, productId: 0x0ce6 }, { vendorId: 0x054c, productId: 0x0df2 }] });
    if (!dev) throw new Error('No controller chosen');
    if (!dev.opened) await dev.open();
    let last = performance.now();
    dev.addEventListener('inputreport', (e) => {
      const d = e.data, off = e.reportId === 0x31 ? 16 : e.reportId === 0x01 ? 15 : -1;
      if (off < 0 || d.byteLength < off + 6) return;
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
      const DPS = 2000 / 32768;                       // degrees per second per unit
      const pitch = d.getInt16(off, true) * DPS, yaw = d.getInt16(off + 2, true) * DPS, rollRate = d.getInt16(off + 4, true) * DPS;
      this.groll = Math.max(-2.6, Math.min(2.6, (this.groll || 0) - rollRate * dt * Math.PI / 180));
      this.gx = clamp(this.gx - (yaw * dt) / 22, -1.2, 1.2);   // ±22° of yaw sweeps the screen
      this.gy = clamp(this.gy + (pitch * dt) / 18, -1.2, 1.2);
    });
    this.gyro = dev; this.gx = this.gy = 0;
    return dev.productName || 'DualSense';
  }
  recenter() { this.gx = this.gy = 0; this.groll = 0; }
}
