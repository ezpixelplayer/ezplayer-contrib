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
- **Decorations a visitor can hang at once** (5; from 1 to 10): the visitor taps several spots, each with its own
  decoration, colour and effects, then presses one button and they all appear together.
- **Effects a visitor can pick** (3; from 1 to 6), for a decoration and for the star. Several effects take turns on
  the lights (2.5 s each), so each one is seen clearly.
- **Effects visitors can choose for their decoration**, each clearly different: glow (breathes slowly from dim to
  bright), steady (always on), blink (fully on, fully off), twinkle (white sparkles pixel by pixel), pulse (a heartbeat:
  two quick beats, dark between), rainbow (runs through the colours). Nothing flashes faster than about 3 times a second.
- **Size of the decorations** (100 %).
- **Baubles** (30), **each phone waits** between baubles, **show the tree for** after each new one.
- **Show the decorated tree all the time** (off: the show's sequence plays between baubles).
- **When the tree is full**: a party on the lights, then it starts again.
- **The tree between the baubles**: lit dim in **the tree's colour** (green by default), or off. **Visitors may change
  the tree's colour** (on): they tap the tree on the phone and pick one of 8 colours.
- **Frames per second** and **brightness**.

## Use

The phone shows the tree as a triangle with the spots on it. Tap a free spot and pick its decoration, colour and
effects (up to 3, for example rainbow and blink; Steady goes alone); tap more spots for more decorations (up to 5 by
default), each with its own choices. The one with the white ring is the one being changed: tap another chosen one to
change it, or tap it twice to take it off. Then **Show it on the tree!** hangs them all at once. A spot taken by
someone else in the meantime is skipped with a note, and the others are hung. Tap the star to change its colour and effects (also up to 3 mixed, for example spin and sparkle).

On the lights each decoration is drawn in its spot: a candy cane with red and white stripes, a present with a gold
ribbon and bow (white on a gold present), a bell with its clapper, a five-pointed star, a six-armed snowflake, a heart,
a bauble with a shine. On a matrix the shapes read well; on a mega tree a decoration is a handful of pixels, so a
spot too small for its shape keeps what tells it apart (a cane's stripes, a present's ribbon).

## Events

The page sends `hang` with `d`: a list of up to `maxDeco` decorations, each `[spot, colour 1 to 8, decoration, effects]`
(the older single form `i`, `c`, `k`, `f` still works), and `star`
(`c`: the colour, `f`: an effect or a list of up to 3).

## Left out of the original

Nothing. The decorations, their effects and the star's colour and effect are kept in the instance's private `state` document, so they survive a restart of the app or
the player (while the number of spots stays the same).

## A round mega tree (360°)

On the phones, **the middle of the tree is the front of the real tree**, as the visitors see it: a decoration tapped on
the left of the phone lights up on their left. Set it once on the settings page, standing where the visitors stand:

1. **The front of the tree**: press **💡 Show the front on the tree**. A white stripe lights the tree from top to bottom
   (the rest goes dim) where the app takes the front to be. Turn it with **◀ 15°** and **15° ▶** until it faces the
   visitors (the street, the door). If ▶ moves it to the left as you look at the tree, press **⇄ Invert left and
   right** (a layout whose left and right are the other way round). Then **Save**. The stripe goes off by itself after
   2 minutes, or with ⏹.
2. **What the phones show of a round tree**:
   - **Only the front (180°)** (the default): the spots are only on the half the visitors see, and the phone shows that
     half. For a tree by a wall or a window, seen from one side.
   - **All the way round (360°)**: spots all round the tree; on the phone, **◀ ▶** (or a swipe) turns the tree, with
     where you are on top (Front, Right side, Back, Left side…). For a tree in the middle of a garden or a square.
3. **360°: a thin gold stripe** (off by default): while a visitor turns the tree on the phone, a gold stripe shows for
   2 s where the middle of their drawing is, so they can find their side on the real tree.

Changing the front or the 180°/360° choice places the spots again (the decorations hung so far stay on the same spot
numbers). A matrix or a flat model is not changed by any of this.

## Changes

- **Version 16:** a round mega tree: the middle of the phone is the front of the real tree, with the visitors' left and right (the spots were turned a quarter round and mirrored); the front is set on the settings page while a white stripe shows it on the tree; the phones show only the front half (180°) or the whole tree with ◀ ▶ to turn it (360°), with an optional gold stripe where a visitor is looking; decorations are no longer mirrored on a round tree.

- **Version 15:** bug fixes: no request to EZPlayer can freeze the tree any more (each has a time limit, and the lease is opened again when frames are refused), and an error in one frame starts the game again instead of stopping the app; the decorations are never overwritten with empty ones when the show is still loading, and setting up is tried again. The overlay leases stay exclusive (PR #21).

- **Version 14:** the overlay leases are **exclusive** again, with the app token (as PR #21 made them; a later upload
  had undone it, giving "Could not light …: overlay: mode must be 'exclusive' or 'layer'"). A model another app is
  using is refused with that app's name.

- **Version 13:** ready for the theme packs (New Year, wedding, baptism, Easter, Halloween, Thanksgiving): a `theme.mjs` next to the app (empty here, so this Christmas app looks and plays exactly as before) and the small pictures of `sprites.mjs`. The packs are made from this app by `_themes/make_pack.py`.

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

- **Version 9:** up to 3 effects together, on a decoration and on the star (for example rainbow and blink, or spin and
  sparkle): their brightness multiplies, the glints add up and rainbow gives the colours. Tapping an effect on the phone
  adds it or takes it away.

- **Version 10:** a setting for how many effects a visitor can mix at once (1 to 6, 3 by default).

- **Version 11:** several decorations at once: tap several spots (up to **Decorations a visitor can hang at once**, 5
  by default), each with its own decoration, colour and effects, then one button hangs them all. The effects are now
  clearly different on the lights (blink fully off, pulse as a heartbeat, twinkle with white sparkles, glow breathing
  slowly), and several effects on one decoration or on the star take turns instead of multiplying (which made them
  look alike).

- **Version 12:** the tree's own colour: a setting for the colour the tree is lit in between the decorations (green by
  default; dim), and visitors can tap the tree on the phone to pick its colour (green, red, blue, white, gold, pink,
  purple, ice blue), waiting between changes like for the star. After the party it goes back to the settings' colour.
