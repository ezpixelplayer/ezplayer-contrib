# ShowPlay for Windows — What is in this folder

Every file of the `Windows` folder of ShowPlay v12, what it is for, and whether you need to change it, plus the parts
shared with the other versions. To install and set it up, see [INSTALL.md](INSTALL.md).

```
showplay/
├── README.md               start here: what ShowPlay is, and which folder to use
├── CHANGELOG.md            every version, with what changed and what was tested
├── docs/
│   └── props.md            how the "Props of the show" feature works (shared)
├── visitors-page/          the page visitors open (shared: published on the web once)
│   ├── index.html
│   ├── gifmaker.js
│   └── gifs/               pack.json + 73 pictures
├── Windows/                for a Windows PC
├── macOS/                  for a Mac (Apple Silicon or Intel)
├── linux-x64/              for a Linux PC (Intel or AMD, 64-bit)
└── arm64/                  for a Raspberry Pi with 64-bit Raspberry Pi OS
```

This folder (`Windows/`) holds:

```
Windows/
├── INSTALL.md            installation and setup guide for Windows
├── CONTENTS.md           this document
├── showplay_bridge.py    the bridge
├── start_bridge.bat      start the bridge in a window
├── autostart.bat         start the bridge with Windows (no window)
└── remove_autostart.bat  stop starting it with Windows
```

## Documents

| File | What it is |
| --- | --- |
| `INSTALL.md` (this folder) | The complete installation and setup guide for Windows, from the cube's controller to troubleshooting. |
| `CONTENTS.md` (this folder) | This document: what each file and folder is for. |
| `../README.md` | A short introduction to ShowPlay and which folder to use. |
| `../CHANGELOG.md` | Every version of ShowPlay, newest first, with what was added, what changed, what was fixed and how it was tested. |
| `../docs/props.md` | How the Props feature works, step by step: what visitors pick, setting up props, how the effects are drawn and sent to EZPlayer, effects and palettes, troubleshooting. |
| `../docs/mixer.md` | The Mixer, Keys and MIDI controllers (new in v12): every tab, the Alesis VI25 preset, how the Mixer works with the visitors, the settings, the controls and the API, troubleshooting. |

## The bridge — the program that runs on the PC

