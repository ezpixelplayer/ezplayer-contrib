# Tug of war

Two teams of phones **tap as fast as they can** and the rope on a matrix of the show moves to the side that pulls
harder. A team wins when the knot reaches its line, or by being ahead when the time is up. Great for groups of
children: classes, families, two sides of the street.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). Open the instance's settings page on the home network, pick the matrix and Save.

## How to play

1. Someone picks a team and taps **New game**; the others pick a team and **Join the game** (or are put on the
   smaller team). They can change team until the game starts.
2. The first player taps **Start now** (or the time to join runs out): **3, 2, 1…**
3. **PULL!** Everyone taps the big button of their team's colour as fast as they can.
4. The matrix shows the rope: each side lit in its team's colour up to the knot, and the two lines. The phones show
   it too, with each player's pulls.

**Fair for small teams:** a team's pull is its taps **divided by how many players it has**, so three fast children
can beat ten slow grown-ups.

**Alone?** If only one team has players, **the computer pulls the other side** (easy, normal or hard), or, with the
computer off, the players are split into two teams.

## When someone wins

Like the other games: a sound (built in or your own WAV), the words said out loud and/or written across the lights,
and a machine for a few seconds (bubbles, fog, snow, lights…). The words for a win can use `{winner}` (the team's
name) and `{colour}`. When the computer wins, that counts as a loss.

## Configure

- **Matrix**: any model at least 8 x 4.
- **Team 1 and team 2**: their names (empty: their colour, e.g. "Red team") and colours.
- **Seconds of pulling** (30), **how hard the rope is to move** (easy, normal, hard), **the computer** (off, easy,
  normal, hard), **most players** (16), **seconds to join** (20), frames per second and brightness.
- **🎉 When someone wins or loses**: as in the other games (the fun README explains machines and DMX).

## How it is built

Plain Node (22+), no dependencies: `game.mjs` (the teams, the rope, the drawing), `player.mjs` (the talking to the
player, with the ending), `ending.mjs`, `audio.mjs` and `machine.mjs` (shared by every game), `main.mjs`. The phones
send their taps in small batches four times a second; more than about 30 taps a second do not count.

## Changes

- **Version 2:** the overlay leases are **exclusive**, with the app token, like the other apps (PR #21); without it EZPlayer refused them ("overlay: mode must be 'exclusive' or 'layer'"). The machine's lease (DMX through EZPlayer) too.

- **Version 1:** the first version.
