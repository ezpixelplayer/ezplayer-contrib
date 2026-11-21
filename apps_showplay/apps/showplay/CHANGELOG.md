# ShowPlay — changelog

Every update to ShowPlay (called Light Cube up to v9) is listed here, newest first, with what was added or changed and why. Each version also
updates the installation guides (`Windows/INSTALL.md`, `arm64/INSTALL.md`) and the contents guides (`CONTENTS.md` in each folder) where they changed.

| Version | Date | In one line |
| --- | --- | --- |
| v10 | 2026-11-21 | Renamed from Light Cube to ShowPlay, with settings, show codes and auto-start carried over |
| v9 | 2026-11-21 | Package split into a Windows folder and an arm64 (Raspberry Pi) folder, each with its own complete installation and contents guides |
| v8 | 2026-11-21 | Raspberry Pi: Linux start scripts, start-at-boot services for the bridge and EZPlayer, and a frames-per-second setting |
| v7 | 2026-11-21 | Control page: clearer ON/OFF state, and the EZPlayer status shown whenever props are set up |
| v6 | 2026-11-21 | Props of the show: visitors light up wings, bats, spinners and other models with effects, palettes and their own colours |
| v5 | 2026-11-21 | Four in a Row on the cube, against the computer or a friend |
| v4 | 2026-11-20 | Independent cube: the bridge sends pixels straight to the controller over DDP, with no xLights needed |
| v3 | 2026-11-20 | README: how to set up the controllers and the sides of the cube |
| v2 | 2026-11-20 | Show name MerryOnCherry on the bridge and the visitors' page |
| v1 | 2026-11-20 | First version in English: bridge, control page and visitors' page, through EZPlayer overlays |

---

## v10 — Renamed to ShowPlay (2026-11-21)

Light Cube is now **ShowPlay**. The old name came from the first version, when visitors could only send things to a
cube. Visitors can now also play Four in a Row and light up props of the show, so the new name says what it does:
visitors play with the show. Nothing changed in how it works.

**What was renamed:**

| Before (Light Cube) | Now (ShowPlay) |
| --- | --- |
| Folder `apps/light-cube/` | `apps/showplay/` |
| `cube_bridge.py` | `showplay_bridge.py` |
| `cube_config.json` | `showplay_config.json` |
| `visitors-page/cube.js` | `visitors-page/gifmaker.js` (the name says what it does: it makes the animated GIFs on the phone) |
| Windows start entry "Light Cube bridge.bat" | "ShowPlay bridge.bat" |
| Raspberry Pi service `light-cube` | `showplay` |
| New show codes `cube-…` | `showplay-…` |
| EZPlayer overlays named "Light Cube: …" | "ShowPlay: …" |
| Control page title "Light Cube" | "ShowPlay" |

**Nothing is lost when updating:**

- **Settings:** when there is no `showplay_config.json` yet, the bridge reads an existing `cube_config.json` (sides,
  props, settings and show code) and saves it under the new name. The old file is left in place.
- **QR codes:** existing show codes starting with `cube-` keep working, so printed QR codes stay valid. Only bridges
  set up from scratch get a `showplay-` code.
- **Windows:** `autostart.bat` removes the old "Light Cube bridge" start entry before adding the ShowPlay one, so two
  bridges never start. `remove_autostart.bat` removes both.
- **Raspberry Pi:** `install_service.sh` stops and removes an old `light-cube` service before installing `showplay`.
  `uninstall_service.sh` removes both.
- **Documents:** both installation guides have a new section, "Updating from Light Cube (v9 or earlier)".

**Visitors' page address:** if the page is published from this repository, its path is now
`apps/showplay/visitors-page/`. Set the new address on the control page and print the new QR codes. The old show code
keeps working with the new address.

**Tested:**
- **Settings taken over:** a bridge with only an old `cube_config.json` starts with the same show code, sides and
  props, and saves `showplay_config.json`.
- **New bridge:** a bridge started from scratch makes a `showplay-` code.
- **The visitors' page:** it loads `gifmaker.js` and works in a browser with no errors.
- **Scripts:** all `.sh` scripts pass ShellCheck. The install script removes an old `light-cube` service (checked with
  a stand-in `systemctl`).
- **Links and old names:** every link between the documents works, and no document outside this changelog still uses
  the old file names.

---

## v9 — Windows and arm64 folders (2026-11-21)

The package is now split by platform, so each person only sees the files and instructions for their computer. The
bridge works exactly as in v8; only its version number changed.

**New layout:**

