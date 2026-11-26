# ShowPlay apps for EZPlayer

ShowPlay's features as EZPlayer apps (EZPlayer 0.7 or later, which added the apps runtime in v0.7.0-dev.2). Each folder
is one app with its own README. Install them from the Apps tile (Install → this folder), then open each instance's
settings page on the home network.

## The apps

| App | Version | What visitors do | Ways to play |
|---|---|---|---|
| 🎁 **catch-the-presents** | 7 | Catch the presents falling down a matrix in a sleigh, alone or against a friend; a golden star is 3, coal takes 2 off | 👆 finger · 📱 tilt · 🧍 body |
| 🏓 **pong** | 7 | Pong on a matrix, against the computer or a friend | 👆 finger · 📱 tilt · 🧍 body |
| 👾 **space-invaders** | 7 | Defend the show from space invaders: move the ship, it fires | 👆 finger · 📱 tilt · 🧍 body |
| 🍬 **slice-the-treats** | 6 | Swipe to slice the Christmas treats thrown up a matrix, not the coal | 👆 finger (swipe) |
| 🐍 **snake** | 6 | Steer a snake, eat the apples, don't hit the walls | 👆 arrows or swipes |
| ⭕ **tic-tac-toe** | 6 | Tic-tac-toe on a matrix, against the computer or a friend | 👆 tap |
| 🔴 **four-in-a-row** | 6 | Four in a Row on a matrix, against the computer or a friend | 👆 tap |
| 🟢 **simon** | 6 | Repeat the colours the lights show; one more each round | 👆 tap |
| 🔢 **count-the-colours** | 5 | Party game for up to 8 phones: count how many times a colour flashes | 👆 tap |
| 🌟 **race-to-the-star** | 5 | Up to 8 phones race climbers up a tree or matrix (tap, sing, shake or run); the winner lights the star | 👆 tap · 🎤 voice · 📱 shake · 🏃 run |
| 💬 **messages** | 6 | Send a message, an animated picture (73 GIFs), an effect or a drawing to a matrix | — |
| 📅 **advent-calendar** | 5 | Open one more door every day of December and see its surprise | — |
| 🎄 **decorate-the-tree** | 15 | Hang decorations (baubles, candy canes, bells, presents…) with colours and effects, several at once; change the star's colour and effect, and the tree's colour | — |
| 🎁 **fun** | 9 | Photo frame, wheel of fortune, animals, paint by numbers, the bell, snow on request (web address or DMX, with modes and lights), treasure hunt, guess the song | — |
| ✨ **props** | 5 | Light up real models of the show (wings, arches, canes…) with an effect and colours | — |
| 🎹 **play-the-lights** | 5 | Each model becomes a key on the phone: take turns playing the show like a keyboard | — |
| 🎤 **sing** | 6 | Record a song; a singing model sings it on the show's speakers | — |
| 🪢 **tug-of-war** | 3 | Two teams of phones tap as fast as they can; the rope moves to the side that pulls harder (alone: against the computer) | 👆 tap |
| 📸 **photo-pixels** | 3 | Take a selfie and see it on a matrix in pixels, in a frame of the season; nothing is saved | 📸 camera |
| 📝 **guestbook** | 3 | Leave your name and a short note; new notes scroll on a matrix and the book is read every few minutes | — |

**Ways to play**: 👆 finger on the phone; 📱 tilt: tilting the phone (needs the page in https); 🧍 body: the body
sensor at the lights, see below.

## Not an app

