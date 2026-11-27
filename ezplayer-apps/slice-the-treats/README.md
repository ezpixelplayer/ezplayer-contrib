# Slice the treats

A Christmas slicing game: baubles, candy canes, gingerbread men and presents are thrown up from the bottom of a
matrix of the show, and visitors slice them by swiping on their phone. The phone's pad stands for the matrix, so a
swipe across a treat on the lights slices it. A treat is 1 point, a golden star 5, and slicing several with one swipe
gives a bonus point for each extra one. Lumps of coal fly too: slicing one costs a life. Alone, or two phones slicing
the same treats (the most points wins). The best scores of the day are shown on the phones.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). The player creates an instance and gives it a token. Open the instance's settings page (the
gear on the Apps tile) on the home network so the models can be listed, pick the matrix and Save. Settings are saved
to the instance's private `settings` document and re-read between games.

## How it is built

Plain Node (22+), no dependencies, built like the other ShowPlay game apps: `game.mjs` (the rules and the drawing),
`player.mjs` (the part that talks to the player, the same in every game app), `main.mjs`, `page/` (the phones' page)
and `config/` (the settings page). The same game is in ShowPlay (v27 and later).

A swipe takes a moment to reach the player, so it is checked against where each treat was during the last 0.7 s
too, with a generous reach: what the visitor saw on the lights is what they can slice. Coal is checked strictly
(only about where it was a moment ago, and only the coal itself), so a swipe near a lump of coal does not cost a
life.

## Configure

- **Matrix**: any model at least 8 x 8 pixels; the treats are bigger on a bigger matrix (2 to 6 pixels).
- **Player 1's and player 2's slice** colours (alone, the slice is white).
- **Seconds a game lasts** (60), **difficulty** (how fast and how many treats fly) and **lives** (5).
- **Lumps of coal** (on), **golden stars** (on), **a treat that falls back down costs a life** (off: harder when on).
- **Two players**, **seconds to wait for a friend** (60), **seconds of result** (6).
- **Frames per second** and **brightness**.

## Play

Type a name, pick **Alone** or **With a friend** and tap **New game**; a friend taps **Join the game**. After a short
countdown the treats start to fly. Swipe on the pad across the treats you see on the lights; the pad also shows faint
dots where the treats are (grey for coal). A sliced treat splits in two halves that fly apart, with sparkles in its
colour; slicing coal flashes the matrix red. The time left is a line along the top of the matrix, the lives are red
dots in the top-right corner.

Only one game at a time; while it is on, other phones watch and can start the next one when it ends. Between games
the matrix goes back to the show. A game with no swipe for 45 s ends.

## Events

The page sends `new` (`mode`: `solo` or `friend`, `name`), `join` (`name`), `cut` (`p`: up to 12 points `[x, y]`,
0 to 1 across and down the pad, sent when the finger lifts or every 300 ms of a long swipe), `quit`.

## When someone wins or loses

A section of the settings, **🎉 When someone wins or loses**, all off by default. Tick **When someone wins** and/or
**When someone loses**, then the parts you want:

- **🔊 Sound:** built in (a short fanfare for a win, a sad "wah wah wah waaah" for a loss, made by the app, no files
  needed) or your own WAV files (one for a win, one for a loss, on the player computer). Volume, and where it plays:
  the show's speakers through EZPlayer (at once, or mixed with the show's music), the computer's own speaker, or a
  Raspberry Pi on the network running the ShowPlay speaker (`pi-speaker/`: its IP address and key).
- **🗣️ Say the words out loud:** after the sound, the computer's own voice says the words (Windows and macOS have
  voices; on Linux or a Raspberry Pi install `espeak-ng`). **Voice language** picks a voice of that language when the
  computer has one (`en` by default; `pt` for Portuguese, for example Windows' "Helia" voice). No voice: only the sound.
- **🔤 Write the words across the lights:** the words scroll once over the end of the game, on a darker picture.
- **The words** can use `{winner}` (the player's name, or "The computer"), `{colour}` (the winner's colour as a word:
  Red, Blue…) and `{score}`. Write them in any language.
- **🫧 A machine** for a few seconds (bubbles, fog, snow, its lights…), reached in the same five ways as 🌨️ snow on
  request in the fun app (a web address, or DMX through EZPlayer, DDP, Art-Net or E1.31; its README explains each way,
  with wiring and safety): the DMX channels and seconds for a win, and for a loss (empty: the machine stays off; for
  example only a red light), and a rest between two runs. With a web address the machine runs for a win, and for a loss
  only when ticked.

Every part works on its own: only the sound, only the words, only the machine, or everything.

**In this game:** alone, a new best score of the day is a win (with its own words, `New record: {score}!`) and any other end is a loss (`Game over! {score} points`); with a friend, the winner's win. A draw does nothing.

## Changes

- **Version 7:** 📊 statistics: each game played (its players, the winner and the scores) is reported to the host panel, which keeps them night by night.

- **Version 6:** bug fixes: no request to EZPlayer can freeze the game any more (each has a time limit, and the lease is opened again when frames are refused), and an error in one frame starts the game again instead of stopping the app; the machine is switched off again if the first try fails, and always when the app stops; a banner cut short does not show over the next game; a Raspberry Pi that does not answer holds the sounds for at most 30 s; the word filter no longer blocks normal sentences ("as", "às", "kkkkk", "Nigeria"…) and catches "f*ck", "sh|t", "fu ck"; with a friend, slicing coal takes 2 points off whoever sliced it instead of the shared lives; two treats missed together cost two lives; a player who quits no longer makes the other the winner; "best of the day" follows the local date. The overlay leases stay exclusive (PR #21).

- **Version 5:** the overlay leases are **exclusive** again, with the app token, as PR #21 made them (a later upload had undone it: "Could not light …: overlay: mode must be 'exclusive' or 'layer'"). A model another app is using is refused with that app's name. The machine's lease (DMX through EZPlayer) too.

- **Version 4:** ready for the theme packs (New Year, wedding, baptism, Easter, Halloween, Thanksgiving): a `theme.mjs` next to the app (empty here, so this Christmas app looks and plays exactly as before) and the small pictures of `sprites.mjs`. The packs are made from this app by `_themes/make_pack.py`.

- **Version 3:** 🔈 sounds can also play on **a Raspberry Pi on the network** running the ShowPlay speaker (see `pi-speaker/`): pick it in "Where it plays" and put in the Pi's IP address (and its key, if you set one). If the Pi does not answer, the sound plays on this computer.

- **Version 2:** 🎉 when someone wins or loses: a sound (built in or your own WAV), the words said out loud and/or written across the lights, and a machine (bubbles, fog, lights…) for a few seconds; all off by default.

- **Version 1:** first version.