```
light-cube/
├── README.md        which folder to use
├── CHANGELOG.md     this file
├── docs/props.md    how Props work (shared)
├── visitors-page/   the visitors' page (shared, published once)
├── Windows/         INSTALL.md, CONTENTS.md, cube_bridge.py and the .bat scripts
└── arm64/           INSTALL.md, CONTENTS.md, cube_bridge.py and the .sh scripts
```

**What changed:**

- **`Windows/`** holds the bridge and the three `.bat` scripts.
  - **`Windows/INSTALL.md`:** a complete Windows guide, with new detail on installing Python, where to keep the
    folder, the first start and Windows Firewall.
  - **`Windows/CONTENTS.md`:** what every file does, down to the Startup-folder shortcut that `autostart.bat` makes.
  - **Troubleshooting:** new Windows items (Python not found, a phone cannot open the control page, restarting after
    an update).
- **`arm64/`** holds the bridge and the four `.sh` scripts, for a Raspberry Pi with 64-bit Raspberry Pi OS.
  - **`arm64/INSTALL.md`:** one complete guide that includes everything from the old `docs/raspberry-pi.md`: which Pi,
    copying, `chmod`, trying, the `light-cube` service, EZPlayer headless and frames per second.
  - **`arm64/CONTENTS.md`:** what every file does, including exactly what each service runs, plus the useful
    `journalctl` and `systemctl` commands.
  - **Troubleshooting:** new Raspberry Pi items ("Permission denied", running the scripts with sudo, a service that
    does not start, EZPlayer not starting, stutter).
- **Shared by both:** `visitors-page/`, `docs/props.md` and this changelog stay at the top of `light-cube/`, because
  they are the same for both. The visitors' page is still published only once.
- **Removed:** `bridge/` (split into the two folders), `INSTALL.md` and `CONTENTS.md` at the top (one of each per
  folder now), and `docs/raspberry-pi.md` (merged into `arm64/INSTALL.md`).
- **README:** `README.md` now says which folder to use.

**If you already run the bridge:** your settings (`cube_config.json`) and show code stay where your bridge is.

- **Updating:** copy the new `cube_bridge.py` over the old one and restart the bridge. Nothing else is needed.
- **The visitors' page address:** it changes only if you publish from this repository and the folder path changed. In
  that case, set the new address on the control page and print the new QR codes.

**Tested:**
- **The bridge:** both copies of `cube_bridge.py` are the same file and pass a code check.
- **The scripts:** all four `.sh` scripts pass `bash -n` and ShellCheck, and are executable in the package.
- **Links:** every link between the documents points to a file that exists.

---

## v8 — Raspberry Pi (2026-11-21)

Light Cube can now run on a **Raspberry Pi** (or any Linux computer with systemd), on its own or together with
EZPlayer on the same Pi. Nothing changes on the visitors' page.

**New files (in `bridge/`):**

- **`start_bridge.sh`** starts the bridge in a terminal, the Linux version of `start_bridge.bat`.
- **`install_service.sh`** installs the bridge as the `light-cube` service. It starts with the Pi, restarts itself if
  it stops, and runs as your normal user, never as root. Its log is shown with `journalctl -u light-cube -f`.
- **`uninstall_service.sh`** removes that service and keeps the settings.
- **`install_ezplayer_service.sh`** (optional) runs EZPlayer headless, with no screen, as the `ezplayer` service.
  - It uses EZPlayer's own options: `--ozone-platform=headless headless --show-folder=… --web-port=3000 --local-audio`.
  - It checks that the program exists and that the folder is an xLights show folder.

**New setting:** **Frames per second sent to the lights**: 20 (as before), 15 or 10, on the control page under "How
requests show". A lower number means less work for a slower computer. The animations keep their speed.

**New document:** `docs/raspberry-pi.md` (since v9 part of [arm64/INSTALL.md](arm64/INSTALL.md)) covers:
- which Pi and how much memory for each setup;
- copying, trying and auto-starting the bridge;
- EZPlayer headless on the same Pi;
- which frames-per-second setting to use.

**Changed documents:** INSTALL.md points Raspberry Pi users to the new guide at step 3. README.md and CONTENTS.md list
the new files.

**Tested:**
- **Scripts:** all four pass `bash -n` and ShellCheck.
- **Services:** the install scripts were run against a stand-in `systemctl`, and the generated services were checked:
  user, folder, command, quoted paths and restart rules.
- **Wrong use is refused:** running without `sudo`, running as root, and pointing at a folder that is not a show
  folder.
- **The bridge on Linux:** it starts with `start_bridge.sh`, even from a folder with spaces in its name, and makes its
  own settings file and show code.
