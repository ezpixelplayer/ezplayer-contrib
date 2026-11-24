# Play the lights

Every model of the chosen props becomes a key on the phone, like a keyboard. One visitor plays at a time, for a turn of
30 seconds; the others wait in line. A tapped key flashes its model, a held key keeps it lit, several fingers play
several keys, and a finger slid across the keys plays them in turn. Let go and the model fades back to the show.

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

- **Props to play**: each model is one key (up to 48). Make a prop from a group (all the snowflakes) and each snowflake
  is its own key. **Order of the keys**: left to right as in the layout, or as listed.
- **How a key lights its model**: plain colours or one of the moving effects; **rainbow keyboard** (each key its own
  colour; the visitor can also pick one colour for all).
- **Seconds of a turn** (30), **the turn passes on** after 10 s without a tap, **most in line** (20).
- **A tap lights for** (0.5 s), **attack** and **release** (fade in / out).
- On a computer, the keys 1–0, Q–P, A–L and Z–M play the first 36 keys.

## Events

The page sends `play` with `a`: `join`, `leave`, `down` / `up` (`k`: the keys, `c`: the colour, optional) or `tap`.

## Left out of the original

Nothing. (In ShowPlay a key was only a tap, because of the relay's delay; here a key can be held.)