The bridge is the heart of ShowPlay. It runs on a Windows PC on the same network as the lights, fetches visitors'
requests from ntfy.sh, draws them and sends them to the lights. It needs **Python 3** (from python.org, with "Add
python.exe to PATH" ticked) and nothing else.

| File | What it is | Do you change it? |
| --- | --- | --- |
| `showplay_bridge.py` | The bridge itself, one Python file (standard library only). The same file in every platform folder. See the parts below. | No |
| `start_bridge.bat` | Starts the bridge in a window, using `py -3` or `python`. Closing the window stops it. Good for testing. | No |
| `autostart.bat` | Starts the bridge with no window (`pyw` or `pythonw`) and adds "ShowPlay bridge.bat" to the Windows Startup folder, so it starts every time you log in. | No |
| `remove_autostart.bat` | Deletes "ShowPlay bridge.bat" from the Windows Startup folder. A bridge already running keeps running until you end **pythonw** in Task Manager or restart. | No |
| `showplay_config.json` | **Not in the package.** The bridge creates it on its first start, next to `showplay_bridge.py`. It holds your settings and your private show code. Never publish it. | Only through the control page |

**The parts of `showplay_bridge.py`:**

- **Control page:** a web page on port 8099 (http://localhost:8099) to set everything up:
  - sides of the cube;
  - props;
  - visitors' page address and show name;
  - times, approval and free text;
  - games;
  - QR codes;
  - log;
  - a button to the Mixer.
- **Show channel:** listens on ntfy.sh for visitors' requests and checks every one of them:
  - only known values are accepted;
  - free text goes through a bad-word filter;
  - at most 20 requests a minute.
- **Drawing:** scrolling text (two built-in pixel fonts), GIF pictures (its own GIF decoder), drawings, 18 theme
  effects for the cube, the Four in a Row board, and 12 effects for props.
- **Frames per second:** 20, 15 or 10, set on the control page. Lower it if the PC is slow or busy.
- **Sending to the cube:** straight to the cube's controller over DDP (WLED, ESPixelStick or any DDP board), or
  through EZPlayer overlays.
- **Props:** reads the pixel positions and model groups of an EZPlayer show and lights up chosen models (wings,
  bats, spinners…) through EZPlayer overlays.
- **Four in a Row:** keeps the game, plays as the computer (Easy, Normal or Hard) and posts the board for the phones.
- **Status:** tells the visitors' page what is available (sides, sizes, theme, games, props), using the show code.
- **Mixer and Keys** (new in v12): a second page, `/mixer`, for whoever runs the show.
  - pads, palettes, faders, hold buttons and 8 scenes drive sides and props live;
  - Keys play each model like a note, with velocity, aftertouch, attack and release;
  - while the Mixer drives a target, visitors' requests for it wait; it gives everything back after a set time
    untouched.
- **MIDI** (new in v12): reads MIDI devices itself (winmm).
  Notes play the keys, Learn maps any note or CC onto any control, and there is a preset for the Alesis VI25.

## ../visitors-page/ — the page visitors open from the QR code (shared)

These files are published on the web, for example with GitHub Pages. Visitors open the page from a QR code that the
control page makes. The QR address carries the show code (`?t=showplay-…`) and the theme (`&theme=hw`, `xm` or `ev`).

| File | What it is | Do you change it? |
| --- | --- | --- |
| `index.html` | The page: one file with its own styles and scripts. See the tabs below. | No |
| `gifmaker.js` | The animation maker: turns a picture, a drawing or a text into an animated GIF on the visitor's phone (bounce, rainbow, snow, sparkles…). | No |
| `gifs/pack.json` | The list of pictures: file name, name shown to visitors and theme. | Only to add or remove pictures |
| `gifs/*.gif` | 73 small animated pictures, 16 × 16 pixels. | Only to add or remove pictures |

**The tabs of `index.html`:**

| Tab | What visitors do there | When it shows |
| --- | --- | --- |
| Message | Write a message (up to 40 letters) or pick a ready one, pick a colour, choose scrolling, placed, two lines or animated | Always |
| Picture | Pick up to 3 pictures from the pack and bring them to life | Always |
| Effect | Pick one of the 6 effects of the theme and two colours | Always |
| Draw | Draw with a finger in 9 colours, at the size of the chosen side | Always |
| 🎮 Game | Play Four in a Row against the computer or a friend | When games are on |
| ✨ Props | Light up a prop of the show with an effect, a palette or their own colours, and a speed | When props are set up and EZPlayer answers |

The page talks only to ntfy.sh. It never connects to the home network.

**The picture pack (`../visitors-page/gifs/`):**

| Theme | File names | Pictures |
| --- | --- | --- |
| Halloween | `hw-*.gif` | 29: Pumpkin, Ghost, Bat, Spider, Skull, Cauldron, Eyes in the dark, Black cat, Graveyard, Zombie hand, Candy corn, Witch hat, Full moon, Flying witch, Mummy, Spooky candle, Owl, Magic potion, Haunted house, BOO!, Bats, Eyeball, Jack-o'-lantern, Monster, Vampire, Spider web, Crow, Coffin, Zombie |
| Christmas | `xm-*.gif` | 27: Christmas tree, Snowfall, Snowman, Present, Candy cane, Star, Bell, Ornament, Gingerbread, Holly, Wreath, Stocking, Santa, Reindeer, Christmas lights, Christmas candle, Sleigh, Snowflake, Penguin, Fireplace, HO HO HO, Angel, Hot chocolate, Toy train, Polar bear, Snow globe, Star of Bethlehem |
| Other celebrations | `ev-*.gif` | 17: Heart, Fireworks, Easter egg, Confetti, Lucky clover, Birthday cake, Balloons, New Year 2027, Floating hearts, Bunny, Rainbow, Sun, Cupcake, Flower, Butterfly, Rocket, Disco ball |

**To add a picture:**

1. Put a 16 × 16 GIF in `../visitors-page/gifs/`, named `hw-`, `xm-` or `ev-` followed by 2 to 20 lowercase letters or digits, then
   `.gif` (for example `xm-elf.gif`).
2. Add a line for it to `../visitors-page/gifs/pack.json`.
3. Publish again. The bridge accepts only names that follow this pattern.

## How the parts fit together

```
visitor's phone ──► visitors-page (on the web) ──► ntfy.sh ──► bridge (at home) ──► the cube (DDP)
                                                                     └────────────► EZPlayer ──► props of the show
```

- **The visitors' page** sends requests to ntfy.sh, under the show code in the QR address.
- **The bridge** fetches them, checks them, draws them and sends them to the lights.
- **Phone updates:** the bridge posts a status (and the Four in a Row board) back to ntfy.sh, so the phones know what
  is available.
- **Nothing on the web can reach the home network:** the bridge, at home, makes all the connections.

## What you need

| Part | Needed for | Where it runs |
| --- | --- | --- |
| Windows 10 or 11 with Python 3 | The bridge | The PC at home |
| A DDP controller (WLED, ESPixelStick…) | Sides of the cube sent straight to the board | On the cube |
| EZPlayer 0.7 or newer | Props, and cube sides sent through EZPlayer | The same PC or another computer on the network |
| A static web host (GitHub Pages) | The visitors' page | The internet |
| ntfy.sh | Carrying requests between the page and the bridge (free, no account) | The internet |
