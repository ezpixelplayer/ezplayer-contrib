# Host panel

One page for **whoever runs the show**: every app of the player on one screen, what it is doing, how many people
play it right now, and buttons to switch it. Plus the **theme of the night**: one tap to switch on the apps of a theme
(Christmas, Halloween, Wedding...) and switch off the ShowPlay apps of the other themes.

The panel is the instance's **settings page** (the gear on the Apps tile, or `/apps/<instance>/config/`), which the
player serves even while the instance is stopped. There is no visitors' page.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). Open the instance's settings page **on the home network**: the panel uses the player's owner
API (`/api/ezp/apps`), which is only offered there. Through the show's cloud page it only says "Open this page on the
home network". Bookmark it on the phone or tablet you use to run the show.

## On the panel

- A **summary**: how many apps are running, stopped, and not scheduled now (on, but outside their schedule).
- A **card per app instance**: icon, title, app name, its theme, a coloured **state** (Running, Starting, Stopped,
  Failed, App missing, Off, Not scheduled now), **players now** (from the app's own status), its status message and
  when it last said something. Buttons: **Switch on / off** (whether the player runs it at all), **Start**, **Stop**,
  **Restart**, **Visitors' page** and **Settings**. The last lines of its log are under the card.
- A **filter**: all apps, running, not running.
- Everything updates every 3 seconds.

## Theme of the night

Pick a theme and tap **Show what changes**: the panel lists the apps it will switch on and off, and the apps it
leaves alone. Nothing happens until **Yes**. It switches on the ShowPlay apps of that theme and switches off the
ShowPlay apps of the other themes (a pack app's id starts with the pack's name, e.g. `halloween-pong`; the Christmas
apps have no prefix). Apps that are not part of a theme are never touched: this panel, the agenda, and any app that
is not from ShowPlay. Switched-on apps start by themselves (inside their schedule).

The ShowPlay app ids are put into the page when it is built (see below), so build it again when a ShowPlay app is added.

## 📊 Statistics

While the panel runs, every ShowPlay app reports to it (`stats.mjs` in each app): **a game played** (its players, the winner,
whether the computer won, and the scores) and **each use of an app** (a message, a picture, a decoration, a photo, a door of the
calendar, a song…). The panel keeps them in its private document `stats`, night by night, and the settings page shows:

- for any night ("Tonight" first): games played, players, uses, and **the most used apps** in order, with each game's **top score of
  the night** and who made it, and how many games people and the computer won;
- **when it was busy**: games and uses per hour, in the order of the night;
- **the whole season**: totals per app, the nights each was used and the **record of the season**;
- **⬇️ Download (CSV)**: every night and app, for a spreadsheet.

Under **Statistics settings**: when a night ends (06:00 by default, so a show past midnight is one night), whether to keep the
players' names (off: only the scores), and **Start a new season** (clears everything, asked inside the page).

Keep the panel **on during the show**: what happens while it is off is not counted (the games themselves are never slowed: a
missing panel is simply skipped). It counts the apps' reports only (events from `app:<instance>`), on the home network.
The last 400 nights and the latest 300 games in detail are kept.

## The app itself

`main.mjs` does almost nothing: it publishes the status `{ phase: 'idle', message: 'Host panel ready', players: [] }`
every 30 seconds and stops on SIGTERM. No lease, no events, no lights.

## Building

The panel is not the usual field form, so `config/index.html` is made from `_src/panel.html` by `_src/make_panel.mjs`,
after `_tools/build.mjs` (which always writes a field form there, and a `page/` that make_panel removes). From the
repository root:

```
node ezplayer-apps/_tools/build.mjs ezplayer-apps/host-panel
node ezplayer-apps/host-panel/_src/make_panel.mjs
node ezplayer-apps/_tools/make_pack.mjs host-panel
node ezplayer-apps/host-panel/_src/make_panel.mjs --packs
```

make_panel puts in the title and icon (from `_src/config.json`), the accent colour and the theme picked first (from
`theme.mjs`: `key`, `colour`), the 12 themes (from `_tools/packs.json`) and the ids of every ShowPlay app, read from
the folders `ezplayer-apps/*` and `ezplayer-apps-<pack>/*` at that moment.

## Theme packs

Each pack version (`ezplayer-apps-<pack>/<pack>-host-panel`) is the same panel with the pack's title, icon and
colour; its theme of the night starts on its own pack.

## Changes

- **Version 2:** 📊 statistics: every app reports games (players, winner, scores) and uses; the panel keeps them night by night and shows the most used apps, the top scores of the night, when it was busy, the season and a CSV download.

- **Version 1:** first version.
