// Entry: the same URL serves the game, or (with ?pad=<id>) the phone-as-hilt controller.
const pad = new URLSearchParams(location.search).get('pad');
if (pad) import('./input/pad.js').then((m) => m.runPad(pad));
else import('./app.js');

// installable + offline: a small service worker caches the game after the first visit (production builds only)
if (import.meta.env.PROD && 'serviceWorker' in navigator) addEventListener('load', () => { navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}); });
