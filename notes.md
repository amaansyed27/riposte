# RIPOSTE — decisions

Run: `npm run dev` (http://localhost:5173). Build: `npm run build`. Repo: github.com/amaansyed27/riposte.

## What it is
- First-person deflect game. You cannot attack; a bolt returns to its shooter when your blade is in its path.
- Setting: the Mirror Court — a flooded fencing piste under a total eclipse, colonnade in fog, rain, lightning.
- Fencing vocabulary throughout (bouts, riposte, touché, flèche).

## Flow
- Opening page (outlined wordmark, two blades igniting and crossing) -> blade select (3D hilt, picking a colour sheathes and re-ignites) -> court.
- End card: Try again / Home / Share / Copy. Pause: Resume / Home. Best score in localStorage (`riposte.best`).

## Tech
- Vite + three.js r187, WebGL2. No assets: geometry, textures, shaders and audio are procedural. Orbitron (OFL) is the only font file.
- HDR pipeline: MSAA half-float target -> UnrealBloom -> lens pass (shockwaves, CA, vignette, grain) -> ACES.
- Floor is a planar Reflector with a custom shader (ripples, rain rings, blade as an analytic line light, streaked reflection).
- `src/main.js` is a dispatcher: `?pad=<id>` loads the phone controller, otherwise the game (`src/app.js`).

## Sword
- Hilt: lathe-turned parts, knurled grip, crystal cage, heat-sink fins, emitter cup, knuckle bow; jointed gauntlet and a plated vambrace IK'd to an off-screen elbow.
- Lifecycle: stud press -> crystal ramps -> emitter flash -> blade extends with a plasma front and overshoot -> settles into flicker.
  Retract accelerates into the hilt, snaps, leaves the emitter glowing hot with smoke.
- Retracts between bouts, on pause/tab-hide, on death, on Home. Space toggles it.

## Rules (v2, after feedback that hits felt random)
- A bolt is only deflectable once it has physically reached the blade's plane (last ~0.1 s of flight). If the blade is on it, or swept through
  that spot in the previous 0.13 s, it returns. A still blade returns it too.
- Swing speed at contact decides the quality: a hard swing is a RIPOSTE (double damage, triple on the Bastion).
- 3 guard, +1 per cleared bout. Multiplier +1 every 5 in a row. Tempo meter -> slow time, each return echoes to a second target.

## Enemies
- All sentinels are panelled orbs with emitter ports and a lens (Remote, Binary pair, Lancer with barrel + sight line, Bulwark with armour petals).
- Boss every 4th bout, cycling and gaining tiers: Maestro (volleys), Hydra (invulnerable while its leashed orbs live, regrows them every 3 damage), Bastion (armour shell; only ripostes hurt much).

## Controllers
- Mouse/touch always on. Gamepad: stick aim, A confirm/sheath, Start pause, rumble.
- Phone as hilt: WebRTC data channel via the public PeerJS broker; QR on the Controllers card. Only aim, button presses and haptic cues cross the link.
- DualSense gyro via WebHID: experimental, written from the report layout, not tested on hardware. Browsers expose no motion for Xbox pads.
- Phone tilt leans the camera (asked for on first Play on touch devices).

## Bugs worth remembering
- `pow(x, 2.0)` with negative x is undefined in GLSL -> NaN -> black frames through bloom. Use `gauss()` / `x*x`.
- Restart freeze: `lastFire` was not reset while `clock` was, so enemies would not fire until the clock caught up.
- Screenshots stall when the browser pane is hidden; use `__riposte.snap(name)` (dev server writes `.shots/<name>.jpg`) and `tools/sheet.py`.

## Debug harness (`window.__riposte`)
`manual(true)`, `step(dt, n)`, `until(fn, max)`, `snap(name)`, `stepSnap(name, n)`, `ignite()`, `retract()`, `select()`, `start()`, `home()`, `autoplay(true)`, `pointer(nx, ny)`, `info()`.
