# ShowPlay apps for EZPlayer

ShowPlay's features as EZPlayer apps (EZPlayer 0.7 or later, which added the apps runtime in v0.7.0-dev.2). Each folder
is one app with its own README. Install them from the Apps tile (Install → this folder), then open each instance's
settings page on the home network.

| App | What visitors do |
|---|---|
| tic-tac-toe, four-in-a-row, simon, count-the-colours, snake, space-invaders, pong | play a game on a matrix |
| messages | send a message, an effect or a drawing to a matrix |
| advent-calendar | open one more door every day of December |
| decorate-the-tree | hang baubles on a tree (kept across restarts) |
| fun | photo frame, wheel of fortune, animals, paint by numbers, bell, snow on request, treasure hunt, guess the song |
| props | light up real models (wings, bats, arches) with an effect and colours |
| play-the-lights | play the models of the props like a keyboard, one visitor at a time |
| sing | record a song; a singing model sings it on the show's speakers |

Still in the ShowPlay bridge, not an app: the Mixer and MIDI controllers (for the crew).

## What changed in this round

- New apps: **props**, **play-the-lights**, **sing**, using a new shared part (`multi.mjs`, `models.mjs`) that lights
  many models at once, one overlay lease per model.
- **fun**: the bell and guess the song now play through EZPlayer's audio injection, on the show's speakers (setting
  "Sound of the bell and the songs"); this computer's own speaker is still a choice.
- **decorate-the-tree**: the baubles are saved in the instance's private `state` document and survive a restart.
- All apps: the shared `player.mjs` can keep a game's state across restarts (used by the tree); settings pages accept
  decimals where a field has a step, and list the show's models and groups where an app needs them.
- Tested against a stand-in for EZPlayer's app API (the same routes as the v0.7.0-dev.2 manual); not yet on a real
  player.

## Later fixes and additions

- **tic-tac-toe 2, four-in-a-row 2:** a player could seem to play twice in a row (the phone let a second tap through
  before the app answered); the board now locks until the app answers, and late or repeated moves are refused.
- **simon 2, snake 2, pong 2, space-invaders 2:** smaller fixes to sending presses, turns and positions.
- **messages 2:** the Picture tab with the 73 animated GIFs of the ShowPlay page.
- **decorate-the-tree 3:** spots placed by the real positions of the pixels (a 360° mega tree is decorated all the way
  round, with round baubles), an optional star on top, bauble size, and a fix for the phone's page freezing during the
  countdown.
- **decorate-the-tree 4:** a choice of decorations (bauble, candy cane, star, bell, present, snowflake, heart) and
  visitors can change the star's colour.
- **decorate-the-tree 5:** effects for the decorations (glow, steady, blink, twinkle, pulse, rainbow) and for the star
  (twinkle, steady, blink, pulse, spin, sparkle, rainbow), chosen by the visitors.
- **decorate-the-tree 6:** the star can be a group of the show (for example "All Stars") or several models.
- **decorate-the-tree 7, props 2, play-the-lights 2, sing 2:** a group made of submodels lights only those submodels.
- **decorate-the-tree 8:** on a matrix it draws a tree (triangle, trunk and star) and decorates it; a matrix turned at
  an angle in the 3D layout is no longer taken for a round mega tree.
