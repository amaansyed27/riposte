// Phone-as-hilt, host side. The phone opens ?pad=<id>, connects peer-to-peer (WebRTC via the public PeerJS broker),
// and streams where it is pointing. Nothing but aim, button presses and haptic cues crosses the link.
const ID = () => 'riposte-' + Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

export class Remote {
  constructor(app, { onButton, onStatus }) { this.app = app; this.onButton = onButton; this.onStatus = onStatus; this.conn = null; this.peer = null; this.active = false; }
  async start(qrCanvas) {
    if (this.peer) return this.url;
    const [{ Peer }, QR] = await Promise.all([import('peerjs'), import('qrcode')]);
    const id = ID();
    this.url = `${location.origin}${location.pathname}?pad=${id}`;
    await QR.toCanvas(qrCanvas, this.url, { width: 168, margin: 1, color: { dark: '#03060b', light: '#ffffff' } });
    this.onStatus('Connecting to pairing service…');
    this.peer = new Peer(id);
    this.peer.on('open', () => this.onStatus('Scan with your phone camera. Waiting for it to join…'));
    this.peer.on('error', (e) => this.onStatus(`Pairing problem: ${e.type || e.message}. Check your connection and try again.`));
    this.peer.on('connection', (c) => {
      this.conn = c;
      c.on('open', () => { this.active = true; this.onStatus('Phone connected. Point it at the screen and tap Recenter.', true); this.send({ t: 'hello', color: this.app.sword.colorName }); });
      c.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'o' && Number.isFinite(m.x) && Number.isFinite(m.y)) this.app.input.set(m.x, m.y);
        else if (m.t === 'b' && typeof m.k === 'string') this.onButton(m.k);
      });
      c.on('close', () => { this.active = false; this.conn = null; this.onStatus('Phone disconnected. Scan again to rejoin.'); });
    });
    return this.url;
  }
  send(m) { if (this.conn && this.conn.open) { try { this.conn.send(m); } catch {} } }
}
