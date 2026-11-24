# Count the colours

A party game for up to eight phones: the matrix flashes colours quickly, then everyone answers on their phone how
many times one of them flashed. A point for each right answer; after the last round, a podium.

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

- **Matrix**: any model at least 4 x 4 pixels.
- **Rounds** (5), **most players** (8), **speed of the flashes**, **seconds to join** (25) and **to answer** (12).
- **Frames per second** and **brightness**.

## Play

Type a name and tap **New game**; others tap **Join the game** while it is open (the first player can tap **Start
now**). Each round the lights first show which colour to count (a frame in that colour), then flash. Pick a number
from 1 to 20: answers can come in while the colours flash. When everyone has answered (or time is up) the lights show
the right number as dots and the phones show who was right. Each player gets an animal so they can find themselves on
the table.

Only one game at a time; while it is on, other phones see it and can start the next one when it ends. Between games
the matrix goes back to the show.

## Events

The page sends `new` (`name`), `join` (`name`), `start`, `answer` (`value`, `round`), `quit`.

## Left out of the original

Nothing.
