# Catch the presents

Presents fall down a matrix of the show and visitors catch them in a sleigh at the bottom, sliding a finger on their
phone. A present is 1 point, a golden star 3, and a lump of coal takes 2 points off. Alone, or two phones with a sleigh
each. The presents fall faster and more often as the game goes on. The best scores of the day are shown on the phones.

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
- `main.mjs`: starts the two together; `page/` is the phones' page and `config/` the settings page.

The same game is in ShowPlay (v26 and later), so both ways of running the show have it.

## Configure

- **Matrix**: any model at least 6 x 8 pixels. The presents are bigger on a bigger matrix (1 to 4 pixels), with a gold
  ribbon and bow from 3 pixels up.
- **Player 1's and player 2's sleigh** colours.
- **Seconds a game lasts** (60) and **difficulty** (how fast and how many presents fall).
- **Lumps of coal** (on: catching one takes 2 points off), **golden stars** (on: 3 points), **snow** in the back.
- **Two players** (a friend joins with a second phone), **seconds to wait for a friend** (60), **seconds of result** (6).
- **Frames per second** and **brightness**.

## Play

Type a name, pick **Alone** or **With a friend** and tap **New game**; a friend taps **Join the game**. After a short
countdown (the middle row blinks) the presents start to fall. Slide on the strip: your sleigh follows. A line along the
top of the matrix shows the time left and turns red near the end. A catch sparkles over the sleigh (grey smoke for
coal). With two players, a present goes to the nearest sleigh, and the one with more points wins.

Only one game at a time; while it is on, other phones watch and can start the next one when it ends. Between games
the matrix goes back to the show. A game with no slide for 45 s ends.

The best 5 scores of the day are kept in the instance's private `state` document, so they survive a restart; a new day
starts a new list.

## Events

The page sends `new` (`mode`: `solo` or `friend`, `name`), `join` (`name`), `go` (`x` 0-1, sent at most about 11 times
a second), `quit`.

## Changes

- **Version 1:** first version.
