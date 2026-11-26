# Snake

Snake for one player on a matrix of the show: the phone's arrows (or a swipe, or the arrow keys) turn the snake,
which speeds up as it eats.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). The player creates an instance and gives it a token. Open the instance's settings page (the
gear on the Apps tile) on the home network so the models can be listed, pick the matrix and Save. Settings are saved
to the instance's private `settings` document and re-read between games.

## How it is built

A port of the game in ShowPlay to the EZPlayer app runtime. Plain Node (22+), no dependencies.
- `game.mjs`: the rules and the drawing, with nothing about the player's API, so the game can move to another way of
  talking to phones by changing only the other files;
- `player.mjs`: the part that talks to the player, the same in every ShowPlay game app (settings, the matrix, the
  phones' events, the overlay lease while a game is on, released between games, and the app's status);
- `main.mjs`: starts the two together; `page/` is the phones' page and `config/` the settings page.

The status carries `notices`: why a phone's last request was refused, keyed by its client id, so only that phone
shows it.

## Configure

- **Matrix**: any model at least 8 x 8 pixels. The board is square (10 squares a side by default, fewer if the matrix
  is smaller) and drawn as big as fits.
- **Speed** (slow, normal, fast), **longest game** (5 minutes) and **seconds of result** (8).
- **Frames per second** and **brightness**.

## Play

Type a name and tap **New game**; the snake's head blinks for 3 seconds, then it starts moving right. Up to three
turns are remembered ahead, and a turn straight back is ignored. Eat the red apples; hitting a wall or yourself ends
the game.

Only one game at a time; while it is on, other phones see it and can start the next one when it ends. Between games
the matrix goes back to the show.

## Events

The page sends `new` (`name`), `dir` (`d`: 0 up, 1 right, 2 down, 3 left), `quit`.

## Left out of the original

Nothing. In ShowPlay the snake was slow on purpose (the relay took up to a second); here the speed is a setting.

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

**In this game:** a new best score (since the app started) is a win with its own words; reaching the end (the time up, or a full board) is a win; crashing is a loss. Stopping does nothing.

## Changes

- **Version 6:** bug fixes: no request to EZPlayer can freeze the game any more (each has a time limit, and the lease is opened again when frames are refused), and an error in one frame starts the game again instead of stopping the app; the machine is switched off again if the first try fails, and always when the app stops; a banner cut short does not show over the next game; a Raspberry Pi that does not answer holds the sounds for at most 30 s; the word filter no longer blocks normal sentences ("as", "às", "kkkkk", "Nigeria"…) and catches "f*ck", "sh|t", "fu ck". The overlay leases stay exclusive (PR #21).

- **Version 5:** the overlay leases are **exclusive** again, with the app token, as PR #21 made them (a later upload had undone it: "Could not light …: overlay: mode must be 'exclusive' or 'layer'"). A model another app is using is refused with that app's name. The machine's lease (DMX through EZPlayer) too.

- **Version 4:** 🔈 sounds can also play on **a Raspberry Pi on the network** running the ShowPlay speaker (see `pi-speaker/`): pick it in "Where it plays" and put in the Pi's IP address (and its key, if you set one). If the Pi does not answer, the sound plays on this computer.

- **Version 3:** 🎉 when someone wins or loses: a sound (built in or your own WAV), the words said out loud and/or written across the lights, and a machine (bubbles, fog, lights…) for a few seconds; all off by default.

- **Version 2:** a swipe that started on an arrow button sent two turns (the button and the swipe); now it is only the button.
