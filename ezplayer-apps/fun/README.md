# Fun

Eight extras for visitors on one page, each switched on in the settings; the phones see only the ones that are on.

| Extra | What it does |
|---|---|
| 📸 Photo frame | a 3-2-1 countdown, a flash, then a frame around the visitor (snowflakes, hearts, stars, Santa, rainbow) |
| 🎰 Wheel of fortune | the wheel spins on the matrix and lands on a prize: an effect, a message, a colour, or "spin again" |
| 🐾 Pick an animal | a penguin, reindeer, snowman, polar bear or robin walks across a snowy night and hops |
| 🖍️ Paint by numbers | six drawings (tree, star, snowman, present, bauble, bell) coloured on the phone; on the matrix the areas fill in turn |
| 🔔 Ring the bell | a bell on the player computer's speaker and a gold flash |
| 🌨️ Snow on request | the app opens a web address to switch a snow (or bubble) machine on, then one to switch it off |
| 🔦 Treasure hunt | clues on the phones, word or number answers; a burst on the matrix for each, fireworks at the end |
| 🎶 Guess the song | a round for up to 8 phones: a few seconds of a song, four titles, points for speed |

Photo, wheel, animal, paint, the bell flash and the hunt's celebrations take turns on the matrix; between them it goes
back to the show.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). The player creates an instance and gives it a token. Open the instance's settings page (the
gear on the Apps tile) on the home network so the models can be listed, pick the model and Save. Settings are saved
to the instance's private `settings` document and re-read every few seconds.

## How it is built

A port of the feature in ShowPlay to the EZPlayer app runtime. Plain Node (22+), no dependencies.
- `game.mjs`: the rules and the drawing, with nothing about the player's API, so it can move to another way of talking
  to phones by changing only the other files;
- `lights.mjs`: the font, the colours and the effects shared by the ShowPlay apps that draw on a matrix;
- `player.mjs`: the part that talks to the player, the same in every ShowPlay app (settings, the matrix, the phones'
  events, the overlay lease while something is on the lights, released between, and the app's status);
- `main.mjs`: starts the two together; `page/` is the phones' page and `config/` the settings page.

The status carries `notices`: why a phone's last request was refused, keyed by its client id, so only that phone
shows it.

Sound: `audio.mjs` plays the bell and the songs through EZPlayer's audio injection (a lease on a bus), so they come
out of the show's speakers: the immediate bus by default, or the main bus (mixed with the show's music, heard by
listeners too). When the player has no audio API, it plays them on the computer itself (PowerShell's
`Media.SoundPlayer` on Windows, `afplay` on macOS, `aplay`, `paplay` or `pw-play` on Linux).

## Configure

Each extra has an **On** box, and most have **each phone waits** (seconds).
- **Sound of the bell and the songs**: EZPlayer's show speakers at once, mixed with the show's music, or this
  computer's own speaker.
- **Matrix**: any model at least 8 x 8 pixels; **frames per second**, **brightness**.
- **Photo frame**: the frames offered, seconds the frame stays.
- **Wheel**: the slices, one a line (2 to 12): `fx: snowfall`, `text: Merry Christmas!`, `colour: ff2a2a` or
  `again`; seconds the prize shows.
- **Animals**: the animals offered, seconds to cross the matrix.
- **Paint by numbers**: seconds the picture stays.
- **Bell**: volume, the gold flash on or off.
- **Snow**: the web addresses for on and off (for example a Tasmota or Shelly smart plug on the home network), seconds it
  snows, rest between snows, most snows a night, open from / until (hour). A night runs from noon to noon. The extra
  only shows when the on address is filled in.
- **Treasure hunt**: the clues, one a line, `question | answer` (an answer of digits only is a number; words are
  checked without capitals, spaces or punctuation), in order or any order. The phone keeps its progress; changing the
  clues starts everyone again.
- **Guess the song**: the folder of songs on the player computer (WAV files, at least 4 of 4 s or more; the file name is
  the title, `_` read as a space), seconds of each song, songs a round, seconds to answer, volume.

## Events

The page sends `photo` (`frame`), `wheel`, `animal` (`animal`), `paint` (`w`, `h`, `px`: colour 0 to 8 a pixel,
`r`: the area of each pixel), `bell`, `snow`, `hunt` (`i`, `a`), `song` (`a`: `new` / `join` / `ans`, `id`, `n`,
`c`, `name`).

## Left out of the original

- The photo frame and the paint pick one matrix (ShowPlay let the visitor pick a side of the cube).
- The hunt has no "pick a prop" clues (props are a separate app here).
- Songs must be WAV (ShowPlay read the same).
