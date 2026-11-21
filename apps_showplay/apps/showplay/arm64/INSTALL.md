# ShowPlay — Installation guide for Raspberry Pi (arm64) (v11)

Visitors scan a QR code on the wall, and from their phone they send a message, a picture, an effect or a drawing
to a cube of LED matrices, play **Four in a Row** on it, or light up **props of the show** (the wings, the bats,
the spinners…) with effects and colours.

The cube is **independent**: it needs no xLights and no show player. The bridge runs on a Raspberry Pi at home, draws each
request and sends the pixels **straight to the cube's controller over DDP**. That controller can be WLED,
ESPixelStick or any other DDP board. You set up the sides of the cube on the bridge's own control page.

```
phone ──► visitors' page ──► ntfy.sh ──► showplay_bridge.py ──DDP──► controller of the cube
```

Your home network is never opened to the internet: the bridge, at home, fetches the requests from ntfy.sh.

| Where | What it is |
|---|---|
| `arm64/` (this folder) | The bridge (`showplay_bridge.py`) and the Linux / Raspberry Pi scripts |
| `../visitors-page/` | The page visitors open from the QR code. You publish it on the web once (step 2) |
| `../docs/props.md` | How the Props feature works, in detail |
| `../CHANGELOG.md` | Every version, with what changed |
| `CONTENTS.md` (this folder) | What each file is for |

## Updating from Light Cube (v9 or earlier)

ShowPlay is the new name of Light Cube. Nothing you set up is lost:

1. Copy the files of this `arm64` folder into your old bridge folder, next to your `cube_config.json`, and run
   `chmod +x *.sh`. The old `cube_bridge.py` can be deleted.
2. Run **`sudo ./install_service.sh`**. It removes the old `light-cube` service and installs the new `showplay` one.

On its first start, ShowPlay takes over your `cube_config.json`, with the same sides, props, settings and show code,
and saves it as `showplay_config.json`. Your printed QR codes keep working. If you also move the visitors' page to a
new address, set it on the control page and print the new QR codes.

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

## 3. Install the bridge on the Raspberry Pi

This folder is for a **Raspberry Pi with a 64-bit Raspberry Pi OS** (arm64). The bridge is plain Python 3, so the same
files also work on 32-bit Raspberry Pi OS and on any other Linux computer with systemd. Only EZPlayer needs the 64-bit
system.

### What you need

| Setup | Raspberry Pi | Memory | Notes |
| --- | --- | --- | --- |
| Bridge only (the cube over DDP, no EZPlayer) | Pi 3B+, 4 or 5 | 1 GB or more | The bridge needs only Python 3, which comes with Raspberry Pi OS |
| Bridge and EZPlayer on the same Pi | Pi 4 or 5 | 2 GB at least, 4 GB or more recommended | EZPlayer needs a **64-bit** Raspberry Pi OS and refuses to start with less than 2 GB |

Props of the show, and cube sides sent through EZPlayer, need **EZPlayer 0.7 or newer**, wherever it runs. The bridge
can also run on a Pi while EZPlayer runs on another computer: type that computer's address on the control page
(for example `http://192.168.1.20:3000`).

Use a wired network connection for the Pi if you can. Give it a fixed IP address (set it in your router), so the
control page and EZPlayer are always at the same address. Python 3 comes with Raspberry Pi OS; if it is missing, run
`sudo apt install python3`.

| File | What it does |
| --- | --- |
| `start_bridge.sh` | Starts the bridge in the terminal (Ctrl-C stops it). Use it to try things out. |
| `install_service.sh` | Installs the bridge as the `showplay` service: it starts with the Pi and restarts by itself. Run with `sudo`. |
| `uninstall_service.sh` | Removes the `showplay` service. Settings are kept. |
| `install_ezplayer_service.sh` | Optional: runs EZPlayer with no screen (headless) as the `ezplayer` service. |

### 3.1 Copy the bridge to the Pi

Copy this `arm64` folder to the Pi, for example to `/home/pi/showplay`. Use a USB stick, `scp`, or download
it straight from GitHub on the Pi:

```bash
git clone https://github.com/ezpixelplayer/ezplayer-contrib.git
cd ezplayer-contrib/apps/showplay/arm64
```

The visitors' page is published on the web (step 2). It does not go on the Pi.

### 3.2 Make the scripts runnable (once)

```bash
chmod +x *.sh
```

This is needed after downloading from the GitHub website, which does not keep the "executable" mark on files.

