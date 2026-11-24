# Decorate the tree

Visitors hang baubles on a tree of the show: each phone picks a free spot and one of 8 colours. The spots are placed by
where the tree's pixels really are in the layout, so on a 360° mega tree they go all the way round it and the baubles
come out round, and on a matrix they are spread over it. The tree shows every bauble hung so far for a while after each
new one (or all the time). A star on top, if you pick one, twinkles gold, shines at each new bauble and joins the
party. When the tree is full: a rainbow party, then it starts again empty.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). The player creates an instance and gives it a token. Open the instance's settings page (the
gear on the Apps tile) on the home network so the models can be listed, pick the model and Save. Settings are saved
to the instance's private `settings` document and re-read every few seconds.

## How it is built

A port of the feature in ShowPlay to the EZPlayer app runtime. Plain Node (22+), no dependencies.
- `app.mjs`: the tree: where the spots go, the baubles, the star and the party;
- `multi.mjs`: the part that talks to the player, shared with the apps that light props: settings, the phones' events,
  one overlay lease per model while it is lit (the tree and the star), closed between, and the app's status;
- `main.mjs` starts the two together; `page/` is the phones' page and `config/` the settings page.

**Where the spots go.** The app asks EZPlayer for the position of every pixel of the tree (overlay targets with
`detail=nodes`) and spreads the spots evenly by the real distances between pixels (farthest-point), leaving out the
bottom 5 % of the height and the top 10 % (a fifth on a round tree, where the strands meet and a bauble would be a ring
round the whole top). Each pixel near a spot belongs to its bauble. The tree is lit with one colour per pixel (`nodes`
lease). On the phone a round tree is drawn unrolled: across is the angle round the trunk. When the player gives no
positions for the model, the app uses its grid instead (`grid` lease), as before.

## Configure

- **Tree**: a mega tree, a matrix or any model with a grid.
- **The star on top** (optional): the star's model; the list of the show's models under it puts a name in the box.
- **Size of the baubles** (100 %).
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

- **Version 3:** the spots are placed by the real positions of the tree's pixels, so a 360° mega tree is decorated
  all the way round with round baubles (before, the tree's grid was treated as a flat matrix, and a bauble could cover
  many strands). An optional star on top. Bauble size setting. Fixed: the countdown before the next bauble could
  freeze the phone's page (it drew itself in a loop).
