# Fun

Eight extras for visitors on one page, each switched on in the settings; the phones see only the ones that are on.

| Extra | What it does |
|---|---|
| 📸 Photo frame | a 3-2-1 countdown, a flash, then a frame around the visitor (snowflakes, hearts, stars, Santa, rainbow) |
| 🎰 Wheel of fortune | the wheel spins on the matrix and lands on a prize: an effect, a message, a colour, or "spin again" |
| 🐾 Pick an animal | a penguin, reindeer, snowman, polar bear or robin walks across a snowy night and hops |
| 🖍️ Paint by numbers | six drawings (tree, star, snowman, present, bauble, bell) coloured on the phone; on the matrix the areas fill in turn |
| 🔔 Ring the bell | a bell on the player computer's speaker and a gold flash |
| 🌨️ Snow on request | a snow (or bubble, or fog) machine runs for a few seconds: by web address (smart plug, relay) or by DMX (through EZPlayer, DDP, Art-Net or E1.31), with modes and lights for machines with several functions |
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
- `machine.mjs`: switches the snow machine, by web address or DMX (DDP, Art-Net, E1.31 over UDP, or an EZPlayer
  overlay lease on the machine's model);
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
- **Snow**: how the app reaches the machine (web address, or DMX through EZPlayer, DDP, Art-Net or E1.31; see
  [Snow on request](#snow-on-request) below), seconds it snows, rest between snows, most snows a night, open from /
  until (hour). A night runs from noon to noon. The extra only shows when it is ready: the on address for a web
  address; the channels and the model (EZPlayer) or the board's IP address (DDP, Art-Net, E1.31) for DMX.
- **Treasure hunt**: the clues, one a line, `question | answer` (an answer of digits only is a number; words are
  checked without capitals, spaces or punctuation), in order or any order. The phone keeps its progress; changing the
  clues starts everyone again.
- **Guess the song**: the folder of songs on the player computer (WAV files, at least 4 of 4 s or more; the file name is
  the title, `_` read as a space), seconds of each song, songs a round, seconds to answer, volume.

## Snow on request

### Five ways to reach the machine

| Way | What you need | Good for |
| --- | --- | --- |
| **Web address** | a smart plug or relay with a web address (Shelly, Tasmota, an ESP32 relay…) | snow and bubble machines that start by themselves when they get power |
| **DMX through EZPlayer** | the machine on a DMX port of a show board that EZPlayer already drives, and a model of it in the layout | a show that already has DMX through EZPlayer |
| **DMX by DDP** | a board that takes DDP and has a DMX output: WLED built with DMX output plus a MAX485, or an FPP board with a DMX port | a cheap ESP32 next to the machine |
| **DMX by Art-Net** | an Art-Net to DMX node (or a show board's DMX port set to Art-Net) | an existing Art-Net node |
| **DMX by E1.31 (sACN)** | an E1.31 to DMX node (or a show board's DMX port on an E1.31 universe) | Falcon, Kulp and other show boards |

**URL or DMX, what is the difference?** With a web address the app only switches the **power** on and off: the
machine must start making snow as soon as it gets power. With DMX the machine stays **plugged in all the time** and
the app sends it a **value** (for example "channel 1 = 255" for full output): it starts at once, can run at half
power, and a fog machine keeps its heater warm. DMX needs the machine to have a DMX input (a 3- or 5-pin XLR socket)
and an RS-485 line driver somewhere: show boards and DMX nodes have it built in; an ESP32 needs a MAX485 module.

In every way the app keeps the same safety rules: seconds it runs, rest between runs, most runs a night, the hours it
may run, and **Test for 3 s** on the settings page.

### Web address (smart plug or relay)

1. **Give the plug a fixed IP address** (a DHCP reservation in the router), so the address never changes.
2. **Put the machine in "always on" mode** (the switch on the machine, or its remote set to continuous), so it makes
   snow as soon as the plug gives it power. Try it by hand: switch the plug on in its own app; the machine must start.
3. **Fill in the two addresses** and press **Test for 3 s**:

| Device | Switch on | Switch off |
| --- | --- | --- |
| Shelly Gen 1 (Shelly 1, Plug S) | `http://192.168.1.50/relay/0?turn=on` | `http://192.168.1.50/relay/0?turn=off` |
| Shelly Plus / Gen 2 and 3 | `http://192.168.1.50/rpc/Switch.Set?id=0&on=true` | `http://192.168.1.50/rpc/Switch.Set?id=0&on=false` |
| Tasmota | `http://192.168.1.50/cm?cmnd=Power%20On` | `http://192.168.1.50/cm?cmnd=Power%20Off` |
| ESP32 with your own sketch | whatever address your sketch answers | |

4. **Set an auto-off on the plug itself**, a little longer than the run (for example 30 s): Shelly "Auto off",
   Tasmota `PulseTime`. If the computer, the network or the app stops in the middle of a run, the plug still
   switches off by itself.

The plug must not need a password for these addresses (or put it in the address, as the device allows), and it must
be on the same network as the computer that runs the app.

**Machines that do not start by themselves** (they need a button pressed after power on):
- **A relay on the remote's button:** a dry-contact relay such as the Shelly 1 (or a relay on an ESP32), its
  contacts wired **in parallel with the button** inside the remote. Closing the relay is like pressing the button.
  Only on remotes that run on a battery or low voltage.
- **Radio remotes (433 MHz):** the same relay inside the remote, or an ESP32 with a 433 MHz transmitter that learns
  the remote's code (Tasmota or ESPHome can send it from a web address).
- **A button pusher** (SwitchBot Bot and the like): it needs its hub and something that gives it a plain web address
  (for example Home Assistant); the app can only open plain addresses.
- **Buttons that toggle** (press = on, press again = off): use **pulse mode**. Set the relay's auto-off to about half
  a second and put the "switch on" address in **both** boxes: each run presses the button once to start and once to
  stop. If a press is ever missed the machine stays in the wrong state, so watch the first few runs.

### DMX: the channels

All DMX ways use the **channels** box: `channel=value` pairs, for example `1=255` (channel 1 at full) or
`1=200, 2=255` (output at 200, fan at full). Every other channel is 0, and all of them go back to 0 when the run
ends. Look in the machine's manual for its DMX channels (many snow machines have one: 0 = off, 255 = full) and set
its DMX address to 1 (or count from the address you set). While it runs, the values are sent again every 0.4 s, so
a board that forgets after a few seconds (WLED does) keeps them; at the end zeros are sent three times.

### DMX through EZPlayer

1. Wire the machine's DMX input to a DMX port of a board that EZPlayer already drives (a Falcon, Kulp or other show
   board, or a DMX node set up as a controller in EZPlayer).
2. In xLights add a **model on the machine's channels** and copy the layout to EZPlayer as usual. Use a plain model
   of RGB nodes (for example a single line of 1 node for 3 channels, 2 nodes for 6 channels), starting at the
   machine's first DMX channel: node 1 red = channel 1, green = channel 2, blue = channel 3, node 2 red = channel 4…
   EZPlayer counts an xLights **DMX model** as a single node, so it only reaches that model's **first 3 channels**:
   fine for a machine on channels 1 to 3, otherwise use the plain model. Give it a clear name, for example
   `SnowMachine`.
3. Pick **DMX through EZPlayer**, pick that model, fill in the channels, Save and press **Test for 3 s**.

While it snows, the app holds an overlay lease on that model (replacing what the sequence sends there) and releases it
after the zeros, so the show gets the model back.

### DMX by DDP (ESP32 with WLED, or FPP)

**ESP32 with WLED:** WLED can send its pixels out as DMX, but only when it is **built with DMX output** (the
`WLED_ENABLE_DMX` build option; the normal downloads do not have it). Wire a **MAX485** module (or another RS-485
module) to the ESP32:

| MAX485 | ESP32 |
| --- | --- |
| VCC | 3.3 V (or 5 V for 5 V modules) |
| GND | GND |
| DI | the DMX output pin set in WLED (GPIO 2 by default) |
| DE and RE (joined) | 3.3 V (always sending) |
| A / B | XLR pin 3 (DMX+) / pin 2 (DMX−); XLR pin 1 to GND |

In WLED: under **Sync**, keep **Receive UDP realtime** on (DDP); under **DMX Output**, 3 channels per fixture set to
red, green and blue, start address 1, spacing 3; set the LED count to at least the channels divided by 3. Then
channel 1 = the first byte the app sends, channel 2 the second, and so on. Pick **DMX by DDP**, put in the ESP32's IP
address and the channels, and press **Test for 3 s**. Check with the machine: the mapping depends on WLED's DMX
output settings.

**FPP boards** (a Kulp or a Pi with FPP and a DMX port or USB DMX dongle): DDP starts at FPP channel 1; set the DMX
output to start at channel 1.

### DMX by Art-Net or E1.31

Wire the machine to the node's DMX output and set the node's universe. Pick **Art-Net** or **E1.31**, put in the
node's IP address and the **universe** (Art-Net counts from 0, E1.31 from 1), fill in the channels and press **Test
for 3 s**. The app sends straight to the node's address (not broadcast or multicast). If EZPlayer or xLights also
sends that same universe to the node, the two fight: give the machine a universe of its own, or use **DMX through
EZPlayer** instead.

### Machines with several functions (DMX)

Some machines do more than one thing: bubbles, fog, a fan, and their own lights, each on its own DMX channel. Two
options, both off by default (a simple machine stays exactly as above), make the most of them. They work with the
four DMX ways; a web address can only switch the power, so they do not apply there.

**🫧 Machine with several functions:** the phones pick a **mode** before tapping the snowflake. Write the modes one a
line, up to 8: `name | channels | at most seconds` (the seconds are optional; without them the mode runs as long as
the "seconds it runs" setting). **Channels sent in every mode** are added to all of them, for example `4=0` to keep a
cleaning mode off (a mode's own channels win).

**💡 The machine has lights:** say which channel does what, from the machine's manual; 0 means the machine does not
have it: **dimmer**, **red**, **green**, **blue**, **amber**, **white**, **colour changes** (the machine's own colour
macro: the value for the rainbow, and its speed channel and value) and the **strobe** (its value and a "never faster
than" limit). Then choose what the phones may pick:
- 🎨 **a colour** (8 colours: the app sets the dimmer and the red, green, blue, amber and white channels for it);
- 🌈 **the rainbow** (the machine's own colour changes);
- ⚡ **the strobe**, only when **Allow the strobe** is ticked (some people are sensitive to flashing lights);
- 💡 **only the lights**, with no bubbles or fog: allowed while the machine rests and out of hours, and not counted in
  the night's runs (each phone waits 10 s between two).

**When the lights are on:** during a run, the colour the phone picked; when it picked none, **the colour you set**,
the **rainbow** or **off**. **Between runs:** off, or **a colour you set** that stays on all the time (a dark colour
is dim). A colour between runs keeps the machine's DMX taken all the time (through EZPlayer: its model's lease); it
goes dark when you switch it off.

Every channel you do not set is 0. The light channels you name are always sent (0 when not used), so a colour from an
earlier run never stays on by mistake.

**How many channels:** any number, from 1 to 512, as the machine needs. Through EZPlayer the model needs enough RGB
nodes: the channels divided by 3, rounded up (12 channels: 4 nodes; 20 channels: 7 nodes); the log warns when the
model is too small. DDP, Art-Net and E1.31 need nothing more.

**Examples to copy** (set the machine's DMX address to 1 on its display):

| Machine | Modes | Every mode | Lights |
| --- | --- | --- | --- |
| Snow machine, 1 channel (0 off, 255 full) | not needed: Channels `1=255` | | |
| Fog machine, 2 channels (1 fog, 2 fan) | `🌫️ Fog \| 1=200, 2=150 \| 8` and `💨 Big fog \| 1=255, 2=255 \| 5` | | |
| Bubble / fog / wind machine with lights, 12 channels (1 bubbles, 2 fog, 3 wind, 4 cleaning, 5 dimmer, 6 red, 7 green, 8 blue, 9 amber, 10 colour macro, 11 strobe, 12 macro speed) | `🫧 Bubbles \| 1=255, 3=200`, `🌫️ Fog \| 2=200, 3=150 \| 8`, `🎉 Everything \| 1=255, 2=180, 3=220` | `4=0` | dimmer 5, red 6, green 7, blue 8, amber 9, white 0, colour changes 10 (rainbow 200), speed 12 (128), strobe 11 |

On many machines a value from 0 to 10 means "off" or "no function", so use 11 or more for anything you want on. On
the 12-channel machine the colours and the strobe only work while the dimmer (channel 5) is on: the app does that
for you whenever a light is on.

### Fog machines

Use DMX for a fog machine: it must stay plugged in to keep its heater hot, so cutting the power (a smart plug) means
waiting minutes before the next run. With DMX it stays hot and fires at once.

### Safety

- **Some wired fog-machine remotes carry 230 V** inside. Never put a relay into a remote unless you know it is low
  voltage; when in doubt use DMX, or ask an electrician.
- Keep the **run short** (10 s by default, 120 s at most) and the **rest** long enough for the machine; set the **most
  runs a night** and the **hours**.
- Set an **auto-off** on the plug or relay, so it stops even if the computer or the network does not.
- Keep the machine, its plug and its cables dry and out of reach of children; snow fluid makes the ground slippery.

## Events

The page sends `photo` (`frame`), `wheel`, `animal` (`animal`), `paint` (`w`, `h`, `px`: colour 0 to 8 a pixel,
`r`: the area of each pixel), `bell`, `snow` (`mode`, `colour`, `strobe`, `light`), `hunt` (`i`, `a`), `song` (`a`: `new` / `join` / `ans`, `id`, `n`,
`c`, `name`).

## Left out of the original

- The photo frame and the paint pick one matrix (ShowPlay let the visitor pick a side of the cube).
- The hunt has no "pick a prop" clues (props are a separate app here).
- Songs must be WAV (ShowPlay read the same).

## When someone wins or loses

A section of the settings, **🎉 When someone wins or loses**, all off by default. Tick **When the treasure is found, and for the winner of guess the song**, then the parts you want:

- **🔊 Sound:** built in (a short fanfare for a win, made by the app, no files
  needed) or your own WAV files (on the player computer). Volume, and where it plays:
  the show's speakers through EZPlayer (at once, or mixed with the show's music), or the computer's own speaker.
- **🗣️ Say the words out loud:** after the sound, the computer's own voice says the words (Windows and macOS have
  voices; on Linux or a Raspberry Pi install `espeak-ng`). **Voice language** picks a voice of that language when the
  computer has one (`en` by default; `pt` for Portuguese, for example Windows' "Helia" voice). No voice: only the sound.
- **🔤 Write the words across the lights:** the words scroll once over the end of the game, on a darker picture.
- **The words** can use `{winner}` (the player's name, or "The computer"), `{colour}` (the winner's colour as a word:
  Red, Blue…) and `{score}`. Write them in any language.
- **🫧 A machine** for a few seconds (bubbles, fog, snow, its lights…), reached in the same five ways as 🌨️ snow on
  request in the fun app (a web address, or DMX through EZPlayer, DDP, Art-Net or E1.31; its README explains each way,
  with wiring and safety): the DMX channels and seconds for a win, and a rest between two runs.

Every part works on its own: only the sound, only the words, only the machine, or everything.

**In this app:** a win is finding the treasure (the last clue of the hunt) and the winner of guess the song. There is no loss.

## Changes

- **Version 5:** 🎉 when someone wins or loses: a sound (built in or your own WAV), the words said out loud and/or written across the lights, and a machine (bubbles, fog, lights…) for a few seconds; all off by default.

- **Version 4:** machines with several functions (DMX): modes the phones pick (bubbles, fog, everything…), the
  machine's lights (a colour, the rainbow, the strobe with a limit, only the lights), a colour between runs, any
  number of channels; examples for 1-, 2- and 12-channel machines.
- **Version 3:** snow on request by DMX as well as by web address: through EZPlayer (a model in the layout), by DDP
  (WLED with DMX output, FPP), by Art-Net or by E1.31; the full guide above (smart plugs, relays, radio remotes,
  pulse mode, fog machines, safety).
- **Version 2:** the longer word filter (Portuguese and English) for the texts in the settings.
