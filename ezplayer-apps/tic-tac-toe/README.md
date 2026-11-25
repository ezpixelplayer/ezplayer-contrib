# Tic-tac-toe

Tic-tac-toe on a matrix of the show, played from phones: against the computer (easy, normal or hard) or against a
friend whose phone joins from the same page. Anyone else who opens the page watches the game. A port of the
tic-tac-toe game in ShowPlay to the EZPlayer app runtime: the player starts `tictactoe.mjs`, phones open the app's
page, and their moves reach the game as app events. While a game is on, the board is painted through an overlay lease;
between games the lease is released so the show has its lights back. Plain Node (22+), no dependencies.

The rules and the drawing are in `game.mjs`, with nothing about the player's API; `tictactoe.mjs` only talks to the
player (settings, targets, the lease, events and status).

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). The player creates an instance and gives it a token.

## Configure

Open the instance's settings page (the gear on the Apps tile), on the home network so the models can be listed.

- **Matrix**: any model at least 6 x 6 pixels. The board is the largest square that fits, centred. On a tall matrix
  (for example 25 x 60) a bar above and below the board shows whose turn it is, in that player's colour.
- **Colours** of X, O and the grid, **frames per second** and **brightness**.
- **Against the computer** and/or **against a friend**, and the computer **levels** visitors can pick:
  - easy: random moves, but it takes a win when it sees one;
  - normal: wins when it can, blocks your win, often takes the centre;
  - hard: never loses (it picks at random among its best moves, so games vary).
- **Seconds for a move** (30): a player who runs out of time loses.
- **Seconds to wait for a friend** (60): with nobody joining, the game closes.
- **Seconds of party at the end** (8).

Settings are saved to the instance's private `settings` document and re-read between games.

## Play

Open the instance page on a phone (LAN link or cloud link, same page). Type a name, pick **The computer** (and how
hard) or **A friend**, and tap **New game**. For a friend game, the friend opens the same page and taps **Join the
game**. X always starts. Tap a square on your turn; the phone shows whose turn it is and the seconds left. **Leave the
game** gives the win to the other player.

On the lights: the grid, the marks growing in as they are played, the turn bars, then the winning line blinking white
(the other marks dim) and a party in the winner's colour (a rainbow for a draw). After the party the app is idle again.

Only one game at a time; while it is on, other phones see it and can start the next one when it ends.

## Events

The page sends one event per action: `new` (`mode`, `level`, `name`), `join` (`name`), `move` (`cell` 0-8, `game`)
and `quit`. The app publishes the game as its status: `phase` (`unconfigured`, `idle`, `waiting`, `playing`,
`finished`), `game`, `board` (9 characters, `X`, `O` or `.`), `turn`, `players`, `turnEndsAt`, `waitEndsAt`, `winner`,
`line`, `message`, the colours and the allowed modes and levels, and `notices`: why a phone's last request was refused,
keyed by its client id, so only that phone shows it.

## Left out of the original

Nothing of the game itself. In ShowPlay the board could also go on any side of the cube; here it is one matrix.

## When someone wins or loses

A section of the settings, **🎉 When someone wins or loses**, all off by default. Tick **When someone wins** and/or
**When someone loses**, then the parts you want:

- **🔊 Sound:** built in (a short fanfare for a win, a sad "wah wah wah waaah" for a loss, made by the app, no files
  needed) or your own WAV files (one for a win, one for a loss, on the player computer). Volume, and where it plays:
  the show's speakers through EZPlayer (at once, or mixed with the show's music), or the computer's own speaker.
- **🗣️ Say the words out loud:** after the sound, the computer's own voice says the words (Windows and macOS have
  voices; on Linux or a Raspberry Pi install `espeak-ng`). **Voice language** picks a voice of that language when the
  computer has one (`en` by default; `pt` for Portuguese, for example Windows' "Helia" voice). No voice: only the sound.
- **🔤 Write the words across the lights:** the words scroll once over the end of the game, on a darker picture.
- **The words** can use `{winner}` (the player's name, or "The computer"), `{colour}` (the winner's colour as a word:
  Red, Blue…) and `{score}`. Write them in any language.
- **🫧 A machine** for a few seconds (bubbles, fog, snow, its lights…), reached in the same five ways as 🌨️ snow on
  request in the fun app (a web address, or DMX through EZPlayer, DDP, Art-Net or E1.31; its README explains each way,
  with wiring and safety): the DMX channels and seconds for a win, and for a loss (empty: the machine stays off; for
  example only a red light), and a rest between two runs. With a web address the machine runs for a win, and for a loss
  only when ticked.

Every part works on its own: only the sound, only the words, only the machine, or everything.

**In this game:** a win is a person winning (against the computer or a friend); a loss is the computer winning. A draw does nothing.

## Changes

- **Version 3:** 🎉 when someone wins or loses: a sound (built in or your own WAV), the words said out loud and/or written across the lights, and a machine (bubbles, fog, lights…) for a few seconds; all off by default.

- **Version 2:** a player could tap twice before the app answered, and the phone showed two marks in a row (the app
  refused the second, so it vanished a moment later). Now the phone passes the turn on as soon as a square is tapped
  and locks the board until the app answers, and keeps the move shown if a status from before it arrives late. Each
  move also carries how many marks the phone saw, so a late or repeated move is refused.
