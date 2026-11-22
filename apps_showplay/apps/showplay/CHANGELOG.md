# ShowPlay — changelog

Every update to ShowPlay (called Light Cube up to v9) is listed here, newest first, with what was added or changed and why. Each version also
updates the installation guide (`INSTALL.md`) and the contents guide (`CONTENTS.md`) of each platform folder where they changed.

| Version | Date | In one line |
| --- | --- | --- |
| v23 | 2026-11-22 | 📅 Advent calendar and 🎄 Decorate the tree for visitors (own settings page /xmas); ntfy.sh today card, at most 10 minutes of waiting, one bridge at a time |
| v22 | 2026-11-22 | Space Invaders and Pong sliders send less (only when the finger moves, less often as the phone's message budget runs low) and no longer show "Too many messages" |
| v21 | 2026-11-22 | The bridge waits at most 3 s to connect to each address, so any network with a dead IPv4 or IPv6 path costs seconds, not tens of seconds |
| v20 | 2026-11-22 | Fix: the bridge connects to ntfy.sh over IPv4 first, so the phones no longer get each game board about 30 s late on networks where IPv6 does not work |
| v19 | 2026-11-22 | Phones update fast again: one poster keeps the bridge within ntfy.sh's limits (game board first, real waiting after a 429), phones keep their own budget and say why something failed; race climbers as rope, climber or automatic |
| v18 | 2026-11-22 | Race to the Star: up to 8 players climb a track of lights by tapping, singing, shaking or running (two can share a phone); the winner lights the star; its own settings page |
| v17 | 2026-11-22 | Sing: visitors record a song on their phone and it plays at the show while a singing prop moves its mouth (or a prop glows, or the cube shows a face) |
| v16 | 2026-11-22 | Pong for visitors: one visitor against the computer, with a slower ball and a paddle that glides to where they slide |
| v15 | 2026-11-22 | Space Invaders (a slower one for visitors, a fast one for the crew) and "Play the lights": visitors take turns to play the props like a keyboard |
| v14 | 2026-11-22 | Count the colours (up to 8 players), Snake, and Pong on the Mixer page (finger, keyboard or MIDI knob paddles) |
| v13 | 2026-11-22 | Two new games: Tic-tac-toe (against the computer or a friend) and Simon (repeat the colours on the lights) |
| v12 | 2026-11-22 | Mixer page (pads, faders, scenes), Keys (one key per model, with velocity and aftertouch) and real MIDI controllers, with an Alesis VI25 preset |
| v11 | 2026-11-21 | New macOS and Linux x64 folders: ShowPlay now covers the same four platforms as EZPlayer |
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

## v23 — Advent calendar, Decorate the tree and ntfy.sh control (2026-11-22)

Two Christmas extras for visitors, with their own settings page (**/xmas**, or **📅 Advent & 🎄 Tree** at the top of
the control page), and better control of ntfy.sh after the day its daily limit ran out. The full guide for the two
extras is [docs/xmas.md](docs/xmas.md).

**New: 📅 Advent calendar** (visitors' page, 📅 Advent tab)

| Part | What it does |
| --- | --- |
| Countdown | "🎄 N days to Christmas" (before the first day: when the calendar opens) |
| 24 doors | One more opens each day from 1 December (the first day and month can be changed); today's door glows; the next ones stay closed |
| ✨ Effect door | Plays that effect on the cube |
| 💬 Message door | Scrolls that message on the cube (up to 30 letters, word filter) |
| 🎮 Game door | Opens 🎮 Games with that game picked |
| Unlock games | Optional: a game with a door appears only from the day of its door |
| Test day | "Pretend today is door N", to try it before December |
| Default surprises | Effects, messages, Simon, Tic-tac-toe, Snake, Space Invaders, Race to the Star, and "MERRY CHRISTMAS!" on the 24th |

**New: 🎄 Decorate the tree** (visitors' page, 🎄 Tree tab)
- Pick the tree's models on /xmas: any models or groups. The bridge spreads the spots evenly over their pixels
  (8 to 60, 30 by default), leaving out the top and the very bottom.
- Visitors see a drawing of the tree, tap a free spot, pick one of 8 colours and press **Hang my bauble**.
- On the lights: a dim green tree (or off) with the baubles twinkling, the newest one sparkling; it shows for a while
  after each new bauble (30 s by default) or all the time, so the tree plays the show's sequence the rest of the time.
- Each phone waits between baubles (60 s by default). Someone faster, the wait, or the party: the phone says why.
- When full: a 15-second rainbow party, then it starts again empty (optional).
- The baubles stay after a restart. **Show it on the lights now** and **Take all the baubles off** on /xmas.
- The bridge posts the tree on `<code>-tree`, only when it changes.

**New: ntfy.sh control**

| What | Before | Now (v23) |
| --- | --- | --- |
| Today's counts | None | An "ntfy.sh today" card on the control page: messages posted by the bridge, received from phones, the share of one address's daily limit, the last "too many" answer |
| Daily limit used up | The bridge obeyed ntfy.sh and waited up to 20 hours, even after you changed network | It waits at most 10 minutes, then tries again, and says when the daily limit resets |
| Two bridges at once | Possible on Windows (both used the same port) | A second bridge says "Another ShowPlay bridge is already running" and stops |
| Status size | Could grow past ntfy.sh's 4096 bytes with many singers and props | The bridge leaves out the last singers, then props, to stay under it |

**Changed**
- Control page: **📅 Advent & 🎄 Tree** button; the "ntfy.sh today" card under the ON/OFF card.
- The bridge needs EZPlayer when a tree is set up (like props and the race).

**Updating from v22**
1. End every `python` / `pythonw` in Task Manager (search "py"), then start the v23 bridge **once** (`autostart.bat`
   or `start_bridge.bat`). The v23 folder on the Desktop already has your `showplay_config.json`.
2. Upload the new `visitors-page/index.html` to GitHub and reload the page on the phones.
3. Open http://localhost:8099/xmas to switch on the calendar and the tree.

**Tested**
- Calendar: the default doors; day 5 with "unlock" shows 5 doors and hides Tic-tac-toe, Snake, Space Invaders and
  the race; door 1 plays its effect and door 2 its message through the normal checks; future doors and game doors
  send nothing; the real date (22 November) gives "not open yet"; edited doors are cleaned (accents, word filter).
- Tree on a 32 × 25 mega tree: 30 spots, every spot has pixels; hanging, the wait, a taken spot and a bad colour are
  refused with their reason; the tree state is 0.9 KB; filling it starts the party, refuses baubles during it and
  empties the tree afterwards.
- The biggest status (24 doors, 30 long singer names, 12 props) is trimmed from 4.4 KB to 3.9 KB.
- ntfy.sh: a 429 asking for 71,528 s waits 599 s, shows the daily limit and the reset time, and clears when a post
  works; received messages are counted.
- A second bridge finds the first one and stops.
- In a browser: the 📅 Advent and 🎄 Tree tabs (doors, a door's effect, a game door opening Simon, hanging a
  bauble), the /xmas page (saving the calendar and the tree: "Saved: 30 spots on the tree") and the ntfy.sh card,
  with no script errors. The v18, v19 and v21 tests still pass.

---

## v22 — Gentler sliders in Space Invaders and Pong (2026-11-22)

**Why:** in Space Invaders on a phone on the home Wi-Fi, the page showed "Too many messages right now. Wait a minute
and try again." during the game. The slider sent the ship's position up to twice a second while the finger moved:
about 120 messages a minute, while ntfy.sh allows each internet address about 60 in a row and then about one every
5–10 seconds, shared with the bridge and every other phone on that Wi-Fi.

**Changed (visitors' page only)**
- The Space Invaders and Pong sliders send only when the finger has really moved (2 % of the strip or more).
- How often depends on the phone's message budget: every 0.6 s while it is full, every 1.2 s when it is half used,
  every 2.5 s when it is low, and every 3 s while ntfy.sh asks to wait.
- A 429 during these games no longer shows the red "Too many messages" line: the ship or paddle just follows less
  often, and the game line adds "Busy connection right now: it follows a bit later".
- Snake turns may use a little more of the budget than before (they are short games and each turn matters).
- Moves and requests (new game, join, quit, pictures, texts) still say "Too many messages…" on a 429.

**Good to know:** phones on mobile data each have their own allowance, so at the show this happens far less than
when testing at home with several phones on the Wi-Fi.

**Updating from v21**
1. Upload the new `visitors-page/index.html` to GitHub (the page in your repository), then reload it on the phones.
2. The bridge has not changed: it still says **v21**, and there is no need to restart it.

**Tested**
- The page's script parses; the sliders' send rate follows the budget as above.

---

## v21 — At most 3 s per address (2026-11-22)

**Why:** v20 tries IPv4 before IPv6, which fixes networks where IPv6 is broken. The opposite case (IPv4 there but
not answering, with IPv6 working) would still wait 10 s for each IPv4 address before trying IPv6.

**Changed**
- The bridge now waits at most **3 seconds** to connect to each address of a server, then tries the next one. Once
  connected, the usual timeout (10 s) still applies to the answer.
- Worst case with all three addresses of one kind dead: about 9 s instead of 30 s. Addresses that refuse straight
  away (no route, connection refused) are skipped at once, as before.
- EZPlayer (127.0.0.1) and the cube's controllers (DDP over UDP) are not affected.

**Updating from v20**
1. End every `python` / `pythonw` in Task Manager (search "py").
2. Run `autostart.bat` from the v21 folder **or** `start_bridge.bat`, not both. The v21 folder on the Desktop already
   has your `showplay_config.json`; otherwise copy it from the v20 folder first.
3. The visitors' page has not changed since v19.

**Tested**
- Two addresses that never answer followed by a working one: connected after 6 s (was 20 s), and the 10 s timeout
  is back for the answer. A refused connection still fails at once. The v19 poster and loop tests still pass.

---

## v20 — Game boards no longer 30 s late (2026-11-22)

**Why:** after v19, the bridge showed no 429 errors, nothing waiting in its queue and plenty of budget left, yet the
phones still got every game board about **30 seconds** after the move (the lights on EZPlayer showed it at once).
The ntfy.sh times showed the same delay on every post: about 31–34 s, and about 60 s when two posts were queued.

**Cause:** ntfy.sh has 3 IPv6 addresses and 3 IPv4 addresses. Python tries a server's addresses **one after
another**, waiting up to the whole timeout (10 s) for each. On a network where IPv6 is announced but does not really
work, every post waited 3 × 10 s on the IPv6 addresses before trying IPv4. Browsers and EZPlayer try both at once
("happy eyeballs"), so the phones and the lights were not affected. The bridge's own connection to the show channel
took about a minute to open for the same reason.

**Fixed**
- The bridge now tries IPv4 addresses first, then IPv6. Posts to ntfy.sh go out at once again.

**Also found**
- Two or three bridges were running at once: `autostart.bat` starts a hidden bridge (and makes it start with
  Windows), and `start_bridge.bat` starts another one in a window. They shared ntfy.sh's limit, overwrote each other's
  settings (the status switched between ON and OFF) and the control page talked to either of them. INSTALL.md now
  says to use one or the other, never both.

**Updating from v19**
1. End every `python` / `pythonw` in Task Manager (search "py").
2. Run `autostart.bat` from the v20 folder **or** `start_bridge.bat`, not both. Settings: copy
   `showplay_config.json` from the v19 folder next to the new `showplay_bridge.py` first, to keep the same show code.
3. The visitors' page has not changed since v19.

**Tested**
- With an address list that has IPv6 first, the bridge gets IPv4 first; the v19 poster and loop tests still pass.

---

## v19 — Faster phones, ntfy.sh limits and climber styles (2026-11-22)

**Why:** at the show, the lights showed every move at once but the phones' game board was late, and texts, pictures
and effects sometimes failed with "It could not be sent". The log showed `HTTP Error 429` (Too Many Requests) from
ntfy.sh. ntfy.sh's free service allows each internet address about 60 messages in a row, then about one every 5–10
seconds, and **the bridge and the phones on the same Wi-Fi share one address**. The bridge used to post the game,
status, Play and Sing channels separately, posted the status twice at start, and retried the Sing queue every 0.3 s
after a failure, which used the allowance up and kept it empty.

**New: one poster in the bridge**

| What | Before (v18) | Now (v19) |
| --- | --- | --- |
| Who posts | 4 separate loops (game, status, Play, Sing) | One poster for everything |
| Order | Whoever came first | Game board first, then status, then Play and Sing |
| Old messages | Each change was sent, even if a newer one followed | Only the latest of each channel is sent |
| Repeats | The status twice at start; unchanged queues again | Nothing is sent twice; the status only when it changes (and every half hour) |
| Play and Sing when off | Posted anyway | Not posted |
| Budget | None | 45 in a row, then one every 8 s, leaving room for the phones |
| After a 429 | Retried every 0.3–10 s (which kept the limit hit) | Waits Retry-After, or 30 s, 60 s, 120 s… and then sends the latest |
| Real-time games | About one board a second | Every 5 s, and at once when the game starts, ends, someone joins or a request is refused |
| Turn games against the computer | Your move, then the computer's, as two posts | One post with both moves |
| Control page | Only log lines | "ntfy.sh: too many messages… posting again in N s" while it waits |

**New: phones keep their own budget**
- Each phone counts its own messages (30 in a row, then one every 8 s).
- Steady messages (joystick in Pong and Space Invaders, Snake turns, Play taps, race effort) are skipped when the
  budget runs low, so moves and requests still go through.
- On a 429 the phone waits a minute and says **"Too many messages right now. Wait a minute and try again."** instead
  of "It could not be sent".
- **Why a game did not start:** when the bridge refuses a new game or a join, the phone that asked says why, for
  example "The race isn't set up yet. Ask the show to set up the race track." or "Another game is being played".
- The page checks the show status every 90 s (was 60 s).

**New: climber styles in Race to the Star** (race panel → effects → **Climbers look like**)
- **Rope:** the lane fills up to the height; the top pixel lights up gradually, so short tracks climb smoothly.
- **Climber:** a little figure (head, body, moving legs) on a dim rope.
- **Automatic** (default): climber on tracks 50 pixels tall or more, rope on smaller ones.

**Changed**
- Race: phones send the effort about every 2 s (was 1 s), and the bridge keeps each effort for 4 s (was 1.6 s), so a
  race costs each phone about half the messages; phones see the heights every 5 s (was 3 s).
- Docs: INSTALL.md (all four platforms) explains ntfy.sh's limits under Games and has two new troubleshooting lines;
  docs/race.md covers the climber styles, the new message numbers and the refusal messages; CONTENTS.md lists the poster.

**Updating from v18**
1. Replace `showplay_bridge.py` in your platform folder and restart the bridge. Settings are kept; the race gets
   `style: auto`.
2. Upload the new `visitors-page/index.html` to GitHub (the page in your repository), then reload it on the phones.
3. If the log still shows 429 right after updating, ntfy.sh is still counting the earlier messages: wait a few
   minutes. To test at home, use a phone on mobile data.

**Tested**
- The poster with a fake ntfy.sh: the game goes before the status and the Play queue; only the newest board is sent;
  nothing is sent twice; after a 429 with Retry-After it waits, sends nothing meanwhile and then sends the newest
  board; the budget limits the rate.
- The real loops together: at start one game and one status post (no Play post while Play is off); a new Four in a
  Row game posted in 0.1 s; a move against the computer posted once, with both moves, 1.7 s later; a refused race
  shows the reason to that phone only.
- Race styles: automatic picks rope at 25 pixels and climber at 60; the rope's head pixel lights up partly; the
  climber lights its figure at the right height on a dim rope.
- The v15, v17 and v18 tests still pass (games, Space Invaders, Sing, race).

---

## v18 — Race to the Star (2026-11-22)

A new game for 1 to 8 phones at once: **🌟 Race to the Star**. Players climb a track of lights by tapping, singing,
shaking the phone or running on the spot, and the first to the top lights the star in their colour. It has its own
settings page, `/race`. The full guide is [docs/race.md](docs/race.md).

**New: the race** (🎮 Games on the visitors' page):

| Variant | How to play | What the phone measures | Who it suits | Notes |
| --- | --- | --- | --- | --- |
| 1 · 👆 Tap | Tap a big button as fast as you can | Taps per second | Everyone; works on any phone | The simplest. The climber slides down if you stop tapping |
| 2 · 🎤 Voice | Sing or hold an "aaaa" loudly and without stopping | Microphone loudness, measured **on the phone** | Children and anyone who likes singing | The sound is **not sent**, only the number. A steady voice counts more than shouting |
| 3 · 🤳 Shake (default) | Shake the phone hard and fast | Accelerometer: strength and rhythm of the shaking | Everyone, even sitting down | Capped strength (shaking violently gives no extra speed). A notice reminds players to hold the phone tight |
| 3b · 🏃 Run on the spot | Run or march on the spot with the phone in your hand | Accelerometer: steps per second | The sportier players | Needs some free space and standing up |

- **Two players on one phone** with 👆 Tap: the screen splits into two buttons, each with its own colour and level.
- **Choices:** each player picks a colour (taken colours are locked), their way to play and a level (🧒 child, 🧑 adult,
  🏃 sporty).
- **Waiting room:** the first player can start sooner. Each lane blinks in its colour when its player joins, and
  **📍 Where am I?** blinks it again.
- **Countdown:** 3-2-1 on the lights, and a vibration.
- **During the race:** the phone shows big tap buttons or a hint, an effort meter, everybody's height and your place.
- **The end:** the star flashes in the winner's colour, with a rainbow party.
- **Effort:** the phone measures it and sends it about once a second (every 1.5 s after 30 s), so a race costs each
  phone about 35 messages. The bridge climbs 20 times a second with the latest effort and slides a stopped climber
  down.
- **Permissions:** the microphone and (on iPhones) motion are asked while tapping **New race** or **Join**, because
  phones allow them only during a tap.

**New: the race panel** (`http://<bridge-ip>:8099/race`, with links on the control page):

1. **Track:**
   - one shared track (any models or groups), split into stripes, side by side (with the front of the tree) or rings;
   - a track per player (track + star pairs, with **Pair automatically**);
   - the cube;
   - star models, several, or none (the top of the track becomes the star);
   - climb direction: up, down, right, left, along the string.
2. **Ways to play:** each one on or off, mixed or the same for everyone, two players on one phone.
3. **Players:** at least and at most (1–8), the colours, the waiting room's length, early start.
4. **Levels:** child, adult and sporty multipliers, and help for whoever is behind (up to 60 % faster).
5. **Difficulty:** Easy, Normal, Hard or Custom (race length, slide speed, wait before sliding, longest race).
6. **Star and effects:** leader's colour on the star, countdown, rainbow party, party length, brightness, background.
7. **Test and profiles:** test race with 2–8 pretend players, test the finish in a colour, stop, and save, load or
   delete profiles.

**Changed:**

- **Control page:** **Games** has an eighth tick box (🌟 Race to the Star) and links to the race page. Settings saved
  by v13 to v17 with every game on get it on too.
- **Bridge:**
  - the reading of models' pixel positions is now shared by props, singers and the race (any list of models), and
    cached until the show changes;
  - the bridge now watches EZPlayer whenever Sing is on or the race uses EZPlayer models, not only when there are
    props, so singing models are found even without props;
  - the status for the phones has the race's ways, colours and limits.
- **Visitors' page:** `gifmaker.js?v=18` makes phones load the new page.
- **Settings:** new settings `race` and `race_profiles`.
- **Documents:**
  - new guide `docs/race.md`;
  - every `INSTALL.md` has the race in "Games";
  - every `CONTENTS.md` and the READMEs describe it.

**Updating:**

- **The bridge:** replace `showplay_bridge.py` and restart it.
- **The visitors' page:** publish `visitors-page/index.html` again. The QR codes stay the same.
- **Then:** set up the track on the race page.

**Tested** (a v18 bridge with a stand-in EZPlayer serving the 2026_Base layout plus a 32-string mega tree and a star,
a stand-in DDP board and a stand-in ntfy.sh; the pages in Chromium with a simulated microphone and simulated motion):

- **Joining:**
  - four players joined, two of them on one shared phone;
  - a colour already taken moved to the next free one;
  - joining twice, joining a full race and "start" from anyone but the first player were refused.
- **Levels and sliding:**
  - a child at effort 0.6 (150 %) climbed exactly as fast as an adult at 0.9;
  - the help for whoever is behind raised a slower player;
  - a player who stopped after 3 s slid down slowly (Easy).
- **The finish:** the first player reached the star after 17 s (Easy), and the star flashed in their colour (red).
  The tree's overlay got 436 frames.
- **Panel and cube:**
  - the panel's test race ran with 3 pretend players;
  - the cube track drew lanes and the star (232 lit pixels);
  - "everyone left" ended a race.
- **Splits:** stripes gave 3 lanes for 3 players, side by side 2 lanes for 2, rings used every pixel for everyone.
- **The phones, ways to play:**
  - with 👥 two players and 👆 Tap, 12 and 6 taps sent `[0.75, 0.63]`;
  - simulated shaking sent 1.0 (capped);
  - simulated running sent 0.86–1.0;
  - the simulated microphone (a quiet beep) sent 0.06–0.15.
  - The "new race" message carried both players' colours and levels.
- **A fix from testing:** the first version asked for motion permission when the race started, outside a tap, and
  the browser refused it (iPhones do the same). Permissions are now asked when tapping New race or Join.
- **Race page:**
  - **Pair automatically** paired 3 trees with their stars;
  - the test race ran;
  - a "Children" profile was saved;
  - no script errors.
- **Not tested yet on real trees and real phones** (iPhone and Android motion sensors and microphones) over the real
  ntfy.sh.

---

## v17 — Sing (2026-11-22)

A new **🎤 Sing** tab: visitors record a song on their phone, pick who sings it, and it plays on the speaker of the
bridge's computer while a singing model of the show moves its mouth, a prop glows with the voice, or a side of the
cube shows a singing face. The full guide is [docs/sing.md](docs/sing.md).

**New: 🎤 Sing on the visitors' page:**

- **Who sings:** a list of the singers you allow (up to 30), with your names and emoji.
- **Recording:**
  - a big red record button, a live level meter and a 10-second limit;
  - the silence at both ends is cut off;
  - **Listen**, **Record again** and **Send it to the lights!**
- **The recording:** made on the phone as a small mono 16-bit 11 kHz WAV (about 22 KB a second), so every platform
  can play it with nothing installed. It is sent to ntfy.sh as an attachment, like the animated pictures.
- **Feedback:** the queue and "your song is playing now" are shown, from the new channel `<code>-sing`.
- **Limits and notice:** one recording per phone every 20 seconds. A note says the recording plays out loud and is
  deleted afterwards.

**New: singing in the bridge:**

- **Singing models:** the bridge reads the models with "node range" faces from EZPlayer's copy of
  `xlights_rgbeffects.xml`, by itself at start and whenever the show changes. It picks the face that defines the
  most, and uses the face's own colours when it has them.
- **The mouth:** the recording is measured 20 times a second (loudness and how hissy it is) and turned into the xLights
  mouth shapes: rest, E, MBP, AI, O, etc. Single-frame flicker is smoothed out. Outline and eyes stay on, with a blink
  now and then.
- **Props and the cube:**
  - other props glow with the voice, their colour turning slowly;
  - a side of the cube shows a drawn face (outline, eyes, a mouth that widens and opens), with no EZPlayer needed.
- **Playing the sound** on this computer:
  - Windows: `winsound`;
  - macOS: `afplay`;
  - Linux and Raspberry Pi: `aplay`, with `paplay` / `pw-play` as fallbacks and a choice of output.
  The volume is applied to the samples. A **Mouth timing** setting lines the mouth up with the speaker.
- **Queue and clean-up:** one recording at a time, up to 6 waiting. The bridge downloads, plays and then deletes each
  recording.
- **Checks:** only ntfy.sh files up to 400 KB, only short mono 16-bit WAV up to 12 s, and a known singer.

**New: control page card "Sing (visitors)"** (with its own Save button):

- **Options:**
  - on/off;
  - **Approve each recording before it plays**: off by default, as asked, so recordings play straight away;
  - volume;
  - sound output (Linux and Raspberry Pi);
  - mouth timing;
  - whether props and the cube can sing.
- **Singers:** **Find the singing models in EZPlayer**, and the list of singers with a tick box, name and emoji for
  each.
- **Checking:** **🔊 Test sound** (a three-note chime). With approval on, each waiting recording has a player,
  **▶ Play** and **✕**.

**Changed:**

- **Visitors' page:**
  - up to 8 tabs, in two rows of four;
  - the status for the phones has `sing` and `singers`;
  - `gifmaker.js?v=17` makes phones load the new page.
- **Settings:** new settings `sing`, `sing_approve`, `sing_volume`, `sing_device`, `sing_delay`, `sing_props`,
  `sing_cube`, `sing_off` and `sing_names`.
- **Documents:**
  - new guide `docs/sing.md`;
  - every `INSTALL.md` has a "Sing (visitors)" section with that platform's speaker notes;
  - every `CONTENTS.md` and the READMEs describe Sing.

**Updating:**

- **The bridge:** replace `showplay_bridge.py` and restart it.
- **The visitors' page:** publish `visitors-page/index.html` again. The QR codes stay the same.

**Tested** (a v17 bridge with a stand-in EZPlayer serving the real MerryOnCherry 2026_Base layout, a stand-in DDP
board, a stand-in `aplay` and a stand-in ntfy.sh; the page in Chromium with a simulated microphone):

- **Finding the singers:** 42 singing models were found in the layout in 0.5 s, for example the Boscoyo singing
  pumpkin (250 nodes, face "0 Pumpkin Delux" with outline, eyes and 10 mouth shapes). With a prop and a cube side
  there were 44 singers.
- **The mouth:** a test voice of four syllables (soft, loud, hissy, long) gave the mouth track
  `.......mAAAAm.....mAOOOOOOAm....eeee......mAAOOOOOOOOAAm.......`.
- **Two recordings in a row:** the pumpkin sang first (66 frames to its overlay, 5 different mouth states), then the
  cube's face (76 lit pixels).
  - Each recording was played by `aplay` at its full length (3.1 s).
  - The overlay closed after the song, and no temporary files were left.
- **Refused:**
  - a second recording from the same phone within 20 s;
  - an unknown singer;
  - a file from another website;
  - a file that was not a WAV.
- **Approval on:** the recording waited until approved.
- **The phones:** the queue posted on `-sing` showed "now singing" for each phone while its song played. This needed a
  fix: at first the queue was not posted during a song.
- **Visitors' page:** with a simulated microphone, 1.8 s were recorded, trimmed and sent as
  `?filename=sing.wav&message={"k":"sing","s":"f:Snoman_6ft_EFL",…}` with a valid WAV (mono, 16-bit, 11025 Hz,
  1.77 s, 39 KB), with no script errors.
- **Control page:** the Sing card listed the 42 singing models, and **🔊 Test sound** played the chime.
- **Not tested yet:** with a real speaker on Windows, macOS and the Raspberry Pi, and with real phones over the real
  ntfy.sh.

---

## v16 — Pong for visitors (2026-11-22)

Pong is now also on the visitors' page: one visitor against the computer, made for the relay's delay. The crew's fast
Pong stays on the Mixer page.

**New: 🏓 Pong for visitors** (🎮 Games tab):

- **Playing:** the visitor is red on the left and the computer is blue on the right. First to 5 points.
- **The paddle:** the visitor slides a finger up and down on a strip (or uses ↑ / ↓ on a computer). The phone sends
  where the paddle should go, at most one message every half second, and it glides there. The phone shows the paddle
  moving to where the finger was.
- **Made for the delay:**
  - the ball starts at 0.26 sides a second and speeds up only to 0.6 (the crew's goes from 0.45 to 1.4);
  - the paddles are longer (just over half the side, against a third in the crew's game);
  - there is a 1.6 s pause before each serve;
  - the computer reacts only once the ball is past the middle, moves at 0.27 sides a second, and aims up to a third
    of the side off.
- **The end:** a game lasts at most 5 minutes, and stops after 1 minute with nobody moving the paddle.
- **Messages:** the bridge posts only when the score or the state changes.

**Changed:**

- **Control page:** **Games** has a seventh tick box (🏓 Pong). Settings saved by v13 to v15 with every game on get it
  on too.
- **Mixer page:**
  - the crew cannot start Pong while a visitor is playing it ("a visitor is playing Pong");
  - the crew's paddle controls and MIDI paddles do nothing during a visitor's game;
  - **⏹ Stop** still ends it.
- **Visitors' page:**
  - Pong is in the game picker;
  - while the crew plays, the phones still say so;
  - `gifmaker.js?v=16` makes phones load the new page.
- **Documents:**
  - every `INSTALL.md` has Pong in the games table and a "Pong for visitors" part in "Games";
  - `CONTENTS.md`, `docs/mixer.md` and the READMEs are updated.

**Updating:**

- **The bridge:** replace `showplay_bridge.py` and restart it.
- **The visitors' page:** publish `visitors-page/index.html` again. The QR codes stay the same.

**Tested:**

- **Starting and controls:**
  - a visitor's Pong started from the relay;
  - the Mixer refused to start Pong over it;
  - a crew paddle move was ignored;
  - the visitor's slide moved the paddle's goal;
  - a message from another phone was refused.
- **Balance**, simulated players whose moves arrive 1 second late, 8 games each:
  - the first setting was too hard: the computer never missed, so a good player drew 0–0 for 400 s and an average one
    lost 0–5;
  - the second was too easy: 5–0 almost every game;
  - with the final setting, a good player won 7 of 8 (one long game hit the limit), an average player won 8 of 8 (5–0
    to 5–4), and a weak player won 2 of 8 (most lost 0–5 or 1–5).
- **Page:** the picker with Pong and the Pong screen (score "You 2 : 1 Computer") were checked in Chromium at phone
  width, with no script errors. A slide sent `{"a":"go","y":0.167}`.
- **Not tested yet on the real cube and phones over the real ntfy.sh.**

---

## v15 — Space Invaders and "Play the lights" (2026-11-22)

Two additions:

- **Space Invaders:** a slower version for visitors, made for the relay's delay, and a full-speed version for the crew
  on the Mixer page.
- **🎹 Play the lights:** visitors take turns to play the models of the props like a keyboard. It is a safe, public
  version of the Mixer's Keys.

**New: 👾 Space Invaders for visitors** (🎮 Games tab):

- **The game:**
  - three rows of invaders march across the side and come down;
  - shields, a mystery ship at the top (50–150 points), three lives, an extra life per wave cleared (up to 5);
  - each wave starts lower and moves faster.
- **Made for the delay:**
  - the visitor slides a finger on a strip and the phone sends where the ship should go, at most one message every
    half second (one per slide); the ship glides there;
  - the ship fires by itself every 0.55 s;
  - invaders step every 1.5 s at first (down to 0.45 s), and bombs fall at 3 squares a second, one at a time in the
    first two waves.
- **Messages:** the bridge posts only when the score, lives, wave or state change.

**New: 👾 Space Invaders for the crew** (Mixer page, new **👾 Invaders** tab):

- **Speed:** the same game at full speed, with no delay on the home network.
- **Moving and firing:**
  - slider, ◀ / ▶ (held) or ← / → / A / D to move;
  - 🔥 (held for repeated fire) or Space to fire;
  - new learnable MIDI controls: `game:ship` (knob or fader), `game:left`, `game:right` and `game:fire` (pads or
    keys).
- **Visitors:** phones show "the crew is playing" while it is on.

**New: 🎹 Play the lights** (visitors' page, new **🎹 Play** tab; control page, new card "Play the lights (visitors)"):

- **Pads and colours:** a pad for each model of the props ticked on the control page (up to 32). The visitor picks one
  of 9 colours or 🌈, and each tap lights that model in that colour for 0.45 s, then it fades with the Keys' release.
- **Turns:** one visitor at a time, 20 s, 30 s (default), 45 s or 1 min each, with a queue of up to 20. A turn passes
  on when it ends, when the visitor taps "I'm done", or after 10 s without a tap.
- **Messages:** the phone gathers taps for half a second into one message (at most 8 pads per message). The turn and
  the queue are posted on the new channel `<code>-play`.
- **Safety:** no strobe, no blackout, nothing else in the show changes. The crew can play the same models from the
  Mixer's Keys at the same time; their keys keep their own colours.
- **Settings and status:**
  - new settings `play`, `play_secs` and `play_props` in `showplay_config.json`, set on the control page;
  - the status for the phones has a new `play` flag, so the tab shows only when it can be used.

**Changed:**

- **Control page:** **Games** has a sixth tick box (👾 Space Invaders). Settings saved by v13 or v14 with every game
  on get it on too.
- **Visitors' page:**
  - up to 7 tabs, shown in two rows;
  - `gifmaker.js?v=15` makes phones load the new page.
- **Bridge:** the Keys engine takes a colour per key for visitors' taps, and a tap lasts a set time on its own (no
  "still held" messages needed).
- **Documents:**
  - every `INSTALL.md` has Space Invaders in "Games", "Space Invaders for the crew", and a new "Play the lights
    (visitors)" section;
  - `docs/mixer.md` has an "Invaders tab" section, the new controls and the `/api/invaders` calls;
  - the `CONTENTS.md` files and the READMEs describe both additions.

**Updating:**

- **The bridge:** replace `showplay_bridge.py` and restart it.
- **The visitors' page:** publish `visitors-page/index.html` again. The QR codes stay the same.

**Tested** (a v15 bridge with a stand-in EZPlayer with the real 2026_Base layout, a stand-in DDP board and a stand-in
ntfy.sh, and the pages in Chromium at phone width):

- **Space Invaders, visitors' version:**
  - it started with 18 invaders and 6 shield blocks;
  - the ship glided to where the phone sent it, and a message from another phone was refused;
  - in a 40-second game the player cleared 17 of 18 invaders with all lives left.
- **Balance:**
  - simulated games with a simple player whose moves arrive 1 second late lasted 50–85 s and reached wave 2;
  - an earlier, faster setting ended in 25–35 s, so the visitors' version was slowed down.
- **Space Invaders, crew version:**
  - it started from the Mixer;
  - the keyboard moved the ship and fired;
  - a MIDI CC learned as `game:ship` moved it, and a note learned as `game:fire` fired;
  - a simulated player scored 120–330 points before losing.
- **Hits:** shots are checked on every square they cross. At first, fast shots could skip a row of invaders at 20
  frames a second; this is fixed.
- **Explosions:** they could make a colour value out of range for a moment, and are now clamped.
- **Play the lights:**
  - two phones joined: the first got the turn and the second was queued;
  - a tap from the second was refused;
  - a tap on two pads lit those two models (and not their neighbours) in the colour picked (orange: 249, 135, 25);
  - their overlays closed after the fade;
  - "I'm done" and 10 s without a tap passed the turn on;
  - unticking props limited the pads, and switching it off emptied the queue;
  - posts on `-play` went out once per change.
- **Pages:**
  - the 7 tabs, the Invaders strip (sent `{"a":"go","x":0.899}` after a slide), and the Play tab (waiting with the
    queue, then a turn) were checked with no script errors;
  - a turn with a colour and two taps sent `{"a":"tap","m":[0,2],"c":3}`;
  - the Mixer's Invaders tab and the control page's new card were checked too.
- **Not tested yet on the real cube and phones over the real ntfy.sh.**

---

## v14 — Count the colours, Snake and Pong (2026-11-22)

Three more games, which completes the games planned. The relay between the phones and the bridge takes up to a second,
so each game is made to work with that delay:

- **Count the colours:** a party game whose answers are numbers, so speed never matters.
- **Snake:** slow on purpose, with turns remembered in advance.
- **Pong:** played from the Mixer page on the home network, where there is no delay.

**New: 🔢 Count the colours** (visitors, 1 to 8 phones at once):

- **Joining:** one visitor starts a game, and others join within 25 seconds (or the first player taps **Start now**).
  Each player gets an animal, and the side shows a dot for each one.
- **5 rounds.** In each round:
  - the side shows a frame in the colour to count;
  - it flashes red, green, blue and yellow quickly, never the same colour twice in a row;
  - everyone taps how many times the colour flashed (0–15) within 12 s;
  - the side shows the right number as dots, and the phones show ✅ or ❌ for everyone.
- **Harder each round:** each round has more flashes and is faster. The most right answers wins (ties are shared).
- **Messages:** one message per player per round. The bridge posts only when the round changes or someone answers.

**New: 🐍 Snake** (visitors, one player):

- **Playing:** an 8 × 8 board on the side, a red square to eat, walls and its own tail to avoid, and 3 seconds to get
  ready.
- **Speed:** it starts at about one square a second and speeds up a little with each square eaten (down to 0.45 s).
  Up to 3 turns are remembered in advance.
- **Steering:** big arrow buttons on the phone (with a short vibration), swipes on them, or the arrow keys.
- **The end:** a game lasts at most 5 minutes. The score and best score since the bridge started are shown.
- **Messages:** one message per turn from the phone. The bridge posts only when the score or the state changes, never
  every step.

**New: 🏓 Pong** (Mixer page, new **🏓 Pong** tab):

- **Players:** one player against the computer, or two players, on one side or all sides. First to 5 points.
- **Paddles:** a finger dragging in a strip, W / S and ↑ / ↓ on a keyboard, or a MIDI fader or knob (new learnable
  controls `game:p1` and `game:p2`).
- **The computer:** it reacts late and aims a little off, so a good player can beat it.
- **Visitors:** Pong cannot be started from the visitors' page. While it is on, the phones show that the crew is
  playing, with the score.

**Changed:**

- **Control page:** **Games** has five tick boxes. Settings saved by v13 with all three games on get the two new ones
  on as well.
- **Visitors' page:** the picker shows the five games. The new screens are:
  - lobby with the players' animals;
  - answer buttons 0–15 and a scoreboard;
  - arrow pad;
  - a "watch the crew play Pong" view.
  `gifmaker.js?v=14` makes phones load the new page.
- **Bridge:** "Snake" and "Pong" move every frame inside the drawing, so they stay smooth at 10, 15 or 20 frames a
  second. A message for a game that is not on the visitors' list (such as Pong) is ignored without changing the game.
- **Documents:**
  - the "Games" section of every `INSTALL.md` now covers all six games, with a table;
  - `docs/mixer.md` has a new "Pong tab" section, the paddle controls and the `/api/pong` calls;
  - the `CONTENTS.md` files and the READMEs list the new games.

**Updating:**

- **The bridge:** replace `showplay_bridge.py` and restart it.
- **The visitors' page:** publish `visitors-page/index.html` again (on GitHub, upload it over the old one). The QR
  codes stay the same.

**Tested** (a v14 bridge with a stand-in DDP board and a stand-in ntfy.sh, and the pages in Chromium at phone width):

- **Count the colours:**
  - 3 players joined, and a start from a non-first player was refused;
  - the sequence never repeated a colour, and the flashes counted on the side matched the right answer (5 of 13);
  - a second answer in the same round was refused;
  - the result scored ✅ and ❌ correctly, and the dots showed on the side;
  - all 5 rounds played to the end (final 5, 4, 1).
- **Snake:**
  - it started after 3 s, refused a turn back on itself and a turn from another phone, moved, and ate (score 2);
  - Stop ended it, with the best score kept.
- **Pong:**
  - a visitor's "pong" message was refused and left the game unchanged;
  - it started from the Mixer, refused visitors' games while on, followed a MIDI CC learned as `game:p1`, and
    stopped;
  - a simulated good human player against the computer finished 4–5 after about 3 minutes.
- **Pages:** the visitors' picker, Count lobby, answer and result, the Snake arrows (sent `{"a":"dir","d":1}`) and the
  Mixer's Pong tab (dragging moved the paddle on the bridge) were checked with no script errors.
- **Cube pictures:** all three new games were checked at 16 × 16.
- **Not tested yet on the real cube and phones over the real ntfy.sh.**

---

## v13 — Tic-tac-toe and Simon (2026-11-22)

Two new games for visitors, next to Four in a Row: **Tic-tac-toe** (noughts and crosses) and **Simon** (memory of
colours). The 🎮 tab is now called **🎮 Games** and starts with a game picker.

**New: Tic-tac-toe:**

- **Players:** two visitors play each other from their phones, or one plays the computer. There are the same turns,
  timers (45 s per move, 90 s for a friend to join) and Join button as Four in a Row.
- **The computer:** Easy (half its moves are random), Normal (a fifth) or Hard (perfect play: it never loses). It uses
  the same "The computer plays" setting as Four in a Row.
- **On the cube:**
  - a 3 × 3 grid that glows in the colour of whose turn it is;
  - crosses for player 1 and rings for player 2, in the theme's colours;
  - the last mark grows in;
  - at the end, the winning line blinks white and the grid turns rainbow.
- **On the phone:** a big 3 × 3 board with ✕ and ◯.

**New: Simon:**

- **How it plays:** the side shows the four colours (green, red, yellow, blue) as quarters, and lights them up one by
  one in a sequence. The visitor repeats it on four big buttons on their phone, each with its own note (played on
  the phone).
- **Each round:**
  - a right answer flashes the side green and adds a colour;
  - each colour is shown a little shorter every round (0.72 s down to 0.32 s);
  - the time to answer is 6 s plus 1.2 s per colour.
- **The end:**
  - a wrong colour ends the game, and the side blinks the colour that was right;
  - 30 rounds wins;
  - the phone shows the score and the best score since the bridge started.
- **One message per round:** the phone sends the whole answer in one message, so a round costs one message from the
  phone and about two from the bridge, well inside ntfy.sh's free limits.

**Changed:**

- **Bridge:**
  - the games share one engine; Four in a Row plays exactly as before;
  - only one game at a time, and a different game can start as soon as the last one ends;
  - the log and the "now showing" line name the game being played.
- **Control page:** **Games** now has one tick box per game (Four in a Row, Tic-tac-toe, Simon) under "Let visitors
  play games on the cube". The new setting `game_list` in `showplay_config.json` keeps the choice. Existing settings
  files get all three games.
- **Status for the phones:** the status now lists the games switched on (`gl`), so the phones show only those.
- **Visitors' page:**
  - the 🎮 Games tab has a picker (shown when more than one game is on), then the board of the chosen game;
  - visitors watching see which game is being played;
  - `gifmaker.js?v=13` makes phones load the new page files instead of a cached copy.
- **Documents:**
  - every `INSTALL.md` has a new "Games: Four in a Row, Tic-tac-toe and Simon" section, in place of "Game: Four in a
    Row";
  - every `CONTENTS.md` and the READMEs describe the three games.

**Updating:**

- **The bridge:** replace `showplay_bridge.py` and restart it. All settings and the show code stay.
- **The visitors' page:** publish `visitors-page/index.html` again (on GitHub, upload it over the old one). The QR
  codes stay the same.
- **Mixing versions:** a v13 page with an older bridge shows only Four in a Row; a v12 page with a v13 bridge still
  plays Four in a Row.

**Tested** (a v13 bridge with a stand-in DDP board and a stand-in ntfy.sh, and the page in Chromium at phone width):

- **Tic-tac-toe:**
  - the computer on Hard against itself always draws;
  - it blocked a threat and took a win when it had one;
  - in 300 games against a random player it never lost;
  - a full game against the computer reached "three in a row" and drew 100 lit pixels on the side;
  - each move of the computer took under 20 ms.
- **Simon:**
  - the sequence lit the right quarter (one bright, three at 8 %);
  - a right answer flashed the side green and added a colour;
  - a wrong answer ended the game with the right colour blinking, score 1, best 1;
  - an answer of the wrong length and an answer from another phone were refused.
- **Settings:** a game switched off on the control page was ignored.
- **Four in a Row:** it still started, and the computer answered.
- **Posts to ntfy.sh:** they went out once per change, for all three games (14 posts for the whole test).
- **Visitors' page:**
  - picker, Tic-tac-toe board (your turn, win), Simon (taps, progress "2 / 3", game over with best score) were
    checked with no script errors;
  - the phone sent `{"a":"new","g":"ttt",…}` and, for Simon, the whole answer `{"s":[0,3,1]}` in one message.
- **The cube pictures** of both new games were checked at 16 × 16.
- **Not tested yet on the real cube and phones over the real ntfy.sh.** The posting and the moves use the same paths as
  Four in a Row, which already works on the live page.

---

## v12 — Mixer, Keys and MIDI controllers (2026-11-22)

ShowPlay now has controls for **whoever runs the show**, not only for visitors. The new **Mixer** page works like a
MIDI controller on a phone, tablet or computer. Its **Keys** mode turns every model of the props into a key to play. A
**real MIDI controller or keyboard** can play all of it too. Everything is explained in the new guide
[docs/mixer.md](docs/mixer.md).

**New: the Mixer page** (http://\<bridge-ip\>:8099/mixer, also from the new **🎛️ Mixer & 🎹 Keys** button at the top
of the control page):

- **Targets:** pick the sides of the cube and the props to drive. Each one keeps its own effect, palette and faders.
- **Pads:**
  - the 12 prop effects (they now also work on the cube);
  - the cube scenes of the visitors' page, for the sides;
  - a text pad that scrolls any message on the picked sides.
- **Colours:** the 11 palettes.
- **Faders:** Master (brightness), Speed (0.2× to 3×), Colour (turns the palette around the colour wheel) and White.
  They change effects live, without restarting them.
- **Hold buttons:** ⚡ Flash, 💥 Strobe and ⬛ Blackout, active only while held.
- **8 scenes:** save and recall everything that is on. They are kept in the settings file.
- **Giving back:** "Stop the picked" and "Release all". If nobody touches the Mixer for a set time (5 min, 15 min by
  default, 1 hour or never), everything goes back to the visitors and the show by itself.

**New: Keys** (the Keys tab of the same page):

- **One key per model:** every model of every prop, and every side of the cube, is a key, up to 128 (the MIDI range).
  A prop made from a group of snowflakes gives one key per snowflake.
- **Velocity:** pressing higher on a key plays it brighter.
- **Aftertouch:** sliding the finger while holding changes it live.
- **Release:** letting go fades it out. Several keys play at once.
- **Computer keyboard:** 1–0, Q–P, A–L and Z–M play the first 36 keys.
- **Each key's own settings:** effect, own colour or palette, colour, white and level. They are saved.
- **All-keys faders:** Master, Attack (0–2 s), Release (0–4 s) and Colour all.

**New: MIDI controllers** (the MIDI tab):

- **Windows:** the bridge reads MIDI devices itself, through winmm (part of Windows).
- **Linux and Raspberry Pi:** the bridge reads `/dev/snd/midi*` itself. Devices plugged in later are found within
  5–10 s.
- **macOS (or any computer):** the Mixer page passes messages on from Chrome or Edge (Web MIDI), opened at
  `http://localhost:8099/mixer`.
- **Notes play the keys:** a settable first note, which can also be learned. Velocity sets how bright, aftertouch
  (polyphonic and channel pressure) makes a held key brighter, and All notes off (CC 123) stops them.
- **🎓 Learn:** touch any control on the page, then move or press the control on the device. It works for pads,
  colours, faders, holds, scenes, targets and single keys. Faders and knobs follow the value; pads hold as long as the
  note.
- **Default mapping:** CC 7 is Master and CC 1 (modulation wheel) is the colour of the keys.
- **Preset "Alesis VI25"** (factory settings):
  - the 25 keys play the Keys;
  - pads 1–12 are the effects, 13–15 Flash/Strobe/Blackout, 16 Release all;
  - knobs 1–8 are Master, Speed, Colour, White, Attack, Release, Colour all keys and palette.
- **Monitor:** the MIDI tab shows the devices read and the last message received.

**Changed:**

- **Visitors wait:** while the Mixer drives a side or prop, visitors' requests and games for it wait, the same as for
  a game, and start when it is given back. The log says what the Mixer drives.
- **Overlays:** EZPlayer overlays are now closed model by model, so a key that has faded out gives its model back to
  the show at once, even while other keys still sound.
- **New settings** in `showplay_config.json`: `mixer_idle`, `mixer_scenes`, `keys_set`, `keys_glob`, `midi_native`,
  `midi_base` and `midi_map`. Existing settings files work as they are.
- **Documents:**
  - new guide `docs/mixer.md`;
  - every platform's `INSTALL.md` has a new section, "Mixer, Keys and MIDI controllers", with that platform's MIDI
    notes and troubleshooting;
  - every `CONTENTS.md` describes the new parts of the bridge;
  - the READMEs link the new guide.

**Tested** (against a stand-in EZPlayer with the real MerryOnCherry 2026_Base layout, and a stand-in DDP board):

- **Mixer on the cube and the wings:**
  - a side and a prop driven together: the side got 20 DDP frames a second, each wing model got EZPlayer overlay
    frames at 20 a second;
  - Master at 50 % halved the brightness (max 127);
  - Flash gave all 255 and Blackout all 0;
  - cube scenes went to the side only, and text scrolled.
- **Visitors and the Mixer:** a visitor's request for a driven side waited, and started as soon as the Mixer released
  it. Overlays closed on release. A saved scene came back.
- **Keys:**
  - a wing key at velocity 0.5 gave max 126, aftertouch to full gave 250, and after 0.15 s of a 0.35 s release it gave
    141;
  - its overlay closed once faded;
  - a side key lit the side over DDP;
  - key settings were saved.
- **MIDI:**
  - notes with velocity, polyphonic aftertouch, note off and running status (with a clock byte in between) worked;
  - CC 7 set Master;
  - Learn mapped a CC to a pad, and the CC then fired it;
  - the VI25 preset mapped 25 controls: pad 3 started Rising, pad 15 held Blackout until let go, knob 8 went through
    the palettes, and the keys started at C3;
  - a message passed on by the page (Web MIDI path) arrived.
- **Giving back:** the idle timer gave everything back.
- **Pages:** the Mixer, Keys and MIDI tabs and the Learn mode were checked in Chromium at desktop and phone width,
  with no script errors. Holding a key on the page lit its model.
- **Props for visitors** still work as in v11.
- **Not tested yet with a real MIDI device:**
  - The Windows (winmm) and Linux (`/dev/snd`) readers use the standard system interfaces, but were not run with a
    device plugged in.
  - The VI25 factory notes for the pads (36–51 on channel 10) are the usual Alesis defaults. If a pad does nothing,
    the MIDI monitor shows what it sends, and Learn fixes it.

---

## v11 — macOS and Linux x64 (2026-11-21)

ShowPlay now has a folder for each platform that EZPlayer itself runs on: Windows, macOS (Apple Silicon and Intel),
Linux x64, and Raspberry Pi (arm64). The bridge works exactly as in v10; only its version number and the platforms in
its header changed.

**New folder `macOS/`:**

- **`start_bridge.command`** opens in Terminal with a double-click and starts the bridge. If Python 3 is missing, it
  says how to install it.
- **`install_autostart.command`** makes the bridge start by itself when you log in, with no window and no
  administrator password.
  - It installs a LaunchAgent (`~/Library/LaunchAgents/com.showplay.bridge.plist`) that restarts the bridge if it
    stops and logs to `~/Library/Logs/ShowPlay/bridge.log`.
  - The start file is written with Python's own property-list writer, so folder names with spaces, `&` or accents are
    stored correctly.
- **`remove_autostart.command`** stops it and removes the LaunchAgent. Settings are kept.
- **`macOS/INSTALL.md`** is a complete guide for the Mac:
  - installing Python 3, and allowing downloaded `.command` files to open;
  - the network questions macOS asks: incoming connections and Local Network;
  - keeping the Mac awake during the show, and running EZPlayer on the same Mac;
  - Mac troubleshooting.
- **`macOS/CONTENTS.md`** covers what every file does and where things are on the Mac.

**New folder `linux-x64/`:**

- **Files:** the same bridge and systemd scripts as `arm64/`, for Linux PCs with Intel or AMD processors (Ubuntu,
  Debian, Linux Mint, Fedora…).
- **`install_ezplayer_service.sh`** now also warns when EZPlayer is an AppImage and FUSE 2 seems to be missing, with the
  command to install it.
- **`linux-x64/INSTALL.md`** is a complete guide for Linux PCs:
  - Python and systemd, `chmod`, and opening the firewall (`ufw`);
  - the `showplay` service;
  - EZPlayer as an AppImage, `.deb` or `.tar.gz`, on screen or headless;
  - Linux troubleshooting.
- **`linux-x64/CONTENTS.md`** covers what every file does.

**Other changes:**

- **README:** `README.md` lists the four folders, and the apps list links each platform's guide.
- **Contents guides:** the `CONTENTS.md` files of `Windows/` and `arm64/` show the four folders.

**Tested:**

- **The bridge:** all four copies of `showplay_bridge.py` are the same file and pass a code check.
- **macOS:**
  - All `.command` files pass `bash -n` and ShellCheck.
  - `install_autostart.command` was run with stand-in `launchctl`, `plutil` and `ipconfig`. The LaunchAgent it writes
    is a valid property list with the right program, folder, restart and log settings, also in a folder named
    "Show & Play".
  - `remove_autostart.command` removes it, and `start_bridge.command` starts the bridge.
- **Linux x64:** all `.sh` scripts pass ShellCheck, and the services were generated against a stand-in `systemctl`.
- **Links:** every link between the documents points to a file that exists.
- **Not tested yet on real Apple hardware or a real Linux PC.** The Mac scripts use standard macOS tools (`launchctl`,
  `plutil`, LaunchAgents), but the first real run should be watched.

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
