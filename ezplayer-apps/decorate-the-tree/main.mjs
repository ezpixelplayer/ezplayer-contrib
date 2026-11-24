// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

// Decorate the tree, as an EZPlayer app: the tree is in app.mjs, the talking to the player in multi.mjs.
import { run } from './multi.mjs';
import { App, cleanSettings } from './app.mjs';

await run({ name: 'decorate-the-tree', App, cleanSettings });
