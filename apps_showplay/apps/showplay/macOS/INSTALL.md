# ShowPlay — Installation guide for macOS (v11)

Visitors scan a QR code on the wall, and from their phone they send a message, a picture, an effect or a drawing
to a cube of LED matrices, play **Four in a Row** on it, or light up **props of the show** (the wings, the bats,
the spinners…) with effects and colours.

The cube is **independent**: it needs no xLights and no show player. The bridge runs on a Mac at home, draws each
request and sends the pixels **straight to the cube's controller over DDP**. That controller can be WLED,
ESPixelStick or any other DDP board. You set up the sides of the cube on the bridge's own control page.

```
phone ──► visitors' page ──► ntfy.sh ──► showplay_bridge.py ──DDP──► controller of the cube
```

Your home network is never opened to the internet: the bridge, at home, fetches the requests from ntfy.sh.

| Where | What it is |
|---|---|
| `macOS/` (this folder) | The bridge (`showplay_bridge.py`) and the macOS start files |
| `../visitors-page/` | The page visitors open from the QR code. You publish it on the web once (step 2) |
| `../docs/props.md` | How the Props feature works, in detail |
| `../CHANGELOG.md` | Every version, with what changed |
| `CONTENTS.md` (this folder) | What each file is for |

## 1. The cube's controller

Use any board that receives **DDP** (UDP port 4048), for example **WLED** or **ESPixelStick**. Connect it to your home
network and give it a fixed IP address (set it on the board or reserve it in your router).

- **One board or several:** all sides can be on one board, one panel after the other, or each side can have its own
  board.
- **On WLED:** set the LED output (GPIO pin and total LED count) in WLED's LED settings. Leave the matrix drawing to
  the bridge: if WLED has a 2D matrix or a ledmap set up and the pictures come out scrambled, turn those off.
- **Between requests**, WLED shows its own effect or preset. When the bridge stops sending, WLED goes back to it after
  a few seconds. For boards that would keep the last picture instead, turn on **Turn the side off when its request
  ends** on the control page.

## 2. Publish the visitors' page (once)

The page has to be on the internet so phones can open it. GitHub Pages is free:

1. Create a new repository on GitHub, for example `merryoncherry-cube`.
2. Upload **the contents** of the `showplay/visitors-page/` folder (one level up from this guide) to it: `index.html`, `gifmaker.js`
   and the `gifs` folder.
3. In the repository, go to **Settings › Pages**, choose **Deploy from a branch**, then **main** and **/ (root)**,
   and click **Save**.
4. After a minute the page is live at `https://YOUR-NAME.github.io/merryoncherry-cube/`.

Any other static web host works too. The page only talks to ntfy.sh.

If the whole `ezplayer-contrib` repository is published with GitHub Pages, the page is already at
`https://ezpixelplayer.github.io/ezplayer-contrib/apps/showplay/visitors-page/` and you can skip this step.

## 3. Install the bridge on the Mac

This folder works on any Mac that runs a recent macOS, with **Apple Silicon (M1 to M4) or Intel**. The Mac must be on
the same network as the cube's controller, and switched on (not asleep) while the show runs.

### 3.1 Python 3

The bridge needs **Python 3** and nothing else. Check whether the Mac already has it: open **Terminal** (Applications
› Utilities) and type `python3 --version`.

- If it shows a version (3.8 or newer), Python is ready.
- If macOS offers to install the "command line developer tools", accept: that installs Python 3 too.
- Otherwise, download the **macOS installer** from <https://www.python.org> and run it.

### 3.2 Put the folder in place

Put this `macOS` folder where it can stay, for example in `Documents/ShowPlay`. The bridge keeps its settings
(`showplay_config.json`) in the same folder.

| File | What it does |
| --- | --- |
| `start_bridge.command` | Starts the bridge in a Terminal window. Closing the window (or Ctrl-C) stops it. Use it to try things out. |
| `install_autostart.command` | Makes the bridge start by itself, with no window, every time you log in to the Mac, and starts it now. No administrator password is needed. |
| `remove_autostart.command` | Stops the bridge and stops it starting by itself. Settings are kept. |

