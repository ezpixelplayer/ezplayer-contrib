# Props of the show

Visitors light up real models of the show, such as a pair of wings, the bats or a row of arches, from their phone.
They pick a prop, one of 12 effects, a palette or their own colours, and a speed; a preview on the phone plays the
effect on a pair of wings. The effect plays on top of the sequence, and when it ends the models go back to the show.

## Install

In the player (EZPlayer 0.7 or later), open the Apps tile and install from the contrib repository, or point it at
this folder (the one holding `ezapp.json`). The player creates an instance and gives it a token. Open the instance's
settings page (the gear on the Apps tile) on the home network, so the models can be listed, and Save. Settings are
saved to the instance's private `settings` document and re-read every few seconds.

## How it is built

A port of the feature in ShowPlay to the EZPlayer app runtime. Plain Node (22+), no dependencies.
- `app.mjs`: the feature itself;
- `models.mjs`: props from the settings lines, where each pixel of a model is (EZPlayer's overlay targets with
  `detail=nodes`), the 12 prop effects and 11 palettes of ShowPlay, and the show's groups (read from
  `xlights_rgbeffects.xml` in the show folder);
- `multi.mjs`: the part that talks to the player, the same in every ShowPlay app that lights props: settings, the
  phones' events, one overlay lease per model while it is lit (closed as soon as it is free, so the model goes back
  to the sequence), and the app's status, with `notices` for the phone a refusal is meant for;
- `main.mjs` starts the two together; `page/` is the phones' page and `config/` the settings page.

Props are written one a line, `icon name | models or groups, separated by commas | across`. The settings page lists
the show's models and groups (👥) under the box; tapping one adds it where the cursor is. A group adds all its models.
Pixel models get a `nodes` lease, matrices and trees a `grid` lease.

## Configure

- **Props** (up to 12, 64 models each). Without `across` each model does the same, which suits a pair of wings; with
  it, one effect runs over all the models together, which suits a row of arches. A model whose name ends in Left / Right
  (or L / R) is a wing: the effects start from its body and the pair mirrors.
- **Effects** and **palettes** offered, and **my colours** (1 to 3 of 9 colours).
- **Seconds of each request** (20), **each phone waits** (20 s).
- **A request for a busy prop waits its turn** (off: it replaces the one showing) and **most waiting for one prop** (5).
- **Frames per second** and **brightness**.

| Effect | What it does |
|---|---|
| Flap | bands move out from the body while the whole wing beats |
| Colour wave | the palette flows out from the body |
| Rising | the palette climbs from bottom to top |
| Spin | the palette turns around the middle, mirrored on a pair |
| Breathe | the whole prop brightens and dims |
| Sparkle / Confetti | random pixels flash / pop in palette colours |
| Fire | flames rise from the bottom |
| Ripples | rings spread from the middle |
| Chase / Comet | segments / a head with a tail run along the wiring |
| Colours | the palette spread over the prop, drifting slowly |

## Events

The page sends `prop` (`i`: the prop, `fx`, `pal`: a palette or `mine`, `mine`: up to 3 colour numbers, `speed`: 0 slow,
1 normal, 2 fast).

## Left out of the original

Approval of requests by the crew (ShowPlay's control page). DMX lights cannot be props (as in ShowPlay).

## Changes

- **Version 2:** a group made of submodels lights only those submodels (before, it lit the whole models they belong to).

- **Version 3:** on the settings page, tapping a group or model on an empty line makes a whole prop line, with an icon and a name guessed from it, which you can change; tapping more adds them to that prop, and **➕ New prop** starts the next one. A new instance starts with no props (the example Wings and Arches are gone).
