# ShowPlay — Mixer, Keys and MIDI controllers (v12)

The visitors' page is for the public. The **Mixer** is for whoever runs the show. It works like a MIDI controller on
a phone, a tablet or a computer: pads to start effects, colour pads, faders, hold buttons and scenes. Its **Keys**
mode turns every model of your props into a key you can play, like the notes of a keyboard. A **real MIDI
controller or keyboard** (for example an Alesis VI25) can play all of it too.

```
phone / tablet / computer ──► Mixer page (http://<bridge-ip>:8099/mixer) ──┐
MIDI controller ──► bridge (Windows, Linux, Pi) or page (Chrome / Edge) ───┼──► bridge ──► cube (DDP)
                                                                           └──────────────► EZPlayer ──► props
```

## Contents

- [Opening the Mixer](#opening-the-mixer)
- [Mixer tab](#mixer-tab)
- [Keys tab](#keys-tab)
- [Pong tab](#pong-tab)
- [Invaders tab](#invaders-tab)
- [MIDI tab: real controllers](#midi-tab-real-controllers)
- [Alesis VI25 preset](#alesis-vi25-preset)
- [How it works with the visitors](#how-it-works-with-the-visitors)
- [Where the settings are kept](#where-the-settings-are-kept)
- [For developers: the controls and the API](#for-developers-the-controls-and-the-api)
- [Troubleshooting](#troubleshooting)

## Opening the Mixer

- On the bridge's computer: **http://localhost:8099/mixer**.
- From a phone or tablet on the same Wi-Fi: **http://\<bridge-ip\>:8099/mixer**. The bridge's address is at the top
  of its window and log.
- From the control page, use the **🎛️ Mixer & 🎹 Keys** button at the top.

Several phones can have the Mixer open at once. They all see the same state, which refreshes about once a second.

The Mixer can drive the **sides of the cube** and the **props** set up on the control page. Props appear only while
the bridge can reach EZPlayer. The Mixer works even when visitors' requests are switched off.

## Mixer tab

1. **Targets**: tap the sides and props to drive. Tap again to unpick, or use All and None.
   - The green dot shows that the Mixer is driving that target now.
   - Pads, colours and faders act on what is picked. So you can put fire on the wings and snow on the cube.
2. **Pads**: tap a pad to start that effect on the picked targets.
   - **Effects**: the 12 prop effects (Flap, Colour wave, Rising, Spin, Breathe, Sparkle, Fire, Ripples, Chase,
     Comet, Confetti, Colours). They work on the cube and on props.
   - **Cube scenes**: the cube effects of the visitors' page (snow, fireworks, Christmas tree, haunted house,
     plasma…). Sides only; props keep their effect.
   - **Text**: type a message and it scrolls on the picked sides, in the first colour of their palette. There is no
     word filter here, because this page is for the person running the show.
3. **Colours**: the 11 palettes (Rainbow, Halloween, Christmas, Fire, Ice, Ocean, Candy, Forest, Sunset, Gold, Party).
   The lit pad is the palette of the first picked target.
4. **Faders**:
   - **Master**: brightness of everything the Mixer and the Keys drive.
   - **Speed**: from 0.2× to 3× the normal speed, for the picked targets.
   - **Colour**: turns the palette's colours around the colour wheel.
   - **White**: blends the colours towards white (pastel to white).
   - The faders change the effect live, without restarting it.
   - **Hold buttons**: **⚡ Flash** (all white), **💥 Strobe** (white flashes, 6 a second) and **⬛ Blackout**. They
     work only while held, and act on everything the Mixer and the Keys drive.
5. **Scenes**: 8 slots.
   - To keep a scene, tap **💾 Save to…**, then tap a slot and give it a name. A scene keeps every target that is on,
     with its effect, palette and faders, plus the Master.
   - Tap a slot to bring its scene back.
   - Scenes are saved in the settings file and survive a restart.
- **Stop the picked** gives the picked targets back to the visitors and the show. **Release all** gives everything
  back.
- **Give back after … untouched** (5 min, 15 min, 1 hour or never): if nobody touches the Mixer or the Keys for that
  long, everything goes back to the visitors and the show by itself. The default is 15 minutes, so a forgotten Mixer
  never blocks the visitors all night.

## Keys tab

Every **model of every prop** becomes a key, plus every **side of the cube**, up to **128 keys**, the range of MIDI
notes. Make a prop from a group (for example all the snowflakes), and each snowflake is its own key. A model that is in
two props appears once.

**Play:**

- **Press a key** and that model lights up. Pressing higher on the key plays it harder (velocity): the top of the key
  is full brightness, the bottom is soft.
- **Slide up and down while holding** to change its brightness live (aftertouch).
- **Let go** and it fades out over the Release time.
- Several fingers play several keys at once.
- On a computer keyboard, **1–0, Q–P, A–L and Z–M** play the first 36 keys. The letter is shown on each key.
- **All off** stops every key.

**Edit keys:** tap **✏️ Edit keys**, then tap a key to set it up. Settings are saved straight away.

- **Effect**: one of the 12 effects. The default is Colours, which lights the model in its own colour.
- **Colours**: **Own colour**, or one of the palettes. Keys start with different colours, like a rainbow keyboard.
- **Colour, White, Level**: the key's colour, how pastel it is, and how bright it is at full velocity.
- **Hold to try**: plays the key while held.

**All keys** faders:

| Fader | What it does |
| --- | --- |
| Master | The same Master as the Mixer |
| Attack | How long a key takes to reach its brightness (0–2 s; 0 = at once) |
| Release | How long it takes to fade out after you let go (0–4 s) |
| Colour all | Turns the colours of every key around the colour wheel |

The bridge reads the pixel positions of the models once, in the background, when the Keys tab first opens. On a big
show this takes a few seconds the first time.

## Pong tab

New in v14. Pong on the lights, for the people running the show. The page talks to the bridge on the home network,
so there is no delay.

- **Start:** pick a side (or all sides) and press **🤖 1 player** (red against the computer) or **👫 2 players**.
- **Paddles:**
  - drag a finger in the red or blue strip (two phones can each hold one);
  - on a computer, use W / S and ↑ / ↓;
  - a MIDI fader or knob works too: press 🎓 Learn, touch a strip, then move the fader or knob. The controls are named
    `game:p1` and `game:p2`.
- **The computer:** it plays any paddle nobody moves. It reacts late and aims a little off, so it can be beaten.
- **Scoring:** first to 5 points wins. The score shows as dots at the top of the side.
- **Ending:** **⏹ Stop** ends the game. A two-player game also ends after 2 minutes with nobody moving a paddle.
- **With visitors' games:** Pong can start only when no visitors' game is being played (including a visitor's own
  Pong, new in v16), and visitors cannot start one while the crew's Pong is on. Their 🎮 Games tab shows that the crew
  is playing, with the score. The crew's paddles and MIDI controls do nothing during a visitor's Pong.

## Invaders tab

New in v15. Space Invaders on the lights, at full speed, for the people running the show. Visitors have a slower
version on their page, made for the relay's delay.

- **Start:** pick a side (or all sides) and press **▶️ Start**. After 2.5 seconds the invaders march.
- **Moving:** the slider (where the ship goes), ◀ / ▶ held, or ← / → (A / D) on a keyboard.
- **Firing:** 🔥 (held, it fires again and again), Space, or a MIDI pad. At most 2 shots fly at a time.
- **MIDI:** press 🎓 Learn, then touch the slider (`game:ship`: a knob or fader moves the ship), ◀ / ▶ (`game:left` /
  `game:right`) or 🔥 (`game:fire`), and move or press the control on the device.
- **The game:** three lives, an extra life per wave cleared, shields, a mystery ship (50–150 points), and faster waves.
  It ends when the invaders land, the lives run out, after 7 minutes, or after 2 minutes with nobody touching it.
- **With visitors' games:** like Pong, it starts only when no visitors' game is being played, and the phones show that
  the crew is playing.

## MIDI tab: real controllers

A MIDI controller or keyboard plays the same controls.

**How the messages reach the bridge:**

| Computer of the bridge | How |
| --- | --- |
| Windows | **The bridge reads the device itself** (through Windows' own MIDI system). Plug it in; it is found within 10 seconds. Close other music programs that use the same device first, because Windows lets only one program open it. |
| Raspberry Pi and Linux | **The bridge reads the device itself** (`/dev/snd/midi*`). Plug it in; it is found within 5 seconds. The user that runs the bridge must be in the **audio** group (it is by default on Raspberry Pi OS). |
| macOS (or any computer) | **Through the Mixer page in Chrome or Edge.** Plug the device into the computer, open **http://localhost:8099/mixer** there (browsers allow MIDI only on `localhost`), go to the MIDI tab and press **Use the MIDI devices of this browser**. Keep the page open while you play. |

The MIDI tab shows the devices the bridge reads and the **last message received**, which is handy for checking what a
pad or knob sends. Do not use both ways for the same device, or every message arrives twice. The checkbox "The bridge
reads the MIDI devices…" turns the bridge's own reading off. It takes effect when the bridge restarts.

**Keys from MIDI notes:**

- **Note that plays the first key**: the note number that plays key #1 (36 = C2, the first pad of most pad
  controllers). Each note above plays the next key. Use **Learn: press the lowest key** to set it by pressing a key.
- **Velocity** sets how bright the key is.
- **Aftertouch** (polyphonic, or channel pressure) makes a held key brighter, up to full.
- **Note off** fades it out over the Release time.
- **CC 123** (All notes off) stops every key.

**Learn any control:**

1. Press **🎓 Learn** at the top of the page. Every control that can be mapped gets a yellow dashed border.
2. Touch the control on the page: a pad, colour, fader, hold button, scene, target, or key.
3. Move or press the control on the MIDI device. The yellow bar says when it is mapped.
4. Touch another control to map more, or press 🎓 Learn again to finish.

| On the device | Suits | What happens |
| --- | --- | --- |
| Fader or knob (CC) | Faders: Master, Speed, Colour, White, Attack, Release, Colour all | The control follows the knob (0–127 → 0–100 %) |
| Pad or key (note) | Pads, colours, scenes, targets, holds, keys | Press = tap; for holds and keys, held as long as the note is held, with its velocity |
| Button sending CC | Pads, colours, scenes, holds | Pressed when the value is 64 or more |

Mapped controls are listed in the MIDI tab, where each one can be forgotten (✕), or all at once.

**Without any mapping:** CC 7 (volume fader) is Master, and CC 1 (modulation wheel) is "Colour all" of the keys. A note
mapped to a control no longer plays a key. Notes are matched by note and channel, so pads and keys on different channels
never get mixed up.

## Alesis VI25 preset

On the MIDI tab, **Load preset: Alesis VI25** maps the VI25 with its factory settings:

| VI25 | ShowPlay |
| --- | --- |
| 25 keys (channel 1) | The Keys: the lowest key with the octave buttons in the middle (C3, note 48) plays key #1. Velocity and aftertouch work |
| Pads 1–12 (notes 36–47, channel 10) | Effects: Flap, Colour wave, Rising, Spin, Breathe, Sparkle, Fire, Ripples, Chase, Comet, Confetti, Colours |
| Pad 13 / 14 / 15 (notes 48–50) | Flash / Strobe / Blackout, held as long as the pad |
| Pad 16 (note 51) | Release all |
| Knobs 1–8 (CC 20–27) | Master, Speed, Colour, White, Attack, Release, Colour all keys, palette (turning knob 8 goes through the 11 palettes) |
| Modulation wheel (CC 1) | Colour all keys |

- **Pick the targets on the page**: the pads act on what is picked. Or learn the VI25's buttons onto targets and
  scenes.
- **If a pad or knob does nothing**, it was changed with the VI Editor. Look at "Last message received" while pressing
  it, and use Learn.
- **If the keys start at the wrong model**, use **Learn: press the lowest key**.

The preset adds to what is already mapped. Load it, then learn anything else you want.

## How it works with the visitors

- **While the Mixer drives a target**, visitors' requests and games for that side or prop **wait**. They start as soon
  as the Mixer gives the target back.
- **Keys** go on top of everything while they sound, and give the model back as soon as they have faded out.
- **The Mixer and the Keys work even when "Show the visitors' requests" is off.** So you can play the lights before
  opening to the public.
- **When a side is given back**, it goes back to its board's own effect, or turns off if "Turn the side off when its
  request ends" is ticked. A prop goes back to the show.
- **The log** on the control page says what the Mixer is driving ("mixer: Front, Gargoyle wings").

## Where the settings are kept

Everything is in `showplay_config.json`, next to the bridge:

| Setting | What it holds |
| --- | --- |
| `mixer_idle` | Minutes untouched before the Mixer gives everything back (0 = never) |
| `mixer_scenes` | The 8 scenes |
| `keys_set` | Each key's effect, colours and level |
| `keys_glob` | Attack, Release and Colour all |
| `midi_native` | Whether the bridge reads the MIDI devices itself |
| `midi_base` | The note that plays the first key |
| `midi_map` | Learned notes and CCs → controls |

What the Mixer is driving at the moment is not saved: after a restart, everything starts given back.

## For developers: the controls and the API

Every control has a name, the same one the Learn mode stores:

| Name | Control |
| --- | --- |
| `pad:<effect>` | Effects pad (`flap`, `wave`, `rise`, `spin`, `breathe`, `sparkle`, `fire`, `ripple`, `chase`, `comet`, `confetti`, `solid`) |
| `cube:<effect>` | Cube scene pad (the cube effect keys of the visitors' page) |
| `pal:<palette>` | Colour pad (`rainbow`, `halloween`, `christmas`, `fire`, `ice`, `ocean`, `candy`, `forest`, `sunset`, `gold`, `party`); `pals:all` = a knob going through them |
| `fader:bright` / `fader:speed` / `fader:hue` / `fader:white` | Mixer faders |
| `keys:attack` / `keys:release` / `keys:hue` | All-keys faders |
| `hold:flash` / `hold:strobe` / `hold:black` | Hold buttons |
| `scene:0` … `scene:7` | Scenes |
| `target:s0`, `target:p0` | Pick or unpick a side (`s` + number) or a prop (`p` + number) |
| `key:s0`, `key:m:<model>` | One key |
| `game:p1` / `game:p2` | Pong paddles (red / blue): a fader or knob moves the paddle |
| `game:ship` / `game:left` / `game:right` / `game:fire` | Space Invaders: a knob or fader moves the ship; pads move it while held, or fire |
| `off` / `release` | Stop the picked / Release all |

The page talks to the bridge with JSON. POST requests need the header `X-Cube: 1`, like the control page.

- `GET /api/mixer`, `POST /api/mixer`: `{"a": "sel", "keys": [...]}`, `{"a": "pad", "fx": "fire"}` (or `"c:snowfall"`),
  `{"a": "pal", "pal": "ice"}`, `{"a": "fader", "name": "speed", "v": 0.7}`, `{"a": "hold", "name": "flash", "ms": 900}`,
  `{"a": "text", "t": "..."}`, `{"a": "save" | "load" | "clear", "n": 0}`, `{"a": "off"}`, `{"a": "release"}`,
  `{"a": "idle", "v": 15}`.
- `GET /api/keys`, `POST /api/keys`: `{"a": "on", "k": "m:WingGargoyleLeft", "v": 0.8}`, `{"a": "after", "k": ..., "v": 1.0}`
  (without `v`: only "still held"; the page sends it every second, and a key left held more than 4 s without it
  is let go), `{"a": "off", "k": ...}`, `{"a": "allOff"}`, `{"a": "set", "k": ..., "fx": ..., "pal": ..., "hue": ...,
  "white": ..., "level": ...}`, `{"a": "glob", "attack": ..., "release": ..., "hue": ..., "bright": ...}`.
- `GET /api/midi`, `POST /api/midi`: `{"a": "msg", "d": [status, data1, data2]}` (a raw MIDI message),
  `{"a": "learn", "id": "pad:fire"}`, `{"a": "forget", "k": "c0:20"}`, `{"a": "base", "v": 48}`, `{"a": "learnBase"}`,
  `{"a": "preset", "name": "vi25"}`, `{"a": "clear"}`, `{"a": "native", "v": true}`.
- `GET /api/invaders`, `POST /api/invaders`: `{"a": "start", "z": -1}`, `{"a": "move", "x": 0.0–1.0}` or `{"a": "move", "d": -1 | 0 | 1}`,
  `{"a": "fire"}`, `{"a": "stop"}`.
- `GET /api/pong`, `POST /api/pong`: `{"a": "start", "mode": "cpu" | "pvp", "z": -1}`, `{"a": "pad", "p": 0 | 1, "v": 0.0–1.0}`
  (0 = top), `{"a": "stop"}`.

Keys held from a MIDI device do not need the "still held" message: they stay on until their note off.

## Troubleshooting

- **The Mixer page does not open from the phone**: the phone must be on the same Wi-Fi as the bridge's computer, and
  the computer's firewall must allow port 8099 (the same as for the control page).
- **A prop shows "…" and does not light**: the bridge is reading its pixel positions (the first time, on a big show,
  it takes a few seconds), or EZPlayer is not answering. Check the EZPlayer status on the control page.
- **A key does nothing**: same as above for props. A side key needs the side to be set up and its board reachable.
- **The MIDI tab shows no device**:
  - Windows: close music programs (DAW, VI Editor) using the device, then wait 10 s.
  - Linux and Raspberry Pi: check that `ls /dev/snd/midi*` lists the device and that the user is in the audio group
    (`groups`). If not: `sudo usermod -aG audio $USER`, then log out and in, or restart the service.
  - Mac: use the browser button, in Chrome or Edge, at http://localhost:8099/mixer.
- **"Browsers only allow MIDI on http://localhost"**: open the page on the computer the device is plugged into, with
  `localhost` in the address, not its IP.
- **Every MIDI message arrives twice**: the bridge and the page are both reading the same device. Untick "The bridge
  reads the MIDI devices…" and restart the bridge, or stop using the browser button.
- **The lights went back to the visitors by themselves**: nobody touched the Mixer for the "Give back after" time.
  Choose a longer time or "never" in the Mixer tab.