### 3.3 Try the bridge

```bash
./start_bridge.sh
```

The bridge starts in the terminal and prints the control page address, for example
`http://192.168.1.30:8099`. Open it from a phone or computer on the home network and set it up from step 4. Press **Ctrl-C** to stop it.

### 3.4 Make it start by itself

```bash
sudo ./install_service.sh
```

The bridge now runs as a service called `showplay`. It starts whenever the Pi starts and restarts by itself if it
ever stops. Run the script from your normal user (for example `pi`), with `sudo`: the service then runs as that user,
never as root.

| To… | Run |
| --- | --- |
| See what the bridge is doing | `journalctl -u showplay -f` |
| Restart it (for example after updating `showplay_bridge.py`) | `sudo systemctl restart showplay` |
| Stop it for now | `sudo systemctl stop showplay` |
| Stop it starting by itself | `sudo ./uninstall_service.sh` |

Settings are kept in `showplay_config.json` next to `showplay_bridge.py`. Uninstalling the service keeps them.

## 4. Set up the sides of the cube

Open the control page: **http://localhost:8099** on the Pi, or **http://PI-IP:8099** from a phone on the home
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

## EZPlayer on the same Pi (optional)

Install EZPlayer for Linux on a Raspberry Pi as its own instructions say ([releases](https://ezrgb.com/ezplayer)), and
copy your xLights show folder to the Pi. A Pi with no screen runs EZPlayer **headless**: the full player with no
windows, which still plays the show and serves its web interface on port 3000.

To make EZPlayer start by itself with no screen:

```bash
sudo ./install_ezplayer_service.sh /path/to/EZPlayer /path/to/show-folder
```

The script checks that EZPlayer is there and that the folder is an xLights show folder (`xlights_rgbeffects.xml` and
`xlights_networks.xml`). It then makes a service called `ezplayer` that runs:

```bash
EZPlayer --ozone-platform=headless headless --show-folder=<show folder> --web-port=3000 --local-audio
```

- `--ozone-platform=headless` lets it run on a Pi with no screen.
- `--local-audio` plays the music on the Pi's own audio output (for example an FM transmitter or speakers plugged
  into the Pi). Leave it out if the audio goes elsewhere.
- EZPlayer's web interface is then at `http://<pi address>:3000`, and in the bridge's control page the EZPlayer
  address stays `http://127.0.0.1:3000`.

| To… | Run |
| --- | --- |
| See what EZPlayer is doing | `journalctl -u ezplayer -f` |
| Restart it | `sudo systemctl restart ezplayer` |
| Remove the service | `sudo systemctl disable --now ezplayer && sudo rm /etc/systemd/system/ezplayer.service && sudo systemctl daemon-reload` |

## Keep it smooth on a Pi

The bridge draws every picture itself, in Python. On a Pi, and especially with EZPlayer on the same Pi, set **Frames
per second sent to the lights** on the control page (under "How requests show"):

| Setting | When to use it |
| --- | --- |
| 20 | A PC, or a Pi 5 running the bridge only |
| 15 | A Pi 4 running the bridge only, or a Pi 5 with EZPlayer too |
| 10 | A Pi 4 running EZPlayer too, or large props |

Fewer frames per second means less work for the Pi. The animations stay the same speed, just a little less smooth.

If the show stutters, check the Pi's load with `top` while a request is showing. EZPlayer must always have enough
room to play the show smoothly, so lower the frames per second before anything else.

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

- **Nothing shows on a side:** check the board's IP address, that the Pi and the board are on the same network, and
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
- **"Permission denied" when running a script:** run `chmod +x *.sh` in this folder (step 3.2).
- **"Run it with sudo from your normal user":** run the install scripts as `sudo ./install_service.sh` while logged in
  as your normal user (for example `pi`), not from a root shell.
- **The bridge service does not start:** look at its log with `journalctl -u showplay -n 50`. Check that
  `showplay_bridge.py` is still in the folder where you ran `install_service.sh`. If you moved the folder, run
  `sudo ./install_service.sh` again from the new place.
- **After updating `showplay_bridge.py`:** run `sudo systemctl restart showplay`.
- **EZPlayer does not start on the Pi:** it needs a 64-bit Raspberry Pi OS and at least 2 GB of RAM. Look at its log
  with `journalctl -u ezplayer -n 50`.
- **The show stutters with EZPlayer on the same Pi:** lower **Frames per second sent to the lights** to 10 (see "Keep
  it smooth on a Pi").
