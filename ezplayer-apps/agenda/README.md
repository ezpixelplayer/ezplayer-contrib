# 🗓️ Agenda

**One page to give every app its times.** Agenda's settings page lists the player's default times and every app
instance, and sets each one's times with the player's **own schedules** (the same ones as on the Apps card). So the
times keep working even when Agenda itself is off. On top of that, Agenda adds **dates**: an app only from 1 Dec to
6 Jan, every year. Dates are Agenda's own, so they only work while Agenda runs.

## Install

In the player, open the Apps tile and install from the contrib repository, or point it at this folder (the one
holding `ezapp.json`). Make an instance, set it to **Always** and switch it on, then open its settings page **on the
home network** (through the cloud the page says so: the apps and their schedules are only reachable at home).

## The settings page

- **Quick presets**: *Evenings 18:00–23:00 every day* and *Weekends 10:00–22:00* fill in the default times;
  *Every app follows the default* sets every app back to the default. Nothing changes until you Save.
- **Default times**: rows of days (every day, Fri and Sat, Sat and Sun, Mon to Fri, Sun to Thu or one day), from and
  until. **Save the default**. No rows means always.
- **Apps**: one card per instance, with its icon, title and state (running, not scheduled now, disabled…), an **On**
  box, and **Follows the default**, **Always** or **Its own times** (rows like the default's). **Copy these times to
  all apps** gives the same times to every other app. **Save** per app, or **Save all** at the bottom.
- **Only from … to …** (per app): the dates, every year, both days included; a range may cross the new year
  (1 Dec to 6 Jan). Not offered for Agenda itself.
- **This week**: a bar per app for each day, Monday to Sunday, with the times on the page (also the ones not saved
  yet); an app that is off is shown faded.
- Times are 00:00 to 24:00. A window past midnight (18:00 to 02:00) is saved as two: 18:00–24:00 on its days and
  00:00–02:00 on the next days (the player's type for app windows does not promise times past 24:00).

## Dates

Every minute the Agenda process reads its private document `plan` and, for each app listed there, switches it **on**
inside its dates and **off** outside, by the local date of the player computer. It only sends a change when the
player says otherwise, logs each one, never touches an app that has no dates and never touches itself.
Because it checks every minute, an app with dates that you switch off by hand inside its dates is switched on again:
take its dates away first. Keep Agenda on **Always** (the page warns when it is not), or the dates are only kept while
Agenda happens to be on.

Agenda's status says how many apps have dates and when the next change is ("Agenda: 2 apps with dates, next change
Tue 1 Dec (pong on)"). Its page for visitors shows **What's on today**: each app that is on today and its times.

## Building

The visitors' page is built like every app's; the settings page is Agenda's own (`_src/agenda.html`), so after the
usual build run the second step, which replaces the generic settings page with it (filled in with the name and icon
of `ezapp.json`, the colours of `theme.mjs` and the rules of `plan.mjs`):

```
node _tools/build.mjs agenda
node agenda/_src/config.mjs agenda
```

(from the `ezplayer-apps` folder). Do the same for each theme-pack copy after `node _tools/make_pack.mjs agenda`,
e.g. `node agenda/_src/config.mjs ../ezplayer-apps-halloween/halloween-agenda`.

## Files

- `main.mjs`: the date enforcer and the status.
- `plan.mjs`: the rules (time windows, dates), shared by the process, the settings page and the tests.
- `theme.mjs`: title, icon and colours (empty for Christmas; a theme pack sets its own).
- `_src/agenda.html`, `_src/config.mjs`: the settings page and its build step; `_src/page.*`, `_src/config.json`:
  the visitors' page.

## Changes

- **Version 1:** first version.
