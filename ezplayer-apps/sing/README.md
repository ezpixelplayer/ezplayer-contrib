# Sing

Visitors record a song on their phone (up to 10 seconds), pick who sings it and send it. The recording plays on the
show's speakers through EZPlayer while the chosen one "sings" it:

| Who | How it sings |
|---|---|
| A **singing model** (a model with a face in xLights: pumpkins, trees, skulls, bulbs…) | it moves its mouth with the voice, with its outline and eyes on, and blinks now and then |
| A **prop** | it glows with the voice, brighter when it is louder, its colour turning slowly |
| A **matrix** | it shows a drawn face whose mouth opens with the voice |

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

**Phones only allow the microphone on a secure page**, so visitors must open the app through the show's cloud link
(https), not the home network address (http). The page says so when it is opened the other way.

The recording is mono, 16-bit, 11 kHz (about 22 KB a second). An event can hold 64 KB, so the phone sends it in parts
of 45 KB; the app puts them together, works out the mouth 20 times a second from the loudness and the kind of sound
(quiet = rest, hissy = E, louder = AI, loud and round = O) and plays it through EZPlayer's audio injection, starting
the lights when the sound is heard.

The singing models come from `xlights_rgbeffects.xml` in the show folder: faces of the "node range" type with mouth
shapes. When a model has several, the one that defines the most parts is used, with its own colours when it has them.

## Configure

- **The singing models of the show** on or off; **props** that glow (optional); **a matrix** with a drawn face
  (optional); **leave out** (model names, one a line).
- **Where the song plays**: EZPlayer's immediate bus (the show's speakers at once), its main bus (mixed with the show's
  music, heard by listeners too, about 0.8 s later) or this computer's own speaker. **Volume**.
- **Mouth timing**: more if the mouth moves before the voice.
- **Longest recording** (10 s), **each phone waits** (20 s), **most songs waiting** (6).

## Events

The page sends `sing` (`a`: `part`, `id`, `n`, `of`, `s`: who sings, `rate`, `d`: base64 PCM) and `cancel`.

## Left out of the original

Approval of recordings by the crew, and the cube side as a singer (any matrix can be one here).

## Changes

- **Version 2:** a group made of submodels lights only those submodels (before, it lit the whole models they belong to).

- **Version 3:** on the settings page, tapping a group or model on an empty line makes a whole prop line, with an icon and a name guessed from it; tapping more adds them to that prop, and **➕ New prop** starts the next one.
