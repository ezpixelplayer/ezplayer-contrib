# ShowPlay (v12)

ShowPlay lets visitors **play with the lights of a show** from their phone. They scan a QR code on the wall, and then
they can:

- send a message, a picture, an effect or a drawing to a **cube of LED matrices**;
- play **Four in a Row** on the cube, against the computer or a friend;
- light up **props of an EZPlayer show** (wings, bats, spinners…) with effects, palettes or their own colours.

Whoever runs the show gets a **Mixer** (new in v12): pads, faders and scenes for the cube and the props, and **Keys**
that play every model like the note of a keyboard. It works from a phone or tablet, and from a **real MIDI controller
or keyboard** too (with a ready preset for the Alesis VI25).

ShowPlay is made of two parts:

- **A bridge** (`showplay_bridge.py`) that runs at home and needs only Python 3.
- **A visitors' page** (`visitors-page/`) published on the web, for example with GitHub Pages.

The cube works on its own over DDP (WLED, ESPixelStick or any DDP board), with no xLights needed. Props, and cube sides
sent through EZPlayer, need EZPlayer 0.7 or newer.

## Pick your folder

| Folder | For | Start with |
| --- | --- | --- |
| [Windows/](Windows/) | A Windows 10 or 11 PC | [Windows/INSTALL.md](Windows/INSTALL.md) |
| [macOS/](macOS/) | A Mac with Apple Silicon (M1 to M4) or Intel | [macOS/INSTALL.md](macOS/INSTALL.md) |
| [linux-x64/](linux-x64/) | A Linux PC with an Intel or AMD 64-bit processor (Ubuntu, Debian, Mint, Fedora…) | [linux-x64/INSTALL.md](linux-x64/INSTALL.md) |
| [arm64/](arm64/) | A Raspberry Pi 4 or 5 with 64-bit Raspberry Pi OS, alone or running EZPlayer too | [arm64/INSTALL.md](arm64/INSTALL.md) |

These are the same four platforms EZPlayer itself runs on.

Each folder has its own complete installation guide (`INSTALL.md`) and a guide to what each file is for
(`CONTENTS.md`). The bridge (`showplay_bridge.py`) is the same in every folder. Only the start files differ.

## Shared by all folders

| Where | What it is |
| --- | --- |
| [visitors-page/](visitors-page/) | The page visitors open from the QR code, with the 73-picture pack. It is published on the web once, whichever folder you use |
| [docs/props.md](docs/props.md) | How the Props feature works |
| [docs/mixer.md](docs/mixer.md) | The Mixer, Keys and MIDI controllers |
| [CHANGELOG.md](CHANGELOG.md) | Every version, with what changed and what was tested |

ShowPlay was called **Light Cube** up to v9. Settings and show codes from Light Cube carry over: see "Updating from
Light Cube" in the installation guides.

Made for the MerryOnCherry show. Licensed under the repository's licence (AGPL-3.0).
