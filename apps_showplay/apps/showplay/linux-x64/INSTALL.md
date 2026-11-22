# ShowPlay — Installation guide for Linux x64 (v12)

Visitors scan a QR code on the wall, and from their phone they send a message, a picture, an effect or a drawing
to a cube of LED matrices, play **Four in a Row** on it, or light up **props of the show** (the wings, the bats,
the spinners…) with effects and colours.

The cube is **independent**: it needs no xLights and no show player. The bridge runs on a Linux computer at home, draws each
request and sends the pixels **straight to the cube's controller over DDP**. That controller can be WLED,
ESPixelStick or any other DDP board. You set up the sides of the cube on the bridge's own control page.

```
phone ──► visitors' page ──► ntfy.sh ──► showplay_bridge.py ──DDP──► controller of the cube
```

Your home network is never opened to the internet: the bridge, at home, fetches the requests from ntfy.sh.

| Where | What it is |
|---|---|
| `linux-x64/` (this folder) | The bridge (`showplay_bridge.py`) and the Linux scripts |
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

## 3. Install the bridge on the Linux computer

This folder is for a **Linux PC with an Intel or AMD 64-bit processor** (x64), for example Ubuntu, Debian, Linux Mint
or Fedora, with systemd (most of them). For a Raspberry Pi, use the `arm64` folder instead. The computer must be on the
same network as the cube's controller, and on while the show runs.

### What you need

| Part | Needed for |
| --- | --- |
| Python 3 (3.8 or newer) | The bridge. It is already installed on almost every Linux. Check with `python3 --version`, or install it with `sudo apt install python3` |
| systemd | Starting the bridge (and EZPlayer) by itself. Ubuntu, Debian, Mint and Fedora all use it |
| EZPlayer 0.7 or newer | Props, and cube sides sent through EZPlayer (optional) |

Use a wired network connection if you can, and give the computer a fixed IP address (set it in your router), so the
control page and EZPlayer are always at the same address.

| File | What it does |
| --- | --- |
| `start_bridge.sh` | Starts the bridge in the terminal (Ctrl-C stops it). Use it to try things out. |
| `install_service.sh` | Installs the bridge as the `showplay` service: it starts with the computer and restarts by itself. Run with `sudo`. |
| `uninstall_service.sh` | Removes the `showplay` service. Settings are kept. |
| `install_ezplayer_service.sh` | Optional: runs EZPlayer with no screen (headless) as the `ezplayer` service. |

### 3.1 Copy the bridge to the computer

Copy this `linux-x64` folder where it can stay, for example to `~/showplay`, or download it with git:

```bash
git clone https://github.com/ezpixelplayer/ezplayer-contrib.git
cd ezplayer-contrib/apps/showplay/linux-x64
```

The visitors' page is published on the web (step 2). It does not go on this computer.

### 3.2 Make the scripts runnable (once)

```bash
chmod +x *.sh
```

This is needed after downloading from the GitHub website, which does not keep the "executable" mark on files.

### 3.3 Try the bridge

```bash
./start_bridge.sh
```

The bridge starts in the terminal and prints the control page address, for example `http://192.168.1.30:8099`. Open
it from a phone or computer on the home network and set it up from step 4. Press **Ctrl-C** to stop it.

If the control page opens on this computer but not from a phone, the firewall is blocking it. On Ubuntu with `ufw`:
`sudo ufw allow 8099/tcp`.

### 3.4 Make it start by itself

```bash
sudo ./install_service.sh
```

The bridge now runs as a service called `showplay`. It starts whenever the computer starts and restarts by itself if
it ever stops. Run the script from your normal user, with `sudo`: the service then runs as that user, never as root.

| To… | Run |
| --- | --- |
| See what the bridge is doing | `journalctl -u showplay -f` |
| Restart it (for example after updating `showplay_bridge.py`) | `sudo systemctl restart showplay` |
| Stop it for now | `sudo systemctl stop showplay` |
| Stop it starting by itself | `sudo ./uninstall_service.sh` |

Settings are kept in `showplay_config.json` next to `showplay_bridge.py`. Uninstalling the service keeps them.

## 4. Set up the sides of the cube

Open the control page: **http://localhost:8099** on this computer, or **http://COMPUTER-IP:8099** from a phone on the home
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
default. Lower it to 15 or 10 if the computer is slow or busy with other programs.

## EZPlayer on the same computer (optional)

