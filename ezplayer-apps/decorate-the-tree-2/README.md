# Decorate the tree 2.0

Visitors decorate a tree of the show **anywhere they like**. On the phone they pick a decoration (bauble, candy cane,
star, bell, present, snowflake or heart), one of 8 colours, its effects and its size, then **drag it onto a drawing of
the tree**. While the finger moves, the decoration **blinks on the real tree** where they hold it, so they see exactly
where it will hang. They can place several (5 by default), move them again, take them off, then one button hangs them
all. A star on top, if you pick one, twinkles (visitors can change its colour), and visitors can change the tree's colour
too. When the tree is full: a rainbow party, then it starts again empty. The colours are corrected for LEDs (gamma and
colour balance), with a colour test on the settings page.

It installs next to **Decorate the tree** (the version with fixed spots), which is not changed.

## What changed from Decorate the tree

- **Free placement** instead of fixed spots: anywhere on the tree, as long as it is on the tree and not too close to
  another decoration (the phone says why when it is refused: "Not on the tree", "Too close to another decoration",
  "Too big for this place: try Small or another spot").
- **Drag and live preview**: while dragging, a blinking "ghost" of the decoration shows on the real tree (at most 3
  visitors at once by default; the others get "Someone else is placing: wait a moment" and can still place on the phone).
  The other phones see the ghosts too (a blinking dashed ring).
- **Sizes**: Small, Medium or Large (0.7, 1 and 1.5 times the base size), picked by the visitor (can be turned off).
- **Colours for LEDs**: gamma, dimming in linear light, R/G/B balance, and the 🎨 colour test (see below).
- **Small decorations stay colourful**: a decoration on fewer than about 12 pixels is lit as one solid patch of its
  colour, with no white shine or ribbon (those wash the colour out on a coarse mega tree); the size can go up to 200 %.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). Open the instance's settings page (the gear on the Apps tile) on the home network so the models
can be listed, pick the tree and Save. Settings are saved to the instance's private `settings` document.

## Use

1. **Pick** a decoration, its colour, size and effects in the tray at the top (the decoration is drawn big in its
   colour). Effects (up to 3, they take turns on the lights) fold away under the "✨" button.
2. **Drag** it from the tray onto the tree. Where you hold it, it blinks on the real tree. Let go anywhere on the tree.
3. It stays **placed** (dashed outline): drag it again to move it, tap ✕ or drag it off the tree to take it off, tap it to
   change it in the tray. Place more (up to 5 by default), then press **Hang them on the tree!** A decoration the app
   refuses stays placed with a red outline and the reason; the others are hung.

Tap the star or the tree to change its colour (and the star's effects). On a round tree the middle of the phone is the
front of the real tree; in the 360° view, ◀ ▶ (or a swipe) turns it.

## How it is built

- `app.mjs`: the tree: where each pixel is on the phone's drawing, the decorations, the ghosts, the star, the party, the
  colour test; `colour.mjs`: the colour pipeline; `multi.mjs`: the talking to the player (shared with the apps that light
  props: settings, events, one exclusive overlay lease per model while it is lit, status, saved state);
  `_src/`: the pages' sources (built with `_tools/build.mjs`; `_src/config.mjs` adds the front and colour-test controls
  to the settings page).

**From the phone to the tree.** The app asks EZPlayer for the real position of every pixel of the tree (overlay targets
with `detail=nodes`) and works out, once, where each pixel is on the phone's drawing (a round tree: the angle from the
front and the height; a tree drawn on a matrix: across and down the triangle; any other flat model: x and y). A point
the phone sends (`u` across, `v` down) goes to the nearest pixel on the drawing; the decoration's middle is that pixel's
real 3D position, and it is painted over the real pixels within its radius by real distance, with its shape (round trees:
along the surface, not mirrored). The radius at 100 % is what it would be with "Decorations on the tree" spread evenly
over it. Two decorations may not be closer than the sum of their radii times "Space between decorations".

The decorations are saved by their place on the phone's drawing (`{u, v, k, c, f, s}`: kind, colour, effects, size) in
the instance's private `state` document, so they survive a restart, and a change of layout (the front, the 180°/360°
view, the tree) puts them on the tree again where they were on the phones.

## Configure

- **Tree**: a mega tree, a matrix or any model with a grid. **On a matrix**: draw a tree on it (decorate only the
  triangle) or decorate the whole matrix.
- **The star on top** (optional, a model, a group or several), **its colour**, **effect**, the effects visitors can
  choose, **visitors may change it**, and **each phone waits** between star or tree colours.
- **Decorations on the tree** (30; 8 to 80): when there are this many, or no room is left for one more: the party.
- **Space between decorations** (100 %: they just do not overlap; less lets them touch).
- **Decorations visitors can hang**, **how many a visitor can place before hanging** (5), **effects** (3 at once).
- **Size of the decorations** (100 %; 50 to 200: bigger on a coarse tree, fewer fit), **visitors can choose the size**
  and **which sizes** (Small, Medium, Large).
