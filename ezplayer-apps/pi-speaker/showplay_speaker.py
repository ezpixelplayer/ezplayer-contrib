#!/usr/bin/env python3
# This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
# This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.
"""
ShowPlay speaker: a Raspberry Pi (or any Linux computer) that plays the show's sounds sent over the network.

The ShowPlay bridge and the ShowPlay apps of EZPlayer send a WAV file to this program when "Where it plays" is set to
"A Raspberry Pi on the network"; it plays it on the Pi's sound output (jack, HDMI, a USB sound card or a DAC board)
and answers when the sound has ended. One sound at a time: the others wait their turn (at most a minute).

    python3 showplay_speaker.py [--port 8765] [--key SECRET] [--device hw:1,0] [--volume 100]

Its own page, http://<the Pi's address>:8765/ in any browser of the network, shows what it played and sets the volume,
the sound output, the key and its name (saved in ~/.showplay-speaker.json), with a button to try a sound.

  GET  /       its page;  GET /api/state  what the page shows;  POST /api/settings, /api/test  (with the key, when set)
  GET  /ping   -> {"ok": true, "name": "ShowPlay speaker", "version": 1, "device": "..."}  (to check it from a browser)
  POST /play   a WAV file as the body (at most 40 MB); header X-ShowPlay-Key when a key is set
               -> {"ok": true, "secs": 1.7} once it has played, or {"ok": false, "error": "..."}

Plays with aplay (alsa-utils), or paplay / pw-play when aplay is missing. Only Python 3's standard library is needed.
"""

import argparse
import hmac
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = 2
MAX_BYTES = 40 * 1024 * 1024
PLAY_LOCK = threading.Lock()
ARGS = None
CONF_FILE = os.path.expanduser("~/.showplay-speaker.json")
RECENT = []            # the last sounds: {at, from, secs, ok, error}
STARTED = time.time()


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def note(src, secs, err=""):
    RECENT.insert(0, {"at": time.strftime("%H:%M:%S"), "from": src, "secs": round(secs, 1), "ok": not err, "error": err})
    del RECENT[20:]


def load_conf():
    """the settings saved from the page win over the command line"""
    try:
        with open(CONF_FILE) as f:
            c = json.load(f)
    except Exception:
        return
    if isinstance(c.get("volume"), int):
        ARGS.volume = max(5, min(100, c["volume"]))
    if isinstance(c.get("device"), str):
        ARGS.device = c["device"]
    if isinstance(c.get("key"), str):
        ARGS.key = c["key"]
    if isinstance(c.get("name"), str):
        ARGS.name = c["name"][:40]


def save_conf():
    tmp = CONF_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"volume": ARGS.volume, "device": ARGS.device, "key": ARGS.key, "name": ARGS.name}, f)
    os.replace(tmp, CONF_FILE)


def devices():
    """the sound outputs: [["", "Default"], ["hw:1,0", "USB Audio (card 1)"], …] from aplay -l"""
    out = [["", "Default output"]]
    try:
        r = subprocess.run(["aplay", "-l"], capture_output=True, timeout=5, text=True)
        for line in r.stdout.splitlines():
            m = __import__("re").match(r"card (\d+): (\S+) \[(.*?)\], device (\d+): .*?\[(.*?)\]", line)
            if m:
                out.append(["plughw:%s,%s" % (m.group(1), m.group(4)), "%s – %s (card %s, device %s)" % (m.group(3), m.group(5), m.group(1), m.group(4))])
    except Exception:
        pass
    if ARGS.device and not any(d[0] == ARGS.device for d in out):
        out.append([ARGS.device, ARGS.device])
    return out


