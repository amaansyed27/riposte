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
