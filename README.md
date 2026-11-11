# RIPOSTE

**You cannot strike. Only return.**

A browser game where you can't attack. Put an energy sword in the path of incoming bolts and they fly back at whoever fired them. Swing hard and it's a riposte: double damage.

- Everything is procedural: geometry, textures, shaders and audio. No asset files.
- Plays with mouse, touch, a gamepad, or your phone as the hilt (scan a QR code, point, swing).
- Works on desktop and mobile. On a phone, tilting the device leans the camera.

## Run

```bash
npm install
npm run dev
```

```bash
npm run build
```

## Controls

| Input | How |
| --- | --- |
| Mouse / touch | The blade follows your pointer or finger |
| Keyboard | Space sheathes / ignites, Esc pauses, M mutes, Enter confirms |
| Gamepad | Right stick aims, A confirms / sheathes, Start pauses |
| Phone as hilt | Opening page → Controllers → Pair a phone |
| DualSense gyro | Controllers → Gamepad gyro (Chromium, experimental) |

## How it plays

- A closing ring shows where and when each bolt lands. Have the blade there and it returns.
- Three guard. One comes back for every bout you clear.
- Every return fills Tempo. When it's full, time bends and each return echoes to a second target.
- A master waits every fourth bout: the Maestro, the Hydra, the Bastion, then again, harder.

## Tech

Vite, three.js (WebGL2), WebAudio, PeerJS for the phone link. See [notes.md](notes.md) for design decisions.

## Credits

**Score.** Built from three orchestral pieces by [Luis_Humanoide](https://pixabay.com/users/luis_humanoide-12661853/), used under the [Pixabay Content License](https://pixabay.com/service/license-summary/) and edited into loops (`public/audio`):

- [Secrets of the Jedi](https://pixabay.com/music/main-title-secrets-of-the-jedi-inspired-by-star-wars-331637/) — `calm.mp3` (menus, between bouts) and `theme.mp3` (a master falls)
- [Star Wars Style Battle Music](https://pixabay.com/music/main-title-star-wars-style-battle-music-148641/) — `battle.mp3`
- [Temple of the Dark Side](https://pixabay.com/music/main-title-temple-of-the-dark-side-cinematic-dark-choral-music-219925/) — `boss.mp3`

These audio files are not covered by this repository's code licence; they remain under the Pixabay Content License and must not be redistributed on their own.

**Adaptive mix and all sound effects** are synthesized in the browser with WebAudio (`src/audio`). The game state picks the bed; a smoothed intensity value brings each bed's low, mid and high layers in and out; synthesized timpani, brass and cymbals land on the player's actions.

Not affiliated with or endorsed by any film or game franchise.
