// Phone-as-hilt, phone side (opened as ?pad=<id>). No game here: just a hilt that reports where it points.

const css = `
  body { background: radial-gradient(ellipse at 50% 30%, #0b1524, #03060b 70%); color: #e9f1fb; font-family: "Avenir Next","Segoe UI",system-ui,sans-serif; }
  #gl, #ui { display: none !important; }
  #pad { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: calc(28px + env(safe-area-inset-top)) 22px calc(26px + env(safe-area-inset-bottom)); text-align: center; touch-action: none; }
  #pad h1 { font-weight: 200; letter-spacing: .5em; margin-right: -.5em; font-size: 26px; color: #e9f1fb; text-shadow: 0 0 22px rgba(var(--c), .9); }
  #pad p { font-size: 13px; letter-spacing: .08em; color: rgba(214,228,245,.7); line-height: 1.6; max-width: 30ch; }
  #padState { font-size: 11px; letter-spacing: .3em; text-transform: uppercase; margin-top: 10px; color: #7dffb0; min-height: 14px; }
  #hilt { position: relative; width: 74px; height: 46vh; border-radius: 20px; background: linear-gradient(90deg, #14181e, #8f98a3 28%, #2b3038 46%, #c5a15a 50%, #2b3038 54%, #a3acb6 76%, #12151a); box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 20px 60px rgba(0,0,0,.7); }
  #hilt::before { content: ""; position: absolute; left: 50%; bottom: 100%; width: 10px; height: 0; margin-left: -5px; border-radius: 10px; background: #fff; box-shadow: 0 0 14px 5px rgb(var(--c)), 0 0 46px 16px rgba(var(--c), .6); transition: height .28s cubic-bezier(.1,.8,.2,1); }
  #hilt.on::before { height: 17vh; }
  #hilt i { position: absolute; left: 50%; top: 24%; width: 22px; height: 22px; margin-left: -11px; border-radius: 50%; background: rgb(var(--c)); box-shadow: 0 0 18px rgb(var(--c)); }
  #pad .btns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; max-width: 380px; }
  #pad button { font: inherit; font-size: 12px; letter-spacing: .22em; text-transform: uppercase; color: #e9f1fb; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.2); border-radius: 16px; padding: 20px 8px; }
  #pad button.primary { grid-column: 1 / -1; background: rgba(var(--c), .28); border-color: rgba(var(--c), .9); padding: 24px 8px; font-size: 14px; }
  #pad button:active { transform: scale(.97); background: rgba(255,255,255,.18); }
`;
const RGB = { azure: '56,150,255', verdant: '60,255,120', violet: '170,90,255', ember: '255,140,50', blanc: '190,220,255' };
const wrap = (a) => ((a + 540) % 360) - 180;

export async function runPad(hostId) {
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  document.documentElement.style.setProperty('--c', RGB.azure);
  const root = document.createElement('div'); root.id = 'pad';
  root.innerHTML = `<div><h1>RIPOSTE</h1><div id="padState">Tap connect</div></div>
    <div id="hilt"><i></i></div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:100%">
      <p id="padHelp">Hold your phone upright like a sword hilt, screen toward you, pointing at the game.</p>
      <div class="btns"><button id="pConnect" class="primary">Connect</button></div>
    </div>`;
  document.body.appendChild(root);
  const $ = (id) => document.getElementById(id), state = (t) => ($('padState').textContent = t);
  let conn = null, a0 = null, b0 = null, last = { a: 0, b: 0 }, lastSend = 0;

  const send = (m) => { if (conn && conn.open) conn.send(m); };
  const onOrient = (e) => {
    if (e.alpha == null) return;
    last = { a: e.alpha, b: e.beta };
    if (a0 == null) { a0 = e.alpha; b0 = e.beta; }
    const now = performance.now(); if (now - lastSend < 14) return; lastSend = now;
    // yaw sweeps left/right, tilt sweeps up/down; ±24° covers the whole screen
    send({ t: 'o', x: Math.max(-1.15, Math.min(1.15, -wrap(e.alpha - a0) / 24)), y: Math.max(-1.15, Math.min(1.15, (e.beta - b0) / 20)) });
  };
  const controls = () => {
    $('padHelp').textContent = 'Point at the screen and tap Recenter. Then swing.';
    document.querySelector('#pad .btns').innerHTML = `<button id="pGo" class="primary">Confirm / Ignite</button><button id="pCenter">Recenter</button><button id="pPause">Pause</button>`;
    $('pGo').onclick = () => { send({ t: 'b', k: 'confirm' }); if (navigator.vibrate) navigator.vibrate(12); };
    $('pCenter').onclick = () => { a0 = last.a; b0 = last.b; if (navigator.vibrate) navigator.vibrate(8); };
    $('pPause').onclick = () => send({ t: 'b', k: 'pause' });
  };

  $('pConnect').onclick = async () => {
    try {
      // iOS only grants motion access from a tap
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { state('Motion access denied'); return; }
      }
      addEventListener('deviceorientation', onOrient);
      state('Connecting…');
      const { Peer } = await import('peerjs');
      const peer = new Peer();
      peer.on('error', (e) => state(`Could not connect (${e.type || 'error'})`));
      peer.on('open', () => {
        conn = peer.connect(hostId, { reliable: false });
        conn.on('open', () => { state('Connected'); controls(); });
        conn.on('close', () => state('Disconnected — reload to rejoin'));
        conn.on('data', (m) => {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'hello' || m.t === 'color') document.documentElement.style.setProperty('--c', RGB[m.color] || RGB.azure);
          if (m.t === 'blade') $('hilt').classList.toggle('on', !!m.on);
          if (m.t === 'f' && navigator.vibrate) navigator.vibrate({ return: 12, riposte: 26, kill: [10, 20, 30], boss: [40, 30, 80], hit: [60, 40, 90] }[m.k] || 10);
        });
      });
    } catch (e) { state('Could not start: ' + (e.message || e)); }
  };
}
