# Raffle

A prize draw on a matrix of the show. The names (or ticket numbers) spin fast across the matrix like a slot machine,
slow down over a few seconds and stop on the winner, who is shown big with sparkles. Visitors can join the draw from
their phone with their name, watch the spin live on the phone and see "You won!" on their own phone. Only the host
starts a draw.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). Open the instance's settings page (the gear on the Apps tile) on the home network, pick the
matrix and the entries, then Save. Settings are saved to the instance's private `settings` document and re-read
between draws.

## What visitors do

The phone page shows the title (for example "Christmas raffle"), the greeting and how many are in the draw. When
visitors can join, they type their name and tap **Join the draw**; tapping it again with another name changes the
name (still one entry per phone), and **Leave the draw** takes them out. During a draw the phone spins with the lights
and stops on the same name; the winners of the last draw stay on the phones in big letters, and the winner's own
phone shows **🎉 You won!** (and vibrates). The winners so far are listed below. Visitors can never start a draw.

## Settings

- **🎲 The draw**: the host's panel: **🎲 Draw now**, **🔁 Start again** (clears the winners: everyone is back in the
  draw) and **🧹 Empty the visitors' list**, with how many are in the draw and the winners so far (the latest 30).
  **Winners in each draw** (1 to 10, shown one after another), **suspense** (seconds the names spin, 6), **seconds
  each winner is shown** (8), and **a winner is out of the later draws** (on).
- **🎟️ Who is in the draw**: **my list of names** (typed on the settings page, one a line, up to 1000; a name twice
  counts once, whatever its accents or capitals), **ticket numbers** from A to B (up to 10000), **visitors who join
  from their phone**, or **my list and visitors**. With both, a visitor who joins with a name of the list takes that
  place: it counts once, and their phone shows "You won!". **Visitors can join now** (untick and Save to close the
  entries; those already in stay in), the most visitors who can join (300), and extra blocked words for the word filter
  (the visitors' names go through the built-in Portuguese and English filter, like the guestbook).
- **🌈 The look**: the title on the phones (empty: the theme's), sparkles round the winner, and the theme's colours or
  your own (one colour for the spinning names, one for the winner).
- **🎉 When a winner is drawn**: the shared ending of the ShowPlay games, for each winner: a sound (a built-in
  fanfare or your WAV file), the words said out loud and/or written across the lights (`{winner} wins!` by default;
  `{score}` is "2/3" for the second of three winners), and a machine for a few seconds (confetti, bubbles, fog,
  lights…), reached in the same five ways as in the fun app. With several winners in one draw the machine runs for the
  first one and then rests for the time set.
- **Frames per second** (30) and **brightness**.

## Ways to draw

- **🎲 Draw now** on the settings page. The page writes the private document `draw` (`{ what, n }`, a new `n` for each
  press) and the app reads it twice a second. A press from before the app started is never done again (the first
  read is only remembered).
- **A show button**: the app takes the show input `draw` (`"inputs"` in `ezapp.json`). Map a button to it on the Apps
  tile. A phone cannot send it: only events whose source is a show input count.

A press while a draw is on does nothing. When everyone has won (with "a winner is out" on), a draw says so: press
**Start again**.

## On the lights

The matrix is only taken during a draw (an exclusive overlay lease); between draws it goes back to the show. Lights
chase round the edge as fast as the names; on a wide matrix one name fills the height, on a tall one the names stack
like a reel. A name too long for the matrix is cut during the spin and scrolls when it wins. With several winners, a
dot each along the bottom shows which one is being drawn.

## Fair

Every entry still in the draw has the same chance (Node's `crypto.randomInt`, a partial Fisher-Yates shuffle), and
nobody is drawn twice in one draw. The winners are known when the draw starts; each one is only recorded, and only
sent to the phones, when the lights stop on it (the phones get the spinning names a moment ahead, never the winner
early). If the draw is cut short (the matrix busy, an error), the winners already shown stay and the rest are not
drawn.

## Kept across restarts

The visitors who joined, the winners (the latest 200) and the number of draws are kept in the instance's private
`state` document, so a restart of the app or the player keeps the entries and keeps the winners out of later draws.

## How it is built

Plain Node, no dependencies. `game.mjs` is the draw (entries, the fair pick, the spin and the drawing); `player.mjs`
is the shared ShowPlay runtime with two small additions: the live-document hook (the settings page's buttons) and
show inputs (`game.onInput`, only for events whose source is `input:…`). `theme.mjs` holds what changes with a theme
pack (title, greeting, colours, sparkle colours).

The pages are built: `node _tools/build.mjs ezplayer-apps/raffle`, then
`node ezplayer-apps/raffle/_src/host.mjs ezplayer-apps/raffle` adds the host's panel (the shared settings page has no
field for buttons). Run `_src/host.mjs` again on each pack folder after `make_pack.mjs` (it rebuilds the pages).

## Events

The page sends `join` (`name`) and `leave`. The status carries `count`, `left`, `ins` (the phones that joined),
`spin` (`t0`, `dur`, `N` and the names so far), `shown` (the winner on the lights), `last` (the last draw's winners),
`past`, `colors`, `title` and `greeting`.

## Changes

- **Version 1:** first version.
