# Photo in pixels

Visitors take a selfie (or pick a photo) on their phone and see it on a matrix of the show **in pixels**, in a frame
of the season, after a "3, 2, 1, flash!". One photo after another; in between, the show plays.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). Open the instance's settings page (the gear on the Apps tile) on the home network so the
models can be listed, pick the matrix and Save.

## On the phone

1. **📸 Take a selfie** (opens the front camera) or **🖼️ Pick a photo** from the phone.
2. The phone cuts the photo to the matrix's shape and shows it **as the lights will**: big round dots.
   **Zoom in on your face** with the slider, **Mirror** it, pick a **frame** and a **look**.
3. **Show it on the lights!** The phone says when it is next, and when it is on.

## Privacy

- The camera picture **never leaves the phone**: the phone shrinks it to the squares the matrix has (at most 40 a
  side, e.g. 26 x 26 on a 32 x 32 matrix) and sends only those few hundred coloured squares.
- **Nothing is saved**: the app keeps a photo in memory while it waits and while it is on the lights, then forgets it.
- Photos of people are shown in public: put up a small sign, and switch the app off when you are not there.

## Configure

- **Matrix**: any model at least 8 x 8; 32 x 32 or bigger shows faces best.
- **Frames**: Snowflakes, Hearts, Stars, Santa, Rainbow (a theme pack has its own), and whether visitors may pick
  **no frame** (then the photo goes to the edges).
- **Looks**: Natural colours (a little brighter and more colourful, as LEDs look pale), Pop art (few, bright colours),
  Black and white, Old photo (warm).
- **"3, 2, 1" and a flash** before each photo (on), **seconds a photo stays** (12), **each phone waits** before
  another photo (60 s), **most photos waiting** (6), frames per second and brightness.

## How it is built

Plain Node (22+), no dependencies, like the other ShowPlay apps: `game.mjs` (the photos, the frames, the drawing),
`player.mjs` (the talking to the player: settings, the matrix, the phones' events, the overlay lease only while a
photo is on), `main.mjs` (starts the two). The frames are the same as fun's photo frame.

## Changes

- **Version 4:** 📊 statistics: each use by a visitor is reported to the host panel, which keeps them night by night (the most used apps of the night).

- **Version 3:** bug fixes: no request to EZPlayer can freeze the game any more (each has a time limit, and the lease is opened again when frames are refused), and an error in one frame starts the game again instead of stopping the app; the word filter no longer blocks normal sentences ("as", "às", "kkkkk", "Nigeria"…) and catches "f*ck", "sh|t", "fu ck"; a photo that is too big is refused before it is read. The overlay leases stay exclusive (PR #21).

- **Version 2:** the overlay leases are **exclusive**, with the app token, like the other apps (PR #21); without it EZPlayer refused them ("overlay: mode must be 'exclusive' or 'layer'").

- **Version 1:** the first version.
