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

## After critic rounds 1 and 2 (reports in `.shots/critic_round*.md`, not committed)
- Identity v3: one thin typeface. Wordmark is cut by a stroke of light, the I is a blade, the mark reflects in the water. Buttons are text on a blade that ignites on hover. The outlined-logo experiment was dropped at the owner's request.
- Opening page shows the hilt in hand; the first click ignites it, then the page turns to blade select.
- Hit test is judged at the reticle (tight radius). On touch the finger rides the blade exactly like the mouse does.
- Orbs: tracking eye with lids, wings, tail, cannon; chirps; they glance at a comrade's explosion. Streak lights lanterns down the colonnade. Moths gather at a lit blade. A visitor drifts in on the menus. At one guard left the eclipse beats.
- Phone: Aim touch/tilt toggle on the blade page. Desktop: "Use your phone as the saber" pairs a phone by QR.
- Live: https://riposte.amaansyed27.dev (also https://riposte-iota.vercel.app)
- Open: a third critic round has not been run; real phone, gamepad, DualSense and audio remain untested.

## Play v3 (owner feedback: blade only stood up; a blade in the right place did not always repel)
- Blade angle comes from motion: the pointer is a point on the blade and the hilt is towed behind it (a tractrix), so a sideways move lays it flat, a downward cut tips it over, a circle spins it, and at rest it keeps its guard. Phone-as-saber and DualSense send real roll and override this.
- Deflection is physical: each frame the bolt's own screen position is tested against the area the blade swept in the last 0.09 s, while the bolt is between 3.6 m and 0.75 m from the camera. No timing window. The ring is guidance only and fills in your colour when the blade lies across it.
- Returned bolts leave the contact point on a curve bent by the swing, then home on the shooter.
- Two bolts from different orbs never arrive within 0.5 s of each other on opposite sides. First run: the first bolt hangs short of you until your blade is across it.
- Input bug: pointermove was dropped when getCoalescedEvents() returned an empty list.
- Test players: R.autoplay(true | 'human' | 'swing'). Phone roll sign and DualSense roll are untested on hardware.

## Score (adaptive music)
- Beds in `public/audio` are edits of three pieces by Luis_Humanoide from Pixabay (Pixabay Content License): calm + theme from "Secrets of the Jedi", battle from "Star Wars Style Battle Music", boss from "Temple of the Dark Side". Chosen because they are original "inspired by" pieces, not covers of film themes. Cut with ffmpeg, loudness-normalised to -17 LUFS, 112 kbps.
- `src/audio/score.js`: game state picks the bed (menu, select, rest, bout, boss, win, dead) with crossfades; each bed is split live into low/mid/high bands driven by a smoothed intensity (bolts in flight, orbs alive, streak, last guard). Loops crossfade into themselves over 2.6 s, so no sample-exact loop points are needed.
- Our own synthesized accents (timpani, low brass, cymbal swells, a four-note horn call and its resolved answer) are tied to actions, not to a beat: the tracks have no reliably detectable tempo, so a metric layer would have clashed.
- Tempo slows the tape to 0.84 and closes a filter; death winds it down to half speed; pause muffles; taking a hit ducks the music.
- If the beds fail to load, the old synthesized pad and pulse stand in.
- Nobody has listened to any of this yet. Levels and the taste of the accents are unverified.

## Opening sequence, loading, saved runs
- `src/boot/boot.js`: cards on an eclipse chart (Dawnlight mark, Built with Claude / Fable 5.2 with a pixel critter, three.js, Amaan Syed, then the real menu). Mode is first (no `riposte.seenAt`), cold (last visit over 7 days ago, Skip shown) or warm (straight to the menu behind a brief loader). `?intro` forces first, `?nointro` forces warm.
- A click is required before the sequence so it can have sound.
- `preload()` in `src/app.js`: fonts, one of every sentinel type, `renderer.compileAsync`, four warm frames (reflection, bloom, lens), then all five music beds fetched into the HTTP cache. The frame loop is paused while booting. The loader is a blade leaving its hilt.
- Saved run: `riposte.run` is written at the start of every bout from II on and cleared on death; the menu shows Continue. Best score, blade colour, aim mode and tutorial state were already persisted.
- Menu: left-aligned list on landscape with the hilt on the right; its own theme (`menu.mp3`, "The Path of the Force").
- CSS/WAAPI animations do not advance while the preview pane is in the background; captures were made by finishing animations by hand.

## Fullscreen, sound after reload, edge cases
- Fullscreen toggle: opening gate, menu item, Controllers row, corner icon, and F. Hidden where the browser has no Fullscreen API (iPhone Safari).
- Sound after a reload: browsers keep audio silent until the page is interacted with, and a quick return skips the gate. Any first pointerdown/keydown/touchend now unlocks audio (capture listener on window); the game also tries to start it when boot finishes, and shows a "click anywhere for sound" pill if the context is still suspended. Mute is remembered (`riposte.mute`). The context is resumed when the tab becomes visible again.
- Loader frame waits race a timeout, so a page opened in a background tab still finishes loading.
- WebGL context loss shows a reload message (the run is saved).
- Checked: warm reload reaches the menu with Continue and music running; reload mid-run resumes bout, score and guard and switches the music to the battle bed.