- **Visitors placing at the same time** (3): ghosts on the tree at once.
- **Each phone waits** between decorations (60 s), **show the tree for** after each one (30 s), **all the time**.
- **The tree between the decorations**: lit dim in **the tree's colour**, or **off** (the most contrast);
  **visitors may change the tree's colour**.
- **🎨 Colours for the LEDs**: the colour test, **gamma** (2.2), **the tree's dim level** (6 % of light), **red, green,
  blue** (100 % each). See below.
- **A round mega tree (360°)**: see below.

## Colours and gamma

A phone's colours are **sRGB**: a screen applies a curve, so 128 looks like "half" and #ffc83c looks gold. LEDs are
**linear**: 128 gives half the light, which the eye sees as almost full. EZPlayer sends the app's bytes straight to the
controller (its API has only brightness and colour temperature, no gamma), so the first app sent phone colours as they
were: every mixed colour came out washed out (gold turned pale yellow-white, a pink went whitish), and the dim green
tree (5, 27, 10) showed cyan, because its small blue part is far too strong on a linear LED.

So every colour sent goes through `colour.mjs`:

1. sRGB → linear light: `(v / 255) ^ gamma` (gamma 2.2 by default; **1.0 = off**, for a controller or xLights output
   that already corrects). Gold #ffc83c becomes 255, 149, 11.
2. Dimming **in linear light**: the tree's dim level, fades, effects, white mixes multiply the light, so a dim colour
   stays the same colour. The dim level is in % of light: 6 % looks about like the old "17 %" did on the phone
   (#1e9e3c → 0, 5, 1: green, not cyan).
3. **Balance** per channel (R/G/B %): LEDs often look green or blue at full white; lower that channel.
4. × 255, rounded. The app's brightness setting multiplies the result (light again).

This applies to the decorations, the ghosts, the tree's colour, the star, the drawn trunk and star on a matrix, the
party and the stripes.

**The 🎨 colour test** (settings page): **Show the colour test** lights the tree for 2 minutes in bands, from the top:
**pure red, pure green, pure blue** (sent as they are, no gamma, no balance), the 8 decoration colours, white, a 50 %
grey and the tree's dim colour; the star (if any) goes red, green, blue, 2 s each. **If the red band is not red, the
model's colour order (RGB/GRB/BRG…) is wrong in xLights or the controller — fix it there, not here** (the same for the
star: a gold star that looks pink is usually a colour-order problem). Then change the gamma, the balance and the dim
level: while the test shows, the tree follows at once (the page writes them with the test in the live `calib`
document; the app uses them for the test only); **Save** keeps them.

## A round mega tree (360°)

On the phones, **the middle of the tree is the front of the real tree**, as the visitors see it: a decoration dropped on
the left of the phone lights up on their left. Set it once on the settings page, standing where the visitors stand:

1. **The front of the tree**: press **💡 Show the front on the tree**. A white stripe lights the tree from top to bottom
   (the rest goes dim) where the app takes the front to be. Turn it with **◀ 15°** and **15° ▶** until it faces the
   visitors (the street, the door). If ▶ moves it to the left as you look at the tree, press **⇄ Invert left and
   right** (a layout whose left and right are the other way round). Then **Save**. The stripe goes off by itself after
   2 minutes, or with ⏹.
2. **What the phones show of a round tree**:
   - **Only the front (180°)** (the default): decorations go only on the half the visitors see, and the phone shows that
     half. For a tree by a wall or a window, seen from one side.
   - **All the way round (360°)**: decorations all round the tree; on the phone, **◀ ▶** (or a swipe) turns the tree, with
     where you are on top (Front, Right side, Back, Left side…). For a tree in the middle of a garden or a square.
3. **360°: a thin gold stripe** (off by default): while a visitor turns the tree on the phone, a gold stripe shows for
   2 s where the middle of their drawing is, so they can find their side on the real tree.

Changing the front or the 180°/360° choice puts the decorations hung so far on the tree again, where they were on the
phones' drawing (a decoration on the back of the tree is kept but not shown in the 180° view). A matrix or a flat model is not changed by any of this.


## Events

The page sends `preview` (`u`, `v`, `k` the decoration, `c` its colour 1 to 8, `f` up to 3 effects, `s` the size 0 to 2) at
most 5 times a second while dragging, `hang` with `d`: a list of up to `maxDeco` decorations `[u, v, k, c, f, s]`,
`star` (`c`, `f`), `tree` (`c`) and `look` (`a`, 360° view). The statistics count decorations, star and tree colours
(not previews).

## Changes

- **Version 1:** first version: made from Decorate the tree 17 with free placement by dragging, the live preview on the
  real tree, sizes, and colours corrected for LEDs (gamma, balance, dim level in light, colour test).