- **Frames per second:** the frame rate follows the setting (about 20 and 10 frames per second measured over DDP).
- **Not tested on real Raspberry Pi hardware yet.**

---

## v7 — Clearer state on the control page (2026-11-21)

A fix found while setting up props on the real show. The bridge itself works as in v6; only the control page and the
package changed.

**Fixed:**

- **ON/OFF with props only.** The state at the top said "OFF" whenever no side of the cube was set up, even with
  "Show the visitors' requests" ticked and props saved. It now says ON when requests show on sides, on props or on
  both, and says how many of each ("Requests show on 1 prop(s)").
- **Why it is OFF.** When requests are switched on but cannot show, the state now explains why:
  - "Nothing to show requests on yet: add a side of the cube or a prop below, then Save."
  - "The props need EZPlayer, which is not answering."
- **EZPlayer status with props.** The "EZPlayer: connected / not answering" line was only shown when a side of the
  cube went through EZPlayer. It now also shows whenever props are set up, because props always need EZPlayer.
- **No settings file in the package.** The v1 to v6 packages could include a `bridge/cube_config.json` left over from
  testing, with a show code in it. That file is no longer shipped. On its first start the bridge makes its own file,
  with a new private show code.

**If you used a package with `cube_config.json` in it:** delete that file (from the bridge folder, and from any
public copy such as a GitHub repository), start the bridge so it makes a new show code, then print the new QR codes
from the control page. Anyone who saw the old code could send requests to your lights.

**Documents:** the installation guide is now `INSTALL.md` (it was `README.md`), and `CONTENTS.md` explains every file
and folder. `README.md` is now a short introduction with links to the other documents.

**Tested:** the four states (nothing set up, prop without EZPlayer, prop with EZPlayer connected, switched off) in a
browser with a simulated EZPlayer, with no page errors.

---

## v6 — Props of the show (2026-11-21)

Visitors can now light up **props of the EZPlayer show**, such as a pair of wings, the bats or the spinners, and not
only the cube.

**New for visitors (✨ Props tab):**

- **The prop:** each prop is shown with the name and icon set on the control page.
- **The effect, one of 12:** Flap, Colour wave, Rising, Spin, Breathe, Sparkle, Fire, Ripples, Chase, Comet, Confetti
  and Colours.
- **The colours:** 11 palettes (Rainbow, Halloween, Christmas, Fire, Ice, Ocean, Candy, Forest, Sunset, Gold, Party),
  or **My colours**, 1 to 3 of the page's 9 colours.
- **The speed:** slow (0.5×), normal or fast (1.8×).
- **A live preview:** a pair of feathered wings plays the chosen effect with the same maths as the bridge.
- **A new tab layout:** the tabs sit in a 3 × 2 grid when there are six.

**New on the control page ("Props of the show" card):**

- **Read models and groups from EZPlayer:** lists every pixel model and every model group of the show. Groups are read
  from `xlights_rgbeffects.xml` through EZPlayer's file API and expanded to their pixel models.
- **Making a prop:** search models and groups, add them to a prop, and give it a name and an icon.
- **"Spread the effect across all its models":** one effect across a row of models, instead of the same effect on each.
- **Try it:** saves the settings and shows the prop with Flap / Rainbow straight away.
- **Prop effect time:** how long each prop request lasts, 20 s by default.

**How it works:**

- **Pixel positions:** the bridge reads EZPlayer's 2D pixel positions (`/api/ezp/model-coordinates-2d`) once, keeps
  the raw file, and pulls out only the models of its props.
- **Shape:** each pixel is placed on its model's own grid, so the shape is right even for models turned sideways in 3D
  (the wings in the MerryOnCherry layout are rotated about -90° on Y).
- **Mirrored pairs:** a model whose name ends in Left/L has its body at its right edge, Right/R at its left edge. Flap,
  Colour wave and Spin mirror on a pair.
- **Overlays:** one EZPlayer overlay per model. Pixel models use **nodes** format (one RGB value per pixel); matrices
  and trees use **grid** format. Matrices over 40,000 pixels are drawn smaller and EZPlayer enlarges them.
- **Back to the show:** when the effect ends, the overlays close and the models play the sequence again.

**Other changes:**

- **Requests:** the bridge accepts requests when only props are set up (no cube sides).
- **Status for the page:** the status posted for the visitors' page lists the props (name and icon only, never model
  names), and only while EZPlayer can be reached.
- **Wording:** the log line "side finished" is now "finished", because it also covers props.

**Tested:** the real MerryOnCherry 2026 layout through a simulated EZPlayer:

