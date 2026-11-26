# Advent calendar

24 doors on the visitors' page; one more opens every day from the first day (1 December by default). Each door
holds an effect or a message, and tapping an open door shows it on a matrix of the show, in turn. Doors not open yet
stay a surprise: the phones only learn what the open ones hold.

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

- **Matrix**: any model at least 8 x 5 pixels.
- **Month** and **first day** (December, 1) and **doors** (24).
- **Doors**: one a line, `fx: <effect>` or `text: <message>`; a missing or bad line gets the default for that door
  (door 24 says MERRY CHRISTMAS!).
- **Test day**: pretend it is that day, to check the calendar before December (0: off).
- **Seconds** a door shows (15) and **each phone waits** (20 s).
- **Frames per second** and **brightness**.

In January the calendar of the December before stays open, all doors.

## Events

The page sends `open` (`door`: 1 to 24).

## Left out of the original

Nothing.

## Changes

- **Version 3:** ready for the theme packs (New Year, wedding, baptism, Easter, Halloween, Thanksgiving): a `theme.mjs` next to the app (empty here, so this Christmas app looks and plays exactly as before) and the small pictures of `sprites.mjs`. The packs are made from this app by `_themes/make_pack.py`.

- **Version 2:** the longer word filter (Portuguese and English) for the doors' texts.
