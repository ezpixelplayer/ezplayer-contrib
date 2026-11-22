# ShowPlay — Advent calendar and Decorate the tree (v23)

Two Christmas extras for the visitors' page, set up on their own settings page: **http://\<bridge-ip\>:8099/xmas**
(or **📅 Advent & 🎄 Tree** at the top of the control page).

## Contents

- [Advent calendar](#advent-calendar)
- [Decorate the tree](#decorate-the-tree)
- [Messages and ntfy.sh](#messages-and-ntfysh)
- [Settings](#settings)
- [Troubleshooting](#troubleshooting)

## Advent calendar

**What visitors see** (📅 Advent tab):
- a countdown: "🎄 33 days to Christmas" (before the first day: when the calendar opens);
- 24 doors. The doors up to today are open and show what they hold (✨ an effect, 💬 a message, 🎮 a game); today's
  door glows; the next ones are closed and stay a surprise.

**What a door does when tapped:**

| Door | What happens |
| --- | --- |
| ✨ Effect | The effect plays on the cube (on the side picked at the top of the page, or all sides) |
| 💬 Message | The message scrolls on the cube |
| 🎮 Game | The phone opens 🎮 Games with that game picked; the visitor presses New game |

Any open door can be tapped again. Each tap is a normal request: it follows the same rules as a message or an effect
(wait between requests, approval, queue).

**On the settings page:**
- **Show the advent calendar to visitors:** adds the 📅 Advent tab.
- **A game door unlocks its game:** a game with a door appears under 🎮 Games only from the day of its door. Games
  without a door are always there.
- **First day** and **month** (1 December by default) and the number of **doors** (up to 24).
- **Test: pretend today is door N:** to try the calendar before December (0 = the real date). Set it back to 0
  before the show.
- **The doors:** for each door, pick ✨ Effect (one of the theme's effects), 💬 Message (up to 30 letters, checked
  by the word filter) or 🎮 Game. **Fill with the default surprises** puts back the ready-made calendar: effects,
  messages, Simon, Tic-tac-toe, Snake, Space Invaders, Race to the Star, and "MERRY CHRISTMAS!" on the 24th.

The date is the bridge computer's date. After the last door, all doors stay open.

## Decorate the tree

**What visitors see** (🎄 Tree tab): a drawing of the tree with its spots. Taken spots show their bauble; free spots
are dashed circles. The visitor taps a free spot, picks one of 8 colours and presses **Hang my bauble**. The bauble
lights up on the real tree, and the newest bauble sparkles for a few seconds.

**On the lights:**
- the decorated tree shows for a while after each new bauble (30 s by default), or all the time;
- between the baubles the tree is dim green (or off);
- the baubles twinkle gently;
- when every spot has a bauble: a rainbow party for 15 s, then the tree starts again empty (optional).

While the tree is not showing, the tree models play the show's sequence as usual.

**On the settings page:**
- **Let visitors decorate the tree:** adds the 🎄 Tree tab.
- **The models:** any models or groups (a mega tree, a matrix, a group of mini trees, a custom model). The spots are
  spread evenly over all their pixels; the top (where a star usually is) and the very bottom are left out.
- **Baubles:** 8 to 60 spots (30 by default). Changing the models or the number of baubles takes all the baubles off.
- **Each phone waits** this many seconds between two baubles (60 by default).
- **Show the tree for** N seconds after each new bauble, or **All the time**.
- **Brightness** and the **tree between the baubles** (dim green or off).
- **When the tree is full:** party, then start again (off: the full tree stays until you take the baubles off).
- **Show it on the lights now** and **Take all the baubles off**.

The baubles are kept in the settings, so they stay after a restart.

## Messages and ntfy.sh

| What | Messages |
| --- | --- |
| Opening a door | 1 from the phone |
| A game door | none (it only opens the game on the phone) |
| Hanging a bauble | 1 from the phone, 1 from the bridge (the tree for every phone) |
| The calendar | travels inside the status the bridge already posts |

The tree is posted on `<code>-tree`, only when it changes. The status must stay under ntfy.sh's 4096 bytes, so the
calendar sends only the open doors, in short form; if the status is still too big, the bridge leaves out the last
singers and props from it.

## Settings

In `showplay_config.json`:

| Setting | What it holds |
| --- | --- |
| `advent` | `on`, `unlock`, `month`, `first`, `days`, `test_day` and the 24 `doors` (`{"k": "fx", "e": …}`, `{"k": "text", "t": …}` or `{"k": "game", "g": …}`) |
| `tree` | `on`, `models`, `spots`, `every`, `show`, `always`, `bg`, `restart`, `bright` |
| `tree_orn` | The baubles: one digit per spot (0 = free, 1–8 = colour) |

## Troubleshooting

- **No 📅 Advent tab:** tick **Show the advent calendar to visitors** and save; the page shows it at the next status
  (reload the page).
- **All doors are closed:** it is before the first day. Use **Test: pretend today is door N** to try it.
- **A game door says games are closed:** games are off on the control page, or that game is unticked there.
- **No 🎄 Tree tab, or "the tree is not ready":** pick the tree's models, save, and check that EZPlayer is connected
  (the page shows "Saved: N spots on the tree").
- **The baubles are too small or too big:** fewer baubles make bigger ones; more make smaller ones.
- **The tree hides my sequence too long:** lower **Show the tree for**, or untick **All the time**.
