# Space Invaders

Space Invaders for one player on a matrix of the show: sliding a finger on the phone moves the ship, which fires by
itself (or with a fire button). Waves get faster, a mystery ship crosses the top now and then, three lives and an
extra one for each wave cleared.

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

- **Matrix**: any model at least 12 x 12 pixels. The field is as wide as the matrix and at most 1.4 times as tall,
  in the middle of a taller matrix (with a faint edge above and below).
- **Difficulty**: easy (slow invaders and bombs, as for visitors in ShowPlay), normal, or hard (arcade speed, as for the
  crew in ShowPlay).
- **Firing**: by itself, or a fire button on the phone. **Longest game** (7 minutes), **seconds of result** (8).
- **Frames per second** and **brightness**.

## Play

Type a name and tap **New game**. Slide on the strip: the ship glides to where your finger is. Shields stop shots and
bombs; the phone shows the score, the lives and the wave. A game with no slide for 90 seconds ends.

Only one game at a time; while it is on, other phones see it and can start the next one when it ends. Between games
the matrix goes back to the show.

## Ways to play (version 3)

Before **New game** the phone asks **Play with**:
- **👆 Finger**: as before;
- **📱 Tilt**: tilting the phone left and right moves the ship. The way the phone is held at the start is the middle. It needs a phone with a motion
  sensor and the page opened in **https** (browsers keep the motion sensor from plain http pages); on an iPhone the
  visitor allows it once. When it cannot work, the choice is not shown;
- **🧍 Body**: with the body sensor (an ESP32 with an HLK-LD2450 radar, see `body-sensor/`): the ship follows the person and fires by itself. Shown only
  when the sensor is set up and answers.

Body sensor settings (section **Body sensor**): its address (for example `192.168.1.80` or `showplay-sensor.local`),
the width of the play area (3 m), where it starts and ends (0.5 m to 4 m from the sensor) and whether the sensor faces
the players (on: their left is its right). `sensor.mjs` reads it 20 times a second during a game played with the body,
and once a second otherwise, so the phones know it answers.

## Events

The page sends `new` (`name`), `go` (`x` 0-1, sent at most about 8 times a second), `fire`, `quit`.

## Left out of the original

The crew's controls of the ShowPlay Mixer page (keyboard and MIDI).

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

**In this game:** a new best score (since the app started) is a win with its own words; lasting until the time is up is a win; losing the lives or being invaded is a loss. Stopping does nothing.

## Changes

- **Version 8:** 📊 statistics: each game played (its players, the winner and the scores) is reported to the host panel, which keeps them night by night.

- **Version 7:** bug fixes: no request to EZPlayer can freeze the game any more (each has a time limit, and the lease is opened again when frames are refused), and an error in one frame starts the game again instead of stopping the app; the machine is switched off again if the first try fails, and always when the app stops; a banner cut short does not show over the next game; a Raspberry Pi that does not answer holds the sounds for at most 30 s; the word filter no longer blocks normal sentences ("as", "às", "kkkkk", "Nigeria"…) and catches "f*ck", "sh|t", "fu ck"; on a short matrix the invaders start high enough, and they break the shields they touch; no false "New record" after the app restarts. The overlay leases stay exclusive (PR #21).

- **Version 6:** the overlay leases are **exclusive** again, with the app token, as PR #21 made them (a later upload had undone it: "Could not light …: overlay: mode must be 'exclusive' or 'layer'"). A model another app is using is refused with that app's name. The machine's lease (DMX through EZPlayer) too.

- **Version 5:** 🔈 sounds can also play on **a Raspberry Pi on the network** running the ShowPlay speaker (see `pi-speaker/`): pick it in "Where it plays" and put in the Pi's IP address (and its key, if you set one). If the Pi does not answer, the sound plays on this computer.

- **Version 4:** 🎉 when someone wins or loses: a sound (built in or your own WAV), the words said out loud and/or written across the lights, and a machine (bubbles, fog, lights…) for a few seconds; all off by default.

- **Version 2:** the ship's position is sent again at the start of each game, even if the finger has not moved since the last one.

- **Version 3:** new ways to play: 📱 tilting the phone and 🧍 the body sensor, next to the finger. The `new` (and `join`) event carries `control`: `finger`, `tilt` or `body`.
