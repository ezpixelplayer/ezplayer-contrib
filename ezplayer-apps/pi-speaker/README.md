# ShowPlay speaker (Raspberry Pi)

A Raspberry Pi as a **network speaker** for the show: the ShowPlay bridge and the ShowPlay apps of EZPlayer send their
sounds to it, and it plays them on its sound output. Handy to have the sound outside next to the lights, with the Pi
on an amplifier or powered speakers, while the show computer stays indoors.

What it plays, when "Where it plays" is set to **A Raspberry Pi on the network**:
- the endings of the games (the fanfare, the "wah wah", your own WAV files and the voice saying the words);
- the bell and the songs of guess the song (the fun app, and the /fun page of the bridge);
- the songs sung by visitors (the sing app, and the bridge).

It is an extra option: everything else still works as before, and if the Pi does not answer (switched off, wrong
address, wrong key) the sound plays on the show computer instead, and the log says why.

## What you need

- A Raspberry Pi (3, 4, 5 or Zero 2 W) with Raspberry Pi OS (Lite is enough), on the same network as the show
  computer (cable is best; Wi-Fi works).
- Its sound output: the 3.5 mm jack (Pi 3 and 4), HDMI, a USB sound card, or a DAC board (HiFiBerry and the like), to
  an amplifier or powered speakers.
- A **fixed IP address** for the Pi (a DHCP reservation in the router), so the address never changes.

## Setting it up

1. Copy this folder (`showplay_speaker.py`, `speaker_page.html` and `install.sh`) to the Pi, for example with a USB
   stick or `scp -r pi-speaker user@<the Pi's IP>:~`.
2. On the Pi, in this folder:

   ```
   sh install.sh
   ```

   It installs `alsa-utils` if needed, copies the program to `/opt/showplay-speaker` and makes it start by itself when
   the Pi starts. At the end it prints the address to use.
3. Open **its page** in a browser on the show computer or a phone: `http://<the Pi's IP>:8765`. From there, with no
   more commands:
   - **🔗 Address for the apps:** the address to copy into the apps;
   - **🔊 Sound:** the volume and the sound output (jack, HDMI, a USB sound card… as the Pi lists them), and **▶ Try a
     sound** to hear the fanfare;
   - **🎵 Last sounds:** what it played, from which computer, and why a sound could not play;
   - **⚙️ Settings:** its name, and a **key** (the apps must give it to play sounds, and the page asks for it once per
     browser to change anything), or **Remove the key**.

   The settings are kept in `~/.showplay-speaker.json` on the Pi and win over the options of `install.sh`.
4. In the settings of each app (and on the /fun page of the bridge), set **Where it plays** to **A Raspberry Pi on the
   network** and put in the Pi's IP address. Press **Try a sound** on the /fun page to hear it.

Options, given to `install.sh` (run it again to change them; the page can change all of them except the port):

| Option | What it does |
| --- | --- |
| `--key SECRET` | the apps must give this key (the "key" box in their settings); without it anyone on the network could send sounds |
| `--device hw:1,0` | the sound output, when not the default (`aplay -l` lists them; a USB sound card is often `hw:1,0`) |
| `--volume 80` | a volume for everything it plays (5 to 100; the apps also have their own) |
| `--port 9000` | another port (then add it to the address in the apps: `192.168.1.70:9000`) |

For example: `sh install.sh --key natal2026 --device hw:1,0`. To remove it: `sh install.sh --remove`.

## Sound output on the Pi

- Pick the output with `sudo raspi-config` → System Options → Audio, or with `--device`.
- Test the speakers with `speaker-test -t wav -c 2` (Ctrl+C to stop).
- Set the Pi's own volume with `alsamixer` (keep it high, around 90%, and use the amplifier for the rest).
- The Pi 5 has no jack: use HDMI, a USB sound card or a DAC board.

## Checking and troubleshooting

- Its page (`http://<the Pi's IP>:8765`) shows the last sounds and why one could not play.
- The Pi's log: `journalctl -u showplay-speaker -f` (it writes a line for each sound it plays, and why one could not
  play).
- **Nothing at all:** open `http://<the Pi's IP>:8765/ping` on the show computer. No answer: check the IP address, that
  both are on the same network, and `sudo systemctl status showplay-speaker` on the Pi.
- **"wrong key":** the key in the app's settings must be the same as `--key`.
- **It answers but stays silent:** check the output (`--device`, `raspi-config`), the volume (`alsamixer`) and the
  amplifier; `aplay /usr/share/sounds/alsa/Front_Center.wav` must be heard.
- One sound at a time: when two arrive together, the second waits its turn (at most a minute).

## How it works

`showplay_speaker.py` is a small web server (Python 3, standard library only) on port 8765:
- `GET /`: its page; `GET /api/state`: what the page shows; `POST /api/settings` and `POST /api/test` (with the key,
  when one is set): what the page changes;
- `GET /ping`: answers that it is there;
- `POST /play` with a WAV file as the body (header `X-ShowPlay-Key` when a key is set): plays it with `aplay` (or
  `paplay` / `pw-play`) and answers when it has ended, so the apps keep their timing (a singing prop's mouth follows
  the song).

It also runs on any Linux computer, and by hand: `python3 showplay_speaker.py --port 8765`.
