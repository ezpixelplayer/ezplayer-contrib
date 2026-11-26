# Guestbook

Visitors leave their **name and a short note** from their phone. A new note scrolls across a matrix of the show at
once, and every few minutes the book is **read**: its title, then the latest notes, one after another. In between,
the show plays. The phones' page shows the latest notes too.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). Open the instance's settings page on the home network, pick the matrix and Save.

## On the phone

Write your **name**, a **note** (up to 40 letters, or tap one of the ready notes) and pick a **colour**, then
**Sign the book!** The note goes on the lights straight away (when that is on), and stays in the book.

## Keeping it clean

- Names and notes go through the **word filter** (a built-in Portuguese and English list, plus your own words).
- The filter also applies to the notes **already in the book**: add a word or a name to **Extra blocked words** and
  the notes with it disappear from the lights and from the phones.
- **Visitors may write their own note** can be switched off: then they only pick one of your ready notes.
- Each phone waits before writing again (120 s).

## The book

- Kept in the instance's private `state` document, so it survives a restart of the app or of the computer.
- **Most notes kept** (300): the oldest go first.
- **Book number**: change it (e.g. from 1 to 2 at the start of a season) to start a new, empty book.

## Configure

- **Matrix**: any model at least 8 x 5.
- **Title** shown before reading the book ("Our guestbook"; empty: no title) and its colour.
- **Show each new note at once** (on), **read the book every … minutes** (5; 0: never), **how many of the latest
  notes are read** (5), frames per second and brightness.

## How it is built

Plain Node (22+), no dependencies: `game.mjs` (the book, the filter, the reading), `player.mjs` (the talking to the
player; the lease is only open while something is on the lights), `main.mjs`.

## Changes

- **Version 2:** the overlay leases are **exclusive**, with the app token, like the other apps (PR #21); without it EZPlayer refused them ("overlay: mode must be 'exclusive' or 'layer'").

- **Version 1:** the first version.
