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

## Events

The page sends `new` (`mode`, `name`), `join` (`name`), `go` (`y` 0-1, sent at most about 11 times a second), `quit`.

## Left out of the original

The crew's controls of the ShowPlay Mixer page (keyboard and MIDI). New here: two phones can play each other.

## Changes

- **Version 2:** the paddle's position is sent again at the start of each game, even if the finger has not moved since the last one.