- **pi-speaker/**: the ShowPlay speaker, a Raspberry Pi on the network that plays the apps' sounds (endings of the games,
  the bell, the songs, the singing) next to the lights. Pick "A Raspberry Pi on the network" in "Where it plays". Its own page, http://<the Pi's IP>:8765, sets the
  volume, the sound output and a key, and plays a test sound.

- **body-sensor/**: the body sensor, an ESP32 with an HLK-LD2450 radar (about 20 €) that sees up to 3 people in front
  of the lights, for 🧍 body in catch-the-presents, pong and space-invaders (and in ShowPlay). Program, wiring and
  set-up in its README.
- Still in the ShowPlay bridge, not an app: the Mixer and MIDI controllers (for the crew).

## What changed in this round

- New apps: **props**, **play-the-lights**, **sing**, using a new shared part (`multi.mjs`, `models.mjs`) that lights
  many models at once, one overlay lease per model.
- **fun**: the bell and guess the song now play through EZPlayer's audio injection, on the show's speakers (setting
  "Sound of the bell and the songs"); this computer's own speaker is still a choice.
- **decorate-the-tree**: the baubles are saved in the instance's private `state` document and survive a restart.
- All apps: the shared `player.mjs` can keep a game's state across restarts (used by the tree); settings pages accept
  decimals where a field has a step, and list the show's models and groups where an app needs them.
- Tested against a stand-in for EZPlayer's app API (the same routes as the v0.7.0-dev.2 manual); not yet on a real
  player.

## Later fixes and additions

- **tic-tac-toe 2, four-in-a-row 2:** a player could seem to play twice in a row (the phone let a second tap through
  before the app answered); the board now locks until the app answers, and late or repeated moves are refused.
- **simon 2, snake 2, pong 2, space-invaders 2:** smaller fixes to sending presses, turns and positions.
- **messages 2:** the Picture tab with the 73 animated GIFs of the ShowPlay page.
- **decorate-the-tree 3:** spots placed by the real positions of the pixels (a 360° mega tree is decorated all the way
  round, with round baubles), an optional star on top, bauble size, and a fix for the phone's page freezing during the
  countdown.
- **decorate-the-tree 4:** a choice of decorations (bauble, candy cane, star, bell, present, snowflake, heart) and
  visitors can change the star's colour.
- **decorate-the-tree 5:** effects for the decorations (glow, steady, blink, twinkle, pulse, rainbow) and for the star
  (twinkle, steady, blink, pulse, spin, sparkle, rainbow), chosen by the visitors.
- **decorate-the-tree 6:** the star can be a group of the show (for example "All Stars") or several models.
- **decorate-the-tree 7, props 2, play-the-lights 2, sing 2:** a group made of submodels lights only those submodels.
- **decorate-the-tree 8:** on a matrix it draws a tree (triangle, trunk and star) and decorates it; a matrix turned at
  an angle in the 3D layout is no longer taken for a round mega tree.
- **decorate-the-tree 9 and 10:** up to 3 effects together on a decoration or the star, and a setting for how many
  (1 to 6).
- **decorate-the-tree 11:** several decorations at once (tap several spots, then one button); the effects are clearly
  different on the lights and several effects take turns instead of multiplying.
- **catch-the-presents 1 (new):** presents fall down a matrix and visitors catch them in a sleigh, alone or with a
  friend (also in ShowPlay v26).
- **slice-the-treats 1 (new):** a Christmas slicing game: swipe on the phone to slice the treats thrown up the
  matrix, not the coal (also in ShowPlay v27).
- **play-the-lights 3, props 3, sing 3:** on the settings page, a tap on a group or model on an empty line makes a
  whole prop line with an icon and a name guessed from it (🌈 arches, 🍭 canes, 🎄 trees, ⭐ stars, ❄️ snowflakes…);
  more taps add to that prop, and **➕ New prop** starts the next. New instances start with no example props.
- **decorate-the-tree 12:** the tree's own colour (a setting, green by default) and visitors can tap the tree to change
  it (8 colours).
- **catch-the-presents 2, pong 3, space-invaders 3:** new ways to play next to the finger: 📱 tilting the phone, and
  🧍 the body sensor (an ESP32 with an LD2450 radar, see `body-sensor/`) that sees up to 3 people in front of the
  lights. Shared code: `_common/sensor.mjs` (the apps) and `_common/control.js` (the phones).
- **messages 3, fun 2, advent-calendar 2:** a much longer word filter (Portuguese and English) that sees through
  letters spaced out and repeated letters and no longer joins separate words; messages has a new setting **Extra
  blocked words** for the show's own words.
- **fun 3 (with ShowPlay v33):** snow on request by DMX as well as by web address: through EZPlayer (a model in the
  layout), by DDP (WLED built with DMX output and a MAX485, FPP), by Art-Net or by E1.31. The fun README has the full
  guide: smart plugs, relays, radio remotes, pulse mode, DMX wiring, fog machines and safety.
- **fun 4 (with ShowPlay v34):** machines with several functions (DMX): modes the visitors pick (bubbles, fog,
  everything…), the machine's lights (a colour, the rainbow, the strobe with a limit, only the lights), a colour between
  runs, any number of channels. Examples for 1-, 2- and 12-channel machines in the fun README.
- **🎉 When someone wins or loses (with ShowPlay v35):** every game app (four-in-a-row 3, tic-tac-toe 3, simon 3,
  count-the-colours 2, snake 3, space-invaders 4, pong 4, race-to-the-star 2, catch-the-presents 3, slice-the-treats 2)
  and fun 5 have a new settings section: a sound (built-in fanfare / "wah wah", or your own WAV), the words said out loud
  by the computer's voice and/or written across the lights (`{winner}`, `{colour}`, `{score}`), and a machine (bubbles,
  fog, lights…) for a few seconds. All off by default; each game has its own, for a show with only one game. Shared code:
  `_common/ending.mjs`.
- **🔈 A Raspberry Pi as a speaker (with ShowPlay v36):** "Where it plays" has a new choice, **A Raspberry Pi on the
  network**, with its IP address and key, in the 10 games (four-in-a-row 4, tic-tac-toe 4, simon 4, count-the-colours 3,
  snake 4, space-invaders 5, pong 5, race-to-the-star 3, catch-the-presents 4, slice-the-treats 3), fun 6 and sing 4.
  The Pi runs `pi-speaker/` (install with `sh install.sh`). If the Pi does not answer, the sound plays on the computer.
- **🎨 Theme packs:** the 17 apps dressed for 🎆 New Year, 💍 Wedding, 🕊️ Baptism, 🐣 Easter, 🎃 Halloween and 🦃
  Thanksgiving, each pack in its own folder next to `ezplayer-apps` (`ezplayer-apps-newyear`, …) with its own app ids
  (`halloween-catch`, …), so they install next to the Christmas ones. What changes in each app: `THEME_PACKS.md`.
  The Christmas apps catch-the-presents 5, slice-the-treats 4, decorate-the-tree 13, advent-calendar 3, fun 7 and
  messages 4 only got ready for them (a `theme.mjs`, empty for Christmas): they look and play as before.
- **🎨 Theme packs and ShowPlay v38:** every app also exists in 6 theme packs (the folders `ezplayer-apps-newyear`, `-wedding`, `-baptism`,
  `-easter`, `-halloween` and `-thanksgiving`, next to `ezplayer-apps`), each app with its own id so it can sit next to the Christmas one (see
  THEME_PACKS.md). ShowPlay v38 has the same themes as a **🎨 Theme of the show** choice on its control page, so the
  bridge, the visitors' page and the apps can show the same party.
- **🎨 Five more theme packs (with ShowPlay v39):** `ezplayer-apps-carnival`, `-valentines`, `-birthday`,
  `-childrensday` and `-july4` (11 packs in all), each with the 17 apps and a copy of body-sensor and pi-speaker.
  18 new little pictures in `sprites.mjs` (mask, drum, parrot, love letter, party hat, kite, teddy bear, flag, eagle…)
  and a "Stars and stripes" photo frame in fun.
- **🪢📸📝 Three new apps:** **tug-of-war** (two teams tap to pull a rope on a matrix; a team's pull is divided by how
  many players it has, so a small team can win; alone, against the computer; the win/lose ending like the other
  games), **photo-pixels** (a selfie on the lights in pixels, with a frame and a look: natural, pop art, black and
  white, old photo; only a few squares leave the phone and nothing is saved) and **guestbook** (names and notes on the
  lights, the book read every few minutes, kept across restarts, the word filter also on notes already in it, a book
  number to start a new one). All three are in the 11 theme packs too (20 apps per pack).
- **ShowPlay v40:** Tug of war, Photo in pixels and Guestbook are in the ShowPlay bridge too (🎮 Games and 🎁 Fun on the
  visitors' page), so the apps and ShowPlay have the same features. From now on every new feature goes into both.
- **🔧 Exclusive overlay leases again (with ShowPlay v41):** PR #21 (merryoncherry) had made every app's overlay
  lease exclusive, with the app token; a later upload of older files undid it, and EZPlayer then refused the leases
  ("overlay: mode must be 'exclusive' or 'layer'"). Back in every app (new versions), in the three new ones, in the
  machine's lease and in the 11 theme packs.
- **🔧 Bug fixes (all 20 apps, 2026-11-26):** the word filter no longer blocks normal sentences ("as", "às", "kkkkk") and catches "f*ck", "sh|t", "fu ck"; "Only the lights" in fun no longer starts the machine, and a machine is switched off again if the first try fails and always when the app stops; no request to EZPlayer can freeze a game (time limits, the lease opened again when frames are refused); the guestbook and the tree are never overwritten with empty ones when the player or the show is not ready at start; props no longer crash when a missing model is back; fixes in tug-of-war, race-to-the-star, count-the-colours, tic-tac-toe, slice-the-treats, catch-the-presents, pong, space-invaders, play-the-lights, sing, advent-calendar (calendars starting in January or February, summer time) and photo-pixels; the Raspberry Pi speaker refuses requests from other web sites, keys with accents and too many big uploads at once. The overlay leases stay exclusive (PR #21). Each app's README lists its own fixes.
