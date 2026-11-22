# ShowPlay — Race to the Star (v19)

A race for 1 to 8 visitors up a track of lights: a mega tree, a matrix, any model or group of the show, or a side of
the cube. Each player climbs with their own effort, and the first to reach the top lights the **star** in their colour.

```
phones (tap / voice / shake / run) ──effort, about once a second──► ntfy.sh ──► bridge ──► EZPlayer ──► track + star
                                                                                    └──► the cube (DDP)
```

## Contents

- [Ways to play](#ways-to-play)
- [On the phone](#on-the-phone)
- [The race panel](#the-race-panel)
- [Tracks and stars](#tracks-and-stars)
- [How climbing works](#how-climbing-works)
- [Messages and limits](#messages-and-limits)
- [Settings](#settings)
- [Troubleshooting](#troubleshooting)

## Ways to play

| Variant | How to play | What the phone measures | Who it suits | Notes |
| --- | --- | --- | --- | --- |
| 1 · 👆 Tap | Tap a big button as fast as you can | Taps per second | Everyone; works on any phone | The simplest. The climber slides down if you stop tapping |
| 2 · 🎤 Voice | Sing or hold an "aaaa" loudly and without stopping | Microphone loudness, measured **on the phone** | Children and anyone who likes singing | The sound is **not sent**, only the number. A steady voice counts more than shouting |
| 3 · 🤳 Shake (default) | Shake the phone hard and fast | Accelerometer: strength and rhythm of the shaking | Everyone, even sitting down | Capped strength (shaking violently gives no extra speed). A notice reminds players to hold the phone tight |
| 3b · 🏃 Run on the spot | Run or march on the spot with the phone in your hand | Accelerometer: steps per second | The sportier players | Needs some free space and standing up |

- **Two players on one phone (👆 Tap):** the screen splits into two big buttons, one per player, each with their own
  colour and level.
- **Mixing:** each player picks their own way to play in the same race (unless the panel says everyone plays the
  first player's way). The phone turns its measure into an effort from 0 to 1, so all ways race fairly on the same
  scale:
  - tap: 8 taps a second = full effort;
  - voice: 60 % for how steadily the voice is on, 40 % for how loud;
  - shake: half strength (capped), half rhythm (6 shakes a second = full);
  - run: 3.5 steps a second = full.
- **No GPS:** it is too slow and imprecise for this.

## On the phone

Visitors find the race in **🎮 Games** ("🌟 Race to the Star").

1. **Choose:**
   - a colour (colours already taken are locked);
   - how to climb (only the ways switched on in the panel; shake and run only on phones with a motion sensor);
   - a level: 🧒 child, 🧑 adult, 🏃 sporty;
   - with 👆 Tap, optionally **👥 Two players on this phone**, with a second colour and level.
2. **Open or join the race:**
   - the first visitor taps **New race**;
   - others scan the same QR code and tap **Join the race** while the waiting room is open (30 s by default).
3. **Permissions:** the phone asks for them during this tap, because phones allow them only while you tap. That is
   the microphone for voice, and motion on iPhones for shake and run.
4. **Find your lane:** each player's lane blinks in their colour on the lights when they join. **📍 Where am I?**
   makes it blink again.
5. **Start:** the first player can tap **Start now**, if the panel allows it and there are enough players. Otherwise
   the race starts when the waiting room closes.
6. **Countdown:** the phone vibrates, and the lights count down 3-2-1.
7. **Climb!** The phone shows big buttons for tapping, or a message for the other ways, a meter of your effort,
   everybody's height in colour (yours outlined) and your place ("number 2 of 4").
8. **The end:** the winner's phone says "You win! The star is yours!" and vibrates. Everybody else sees the winner's
   colour.

## The race panel

Open **http://\<bridge-ip\>:8099/race**, or **🌟 Race** at the top of the control page, or **🌟 Race to the Star
settings** under Games. Press **Save the race settings** after changing things. To let visitors play, tick
**🌟 Race to the Star** under Games on the control page.

**1 · Track**
- **One shared track:** pick models or groups. A group is added as its models.
  - **Split** it into **Stripes**: neighbouring strings or columns alternate between players, so it can be seen from
    any side. This is the default.
  - **Side by side:** each player gets a part of the width. **Front of the tree** turns where the parts start.
  - **Rings:** every player is a band of their colour at their height, all around.
  - **The star:** pick the star models (any models, several, or none: the top of the track then becomes the star).
- **A track per player:** pairs of a track and its star, up to 8. **Pair automatically** matches names like
  "TreeMiniMega 1" with "StarMiniMega1".

**Climbers look like** (new in v19), in the effects section:
- **Rope:** the lane fills up to the player's height, with a brighter head. The top pixel lights up gradually as the
  climber moves through it, so even a short track climbs smoothly.
- **Climber:** a little figure (a head, a body and legs that move while the player is climbing) on a dim rope of the
  height already climbed.
- **Automatic** (the default): a climber on tracks 50 pixels tall or more, a rope on smaller ones, where a figure
  would take up too much of the track.
- **The cube:** pick a side (or all). Lanes are columns, the star is the top two rows. It works without EZPlayer.
- **Climb direction:**
  - **Up**;
  - **Down**, for trees wired upside down;
  - **Right** and **Left**, for a roof line or an arch;
  - **Along the string**, which follows the order of the pixels.

**2 · Ways to play:** tick Tap, Voice, Shake and Run on the spot. **Each player picks their own way**; **Two players
on one phone**.

**3 · Players:**
- **At least and at most:** 1 to 8 players (1 = a player can race alone, against the clock).
- **Colours:** the colour of each slot.
- **Waiting room:** how long it stays open, and whether the first player can start sooner.

**4 · Players' levels:** how far the same effort climbs for 🧒 child (150 % by default), 🧑 adult (100 %) and
🏃 sporty (80 %). **Help whoever is behind:** climbers far behind climb up to 60 % faster, so races stay close.

**5 · Difficulty:**

| Preset | Race length (average effort) | Slide speed | Wait before sliding |
| --- | --- | --- | --- |
| Easy | 25 s | 2 % of the track a second | 2 s |
| Normal | 35 s | 3.5 % a second | 1.2 s |
| Hard | 45 s | 6 % a second | 0.6 s |

**Custom** lets you move each slider. **Longest race** ends a race that runs too long: the highest climber wins.

**6 · Star and effects:**
- the star shows the leader's colour during the race;
- the 3-2-1 countdown;
- the rainbow party at the end (off: the winner's colour);
- the party's length;
- the brightness;
- the track's background (dim lane colours, or off).

**7 · Test and profiles:**
- **▶ Test race:** 2 to 8 pretend players climb, to see the lanes, colours and star on the lights.
- **🌟 Test the finish:** the party in a chosen colour.
- **⏹ Stop:** ends a test, or stops a visitors' race.
- **Profiles:** save the whole setup by name (for example "Children", "Family", "Sporty"), load it, or delete it.

## Tracks and stars

**Track:** any model or group EZPlayer can take an overlay on:
- mega trees;
- spiral and flat trees;
- matrices;
- custom models;
- strings, arches, roof lines.

The bridge reads where each pixel is, as for the props. With several models, their positions are taken together as
one track.

**Star:** any models:
- a star, a snowflake, a singing prop, a matrix;
- a DMX light, which lights in the winner's colour;
- or none: the top of the track (its last 6 %) becomes the star.

**A track per player:** each player's star glows with their height and flashes when they win.

Very small models (fewer than about 20 pixels in height) work, but the climb is harder to see.

## How climbing works

- **On the phone:** the phone measures the effort and sends it about every 2 seconds (v19; it was every second).
- **On the bridge:** the bridge climbs 20 times a second with the last effort received:
  - an effort of 0.6 climbs the whole track in the "race length" time;
  - the player's level multiplies it, and so does the help for whoever is behind.
- **Stopping:** when the effort stops (or the phone is quiet for 4 seconds), the climber waits the "wait before sliding" time,
  then slides down at the "slide speed".
- **Winning:** the first to the top wins: the star flashes in their colour and the party starts. Two players reaching
  the top in the same frame: the first who joined wins.
- **The phones' view:** they get everybody's heights every 5 seconds, and at once at every change of state.

## Messages and limits

- **Phones:** each phone sends one effort message about every 2 seconds (every 2.5 s after 30 s). A shared phone sends
  both players' efforts in one message. A 40-second race costs each phone about 18 messages. When a phone's message
  budget runs low (phones on the same Wi-Fi as the bridge share ntfy.sh's allowance), it sends fewer.
- **The bridge:** it posts the race on `<code>-game` at each change of state and every 5 seconds during the race,
  through the poster that keeps within ntfy.sh's limits (see INSTALL.md → Games → ntfy.sh's limits).
- **Refusals:** when a race cannot start, the phone that asked says why (for example "The race isn't set up yet").
- **Checks:**
  - efforts are numbers from 0 to 1;
  - a phone's messages closer than 0.3 s apart are ignored;
  - each phone plays only its own climber(s), thanks to its secret player code.

## Settings

In `showplay_config.json`:

| Setting | What it holds |
| --- | --- |
| `race` | Track, star, ways to play, players, levels, difficulty and effects, including `style` (`auto`, `rope`, `climber`) |
| `race_profiles` | Saved profiles |
| `game_list` | Includes `race` when visitors can play it |

## Troubleshooting

- **"The race isn't set up yet"** on the phone, or **"no track set up"** in the log, when a visitor starts a race: set up the track in the panel
  (section 1), or use the cube track.
- **A lane looks wrong:** try another split. On a tree, "Side by side" needs the **Front** set.
- **The climb goes the wrong way:** change the **Climb direction**.
- **Voice does nothing:** the phone must allow the microphone; the page must be on HTTPS.
- **Shake or run do nothing:**
  - iPhones ask for motion permission when tapping New race or Join, so tap **Allow**;
  - phones without a motion sensor do not offer these ways.
- **Races are too long or too short:** pick another difficulty, or change the race length.
- **The climbers jump instead of climbing smoothly:** check that **Climbers look like** is Rope or Automatic on a short
  track; on a phone on the same Wi-Fi as the bridge, a low message budget sends fewer efforts (test on mobile data).
- **New race seems to do nothing:** since v19 the phone says why; "Too many messages right now" means ntfy.sh is
  limiting your internet address for a minute or two.