- Gargoyle, Butterfly and Hawk wings, bats, and the main matrix.
- All 12 effects, at under 1 ms per frame for 850 pixels.
- Overlays open and close, and invalid requests are refused.
- Both pages in a browser.

**Needs:** EZPlayer 0.7 or newer. DMX lights (floods, moving heads, wands) are not supported as props.

---

## v5 — Four in a Row (2026-11-21)

Visitors can play **Four in a Row** on a side of the cube from their phones.

**New for visitors (🎮 Game tab):**

- **Play against the computer:** the visitor plays red (orange at Halloween) and goes first.
- **Play against a friend:** the first visitor starts, and a friend opens the same page on their own phone and taps
  **Join the game**.
- **On the phone:** a board shows whose turn it is and the seconds left. The player taps a column to drop a disc.
- **Watching:** other visitors see "A game is being played" and can watch.

**On the cube:**

- **The board:** 7 × 6, with a falling animation for each disc and a strip on top in the colour of whose turn it is.
- **The end:** the four winning discs blink and the board turns rainbow for 8 s, then the side goes back to normal.
- **Sizes:** works on any side size (tested 32 × 32, 16 × 16 and 64 × 32).

**Rules and safety:**

- **Time:** 45 s per move and 90 s for a friend to join. When time runs out the game ends; against a friend, the other
  player wins.
- **One game at a time.** While a game is on, other requests for that side wait.
- **Player codes:** each phone keeps a secret player code and a public tag, so another phone cannot play for someone
  else. Moves out of turn, repeated moves and moves from a third phone are refused.

**New on the control page:** a "Games" card to switch games on or off and set the computer to Easy, Normal or Hard.
Easy makes mistakes on purpose for small children.

**How it works:**

- **Moves:** they arrive on the show channel like any request.
- **The board on the phones:** the bridge posts the board on `<code>-game` on ntfy.sh, once per move, and the phones
  follow it live (server-sent events). One post per move keeps well inside ntfy.sh's free limits.
- **The computer:** a negamax search with alpha-beta, depth 1 (Easy), 3 (Normal) or 5 (Hard).

---

## v4 — Independent cube over DDP (2026-11-20)

The cube no longer needs xLights or a show player. The bridge sends pixels **straight to the cube's controller over
DDP** (UDP port 4048): WLED, ESPixelStick or any DDP board.

**New on the control page ("Sides of the cube"):**

- **Each side's settings:** board IP, first LED on that board, width, height, start corner, direction (rows or
  columns) and zig-zag.
- **Several sides on one board:** they sit one after the other. "Add a side" fills in the next first LED.
- **Find WLED boards:** searches the home network and adds a board as a side in one click.
- **Identify:** for 10 s a side shows a white arrow pointing up, a red top row and a green left column, so wrong wiring
  settings are easy to spot. It works even while visitor requests are off.
- **Turn the side off when its request ends:** for boards that would otherwise keep the last picture. WLED goes back to
  its own effect by itself.
- **"Through EZPlayer" stays as an option** for each side, for a cube that is part of an EZPlayer show.

**Tested:** all 16 wiring combinations, DDP packets for large panels and for sides that start partway along a board,
and about 20 frames per second per side.

---

## v3 — Setup instructions (2026-11-20)

The README now explains how to add the cube's controller in xLights (DDP, E1.31 or Art-Net) and how to set up each side
as a Matrix model (size, start location, controller connection), with tips for checking each side. This was superseded
in v4, where the cube is set up on the bridge's own control page.

---

## v2 — MerryOnCherry (2026-11-20)

The default show name is **MerryOnCherry**, at the top of the visitors' page and in the browser tab. It can be changed
on the control page.

---

## v1 — First English version (2026-11-20)

The first version of Light Cube. Every part is in English: the bridge, the control page, the
visitors' page and the README.

- **The bridge (`cube_bridge.py`):** Python 3 with nothing to install. It draws everything itself: scrolling text,
  GIFs, drawings and 18 theme effects (6 each for Halloween, Christmas and other celebrations).
- **Sending (v1):** through EZPlayer's overlay API.
- **The visitors' page:**
  - Messages, with ready messages in English and free text with a bad-word filter.
  - Pictures from the pack, which visitors can animate on their phone.
  - Effects and drawings.
  - The show name comes from the bridge.
- **The control page:**
  - EZPlayer address and the sides of the cube.
  - Show name and the address of the visitors' page.
  - Times, approval and free text.
  - QR codes for Halloween, Christmas and celebrations.
- **Windows scripts:** start the bridge in a window, start it automatically with Windows, or stop starting it
  automatically.