EZPlayer has a Linux x64 version as an **AppImage**, a `.deb` package or a `.tar.gz` ([releases](https://ezrgb.com/ezplayer)).

- **With a screen:** run EZPlayer as a normal desktop app, with your show folder open. Nothing else is needed.
- **AppImage on Ubuntu or Debian:** it needs FUSE 2. Install it with `sudo apt install libfuse2t64` (Ubuntu 24.04 and
  newer) or `sudo apt install libfuse2` (older versions), and make the file runnable with `chmod +x`.
- **With no screen, or to start it by itself:**

```bash
sudo ./install_ezplayer_service.sh /path/to/EZPlayer /path/to/show-folder
```

The path is the AppImage file itself, or the `ezplayer` program installed by the `.deb` (find it with
`which ezplayer`, or look in `/opt`). The script checks that EZPlayer is there and that the folder is an xLights show
folder, and warns when an AppImage may need FUSE 2. It then makes a service called `ezplayer` that runs:

```bash
EZPlayer --ozone-platform=headless headless --show-folder=<show folder> --web-port=3000 --local-audio
```

- `--ozone-platform=headless` lets it run with no screen.
- `--local-audio` plays the music on this computer's own audio output. Leave it out if the audio goes elsewhere.
- EZPlayer's web interface is then at `http://<computer address>:3000`, and in the bridge's control page the
  EZPlayer address stays `http://127.0.0.1:3000`.

| To… | Run |
| --- | --- |
| See what EZPlayer is doing | `journalctl -u ezplayer -f` |
| Restart it | `sudo systemctl restart ezplayer` |
| Remove the service | `sudo systemctl disable --now ezplayer && sudo rm /etc/systemd/system/ezplayer.service && sudo systemctl daemon-reload` |

Don't run EZPlayer both as a desktop app and as the service at the same time: only one EZPlayer can open a show folder.

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

## Mixer, Keys and MIDI controllers

New in v12: pads, faders and keys for **whoever runs the show**. The full guide is
[../docs/mixer.md](../docs/mixer.md).

- **Open the Mixer:** http://localhost:8099/mixer on this computer, http://\<this-computer's-ip\>:8099/mixer
  from a phone or tablet on the same Wi-Fi, or the **🎛️ Mixer & 🎹 Keys** button at the top of the control page.
- **Mixer tab:**
  - pick sides and props;
  - start effects with the pads, change palettes with the colour pads;
  - Master, Speed, Colour and White faders;
  - hold Flash, Strobe or Blackout;
  - save up to 8 scenes.
- **Keys tab:** every model of your props (and every side) is a key. Press higher to play harder, slide while holding
  to change it, let go to fade. Each key has its own effect and colour.
- **Visitors:** while the Mixer drives a side or prop, visitors' requests for it wait. "Release all" gives everything
  back, and so does the Mixer by itself after 15 minutes untouched (settable).
- **A real MIDI controller or keyboard** plays the same controls:
  - notes play the keys, with velocity and aftertouch;
  - **🎓 Learn** maps any pad, knob or fader of the device onto any control of the page;
  - the MIDI tab has a ready preset for the **Alesis VI25**.
- **MIDI on Linux:** the bridge reads MIDI devices plugged into the computer by itself (`/dev/snd/midi*`),
  with nothing to install. Plug the device in, and the MIDI tab lists it within 5 seconds. The user that runs the
  bridge must be in the **audio** group: check with `groups`, and if `audio` is missing, run `sudo usermod -aG audio
  $USER`, then log out and in (or `sudo systemctl restart showplay`). A program that holds the device exclusively (some
  DAWs or ALSA/JACK setups) can stop the bridge from reading it: close it, or use the page in Chrome at
  http://localhost:8099/mixer with **Use the MIDI devices of this browser**, after unticking "The bridge reads the
  MIDI devices…" and restarting the bridge.

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

- **Nothing shows on a side:** check the board's IP address, that the computer and the board are on the same network, and
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
  as your normal user, not from a root shell.
- **The control page opens on this computer but not on a phone:** open port 8099 in the firewall (on Ubuntu:
  `sudo ufw allow 8099/tcp`).
- **The bridge service does not start:** look at its log with `journalctl -u showplay -n 50`. Check that
  `showplay_bridge.py` is still in the folder where you ran `install_service.sh`. If you moved the folder, run
  `sudo ./install_service.sh` again from the new place.
- **After updating `showplay_bridge.py`:** run `sudo systemctl restart showplay`.
- **The EZPlayer AppImage does not start:** install FUSE 2 (see "EZPlayer on the same computer"), and look at its log
  with `journalctl -u ezplayer -n 50`.
- **"The show folder is locked":** EZPlayer is already running (as a desktop app or as the service). Close one of them.
- **The MIDI tab shows no device:** `ls /dev/snd/midi*` must list it, and `groups` must include `audio` (see "Mixer, Keys and MIDI controllers").
- **The Mixer page does not open from a phone:** it uses the same port as the control page (8099), so the same network and firewall rules apply.
