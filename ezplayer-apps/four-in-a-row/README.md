# Four in a Row

Four in a Row on a matrix of the show, played from phones: against the computer (easy, normal or hard) or
against a friend whose phone joins from the same page. Anyone else who opens the page watches the game.

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

- **Matrix**: any model at least 7 x 7 pixels. The 7 x 6 discs are drawn as big as fit, centred, with a strip on top
  in the colour of whose turn it is.
- **Colours** of player 1, player 2 (or the computer) and the board.
- **Against the computer** and/or **a friend**, and the computer **levels**: easy looks one move ahead and sometimes
  plays at random, normal looks 3 moves ahead, hard 5.
- **Seconds for a move** (45; running out loses), **to wait for a friend** (90) and **of party at the end** (8).
- **Frames per second** and **brightness**.

## Play

Type a name, pick **The computer** (and how hard) or **A friend**, and tap **New game**; a friend taps **Join the
game** on their phone. Tap a column (or the ▼ above it) on your turn. On the lights the disc falls into place; at the
end the four winning discs blink and the board turns into a party in the winner's colour.

Only one game at a time; while it is on, other phones see it and can start the next one when it ends. Between games
the matrix goes back to the show.

## Events

The page sends `new` (`mode`, `level`, `name`), `join` (`name`), `move` (`col` 0-6, `game`), `quit`.

## Left out of the original

Nothing of the game itself; in ShowPlay the board could also go on any side of the cube.

## Changes

- **Version 2:** after a disc was dropped, a status sent just before it could arrive late and unlock the arrows, so the player could try to drop a second disc (the app refused it, with a note). The phone now keeps the board locked until the app answers, and each move carries the move number it was made for, so a late or repeated move is refused.
