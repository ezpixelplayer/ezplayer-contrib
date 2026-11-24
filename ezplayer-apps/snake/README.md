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

## Changes

- **Version 2:** a swipe that started on an arrow button sent two turns (the button and the swipe); now it is only the button.
