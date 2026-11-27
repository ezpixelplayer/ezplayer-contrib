# Statues

Musical statues with the lights. While the matrix is **green** everybody dances; when it turns **red** everybody
freezes. Whoever moves during the red light is out. The last one standing wins, or everyone still in after the last
round. Nobody knows when the light will change: the green and red lights last a random time each.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). The player creates an instance and gives it a token. Open the instance's settings page (the
gear on the Apps tile) on the home network so the models can be listed, pick the matrix and Save. Settings are saved
to the instance's private `settings` document and re-read between games.

## How it is built

Plain Node (22+), no dependencies, built like the other ShowPlay game apps:
- `game.mjs`: the rules and the drawing, with nothing about the player's API;
- `player.mjs`: the part that talks to the player, the same in every ShowPlay game app (settings, the matrix, the
  phones' events, the overlay lease while a game is on, released between games, and the app's status);
- `sensor.mjs`: the body sensor, the same as in pong and catch-the-presents; `beat.mjs`: the music of the green light;
- `theme.mjs`: the words and what falls in the back (a theme pack puts its own there);
- `main.mjs`: starts the two together; `page/` is the phones' page and `config/` the settings page (built from `_src/`).

## Ways to play

Each game is played one way, picked on the phone under **Play with** before **New game**:

- **🧍 Body sensor** (an ESP32 with an HLK-LD2450 radar, see `body-sensor/`): up to **3 people** stand in front of
  the lights; no phone is needed to play. One phone taps **New game**; the game starts after 12 seconds, or at once
  with **Start now**. The people the radar sees at that moment are the players, named **Left**, **Middle** and
  **Right** (as they stand), each with a marker on the lights. A short time after the light turns red (the grace
  time, 0.6 s), each one's place is taken; moving more than the sensitivity's distance from it puts that person out.
  The radar's own jitter (a few centimetres) is smoothed out, and a person the radar loses for a moment is not judged
  while unseen. Shown only when the sensor is set up and answers.
- **📱 Phone in my hand**: each player types a name and holds their phone while dancing (up to 8 players). One taps
  **New game**, friends tap **Join the game**, and the game starts when the join time ends or someone taps **Start
  now**. During the red light, after the grace time, each phone sends how much it moved (a level from 0 to 100, every
  300 ms); above the sensitivity's level the player is out. The phone's motion sensor needs a phone that has one and the page opened in
  **https** (browsers keep the motion sensor from plain http pages); on an iPhone the visitor allows Motion once,
  when tapping New game or Join. When it cannot work, the phone says so and does not join. A phone that sends nothing
  during two red lights in a row (the page was closed) is out.

When everyone left moves in the same red light, they all go on (nobody would be left otherwise).

## On the lights

The whole matrix is the light: green (pulsing with the beat) or red. Along the bottom, one block per player in their
colour, crossed out (and flashing white for a moment) when out. During the red light a bar along the top shows how
long to hold still; the green light's length stays a secret unless **Show how long the go light lasts** is ticked.
While the light is green, something falls in the back (snow; each theme pack its own: confetti, petals, bats, leaves,
stars or bubbles). At the end the winners' colours sparkle and the greeting scrolls across.

## Configure

- **Matrix**: any model at least 8 x 6 pixels.
- **The lights**: the colours of the go and stop lights (green and red), something falling in the back, showing how
  long the go light lasts.
- **Ways to play**: the body sensor and/or the phone (if both are off, the phone is used); **how still players must
  be**: a little wobble is fine (40 cm with the body sensor, level 35 with the phone), normal (25 cm, level 20) or very
  still (14 cm, level 10); **seconds to freeze** after the light turns red (0.6).
- **The game**: the go light's shortest and longest time (3 to 8 s), the stop light's (3 to 6 s), **rounds** (8),
  **seconds for phones to join** (30), **seconds of result** (8).
- **🎵 A beat while the light is green**, ending with a buzz when it turns red (made by the app, no files), and its
  **beats a minute** (120). It plays where the ending's sounds play, at their volume (section below).
- **Body sensor**: its address, the width of the play area and where it starts and ends, and whether it faces the
  players, as in pong.
- **Frames per second** and **brightness**.

## When someone wins or loses

The section **🎉 When someone wins or loses**, the same as in the other games (a sound, the words said out loud and/or
written across the lights, a machine for a few seconds). **In this game:** a win is one or more players still in at
the end (`{winner}` is their names, `{colour}` the first one's colour, `{score}` the rounds played); a loss is nobody
left (everyone moved, or the one player of a game alone moved). A game stopped, or that everyone left, does nothing.

## Events

The page sends `new` (`control`: `body` or `phone`, `name`), `join` (`name`), `start`, `quit`, and with the phone
`move` (`level` 0-100, `cue`: the red light it was measured in) every 300 ms during the red light; `moved` counts as
level 100.

## Changes

- **Version 2:** 📊 statistics: each game played (its players, the winner and the scores) is reported to the host panel, which keeps them night by night.

- **Version 1:** first version.
