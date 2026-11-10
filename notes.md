# RIPOSTE — decisions

Run: `npm run dev` (http://localhost:5173). Build: `npm run build`.

## What it is
- First-person, Fruit-Ninja-style deflect game. You cannot attack; a swing through a bolt sends it back to whoever fired it.
- Setting: the Mirror Court — a flooded fencing piste under a total eclipse, colonnade in fog, rain, lightning.
- Fencing vocabulary throughout (bouts, parry, riposte, touché, flèche); the boss is "The Maestro".

## Tech
- Vite + three.js r187, WebGL2. No assets: all geometry, textures, shaders and audio are procedural.
- HDR pipeline: MSAA half-float target -> UnrealBloom -> lens pass (shockwaves, CA, vignette, grain) -> ACES.
- Floor is a planar Reflector with a custom shader (ripples, rain rings, blade as an analytic line light, streaked reflection).
- Audio is all WebAudio synthesis (hum follows swing speed, pentatonic chime climbs with your streak).

## Sword
- Hilt: lathe-turned parts, knurled grip (generated normal map), crystal cage, heat-sink fins, emitter cup, knuckle bow.
- Lifecycle: stud press -> crystal ramps -> emitter flash -> blade extends with a plasma front and overshoot -> settles into flicker.
  Retract accelerates into the hilt, snaps, leaves the emitter glowing hot with smoke.
- Blade retracts between bouts, on pause/tab-hide, and on death. Space toggles it manually.
- Forearm is IK'd to an elbow anchored below the view so it always leaves the frame.

## Rules
- Approach ring shows where and when; swipe through it in the window. Still blade = PARRY (blocks, no return). Tight timing = PERFECT (2 damage).
- 3 integrity, +1 per cleared bout. Streak multiplier every 5. TEMPO meter -> slow time, every return echoes to a second target.
- Bouts I–V scripted (wisp, twin, lancer, bulwark, Maestro), then endless scaling.

## Bugs worth remembering
- `pow(x, 2.0)` with negative x is undefined in GLSL -> NaN -> black frames through bloom. Use `gauss()` / `x*x`.
- Screenshots stall when the browser pane is hidden; use `__riposte.snap(name)` (dev server writes `.shots/<name>.jpg`) and `tools/sheet.py`.

## Debug harness (`window.__riposte`)
`manual(true)`, `step(dt, n)`, `until(fn, max)`, `snap(name)`, `stepSnap(name, n)`, `ignite()`, `retract()`, `start()`, `autoplay(true)`, `pointer(nx, ny)`, `info()`.

## Not done yet
- Blind critic rounds against references (messenger.abeto.co, aviator.yakudoo.games, Lacoste Ace Breaker, oryzo.ai) have not been run.
- End card after death and mobile in-play view not visually confirmed. Real-phone performance and audio untested.
