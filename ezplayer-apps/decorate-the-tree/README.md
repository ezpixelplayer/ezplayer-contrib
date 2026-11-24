# Decorate the tree

Visitors decorate a tree of the show: each phone picks a free spot, a decoration (bauble, candy cane, star, bell,
present, snowflake or heart) and one of 8 colours. The spots are placed by
where the tree's pixels really are in the layout, so on a 360° mega tree they go all the way round it and the baubles
come out round, and on a matrix they are spread over it. The tree shows every bauble hung so far for a while after each
new one (or all the time). A star on top, if you pick one, twinkles (gold, or the colour a visitor picked by tapping it on the
phone), shines at each new decoration and joins the party. When the tree is full: a rainbow party, then it starts again empty.

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
- **On a matrix**: draw a tree on it (a green triangle, a brown trunk and a star on top, which visitors can colour
  like a star model) and decorate only the triangle, or decorate the whole matrix.
- **The star on top** (optional): the star's model, a group of the show (all its models are lit as the star), or
  several separated by commas; the list of the show's models and groups under it puts a name in the box.
  **The star's colour** (gold), **visitors may change it** (tap the star on the phone, pick a colour) and **each phone
  waits** between star colours (30 s). After the party the star goes back to its colour.
- **The star's effect** (twinkle) and **the star's effects visitors can choose**: twinkle, steady, blink, pulse, spin
  (a bright band turning round the star), sparkle (white glints), rainbow.
- **Decorations visitors can hang**: bauble, candy cane, star, bell, present, snowflake, heart (all by default).
- **Effects visitors can choose for their decoration**: glow (a slow shimmer), steady, blink, twinkle (each pixel on
  its own), pulse, rainbow (the colours turn). Nothing flashes faster than about 3 times a second.
- **Size of the decorations** (100 %).
- **Baubles** (30), **each phone waits** between baubles, **show the tree for** after each new one.
- **Show the decorated tree all the time** (off: the show's sequence plays between baubles).
- **When the tree is full**: a party on the lights, then it starts again.
- **The tree between the baubles**: green or off.
- **Frames per second** and **brightness**.

## Use

The phone shows the tree as a triangle with the spots on it; tap a free spot, pick a decoration and a colour, and it is
on the lights, with the effect picked (glow, steady, blink, twinkle, pulse or rainbow). A spot taken by someone else in
the meantime is refused with a note. Tap the star to change its colour and effect.

On the lights each decoration is drawn in its spot: a candy cane with red and white stripes, a present with a gold
ribbon and bow (white on a gold present), a bell with its clapper, a five-pointed star, a six-armed snowflake, a heart,
a bauble with a shine. On a matrix the shapes read well; on a mega tree a decoration is a handful of pixels, so a
spot too small for its shape keeps what tells it apart (a cane's stripes, a present's ribbon).

## Events

The page sends `hang` (`i`: the spot, `c`: the colour 1 to 8, `k`: the decoration, `f`: its effect) and `star` (`c`:
the colour, `f`: the effect).

## Left out of the original

Nothing. The decorations, their effects and the star's colour and effect are kept in the instance's private `state` document, so they survive a restart of the app or
the player (while the number of spots stays the same).

## Changes

- **Version 2:** the Hang button stays off until the app answers (3 s at most), so a status arriving in between cannot let a phone send a second bauble.

- **Version 3:** the spots are placed by the real positions of the tree's pixels, so a 360° mega tree is decorated
  all the way round with round baubles (before, the tree's grid was treated as a flat matrix, and a bauble could cover
  many strands). An optional star on top. Bauble size setting. Fixed: the countdown before the next bauble could
  freeze the phone's page (it drew itself in a loop).

- **Version 4:** a choice of decorations (bauble, candy cane, star, bell, present, snowflake, heart), drawn as shapes on
  the lights and on the phone; visitors can change the star's colour; the star's own colour is a setting.

- **Version 5:** effects: each decoration can glow, stay steady, blink, twinkle, pulse or turn rainbow; the star can
  twinkle, stay steady, blink, pulse, spin, sparkle or turn rainbow, chosen by the visitor who taps it.

- **Version 6:** the star can be a group of the show (for example "All Stars") or several models; before, only a single
  model worked, and with a group the star could not be changed from the phones.

- **Version 7:** a group made of submodels (for example the stars of two Baby Grand Illusions) lights only those submodels, not the whole models.

- **Version 8:** on a matrix the app draws a tree (triangle, trunk and star) and hangs the decorations on it, sized by
  the real distances so a wide matrix still gets a tree of tree shape, with no more decorations than fit. A flat model
  turned at an angle in the 3D layout (for example a matrix at 45°) is now seen as flat; before, it was taken for a round
  mega tree and its decorations were scattered.
