# ShowPlay — Sing (v17)

Visitors record a song on their phone, pick who sings it, and send it. The recording plays on the speaker of the
computer running the bridge, while the chosen one "sings" it:

| Who | How it sings |
| --- | --- |
| A **singing model** of the show (a model with a face in xLights: singing pumpkins, trees, skulls, bulbs…) | It moves its mouth with the voice, with its face outline and eyes on, and blinks now and then |
| Any other **prop** | It glows with the voice, brighter when the voice is louder, its colour turning slowly |
| A **side of the cube** | It shows a drawn face whose mouth opens with the voice (no EZPlayer needed) |

```
phone (🎤 Sing tab) ──WAV──► ntfy.sh ──► bridge ──► speaker of this computer
                                           ├──► EZPlayer ──► singing model / prop
                                           └──► the cube (DDP)
```

## Contents

- [On the phone](#on-the-phone)
- [Setting it up](#setting-it-up)
- [The speaker, by platform](#the-speaker-by-platform)
- [How the mouth moves](#how-the-mouth-moves)
- [Privacy and limits](#privacy-and-limits)
- [Settings](#settings)
- [Troubleshooting](#troubleshooting)

## On the phone

The **🎤 Sing** tab shows when Sing is on and at least one singer is ticked.

1. **Who sings?** The visitor picks one of the singers you allowed (up to 30, with the names and emoji you gave them).
2. **Record:** they tap the red button and sing, and tap again to stop. It stops by itself at 10 seconds. A meter
   shows the voice. The first time, the phone asks to allow the microphone. The silence at both ends is cut off.
3. **Listen** to check it, **Record again**, or **Send it to the lights!**
4. **The queue:** the tab says when the song is in the queue (and its place) and when it is playing ("Watch the
   Singing Pumpkin!").

The recording is a small WAV file: mono, 16-bit, 11 kHz, about 22 KB per second, so 10 seconds is about 220 KB. The
phone sends it to ntfy.sh as a file attached to the message, the same way animated pictures are sent. Each phone can
send one recording every 20 seconds.

It works in current Safari (iPhone, iPad) and Chrome (Android). The visitors' page must be served over HTTPS (GitHub
Pages is), because browsers allow the microphone only there.

## Setting it up

On the control page, card **Sing (visitors)**. It has its own **Save singing settings** button.

1. **Turn it on:** tick **Let visitors record a song and make the show sing it** (on by default).
2. **Find the singers:** press **Find the singing models in EZPlayer**. The bridge reads EZPlayer's copy of
   `xlights_rgbeffects.xml` and lists every model that has a face of the "node range" type with mouth shapes. The
   MerryOnCherry 2026_Base layout has 42: pumpkins, trees, skulls, bulbs, the snowman, the gargoyle, the
   nutcracker… It does this by itself when the bridge starts and when the EZPlayer show changes.
3. **Choose who visitors can pick.** Untick the singers you do not want. With many singing models, keep the ones that
   are easy to see from where visitors stand. You can also rename each one ("Singing Pumpkin" instead of
   `Boscoyo_HiRes_Singing_Pumpkin`) and change its emoji.
4. **Props and the cube:** **Props can sing** lets visitors pick the props you set up for the ✨ Props tab (they glow).
   **The cube can sing** lets them pick a side of the cube (a face).
5. **Check the speaker:** set the **Volume** (25–100 %) and press **🔊 Test sound**: a three-note chime plays on this
   computer's speaker.
6. **Approval:** **Approve each recording before it plays** is off by default, so recordings play straight away.
   If you tick it, each recording waits in the card with a player to listen to it first, **▶ Play** and **✕**.

When a model has several faces in xLights, the bridge uses the one that defines the most parts, colours counting a
little extra. The face's own colours are used when the face has them ("custom colours" in xLights). Otherwise the
outline is warm white, the eyes white and the mouth red.

## The speaker, by platform

The bridge plays the recording itself, with what each system already has:

| Platform | How | Notes |
| --- | --- | --- |
| Windows | Windows' own sound (Python's `winsound`) | The default sound output of Windows |
| macOS | `afplay`, part of macOS | The Mac's current sound output |
| Linux x64 | `aplay`, or `paplay` / `pw-play` when `aplay` is missing | Choose the **Sound output** on the control page |
| Raspberry Pi | `aplay`, part of Raspberry Pi OS | Choose the **Sound output**: jack (Pi 4), HDMI, USB speaker or sound card, Bluetooth |

**Raspberry Pi outputs:**

- **Jack:** the Pi 4 has a 3.5 mm jack; the **Pi 5 has none**.
- **USB:** a USB speaker or a small USB sound card works on both.
- **Bluetooth:** pair the speaker once in the Pi's settings.
- **The list:** the **Sound output** list shows what `aplay -L` finds. "Default" uses the system's default output.

**EZPlayer on the same computer:** the voice plays together with the show's music on the same speaker. To keep them
apart, use two outputs: for example the music on HDMI and the voices on a USB speaker near the singing prop. On
Raspberry Pi OS Lite, an output can sometimes take only one program at a time. The log then says "the sound output
is in use by another program". Use another output for the voices, or use the desktop Raspberry Pi OS, whose sound
system mixes programs.

## How the mouth moves

- **Measuring the voice:** the bridge measures the recording 20 times a second: how loud it is, and how "hissy" it
  is (s, sh, f, t).
- **Choosing the shape:**
  - silence → **rest**;
  - soft → **E** or **MBP**;
  - louder → **AI**;
  - loud and round → **O**;
  - hissy → **E** or **etc**.
  These are the mouth shapes of xLights faces.
- **Loudness:** loudness is measured against the loudest parts of that recording, so quiet and loud singers both open
  the mouth fully.
- **Glow:** props glow with the same loudness.
- **Timing:** **Mouth timing** delays the mouth slightly (0.15 s by default) because speakers take a moment to start.
  If the mouth moves before the voice, choose a longer time; if after, a shorter one.

It does not recognise words. With children singing, following the loudness looks right and never gets stuck.

## Privacy and limits

- **What passes through ntfy.sh:** recordings go through ntfy.sh like every request, on the show's channel. Anyone who
  knows the show code could fetch them for the few hours ntfy.sh keeps attachments.
- **On this computer:** the bridge keeps nothing. It downloads the recording, plays it, and deletes its copy straight
  away.
- **No filter:** there is no word filter for sound. Turn on approval if you ever need to check recordings first.
- **Limits:**
  - one recording per phone every 20 seconds;
  - at most 6 waiting;
  - only files from ntfy.sh, up to 400 KB;
  - only short mono 16-bit WAV, up to 12 seconds.
  Anything else is refused and logged.
- **Order:** one recording plays at a time, in the order they arrived.

## Settings

All are in `showplay_config.json` and set on the control page:

| Setting | What it holds |
| --- | --- |
| `sing` | Sing on or off |
| `sing_approve` | Each recording waits for **▶ Play** (off by default) |
| `sing_volume` | Volume of the recordings, 25–100 % |
| `sing_device` | Linux and Raspberry Pi: the sound output (from `aplay -L`); empty = the default |
| `sing_delay` | Mouth timing, in seconds |
| `sing_props`, `sing_cube` | Whether props and the sides of the cube can be picked |
| `sing_off` | Singers visitors cannot pick |
| `sing_names` | The names and emoji you gave the singers |

The queue for the phones is posted on the channel `<show code>-sing`.

## Troubleshooting

- **No 🎤 Sing tab on the phones:**
  - Sing must be on, with at least one singer ticked;
  - the bridge must be v17, and the visitors' page must be the v17 one;
  - "Show the visitors' requests" must be on.
- **"The microphone is not allowed":** the visitor must allow it in the browser, through the address bar's settings
  or the phone's settings for Safari or Chrome.
- **No singing models found:** EZPlayer must be running (0.7 or newer) with the show loaded. Only faces of the "node
  range" type are used; faces made of pictures ("matrix" faces) are not.
- **No sound:**
  - press **🔊 Test sound** and look at the log;
  - Windows: check the default output and the volume mixer;
  - Raspberry Pi and Linux: pick the right **Sound output**, and install `alsa-utils` if the log says no program
    could play the sound.
- **The mouth is early or late:** change **Mouth timing**.
- **A prop does not glow:** props need EZPlayer, like the ✨ Props tab.
