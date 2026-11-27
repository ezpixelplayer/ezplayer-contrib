# ⏱️ Live countdown

A big countdown on a matrix of the show to a moment: midnight, Christmas, the couple's entrance, cutting the cake, the
show's finale. From a few minutes before, the matrix shows the time left; the last ten seconds are one huge number
that pulses; at zero there is a celebration (fireworks and a message scrolling), a fanfare, and if you like the words
said out loud and a machine (confetti, fog). Between times the show plays as usual. The visitors' page counts down
with the lights, to the second.

## What visitors do

They open the page and watch: the same countdown as the lights (the page uses the player's clock, so it matches the
matrix even when the phone's clock is wrong), the words under it ("to Christmas!"), the moment itself, and the
message at zero. There is nothing to type.

## The moment

- **A date and time**: on the clock of the player computer. With the date empty, the theme's own day, the next one
  (Christmas: 25 December; New Year: 1 January; Easter and Carnival are worked out each year; Thanksgiving is the
  fourth Thursday of November). Wedding, baptism and birthday have no day of their own: pick one. With the time empty,
  the theme's time (usually midnight).
- **Every day at the time**: for a show's finale each night. A celebration that runs past midnight finishes first.
- **Only when I press Start**: the settings page has **▶ Start**, **⏸ Stop** and **↺ Reset**. Start counts down the
  minutes set above it (10) from the moment it is pressed; Stop holds the time left (the lights go back to the
  show), Start goes on from there, Reset forgets it. Start also works in the other two ways: it goes first until it
  reaches zero or Reset. A show button can press Start: the app has the show input **start** (map it on the Apps card).

Dates are made with the computer's local calendar and the time left is counted in real milliseconds, so a change to
or from summer time between now and the moment does not move it by an hour. A restart of the app keeps a started
countdown, and an old Start/Stop/Reset is not done again.

## Settings

- **Matrix** (at least 17 x 5 pixels), frames per second (20), brightness.
- **Show the countdown on the lights from … minutes before** (10), or **all the time** (the show does not play on
  that matrix while it shows); **seconds of celebration** (30).
- **Words under the countdown** (empty: the theme's, e.g. "to Christmas!"): they scroll under the clock, or, on a
  matrix too low for both, take turns with the clock every 30 seconds.
- **The message at zero** (empty: the theme's greeting, e.g. "Merry Christmas!") and **the effect** (the theme's own,
  fireworks, colour bursts, rainbow, twinkling stars, plasma, ripples).
- **Colours**: the theme's (the clock in one, the words in another), or your own.
- **Say the last ten seconds out loud**: "10, 9 … 1" in the computer's voice, in the voice language and on the speakers
  of the "At zero" section. The numbers are made two minutes before as one sound, a number each second, started a
  moment early so they keep time with the lights. On Linux install espeak-ng.
- **At zero**: the shared ending of the ShowPlay games: a sound (the built-in fanfare by default, or your own WAV),
  where it plays (the show's speakers, the show's music, this computer, a Raspberry Pi), the words said out loud
  (`{winner}` is the message at zero), the words written across the lights once more, and a machine for a few
  seconds (web address, or DMX through EZPlayer, DDP, Art-Net or E1.31; see the fun README).

Settings are read while the countdown is not on the lights: a change made while it is showing counts after the
celebration.

## On the lights

H:MM:SS (or days and hours: `3d 04:12`), then M:SS, then the last ten seconds as one number as big as the matrix,
bright at the start of each second. A narrow matrix drops the seconds before the minutes (`1h23`). The digits use a
3 x 5 or a 5 x 7 font, scaled up by whole pixels to the biggest that fits. The matrix is only taken while the
countdown shows and during the celebration.

## How it is built

`game.mjs` (the moment, the drawing), `voice.mjs` (the spoken numbers), `theme.mjs` (the season: day, time, words,
colours, effect); `player.mjs`, `lights.mjs`, `ending.mjs`, `audio.mjs`, `machine.mjs` are the shared ShowPlay files.
`player.mjs` has the live-document hook (the app reads the private `timer` document twice a second) and lets show
inputs through (they have no phone). The status gives the phones `target` (the moment, in ms of the player's clock),
`paused`, `partyUntil`, `when`, `label`, `greeting`, `emoji`, `colour`, `colour2`.

The settings page is built like the others (`node _tools/build.mjs live-countdown`), then the Start / Stop / Reset
buttons are added by `node live-countdown/_src/timer_buttons.mjs` (each pack version: `node <its folder>/_src/timer_buttons.mjs`).
Without that step the page shows a plain box in their place and only the show input starts a countdown.

## Changes

- **Version 2:** 📊 statistics: each use by a visitor is reported to the host panel, which keeps them night by night (the most used apps of the night).

- **Version 1:** first version.
