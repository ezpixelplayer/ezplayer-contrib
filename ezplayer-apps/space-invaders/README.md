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

## Events

The page sends `new` (`name`), `go` (`x` 0-1, sent at most about 8 times a second), `fire`, `quit`.

## Left out of the original

The crew's controls of the ShowPlay Mixer page (keyboard and MIDI).
