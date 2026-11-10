// Entry: the same URL serves the game, or (with ?pad=<id>) the phone-as-hilt controller.
const pad = new URLSearchParams(location.search).get('pad');
if (pad) import('./input/pad.js').then((m) => m.runPad(pad));
else import('./app.js');