def test_sound():
    """a short fanfare, as a WAV (bytes)"""
    import array
    import math
    rate = 22050
    a = array.array("h", bytes(2 * int(1.7 * rate)))
    for at, f, secs in ((0.0, 523, 0.14), (0.16, 659, 0.14), (0.32, 784, 0.14), (0.5, 1047, 0.9)):
        s0, n, ph = int(at * rate), int(secs * rate), 0.0
        for i in range(n):
            t = i / rate
            ph += 2 * math.pi * f / rate
            env = min(1.0, t / 0.01) * min(1.0, (secs - t) / 0.06)
            a[s0 + i] = int(max(-32767, min(32767, a[s0 + i] + (math.sin(ph) * 0.6 + math.sin(2 * ph) * 0.25 + math.sin(3 * ph) * 0.15) * env * 20000)))
    if sys.byteorder == "big":
        a.byteswap()
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(a.tobytes())
    return out.getvalue()


def my_ip():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return ""


def player_cmd(path):
    if shutil.which("aplay"):
        return ["aplay", "-q"] + (["-D", ARGS.device] if ARGS.device else []) + [path]
    if shutil.which("paplay"):
        return ["paplay", path]
    if shutil.which("pw-play"):
        return ["pw-play", path]
    return None


def scaled(data, volume):
    """the WAV with its samples scaled (16-bit only; anything else is played as it came)"""
    if volume >= 100:
        return data
    try:
        import array
        with wave.open(io.BytesIO(data)) as w:
            if w.getsampwidth() != 2:
                return data
            params, frames = w.getparams(), w.readframes(w.getnframes())
        a = array.array("h", frames)
        if sys.byteorder == "big":
            a.byteswap()
        f = volume / 100
        a = array.array("h", (int(x * f) for x in a))
        if sys.byteorder == "big":
            a.byteswap()
        out = io.BytesIO()
        with wave.open(out, "wb") as w:
            w.setparams(params)
            w.writeframes(a.tobytes())
        return out.getvalue()
    except Exception:
        return data


def play(data):
    """plays a WAV (bytes) and returns its length in seconds; raises with a reason when it cannot"""
    try:
        with wave.open(io.BytesIO(data)) as w:
            secs = w.getnframes() / float(w.getframerate())
    except Exception:
        raise RuntimeError("not a WAV file")
    if secs > 600:
        raise RuntimeError("longer than 10 minutes")
    fd, path = tempfile.mkstemp(suffix=".wav", prefix="showplay-speaker-")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(scaled(data, ARGS.volume))
        cmd = player_cmd(path)
        if not cmd:
            raise RuntimeError("no program to play sounds (install alsa-utils: sudo apt install alsa-utils)")
        r = subprocess.run(cmd, capture_output=True, timeout=secs + 15)
        if r.returncode != 0:
            err = (r.stderr or b"").decode(errors="ignore").strip().splitlines()
            raise RuntimeError("%s could not play it: %s" % (cmd[0], err[-1] if err else r.returncode))
        return secs
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


PAGE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'speaker_page.html'), encoding='utf-8').read() if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'speaker_page.html')) else '<h1>ShowPlay speaker</h1><p>speaker_page.html is missing next to showplay_speaker.py.</p>'


