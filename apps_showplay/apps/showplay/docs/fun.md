# ShowPlay — Fun extras (v24)

Eight extras for visitors, all on the **🎁 Fun** tab of the visitors' page, set up on their own settings page:
**http://\<bridge-ip\>:8099/fun** (or **🎁 Fun** at the top of the control page).

An extra appears on the visitors' page when it is switched on **and ready** (the settings page shows "✔ on the
visitors' page", or what is missing). When more than one is on, the visitor picks one at the top of the tab.

## Contents

- [The eight extras](#the-eight-extras)
- [Photo frame](#-photo-frame) · [Wheel of fortune](#-wheel-of-fortune) · [Pick an animal](#-pick-an-animal) · [Paint by numbers](#-paint-by-numbers)
- [Ring the bell](#-ring-the-bell) · [Snow on request](#-snow-on-request) · [Treasure hunt](#-treasure-hunt) · [Guess the song](#-guess-the-song)
- [Messages and ntfy.sh](#messages-and-ntfysh)
- [Settings](#settings)
- [Troubleshooting](#troubleshooting)

## The eight extras

| Extra | Where it plays | Needs |
| --- | --- | --- |
| 📸 Photo frame | The cube, in turn | The cube's sides |
| 🎰 Wheel of fortune | The cube, in turn | The cube's sides |
| 🐾 Pick an animal | The cube, in turn | The cube's sides |
| 🖍️ Paint by numbers | The cube, in turn | The cube's sides |
| 🔔 Ring the bell | Speaker + the cube or a prop | A speaker on the bridge computer |
| 🌨️ Snow on request | A snow or bubble machine (+ the cube) | A relay or smart plug with a web address |
| 🔦 Treasure hunt | Phones; the cube or a prop for right answers | At least one clue |
| 🎶 Guess the song | Speaker + the cube; phones answer | 4 or more WAV songs in the `songs` folder, and the cube's sides |

The first four go into the normal queue, like a message or an effect: they wait their turn, follow the time limits,
and wait for approval when approval is on. Every extra has **Each phone waits**, so one phone cannot ask again and
again (it is told how many seconds to wait).

## 📸 Photo frame

The visitor picks a frame (Snowflakes, Hearts, Stars, Santa, Rainbow) and presses **Take a photo**. On the cube (all
sides, or the side picked at the top of the page): the frame with a big **3, 2, 1**, a white **flash**, then the frame
holds for the photo.

Settings: which frames to offer, how long the frame holds (8 s by default), and the wait between photos.

## 🎰 Wheel of fortune

The visitor presses **Spin**. The phone shows the wheel; on the cube a wheel spins for 5 seconds, slows down and stops
on a slice (the pointer is at the top), the slice blinks, then its surprise plays:

| Slice | Surprise |
| --- | --- |
| ✨ Effect | That effect |
| 💬 Message | That message scrolls (up to 30 letters, word filter) |
| 🎨 Colour | The cube glows in that colour |
| 🔁 Spin again | "SPIN AGAIN!" |

2 to 12 slices, all equally likely; the bridge picks the slice, so a phone cannot choose it. Settings: the slices, how
long the surprise lasts (12 s by default) and the wait between spins.

## 🐾 Pick an animal

Penguin, reindeer, snowman, polar bear or robin, as little pixel animals on a snowy night. The animal walks across
the sides one after another (all sides, or only the side picked) and does a little hop half way across the last one.
Settings: which animals, the seconds to cross one side (6 by default), the wait.

The animals are 12 pixels tall, scaled up on bigger sides (×2 from 32 pixels tall).

## 🖍️ Paint by numbers

Six drawings: tree, star, snowman, present, bauble, bell. Each area shows the number of the colour we suggest; the
visitor picks any of the 8 colours and taps the areas, then presses **Show it on the lights**. On the cube each area
fills in turn, then the picture holds (15 s by default).

The drawing is made at the size of the side picked; with **All sides**, all sides must be the same size (otherwise
the phone is asked to pick one side).

## 🔔 Ring the bell

A big bell on the phone. A tap rings a bell on the bridge computer's speaker and flashes **the cube** (gold), **a
prop** (sparkle) or **nothing**. The bell is made by the bridge, or put your own `bell.wav` next to
`showplay_bridge.py`. Settings: what flashes, the volume (80 %), the wait between rings (10 s). **Ring it now** tries
it.

The sound comes out of the same speaker as Sing (see INSTALL.md → Sing for the Raspberry Pi's sound output).

## 🌨️ Snow on request

The bridge opens a web address to switch the machine on, waits, and opens another to switch it off. That works with
most smart relays and plugs on the home network, for example:

| Device | Switch on | Switch off |
| --- | --- | --- |
| Shelly (Gen 1) | `http://192.168.1.50/relay/0?turn=on` | `http://192.168.1.50/relay/0?turn=off` |
| Tasmota | `http://192.168.1.50/cm?cmnd=Power%20On` | `http://192.168.1.50/cm?cmnd=Power%20Off` |
| ESP32 with your own sketch | whatever address your sketch answers | |

Settings: how long it runs (10 s), the rest between two runs (120 s, shared by all phones), at most N runs a night
(a night runs from noon to noon), the hours it may run (17 h to 23 h by default) and **falling snow on the cube**
while it snows. **Test for 3 s** tries it from the settings page.

The phone shows when the machine is resting, out of hours or done for the night.

**Safety:** keep the machine's power and water away from people and cables, and check the device's own limits.

## 🔦 Treasure hunt

Up to 10 clues. The answer to each is **a word** (letters only count: "Stár!" matches "star"), **a number**, or **a
prop of the show** (the visitor taps it among the show's props). The phone shows one clue at a time (**Clues one after
another**) and remembers which ones were solved.

On the lights: a right answer to a prop clue lights that prop (confetti); other right answers play a short effect on
the cube; after the last clue, **fireworks** on every side. A wrong answer only shows on the phone. Each phone can
answer once every 3 seconds.

Changing the clues starts every phone's hunt again.

## 🎶 Guess the song

Put **4 or more WAV files** in a folder called `songs` next to `showplay_bridge.py`. The file name is the title shown
to visitors (`Jingle Bells.wav` → "Jingle Bells"). 8- or 16-bit, mono or stereo; MP3 is not read (convert with
Audacity or any converter).

A round:
1. A visitor presses **Start a round**; others have 15 seconds to **Join** (up to 8 players).
2. For each song: a few seconds (6 s by default, from about a third into the song) play on the speaker while the
   cube's bars move to it; the phones show 4 titles. 100 points for a right answer, plus up to 60 for answering fast.
3. The right title shows on the phones and scrolls on the cube.
4. After 5 songs (by default): the places on each phone, and the winner's points on the cube.

Settings: clip length, songs a round, time to answer, volume. **Look for songs again** after adding files.

**Music rights:** playing music in public can need permission. Use songs you are allowed to play.

## Messages and ntfy.sh

| What | Messages |
| --- | --- |
| Photo, wheel, animal, paint, bell, snow | 1 from the phone, and usually 1 from the bridge (a note for that phone) |
| A hunt answer | 1 from the phone, 1 from the bridge |
| Guess the song, a round of 5 songs for 4 players | about 20 from the phones and about 15 from the bridge |

The bridge posts the Fun tab's state on `<code>-fun`, only when something changes (about 1 KB).

## Settings

In `showplay_config.json`, under `fun`:

| Setting | What it holds |
| --- | --- |
| `photo` | `on`, `frames`, `hold`, `every` |
| `wheel` | `on`, `slices` (`{"k": "fx" / "text" / "colour" / "again", "v": …}`), `result`, `every` |
| `animal` | `on`, `animals`, `cross`, `every` |
| `paint` | `on`, `hold`, `every` |
| `bell` | `on`, `flash` (`cube`, `prop`, `none`), `prop`, `every`, `volume` |
| `snow` | `on`, `on_url`, `off_url`, `run`, `gap`, `night`, `from`, `to`, `cube` |
| `hunt` | `on`, `clues` (`{"q": …, "k": "word" / "number" / "prop", "a": …}`), `order` |
| `song` | `on`, `clip`, `rounds`, `answer`, `volume` |

## Troubleshooting

- **No 🎁 Fun tab:** switch at least one extra on at /fun and save, then reload the visitors' page.
- **"not ready" on the settings page:** the cube's sides are not set up (photo, wheel, animal, paint, song), the
  snow has no "switch on" address, the hunt has no clue, or there are fewer than 4 songs.
- **The bell or the songs make no sound:** check the speaker with **Ring it now**; on a Raspberry Pi see "Sing" in
  INSTALL.md. Only one sound plays at a time: a ring during a song is skipped.
- **Snow does nothing:** open the "switch on" address in a browser on the bridge computer; the log says when the
  machine could not be reached.
- **Paint says to pick one side:** the sides are different sizes; pick one at the top of the page.
- **A song is missing:** it must be a WAV file of at least 4 seconds; press **Look for songs again**.
