// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

// Raffle, as an EZPlayer app: the draw is in game.mjs, the talking to the player in player.mjs.
import { run } from './player.mjs';
import { Game, cleanSettings, minSize } from './game.mjs';

run({ name: 'raffle', Game, cleanSettings, minSize }).catch((e) => {
    console.error(e);
    process.exit(1);
});