### 3.3 Allow the files to open (once)

Files downloaded from the internet are blocked by macOS until you allow them.

1. **Right-click** (or Control-click) `start_bridge.command`, choose **Open**, then **Open** again in the warning. Do
   the same once for the other two `.command` files.
2. If macOS says the file "can't be opened because it is not executable" (this happens after downloading from the
   GitHub website), open Terminal in this folder and run `chmod +x *.command`.
3. On newer macOS versions, if there is no **Open** button, go to **System Settings › Privacy & Security** and click
   **Open Anyway** for the file.

### 3.4 Try the bridge

1. Open **`start_bridge.command`**. A Terminal window opens and shows the control page address, for example
   `http://192.168.1.40:8099`.
2. The first time, macOS may ask:
   - whether Python may **accept incoming network connections**. Click **Allow**, so phones on the home network can
     open the control page.
   - whether it may **find devices on your local network**. Click **Allow**, so the bridge can send to the cube's
     controller and reach EZPlayer.

### 3.5 Make it start by itself

When everything works, close the Terminal window and open **`install_autostart.command`**. The bridge now runs in
the background every time you log in, and restarts by itself if it ever stops. Its log is in
`~/Library/Logs/ShowPlay/bridge.log` (in Finder: **Go › Go to Folder…**, then type `~/Library/Logs/ShowPlay`).

To keep the show running, the Mac must not go to sleep: in **System Settings › Energy** (or **Battery** on a laptop),
turn on **Prevent automatic sleeping**. On a laptop, keep it plugged in.

## 4. Set up the sides of the cube

Open the control page: **http://localhost:8099** on the Mac, or **http://MAC-IP:8099** from a phone on the home
network.

Each side of the cube is one LED matrix panel. Under **Sides of the cube**:

1. Click **Find WLED boards** and then **Add as a side**, or click **➕ Add a side** and type the details yourself:
   - **Name for the visitors:** Front, Back, Left, Right, Top…
   - **Board IP address:** the controller this panel is plugged into.
   - **First LED of this side on the board:** `1` if the panel is the first thing on the board's output. If several
     panels are chained on one output, the next panel starts after the previous one. For example, with 32 × 32
     panels the second starts at `1025`, the third at `2049` and the fourth at `3073`. **Add a side** fills this in
     for you from the side before.
   - **Width and Height:** the number of LEDs across and down the panel.
   - **First LED is at the:** the corner where the data cable goes into the panel.
   - **LEDs run:** **Across (rows)** or **Up and down (columns)**.
   - **Zig-zag:** ticked if each row (or column) goes back the other way, which is how most panels are wired.
2. Click **Save**.
3. Click **Identify** on each side. For 10 seconds the panel shows a **white arrow pointing up**, a **red top row**
   and a **green left column**. If the panel doesn't look like that, change that side's corner, direction or zig-zag,
   save, and identify again. Identify works even while the visitors' requests are switched off.

Tips:

- **"All sides"** (one request on every side at once) only appears for visitors when **every side has the same
  size**.
- A side does not have to be square, and the bridge works with any size up to 128 × 128 and up to 8 sides.

## 5. Finish on the control page

1. **Visitors' page:** check the **show name** (MerryOnCherry by default) and type the **address** where you published
   the page (step 2).
2. Set the times and options, then click **Save**.
3. Print the **QR codes**. There is one each for Halloween, Christmas and other celebrations, and each opens the page
   in that theme.
4. Switch on **Show the visitors' requests**.
5. Type something under **Test** to check that it shows on the cube.

Settings are kept in `showplay_config.json`, next to the bridge. The show code inside the QR addresses is made on the
bridge's first start and never changes, so you can change sides or times later without reprinting the posters.

**Frames per second:** under "How requests show" on the control page, **Frames per second sent to the lights** is 20 by
default. Lower it to 15 or 10 if the Mac is slow or busy with other programs.

## EZPlayer on the same Mac (optional)

