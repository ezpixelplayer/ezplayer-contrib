# Race to the Star

A race for one to eight visitors up a track of lights. Each player climbs with their own effort,
measured on their phone (tapping, singing, shaking the phone, or running on the spot), and the first
to reach the top lights the star in their color. A port of the race game in ShowPlay to the EZPlayer
app runtime: the player starts `race.mjs`, phones open the app's page, and their efforts reach the game
as app events. While a race is on the track (and the star, when one is chosen) are painted through
exclusive overlay leases, taken when the first player joins and released after the race so the show
has its lights back. When another app has the track, the race says who and does not start. Plain Node
(22+), no dependencies.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder
(the one holding `ezapp.json`). The player creates an instance and gives it a token.

## Configure

Open the instance's settings page (the gear on the Apps tile), on the home network so the models can
be listed.

- **Track**: one overlay target. A matrix or a tree (any model with a dense grid, two or more wide and
  high) is painted as a grid: its width is split into one group of columns per player and the
  climbers rise from the bottom row to the top. Any other model, or any submodel, is painted node by
  node: the node list is cut into one segment per player and each lane runs along its segment, so a
  roof line, an arch or one string of a tree works too. A grid narrower than the number of players
  (or a node list too short to cut) falls back to rings: every pixel shows every climber as a band at
  their height.
- **Star** (optional): a prop (model or submodel) that stays dim during the race, shows the leader's
  color faintly, and lights in the winner's color with a sparkle for 8 seconds at the finish. Without
  one, the top 6 % of the track becomes the star.
- **Frames per second**, **brightness**, how the **climbers look** (a little figure with moving legs
  on tracks 50 pixels tall or more, a rope filled to the height on shorter ones) and the **track
  background** (dim lane colors, or off).
- **Waiting room**: how long it stays open after the first player opens a race (30 s by default), and
  whether that first player may start sooner.
- **Ways to play**: tap, voice, shake, run. Phones only offer shake and run when they have a motion
  sensor, and voice when they have a microphone.
- **Most players** (1 to 8) and the **colors** they can pick, one lane each.
- **Levels**: how far the same effort climbs for a child (150 %), an adult (100 %) and a sporty player
  (80 %), and whether whoever is behind gets a hand (up to 60 % faster, so races stay close).
- **Difficulty**: easy, normal or hard, as in the original (race length at average effort 25 / 35 /
  45 s; slide 2 / 3.5 / 6 % of the track a second after 2 / 1.2 / 0.6 s without effort), or custom.
  The **longest race** ends a race that drags on: the highest climber wins.

Settings are saved to the instance's private `settings` document and re-read between races.

## Play

Open the instance page on a phone (LAN link or cloud link, same page). Type a name, pick a color, a
way to climb and a level, and tap **New race**. Others open the same page and tap **Join the race**
while the waiting room is open; the first player can tap **Start now**. After a 3-2-1 countdown
(the lanes fill once a second on the lights, the phones show the numbers) the race is on: tap the
big button, sing, shake or run. Stop, and your climber slides back down. The phones show everybody's
height as bars, your own lane outlined, and your place; the winner's phone says so and buzzes. After
8 seconds of party on the lights the app is idle again and a new race can start.

A show input named `start` opens a waiting room from a button on the show, with nobody in it yet.

## How the effort is measured

The phone turns what it measures into one number from 0 to 1 and sends it once a second as a single
`effort` event, never one event per tap:

- **Tap**: taps in the last second, 8 a second = full.
- **Voice**: the microphone's loudness is sampled on the phone every 80 ms; the effort is 60 % the
  share of the last second the voice was on and 40 % the average loudness, so a steady voice beats
  shouting. No sound leaves the phone.
- **Shake**: from the accelerometer, half the capped shaking strength (so shaking violently gives
  nothing extra) and half the rhythm, 6 shakes a second = full.
- **Run**: steps a second from the accelerometer, 3.5 a second = full.

The game climbs 20 times a second with the last effort received: an effort of 0.6 climbs the whole
track in the race length, multiplied by the player's level and the help for whoever is behind. An
effort older than 4 seconds counts as a phone gone quiet, and a climber without effort for the slide
delay slides down at the slide speed.

## Left out of the original

Two players sharing one phone (the app's one client id is one player); several models combined into
one track and a track-and-star pair per player (one target each here); the climb direction, stripe
and side-by-side splits and the "front of the tree" setting (a grid is always split into column
groups, climbing up; a nodes target follows its node order); the panel's test race and the saved
profiles; the rainbow party is always on.
