# Rhythm on the lights

A rhythm game on a matrix of the show. Notes fall down 4 coloured lanes (red, green, gold and blue at Christmas; a theme pack has its own) to the beat of a
song, and visitors tap the matching pad on their phone when a note reaches the line near the bottom. Up to 4 phones
play the same song at once. The app makes its own music (drums, a bass and a tune that plays exactly on the notes), so
no files are needed.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). Open the instance's settings page (the gear on the Apps tile) on the home network, pick the
matrix and Save. Settings are re-read between games.

## Play

Type a name, pick **🎵 Alone** or **👥 With friends** and tap **New song**. With friends, the others open the page and
tap **Join the game** while the lobby is open (15 s by default); anyone in the game can tap **Start now**, and the song
starts by itself when the lobby is full or its time is up.

The music starts with two bars of drums (no notes), then the notes fall. Tap a lane's pad (or D F J K on a keyboard)
when its note reaches the line:
- **Perfect** (within 70 ms): 3 points;
- **Good** (within 140 ms): 1 point;
- a **run** of notes hit in a row adds a bonus to each hit: +1 from 8 in a row, +2 from 16, up to +4. A missed note
  starts the run again.

The phone shows the falling notes, the pads, every player's score live, and at the end how many perfect and good hits
you had and your best run. The matrix shows the same notes, the line pulsing on the beat, and a flash on a lane when any
player hits it. The highest score wins; alone, the song ends with your score (and 🏆 when it is the best of the day).
The 5 best scores of the day are shown on the phones and kept across restarts.

## How it works

The taps are judged **on the phone**: the delay through the network (and the cloud) would ruin the timing. When the
song starts, the status carries the chart (`notes`: `[ms after the start, lane]`) and the start time `t0` on the player
computer's clock; the phone keeps its clock in step with the player's (from the time on each status, keeping the least
delayed of the last 20 s), draws the notes and judges each tap against the nearest note in that lane. It sends what it
hit every 300 ms: `{ type: 'hits', h: [[note, deltaMs, lane], ...] }` (at most 32 in a batch).

The app checks every hit before counting it: the note exists, the lane matches, it was not counted before for that
phone, it is at most 140 ms off, and it arrives no sooner than 1 s before the note's time and no later than 3 s after.
A forged, repeated or late hit is simply not counted.

The chart is made from the beat with a seed (a new one each game): notes on beats and half-beats, more of them on the
kick and snare, never the same lane twice too quickly. A note's lane is also its pitch (lane 1 the lowest note of the
bar's chord, lane 4 the highest), so the tune walks across the lanes.

The start time follows the sound: the app gives the song to EZPlayer (or the Raspberry Pi, or this computer) and starts
the chart when it says the sound will be heard. If the sound has not started within 8 s, or cannot play, the song goes
on with the lights only.

- `song.mjs`: the chart and the music (seeded; the same seed gives the same song);
- `game.mjs`: the rules, the checks, the scores and the drawing; `theme.mjs`: the season (lane colours, title, greeting);
- `player.mjs`, `lights.mjs`, `ending.mjs`, `audio.mjs`, `machine.mjs`: the parts shared by every ShowPlay game.

## Configure

- **Matrix**: any model at least 8 x 8 pixels (each lane is a quarter of its width; a tall matrix gives the notes
  more room to fall).
- **The song**: the speed of the beat (slow 90, medium 110, fast 130 beats a minute), the difficulty (easy: notes on
  the beat only and falling slowly; hard: many notes, half-beats, two lanes at once now and then), the length (30 to
  120 s, 60 by default), players on the same song (1 to 4), seconds friends have to join (15), seconds of result (6).
- **🔊 The music**:
  - **Made by the app** (default), **my own WAV file**, or **no sound** (the line pulses on the beat: a click track on
    the lights only);
  - volume, and **where it plays**: the show's speakers through EZPlayer (at once, or mixed with the show's music),
    this computer's speaker, or a Raspberry Pi running the ShowPlay speaker (`pi-speaker/`: its address and key);
  - **sound delay** (ms): if the notes reach the line before the beat is heard, make it bigger (it moves the chart
    later; a negative number moves it earlier);
  - **my own WAV**: a plain 8- or 16-bit WAV on the player computer, **its speed** (beats a minute) and **where its first
    beat is** (ms). The notes follow that beat, so the speed must be right. The song lasts as long as the setting, or the
    file if shorter (at least 10 s). A file that cannot be read: the app's own music is played instead.
- **Frames per second** and **brightness**.

## When someone wins or loses

The shared section **🎉 When someone wins or loses** (all off by default): a sound, the words said out loud and/or
written across the lights, and a machine for a few seconds; see the pong README for each part. **In this game:** a win
is the top player of a song with friends, or a new best of the day alone (the "record" words); a song played alone
with no record is a "loss" (the words "Song over: {score} points."). The words can use `{winner}`, `{colour}`,
`{score}` and `{greeting}` (the season's greeting: "Merry Christmas!" here, the pack's own in a theme pack). A song
nobody scored in, or that everyone left, does nothing.

## Events

The page sends `new` (`mode`: `solo` or `group`, `name`), `join` (`name`), `start` (start the lobby now), `hits`
(`h`: `[[note, deltaMs, lane], ...]`, every 300 ms while there is something to send) and `quit`. The manifest asks for
1500 events a minute and 8 a second per phone (4 phones send about 3 a second each).

## Good to know

- The music is made when the song starts (well under a second for 2 minutes) and played as one sound; a song that
  ends early (everyone left) is not cut off on the speakers.
- On this computer's speaker (no EZPlayer audio), the start of the sound is a guess: set the sound delay if needed.

## Changes

- **Version 1:** first version.
