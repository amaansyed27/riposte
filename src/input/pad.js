// Phone as the saber, phone side (opened as ?pad=<id>). No game here: the phone is the hilt.
//
// Grip: hold it like a sword hilt, any way round. The blade is the phone's long axis (out of its top edge).
// Only two angles are read, and both come from that axis alone, so it does not matter which way the screen faces:
//   yaw   - which way the top edge points around the compass, relative to where you were pointing at Recentre
//   pitch - how far the top edge is tipped above the horizon
// In menus the phone becomes a remote: a d-pad, confirm and back.
const css = `
  html, body { background: radial-gradient(ellipse at 50% 30%, #0b1524, #03060b 70%); color: #e9f1fb; font-family: "Avenir Next","Segoe UI",system-ui,sans-serif; overscroll-behavior: none; }
  #gl, #ui, #boot { display: none !important; }
  #pad { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: calc(22px + env(safe-area-inset-top)) 20px calc(22px + env(safe-area-inset-bottom)); text-align: center; touch-action: none; user-select: none; -webkit-user-select: none; }
  #pad h1 { font-weight: 200; letter-spacing: .5em; margin-right: -.5em; font-size: 24px; text-shadow: 0 0 22px rgba(var(--c), .9); }
  #padState { font-size: 10px; letter-spacing: .3em; text-transform: uppercase; margin-top: 10px; color: #7dffb0; min-height: 14px; }
  #padHelp { font-size: 13px; letter-spacing: .06em; color: rgba(214,228,245,.72); line-height: 1.6; max-width: 32ch; }
  #hilt { position: relative; width: 56px; height: 26vh; border-radius: 16px; margin-top: 18vh; background: linear-gradient(90deg, #14181e, #8f98a3 28%, #2b3038 46%, #c5a15a 50%, #2b3038 54%, #a3acb6 76%, #12151a); box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 20px 60px rgba(0,0,0,.7); transition: margin .3s, height .3s, opacity .3s; }
  #hilt::before { content: ""; position: absolute; left: 50%; bottom: 100%; width: 9px; height: 0; margin-left: -4.5px; border-radius: 10px; background: #fff; box-shadow: 0 0 14px 5px rgb(var(--c)), 0 0 46px 16px rgba(var(--c), .6); transition: height .28s cubic-bezier(.1,.8,.2,1); }
  #hilt.on::before { height: 16vh; }
  #hilt i { position: absolute; left: 50%; top: 22%; width: 18px; height: 18px; margin-left: -9px; border-radius: 50%; background: rgb(var(--c)); box-shadow: 0 0 18px rgb(var(--c)); }
  #pad.menu #hilt { height: 0; margin-top: 0; opacity: 0; }
  .zone { width: 100%; max-width: 420px; display: none; }
  #pad.linked.play #zPlay, #pad.linked.menu #zMenu, #pad:not(.linked) #zJoin { display: block; }
  #pad button { font: inherit; font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: #e9f1fb; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.2); border-radius: 16px; padding: 18px 8px; touch-action: manipulation; }
  #pad button:active { transform: scale(.96); background: rgba(255,255,255,.2); }
  #pad button.primary { background: rgba(var(--c), .28); border-color: rgba(var(--c), .9); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid .wide { grid-column: 1 / -1; padding: 24px 8px; font-size: 14px; }
  /* d-pad */
  .dpad { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 68px); gap: 8px; margin-bottom: 14px; }
  .dpad button { font-size: 22px; letter-spacing: 0; padding: 0; }
  .dpad .ok { font-size: 12px; letter-spacing: .2em; }
  .dpad span { display: block; }
`;
const RGB = { azure: '56,150,255', verdant: '60,255,120', violet: '170,90,255', ember: '255,140,50', blanc: '190,220,255' };
const D = Math.PI / 180;
const wrap = (a) => ((a + 540) % 360) - 180;

