# Simon

Simon on a matrix of the show: the four corners light up in a sequence and the player repeats it on four pads on
their phone. Each press reaches the game at once and lights its colour; a wrong one ends the game. Every round adds a
colour and goes a little faster. One player; anyone can watch.

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

- **Matrix**: any model at least 4 x 4 pixels, split into four corners.
- **Colours** of the four corners, **speed** of the lights (slow, normal, fast), **rounds to win** (30),
  **seconds to press each colour** (8) and **seconds of result** (8).
- **Frames per second** and **brightness**.

## Play

Type a name and tap **New game**. Watch the lights, then press the same colours on the pads. A green flash means the
round was right; at the end the colour that was expected blinks and the others glow red. The phone shows the round,
the score and the best score since the app started.

Only one game at a time; while it is on, other phones see it and can start the next one when it ends. Between games
the matrix goes back to the show.

## Events

The page sends `new` (`name`), `press` (`c` 0-3, `i` the press's place in the sequence, `game`), `quit`.

## Left out of the original

Nothing. In ShowPlay the phone sent the whole answer at the end of a round (to save messages); here each press is sent, so it lights at once.
