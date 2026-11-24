# Messages on the lights

Visitors send a message (their own words or one you wrote), an effect of the season, or a drawing of their own, and
each is shown on a matrix of the show in turn. Between requests the matrix goes back to the show.

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
- **Effects of**: Christmas, Halloween or other celebrations (17 effects in all, the ones of ShowPlay).
- **Messages**, **Pictures**, **Effects**, **Drawings**: which tabs the phones see.
- **Pictures of every theme** (off: only the pictures of the theme above).
- **Visitors may write their own message**: on, with a word filter; off, they only pick from **Messages to pick
  from** (one a line, up to 40 letters).
- **Seconds** for a message (at least one full scroll), an effect and a drawing (15 each), and a picture (10).
- **Each phone waits** (20 s) and **most requests waiting** (10).
- **Frames per second** and **brightness**.

## Use

The phone picks a tab: **Message** (type or tap a ready message, pick a colour), **Picture** (one of 73 animated
GIFs: 29 for Halloween, 27 for Christmas, 17 for other celebrations), **Effect** (tap one) or **Draw** (paint
on a small grid with 9 colours, at most 32 x 32, stretched to the matrix). **Show it on the lights!** puts it in line;
the page says when it is next and when it is on.

## Events

The page sends `text` (`text`, `color`), `gif` (`f`: a file name from `page/gifs/pack.json`), `fx` (`fx`), `draw` (`w`, `h`, `px`: one digit 0 to 8 a pixel).

## Pictures

The GIFs are the ones of the ShowPlay page, in `page/gifs/` with their list `pack.json` (name, theme, file), so the
phones load the thumbnails from the app's own page. The app reads the same files with `gif.mjs`, a small GIF reader
(animation, transparency, frame disposal; checked against Pillow on all 73 files), and shows the picture as big as fits
on the matrix, keeping its shape, in the middle, looping. A GIF added to the folder and to `pack.json` appears too.

## Left out of the original

Picking up to 3 pictures in a row (ShowPlay's page could queue three at once); here it is one at a time.

## Changes

- **Version 2:** the **Picture** tab: the 73 animated GIFs of the ShowPlay page, filtered by the theme.