export async function runPad(hostId) {
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  document.documentElement.style.setProperty('--c', RGB.azure);
  const root = document.createElement('div'); root.id = 'pad'; root.className = 'play';
  root.innerHTML = `<div><h1>RIPOSTE</h1><div id="padState">Tap connect</div></div>
    <div id="hilt"><i></i></div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:100%">
      <p id="padHelp">Hold your phone like a sword hilt. The blade comes out of the top edge.</p>
      <div class="zone" id="zJoin"><div class="grid"><button id="pConnect" class="primary wide">Connect</button></div></div>
      <div class="zone" id="zPlay"><div class="grid"><button id="pCenter" class="primary wide">Recentre</button><button id="pBlade">Sheathe</button><button id="pPause">Pause</button></div></div>
      <div class="zone" id="zMenu">
        <div class="dpad"><span></span><button data-k="up">▲</button><span></span><button data-k="left">◀</button><button data-k="confirm" class="primary ok">OK</button><button data-k="right">▶</button><span></span><button data-k="down">▼</button><span></span></div>
        <div class="grid"><button data-k="back">Back</button><button id="pCenter2">Recentre</button></div>
      </div>
    </div>`;
  document.body.appendChild(root);
  const $ = (id) => document.getElementById(id), state = (t) => ($('padState').textContent = t);
  const buzz = (p) => { if (navigator.vibrate) { try { navigator.vibrate(p); } catch {} } };
  let conn = null, a0 = null, b0 = 0, raw = { a: 0, b: 0 }, yw = 0, pt = 0.8, have = false, lastSend = 0, lastT = 0;
  const fy = { x: 0, dx: 0, raw: 0 }, fp = { x: 0, dx: 0, raw: 0 };
  const lp = (cut, dt) => 1 - Math.exp(-dt * 2 * Math.PI * cut);
  const euro = (f, v, dt) => {
    const d = (v - f.raw) / dt; f.raw = v;
    f.dx += (d - f.dx) * lp(1.0, dt);                                   // smoothed speed, rad/s
    f.x += (v - f.x) * lp(1.1 + 1.6 * Math.abs(f.dx), dt);              // 1.1 Hz at rest, wide open in a swing
    return f.x;
  };
  const send = (m) => { if (conn && conn.open) conn.send(m); };
  const recentre = () => { a0 = raw.a; b0 = raw.b; buzz(10); };

  // deviceorientation: alpha = compass angle of the phone, beta = front-to-back tilt. The top edge points along
  // (-sin a cos b, cos a cos b, sin b), so its heading is alpha and its elevation is beta: gamma (roll about the
  // blade) drops out entirely, which is why the grip does not matter.
  const onOrient = (e) => {
    if (e.alpha == null || e.beta == null) return;
    raw = { a: e.alpha, b: e.beta };
    if (a0 == null) { a0 = e.alpha; b0 = e.beta; }
    // past vertical (tipped back toward you) alpha flips by 180: fold it back so the blade does not jump
    let dyaw = wrap(a0 - e.alpha), elev = e.beta;
    if (Math.abs(elev) > 90) { dyaw = wrap(dyaw + 180); }
    // a little amplification so wrist-sized movements cover the whole court; neutral is a raised guard
    const tYaw = Math.max(-1.9, Math.min(1.9, dyaw * D * 1.5));
    const tPitch = Math.max(-1.1, Math.min(2.0, 0.85 + (elev - b0) * D * 1.35));
    // one-euro filter per angle: a low cutoff while the hand is still (kills tremor), opening up with speed so a
    // swing is not delayed. The speed estimate is itself low-passed, so sensor noise cannot open the filter.
    const now = performance.now(), dt = Math.min(0.05, Math.max(0.004, (now - lastT) / 1000)); lastT = now;
    if (!have) { fy.x = tYaw; fp.x = tPitch; fy.raw = tYaw; fp.raw = tPitch; have = true; }
    yw = euro(fy, tYaw, dt); pt = euro(fp, tPitch, dt);
    if (now - lastSend < 15) return; lastSend = now;
    send({ t: 'o', yw: +yw.toFixed(4), p: +pt.toFixed(4) });
  };
  // a heartbeat: even if the browser stops delivering sensor events for a moment, the PC keeps hearing the last pose
  setInterval(() => { if (have && performance.now() - lastSend > 90) { lastSend = performance.now(); send({ t: 'o', yw: +yw.toFixed(4), p: +pt.toFixed(4) }); } }, 100);
  // keep the screen on while it is a controller
  const keepAwake = async () => { try { if (navigator.wakeLock) await navigator.wakeLock.request('screen'); } catch {} };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });
  window.__pad = { get raw() { return raw; }, get out() { return { yw, pt }; }, recentre };

  for (const b of root.querySelectorAll('[data-k]')) b.addEventListener('click', () => { send({ t: 'b', k: b.dataset.k }); buzz(8); });
  $('pCenter').onclick = recentre; $('pCenter2').onclick = recentre;
  $('pBlade').onclick = () => { send({ t: 'b', k: 'blade' }); buzz(12); };
  $('pPause').onclick = () => { send({ t: 'b', k: 'pause' }); buzz(8); };

  $('pConnect').onclick = async () => {
    try {
      // iOS only grants motion access from a tap
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { state('Motion access denied'); return; }
      }
      addEventListener('deviceorientation', onOrient); keepAwake();
      state('Connecting…');
      const { Peer } = await import('peerjs');
      const peer = new Peer();
      peer.on('error', (e) => state(`Could not connect (${e.type || 'error'})`));
      peer.on('open', () => {
        conn = peer.connect(hostId, { reliable: false });
        conn.on('open', () => { state('Connected'); root.classList.add('linked'); $('padHelp').textContent = 'Point the top of your phone at the screen and tap Recentre.'; });
        conn.on('close', () => { state('Disconnected — reload to rejoin'); root.classList.remove('linked'); });
        conn.on('data', (m) => {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'hello' || m.t === 'color') document.documentElement.style.setProperty('--c', RGB[m.color] || RGB.azure);
          if (m.t === 'blade') { $('hilt').classList.toggle('on', !!m.on); $('pBlade').textContent = m.on ? 'Sheathe' : 'Ignite'; }
          if (m.t === 's' || m.t === 'hello') {
            // the host says whether a menu is open: the phone turns into a remote, or back into a hilt
            if (m.menu !== undefined) { root.classList.toggle('menu', !!m.menu); root.classList.toggle('play', !m.menu); }
            if (m.label) $('padHelp').textContent = m.label;
          }
          if (m.t === 'f') buzz({ return: 12, riposte: 26, kill: [10, 20, 30], boss: [40, 30, 80], hit: [60, 40, 90], ignite: 18 }[m.k] || 10);
        });
      });
    } catch (e) { state('Could not start: ' + (e.message || e)); }
  };
}
