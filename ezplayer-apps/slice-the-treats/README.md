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

## Changes

- **Version 1:** first version.