## Menu UX and rolling credits
- Cursor: the canvas hides it for play; `body.menu` (set on every screen change) brings back a themed blade cursor on menus.
- `src/ui/nav.js`: one selected item per screen shared by mouse, keyboard and gamepad. Arrows/WASD or d-pad/stick move, Enter/Space/A confirm, Esc/Backspace/B go back; left/right nudge a selected slider. Selected items show a description line; a footer shows the bindings and switches glyphs when a pad is used.
- Settings (was Controllers) gained Music and Effects volume sliders (`riposte.vol.*`). The window losing focus pauses a bout.
- Credits are a roll over the court (`#roll`), scrolled in the frame loop at one screen height per 13 s, to the heroic theme (`credits` state). Space/click-button pauses (and muffles the music), holding ↓ or the pointer runs 5x, Esc/B/Back leaves, and it returns to the menu at the end. The camera lifts toward the eclipse while it plays.
- Lesson: a broad "replace everything between A and B" patch deleted the fullscreen and sound wake-up block that had been inserted between those anchors. It was restored; check for collateral when splicing.

## Full-screen UI, music v2, install
- Blank screen on returning to the menu: the opening page replayed its staged entrance (2.5 s of delays) every time it was shown, over a scene at its darkest. The entrance now plays once (`#intro.first`); later returns are immediate. Exposure recovers quickly on menus and while paused.
- Screenshots of the preview pane sometimes come back solid black right after a state change; the DOM and a canvas luminance probe showed the page was fine. Re-capture before believing a black frame.
- Settings, results and pause are full-screen pages (`.page`), not modals. Settings has a sidebar (Audio, Graphics, Display, Controls, Game); from a paused bout only the first three are offered. Graphics values live in `src/core/settings.js` (`riposte.gfx`): preset, resolution scale, reflections, bloom, rain, film effects, screen shake, adaptive resolution, FPS counter. Phones default to Medium.
- Results: rank in Cinzel with a flavour line, counting score, rank ladder with distance to the next rank, stat bars. Ranks extended to Virtuose (90k) and Légende (180k).
- Music: the score starts in state `off` (the menu theme used to start under the opening cards); non-current beds are faded and stopped; the synth pad only plays if the beds fail to load. Battle bed measured at 123.07 BPM, phase 0.028 s, drift under 25 ms: synthesized drums are locked to that grid from the loop position and thicken with intensity (halves, beats, eighths, sixteenths, gallop). The boss bed has no stable pulse, so drums there run on their own clock (96 to 140 BPM with intensity). Each bout plays up to 10% faster (`pace`).
- Mix: ambience (rain, wind, thunder) has its own fader and default 60%; hum and swing whoosh roughly halved; music bus raised.
- Installable: `public/manifest.webmanifest`, `public/sw.js` (network-first pages, cache-first assets/audio/fonts/icons), icons generated by a PIL script. Install button appears when the browser fires `beforeinstallprompt`; iOS gets instructions.
- Phones: a rotate prompt in portrait offers fullscreen + `screen.orientation.lock('landscape')` (works on Android Chrome, not iOS Safari) or staying in portrait; pressing Play also tries it.

## Phone saber v2, gamepad, text sweep
- Phone as saber reads only the phone's long axis: yaw = compass heading of the top edge relative to Recentre, pitch = its elevation. Roll about the blade drops out, so grip and screen direction do not matter. Gains 1.5 / 1.35, neutral is a raised guard. Host pose builds the blade direction from `app.input.aim` (hilt anchored low, slides a little with yaw).
- Smoothing is a one-euro filter per angle on the phone (1.1 Hz at rest, opens with speed). Measured with simulated orientation over Chrome remote debugging (±0.25° tremor): still-hand drift 0.005 rad over 2 s, a 400°/s swing lags about 30 ms at 90%. A 100 ms heartbeat keeps the pose fresh; wake lock keeps the screen on.
- The phone is a remote in menus (d-pad, OK, Back) and a hilt in play (Recentre, Sheathe, Pause); the host tells it which with `{t:'s', menu}`.
- Gamepad: a stick push takes the blade and keeps it until the mouse moves (before, a centred stick handed control back to the mouse every frame, so the blade sat in the middle). DualSense gyro over WebHID now reads feature report 0x05 first, which is what switches a Bluetooth pad to the full 0x31 report. NOT tested on hardware yet.
- Removed `letter-spacing: revert-layer` (squashed text after returning to the menu) and the helper lines: menu descriptions, pane descriptions, select fine print, tempo hint.
- Dev server binds 127.0.0.1:5173 so `adb reverse` works for phone testing.

## Trailer
- `src/dev/trailer.js` (dev server only, `?nointro&trailer`) directs and captures the trailer: a shot list with scripted cameras (`app.cine`), blade poses (`app.pose = 'cine'`), seeded randomness, and canvas-drawn cards, saved frame by frame to `.shots/trailer/` so it is a true 60 fps. The render size is forced to 1920x1080 because the preview pane resets its viewport between turns.
- Sound is not recorded live. Every call the game makes to its audio engine during capture goes on a per-shot tape; the tapes plus hand-placed music cues are replayed into an `OfflineAudioContext` running the same `Audio` and `Score` classes (`new Audio(ctx)`), then written as WAV. Cuts in the montage sit on the battle bed's bars (123.07 BPM).
- `canvas.toBlob` is an idle task in the preview pane (about a second per frame); `toDataURL` is ten times faster.
- Encode: `ffmpeg -framerate 60 -i .shots/trailer/f_%05d.jpg -i .shots/trailer/audio.wav -af loudnorm=I=-14:TP=-1.5 ...`. Rain and film grain make it expensive: 228 MB at crf 20 (git-ignored master), 40 MB at crf 26.
- Bout drums were overpowering the bed ("metronome"): rhythm bus 0.8 -> 0.42, hat ticks cut to about a third, backbeat clack halved.
