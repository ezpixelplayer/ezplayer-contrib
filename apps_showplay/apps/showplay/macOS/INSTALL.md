# ShowPlay — Installation guide for macOS (v24)

Visitors scan a QR code on the wall, and from their phone they send a message, a picture, an effect or a drawing
to a cube of LED matrices, play **games** on it (Four in a Row, Tic-tac-toe, Simon, Count the colours, Snake, Space Invaders, Pong, Race to the Star), take turns to **play the lights** of the props, **sing** into the phone and make a singing prop sing it, or light up **props of the show** (the wings, the bats,
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

## Games

Visitors open the **🎮 Games** tab on the visitors' page and pick a game. The tab shows only the games switched on
under **Games** on the control page (all eight by default). The crew's faster **Pong** and **Space Invaders** are played by the
people running the show, from the Mixer page (see below).

| Game | Players | In short |
| --- | --- | --- |
| 🔴 Four in a Row | 1 against the computer, or 2 | Drop discs, four in a row wins |
| ❌ Tic-tac-toe | 1 against the computer, or 2 | Three in a row wins; the computer never loses on Hard |
| 🟢 Simon | 1 | Repeat the colours the lights show, one more each round |
| 🔢 Count the colours | 1 to 8 at once | Count how many times a colour flashes; 5 rounds |
| 🐍 Snake | 1 | Steer a slow snake with arrows; eat to grow |
| 👾 Space Invaders | 1 | Slide the ship; it fires by itself. Three lives, waves, a mystery ship |
| 🏓 Pong | 1 against the computer | Slide the paddle; slower ball, longer paddles; first to 5 |
| 🌟 Race to the Star | 1 to 8 at once | Tap, sing, shake or run to climb a track of lights; the first to the top lights the star |

**🔴 Four in a Row** and **❌ Tic-tac-toe** (noughts and crosses):

- **Play against the computer:** the visitor plays first. The computer can be set to **Easy**, **Normal** or **Hard**
  on the control page (Games). Easy is good for small children: it makes mistakes on purpose. In Tic-tac-toe, Hard
  never loses.
- **Play against a friend:** the first visitor starts the game. A friend opens the same page on their own phone (from
  the same QR code), goes to **🎮 Games** and taps **Join the game**.
- **Time limits:** each player has **45 seconds** per move. If time runs out, the game ends (against a friend, the
  other player wins). A friend has 90 seconds to join.
- **The end:** the winning line blinks and the board turns rainbow for a few seconds.

**🟢 Simon** (memory of colours), for one player:

- **How it plays:** the side shows four colours (green, red, yellow, blue) and lights them up one by one in a
  sequence. The visitor repeats it on four big buttons on their phone, each with its own note.
- **Each round:** a right answer flashes the side green and adds a colour, a little faster each round. The time to
  answer is 6 s plus 1.2 s per colour.
- **The end:** a wrong colour ends the game (the side blinks the colour that was right), and 30 rounds wins. The
  phone shows the score and the best score since the bridge started.

**🔢 Count the colours**, a party game for up to 8 phones at once:

1. **Players join.** One visitor starts a new game. Others scan the same QR code, open **🎮 Games** and tap **Join**
   within 25 seconds. Each player gets an animal (🦊 🐼 🐸 🐧 🦁 🐯 🐨 🐵). Dots on the side show how many have joined,
   and the first player can **Start now**.
2. **The colour to count.** The side shows a frame in the colour to count, and the phones say which one ("Count the red
   flashes!").
3. **The flashes.** The side flashes red, green, blue and yellow quickly, never the same colour twice in a row.
4. **The answers.** Everyone taps how many times the colour flashed (0–15) within 12 seconds.
5. **The result.** The side shows the right number as dots, and the phones show who got it right (✅ / ❌).
6. **The winner.** After 5 rounds, each one faster and longer, the most right answers wins.

This game is fair over the relay: the answer is a number, so it does not matter whose phone is faster.

**🐍 Snake**, for one player:

- **The board:** 8 × 8 squares on the side.
- **Steering:** arrow buttons on the phone, a swipe on them, or the arrow keys on a computer. The snake eats the red
  squares to grow and must not hit the walls or itself.
- **Speed:** the relay takes up to a second, so the snake moves slowly on purpose. It starts at about one square a
  second and gets a little faster as it grows. Up to 3 turns are remembered in advance, so players can plan ahead.
- **The end:** a game lasts at most 5 minutes. The phone shows the score and the best score since the bridge started.
- **Messages:** each turn is one message from the phone. A long game is still well inside ntfy.sh's free limits for
  one phone, but very long sessions on the same phone can reach them.

**👾 Space Invaders**, for one player:

- **Playing:** rows of invaders march across the side and come down. Shoot them before they land and dodge their
  bombs. There are shields, a mystery ship at the top for extra points, three lives, an extra life for each wave
  cleared, and waves that get faster.
- **Made for the relay's delay:**
  - the visitor slides a finger on a strip and the phone sends **where the ship should go**: one message per slide,
    at most two a second; the ship glides there by itself;
  - the ship **fires by itself**;
  - invaders, bombs and the game's speed are slower than in the crew's version;
  - at most one bomb falls at a time in the first waves.
- **The end:** the invaders land, or the lives run out. A game lasts at most 7 minutes. The phone shows the score and
  the best score since the bridge started.

**🌟 Race to the Star** (new in v18), for 1 to 8 phones at once (two players can share one phone):

- **Playing:** players climb a track of lights (a mega tree, a matrix, any model or group, or a side of the cube) by
  tapping, singing, shaking the phone or running on the spot. Stopping makes them slide down. The first to the top
  lights the star in their colour.
- **Fair for everyone:** each player picks their colour, their way to play and their level (child, adult, sporty).
  The phone measures the effort itself and sends it about once a second (no sound is sent), so the relay's delay is
  the same for everyone.
- **Set it up** on its own page, **http://\<this-computer's-ip\>:8099/race**:
  - track and star;
  - split of the track;
  - ways to play;
  - players and colours;
  - levels;
  - difficulty;
  - effects;
  - a test race with pretend players;
  - saved profiles.
- **The full guide** is [../docs/race.md](../docs/race.md).

**🏓 Pong for visitors** (new in v16), one visitor against the computer:

- **Playing:** the visitor is red on the left and the computer is blue on the right. First to 5 points wins.
- **Made for the relay's delay:**
  - the visitor slides a finger up and down on a strip and the phone sends where the paddle should go (at most two
    messages a second); the paddle glides there;
  - the ball is slower and the paddles longer than in the crew's Pong;
  - the computer reacts late and aims a little off, so children can win.
- **The end:** a game lasts at most 5 minutes, and stops after 1 minute with nobody moving the paddle.

**🏓 Pong for the crew** (Mixer page, no delay):

- **Where:** the Mixer page, on the home network (**🏓 Pong** tab at http://\<bridge-ip\>:8099/mixer). There is no
  relay in between, so there is no delay.
- **Players:** one player against the computer, or two players (two phones, or one each side of a computer).
- **Paddles:** a finger dragging in a strip, W / S and ↑ / ↓ on a keyboard, or a **MIDI fader or knob** (learn
  `game:p1` / `game:p2` with 🎓 Learn). The computer plays any side nobody moves. First to 5 points wins.
- **Visitors:** while the crew's Pong is on, the visitors' 🎮 Games tab shows that the crew is playing, with the
  score. The crew cannot start Pong while a visitor is playing it.

**👾 Space Invaders for the crew** (Mixer page, **👾 Invaders** tab, no delay):

- **Speed:** the full-speed game, with more bombs and faster invaders.
- **Moving:** the slider, ◀ / ▶, the arrow keys or A / D. A MIDI knob or fader can be learned as `game:ship`, and
  pads as `game:left` / `game:right`.
- **Firing:** 🔥, Space, or a MIDI pad learned as `game:fire`.

**For all the games:**

- **Where it shows:** the game shows on the side the visitor picked, or on all sides. While a game is on, that side
  shows the game, and other requests for it wait until the game ends.
- **One game at a time:** other visitors see that a game is being played and can watch it on the lights and on their
  phone. A different game can start as soon as the last one ends.
- **Fair play:** each phone keeps its own player code, so another phone cannot play for someone else.
- **Switching games off:** untick a game on the control page to hide it, or untick **Let visitors play games on the
  cube** to switch them all off.

The bridge posts a game on ntfy.sh only when something changes for the phones (a move, a new round, a score), never
every step, and real-time games (Snake, Pong, Space Invaders, the race) every 5 seconds at most.

**ntfy.sh's limits (v19).** ntfy.sh's free service lets each internet address send about 60 messages in a row, then
about one every 5 to 10 seconds; when that is used up it answers "429 Too Many Requests" for a while. At home, the
bridge **and every phone on the same Wi-Fi** share one internet address, so testing with your own phones on your Wi-Fi
uses up the same allowance. Since v19:
- the bridge sends everything through one "poster" that keeps within its own budget, sends the game board first, never
  sends the same thing twice, and after a 429 really waits (30 s, 60 s, 120 s…) instead of trying again at once;
- each phone keeps to its own budget too: steady messages (joystick, taps, race effort) go less often as it runs
  low, so moves still go through. On a 429 a move or request says "Too many messages right now. Wait a minute and try
  again."; the Pong and Space Invaders slider just follows less often and says "Busy connection right now" (v22);
- the control page shows **"ntfy.sh: too many messages… posting again in N s"** while the bridge is waiting.
- **The "ntfy.sh today" card** on the control page (v23) shows how many messages the bridge posted and received today,
  how much of one internet address's daily limit that is, the last "too many" answer, and whether the bridge is
  waiting. When ntfy.sh says the **daily** limit is used up (it asks to wait for hours), the bridge still tries again
  every 10 minutes and says when it resets; another connection (a phone hotspot, WARP) then works at once.
- **Only one bridge at a time** (v23): a second bridge started on the same computer says "Another ShowPlay bridge is
  already running" and stops.

Visitors' phones on **mobile data** have their own internet address and allowance. To test at home, use a phone on
mobile data, or play slowly.

## Play the lights (visitors)

A **🎹 Play** tab on the visitors' page lets visitors take turns to play the lights of the show like a keyboard. It is
a safe, public version of the Keys of the Mixer page.

- **One visitor at a time:** each turn lasts 30 seconds by default (20, 30 or 45 seconds, or 1 minute, on the control
  page). The others **join a queue** and see their place in it. A turn passes on early when the visitor taps "I'm
  done" or stops tapping for 10 seconds.
- **On the phone:** a pad for each model of the props ticked under **Play the lights (visitors)** on the control page,
  up to 32 pads. For example, a prop made from the group of all the snowflakes gives one pad per snowflake. The
  visitor picks one of 9 colours or 🌈 surprise, and each tap lights that model for a moment, then it fades out.
- **No strobe, no blackout:** visitors cannot change the rest of the show or block it.
- **Messages:** the phone gathers its taps for half a second into one message, so a whole turn stays well inside
  ntfy.sh's free limits.
- **How it works:**
  - it uses the Keys engine of the bridge, so the crew can play the same models from the Mixer page at the same time;
  - the crew's keys keep their own colours;
  - it needs EZPlayer running and at least one prop.
- **Switching it off:** untick **Let visitors take turns to play the lights** on the control page, and the tab
  disappears from the phones.

## Sing (visitors)

New in v17. A **🎤 Sing** tab on the visitors' page:

1. A visitor picks who sings.
2. They record up to 10 seconds on their phone and send it.
3. It plays on this computer's speaker while the singer "sings" it:
   - a **singing model** of the show (a model with a face in xLights: pumpkins, trees, skulls…) moves its mouth;
   - a **prop** glows with the voice;
   - a **side of the cube** shows a face.

The full guide is [../docs/sing.md](../docs/sing.md).

- **Set it up** in the card **Sing (visitors)** on the control page:
  1. press **Find the singing models in EZPlayer**;
  2. untick the singers you do not want, and rename them if you like;
  3. set the volume and press **🔊 Test sound**;
  4. press **Save singing settings**.
- **The speaker:** recordings play on the Mac's current sound output with `afplay`, which is part of macOS: nothing
  to install.
- **No approval by default:** recordings play straight away. Tick **Approve each recording before it plays** to listen
  to each one first.
- **Nothing is kept:** the bridge deletes each recording as soon as it has been played. There is no word filter for
  sound.
- **Microphone:** the visitors' page must be on HTTPS (GitHub Pages is) for phones to allow the microphone.

## Advent calendar and Decorate the tree (visitors)

Two Christmas extras, set up on **http://localhost:8099/xmas** (or **📅 Advent & 🎄 Tree** at the top of the control
page). The full guide is `../docs/xmas.md`.

- **📅 Advent calendar:** 24 doors on the visitors' page, one more open each day from 1 December. A door holds an
  effect or a message for the cube, or a game that opens on the phone. Optionally, a game appears only from the day
  of its door. **Test: pretend today is door N** lets you try it before December (set it back to 0 for the show).
- **🎄 Decorate the tree:** pick the tree's models (any models or groups); visitors tap a free spot, pick a colour and
  hang a bauble that lights up on the real tree. The decorated tree shows for a while after each new bauble (or all
  the time); when it is full there is a party and it starts again.

## Fun extras (visitors)

Eight extras on the visitors' **🎁 Fun** tab, set up on **http://localhost:8099/fun** (or **🎁 Fun** at the top of the
control page). The full guide is `../docs/fun.md`.

| Extra | In short |
| --- | --- |
| 📸 Photo frame | A frame on the cube, 3-2-1, a flash, and the frame holds for the photo |
| 🎰 Wheel of fortune | A wheel spins on the cube and stops on an effect, a message, a colour or "spin again" |
| 🐾 Pick an animal | A pixel animal walks across the sides and hops |
| 🖍️ Paint by numbers | Visitors colour a ready-made drawing that fills in on the cube |
| 🔔 Ring the bell | A bell on the speaker and a gold flash on the cube or a prop |
| 🌨️ Snow on request | Switches a snow or bubble machine through a web address (Shelly, Tasmota, ESP32…) |
| 🔦 Treasure hunt | Clues on the phones; the answer is a word, a number or a prop |
| 🎶 Guess the song | A round for up to 8 phones with WAV songs from the `songs` folder |

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

- **Open the Mixer:** http://localhost:8099/mixer on this Mac, http://\<this-mac's-ip\>:8099/mixer
  from a phone or tablet on the same Wi-Fi, or the **🎛️ Mixer & 🎹 Keys** button at the top of the control page.
- **Mixer tab:**
  - pick sides and props;
  - start effects with the pads, change palettes with the colour pads;
  - Master, Speed, Colour and White faders;
  - hold Flash, Strobe or Blackout;
  - save up to 8 scenes.
- **Pong and 👾 Invaders tabs:** play Pong or Space Invaders on the lights, with a finger, the keyboard or MIDI controls.
- **Keys tab:** every model of your props (and every side) is a key. Press higher to play harder, slide while holding
  to change it, let go to fade. Each key has its own effect and colour.
- **Visitors:** while the Mixer drives a side or prop, visitors' requests for it wait. "Release all" gives everything
  back, and so does the Mixer by itself after 15 minutes untouched (settable).
- **A real MIDI controller or keyboard** plays the same controls:
  - notes play the keys, with velocity and aftertouch;
  - **🎓 Learn** maps any pad, knob or fader of the device onto any control of the page;
  - the MIDI tab has a ready preset for the **Alesis VI25**.
- **MIDI on the Mac:** the bridge cannot read MIDI devices by itself on macOS, so the Mixer page passes them on.
  Plug the device into the Mac, open **http://localhost:8099/mixer** in **Chrome or Edge** (Safari has no Web MIDI),
  go to the MIDI tab and press **Use the MIDI devices of this browser**, then allow MIDI when the browser asks. Keep that
  tab open while you play: other phones can still use the Mixer at the same time. Browsers allow MIDI only on
  `localhost`, so this must be done on the Mac itself, not from another computer.

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
- **MIDI does nothing on the Mac:** use Chrome or Edge at http://localhost:8099/mixer, press "Use the MIDI devices of this browser" and keep that tab open.
- **The Mixer page does not open from a phone:** it uses the same port as the control page (8099), so the same network and firewall rules apply.
- **No sound from 🎤 Sing:** press **🔊 Test sound** in the Sing card and read the log (see "Sing (visitors)").
- **Race to the Star does not start:** set up its track on the race page (http://localhost:8099/race), or use the cube track (see "Games"). Since v19 the phone says why a game could not start.
- **The lights show the moves at once but the phones update late, or "HTTP Error 429" in the log:** ntfy.sh is limiting your internet address (see "Games" → ntfy.sh's limits). Update to v19, wait a few minutes, and test with a phone on mobile data.
- **The phones get every board about 30 s late, with no 429 in the log:** IPv6 does not work on your network and older bridges waited for it on every post. Update to v20 or later, which uses IPv4 first (and since v21 waits at most 3 s for each address).
- **Only one bridge at a time:** `autostart.bat` starts a hidden bridge, `start_bridge.bat` starts another in a window. Use one or the other. Since v23 a second bridge stops by itself with "Another ShowPlay bridge is already running".
- **No 📅 Advent or 🎄 Tree tab:** switch them on at http://localhost:8099/xmas and save (see `../docs/xmas.md`).
- **No 🎁 Fun tab, or an extra is missing:** switch it on at http://localhost:8099/fun; the page says what is missing (see `../docs/fun.md`).
