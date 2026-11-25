# Pong

Pong on a matrix of the show: a visitor against the computer, or two phones against each other. Each phone's slider
moves its paddle. On a wide matrix the paddles are on the left and right; on a tall one the field turns, with player 1
at the bottom and player 2 at the top.

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

- **Matrix**: any model at least 8 x 8 pixels.
- **Colours** of the two players, **against the computer** and/or **a friend**, **difficulty** (the ball's speed and
  how well the computer plays), **points to win** (5), **seconds to wait for a friend** (60), **seconds of result** (6).
- **Frames per second** and **brightness**.

## Play

Type a name, pick **The computer** or **A friend** and tap **New game**; a friend taps **Join the game**. Slide on the
strip (up and down on a wide matrix, left and right on a tall one): your paddle follows. The ball serves from the
middle after each point; the score shows as dots along the net. A game with no slide for a minute ends.

Only one game at a time; while it is on, other phones see it and can start the next one when it ends. Between games
the matrix goes back to the show.

## Ways to play (version 3)

Before **New game** the phone asks **Play with**:
- **👆 Finger**: as before;
- **📱 Tilt**: tilting the phone moves the paddle (left and right on a tall matrix, forward and back on a wide one). The way the phone is held at the start is the middle. It needs a phone with a motion
  sensor and the page opened in **https** (browsers keep the motion sensor from plain http pages); on an iPhone the
  visitor allows it once. When it cannot work, the choice is not shown;
- **🧍 Body**: with the body sensor (an ESP32 with an HLK-LD2450 radar, see `body-sensor/`): the paddle follows the person as they walk left and right (two people: a lane each). Shown only
  when the sensor is set up and answers.

Body sensor settings (section **Body sensor**): its address (for example `192.168.1.80` or `showplay-sensor.local`),
the width of the play area (3 m), where it starts and ends (0.5 m to 4 m from the sensor) and whether the sensor faces
the players (on: their left is its right). `sensor.mjs` reads it 20 times a second during a game played with the body,
and once a second otherwise, so the phones know it answers.

## Events

The page sends `new` (`mode`, `name`), `join` (`name`), `go` (`y` 0-1, sent at most about 11 times a second), `quit`.

## Left out of the original

The crew's controls of the ShowPlay Mixer page (keyboard and MIDI). New here: two phones can play each other.

## When someone wins or loses

A section of the settings, **🎉 When someone wins or loses**, all off by default. Tick **When someone wins** and/or
**When someone loses**, then the parts you want:

- **🔊 Sound:** built in (a short fanfare for a win, a sad "wah wah wah waaah" for a loss, made by the app, no files
  needed) or your own WAV files (one for a win, one for a loss, on the player computer). Volume, and where it plays:
  the show's speakers through EZPlayer (at once, or mixed with the show's music), or the computer's own speaker.
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

**In this game:** a win is a person winning (against the computer or a friend); a loss is the computer winning. A game nobody played does nothing.

## Changes

- **Version 4:** 🎉 when someone wins or loses: a sound (built in or your own WAV), the words said out loud and/or written across the lights, and a machine (bubbles, fog, lights…) for a few seconds; all off by default.

- **Version 2:** the paddle's position is sent again at the start of each game, even if the finger has not moved since the last one.

- **Version 3:** new ways to play: 📱 tilting the phone and 🧍 the body sensor, next to the finger. The `new` (and `join`) event carries `control`: `finger`, `tilt` or `body`.