class Handler(BaseHTTPRequestHandler):
    server_version = "ShowPlaySpeaker/%d" % VERSION

    def log_message(self, *a):
        pass

    def answer(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def key_ok(self):
        return not ARGS.key or hmac.compare_digest(self.headers.get("X-ShowPlay-Key", ""), ARGS.key)

    def body_json(self):
        try:
            n = min(int(self.headers.get("Content-Length", "0")), 10000)
            return json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return {}

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/":
            body = PAGE.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        if path == "/api/state":
            return self.answer(200, {"ok": True, "version": VERSION, "name": ARGS.name, "ip": my_ip(), "port": ARGS.port,
                                     "volume": ARGS.volume, "device": ARGS.device, "devices": devices(), "key": bool(ARGS.key),
                                     "player": (player_cmd("x.wav") or ["none"])[0], "busy": PLAY_LOCK.locked(),
                                     "up": int(time.time() - STARTED), "recent": RECENT})
        if path == "/ping":
            return self.answer(200, {"ok": True, "name": "ShowPlay speaker", "label": ARGS.name, "version": VERSION, "device": ARGS.device or "default",
                                     "key": bool(ARGS.key), "busy": PLAY_LOCK.locked()})
        self.answer(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path in ("/api/settings", "/api/test"):
            if not self.key_ok():
                return self.answer(403, {"ok": False, "error": "wrong key"})
            if path == "/api/test":
                if not PLAY_LOCK.acquire(timeout=20):
                    return self.answer(503, {"ok": False, "error": "busy playing other sounds"})
                try:
                    secs = play(test_sound())
                    note("this page (test)", secs)
                    return self.answer(200, {"ok": True, "secs": round(secs, 2)})
                except Exception as e:
                    note("this page (test)", 0, str(e))
                    return self.answer(500, {"ok": False, "error": str(e)})
                finally:
                    PLAY_LOCK.release()
            b = self.body_json()
            if isinstance(b.get("volume"), (int, float)):
                ARGS.volume = max(5, min(100, int(b["volume"])))
            if isinstance(b.get("device"), str) and len(b["device"]) <= 40 and all(ch.isalnum() or ch in ":,._-" for ch in b["device"]):
                ARGS.device = b["device"]
            if isinstance(b.get("key"), str) and len(b["key"]) <= 64:
                ARGS.key = b["key"].strip()
            if isinstance(b.get("name"), str):
                ARGS.name = b["name"].strip()[:40] or "ShowPlay speaker"
            try:
                save_conf()
            except Exception as e:
                return self.answer(500, {"ok": False, "error": "could not save: %s" % e})
            log("settings changed: volume %d%%, device %s%s" % (ARGS.volume, ARGS.device or "default", ", with a key" if ARGS.key else ""))
            return self.answer(200, {"ok": True})
        if path != "/play":
            return self.answer(404, {"ok": False, "error": "not found"})
        if ARGS.key and not hmac.compare_digest(self.headers.get("X-ShowPlay-Key", ""), ARGS.key):
            return self.answer(403, {"ok": False, "error": "wrong key"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            n = 0
        if n <= 44 or n > MAX_BYTES:
            return self.answer(413 if n > MAX_BYTES else 400, {"ok": False, "error": "a WAV file of up to 40 MB is needed"})
        data = self.rfile.read(n)
        if not PLAY_LOCK.acquire(timeout=60):
            return self.answer(503, {"ok": False, "error": "busy playing other sounds"})
        try:
            secs = play(data)
            log("played %.1f s from %s" % (secs, self.client_address[0]))
            note(self.client_address[0], secs)
            self.answer(200, {"ok": True, "secs": round(secs, 2)})
        except Exception as e:
            log("could not play a sound from %s: %s" % (self.client_address[0], e))
            note(self.client_address[0], 0, str(e))
            self.answer(500, {"ok": False, "error": str(e)})
        finally:
            PLAY_LOCK.release()


def main():
    global ARGS
    p = argparse.ArgumentParser(description="ShowPlay speaker: plays the show's sounds sent over the network")
    p.add_argument("--port", type=int, default=int(os.environ.get("SHOWPLAY_SPEAKER_PORT", 8765)))
    p.add_argument("--key", default=os.environ.get("SHOWPLAY_SPEAKER_KEY", ""), help="a key the sender must give (optional)")
    p.add_argument("--device", default=os.environ.get("SHOWPLAY_SPEAKER_DEVICE", ""), help="the ALSA device, e.g. hw:1,0 (aplay -l lists them)")
    p.add_argument("--volume", type=int, default=int(os.environ.get("SHOWPLAY_SPEAKER_VOLUME", 100)), help="5 to 100")
    p.add_argument("--name", default="ShowPlay speaker", help="its name on its page")
    ARGS = p.parse_args()
    load_conf()
    ARGS.volume = max(5, min(100, ARGS.volume))
    srv = ThreadingHTTPServer(("0.0.0.0", ARGS.port), Handler)
    log("ShowPlay speaker %d on port %d (device %s, volume %d%%%s)" % (VERSION, ARGS.port, ARGS.device or "default", ARGS.volume,
                                                                       ", with a key" if ARGS.key else ""))
    if not player_cmd("x.wav"):
        log("warning: no program to play sounds; install alsa-utils (sudo apt install alsa-utils)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
