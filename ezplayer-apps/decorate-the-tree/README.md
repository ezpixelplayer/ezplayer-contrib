# Decorate the tree

Visitors hang baubles on a tree of the show: each phone picks a free spot and one of 8 colours. The tree shows every
bauble hung so far for a while after each new one (or all the time); when it is full, a rainbow party, then it starts
again empty.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). The player creates an instance and gives it a token. Open the instance's settings page (the
gear on the Apps tile) on the home network so the models can be listed, pick the model and Save. Settings are saved
to the instance's private `settings` document and re-read every few seconds.

## How it is built

A port of the feature in ShowPlay to the EZPlayer app runtime. Plain Node (22+), no dependencies.
- `game.mjs`: the rules and the drawing, with nothing about the player's API, so it can move to another way of talking
  to phones by changing only the other files;
- `lights.mjs`: the font, the colours and the effects shared by the ShowPlay apps that draw on a matrix;
- `player.mjs`: the part that talks to the player, the same in every ShowPlay app (settings, the matrix, the phones'
  events, the overlay lease while something is on the lights, released between, and the app's status);
- `main.mjs`: starts the two together; `page/` is the phones' page and `config/` the settings page.

The status carries `notices`: why a phone's last request was refused, keyed by its client id, so only that phone
shows it.

## Configure

- **Tree**: a mega tree, a matrix or any model with a grid. The app spreads the spots evenly over it.
- **Baubles** (30), **each phone waits** between baubles, **show the tree for** after each new one.
- **Show the decorated tree all the time** (off: the show's sequence plays between baubles).
- **When the tree is full**: a party on the lights, then it starts again.
- **The tree between the baubles**: green or off.
- **Frames per second** and **brightness**.

## Use

The phone shows the tree as a triangle with the spots on it; tap a free spot, pick a colour, and the bauble is on the
lights. A spot taken by someone else in the meantime is refused with a note.

## Events

The page sends `hang` (`i`: the spot, `c`: the colour 1 to 8).

## Left out of the original

Nothing. The baubles are kept in the instance's private `state` document, so they survive a restart of the app or
the player (while the number of spots stays the same).

## Changes

- **Version 2:** the Hang button stays off until the app answers (3 s at most), so a status arriving in between cannot let a phone send a second bauble.