EZPlayer has a Mac version for Apple Silicon and Intel ([releases](https://ezrgb.com/ezplayer)). Run it as usual,
with your show folder open. On the bridge's control page, the EZPlayer address stays `http://127.0.0.1:3000`.

Props, and cube sides sent through EZPlayer, need EZPlayer 0.7 or newer.

## Optional: sides through EZPlayer

If you also run an **EZPlayer** show and want a side to be part of it, set that side's **Sent** option to **Through
EZPlayer**. The side is then a matrix model of your EZPlayer show (from its xLights layout). Type the EZPlayer
address, click **Read the models from EZPlayer** and choose the model. Requests show on top of the sequence that is
playing on that side, and when they end the side goes back to the show. Every side can be set either way.

Don't send the same panel both ways at once (straight from the bridge and from a show player), because they would
fight over it.

## What visitors can send

- **Message:** written by the visitor (up to 40 letters, with a bad-word filter) or one of the ready messages for
  the theme. It can scroll (drawn by the bridge), or be placed, shown on two lines or animated (made into a GIF on
  the phone).
- **Picture:** from the picture pack in `showplay/visitors-page/gifs/`. Visitors can combine up to 3 pictures and bring them
  to life (bounce, rainbow, snow, sparkles…) with a name or word added.
- **Effect:** 6 per theme, drawn by the bridge. Halloween: haunted house, eyes in the dark, fire, lightning, magic
  flames, black hole. Christmas: falling snow, candy cane, Christmas tree, twinkling stars, fireworks, colour bursts.
  Other celebrations: rainbow, fireworks, plasma, ripples, falling code, ocean.
- **Drawing:** in 9 colours, at the size of the chosen side, which can also be brought to life.

## Game: Four in a Row

Visitors open the **🎮 Game** tab on the visitors' page:

- **Play against the computer:** the visitor plays red (or orange at Halloween) and goes first. The computer can be
  set to **Easy**, **Normal** or **Hard** on the control page (Games). Easy is good for small children: it makes
  mistakes on purpose.
- **Play against a friend:** the first visitor starts the game, and a friend opens the same page on their own phone
  (from the same QR code), goes to **🎮 Game** and taps **Join the game**.

How it works:

- The game shows on the side the visitor picked, or on all sides. While a game is on, that side shows the board, and
  other requests for it wait until the game ends.
- Each player has **45 seconds** per move. If time runs out, the game ends (against a friend, the other player wins).
  A friend has 90 seconds to join.
- Only one game can be played at a time. Other visitors see "A game is being played" and can watch it on the lights
  and on their phone.
- At the end, the four winning discs blink and the board turns rainbow for a few seconds. Then the side goes back to
  normal.
- Each phone keeps its own player code, so another phone cannot play for someone else.
- To switch games off, untick **Let visitors play Four in a Row on the cube** on the control page.

The bridge posts the board on ntfy.sh **once per move**, and each phone sends its own moves. That keeps well inside
ntfy.sh's free limits for a show. If you ever see "could not post the game board" in the log, ntfy.sh is limiting
the bridge, and the board on the phones updates again a few seconds later.

## Props of the show (through EZPlayer)

If you run an **EZPlayer** show, visitors can also light up props of the show, such as a pair of wings, the bats or
the spinners. They pick an effect, a palette or their own colours, and a speed, and the props show it on top of the
sequence that is playing. When the effect ends, the props go back to the show.

**What visitors pick (on the ✨ Props tab):**

- **The prop:** each one has the name and icon you give it.
- **The effect:** Flap, Colour wave, Rising, Spin, Breathe, Sparkle, Fire, Ripples, Chase, Comet, Confetti or
  Colours. A preview on the phone shows the effect on a pair of wings.
- **The colours:** Rainbow, Halloween, Christmas, Fire, Ice, Ocean, Candy, Forest, Sunset, Gold or Party, or **My
  colours** (1 to 3 of the page's 9 colours).
- **The speed:** slow, normal or fast.

**Setting up props (on the control page, under "Props of the show"):**

1. Type the EZPlayer address (under "EZPlayer"), then click **Read models and groups from EZPlayer**.
2. Click **➕ Add a prop** and give it a name for the visitors (for example "Gargoyle wings") and an icon.
3. Search for models or groups (for example `wing`, `bat`, `spinner`) and click the ones to add. A group adds all its
   models.
4. **Spread the effect across all its models:**
   - Off (the default): each model does the same. This suits pairs of wings, or a row of bats that should all match.
   - On: one effect runs across all the models together. This suits a row of arches or a line of trees.
5. Click **Save**, then **Try it**.

How it works:

- **Shape:** the bridge reads where each pixel of each model is, using the model's own grid, so the effect follows the
  real shape of the wings however they sit in the layout.
- **Pairs:** for a pair named `...Left` / `...Right`, the bridge knows where the body is, so Flap, Colour wave and
  Spin mirror on the two wings.
- **Matrices and trees:** EZPlayer maps the picture onto them. Very big matrices are drawn smaller and EZPlayer
  enlarges them.
- **Length:** each prop effect lasts the "Prop effect" time on the control page (20 s by default). Requests for the
  same prop replace or wait like the other requests.
- **Not supported yet:** DMX lights (floods, moving heads) are not pixels, so they can't be props.

Props need **EZPlayer 0.7 or newer** (its overlay API). The full explanation is in
[../docs/props.md](../docs/props.md). The Props tab only appears for visitors while the bridge can
reach EZPlayer.

## Safety

- **Bad words:** free text goes through a filter (English and Portuguese, and it also catches numbers used as
  letters). No filter is perfect, so if something you don't want gets through, turn on approval or turn off free text.
- **Limits:** a wait between requests from each phone (set on the control page, 0 by default), and in the bridge
  **at most 20 requests per minute** in total. The same request repeated within 3 s is ignored, and at most 20
  requests can be queued or waiting for approval.
- **The ntfy.sh channel is public:** anyone who knows the code can send requests, but the bridge only accepts valid
  ones (ready messages, pictures from the pack, drawings of the right size). To change the code, change `topic` in
  `showplay_config.json` and reprint the QR codes.
- **Control page:** it has no password. It can only be reached from your home network, and it only accepts commands
  from itself, so another website open on a phone on your network cannot change the settings.

## If something doesn't work

- **Nothing shows on a side:** check the board's IP address, that the Mac and the board are on the same network, and
  that the board accepts DDP (WLED does). The log at the bottom of the control page says when a board can't be
  reached.
- **The picture is upside down, mirrored or scrambled:** use **Identify** and change that side's corner, direction
  or zig-zag. With WLED, also turn off its 2D matrix and ledmap.
- **A side shows part of another side:** check each side's **First LED** and size, so that no two sides on the same
  board overlap.
- **Pictures don't show:** check the visitors' page address on the control page. The bridge downloads the pictures
  from `<page address>/gifs/`.
- **"EZPlayer: not answering"** (only for sides through EZPlayer): check that EZPlayer is open with the show loaded
  and that its web UI opens at `http://localhost:3000`.
- **"can't be opened because it is not executable":** run `chmod +x *.command` in this folder (step 3.3).
- **"cannot be opened because it is from an unidentified developer":** right-click the file and choose **Open**, or
  click **Open Anyway** in System Settings › Privacy & Security (step 3.3).
- **"Python 3 is not installed yet":** install Python 3 (step 3.1), then open the file again.
- **The control page opens on the Mac but not on a phone:** allow Python in **System Settings › Network › Firewall ›
  Options** (or allow it the next time macOS asks).
- **Works from `start_bridge.command`, but nothing reaches the cube after `install_autostart.command`:** check
  **System Settings › Privacy & Security › Local Network** and allow Python there. Then open `remove_autostart.command`
  and `install_autostart.command` again.
- **The bridge stops at night:** the Mac went to sleep. Turn on **Prevent automatic sleeping** (step 3.5).
- **After updating `showplay_bridge.py`:** open `remove_autostart.command`, then `install_autostart.command`.
- **See what the bridge is doing (auto-start):** open `~/Library/Logs/ShowPlay/bridge.log`, or look at the log at the
  bottom of the control page.
