#!/usr/bin/env python3
# ShowPlay — v18 (MerryOnCherry)   (called Light Cube up to v9)
#
# Visitors play with the lights of a show from their phone: they scan a QR code on the wall and send a message, a
# picture, an effect or a drawing to a cube of LED matrices, play games on it (Four in a Row, Tic-tac-toe, Simon, Count the colours, Snake, Space Invaders, Pong, Race to the
# Star),
# take turns to play the lights of the props, sing into the phone and make a singing prop sing it, or light up props of an EZPlayer
# show. The cube is independent: no xLights and no show player needed. This bridge draws each request and
# sends the pixels straight to the cube's controller over DDP (WLED, ESPixelStick or any DDP board). Each side of the
# cube is set up on the bridge's own control page (board IP, first LED, size and wiring).
#
#     phone ──► visitors' page ──► ntfy.sh ──► showplay_bridge.py ──DDP──► controller of the cube
#
# Optional: a side can instead be a matrix model of an EZPlayer show; the bridge then sends it through EZPlayer's
# overlay API and the request shows on top of the sequence that is playing.
#
# Control page, on the home network:  http://<this-computer's-ip>:8099
# Mixer and Keys (pads and faders for whoever runs the show):  http://<this-computer's-ip>:8099/mixer
# A MIDI controller or keyboard can play them too (read by this bridge on Windows and Linux, or by the page in Chrome).
# Uses only the Python 3 standard library (nothing to install). Runs on Windows, macOS and Linux (x64 and arm64).
# Start:  python showplay_bridge.py  (Windows)   or   python3 showplay_bridge.py  (Linux / Raspberry Pi)
# Settings are kept in showplay_config.json, next to this file (a cube_config.json from Light Cube is taken over).

import json, os, sys, time, threading, queue, unicodedata, re, socket, secrets, struct, math, random, collections
import urllib.request, urllib.parse, urllib.error
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# IPv4 first (v20). Python tries a server's addresses one after another, waiting up to the whole timeout for each.
# ntfy.sh has 3 IPv6 addresses: on a network where IPv6 does not really work, every post waited 3 x 10 s before
# trying IPv4, so the phones got each game board about 30 s late (browsers and EZPlayer try both at once and were fine).
_getaddrinfo = socket.getaddrinfo


def _getaddrinfo_v4_first(*a, **k):
    return sorted(_getaddrinfo(*a, **k), key=lambda r: r[0] != socket.AF_INET)


socket.getaddrinfo = _getaddrinfo_v4_first

# At most 3 s to connect to each address (v21), so even if the first addresses tried do not answer at all, the next
# ones are tried within seconds instead of after the whole timeout. Once connected, the usual timeout applies to the
# answer. (http.client looks socket.create_connection up each time it connects, so this covers urllib too.)
CONNECT_EACH = 3.0


def _create_connection(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None, **kw):
    host, port = address[0], address[1]
    err = None
    for fam, typ, proto, _, sa in socket.getaddrinfo(host, port, 0, socket.SOCK_STREAM):
        sock = None
        try:
            sock = socket.socket(fam, typ, proto)
            after = socket.getdefaulttimeout() if timeout is socket._GLOBAL_DEFAULT_TIMEOUT else timeout
            sock.settimeout(CONNECT_EACH if after is None else min(CONNECT_EACH, after))
            if source_address:
                sock.bind(source_address)
            sock.connect(sa)
            sock.settimeout(after)
            return sock
        except OSError as e:
            err = e
            if sock is not None:
                sock.close()
    raise err if err else OSError("getaddrinfo returned nothing for %s" % host)


socket.create_connection = _create_connection

VERSION = "v23"
PORT = 8099
RELAY = "https://ntfy.sh/"
CFG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "showplay_config.json")
OLD_CFG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cube_config.json")   # Light Cube v1-v9
QUEUE_MAX = 20
RATE_MAX = 20         # at most 20 accepted requests per minute, from anywhere
FACE_MAX = 128        # largest side (the same limit as the visitors' page)
FPS = 20              # frames per second sent to the sides
DDP_PORT = 4048

PAL = ["000000", "ffffff", "ff2a2a", "ff7a1a", "ffd23f", "39d353", "2bb7ff", "9b5cff", "ff4fd8"]   # the same as the page
BAD = ["merda", "caralho", "foda", "fodase", "puta", "cabrao", "cona", "piroca", "pila", "paneleiro", "filhodaputa",
       "corno", "cu", "mamas", "boceta", "porra", "fuck", "shit", "bitch", "dick", "pussy", "cunt", "nigger", "nazi", "hitler"]
GIF_OK = re.compile(r"^(hw|xm|ev)-[a-z0-9]{2,20}\.gif$")
GIFX_MAX = 65536      # animated GIF made on the visitor's phone (ntfy attachment): largest size
GIFX_URL = "https://ntfy.sh/file/"
GIFX_FX = {"orig", "still", "blink", "pulse", "rainbow", "bounce", "shake", "slide", "grow", "shine", "snow", "sparkle", "hearts"}

S = {   # settings (kept in showplay_config.json)
    "on": False,
    "topic": "",                       # the show code in the QR address (made once, on the first start)
    "title": "MerryOnCherry",          # the show's name, at the top of the visitors' page
    "page": "",                        # where the visitors' page is published, e.g. https://name.github.io/showplay/
    "ezp": "http://127.0.0.1:3000",    # EZPlayer address, only for sides sent through EZPlayer (port of its web UI)
    "faces": [],          # sides of the cube, see FACE_KEYS: {"n": name for the visitors, "w", "h", "out": "ddp" or "ezp", ...}
    "end_dark": False,    # True = a side goes dark when its request ends; False = the board goes back to its own effect
    "seconds": {"text": 20, "gif": 12, "draw": 15, "fx": 180, "prop": 20}, "theme": "hw", "approve": False,
    "props": [],          # props visitors can light up (EZPlayer models): [{"n": name, "e": emoji, "models": [...], "across": bool}]
    "wait": 0,            # seconds between two requests from the same phone (0 = no wait)
    "hold": False,        # True = the last request stays on the lights until another arrives (time for photos)
    "wait_turn": False,   # False = a new request replaces what is on that side; True = it waits for the one before to end
    "free": True,         # True = free text (with a bad-word filter); False = ready messages only
    "games": True,        # True = visitors can play games on the cube
    "game_list": ["c4", "ttt", "simon", "count", "snake", "invaders", "pong", "race"],
    "race": {},           # Race to the Star: track, star, ways to play, players, levels, difficulty, effects (race panel)
    "race_profiles": {},  # Race to the Star: saved settings by name   # visitors' games: c4 Four in a Row, ttt Tic-tac-toe, simon, count (Count the colours), snake
    "cpu_level": "normal",   # the computer in Four in a Row and Tic-tac-toe: easy, normal or hard
    "fps": FPS,           # frames per second sent to the lights: 20, or 15 / 10 on a slower computer such as a Raspberry Pi
    "mixer_idle": 15,     # Mixer: minutes untouched before the lights go back to the visitors and the show (0 = never)
    "mixer_scenes": [],   # Mixer: 8 saved scenes
    "keys_set": {},       # Keys: each key's colour, effect and level
    "keys_glob": {},      # Keys: attack, release and colour of all keys
    "sing": True,         # visitors can record a song and make a singing model (or a prop, or the cube) sing it
    "sing_approve": False,   # True = each recording waits on the control page until you press Play
    "sing_volume": 100,   # volume of the recordings on this computer's speaker (%)
    "sing_device": "",    # Linux / Raspberry Pi: the sound output (from aplay -L); "" = the default
    "sing_delay": 0.15,   # seconds the mouth waits for the speaker to start (adjust if the mouth is early or late)
    "sing_props": True,   # props can be picked to sing (they glow with the voice)
    "sing_cube": True,    # the sides of the cube can be picked to sing (a drawn face)
    "sing_off": [],       # singers visitors cannot pick
    "sing_names": {},     # names and emoji you gave to the singers
    "play": True,         # visitors can take turns to play the lights (the models of the props below)
    "play_secs": 30,      # seconds of each visitor's turn
    "play_props": None,   # which props visitors can play (list of numbers); None = all
    "midi_native": True,  # MIDI: the bridge reads the MIDI devices itself (Windows, Linux, Raspberry Pi)
    "midi_base": 36,      # MIDI: the note that plays the first key (36 = C2, the first pad of most pad controllers)
    "midi_map": {},       # MIDI: learned notes and CCs -> controls of the Mixer and Keys pages
    "advent": {},         # Advent calendar: on, first day, doors (effect, message or game), unlock games by day, test day
    "tree": {},           # Decorate the tree: models, number of baubles, wait between baubles, how long it shows…
    "tree_orn": "",       # Decorate the tree: the baubles hung so far (one digit per spot: 0 = free, 1-8 = colour)
    "ntfy_day": {},       # ntfy.sh: today's counts (messages posted and received, 429 answers)
}
# ready messages (the same as the visitors' page)
QUICK = {
    "hw": ["Happy Halloween!", "Boo!", "Trick or treat!", "Hello!", "Spooky!", "Pumpkin!"],
    "xm": ["Merry Christmas!", "Happy Holidays!", "Ho ho ho!", "Hello!", "Santa!", "Let it snow!"],
    "ev": ["Happy Birthday!", "Hooray!", "Hello!", "Happy New Year!", "Happy Easter!", "Love you!"],
    "": ["Hello!", "Hooray!", "Boo!", "Merry Christmas!", "Happy Halloween!", "Happy Birthday!"],
}
# effects visitors can pick (the same keys as the page), drawn by this bridge
FX_LIST = {
    "hw": [("haunted", "Haunted house"), ("eyes", "Eyes in the dark"), ("fire", "Fire"), ("lightning", "Lightning"),
           ("firenoise", "Magic flames"), ("blackhole", "Black hole")],
    "xm": [("snowfall", "Falling snow"), ("candy", "Candy cane"), ("retro", "Christmas tree"), ("twinkle", "Twinkling stars"),
           ("fireworks", "Fireworks"), ("bursts", "Colour bursts")],
    "ev": [("rainbow", "Rainbow"), ("fireworks", "Fireworks"), ("plasma", "Plasma"), ("ripple", "Ripples"),
           ("matrix", "Falling code"), ("pacifica", "Ocean")],
}
FX_NAMES = {k: n for v in FX_LIST.values() for k, n in v}


def isint(v):
    return isinstance(v, int) and not isinstance(v, bool)


lock = threading.RLock()
jobs = queue.Queue(QUEUE_MAX)
pending = []          # requests waiting for approval
logs = []
recent = collections.deque()   # (time, request) of the requests accepted in the last minute
now_showing = {"what": ""}
ezp_state = {"ok": False, "targets": [], "msg": "not contacted yet", "at": 0}


def log(*a):
    line = time.strftime("%H:%M:%S ") + " ".join(str(x) for x in a)
    try:
        print(line, flush=True)
    except Exception:
        pass   # no console with pythonw
    with lock:
        logs.append(line)
        del logs[:-60]


def load():
    sec = dict(S["seconds"])
    took_over = False
    for path in (CFG_FILE, OLD_CFG_FILE):   # the settings of a Light Cube bridge are taken over, show code included
        try:
            with open(path, encoding="utf-8") as f:
                S.update(json.load(f))
            took_over = path == OLD_CFG_FILE
            break
        except Exception:
            pass
    S["seconds"] = dict(sec, **S["seconds"])
    for f in S["faces"]:   # sides saved by v1-v3 were all EZPlayer models
        if "out" not in f:
            f["out"] = "ezp" if f.get("model") else "ddp"
    if not S["topic"]:
        S["topic"] = "showplay-" + secrets.token_hex(6)   # the show code, made once (older codes start with cube-)
        save()
    elif took_over:
        save()
    if isinstance(S.get("game_list"), list) and set(S["game_list"]) in ({"c4", "ttt", "simon"}, {"c4", "ttt", "simon", "count", "snake"},
                                                                         {"c4", "ttt", "simon", "count", "snake", "invaders"},
                                                                         {"c4", "ttt", "simon", "count", "snake", "invaders", "pong"}):
        S["game_list"] = list(GAMES)   # settings saved by v13 to v17 had every game of that time on: the new ones too
    TREE["orn"] = S.get("tree_orn", "") if isinstance(S.get("tree_orn"), str) else ""
    if isinstance(S.get("keys_set"), dict):
        KEYS["set"].update({k: v for k, v in S["keys_set"].items() if isinstance(v, dict)})
    if isinstance(S.get("keys_glob"), dict):
        KEYS.update({k: float(v) for k, v in S["keys_glob"].items() if k in ("attack", "release", "hue") and isinstance(v, (int, float))})


def save():
    with open(CFG_FILE, "w", encoding="utf-8") as f:
        json.dump(S, f, indent=1, ensure_ascii=False)


def page_base():
    p = S.get("page", "").strip()
    return p if p.endswith("/") else p + "/" if p else ""


def gif_site():
    return page_base() + "gifs/"


def qr_url(theme=""):
    if not page_base():
        return ""
    return "%s?t=%s%s" % (page_base(), S["topic"], "&theme=" + theme if theme else "")


def plain(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()


def is_bad(s):
    n = plain(s).lower().translate(str.maketrans("0@1!345$", "ooiieass"))
    words = re.split(r"[^a-z]+", n)
    joined = re.sub(r"[^a-z]", "", n)
    return any(b in words or (len(b) >= 5 and b in joined) for b in BAD)


def hexrgb(c):
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def fetch(url, limit=None, timeout=15):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read() if limit is None else r.read(limit)


# ------------------------------------------------------------------------------------- EZPlayer ----
def ezp_call(method, path, body=None, timeout=5):
    url = S["ezp"].rstrip("/") + path
    data, headers = None, {}
    if body is not None:
        data, headers = json.dumps(body).encode(), {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read() or b"{}")
        except Exception:
            return {"ok": False, "error": "HTTP %d" % e.code}


def ezp_targets():
    """the models that can take an overlay, with their grid size"""
    try:
        r = ezp_call("GET", "/api/ezp/overlays/targets")
        if not r.get("ok"):
            ezp_state.update(ok=False, msg=r.get("error") or "EZPlayer gave a bad answer", at=time.time())
            return []
        t = [{"model": x.get("model", ""), "w": x.get("width") or 0, "h": x.get("height") or 0, "nodes": x.get("nodeCount", 0)}
             for x in r.get("targets", []) if x.get("model")]
        ezp_state.update(ok=True, targets=t, msg="connected (%d models)" % len(t), at=time.time(), layoutVersion=r.get("layoutVersion"))
        return t
    except Exception as e:
        ezp_state.update(ok=False, msg="not answering (%s)" % e, at=time.time())
        return []


def uses_ezp():
    rc = S.get("race") or {}
    return (bool(S.get("props")) or any(f.get("out") == "ezp" for f in S["faces"]) or bool(S.get("sing")) or
            bool(rc.get("models") or rc.get("pairs")) or bool((S.get("tree") or {}).get("models")))


def ezp_watch():
    while True:
        if not uses_ezp():
            ezp_state.update(ok=False, msg="not used (all sides go straight to their board)")
            time.sleep(5)
            continue
        was = ezp_state["ok"]
        ezp_targets()
        if was != ezp_state["ok"]:
            log("EZPlayer:", ezp_state["msg"])
            threading.Thread(target=publish_status, daemon=True).start()
        time.sleep(15)


# -------------------------------------------------------------------------------------- drawing ----
FONT8 = bytes.fromhex("0000000000000000002020202000200000505050000000005050f850f85050002070a07028702000004050205010000040a0a040a0a0500000202020000000000020404040402000004020202020400000009060f060900000002020f8202000000000000030204000000000f00000000000000000207020001010204080800000205050505020000020602020207000006090106080f00000f0206010906000002060a0f020200000f080e010906000006080e09090600000f010202040400000609060909060000060909070106000000060600060600000003030003020400010204040201000000000f000f0000000402010102040000020501020002000304898a8a890403000609090f090900000e090e09090e000006090808090600000e090909090e00000f080e08080f00000f080e08080800000609080b0906000009090f09090900000702020202070000070202020a040000090a0c0a0a09000008080808080f0000090f0f0909090000090d0f0b0b09000006090909090600000e09090e080800000609090d0b0601000e09090e0909000006090402090600000702020202020000090909090906000009090909060600000909090f0f090000090906060909000008888502020200000f010204080f000007040404040700000808040201010000070101010107000002050000000000000000000000000f000402000000000000000007090907000008080e09090e0000000003040403000001010709090700000000060b0c0600000205040e04040000000006090701060008080e0909090000020006020207000001000101010502000808090e09090000060202020207000000000d0a8a8a800000000e0909090000000006090906000000000e090e080800000007090701010000000a0d08080000000003060106000004040e0405020000000009090907000000000505050200000000088a8a8500000000090606090000000009090709060000000f02040f000304020c0204030000020202020202000c02040304020c0000050a00000000000")      # 5x8 font (misc-fixed, public domain), ASCII 32..126
FONT16 = bytes.fromhex("000000000000000000000000000000000000000008080808080808000808000000002222222200000000000000000000000000001212127e24247e484848000000000000083e4948380e09493e08000000000000314a4a340808162929460000000000001c2222221c3945424639000000000808080800000000000000000000000000040808101010101010080804000000002010100808080808081010200000000000000008492a1c2a49080000000000000000000808087f080808000000000000000000000000000000180808100000000000000000007e000000000000000000000000000000000000181800000000000002020408081010204040000000000000182442424242424224180000000000000818280808080808083e0000000000003c4242020c102040407e0000000000003c4242021c020242423c000000000000040c142444447e0404040000000000007e4040407c020202423c0000000000001c2040407c424242423c0000000000007e0202040404080808080000000000003c4242423c424242423c0000000000003c4242423e02020204380000000000000000181800000018180000000000000000001818000000180808100000000000000204081020100804020000000000000000007e0000007e0000000000000000004020100804081020400000000000003c4242020408080008080000000000001c224a565252524e201e00000000000018242442427e424242420000000000007c4242427c424242427c0000000000003c42424040404042423c000000000000784442424242424244780000000000007e4040407c404040407e0000000000007e4040407c40404040400000000000003c424240404e4242463a000000000000424242427e42424242420000000000003e08080808080808083e0000000000001f040404040404444438000000000000424448506060504844420000000000004040404040404040407e000000000000424266665a5a4242424200000000000042626252524a4a4646420000000000003c42424242424242423c0000000000007c4242427c40404040400000000000003c4242424242425a663c0300000000007c4242427c48444442420000000000003c424240300c0242423c0000000000007f0808080808080808080000000000004242424242424242423c00000000000041414122222214140808000000000000424242425a5a6666424200000000000042422424181824244242000000000000414122221408080808080000000000007e02020408102040407e00000000000e080808080808080808080e0000000000404020101008080402020000000000701010101010101010101070000000182442000000000000000000000000000000000000000000000000007f00002010080000000000000000000000000000000000003c42023e4242463a00000000004040405c6242424242625c00000000000000003c4240404040423c00000000000202023a4642424242463a00000000000000003c42427e4040423c00000000000c1010107c10101010101000000000000000023a44444438203c42423c0000004040405c624242424242420000000000080800180808080808083e00000000000404000c04040404040404483000000000404044485060504844420000000000001808080808080808083e0000000000000000764949494949494900000000000000005c6242424242424200000000000000003c4242424242423c00000000000000005c6242424242625c40400000000000003a4642424242463a02020000000000005c6242404040404000000000000000003c4240300c02423c00000000000010107c1010101010100c0000000000000000424242424242463a00000000000000004242422424241818000000000000000041494949494949360000000000000000424224181824424200000000000000004242424242261a02023c0000000000007e0204081020407e00000000000c101008081010080810100c00000008080808080808080808080808080000003008081010080810100808300000000031494600000000000000000000")    # 8x16 font (misc-fixed, public domain)


def hsv(h, s=1.0, v=1.0):
    h = (h % 1.0) * 6
    i = int(h)
    f = h - i
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    r, g, b = [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)][i % 6]
    return int(r * 255), int(g * 255), int(b * 255)


RAINBOW = [hsv(i / 256) for i in range(256)]


def fade_table(k):
    return bytes(int(i * k) for i in range(256))


def heat_color(heat):
    heat = max(0, min(255, int(heat)))
    t = heat * 191 // 255
    ramp = (t & 63) << 2
    if t >= 128:
        return 255, 255, ramp
    if t >= 64:
        return 255, ramp, 0
    return ramp, 0, 0


HEAT = [heat_color(i) for i in range(256)]


class Anim:
    """a request being shown on a side: frame(t) returns w*h*3 RGB bytes, top row first"""
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.buf = bytearray(w * h * 3)

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y * self.w + x) * 3
            self.buf[i:i + 3] = bytes(c)

    def add(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y * self.w + x) * 3
            b = self.buf
            b[i] = min(255, b[i] + c[0]); b[i + 1] = min(255, b[i + 1] + c[1]); b[i + 2] = min(255, b[i + 2] + c[2])

    def frame(self, t):
        return self.buf


class Static(Anim):
    def __init__(self, w, h, rgb):
        super().__init__(w, h)
        self.buf = bytearray(rgb)


class Text(Anim):
    """text scrolling from right to left, repeating"""
    def __init__(self, w, h, text, color):
        super().__init__(w, h)
        if h >= 16:
            self.font, self.fw, self.fh, self.sc = FONT16, 8, 16, max(1, h // 16)
        else:
            self.font, self.fw, self.fh, self.sc = FONT8, 5, 8, max(1, h // 8)
        self.text = "".join(c if 32 <= ord(c) < 127 else "?" for c in text)
        self.color = bytes(color)
        self.top = (h - self.fh * self.sc) // 2
        self.tw = len(self.text) * self.fw * self.sc
        self.speed = 22 * self.sc      # pixels per second
        # column by column (already scaled): the lit rows of each column of the text
        self.cols = []
        for ch in self.text:
            g = (ord(ch) - 32) * self.fh
            for cx in range(self.fw):
                rows = [r for r in range(self.fh) if self.font[g + r] & (0x80 >> cx)]
                for _ in range(self.sc):
                    self.cols.append(rows)

    def frame(self, t):
        w, sc, buf = self.w, self.sc, self.buf
        buf[:] = bytes(len(buf))
        period = self.tw + w
        off = int(t * self.speed) % period
        for x in range(w):
            ci = x + off - w
            if 0 <= ci < len(self.cols):
                for r in self.cols[ci]:
                    for k in range(sc):
                        y = self.top + r * sc + k
                        if 0 <= y < self.h:
                            i = (y * w + x) * 3
                            buf[i:i + 3] = self.color
        return buf


# ----------------------------------------------------------------------------------------- GIF ----
def lzw_decode(data, min_size, count):
    clear = 1 << min_size
    eoi = clear + 1
    size = min_size + 1
    table = [bytes([i]) for i in range(clear)] + [b"", b""]
    out = bytearray()
    prev = None
    bitbuf = nbits = 0
    for byte in data:
        bitbuf |= byte << nbits
        nbits += 8
        while nbits >= size:
            code = bitbuf & ((1 << size) - 1)
            bitbuf >>= size
            nbits -= size
            if code == clear:
                del table[clear + 2:]
                size = min_size + 1
                prev = None
                continue
            if code == eoi:
                return out
            if prev is None:
                if code >= len(table):
                    return out
                prev = table[code]
                out += prev
                continue
            if code < len(table):
                entry = table[code]
                if len(table) < 4096:
                    table.append(prev + entry[:1])
            elif code == len(table):
                entry = prev + prev[:1]
                if len(table) < 4096:
                    table.append(entry)
            else:
                return out
            out += entry
            prev = entry
            if len(table) == (1 << size) and size < 12:
                size += 1
            if len(out) >= count:
                return out
    return out


def gif_decode(data, max_frames=300):
    """GIF (animated or not) -> (width, height, [(rgb bytes, duration in ms)])"""
    if data[:6] not in (b"GIF87a", b"GIF89a"):
        raise ValueError("not a GIF")
    W, H, fl = struct.unpack("<HHB", data[6:11])
    if not (0 < W <= 512 and 0 < H <= 512):
        raise ValueError("GIF too big")
    p = 13
    gct = None
    if fl & 0x80:
        n = 3 * (2 << (fl & 7))
        gct = data[p:p + n]
        p += n
    canvas = bytearray(W * H * 3)
    frames = []
    delay, transp, disposal = 100, None, 0
    while p < len(data):
        b = data[p]
        p += 1
        if b == 0x3B:
            break
        if b == 0x21:
            label = data[p]
            p += 1
            if label == 0xF9 and data[p] >= 4:
                pk = data[p + 1]
                delay = struct.unpack("<H", data[p + 2:p + 4])[0] * 10
                transp = data[p + 4] if pk & 1 else None
                disposal = (pk >> 2) & 7
            while p < len(data):
                n = data[p]
                p += 1
                if n == 0:
                    break
                p += n
            continue
        if b != 0x2C:
            break
        ix, iy, iw, ih, ifl = struct.unpack("<HHHHB", data[p:p + 9])
        p += 9
        ct = gct
        if ifl & 0x80:
            n = 3 * (2 << (ifl & 7))
            ct = data[p:p + n]
            p += n
        if ct is None:
            raise ValueError("GIF without colours")
        mcs = data[p]
        p += 1
        chunks = []
        while p < len(data):
            n = data[p]
            p += 1
            if n == 0:
                break
            chunks.append(data[p:p + n])
            p += n
        idx = lzw_decode(b"".join(chunks), mcs, iw * ih)
        if ifl & 0x40:   # interlaced
            order = list(range(0, ih, 8)) + list(range(4, ih, 8)) + list(range(2, ih, 4)) + list(range(1, ih, 2))
            rows = [None] * ih
            for k, r in enumerate(order):
                rows[r] = idx[k * iw:(k + 1) * iw]
            idx = b"".join(bytes(r or b"") for r in rows)
        before = bytes(canvas) if disposal == 3 else None
        ncol = len(ct) // 3
        for row in range(ih):
            y = iy + row
            if y >= H:
                break
            base = row * iw
            for col in range(iw):
                x = ix + col
                k = base + col
                if x >= W or k >= len(idx):
                    continue
                c = idx[k]
                if c == transp or c >= ncol:
                    continue
                o = (y * W + x) * 3
                canvas[o:o + 3] = ct[c * 3:c * 3 + 3]
        frames.append((bytes(canvas), delay if delay >= 20 else 100))
        if disposal == 2:
            for row in range(iy, min(H, iy + ih)):
                o = (row * W + ix) * 3
                canvas[o:o + 3 * max(0, min(iw, W - ix))] = bytes(3 * max(0, min(iw, W - ix)))
        elif disposal == 3 and before is not None:
            canvas = bytearray(before)
        delay, transp, disposal = 100, None, 0
        if len(frames) >= max_frames:
            break
    if not frames:
        raise ValueError("GIF without frames")
    return W, H, frames


def resample(rgb, sw, sh, w, h):
    if (sw, sh) == (w, h):
        return rgb
    out = bytearray(w * h * 3)
    for y in range(h):
        sy = y * sh // h
        for x in range(w):
            o = (sy * sw + x * sw // w) * 3
            i = (y * w + x) * 3
            out[i:i + 3] = rgb[o:o + 3]
    return bytes(out)


class Gif(Anim):
    def __init__(self, w, h, decoded):
        super().__init__(w, h)
        sw, sh, frames = decoded
        self.frames = [(resample(f, sw, sh, w, h), d / 1000) for f, d in frames]
        self.total = sum(d for _, d in self.frames) or 1

    def frame(self, t):
        if len(self.frames) == 1:
            return self.frames[0][0]
        t %= self.total
        for f, d in self.frames:
            if t < d:
                return f
            t -= d
        return self.frames[-1][0]


gif_cache = {}        # pack GIF name -> decoded


def pack_gif(name):
    if name not in gif_cache:
        if len(gif_cache) > 40:
            gif_cache.clear()
        gif_cache[name] = gif_decode(fetch(gif_site() + name, limit=1 << 20))
    return gif_cache[name]


# -------------------------------------------------------------------------------------- effects ----
class Fx(Anim):
    """the effects visitors pick (the same keys as the page), drawn here"""
    def __init__(self, w, h, key, cols=None):
        super().__init__(w, h)
        self.key, self.cols = key, cols
        self.last = 0.0
        self.r = random.Random()
        self.st = {}
        getattr(self, "init_" + key, lambda: None)()

    def c(self, i, default):
        return self.cols[i] if self.cols and i < len(self.cols) and any(self.cols[i]) else default

    def frame(self, t):
        dt = max(0.0, min(0.2, t - self.last))
        self.last = t
        getattr(self, "fx_" + self.key)(t, dt)
        return self.buf

    def fill(self, c):
        self.buf[:] = bytes(c) * (self.w * self.h)

    def fade(self, k):
        self.buf[:] = self.buf.translate(fade_table(k))

    # --- Halloween
    def fx_haunted(self, t, dt):
        w, h, b = self.w, self.h, self.buf
        flick = 0.75 + 0.25 * math.sin(t * 13) * math.sin(t * 7.3) if self.r.random() > 0.02 else 0.3
        for y in range(h):
            sy = math.sin(y * 0.37 - t * 1.3)
            for x in range(w):
                v = (math.sin(x * 0.29 + t) + sy + math.sin((x + y) * 0.19 + t * 0.7) + 3) / 6
                i = (y * w + x) * 3
                b[i] = int((40 + 110 * v) * flick)
                b[i + 1] = int(255 * max(0.0, v - 0.75) * 2.2 * flick)
                b[i + 2] = int((60 + 140 * v) * flick)

    def init_eyes(self):
        self.st["eyes"] = []

    def fx_eyes(self, t, dt):
        w, h = self.w, self.h
        s = max(1, h // 16)
        eyes = self.st["eyes"] = [e for e in self.st["eyes"] if t < e["end"]]
        if len(eyes) < max(1, w * h // 220) and self.r.random() < dt * 1.5:
            col = self.c(0, self.r.choice([(255, 30, 0), (255, 120, 0), (120, 255, 0), (255, 220, 0)]))
            eyes.append({"x": self.r.randrange(0, max(1, w - 4 * s)), "y": self.r.randrange(0, max(1, h - s)),
                         "start": t, "end": t + self.r.uniform(2.5, 5), "blink": t + self.r.uniform(0.8, 2.2), "c": col})
        self.fill((0, 0, 0))
        for e in eyes:
            if e["blink"] <= t < e["blink"] + 0.15:
                continue
            k = min(1.0, (t - e["start"]) / 0.6, (e["end"] - t) / 0.6)
            c = [int(v * k) for v in e["c"]]
            for dx in range(s):
                for dy in range(s):
                    self.px(e["x"] + dx, e["y"] + dy, c)
                    self.px(e["x"] + 3 * s + dx, e["y"] + dy, c)

    def init_fire(self):
        self.st["heat"] = [[0] * self.h for _ in range(self.w)]

    def fx_fire(self, t, dt):
        w, h, b, r = self.w, self.h, self.buf, self.r
        cool = (55 * 10) // h + 2
        for x, col in enumerate(self.st["heat"]):
            for y in range(h):
                col[y] = max(0, col[y] - r.randint(0, cool))
            for y in range(h - 1, 1, -1):
                col[y] = (col[y - 1] + col[y - 2] * 2) // 3
            if r.random() < 0.5:
                y = r.randint(0, min(2, h - 1))
                col[y] = min(255, col[y] + r.randint(160, 255))
            for y in range(h):
                i = ((h - 1 - y) * w + x) * 3
                b[i:i + 3] = bytes(HEAT[col[y]])

    def init_lightning(self):
        self.st["next"] = 0.5

    def fx_lightning(self, t, dt):
        self.fade(0.72)
        w, h = self.w, self.h
        if t >= self.st["next"]:
            self.st["next"] = t + self.r.uniform(1.5, 4)
            self.fill((30, 30, 60))
            x = self.r.randrange(w)
            col = self.c(0, (220, 220, 255))
            for y in range(h):
                self.px(x, y, col)
                if self.r.random() < 0.15:   # branch
                    bx, d = x, self.r.choice((-1, 1))
                    for yy in range(y, min(h, y + h // 4)):
                        bx += d if self.r.random() < 0.6 else 0
                        self.px(bx, yy, [v // 2 for v in col])
                x = max(0, min(w - 1, x + self.r.choice((-1, 0, 0, 1))))
        else:
            for i in range(2, len(self.buf), 3):
                self.buf[i] = max(self.buf[i], 6)

    def fx_firenoise(self, t, dt):
        w, h, b = self.w, self.h, self.buf
        for y in range(h):
            up = (h - 1 - y) / h
            for x in range(w):
                n = (math.sin(x * 0.45 + t * 1.7 + math.sin(y * 0.3 + t * 2.3)) + math.sin(y * 0.5 + t * 4.1 + x * 0.2) + 2) / 4
                i = (y * w + x) * 3
                b[i:i + 3] = bytes(HEAT[int(max(0.0, min(1.0, (1.15 - up * 1.3) * (0.45 + 0.75 * n))) * 255)])

    def init_blackhole(self):
        self.st["dots"] = [(self.r.uniform(0, 6.3), self.r.uniform(0.6, 1.8) * self.r.choice((-1, 1)), (i + 1) / 9, i / 8)
                           for i in range(8)]

    def fx_blackhole(self, t, dt):
        self.fade(0.82)
        cx, cy, rad = (self.w - 1) / 2, (self.h - 1) / 2, min(self.w, self.h) / 2 * 0.95
        for a0, sp, rr, hue in self.st["dots"]:
            rr = rr * (0.85 + 0.15 * math.sin(t * 0.7 + a0))
            a = a0 + t * sp
            self.px(int(round(cx + math.cos(a) * rad * rr)), int(round(cy + math.sin(a) * rad * rr)), hsv(hue + t * 0.05))

    # --- Christmas
    def init_snowfall(self):
        n = max(4, self.w * self.h // 40)
        self.st["flakes"] = [[self.r.uniform(0, self.w), self.r.uniform(0, self.h), self.r.uniform(0.15, 0.45) * self.h] for _ in range(n)]

    def fx_snowfall(self, t, dt):
        self.fill((0, 0, 18))
        col = self.c(0, (255, 255, 255))
        for f in self.st["flakes"]:
            f[1] += f[2] * dt
            f[0] += math.sin(t * 1.5 + f[2]) * dt * 1.5
            if f[1] >= self.h:
                f[0], f[1] = self.r.uniform(0, self.w), 0.0
            k = f[2] / (0.45 * self.h)
            self.px(int(f[0]) % self.w, int(f[1]), [int(v * (0.5 + 0.5 * k)) for v in col])

    def fx_candy(self, t, dt):
        w, h, b = self.w, self.h, self.buf
        c1, c2 = bytes(self.c(0, (255, 0, 0))), bytes(self.c(1, (255, 255, 255)))
        sw = max(2, w // 6)
        off = int(t * 8)
        for y in range(h):
            for x in range(w):
                i = (y * w + x) * 3
                b[i:i + 3] = c1 if ((x + y + off) // sw) % 2 else c2

    def init_retro(self):
        w, h = self.w, self.h
        top, bot = max(1, int(h * 0.12)), int(h * 0.82)
        mask = []
        for y in range(top, bot):
            half = (y - top + 1) / (bot - top) * (w * 0.42)
            mask += [(x, y) for x in range(w) if abs(x - (w - 1) / 2) <= half]
        self.st["mask"] = mask
        self.st["trunk"] = [(x, y) for y in range(bot, min(h, bot + max(1, h // 8))) for x in range(w) if abs(x - (w - 1) / 2) <= max(0.5, w / 16)]
        self.st["lights"] = [(x, y, self.r.choice([(255, 0, 0), (255, 200, 0), (0, 120, 255), (255, 0, 200), (255, 255, 255)]), self.r.uniform(0, 6.3), self.r.uniform(1.5, 4))
                             for x, y in self.r.sample(mask, min(len(mask), max(3, len(mask) // 10)))]
        self.st["top"] = top

    def fx_retro(self, t, dt):
        self.fill((0, 0, 0))
        for x, y in self.st["mask"]:
            self.px(x, y, (0, 90, 10))
        for x, y in self.st["trunk"]:
            self.px(x, y, (90, 45, 0))
        for x, y, c, ph, sp in self.st["lights"]:
            k = 0.25 + 0.75 * max(0.0, math.sin(t * sp + ph))
            self.px(x, y, [int(v * k) for v in c])
        cx, ty = (self.w - 1) // 2, self.st["top"] - 1
        k = 0.7 + 0.3 * math.sin(t * 5)
        star = [int(255 * k), int(210 * k), 0]
        for dx, dy in ((0, 0), (-1, 0), (1, 0), (0, -1), (0, 1)):
            self.px(cx + dx, ty + dy, star)

    def init_twinkle(self):
        n = self.w * self.h
        warm = [(255, 180, 60), (255, 120, 20), (255, 230, 150), (255, 60, 30), (200, 200, 255)]
        if self.cols:
            warm = [self.c(0, warm[0]), self.c(1, warm[1])]
        self.st["p"] = [(self.r.uniform(0, 6.3), self.r.uniform(0.6, 2.2), self.r.choice(warm)) for _ in range(n)]

    def fx_twinkle(self, t, dt):
        b = self.buf
        for i, (ph, sp, c) in enumerate(self.st["p"]):
            k = max(0.0, math.sin(t * sp + ph)) ** 6
            o = i * 3
            b[o] = int(c[0] * k); b[o + 1] = int(c[1] * k); b[o + 2] = int(c[2] * k)

    def init_fireworks(self):
        self.st.update(rockets=[], parts=[], next=0.2)

    def fx_fireworks(self, t, dt):
        w, h, r = self.w, self.h, self.r
        self.fade(0.78)
        if t >= self.st["next"]:
            self.st["next"] = t + r.uniform(0.5, 1.3)
            self.st["rockets"].append([r.uniform(w * 0.15, w * 0.85), h - 1.0, -h * r.uniform(0.9, 1.2), h * r.uniform(0.15, 0.45)])
        keep = []
        for k in self.st["rockets"]:
            k[1] += k[2] * dt
            if k[1] <= k[3]:
                hue = r.random()
                for _ in range(r.randint(18, 34)):
                    a, sp = r.uniform(0, 6.3), r.uniform(0.15, 0.45) * h
                    self.st["parts"].append([k[0], k[1], math.cos(a) * sp, math.sin(a) * sp, t + r.uniform(0.8, 1.5), hsv(hue + r.uniform(-0.05, 0.05), 0.8)])
            else:
                keep.append(k)
                self.px(int(k[0]), int(k[1]), (255, 200, 120))
        self.st["rockets"] = keep
        parts = []
        for p in self.st["parts"]:
            if t < p[4]:
                p[3] += h * 0.35 * dt
                p[0] += p[2] * dt
                p[1] += p[3] * dt
                self.px(int(p[0]), int(p[1]), p[5])
                parts.append(p)
        self.st["parts"] = parts

    def init_bursts(self):
        self.st.update(rings=[], next=0)

    def fx_bursts(self, t, dt):
        self.fade(0.8)
        w, h, r = self.w, self.h, self.r
        if t >= self.st["next"]:
            self.st["next"] = t + r.uniform(0.25, 0.7)
            self.st["rings"].append((r.uniform(0, w), r.uniform(0, h), t, r.random(), r.uniform(0.4, 0.8) * max(w, h)))
        rings = []
        for cx, cy, t0, hue, sp in self.st["rings"]:
            rad = (t - t0) * sp
            if rad > max(w, h):
                continue
            rings.append((cx, cy, t0, hue, sp))
            col = hsv(hue)
            for k in range(int(6.3 * rad) + 8):
                a = k / (int(6.3 * rad) + 8) * 6.283
                self.px(int(cx + math.cos(a) * rad), int(cy + math.sin(a) * rad), col)
        self.st["rings"] = rings

    # --- Other celebrations
    def fx_rainbow(self, t, dt):
        w, h, b = self.w, self.h, self.buf
        off = int(t * 60)
        k = 256 / (w + h)
        for y in range(h):
            for x in range(w):
                i = (y * w + x) * 3
                b[i:i + 3] = bytes(RAINBOW[(int((x + y) * k) + off) & 255])

    def fx_plasma(self, t, dt):
        w, h, b = self.w, self.h, self.buf
        sx = [math.sin(x * 0.31 + t) for x in range(w)]
        sy = [math.sin(y * 0.27 + t * 1.3) for y in range(h)]
        sxy = [math.sin(d * 0.17 + t * 0.7) for d in range(w + h)]
        for y in range(h):
            for x in range(w):
                i = (y * w + x) * 3
                b[i:i + 3] = bytes(RAINBOW[int((sx[x] + sy[y] + sxy[x + y] + 3) * 42.6 + t * 20) & 255])

    def init_ripple(self):
        self.st.update(drops=[], next=0)

    def fx_ripple(self, t, dt):
        w, h, b, r = self.w, self.h, self.buf, self.r
        if t >= self.st["next"]:
            self.st["next"] = t + r.uniform(0.6, 1.4)
            self.st["drops"].append((r.uniform(0, w), r.uniform(0, h), t))
        self.st["drops"] = [d for d in self.st["drops"] if t - d[2] < 2.5]
        c = self.c(0, (0, 160, 255))
        for y in range(h):
            for x in range(w):
                v = 0.0
                for cx, cy, t0 in self.st["drops"]:
                    d = math.hypot(x - cx, y - cy) - (t - t0) * max(w, h) * 0.45
                    if -2.5 < d < 2.5:
                        v += math.cos(d * 1.3) * (1 - (t - t0) / 2.5)
                v = max(0.0, min(1.0, v))
                i = (y * w + x) * 3
                b[i] = int(c[0] * v); b[i + 1] = int(c[1] * v); b[i + 2] = int(10 + (c[2] - 10) * v)

    def init_matrix(self):
        self.st["cols"] = [[self.r.uniform(-self.h, 0), self.r.uniform(0.4, 1.0) * self.h] for _ in range(self.w)]

    def fx_matrix(self, t, dt):
        self.fade(0.86)
        c = self.c(0, (0, 255, 40))
        head = [min(255, v + 150) for v in c]
        for x, col in enumerate(self.st["cols"]):
            col[0] += col[1] * dt
            if col[0] > self.h + self.r.uniform(0, self.h):
                col[0], col[1] = self.r.uniform(-self.h / 2, 0), self.r.uniform(0.4, 1.0) * self.h
            y = int(col[0])
            self.px(x, y - 1, c)
            self.px(x, y, head)

    def fx_pacifica(self, t, dt):
        w, h, b = self.w, self.h, self.buf
        for y in range(h):
            for x in range(w):
                v = (math.sin(x * 0.25 + t * 0.9 + math.sin(y * 0.2 + t * 0.3)) + math.sin(y * 0.3 - t * 0.7 + x * 0.1) + 2) / 4
                i = (y * w + x) * 3
                if v < 0.75:
                    k = v / 0.75
                    b[i] = 0; b[i + 1] = int(10 + 120 * k); b[i + 2] = int(40 + 110 * k)
                else:
                    k = (v - 0.75) / 0.25
                    b[i] = int(130 * k); b[i + 1] = int(130 + 100 * k); b[i + 2] = int(150 + 105 * k)


# ------------------------------------------------------------------------------- game: four in a row ----
# Two visitors play against each other (each on their own phone) or one plays against the computer. Moves come in on
# the show channel like any request; the bridge keeps the game, draws the board on the cube and posts the board on
# "<code>-game" (once per move) so the phones can show it.
C4_COLS, C4_ROWS = 7, 6
C4_COLOURS = {"hw": ("ff7a1a", "9b5cff"), "xm": ("ff2a2a", "39d353"), "ev": ("ff2a2a", "ffd23f"), "": ("ff2a2a", "ffd23f")}
C4_WAIT_JOIN = 90     # seconds to wait for a friend to join
C4_TURN = 45          # seconds for each move
C4_SHOW_END = 8       # seconds the result stays on the cube
PID_RE = re.compile(r"[a-z0-9]{12,32}")
TAG_RE = re.compile(r"[a-z0-9]{4,12}")


def c4_lines():
    out = []
    for r in range(C4_ROWS):
        for c in range(C4_COLS):
            for dr, dc in ((0, 1), (1, 0), (1, 1), (1, -1)):
                cells = [(r + k * dr, c + k * dc) for k in range(4)]
                if all(0 <= rr < C4_ROWS and 0 <= cc < C4_COLS for rr, cc in cells):
                    out.append([rr * C4_COLS + cc for rr, cc in cells])
    return out


C4_LINES = c4_lines()


def c4_drop_row(b, col):
    for r in range(C4_ROWS - 1, -1, -1):
        if b[r * C4_COLS + col] == 0:
            return r
    return -1


def c4_winner(b):
    for ln in C4_LINES:
        v = b[ln[0]]
        if v and b[ln[1]] == v and b[ln[2]] == v and b[ln[3]] == v:
            return v, ln
    return 0, None


def c4_score(b, me):
    """how good the board looks for player `me` (1 or 2)"""
    op = 3 - me
    s = 0
    for r in range(C4_ROWS):   # the middle column is worth more
        v = b[r * C4_COLS + 3]
        s += 3 if v == me else -3 if v == op else 0
    for ln in C4_LINES:
        m = o = 0
        for i in ln:
            if b[i] == me:
                m += 1
            elif b[i] == op:
                o += 1
        if o == 0:
            s += (0, 1, 3, 9)[m] if m < 4 else 0
        elif m == 0:
            s -= (0, 1, 3, 12)[o] if o < 4 else 0
    return s


def c4_negamax(b, depth, me, alpha, beta):
    w, _ = c4_winner(b)
    if w:
        return (10000 + depth) if w == me else -(10000 + depth)
    moves = [c for c in (3, 2, 4, 1, 5, 0, 6) if b[c] == 0]
    if not moves:
        return 0
    if depth == 0:
        return c4_score(b, me)
    best = -10 ** 9
    for c in moves:
        r = c4_drop_row(b, c)
        b[r * C4_COLS + c] = me
        v = -c4_negamax(b, depth - 1, 3 - me, -beta, -alpha)
        b[r * C4_COLS + c] = 0
        if v > best:
            best = v
        alpha = max(alpha, v)
        if alpha >= beta:
            break
    return best


def c4_cpu_move(b, me, level):
    moves = [c for c in range(C4_COLS) if b[c] == 0]
    if not moves:
        return -1
    depth = {"easy": 1, "normal": 3, "hard": 5}.get(level, 3)
    if level == "easy" and random.random() < 0.4:   # the easy computer makes mistakes on purpose
        return random.choice(moves)
    scores = {}
    for c in moves:
        bb = list(b)
        bb[c4_drop_row(bb, c) * C4_COLS + c] = me
        scores[c] = -c4_negamax(bb, depth - 1, 3 - me, -10 ** 9, 10 ** 9)
    top = max(scores.values())
    return random.choice([c for c, v in scores.items() if v >= top - (2 if level != "hard" else 0)])


class FourInARow:
    CODE, NAME, NCELLS, NMOVES = "c4", "four in a row", C4_ROWS * C4_COLS, C4_COLS

    def __init__(self):
        self.lock = threading.RLock()
        self.v = 0                 # changes every time the game changes
        self.reset()

    def reset(self):
        self.st = "idle"           # idle, waiting (for a friend), playing, over
        self.id = ""
        self.mode = ""             # "cpu" or "pvp"
        self.pids = ["", ""]       # each player's secret (only the bridge and that phone know it)
        self.tags = ["", ""]       # each player's public tag (in the posted board, so a phone knows which player it is)
        self.b = [0] * self.NCELLS
        self.turn = 0
        self.n = 0                 # number of moves
        self.last = -1
        self.last_at = 0.0
        self.win = []
        self.winner = 0            # 1 or 2, 3 = draw
        self.why = ""
        self.z = -1
        self.until = 0.0
        self.cpu_at = 0.0
        self.colours = C4_COLOURS.get(S["theme"], C4_COLOURS[""])
        self.v += 1

    def sides(self):
        with self.lock:
            if self.st == "idle" or not S["faces"]:
                return []
            return list(range(len(S["faces"]))) if self.z == -1 else [self.z] if self.z < len(S["faces"]) else []

    def state(self):
        with self.lock:
            return {"g": self.CODE, "st": self.st, "id": self.id, "mode": self.mode, "tags": self.tags, "turn": self.turn, "n": self.n,
                    "b": "".join(str(v) for v in self.b), "last": self.last, "win": self.win, "winner": self.winner, "why": self.why,
                    "z": self.z, "c": list(self.colours), "left": max(0, int(self.until - time.time())), "v": self.v, "at": int(time.time())}

    def msg(self, m):
        """a game message from a phone; returns a short reason when refused"""
        a, pid, tag = m.get("a"), str(m.get("p", "")), str(m.get("tag", ""))
        if not PID_RE.fullmatch(pid):
            return "bad player"
        with self.lock:
            if a == "new":
                if self.st in ("waiting", "playing"):
                    return "a game is already being played"
                mode = "pvp" if m.get("mode") == "pvp" else "cpu"
                z = m.get("z", -1)
                if not isint(z) or z < -1 or z >= len(S["faces"]) or not TAG_RE.fullmatch(tag):
                    return "bad request"
                self.reset()
                self.id, self.mode, self.z = secrets.token_hex(3), mode, z
                self.pids, self.tags = [pid, "cpu" if mode == "cpu" else ""], [tag, "cpu" if mode == "cpu" else ""]
                if mode == "cpu":
                    self.st, self.until = "playing", time.time() + C4_TURN
                else:
                    self.st, self.until = "waiting", time.time() + C4_WAIT_JOIN
                log("game: %s against" % self.NAME, "the computer" if mode == "cpu" else "a friend (waiting for them to join)")
                self.v += 1
                return ""
            if m.get("id") != self.id:
                return "old game"
            if a == "join":
                if self.st != "waiting" or pid == self.pids[0] or not TAG_RE.fullmatch(tag):
                    return "cannot join"
                self.pids[1], self.tags[1] = pid, tag
                self.st, self.until = "playing", time.time() + C4_TURN
                log("game: a friend joined, the game starts")
                self.v += 1
                return ""
            if pid not in self.pids:
                return "not a player"
            me = self.pids.index(pid)
            if a == "quit":
                if self.st == "waiting":
                    self.finish(0, "cancelled")
                elif self.st == "playing":
                    self.finish(2 - me if self.mode == "pvp" else 2, "gave up")
                return ""
            if a == "move":
                c, n = m.get("c"), m.get("n")
                if self.st != "playing" or self.turn != me or n != self.n or not isint(c) or not 0 <= c < self.NMOVES:
                    return "not your turn"
                return self.play(c)
        return "?"

    def play(self, c):
        r = c4_drop_row(self.b, c)
        if r < 0:
            return "column full"
        self.b[r * C4_COLS + c] = self.turn + 1
        self.last, self.last_at = r * C4_COLS + c, time.time()
        self.n += 1
        w, ln = c4_winner(self.b)
        if w:
            self.win = ln
            self.finish(w, "four in a row")
        elif all(self.b[i] for i in range(C4_COLS)):
            self.finish(3, "board full")
        else:
            self.turn = 1 - self.turn
            self.until = time.time() + C4_TURN
            if self.mode == "cpu" and self.turn == 1:
                self.cpu_at = time.time() + random.uniform(0.9, 1.6)   # the computer "thinks" a moment
        self.v += 1
        return ""

    def cpu_move(self):
        return c4_cpu_move(list(self.b), 2, S.get("cpu_level", "normal"))

    def finish(self, winner, why):
        self.st, self.winner, self.why = "over", winner, why
        self.until = time.time() + C4_SHOW_END
        log("game over:", why, "-", {0: "nobody", 1: "player 1 wins", 2: "computer wins" if self.mode == "cpu" else "player 2 wins", 3: "draw"}[winner])
        self.v += 1

    def tick(self):
        with self.lock:
            now = time.time()
            if self.st in ("waiting", "playing", "over") and not S["on"]:
                self.reset()
                return
            if self.st == "playing" and self.mode == "cpu" and self.turn == 1 and self.cpu_at and now >= self.cpu_at:
                self.cpu_at = 0
                self.play(self.cpu_move())
            elif self.st == "waiting" and now > self.until:
                self.finish(0, "nobody joined")
            elif self.st == "playing" and now > self.until:
                self.finish(2 - self.turn if self.mode == "pvp" else 0, "time ran out")
            elif self.st == "over" and now > self.until:
                self.reset()


# ------------------------------------------------------------------------------- game: tic-tac-toe ----
# Noughts and crosses (Jogo do Galo) on a 3 x 3 board: the same players, turns, timers and messages as Four in a
# Row, only the board and the computer change. The computer never loses on Hard.
TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]


def ttt_winner(b):
    for ln in TTT_LINES:
        v = b[ln[0]]
        if v and b[ln[1]] == v and b[ln[2]] == v:
            return v, ln
    return 0, None


TTT_MEMO = {}


def ttt_minimax(b, me, turn):
    """best score for `me` with `turn` to play: +10 win, -10 loss, 0 draw (sooner wins score more; positions are remembered)"""
    key = (tuple(b), me, turn)
    if key in TTT_MEMO:
        return TTT_MEMO[key]
    w, _ = ttt_winner(b)
    free = [i for i in range(9) if not b[i]]
    if w:
        v = 10 if w == me else -10
    elif not free:
        v = 0
    else:
        scores = []
        for i in free:
            b[i] = turn
            scores.append(ttt_minimax(b, me, 3 - turn) * 0.9)
            b[i] = 0
        v = max(scores) if turn == me else min(scores)
    TTT_MEMO[key] = v
    return v


def ttt_cpu_move(b, me, level):
    free = [i for i in range(9) if not b[i]]
    if not free:
        return -1
    if random.random() < {"easy": 0.5, "normal": 0.2}.get(level, 0.0):   # mistakes on purpose, except on Hard
        return random.choice(free)
    scores = {}
    for i in free:
        bb = list(b)
        bb[i] = me
        scores[i] = ttt_minimax(bb, me, 3 - me)
    top = max(scores.values())
    return random.choice([i for i, v in scores.items() if v >= top - 1e-9])


class TicTacToe(FourInARow):
    CODE, NAME, NCELLS, NMOVES = "ttt", "tic-tac-toe", 9, 9

    def play(self, c):
        if self.b[c]:
            return "taken"
        self.b[c] = self.turn + 1
        self.last, self.last_at = c, time.time()
        self.n += 1
        w, ln = ttt_winner(self.b)
        if w:
            self.win = ln
            self.finish(w, "three in a row")
        elif all(self.b):
            self.finish(3, "board full")
        else:
            self.turn = 1 - self.turn
            self.until = time.time() + C4_TURN
            if self.mode == "cpu" and self.turn == 1:
                self.cpu_at = time.time() + random.uniform(0.8, 1.4)
        self.v += 1
        return ""

    def cpu_move(self):
        return ttt_cpu_move(list(self.b), 2, S.get("cpu_level", "normal"))


class TTTAnim(Anim):
    """the 3 x 3 board on a side: crosses for player 1, rings for player 2; the grid shows whose turn it is"""
    def frame(self, t):
        w, h = self.w, self.h
        st = game.all["ttt"]
        with st.lock:
            b, stt, turn, last, last_at, win, winner, cols = list(st.b), st.st, st.turn, st.last, st.last_at, list(st.win), st.winner, st.colours
        c1, c2 = hexrgb(cols[0]), hexrgb(cols[1])
        self.buf[:] = bytes(len(self.buf))
        size = min(w, h)
        cell = max(1, (size - 2) // 3)
        ox, oy = (w - (cell * 3 + 2)) // 2, (h - (cell * 3 + 2)) // 2
        if stt == "over" and winner in (1, 2):
            gc = hsv((t * 0.4) % 1, 1, 0.7)
        elif stt == "playing":
            k = 0.35 + 0.25 * math.sin(t * 5)
            gc = tuple(int(v * k) for v in (c1, c2)[turn])
        elif stt == "waiting":
            gc = c1 if int(t * 2) % 2 else c2
        else:
            gc = (70, 70, 70)
        for k in (1, 2):   # the grid
            gx, gy = ox + k * cell + (k - 1), oy + k * cell + (k - 1)
            for d in range(cell * 3 + 2):
                self.px(gx, oy + d, gc)
                self.px(ox + d, gy, gc)
        now = time.time()
        for i, v in enumerate(b):
            if not v:
                continue
            x0, y0 = ox + (i % 3) * (cell + 1), oy + (i // 3) * (cell + 1)
            col = (c1, c2)[v - 1]
            if stt == "over" and i in win and int(t * 3) % 2:
                col = (255, 255, 255)
            grow = min(1.0, (now - last_at) / 0.3) if i == last else 1.0   # the last mark grows in
            m = max(0, cell // 6)
            n = cell - 2 * m
            if v == 1:   # a cross
                for d in range(int(n * grow)):
                    self.px(x0 + m + d, y0 + m + d, col)
                    self.px(x0 + m + n - 1 - d, y0 + m + d, col)
            else:        # a ring
                r = n / 2
                for dy in range(n):
                    for dx in range(n):
                        dd = math.hypot(dx + 0.5 - r, dy + 0.5 - r)
                        if r - max(1.0, cell / 6) <= dd <= r * grow:
                            self.px(x0 + m + dx, y0 + m + dy, col)
        return self.buf


# ------------------------------------------------------------------------------------- game: Simon ----
# Simon (memory of colours): the cube shows a sequence of the four colours, the visitor repeats it on the four pads
# of their phone. Each round adds a colour and goes a little faster. The phone sends the whole answer in one message
# (one post a round), so the free relay's limits are never a problem. One player; anyone can watch.
SIMON_COLS = ("39d353", "ff2a2a", "ffd23f", "2a7bff")   # green, red, yellow, blue: top-left, top-right, bottom-left, bottom-right
SIMON_MAX = 30         # rounds to win
SIMON_SHOW_END = 8


class Simon:
    CODE, NAME = "simon", "Simon"

    def __init__(self):
        self.lock = threading.RLock()
        self.v = 0
        self.best = 0          # best score since the bridge started
        self.reset()

    def reset(self):
        self.st, self.id, self.mode = "idle", "", "solo"
        self.pids, self.tags = ["", ""], ["", ""]
        self.seq, self.score, self.miss, self.exp = [], 0, -1, -1
        self.t0 = self.until = 0.0
        self.winner, self.why, self.z, self.ok = 0, "", -1, False
        self.v += 1

    def step(self):
        return max(0.32, 0.72 - 0.025 * len(self.seq))   # each colour: shorter every round

    def sides(self):
        with self.lock:
            if self.st == "idle" or not S["faces"]:
                return []
            return list(range(len(S["faces"]))) if self.z == -1 else [self.z] if self.z < len(S["faces"]) else []

    def state(self):
        with self.lock:
            return {"g": self.CODE, "st": self.st, "id": self.id, "mode": "solo", "tags": self.tags, "turn": 0, "n": len(self.seq),
                    "score": self.score, "best": self.best, "winner": self.winner, "why": self.why, "miss": self.miss, "exp": self.exp,
                    "z": self.z, "c": list(SIMON_COLS), "left": max(0, int(self.until - time.time())), "v": self.v, "at": int(time.time())}

    def show(self, ok):
        """starts showing the sequence (after a green flash when the last answer was right)"""
        self.st, self.ok = "showing", ok
        self.t0 = time.time() + (1.3 if ok else 1.0)
        self.until = self.t0 + self.step() * len(self.seq) + 0.3
        self.v += 1

    def msg(self, m):
        a, pid, tag = m.get("a"), str(m.get("p", "")), str(m.get("tag", ""))
        if not PID_RE.fullmatch(pid):
            return "bad player"
        with self.lock:
            if a == "new":
                if self.st in ("showing", "input"):
                    return "a game is already being played"
                z = m.get("z", -1)
                if not isint(z) or z < -1 or z >= len(S["faces"]) or not TAG_RE.fullmatch(tag):
                    return "bad request"
                self.reset()
                self.id, self.z = secrets.token_hex(3), z
                self.pids, self.tags = [pid, ""], [tag, ""]
                self.seq = [random.randrange(4)]
                self.show(False)
                log("game: Simon started")
                return ""
            if m.get("id") != self.id:
                return "old game"
            if pid != self.pids[0]:
                return "not the player"
            if a == "quit":
                if self.st in ("showing", "input"):
                    self.finish(0, "gave up")
                return ""
            if a == "move":
                s, n = m.get("s"), m.get("n")
                if self.st != "input" or n != len(self.seq) or not isinstance(s, list) or len(s) != len(self.seq):
                    return "not now"
                if not all(isint(x) and 0 <= x < 4 for x in s):
                    return "bad answer"
                for i, (x, y) in enumerate(zip(s, self.seq)):
                    if x != y:
                        self.miss, self.exp = i, y
                        self.finish(0, "wrong colour")
                        return ""
                self.score = len(self.seq)
                self.best = max(self.best, self.score)
                if self.score >= SIMON_MAX:
                    self.finish(1, "all rounds")
                    return ""
                self.seq.append(random.randrange(4))
                self.show(True)
                return ""
        return "?"

    def finish(self, winner, why):
        self.st, self.winner, self.why = "over", winner, why
        self.t0, self.until = time.time(), time.time() + SIMON_SHOW_END
        log("game over: Simon,", why, "- score", self.score, "(best %d)" % self.best)
        self.v += 1

    def tick(self):
        with self.lock:
            now = time.time()
            if self.st != "idle" and not S["on"]:
                self.reset()
                return
            if self.st == "showing" and now > self.until:
                self.st, self.until = "input", now + 6 + 1.2 * len(self.seq)
                self.v += 1
            elif self.st == "input" and now > self.until:
                self.finish(0, "time ran out")
            elif self.st == "over" and now > self.until:
                self.reset()

    def lit(self, now):
        """which colour the cube shows now (-1 = none), and what is around it"""
        if self.st != "showing" or now < self.t0:
            return -1
        k = (now - self.t0) / self.step()
        i = int(k)
        return self.seq[i] if i < len(self.seq) and k - i < 0.72 else -1


class SimonAnim(Anim):
    """the four colours on a side; the one being shown lights up; a green flash for a right answer, red for a wrong one"""
    def frame(self, t):
        w, h = self.w, self.h
        st = game.all["simon"]
        now = time.time()
        with st.lock:
            stt, ok, t0, exp, lit, score = st.st, st.ok, st.t0, st.exp, st.lit(now), st.score
        self.buf[:] = bytes(len(self.buf))
        hw, hh = w // 2, h // 2
        gap = 1 if min(w, h) >= 8 else 0
        if stt == "showing" and ok and now < t0:          # right answer: the whole side flashes green
            f = (0, 255, 60) if int((now - t0) * 6) % 2 else (0, 60, 15)
            for y in range(h):
                for x in range(w):
                    self.px(x, y, f)
            return self.buf
        for q, c in enumerate(SIMON_COLS):
            rgb = hexrgb(c)
            if stt == "over":
                on = (q == exp and int((now - t0) * 4) % 2) if exp >= 0 else bool(int((now - t0) * 2) % 2)
                k = 1.0 if on else (0.12 if exp >= 0 else 0.25)
                if self.why_red(st) and exp >= 0 and q != exp:
                    rgb, k = (255, 0, 0), 0.25 if int((now - t0) * 4) % 2 else 0.05
            elif stt == "input":
                k = 0.3 + 0.15 * math.sin(t * 4)              # their turn: the colours breathe
            else:
                k = 1.0 if q == lit else 0.08
            col = tuple(int(v * k) for v in rgb)
            x0, y0 = (q % 2) * hw, (q // 2) * hh
            for y in range(y0 + (gap if q // 2 else 0), y0 + hh - (0 if q // 2 else gap)):
                for x in range(x0 + (gap if q % 2 else 0), x0 + hw - (0 if q % 2 else gap)):
                    self.px(x, y, col)
        return self.buf

    @staticmethod
    def why_red(st):
        return st.why == "wrong colour"


# ------------------------------------------------------------------------------ game: count the colours ----
# A party game for up to 8 phones at once: the cube flashes colours quickly, then everyone answers how many times one
# of them flashed. The answer does not depend on how fast it arrives, so the relay's delay is fair to everybody.
COUNT_COLS = (("red", "ff2a2a"), ("green", "39d353"), ("blue", "2a7bff"), ("yellow", "ffd23f"))
COUNT_AVATARS = ("🦊", "🐼", "🐸", "🐧", "🦁", "🐯", "🐨", "🐵")
COUNT_ROUNDS, COUNT_LOBBY, COUNT_ANSWER, COUNT_RESULT, COUNT_END = 5, 25, 12, 4, 12


class CountColours:
    CODE, NAME = "count", "Count the colours"

    def __init__(self):
        self.lock = threading.RLock()
        self.v = 0
        self.reset()

    def reset(self):
        self.st, self.id, self.z = "idle", "", -1
        self.players = []          # [{"p": secret, "t": tag, "a": avatar, "s": score, "ans": answer or None}]
        self.round, self.seq, self.target, self.right = 0, [], 0, 0
        self.t0 = self.until = 0.0
        self.why = ""
        self.v += 1

    def sides(self):
        with self.lock:
            if self.st == "idle" or not S["faces"]:
                return []
            return list(range(len(S["faces"]))) if self.z == -1 else [self.z] if self.z < len(S["faces"]) else []

    def state(self):
        with self.lock:
            show_right = self.st in ("result", "over")
            return {"g": self.CODE, "st": self.st, "id": self.id, "tags": [p["t"] for p in self.players],
                    "players": [{"t": p["t"], "a": p["a"], "s": p["s"], "ok": (p["ans"] == self.right) if show_right and p["ans"] is not None else None,
                                 "in": p["ans"] is not None} for p in self.players],
                    "round": self.round, "rounds": COUNT_ROUNDS, "n": self.round, "target": self.target,
                    "tname": COUNT_COLS[self.target][0], "tcol": COUNT_COLS[self.target][1],
                    "right": self.right if show_right else -1, "why": self.why, "z": self.z,
                    "left": max(0, int(self.until - time.time())), "v": self.v, "at": int(time.time())}

    def new_round(self):
        self.round += 1
        self.target = random.randrange(4)
        self.right = random.randint(2, 4 + self.round)                       # how many times the target flashes
        others = random.randint(5 + self.round, 7 + 2 * self.round)          # other colours in between
        seq = [self.target] * self.right + [random.choice([c for c in range(4) if c != self.target]) for _ in range(others)]
        random.shuffle(seq)
        for i in range(1, len(seq)):     # never the same colour twice in a row, so every flash can be counted
            if seq[i] == seq[i - 1]:
                for j in range(i + 1, len(seq)):
                    if seq[j] != seq[i - 1] and (j + 1 >= len(seq) or seq[j + 1] != seq[i]) and seq[j - 1] != seq[i]:
                        seq[i], seq[j] = seq[j], seq[i]
                        break
        self.right = seq.count(self.target)
        self.seq = seq
        for p in self.players:
            p["ans"] = None
        self.st, self.t0 = "show", time.time() + 2.0      # 2 s: the side shows which colour to count
        self.until = self.t0 + self.step() * len(seq) + 0.4
        self.v += 1

    def step(self):
        return max(0.38, 0.62 - 0.05 * self.round)

    def msg(self, m):
        a, pid, tag = m.get("a"), str(m.get("p", "")), str(m.get("tag", ""))
        if not PID_RE.fullmatch(pid):
            return "bad player"
        with self.lock:
            if a == "new":
                if self.st not in ("idle", "over"):
                    return "a game is already being played"
                z = m.get("z", -1)
                if not isint(z) or z < -1 or z >= len(S["faces"]) or not TAG_RE.fullmatch(tag):
                    return "bad request"
                self.reset()
                self.id, self.z = secrets.token_hex(3), z
                self.players = [{"p": pid, "t": tag, "a": COUNT_AVATARS[0], "s": 0, "ans": None}]
                self.st, self.until = "lobby", time.time() + COUNT_LOBBY
                log("game: Count the colours, waiting for players")
                self.v += 1
                return ""
            if m.get("id") != self.id:
                return "old game"
            me = next((i for i, p in enumerate(self.players) if p["p"] == pid), -1)
            if a == "join":
                if self.st != "lobby" or me >= 0 or len(self.players) >= len(COUNT_AVATARS) or not TAG_RE.fullmatch(tag):
                    return "cannot join"
                self.players.append({"p": pid, "t": tag, "a": COUNT_AVATARS[len(self.players)], "s": 0, "ans": None})
                self.v += 1
                return ""
            if me < 0:
                return "not a player"
            if a == "start":
                if self.st != "lobby" or me != 0:
                    return "not now"
                log("game: Count the colours starts with %d player(s)" % len(self.players))
                self.new_round()
                return ""
            if a == "answer":
                v, n = m.get("v"), m.get("n")
                if self.st not in ("show", "answer") or n != self.round or not isint(v) or not 0 <= v <= 30 or self.players[me]["ans"] is not None:
                    return "not now"
                self.players[me]["ans"] = v
                self.v += 1
                if self.st == "answer" and all(p["ans"] is not None for p in self.players if p["p"] != "-"):
                    self.until = time.time()       # everyone answered: show the result now
                return ""
            if a == "quit":
                if me == 0:
                    self.finish("stopped")
                else:
                    self.players[me]["p"] = "-"   # leaves; the score stays on the board
                    self.v += 1
                return ""
        return "?"

    def finish(self, why):
        self.st, self.why = "over", why
        self.t0, self.until = time.time(), time.time() + COUNT_END
        if self.players:
            best = max(p["s"] for p in self.players)
            log("game over: Count the colours,", why, "- top score %d of %d" % (best, self.round))
        self.v += 1

    def tick(self):
        with self.lock:
            now = time.time()
            if self.st != "idle" and not S["on"]:
                self.reset()
                return
            if now <= self.until:
                return
            if self.st == "lobby":
                self.new_round()           # time is up: play with whoever joined
            elif self.st == "show":
                self.st, self.until = "answer", now + COUNT_ANSWER
                if all(p["ans"] is not None for p in self.players if p["p"] != "-"):
                    self.until = now + 1
                self.v += 1
            elif self.st == "answer":
                for p in self.players:
                    if p["ans"] == self.right:
                        p["s"] += 1
                self.st, self.t0, self.until = "result", now, now + COUNT_RESULT
                self.v += 1
            elif self.st == "result":
                if self.round >= COUNT_ROUNDS:
                    self.finish("all rounds")
                else:
                    self.new_round()
            elif self.st == "over":
                self.reset()

    def lit(self, now):
        if self.st != "show" or now < self.t0:
            return -1
        k = (now - self.t0) / self.step()
        i = int(k)
        return self.seq[i] if i < len(self.seq) and k - i < 0.7 else -1


class CountAnim(Anim):
    """lobby: the four colours turn; show: the colour to count, then the flashes; answer: '?' in that colour; result: the
    right number as dots"""
    def frame(self, t):
        w, h = self.w, self.h
        st = game.all["count"]
        now = time.time()
        with st.lock:
            stt, t0, target, right, lit, nplayers = st.st, st.t0, st.target, st.right, st.lit(now), len(st.players)
        self.buf[:] = bytes(len(self.buf))
        tc = hexrgb(COUNT_COLS[target][1])
        if stt == "lobby":     # waiting for players: one dot lights for each player, around four turning colours
            for y in range(h):
                for x in range(w):
                    q = int(((math.atan2(y - h / 2 + .5, x - w / 2 + .5) / math.tau + t * 0.15) % 1) * 4)
                    self.px(x, y, tuple(v // 6 for v in hexrgb(COUNT_COLS[q][1])))
            for i in range(nplayers):
                self.px(1 + 2 * i, h - 2, (255, 255, 255))
        elif stt == "show" and now < t0:   # the colour to count: a frame in that colour, pulsing
            k = 0.5 + 0.5 * math.sin(now * 8)
            c = tuple(int(v * (0.3 + 0.7 * k)) for v in tc)
            for x in range(w):
                for d in range(max(1, min(w, h) // 8)):
                    self.px(x, d, c); self.px(x, h - 1 - d, c)
            for y in range(h):
                for d in range(max(1, min(w, h) // 8)):
                    self.px(d, y, c); self.px(w - 1 - d, y, c)
        elif stt == "show":
            if lit >= 0:
                c = hexrgb(COUNT_COLS[lit][1])
                for y in range(1, h - 1):
                    for x in range(1, w - 1):
                        self.px(x, y, c)
        elif stt == "answer":  # a breathing frame in the colour asked: everyone answers on their phone
            k = 0.35 + 0.25 * math.sin(t * 4)
            c = tuple(int(v * k) for v in tc)
            for x in range(w):
                self.px(x, 0, c); self.px(x, h - 1, c)
            for y in range(h):
                self.px(0, y, c); self.px(w - 1, y, c)
        elif stt == "result":  # the right number, as dots that appear one by one
            n = min(right, int((now - t0) / 0.25) + 1)
            cols = max(1, min(4, right))
            rows = (right + cols - 1) // cols
            cell = max(1, min((w - 2) // cols, (h - 2) // max(1, rows)))
            ox, oy = (w - cell * cols) // 2, (h - cell * rows) // 2
            for i in range(n):
                cx, cy = ox + (i % cols) * cell, oy + (i // cols) * cell
                for dy in range(max(1, cell - 1)):
                    for dx in range(max(1, cell - 1)):
                        self.px(cx + dx, cy + dy, tc)
        elif stt == "over":
            for y in range(h):
                for x in range(w):
                    if random.random() < 0.08:
                        self.px(x, y, hexrgb(COUNT_COLS[random.randrange(4)][1]))
        return self.buf


# ------------------------------------------------------------------------------------- game: snake ----
# Snake for one player, played slowly on purpose: the phone sends only the turns (one message per turn) and the relay
# takes up to a second, so the snake moves about once a second at first and a little faster as it grows. The board is
# 8 x 8 squares, scaled to the side.
SNAKE_N = 8
SNAKE_MAX_TIME = 300   # a game lasts at most 5 minutes
DIRS = ((0, -1), (1, 0), (0, 1), (-1, 0))   # up, right, down, left


class Snake:
    CODE, NAME = "snake", "Snake"

    def __init__(self):
        self.lock = threading.RLock()
        self.v = 0
        self.best = 0
        self.reset()

    def reset(self):
        self.st, self.id, self.z = "idle", "", -1
        self.pids, self.tags = ["", ""], ["", ""]
        self.body, self.d, self.turns, self.food = [], 1, [], (0, 0)
        self.score, self.why = 0, ""
        self.t0 = self.until = self.next = self.died = 0.0
        self.v += 1

    def sides(self):
        with self.lock:
            if self.st == "idle" or not S["faces"]:
                return []
            return list(range(len(S["faces"]))) if self.z == -1 else [self.z] if self.z < len(S["faces"]) else []

    def state(self):
        with self.lock:
            return {"g": self.CODE, "st": self.st, "id": self.id, "tags": self.tags, "n": self.score, "score": self.score,
                    "best": self.best, "why": self.why, "z": self.z, "left": max(0, int(self.until - time.time())),
                    "v": self.v, "at": int(time.time())}

    def interval(self):
        return max(0.45, 1.0 - 0.05 * self.score)

    def place_food(self):
        free = [(x, y) for y in range(SNAKE_N) for x in range(SNAKE_N) if (x, y) not in self.body]
        self.food = random.choice(free) if free else (-1, -1)

    def msg(self, m):
        a, pid, tag = m.get("a"), str(m.get("p", "")), str(m.get("tag", ""))
        if not PID_RE.fullmatch(pid):
            return "bad player"
        with self.lock:
            if a == "new":
                if self.st in ("ready", "playing"):
                    return "a game is already being played"
                z = m.get("z", -1)
                if not isint(z) or z < -1 or z >= len(S["faces"]) or not TAG_RE.fullmatch(tag):
                    return "bad request"
                self.reset()
                self.id, self.z = secrets.token_hex(3), z
                self.pids, self.tags = [pid, ""], [tag, ""]
                self.body = [(3, 4), (2, 4), (1, 4)]
                self.d, self.turns = 1, []
                self.place_food()
                self.st, self.t0 = "ready", time.time()
                self.next = self.t0 + 3.0          # 3 s to get ready
                self.until = self.t0 + 3.0 + SNAKE_MAX_TIME
                log("game: Snake started")
                self.v += 1
                return ""
            if m.get("id") != self.id:
                return "old game"
            if pid != self.pids[0]:
                return "not the player"
            if a == "dir":
                d = m.get("d")
                if self.st not in ("ready", "playing") or not isint(d) or not 0 <= d < 4:
                    return "not now"
                last = self.turns[-1] if self.turns else self.d
                if d != last and d != (last + 2) % 4 and len(self.turns) < 3:   # no turning back on itself
                    self.turns.append(d)
                return ""
            if a == "quit":
                if self.st in ("ready", "playing"):
                    self.finish("gave up")
                return ""
        return "?"

    def finish(self, why):
        self.st, self.why = "over", why
        self.died, self.until = time.time(), time.time() + 8
        self.best = max(self.best, self.score)
        log("game over: Snake,", why, "- score", self.score, "(best %d)" % self.best)
        self.v += 1

    def update(self, now):
        """moves the snake when it is time (called by the drawing, every frame)"""
        with self.lock:
            if self.st not in ("ready", "playing") or now < self.next:
                return
            if self.st == "ready":
                self.st = "playing"
                self.v += 1
            if self.turns:
                self.d = self.turns.pop(0)
            dx, dy = DIRS[self.d]
            hx, hy = self.body[0][0] + dx, self.body[0][1] + dy
            if not (0 <= hx < SNAKE_N and 0 <= hy < SNAKE_N) or (hx, hy) in self.body[:-1]:
                self.finish("crashed")
                return
            self.body.insert(0, (hx, hy))
            if (hx, hy) == self.food:
                self.score += 1
                self.v += 1
                if len(self.body) >= SNAKE_N * SNAKE_N:
                    self.finish("board full")
                    return
                self.place_food()
            else:
                self.body.pop()
            self.next = now + self.interval()

    def tick(self):
        with self.lock:
            now = time.time()
            if self.st != "idle" and not S["on"]:
                self.reset()
                return
            if self.st in ("ready", "playing") and now > self.until:
                self.finish("time up")
            elif self.st == "over" and now > self.until:
                self.reset()


class SnakeAnim(Anim):
    def frame(self, t):
        w, h = self.w, self.h
        st = game.all["snake"]
        now = time.time()
        st.update(now)
        with st.lock:
            stt, body, food, t0, died = st.st, list(st.body), st.food, st.t0, st.died
        self.buf[:] = bytes(len(self.buf))
        cell = max(1, min(w, h) // SNAKE_N)
        ox, oy = (w - cell * SNAKE_N) // 2, (h - cell * SNAKE_N) // 2
        edge = (25, 25, 60)
        for k in range(-1, cell * SNAKE_N + 1):   # the walls, faint
            self.px(ox + k, oy - 1, edge); self.px(ox + k, oy + cell * SNAKE_N, edge)
            self.px(ox - 1, oy + k, edge); self.px(ox + cell * SNAKE_N, oy + k, edge)

        def sq(x, y, c):
            for dy in range(cell):
                for dx in range(cell):
                    self.px(ox + x * cell + dx, oy + y * cell + dy, c)
        if food[0] >= 0:
            k = 0.6 + 0.4 * math.sin(t * 6)
            sq(food[0], food[1], (int(255 * k), int(40 * k), int(40 * k)))
        crashed = stt == "over" and int((now - died) * 4) % 2 == 0
        for i, (x, y) in enumerate(body):
            if crashed:
                c = (255, 255, 255)
            elif i == 0:
                c = (180, 255, 120)
            else:
                g = max(60, 220 - i * 8)
                c = (0, g, int(g * 0.35))
            sq(x, y, c)
        if stt == "ready":   # 3, 2, 1: the head blinks
            if int((now - t0) * 3) % 2:
                sq(body[0][0], body[0][1], (255, 255, 255))
        return self.buf


# -------------------------------------------------------------------------------------- game: Pong ----
# Pong in two ways:
#   - crew: from the Mixer page on the home network (no relay, so no delay): one or two players, paddles moved by a
#     finger, the keyboard or a MIDI knob or fader (learnable as game:p1 and game:p2); the computer plays any side
#     nobody controls;
#   - visitor (new in v16): one visitor against the computer, made for the relay's delay: the phone sends where the
#     red paddle should go (one message per slide) and it glides there; the ball is slower and the paddles longer.
# First to 5 points wins.
PONG_WIN = 5


class Pong:
    CODE, NAME = "pong", "Pong"

    def __init__(self):
        self.lock = threading.RLock()
        self.v = 0
        self.reset()

    def reset(self):
        self.st, self.id, self.z, self.mode = "idle", "", -1, "cpu"
        self.tags, self.pids = ["", ""], ["", ""]
        self.goal = 0.5
        self.pad = [0.5, 0.5]        # paddle centres, 0 = top, 1 = bottom
        self.human = [True, False]
        self.score = [0, 0]
        self.ball = [0.5, 0.5]
        self.vel = [0.0, 0.0]
        self.serve_at = self.last = self.touched = self.until = 0.0
        self.winner, self.why, self.flash, self.aim = 0, "", 0.0, 0.0
        self.v += 1

    def sides(self):
        with self.lock:
            if self.st == "idle" or not S["faces"]:
                return []
            return list(range(len(S["faces"]))) if self.z == -1 else [self.z] if self.z < len(S["faces"]) else []

    def state(self):
        with self.lock:
            return {"g": self.CODE, "st": self.st, "id": self.id, "tags": self.tags, "n": sum(self.score), "score": list(self.score),
                    "mode": self.mode, "winner": self.winner, "why": self.why, "z": self.z, "v": self.v, "at": int(time.time()),
                    "pad": [round(p, 3) for p in self.pad]}

    def start(self, mode, z):
        with self.lock:
            if not isint(z) or z < -1 or z >= len(S["faces"]):
                return "bad side"
            self.reset()
            self.id, self.z, self.mode = secrets.token_hex(3), z, "pvp" if mode == "pvp" else "cpu"
            self.human = [True, self.mode == "pvp"]
            self.st = "playing"
            self.touched = time.time()
            self.serve(random.choice((-1, 1)))
            log("game: Pong,", "two players" if self.mode == "pvp" else "against the computer")
            self.v += 1
            return ""

    def serve(self, direction):
        self.ball = [0.5, 0.5]
        ang = random.uniform(-0.6, 0.6)
        sp = 0.26 if self.mode == "visitor" else 0.45     # the visitors' ball is slower, for the relay's delay
        self.vel = [direction * sp * math.cos(ang), sp * math.sin(ang)]
        self.serve_at = time.time() + (1.6 if self.mode == "visitor" else 1.0)

    def half(self, h):
        """half the paddle's height, as a fraction of the side (longer for visitors)"""
        return max(0.27 if self.mode == "visitor" else 0.16, 3.0 / max(3, h))

    def set_pad(self, p, v):
        with self.lock:
            if self.st != "playing" or p not in (0, 1) or self.mode == "visitor":   # a visitor's game is theirs
                return
            self.pad[p] = max(0.0, min(1.0, float(v)))
            self.human[p] = True
            self.touched = time.time()

    def stop(self):
        with self.lock:
            if self.st == "playing":
                self.finish(0, "stopped")

    def msg(self, m):
        """a visitor's Pong, against the computer"""
        a, pid, tag = m.get("a"), str(m.get("p", "")), str(m.get("tag", ""))
        if not PID_RE.fullmatch(pid):
            return "bad player"
        with self.lock:
            if a == "new":
                if self.st == "playing":
                    return "a game is already being played"
                z = m.get("z", -1)
                if not isint(z) or z < -1 or z >= len(S["faces"]) or not TAG_RE.fullmatch(tag) or not S["faces"]:
                    return "bad request"
                self.reset()
                self.id, self.z, self.mode = secrets.token_hex(3), z, "visitor"
                self.pids, self.tags = [pid, ""], [tag, "cpu"]
                self.human = [True, False]
                self.st = "playing"
                self.touched = time.time()
                self.until = self.touched + 300
                self.serve(random.choice((-1, 1)))
                log("game: Pong, a visitor against the computer")
                self.v += 1
                return ""
            if m.get("id") != self.id or self.mode != "visitor":
                return "old game"
            if pid != self.pids[0]:
                return "not the player"
            if a == "go":
                y = m.get("y")
                if self.st == "playing" and isinstance(y, (int, float)) and not isinstance(y, bool):
                    self.goal = max(0.0, min(1.0, float(y)))
                    self.touched = time.time()
                return ""
            if a == "quit":
                if self.st == "playing":
                    self.finish(2, "gave up")
                return ""
        return "?"

    def finish(self, winner, why):
        self.st, self.winner, self.why = "over", winner, why
        self.until = time.time() + 6
        log("game over: Pong,", why, "%d - %d" % tuple(self.score))
        self.v += 1

    def update(self, now, w, h):
        with self.lock:
            if self.st != "playing":
                self.last = now
                return
            dt = min(0.1, max(0.0, now - (self.last or now)))
            self.last = now
            ph = self.half(h)                           # paddle half-height (a fraction of the side)
            if self.mode == "visitor":                  # the visitor's paddle glides to where the phone said
                self.pad[0] += max(-1.1 * dt, min(1.1 * dt, self.goal - self.pad[0]))
            for p in (0, 1):                            # the computer moves the paddles nobody holds
                if not self.human[p]:
                    coming = (self.vel[0] > 0) == (p == 1)
                    vis = self.mode == "visitor"
                    near = self.ball[0] > (0.45 if vis else 0.4) if p == 1 else self.ball[0] < 0.6
                    goal = self.ball[1] + self.aim if coming and near else 0.5   # it reacts late and aims a little off
                    speed = (0.27 if vis else 0.4) + (0.02 if vis else 0.03) * sum(self.score)
                    self.pad[p] += max(-speed * dt, min(speed * dt, goal - self.pad[p]))
            if now < self.serve_at:
                return
            bx, by = self.ball[0] + self.vel[0] * dt, self.ball[1] + self.vel[1] * dt
            if by < 0 or by > 1:
                by = -by if by < 0 else 2 - by
                self.vel[1] = -self.vel[1]
            edge = 1.0 / max(4, w)                      # the paddles are one pixel in from the sides
            for p, x_hit in ((0, edge * 1.5), (1, 1 - edge * 1.5)):
                coming = self.vel[0] < 0 if p == 0 else self.vel[0] > 0
                crossed = bx <= x_hit if p == 0 else bx >= x_hit
                if coming and crossed and abs(by - self.pad[p]) <= ph + 0.04:
                    off = (by - self.pad[p]) / (ph + 0.04)
                    sp = min(0.6 if self.mode == "visitor" else 1.4, math.hypot(*self.vel) * (1.05 if self.mode == "visitor" else 1.07))
                    ang = off * 0.9
                    self.vel = [(1 if p == 0 else -1) * sp * math.cos(ang), sp * math.sin(ang)]
                    bx = x_hit
                    self.flash = now
                    self.aim = random.uniform(-0.33, 0.33) if self.mode == "visitor" else random.uniform(-0.22, 0.22)
            if bx < 0 or bx > 1:
                scorer = 1 if bx < 0 else 0
                self.score[scorer] += 1
                self.v += 1
                if self.score[scorer] >= PONG_WIN:
                    self.finish(scorer + 1, "five points")
                    return
                self.serve(1 if scorer == 0 else -1)
                return
            self.ball = [bx, by]

    def tick(self):
        with self.lock:
            now = time.time()
            if self.st == "playing" and self.mode == "visitor" and not S["on"]:
                self.reset()
            elif self.st == "playing" and self.mode == "visitor" and (now - self.touched > 60 or now > self.until):
                self.finish(0, "nobody playing" if now - self.touched > 60 else "time up")
            elif self.st == "playing" and self.mode == "pvp" and now - self.touched > 120:
                self.finish(0, "nobody playing")
            elif self.st == "over" and now > self.until:
                self.reset()


class PongAnim(Anim):
    def frame(self, t):
        w, h = self.w, self.h
        st = game.all["pong"]
        now = time.time()
        st.update(now, w, h)
        with st.lock:
            stt, pad, ball, score, flash, winner, serve_at = st.st, list(st.pad), list(st.ball), list(st.score), st.flash, st.winner, st.serve_at
        self.buf[:] = bytes(len(self.buf))
        c1, c2 = (255, 60, 60), (60, 140, 255)
        for y in range(0, h, 2):                         # the net
            self.px(w // 2, y, (40, 40, 40))
        for i in range(score[0]):                        # the score as dots at the top
            self.px(w // 2 - 2 - i, 0, c1)
        for i in range(score[1]):
            self.px(w // 2 + 2 + i, 0, c2)
        ph = max(1, int(round(st.half(h) * h)))
        for p, x, c in ((0, 0, c1), (1, w - 1, c2)):
            cy = int(pad[p] * (h - 1))
            for y in range(cy - ph, cy + ph + 1):
                self.px(x, y, c)
        if stt == "over" and winner:
            c = (c1, c2)[winner - 1]
            k = 0.5 + 0.5 * math.sin(t * 8)
            for y in range(h):
                for x in range(w):
                    if (x + y + int(t * 6)) % 4 == 0:
                        self.px(x, y, tuple(int(v * k) for v in c))
        elif stt == "playing" and (now >= serve_at or int(now * 6) % 2):
            bc = (255, 255, 255) if now - flash > 0.12 else (255, 255, 120)
            self.px(int(round(ball[0] * (w - 1))), int(round(ball[1] * (h - 1))), bc)
        return self.buf


# ------------------------------------------------------------------------------- game: space invaders ----
# Space Invaders on a side of the cube, in two ways:
#   - crew: from the Mixer page on the home network (no delay): move with a finger, the arrow keys or a MIDI knob, fire
#     with a button, the space bar or a MIDI pad;
#   - visitors: from the phone, made for the relay's delay: the phone sends where the ship should go (one message per
#     slide), the ship glides there and fires by itself; invaders and bombs are slower.
# Waves get faster, a mystery ship crosses the top now and then, three lives.
INV_ROWS = (("ff3cff", 30), ("3cffff", 20), ("3cff5a", 10))   # colour and points of each row, top first
INV_MAX_TIME = 420


class Invaders:
    CODE, NAME = "invaders", "Space Invaders"

    def __init__(self):
        self.lock = threading.RLock()
        self.v = 0
        self.best = 0
        self.reset()

    def reset(self):
        self.st, self.id, self.z, self.mode = "idle", "", -1, "visitor"
        self.pids, self.tags = ["", ""], ["", ""]
        self.w, self.h = 16, 16
        self.aliens, self.shots, self.bombs, self.shields = [], [], [], set()
        self.ship, self.target, self.dir = 8.0, 8.0, 0
        self.lives, self.score, self.wave = 3, 0, 0
        self.adx, self.next_step, self.next_fire, self.next_bomb = 1, 0.0, 0.0, 0.0
        self.ufo, self.ufo_next, self.hit_at, self.boom = None, 0.0, 0.0, []
        self.t0 = self.until = self.last = self.touched = self.died = 0.0
        self.why = ""
        self.v += 1

    def sides(self):
        with self.lock:
            if self.st == "idle" or not S["faces"]:
                return []
            return list(range(len(S["faces"]))) if self.z == -1 else [self.z] if self.z < len(S["faces"]) else []

    def state(self):
        with self.lock:
            return {"g": self.CODE, "st": self.st, "id": self.id, "tags": self.tags, "mode": self.mode, "n": self.score,
                    "score": self.score, "best": self.best, "lives": self.lives, "wave": self.wave, "why": self.why, "z": self.z,
                    "x": round(self.ship / max(1, self.w - 1), 3), "left": max(0, int(self.until - time.time())), "v": self.v, "at": int(time.time())}

    # -- speeds: the visitors' game is slower, for the relay's delay
    def k(self, crew, visitor):
        return crew if self.mode == "crew" else visitor

    def begin(self, mode, z, pid="", tag=""):
        self.reset()
        f = S["faces"][z if z >= 0 else 0]
        self.w, self.h = max(8, f["w"]), max(8, f["h"])
        self.id, self.z, self.mode = secrets.token_hex(3), z, mode
        self.pids, self.tags = [pid, ""], [tag, ""]
        self.ship = self.target = (self.w - 1) / 2
        hy = self.h - 4
        self.shields = {(x, hy) for c in range(1, 4) for x in (int(c * self.w / 4) - 1, int(c * self.w / 4))}
        self.st, self.t0 = "ready", time.time()
        self.until = self.t0 + 2.5 + INV_MAX_TIME
        self.touched = self.t0
        self.new_wave(self.t0 + 2.5)
        log("game: Space Invaders,", "the crew" if mode == "crew" else "a visitor")
        self.v += 1

    def new_wave(self, at):
        self.wave += 1
        cols = max(3, min(8, (self.w - 4) // 2))
        x0 = (self.w - (cols * 2 - 1)) // 2
        top = 2 + min(3, self.wave - 1)                     # each wave starts a little lower
        self.aliens = [[x0 + c * 2, top + r * 2, r] for r in range(len(INV_ROWS)) for c in range(cols)]
        self.adx = 1
        self.shots, self.bombs = [], []
        self.next_step = at
        self.next_fire = at + 0.5
        self.next_bomb = at + self.k(1.5, 3.0)
        self.ufo_next = at + random.uniform(12, 25)
        self.n0 = len(self.aliens)

    def step_time(self):
        frac = len(self.aliens) / max(1, self.n0)
        base = self.k(0.55, 1.5) * (0.92 ** (self.wave - 1))
        return max(self.k(0.08, 0.45), base * (0.3 + 0.7 * frac))   # faster as they fall

    def msg(self, m):
        a, pid, tag = m.get("a"), str(m.get("p", "")), str(m.get("tag", ""))
        if not PID_RE.fullmatch(pid):
            return "bad player"
        with self.lock:
            if a == "new":
                if self.st in ("ready", "playing"):
                    return "a game is already being played"
                z = m.get("z", -1)
                if not isint(z) or z < -1 or z >= len(S["faces"]) or not TAG_RE.fullmatch(tag) or not S["faces"]:
                    return "bad request"
                self.begin("visitor", z, pid, tag)
                return ""
            if m.get("id") != self.id:
                return "old game"
            if pid != self.pids[0]:
                return "not the player"
            if a == "go":
                x = m.get("x")
                if self.st in ("ready", "playing") and isinstance(x, (int, float)) and not isinstance(x, bool):
                    self.target = max(0.0, min(1.0, float(x))) * (self.w - 1)
                    self.touched = time.time()
                return ""
            if a == "quit":
                if self.st in ("ready", "playing"):
                    self.finish("gave up")
                return ""
        return "?"

    # -- the crew's controls (Mixer page and MIDI)
    def crew_move(self, x=None, d=None):
        with self.lock:
            if self.st not in ("ready", "playing") or self.mode != "crew":
                return
            if x is not None:
                self.target, self.dir = max(0.0, min(1.0, float(x))) * (self.w - 1), 0
            if d is not None:
                self.dir = max(-1, min(1, int(d)))
            self.touched = time.time()

    def crew_fire(self):
        with self.lock:
            if self.st == "playing" and self.mode == "crew" and len(self.shots) < 2:
                self.shots.append([int(round(self.ship)), self.h - 3])
                self.touched = time.time()

    def stop(self):
        with self.lock:
            if self.st in ("ready", "playing"):
                self.finish("stopped")

    def finish(self, why):
        self.st, self.why = "over", why
        self.died, self.until = time.time(), time.time() + 8
        self.best = max(self.best, self.score)
        log("game over: Space Invaders,", why, "- score", self.score, "wave", self.wave, "(best %d)" % self.best)
        self.v += 1

    def update(self, now):
        with self.lock:
            if self.st not in ("ready", "playing"):
                self.last = now
                return
            dt = min(0.1, max(0.0, now - (self.last or now)))
            self.last = now
            if self.st == "ready":
                if now >= self.next_step:
                    self.st = "playing"
                    self.v += 1
                return
            w, h = self.w, self.h
            # the ship: glides to its target, or keeps moving while the crew holds a direction
            sp = self.k(14.0, 7.0)
            if self.dir:
                self.target = max(0.0, min(w - 1.0, self.ship + self.dir * sp * dt * 1.5))
            self.ship += max(-sp * dt, min(sp * dt, self.target - self.ship))
            self.ship = max(1.0, min(w - 2.0, self.ship))
            # the visitor's ship fires by itself
            if self.mode == "visitor" and now >= self.next_fire and not self.shots:
                self.shots.append([int(round(self.ship)), h - 3])
                self.next_fire = now + 0.55
            # shots go up, bombs come down
            for s in self.shots:
                s.append(s[1])                     # where it was: every square it crosses is checked
                s[1] -= self.k(22.0, 18.0) * dt
            for b in self.bombs:
                b.append(b[1])
                b[1] += self.k(8.0, 3.0) * dt
            # invaders march
            if now >= self.next_step and self.aliens:
                xs = [a[0] for a in self.aliens]
                if (self.adx > 0 and max(xs) + 1 >= w) or (self.adx < 0 and min(xs) - 1 < 0):
                    for a in self.aliens:
                        a[1] += 1
                    self.adx = -self.adx
                else:
                    for a in self.aliens:
                        a[0] += self.adx
                self.next_step = now + self.step_time()
                if max(a[1] for a in self.aliens) >= h - 2:
                    self.finish("invaded")
                    return
            # invaders drop bombs (from the lowest one of a random column)
            if now >= self.next_bomb and self.aliens:
                cols = {}
                for a in self.aliens:
                    if a[0] not in cols or a[1] > cols[a[0]][1]:
                        cols[a[0]] = a
                a = random.choice(list(cols.values()))
                if len(self.bombs) < self.k(2, 1 if self.wave < 3 else 2):
                    self.bombs.append([a[0], a[1] + 1.0])
                self.next_bomb = now + self.k(random.uniform(1.0, 2.2), random.uniform(2.5, 4.5)) * (0.95 ** (self.wave - 1))
            # the mystery ship
            if self.ufo is None and now >= self.ufo_next:
                d = random.choice((-1, 1))
                self.ufo = [-1.0 if d > 0 else w * 1.0, d]
            if self.ufo is not None:
                self.ufo[0] += self.ufo[1] * self.k(5.0, 3.0) * dt
                if self.ufo[0] < -2 or self.ufo[0] > w + 1:
                    self.ufo, self.ufo_next = None, now + random.uniform(15, 30)
            # hits
            keep = []
            for s in self.shots:
                sx, old = s[0], (s.pop() if len(s) > 2 else s[1])
                gone = False
                for sy in range(int(round(old)), int(round(s[1])) - 1, -1):   # every square from where it was to where it is
                    hit = next((a for a in self.aliens if a[0] == sx and a[1] == sy), None)
                    if hit:
                        self.aliens.remove(hit)
                        self.score += INV_ROWS[hit[2]][1]
                        self.boom.append([sx, sy, now])
                        self.v += 1
                        gone = True
                    elif (sx, sy) in self.shields:
                        self.shields.discard((sx, sy))
                        gone = True
                    elif self.ufo is not None and sy == 0 and abs(self.ufo[0] - sx) <= 1:
                        self.score += random.choice((50, 100, 150))
                        self.boom.append([sx, 0, now])
                        self.ufo, self.ufo_next = None, now + random.uniform(15, 30)
                        self.v += 1
                        gone = True
                    elif sy < 0:
                        gone = True
                    if gone:
                        break
                if not gone:
                    keep.append(s)
            self.shots = keep
            keep = []
            for b in self.bombs:
                bx, old = b[0], (b.pop() if len(b) > 2 else b[1])
                by = int(round(b[1]))
                if by >= h:
                    continue
                crossed = [(bx, y) for y in range(int(round(old)), by + 1) if (bx, y) in self.shields]
                if crossed:
                    self.shields.discard(crossed[0])
                    continue
                if by >= h - 2 and abs(bx - self.ship) <= 1.0 and now - self.hit_at > 1.5:
                    self.lives -= 1
                    self.hit_at = now
                    self.boom.append([int(round(self.ship)), h - 1, now])
                    self.v += 1
                    if self.lives <= 0:
                        self.finish("no lives left")
                        return
                    continue
                keep.append(b)
            self.bombs = keep
            self.boom = [x for x in self.boom if now - x[2] < 0.4]
            if not self.aliens:
                self.score += 100 * self.wave
                self.lives = min(5, self.lives + 1)      # an extra life for each wave cleared
                self.new_wave(now + 2.0)
                self.st = "ready"
                self.v += 1

    def tick(self):
        with self.lock:
            now = time.time()
            if self.st != "idle" and not S["on"] and self.mode == "visitor":
                self.reset()
                return
            if self.st in ("ready", "playing") and (now > self.until or now - self.touched > self.k(120, 90)):
                self.finish("time up" if now > self.until else "nobody playing")
            elif self.st == "over" and now > self.until:
                self.reset()


class InvadersAnim(Anim):
    def frame(self, t):
        w, h = self.w, self.h
        st = game.all["invaders"]
        now = time.time()
        st.update(now)
        with st.lock:
            stt, aliens, shots, bombs = st.st, [list(a) for a in st.aliens], [list(s) for s in st.shots], [list(b) for b in st.bombs]
            shields, ship, ufo, boom, lives, hit_at, died, wave = set(st.shields), st.ship, st.ufo, list(st.boom), st.lives, st.hit_at, st.died, st.wave
            sw, sh = st.w, st.h
        self.buf[:] = bytes(len(self.buf))
        ox, oy = (w - sw) // 2, (h - sh) // 2
        P = lambda x, y, c: self.px(ox + int(x), oy + int(y), c)
        legs = int(t * 2) % 2
        for a in aliens:
            c = hexrgb(INV_ROWS[a[2]][0])
            P(a[0], a[1], c)
            if legs and a[1] + 1 < sh - 4:                       # two frames of "walking" legs, very dim
                P(a[0], a[1] + 1, tuple(v // 6 for v in c))
        for x, y in shields:
            P(x, y, (0, 90, 30))
        for s in shots:
            P(s[0], round(s[1]), (255, 255, 255))
        for b in bombs:
            P(b[0], round(b[1]), (255, 120, 0) if int(t * 8) % 2 else (255, 40, 0))
        if ufo is not None:
            for dx in (-1, 0, 1):
                P(round(ufo[0]) + dx, 0, (255, 30, 30) if dx else (255, 200, 200))
        flicker = now - hit_at < 1.5 and int(now * 8) % 2
        if stt != "over" and not flicker:
            sx = int(round(ship))
            for dx in (-1, 0, 1):
                P(sx + dx, sh - 1, (60, 255, 60))
            P(sx, sh - 2, (160, 255, 160))
        for i in range(max(0, lives)):                              # lives, top-left
            P(i * 2, 0, (60, 255, 60)) if not ufo else None
        for x, y, at in boom:
            r = min(1.0, max(0.0, (now - at) / 0.4))
            for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                P(x + dx, y + dy, (255, int(255 * (1 - r)), 0) if (dx, dy) == (0, 0) or r > 0.3 else (255, 200, 60))
        if stt == "ready" and wave > 1 and int(now * 4) % 2:      # new wave: the border blinks
            for x in range(sw):
                P(x, sh - 1, (40, 40, 120))
        if stt == "over" and int((now - died) * 3) % 2:
            for x in range(sw):
                P(x, sh - 1, (255, 0, 0))
        return self.buf


# ------------------------------------------------------------------------------- game: race to the star ----
# Race to the Star (v18): 1 to 8 visitors race up a track (a mega tree, a matrix, any model or group of the show, or a
# side of the cube); the first to the top lights the star in their colour. Each player climbs with their own effort,
# measured on their phone and sent about once a second:
#   tap   - taps per second on a big button (two players can share one phone, one button each)
#   voice - how loud and how steady their voice is (measured on the phone: no sound is sent)
#   shake - how hard and how fast they shake the phone (capped, so shaking harder than needed gives nothing)
#   run   - steps per second running on the spot (from the phone's motion sensor)
# The phone turns its measure into an effort from 0 to 1; the bridge climbs smoothly, 20 times a second, with the last
# effort received, and the climber slides down when the effort stops. Players' levels (child, adult, sporty), help
# for whoever is behind, the race's difficulty, the track, the star and the effects are set on the race panel
# (http://<bridge-ip>:8099/race).
RACE_MODES = ("tap", "voice", "shake", "run")
RACE_LEVELS = ("kid", "adult", "sport")
RACE_COLS = ["ff2a2a", "2a7bff", "39d353", "ffd23f", "a35cff", "ff8a1a", "2ad4ff", "ff5cc8"]
RACE_PRESETS = {   # climb: average-effort race length (s); slide: how fast a stopped climber slides (track per s)
    "easy": {"target": 25, "slide": 0.02, "delay": 2.0},
    "normal": {"target": 35, "slide": 0.035, "delay": 1.2},
    "hard": {"target": 45, "slide": 0.06, "delay": 0.6},
}
RACE_DEFAULT = {
    "track": "split",            # split = one track shared; each = a track per player; cube = a side of the cube
    "models": [],                # the shared track: models (a group is stored as its models)
    "stars": [],                 # the star(s): any models; none = the top of the track is the star
    "pairs": [],                 # track per player: [{"track": [models], "star": [models]}]
    "split": "stripes",          # stripes, halves, rings
    "front": 0.0,                # halves: turns where the front of the tree is (0..1)
    "dir": "up",                 # up, down, right, left, order (along the string)
    "side": 0,                   # cube track: which side (-1 = all)
    "modes": ["tap", "voice", "shake", "run"],
    "mix": True,                 # each player picks their own way to play
    "shared": True,              # two players on one phone (tap)
    "min": 2, "max": 4,
    "colours": list(RACE_COLS),
    "lobby": 30, "early": True,
    "levels": {"kid": 1.5, "adult": 1.0, "sport": 0.8},
    "catchup": True,
    "difficulty": "normal", "target": 35, "slide": 0.035, "delay": 1.2, "max_time": 90,
    "leader": True, "party": 8, "countdown": True, "rainbow": True, "bright": 100, "bg": "dim",
    "style": "auto",             # rope (filled up to the height), climber (a small figure) or auto (climber from 50 pixels tall)
}
RACE_BASE = 970              # renderer numbers of the race's tracks and stars


def race_cfg():
    c = dict(RACE_DEFAULT)
    c.update(S.get("race") or {})
    return c


def race_clean(b):
    """checks a race configuration from the panel; returns a clean dict"""
    c = race_cfg()
    names = lambda v: [str(x)[:120] for x in v][:64] if isinstance(v, list) else []
    if b.get("track") in ("split", "each", "cube"):
        c["track"] = b["track"]
    if "models" in b:
        c["models"] = names(b["models"])
    if "stars" in b:
        c["stars"] = names(b["stars"])
    if isinstance(b.get("pairs"), list):
        c["pairs"] = [{"track": names(p.get("track")), "star": names(p.get("star"))} for p in b["pairs"][:8] if isinstance(p, dict)]
    if b.get("split") in ("stripes", "halves", "rings"):
        c["split"] = b["split"]
    if b.get("dir") in ("up", "down", "right", "left", "order"):
        c["dir"] = b["dir"]
    if isinstance(b.get("modes"), list):
        c["modes"] = [m for m in RACE_MODES if m in b["modes"]] or ["tap"]
    if b.get("colours") and isinstance(b["colours"], list):
        cs = [str(x).lower().lstrip("#") for x in b["colours"] if re.fullmatch(r"#?[0-9a-fA-F]{6}", str(x))][:8]
        if len(cs) >= 2:
            c["colours"] = cs
    if isinstance(b.get("levels"), dict):
        for k in RACE_LEVELS:
            v = b["levels"].get(k)
            if isinstance(v, (int, float)) and 0.3 <= v <= 3:
                c["levels"][k] = float(v)
    for k, lo, hi in (("front", 0, 1), ("target", 10, 120), ("slide", 0, 0.3), ("delay", 0, 5), ("max_time", 30, 300),
                      ("party", 3, 20), ("bright", 10, 100), ("lobby", 10, 120), ("min", 1, 8), ("max", 1, 8), ("side", -1, 7)):
        v = b.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi:
            c[k] = int(v) if k in ("max_time", "party", "bright", "lobby", "min", "max", "side", "target") else float(v)
    if c["max"] < c["min"]:
        c["max"] = c["min"]
    if b.get("difficulty") in ("easy", "normal", "hard", "custom"):
        c["difficulty"] = b["difficulty"]
        if b["difficulty"] in RACE_PRESETS:
            c.update(RACE_PRESETS[b["difficulty"]])
    if b.get("bg") in ("dim", "off"):
        c["bg"] = b["bg"]
    if b.get("style") in ("auto", "rope", "climber"):
        c["style"] = b["style"]
    for k in ("mix", "shared", "early", "catchup", "leader", "countdown", "rainbow"):
        if k in b:
            c[k] = bool(b[k])
    return c


def model_geoms(prop):
    """[PropGeom] for any list of models (a prop, a race track, a star); cached until the show changes"""
    key = (json.dumps(prop, sort_keys=True), ezp_state.get("layoutVersion"))
    hit = model_geoms_cache.get(key)
    if hit is not None:
        return hit
    tg = {t["model"]: t for t in (ezp_state["targets"] or ezp_targets())}
    geoms, raw = [], None
    for m in prop["models"]:
        t = tg.get(m)
        if not t:
            log("%s: model %s is not in the EZPlayer show" % (prop["n"], m))
            continue
        if t.get("w") and t.get("h"):
            w, h = t["w"], t["h"]
            if w * h > 40000:
                k = math.sqrt(40000 / (w * h))
                w, h = max(1, int(w * k)), max(1, int(h * k))
            geoms.append(["grid", m, w, h])
            continue
        raw = raw or coords_raw()
        c = model_coords(raw, m)
        nodes = (c or {}).get("nodes") or []
        if not nodes or len(nodes) != t.get("nodes", len(nodes)):
            log("%s: no pixel positions for %s" % (prop["n"], m))
            continue
        xs, ys = [], []
        for nd in nodes:
            k = (nd.get("coords") or [{}])[0]
            if not prop.get("across") and "bufX" in k:
                xs.append(float(k["bufX"])); ys.append(float(k["bufY"]))
            else:
                xs.append(float(k.get("wX", 0))); ys.append(float(k.get("wY", 0)))
        geoms.append(["nodes", m, xs, ys])
    allx = [x for g in geoms if g[0] == "nodes" for x in g[2]]
    ally = [y for g in geoms if g[0] == "nodes" for y in g[3]]
    out = []
    for g in geoms:
        if g[0] == "grid":
            _, m, w, h = g
            u = [x / max(1, w - 1) for y in range(h) for x in range(w)]
            v = [1 - y / max(1, h - 1) for y in range(h) for x in range(w)]
            out.append(PropGeom(m, "grid", w * h, u, v, w, h))
            continue
        _, m, xs, ys = g
        bx, by = (allx, ally) if prop.get("across") else (xs, ys)
        x0, x1, y0, y1 = min(bx), max(bx), min(by), max(by)
        u = [(x - x0) / ((x1 - x0) or 1) for x in xs]
        v = [(y - y0) / ((y1 - y0) or 1) for y in ys]
        out.append(PropGeom(m, "nodes", len(xs), u, v))
    if len(model_geoms_cache) > 64:
        model_geoms_cache.clear()
    model_geoms_cache[key] = out
    return out


model_geoms_cache = {}


class RaceTrack:
    """a track: for each pixel, its lane (which player) and how far up it is (0 = start, 1 = the top)"""
    def __init__(self, geoms, nplayers, cfg, lane_fixed=None):
        self.geoms, self.cfg = geoms, cfg
        total = sum(g.n for g in geoms) or 1
        self.prog, self.lane = [], []
        k = 0
        for g in geoms:
            d = cfg["dir"]
            if d == "order":
                p = [(k + i) / max(1, total - 1) for i in range(g.n)]
            else:
                p = {"up": g.v, "down": [1 - y for y in g.v], "right": g.u, "left": [1 - x for x in g.u]}[d]
                p = list(p)
            k += g.n
            across = g.v if d in ("right", "left") else g.u              # the other direction splits the lanes
            if lane_fixed is not None:
                ln = [lane_fixed] * g.n
            elif cfg["split"] == "stripes":
                cols = sorted({round(x, 3) for x in across})
                idx = {c: i for i, c in enumerate(cols)}
                ln = [idx[round(x, 3)] % max(1, nplayers) for x in across]
            elif cfg["split"] == "halves":
                ln = [min(nplayers - 1, int(((x + cfg["front"]) % 1.0) * nplayers)) for x in across]
            else:
                ln = [-1] * g.n                                          # rings: every pixel shows every player
            self.prog.append(p)
            self.lane.append(ln)
        # how many pixels tall the track is (distinct heights): one step = one pixel, for the smooth head and the climber
        self.rows = max(2, len({round(x, 3) for pr in self.prog for x in pr}))
        self.step = 1.0 / (self.rows - 1)
        style = cfg.get("style", "auto")
        self.climber = style == "climber" or (style == "auto" and self.rows >= RACE_CLIMBER_ROWS)

    def frames(self, players, now, state, winner, cfg, t):
        bright = cfg["bright"] / 100
        out = []
        for gi, g in enumerate(self.geoms):
            buf = bytearray(g.n * 3)
            prog, lane = self.prog[gi], self.lane[gi]
            for i in range(g.n):
                p, ln = prog[i], lane[i]
                c = None
                if state == "over" and winner is not None:            # the party: rainbow climbing, winner's colour
                    c = hsv((p * 0.8 - t * 0.6) % 1, 1, 1) if cfg["rainbow"] else hexrgb(players[winner]["c"])
                elif ln == -1:                                          # rings: a band at each climber's height
                    near = [j for j, pl in enumerate(players) if abs(p - pl["h"]) < 0.05]
                    if near:
                        c = hexrgb(players[near[int(t * 4) % len(near)]]["c"])
                elif 0 <= ln < len(players):
                    pl = players[ln]
                    col = hexrgb(pl["c"])
                    if state == "lobby" and pl.get("blink", 0) > now:
                        c = col if int(now * 6) % 2 else None
                    elif state in ("race", "over"):
                        c = self.climb_px(p, pl, col, now, t) or (tuple(v // 14 for v in col) if cfg["bg"] == "dim" else None)
                    elif state == "countdown":
                        c = col if p < (now % 1.0) else None
                    elif cfg["bg"] == "dim":
                        c = tuple(v // 14 for v in col)
                if c:
                    o = i * 3
                    buf[o] = int(c[0] * bright); buf[o + 1] = int(c[1] * bright); buf[o + 2] = int(c[2] * bright)
            out.append(bytes(buf))
        return out


RACE_CLIMBER_ROWS = 50       # "auto" style: a climber from this many pixels tall, a rope below it


def _scale(col, k):
    return tuple(min(255, int(v * k)) for v in col)


def _race_climb_px(self, p, pl, col, now, t):
    """the colour of one pixel of a player's lane during the race: a rope, or a little climber on a dim rope"""
    h, s = pl["h"], self.step
    if not self.climber:
        if p <= h - s:                                           # the rope, filled up to the height
            return col if h - p > 3 * s else _scale(col, 1.35)   # the top 3 pixels a bit brighter: the head
        if p < h + s:                                            # the pixel the head is in: lights up smoothly (v19)
            return _scale(col, 1.35 * max(0.0, min(1.0, (h - p) / s + 1.0)))
        return None
    d = (h - p) / s                                              # pixels below the climber's head
    if -1 < d <= 0:                                              # the head, fading in smoothly as it climbs
        return _scale((255, 230, 190), 1.0 + d)
    if 0 < d <= 3:                                               # the body
        return col
    if 3 < d <= 5:                                               # legs: they move while climbing
        moving = now - pl.get("e_at", 0) < 2 and pl.get("e", 0) > 0.05
        on = (int(d) + (int(t * 5) if moving else 0)) % 2 == 0
        return _scale(col, 0.8 if on else 0.25)
    if p <= h:                                                   # the rope already climbed: dim
        return _scale(col, 0.12)
    return None


RaceTrack.climb_px = _race_climb_px


class RaceAnim:
    """all the race's tracks and stars, sent to EZPlayer as one item (one overlay per model)"""
    def __init__(self, race):
        self.race, self.geoms, self.tracks, self.stars, self.sig = race, [], [], [], None

    def build(self, cfg, n):
        sig = (json.dumps(cfg, sort_keys=True), n, ezp_state.get("layoutVersion"))
        if sig == self.sig:
            return
        self.sig, self.tracks, self.stars = sig, [], []
        if cfg["track"] == "each":
            for j, pr in enumerate(cfg["pairs"][:n]):
                tg = model_geoms({"n": "race track %d" % (j + 1), "models": pr["track"], "across": True}) if pr["track"] else []
                sg = model_geoms({"n": "race star %d" % (j + 1), "models": pr["star"], "across": True}) if pr["star"] else []
                if tg:
                    self.tracks.append((RaceTrack(tg, n, cfg, lane_fixed=j), j))
                if sg:
                    self.stars.append((sg, j))
        else:
            tg = model_geoms({"n": "race track", "models": cfg["models"], "across": True}) if cfg["models"] else []
            if tg:
                self.tracks.append((RaceTrack(tg, n, cfg), None))
            if cfg["stars"]:
                self.stars.append((model_geoms({"n": "race star", "models": cfg["stars"], "across": True}), None))
        self.geoms = [g for tr, _ in self.tracks for g in tr.geoms] + [g for sg, _ in self.stars for g in sg]

    def frames(self, t):
        r = self.race
        with r.lock:
            cfg, players, state, winner, now = r.cfg, [dict(p) for p in r.players], r.st, r.winner, time.time()
        self.build(cfg, max(1, len(players)))
        out = []
        for tr, _ in self.tracks:
            out += tr.frames(players, now, state, winner, cfg, t)
        star_col = race_star_colour(players, state, winner, cfg, now)
        for sg, owner in self.stars:
            for g in sg:
                c = star_col
                if owner is not None and owner < len(players):          # a star per player: theirs glows with their height
                    pl = players[owner]
                    k = 1.0 if (state == "over" and winner == owner and int(now * 4) % 2) else (0.1 + 0.6 * pl["h"]) if state == "race" else 0.15
                    c = tuple(int(v * k) for v in hexrgb(pl["c"])) if state != "over" or winner == owner else (0, 0, 0)
                out.append(bytes(c or (0, 0, 0)) * g.n)
        if not self.stars and self.tracks and star_col:                    # no star: the top of the track is the star
            k = 0
            for tr, _ in self.tracks:
                for gi in range(len(tr.geoms)):
                    buf = bytearray(out[k])
                    for i, p in enumerate(tr.prog[gi]):
                        if p > 0.94:
                            buf[i * 3:i * 3 + 3] = bytes(star_col)
                    out[k] = bytes(buf)
                    k += 1
        return out


def race_star_colour(players, state, winner, cfg, now):
    if state == "over" and winner is not None:
        return hexrgb(players[winner]["c"]) if int(now * 4) % 2 else (40, 40, 40)
    if state == "race" and cfg["leader"] and players:
        lead = max(range(len(players)), key=lambda j: players[j]["h"])
        return tuple(int(v * 0.5) for v in hexrgb(players[lead]["c"]))
    if state == "countdown":
        return (255, 255, 255) if now % 1.0 < 0.15 else None
    return None


class RaceSideAnim(Anim):
    """the race on a side of the cube: a lane (columns) per player, the star at the top"""
    def frame(self, t):
        r = game.all["race"]
        r.step(time.time())
        with r.lock:
            cfg, players, state, winner = r.cfg, [dict(p) for p in r.players], r.st, r.winner
        now = time.time()
        w, h = self.w, self.h
        self.buf[:] = bytes(len(self.buf))
        n = max(1, len(players))
        top = 2
        for x in range(w):
            j = min(n - 1, x * n // w)
            if j >= len(players):
                continue
            pl = players[j]
            col = hexrgb(pl["c"])
            for y in range(top, h):
                p = (h - 1 - y) / max(1, h - 1 - top)
                if state == "over" and winner is not None:
                    c = hsv((p - t * 0.6) % 1, 1, 1)
                elif state in ("race", "over") and p <= pl["h"]:
                    c = col
                elif state == "lobby" and pl.get("blink", 0) > now and int(now * 6) % 2:
                    c = col
                elif state == "countdown" and p < now % 1.0:
                    c = col
                else:
                    c = tuple(v // 14 for v in col) if cfg["bg"] == "dim" else None
                if c:
                    self.px(x, y, c)
        sc = race_star_colour(players, state, winner, cfg, now)
        if sc:
            for x in range(w // 2 - 2, w // 2 + 2):
                for y in range(top):
                    self.px(x, y, sc)
        return self.buf


class Race:
    CODE, NAME = "race", "Race to the Star"

    def __init__(self):
        self.lock = threading.RLock()
        self.v = 0
        self.reset()

    def reset(self):
        self.st, self.id, self.z = "idle", "", -1
        self.players = []          # {"p": phone secret, "t": tag, "slot": 0 or 1 (shared phone), "c", "m", "l", "h", "e", "e_at", "seen"}
        self.cfg = race_cfg()
        self.winner = None
        self.t0 = self.until = 0.0
        self.last = 0.0
        self.test = False
        self.why = ""
        self.posted_at = 0.0
        self.v += 1

    def sides(self):
        with self.lock:
            if self.st == "idle" or self.cfg["track"] != "cube" or not S["faces"]:
                return []
            z = self.cfg.get("side", 0)
            return list(range(len(S["faces"]))) if z == -1 else [z] if 0 <= z < len(S["faces"]) else [0]

    def state(self):
        with self.lock:
            return {"g": self.CODE, "st": self.st, "id": self.id, "tags": [p["t"] for p in self.players],
                    "players": [{"t": p["t"], "s": p["slot"], "c": p["c"], "m": p["m"], "l": p["l"], "h": round(p["h"], 2)} for p in self.players],
                    "n": len(self.players), "winner": self.winner, "why": self.why, "test": self.test,
                    "modes": self.cfg["modes"], "mix": self.cfg["mix"], "shared": self.cfg["shared"], "colours": self.cfg["colours"],
                    "max": self.cfg["max"], "min": self.cfg["min"], "early": self.cfg["early"],
                    "left": max(0, int(self.until - time.time())), "v": self.v, "at": int(time.time())}

    def ok_choice(self, c, m, l):
        cfg = self.cfg
        return c in cfg["colours"] and m in cfg["modes"] and l in RACE_LEVELS

    def add_player(self, pid, tag, slot, c, m, l):
        if c in [p["c"] for p in self.players]:      # colour taken: the next free one
            free = [x for x in self.cfg["colours"] if x not in [p["c"] for p in self.players]]
            if not free:
                return False
            c = free[0]
        self.players.append({"p": pid, "t": tag, "slot": slot, "c": c, "m": m, "l": l, "h": 0.0, "e": 0.0, "e_at": 0.0,
                             "seen": time.time(), "blink": time.time() + 2.5})
        return True

    def msg(self, m):
        a, pid, tag = m.get("a"), str(m.get("p", "")), str(m.get("tag", ""))
        if not PID_RE.fullmatch(pid):
            return "bad player"
        with self.lock:
            if a == "new":
                if self.st not in ("idle", "over"):
                    return "a race is already on"
                if not TAG_RE.fullmatch(tag):
                    return "bad request"
                self.reset()
                cfg = self.cfg
                if cfg["track"] != "cube" and not ezp_state["ok"]:
                    return "EZPlayer is not answering"
                if cfg["track"] == "split" and not cfg["models"]:
                    return "no track set up"
                if cfg["track"] == "each" and not cfg["pairs"]:
                    return "no tracks set up"
                c, md, lv = m.get("c"), m.get("m"), m.get("l")
                if not self.ok_choice(c, md, lv):
                    return "bad choice"
                self.id = secrets.token_hex(3)
                self.add_player(pid, tag, 0, c, md, lv)
                if m.get("two") and cfg["shared"] and md == "tap" and cfg["max"] >= 2:
                    self.add_player(pid, tag, 1, m.get("c2") if m.get("c2") in cfg["colours"] else c, "tap", m.get("l2") if m.get("l2") in RACE_LEVELS else lv)
                self.st, self.until = "lobby", time.time() + cfg["lobby"]
                log("game: Race to the Star, waiting for players")
                self.v += 1
                return ""
            if m.get("id") != self.id:
                return "old race"
            mine = [p for p in self.players if p["p"] == pid]
            if a == "join":
                if self.st != "lobby" or mine or not TAG_RE.fullmatch(tag):
                    return "cannot join"
                c, md, lv = m.get("c"), m.get("m"), m.get("l")
                if not self.ok_choice(c, md, lv) or len(self.players) >= self.cfg["max"]:
                    return "cannot join"
                if not self.cfg["mix"] and self.players and md != self.players[0]["m"]:
                    md = self.players[0]["m"]
                self.add_player(pid, tag, 0, c, md, lv)
                if m.get("two") and self.cfg["shared"] and md == "tap" and len(self.players) < self.cfg["max"]:
                    self.add_player(pid, tag, 1, m.get("c2") if m.get("c2") in self.cfg["colours"] else c, "tap",
                                    m.get("l2") if m.get("l2") in RACE_LEVELS else lv)
                self.v += 1
                return ""
            if not mine:
                return "not a player"
            if a == "blink":           # "where am I?": the player's lane flashes
                for p in mine:
                    p["blink"] = time.time() + 2.5
                return ""
            if a == "start":
                if self.st != "lobby" or self.players[0]["p"] != pid or not self.cfg["early"] or len(self.players) < self.cfg["min"]:
                    return "not now"
                self.go()
                return ""
            if a == "e":                # effort, about every 2 s
                e = m.get("e")
                es = e if isinstance(e, list) else [e]
                now = time.time()
                for p in mine:
                    v = es[p["slot"]] if p["slot"] < len(es) else None
                    if isinstance(v, (int, float)) and not isinstance(v, bool) and now - p.get("e_rx", 0) > 0.3:
                        p["e"], p["e_at"], p["e_rx"], p["seen"] = max(0.0, min(1.0, float(v))), now, now, now
                return ""
            if a == "quit":
                self.players = [p for p in self.players if p["p"] != pid]
                if self.st == "lobby" and not self.players:
                    self.finish(None, "everyone left")
                elif self.st in ("countdown", "race") and not self.players:
                    self.finish(None, "everyone left")
                self.v += 1
                return ""
        return "?"

    def go(self):
        self.st = "countdown" if self.cfg["countdown"] else "race"
        self.t0 = time.time() + (3.0 if self.cfg["countdown"] else 0)
        self.until = self.t0 + self.cfg["max_time"]
        for p in self.players:
            p["h"], p["e"], p["e_at"] = 0.0, 0.0, 0.0
        log("game: Race to the Star starts with %d player(s)" % len(self.players))
        self.v += 1

    def finish(self, winner, why):
        self.st, self.winner, self.why = "over", winner, why
        self.until = time.time() + self.cfg["party"]
        if winner is not None:
            log("game over: Race to the Star, player %d wins" % (winner + 1))
        else:
            log("game over: Race to the Star,", why)
        self.v += 1

    def step(self, now):
        """climbs and slides (called every frame by the drawing)"""
        with self.lock:
            dt = min(0.2, max(0.0, now - (self.last or now)))
            self.last = now
            if self.st == "countdown" and now >= self.t0:
                self.st = "race"
                self.v += 1
            if self.st != "race":
                return
            cfg = self.cfg
            k = 1.0 / (0.6 * cfg["target"])                     # an effort of 0.6 climbs the track in "target" seconds
            lead = max((p["h"] for p in self.players), default=0)
            for p in self.players:
                if self.test:                                   # the panel's test race: pretend players
                    p["e"], p["e_at"] = max(0.0, min(1.0, 0.55 + 0.35 * math.sin(now * (0.7 + p["slot"] * 0.3 + hash(p["c"]) % 7 * 0.11)))), now
                fresh = now - p["e_at"] < max(4.0, cfg["delay"] + 0.4)   # phones send about every 2 s (v19)
                e = p["e"] if fresh else 0.0
                if e > 0.05:
                    help_ = 1.0 + (min(0.6, (lead - p["h"]) * 1.5) if cfg["catchup"] else 0.0)
                    p["h"] = min(1.0, p["h"] + e * k * cfg["levels"].get(p["l"], 1.0) * help_ * dt)
                elif now - p["e_at"] > cfg["delay"]:
                    p["h"] = max(0.0, p["h"] - cfg["slide"] * dt)
                if p["h"] >= 1.0:
                    self.finish(self.players.index(p), "reached the star")
                    return
            if now - self.posted_at > 5:                          # the phones see the positions every 5 s
                self.posted_at = now
                self.v += 1

    def tick(self):
        with self.lock:
            now = time.time()
            if self.st != "idle" and not S["on"] and not self.test:
                self.reset()
                return
            if self.st == "lobby" and now > self.until:
                if len(self.players) >= self.cfg["min"]:
                    self.go()
                else:
                    self.finish(None, "not enough players")
            elif self.st == "race" and now > self.until:
                best = max(range(len(self.players)), key=lambda j: self.players[j]["h"]) if self.players else None
                self.finish(best, "time up")
            elif self.st == "over" and now > self.until:
                self.reset()

    def start_test(self, n):
        """the panel's test race: pretend players climb, to see the track, the lanes and the colours"""
        with self.lock:
            if self.st in ("lobby", "countdown", "race") and not self.test:
                return "a race is on"
            self.reset()
            self.test = True
            self.id = "test"
            for j in range(max(1, min(self.cfg["max"], n))):
                self.add_player("t" * 16, "test%02d" % j, j, self.cfg["colours"][j % len(self.cfg["colours"])], "tap", "adult")
            self.go()
            return ""


race_anim = None


def race_items(items):
    """render_loop: the race's tracks and stars on EZPlayer models (the cube track goes through the games' sides)"""
    global race_anim
    r = game.all.get("race")
    if r is None or game.cur is not r or r.st == "idle" or r.cfg["track"] == "cube":
        return items
    r.step(time.time())
    if race_anim is None or race_anim.race is not r:
        race_anim = RaceAnim(r)
    return list(items) + [(RACE_BASE, {"anim": race_anim, "t0": 0.0})]


class GameHub:
    """the games visitors can play; one game at a time on the cube"""
    def __init__(self):
        self.all = {"c4": FourInARow(), "ttt": TicTacToe(), "simon": Simon(), "count": CountColours(), "snake": Snake(), "pong": Pong(), "invaders": Invaders(), "race": Race()}
        self.cur = self.all["c4"]
        self.note, self.nv = None, 0      # the last refused "new game" / "join", so that phone can say why (v19)

    @property
    def v(self):
        return (self.cur.CODE, self.cur.v, self.nv)

    def refuse(self, m, why):
        """tells the phone that asked for a new game or to join why it was refused (shown on that phone only)"""
        if m.get("a") not in ("new", "join") or not isinstance(m.get("tag"), str):
            return
        self.note = {"tag": m["tag"][:12], "why": str(why)[:60], "g": str(m.get("g", ""))[:10], "at": int(time.time())}
        self.nv += 1

    @property
    def st(self):
        return self.cur.st

    def sides(self):
        return self.cur.sides()

    def state(self):
        st = self.cur.state()
        if self.note and time.time() - self.note["at"] < 120:
            st = dict(st, note=self.note)
        return st

    def tick(self):
        self.cur.tick()

    def msg(self, m):
        g = self.all.get(m.get("g")) if m.get("g") in GAMES else None
        if g is None:
            return "unknown game"
        if g is not self.cur:
            if self.cur.st not in ("idle", "over"):
                return "another game is being played"
            if m.get("a") != "new":
                return "old game"
            with self.cur.lock:
                self.cur.reset()
            self.cur = g
        return g.msg(m)

    def anim(self, w, h):
        return {"c4": C4Anim, "ttt": TTTAnim, "simon": SimonAnim, "count": CountAnim, "snake": SnakeAnim, "pong": PongAnim, "invaders": InvadersAnim, "race": RaceSideAnim}[self.cur.CODE](w, h)

    def start_crew(self, code, mode, z):
        """a game started from the Mixer page (Pong, Space Invaders), when no other game is being played"""
        g = self.all[code]
        if g is not self.cur:
            if self.cur.st not in ("idle", "over"):
                return "another game is being played"
            with self.cur.lock:
                self.cur.reset()
            self.cur = g
        if not S["faces"]:
            return "no sides"
        if g.st in ("ready", "playing") and getattr(g, "mode", "") == "visitor":
            return "a visitor is playing " + g.NAME
        if code == "invaders":
            if not isint(z) or z < -1 or z >= len(S["faces"]):
                return "bad side"
            with g.lock:
                g.begin("crew", z)
            return ""
        return g.start(mode, z)

    def start_pong(self, mode, z):
        """Pong starts from the Mixer page, when no other game is being played"""
        g = self.all["pong"]
        if g is self.cur and g.st == "playing" and g.mode == "visitor":
            return "a visitor is playing Pong"
        if g is not self.cur:
            if self.cur.st not in ("idle", "over"):
                return "another game is being played"
            with self.cur.lock:
                self.cur.reset()
            self.cur = g
        return g.start(mode, z)


GAMES = ("c4", "ttt", "simon", "count", "snake", "invaders", "pong", "race")   # games visitors can play (Pong is played from the Mixer page)
game = GameHub()


GAME_FAST = ("snake", "pong", "invaders", "race")
GAME_FAST_EVERY = 5.0


def game_loop():
    """runs the game clock and gives the board to the poster: turn games at every move, real-time games every few seconds"""
    posted, last_key, last_at = -1, None, 0.0
    while True:
        game.tick()
        v = game.v
        cur = game.cur
        thinking = getattr(cur, "st", "") == "playing" and getattr(cur, "cpu_at", 0)   # the computer is about to answer:
        if v != posted and S["topic"] and not thinking:                                 # one post for both moves
            st = game.state()
            key = (st.get("g"), st.get("st"), st.get("id"), len(st.get("players") or []), (st.get("note") or {}).get("at"))
            # real-time games change many times a second: the phones get them every few seconds, but at once when
            # the game starts, ends, someone joins or a request is refused
            if cur.CODE in GAME_FAST and key == last_key and time.time() - last_at < GAME_FAST_EVERY:
                time.sleep(0.2)
                continue
            same = {k: x for k, x in st.items() if k not in ("at", "left", "v")}
            poster.post("game", st, same=same)
            posted, last_key, last_at = v, key, time.time()
        time.sleep(0.2)


class C4Anim(Anim):
    """the board on a side of the cube: 7 columns x 6 rows, a strip on top with the colour of whose turn it is"""
    def frame(self, t):
        w, h = self.w, self.h
        st = game.all["c4"]
        with st.lock:
            b, stt, turn, last, last_at, win, winner, cols = list(st.b), st.st, st.turn, st.last, st.last_at, list(st.win), st.winner, st.colours
        c1, c2 = hexrgb(cols[0]), hexrgb(cols[1])
        now = time.time()
        cell = max(1, min(w // C4_COLS, (h - 1) // (C4_ROWS + 1)))
        bw, bh = cell * C4_COLS, cell * C4_ROWS
        strip = max(1, min(cell, h - bh))
        ox, oy = (w - bw) // 2, (h - bh - strip) // 2 + strip
        self.buf[:] = bytes(len(self.buf))
        if stt == "over" and winner in (1, 2):
            frame_c = hsv((t * 0.4) % 1, 1, 0.6)   # rainbow board for the winner
        elif stt == "over":
            frame_c = (60, 60, 60)
        else:
            frame_c = (0, 40, 150)
        # strip: whose turn (blinking both colours while waiting for a friend)
        if stt == "waiting":
            sc = c1 if int(t * 2) % 2 else c2
        elif stt == "playing":
            sc = (c1, c2)[turn]
            sc = [int(v * (0.55 + 0.45 * math.sin(t * 5))) for v in sc]
        else:
            sc = (c1, c2)[winner - 1] if winner in (1, 2) else (0, 0, 0)
        for y in range(oy - strip, oy):
            for x in range(ox + bw // 2 - cell, ox + bw // 2 + cell):
                self.px(x, y, sc)
        for r in range(C4_ROWS):
            for c in range(C4_COLS):
                i = r * C4_COLS + c
                v = b[i]
                disc = (0, 0, 25) if not v else (c1, c2)[v - 1]
                rr = r
                if i == last and now - last_at < 0.35:   # the last disc is still falling
                    rr = int((now - last_at) / 0.35 * r)
                    disc_draw_empty = True
                else:
                    disc_draw_empty = False
                if stt == "over" and i in win and int(t * 3) % 2:
                    disc = (255, 255, 255)
                self.cell(ox + c * cell, oy + r * cell, cell, frame_c, (0, 0, 25) if disc_draw_empty else disc)
                if disc_draw_empty:
                    self.cell(ox + c * cell, oy + rr * cell, cell, frame_c, disc, only_disc=True)
        return self.buf

    def cell(self, x0, y0, n, frame_c, disc, only_disc=False):
        if n <= 2:
            for dx in range(n):
                for dy in range(n):
                    self.px(x0 + dx, y0 + dy, disc)
            return
        rad = n * 0.42
        for dy in range(n):
            for dx in range(n):
                inside = (dx + 0.5 - n / 2) ** 2 + (dy + 0.5 - n / 2) ** 2 <= rad * rad
                if inside:
                    self.px(x0 + dx, y0 + dy, disc)
                elif not only_disc:
                    self.px(x0 + dx, y0 + dy, frame_c)


# ------------------------------------------------------------------------------------------ props ----
# Props are models of the EZPlayer show (wings, bats, spinners, arches…) that visitors can light up with an effect, a
# palette (or their own colours) and a speed. The bridge reads where each pixel of the model is (its own grid, so the
# shape is right however the model sits in the layout), draws the effect and sends one colour per pixel to EZPlayer
# through an overlay; when the effect ends the model goes back to the show.
PROP_BASE = 100       # props are kept next to the sides under these numbers: 100 = first prop, 101 = second…

PALETTES = {   # key: (name, colours)
    "rainbow": ("Rainbow", ["ff0000", "ff8000", "ffff00", "00ff00", "00ffff", "0000ff", "ff00ff"]),
    "halloween": ("Halloween", ["ff6a00", "7a00ff", "39ff14", "ff6a00", "7a00ff"]),
    "christmas": ("Christmas", ["ff0000", "00ff40", "ffffff", "ff0000", "00ff40"]),
    "fire": ("Fire", ["300000", "ff2000", "ff8000", "ffd000", "ffffa0"]),
    "ice": ("Ice", ["ffffff", "80e0ff", "0060ff", "00ffff"]),
    "ocean": ("Ocean", ["001060", "0060ff", "00e0d0", "80ffff"]),
    "candy": ("Candy", ["ff4fd8", "ffffff", "ff2a2a", "ffffff"]),
    "forest": ("Forest", ["004000", "00a030", "80ff40", "ffd23f"]),
    "sunset": ("Sunset", ["ff2a00", "ff7a1a", "ffd23f", "9b5cff"]),
    "gold": ("Gold", ["ffd700", "ff9f00", "fff3b0"]),
    "party": ("Party", ["ff00aa", "00ffcc", "ffee00", "7a00ff"]),
}
PROP_FX = {    # key: name (the page shows them with an emoji)
    "flap": "Flap", "wave": "Colour wave", "rise": "Rising", "spin": "Spin", "breathe": "Breathe", "sparkle": "Sparkle",
    "fire": "Fire", "ripple": "Ripples", "chase": "Chase", "comet": "Comet", "confetti": "Confetti", "solid": "Colours",
}
PROP_SPEED = (0.5, 1.0, 1.8)


def pal_lut(cols, wrap=True):
    """256 colours blended from a palette; wrap = the last colour blends back into the first"""
    cs = [hexrgb(c) for c in cols] or [(255, 255, 255)]
    if len(cs) == 1:
        cs = [cs[0], tuple(v // 3 for v in cs[0])]
    pts = cs + [cs[0]] if wrap else cs
    out = []
    for i in range(256):
        f = i / 256 * (len(pts) - 1) if wrap else i / 255 * (len(pts) - 1)
        k = min(int(f), len(pts) - 2)
        a, b, x = pts[k], pts[k + 1], f - k
        out.append(tuple(int(a[j] + (b[j] - a[j]) * x) for j in range(3)))
    return out


def model_side(name):
    """where the body is for a wing: 1 = right edge (a left wing), 0 = left edge (a right wing), None = the middle"""
    n = name.lower()
    if "left" in n or re.search(r"(^|[ _\-])l(\d*)$", n):
        return 1.0
    if "right" in n or re.search(r"(^|[ _\-])r(\d*)$", n):
        return 0.0
    return None


class PropGeom:
    """one model of a prop: how to send to it and where each pixel is (u across, v up, both 0..1)"""
    def __init__(self, model, fmt, n, u, v, w=0, h=0):
        self.model, self.fmt, self.n, self.w, self.h = model, fmt, n, w, h
        root = model_side(model)
        self.u, self.v = u, v
        self.d = [abs(x - root) for x in u] if root is not None else [min(1.0, abs(x - 0.5) * 2) for x in u]
        mx = [1 - x for x in u] if root == 1.0 else u   # a left wing turns the other way, so a pair looks the same
        self.ang = [(math.atan2(y - 0.5, x - 0.5) / 6.2832) % 1.0 for x, y in zip(mx, v)]
        self.rad = [min(1.0, math.hypot(x - 0.5, y - 0.5) * 1.42) for x, y in zip(u, v)]
        self.order = [i / max(1, n - 1) for i in range(n)]


coords_cache = {"key": None, "raw": b"", "at": 0}


def coords_raw():
    """the 2D coordinates of every model, as EZPlayer serves them (kept until the layout changes)"""
    ver = ezp_state.get("layoutVersion")
    if coords_cache["raw"] and coords_cache["key"] == ver:
        return coords_cache["raw"]
    url = S["ezp"].rstrip("/") + "/api/ezp/model-coordinates-2d"
    with urllib.request.urlopen(url, timeout=120) as r:
        raw = r.read()
    coords_cache.update(key=ver, raw=raw, at=time.time())
    log("read the pixel positions of the layout (%d KB)" % (len(raw) // 1024))
    return raw


def model_coords(raw, model):
    """one model's entry from the big coordinates file, without reading all of it into Python objects"""
    key = json.dumps(model).encode() + b":"
    p = raw.find(key)
    while p > 0 and raw[p - 1:p] not in (b"{", b",", b" ", b"\n"):
        p = raw.find(key, p + 1)
    if p < 0:
        return None
    s = p + len(key)
    while raw[s:s + 1] in (b" ", b"\n"):
        s += 1
    depth, i, n, ins, esc = 0, s, len(raw), False, False
    while i < n:
        c = raw[i]
        if ins:
            if esc:
                esc = False
            elif c == 92:
                esc = True
            elif c == 34:
                ins = False
        elif c == 34:
            ins = True
        elif c in (123, 91):
            depth += 1
        elif c in (125, 93):
            depth -= 1
            if depth == 0:
                return json.loads(raw[s:i + 1])
        i += 1
    return None


prop_geoms = {}       # prop number -> (settings it was made for, [PropGeom])


def prop_geometry(pi):
    prop = S["props"][pi]
    return model_geoms({"n": "prop " + prop["n"], "models": prop["models"], "across": bool(prop.get("across"))})


class PropFx:
    """an effect on all the models of a prop: frames(t) -> [payload bytes for each model]"""
    def __init__(self, geoms, fx, cols, speed):
        self.geoms, self.fx, self.sp = geoms, fx, PROP_SPEED[speed]
        self.lut = pal_lut(cols, wrap=fx != "fire")
        self.r = random.Random()
        self.state = [[0.0] * g.n for g in geoms]
        self.colr = [[0] * g.n for g in geoms]
        self.last = 0.0

    def frames(self, t):
        dt = max(0.0, min(0.2, t - self.last))
        self.last = t
        return [self.one(gi, g, t * self.sp, dt * self.sp) for gi, g in enumerate(self.geoms)]

    def one(self, gi, g, t, dt):
        lut, n, fx = self.lut, g.n, self.fx
        out = bytearray(n * 3)
        sin = math.sin
        if fx == "flap":       # bands moving out from the body, the whole wing beating
            beat = 0.55 + 0.45 * sin(t * 6.0)
            vals = [((d * 0.6 + t * 0.15) % 1.0, beat * (0.35 + 0.65 * (0.5 + 0.5 * sin((d * 2.2 - t * 2.4) * 6.2832)))) for d in g.d]
        elif fx == "wave":
            vals = [((d - t * 0.25) % 1.0, 1.0) for d in g.d]
        elif fx == "rise":
            vals = [((y - t * 0.3) % 1.0, 1.0) for y in g.v]
        elif fx == "spin":
            vals = [((a + t * 0.25) % 1.0, 1.0) for a in g.ang]
        elif fx == "breathe":
            b = 0.15 + 0.85 * (0.5 + 0.5 * sin(t * 2.2))
            vals = [((t * 0.05 + d * 0.3) % 1.0, b) for d in g.d]
        elif fx == "ripple":
            vals = [((r * 1.5 - t * 0.4) % 1.0, 0.25 + 0.75 * (0.5 + 0.5 * sin((r * 3 - t * 1.2) * 6.2832))) for r in g.rad]
        elif fx == "chase":
            vals = [((o * 3 - t * 0.3) % 1.0, 1.0 if (o * 12 - t * 1.2) % 1.0 < 0.5 else 0.08) for o in g.order]
        elif fx == "comet":
            head = (t * 0.25) % 1.0
            vals = [(o, max(0.0, 1 - ((head - o) % 1.0) * 6)) for o in g.order]
            vals = [((head + 0.3 * b) % 1.0, b) for (o, b) in vals]
        elif fx == "fire":
            vals = []
            for x, y in zip(g.u, g.v):
                nse = (sin(x * 9 + t * 2.1 + sin(y * 5 + t * 3.3)) + sin(y * 7 - t * 4.7 + x * 3) + 2) / 4
                h = max(0.0, min(0.999, (1.1 - y * 1.25) * (0.45 + 0.75 * nse)))
                vals.append((h, 1.0))
        elif fx in ("sparkle", "confetti"):
            st, cr, r = self.state[gi], self.colr[gi], self.r
            decay = 0.0 if dt <= 0 else (0.25 ** (dt * (3 if fx == "sparkle" else 1.5)))
            chance = dt * (2.5 if fx == "sparkle" else 1.2)
            for i in range(n):
                st[i] *= decay
                if r.random() < chance:
                    st[i] = 1.0
                    cr[i] = r.randrange(256)
            base = 0.12 if fx == "sparkle" else 0.0
            vals = [((cr[i] / 256 if fx == "confetti" else (cr[i] / 256 + t * 0.05) % 1.0), max(base, st[i])) for i in range(n)]
        else:                  # solid: the palette spread over the prop, drifting slowly
            vals = [((d * 0.8 + t * 0.03) % 1.0, 1.0) for d in g.d]
        for i, (p, b) in enumerate(vals):
            c = lut[int(p * 256) & 255]
            o = i * 3
            out[o] = int(c[0] * b); out[o + 1] = int(c[1] * b); out[o + 2] = int(c[2] * b)
        return bytes(out)


def groups_from_show():
    """model groups of the show (name -> models), read from EZPlayer's copy of xlights_rgbeffects.xml"""
    import xml.etree.ElementTree as ET
    url = S["ezp"].rstrip("/") + "/api/file/uploads/xlights_rgbeffects.xml"
    groups = {}
    with urllib.request.urlopen(url, timeout=120) as r:
        for ev, el in ET.iterparse(r, events=("end",)):
            if el.tag == "modelGroup" and el.get("name"):
                groups[el.get("name")] = [m.strip() for m in (el.get("models") or "").split(",") if m.strip()]
            if el.tag in ("model", "modelGroup", "effect", "Element"):
                el.clear()
    targets = {t["model"] for t in ezp_state["targets"]}
    out = {}

    def expand(name, seen):
        res = []
        for m in groups.get(name, []):
            base = m.split("/")[0]
            if m in groups and m not in seen:
                res += expand(m, seen | {m})
            elif base in targets and base not in res:
                res.append(base)
        return res
    for g in groups:
        ms = []
        for m in expand(g, {g}):
            if m not in ms:
                ms.append(m)
        if ms:
            out[g] = ms
    return out


# ------------------------------------------------------------------------------------- requests ----
def check(msg, allow_free=False, att=None):
    """checks a request from the internet; returns (kind, [sides], info) or None"""
    try:
        m = json.loads(msg)
    except Exception:
        return None
    if not isinstance(m, dict):
        return None
    k, z = m.get("k"), m.get("z", -1)
    if k == "prop":   # light up a prop of the show: effect, palette (or own colours) and speed
        i, e, pal, s = m.get("i"), str(m.get("e", "")), str(m.get("pal", "")), m.get("s", 1)
        if not isint(i) or not 0 <= i < len(S.get("props", [])) or e not in PROP_FX or not isint(s) or not 0 <= s <= 2:
            return None
        if pal == "custom":
            c = m.get("c")
            if not isinstance(c, list) or not 1 <= len(c) <= 3 or not all(isint(x) and 1 <= x < len(PAL) for x in c):
                return None
            cols = [PAL[x] for x in c]
        elif pal in PALETTES:
            cols = PALETTES[pal][1]
        else:
            return None
        p = S["props"][i]
        return "prop", [PROP_BASE + i], {"pi": i, "e": e, "cols": cols, "s": s, "n": PROP_FX[e], "pal": pal,
                                         "where": p["n"]}
    if not S["faces"]:
        return None
    if not isint(z) or z < -1 or z >= len(S["faces"]):
        return None
    idx = list(range(len(S["faces"]))) if z == -1 else [z]
    faces = [S["faces"][i] for i in idx]
    where = "all sides" if z == -1 or len(S["faces"]) == 1 else (S["faces"][z].get("n") or "side %d" % (z + 1))
    if k in ("text", "quick"):
        if k == "quick":
            t = str(m.get("q", ""))
            if not any(t in v for v in QUICK.values()):
                return None
        else:
            if not (S["free"] or allow_free):
                return None
            t = str(m.get("t", ""))[:40].strip()
            if not t or is_bad(t):
                return None
            t = re.sub(r"[^ -~]", "", plain(t)).strip()
            if not t:
                return None
        c = m.get("c", 3)
        c = PAL[c] if isint(c) and 1 <= c < len(PAL) else PAL[3]
        return "text", idx, {"t": t, "c": c, "where": where}
    if k == "gif":
        f = str(m.get("f", ""))
        if not GIF_OK.match(f):
            return None
        return "gif", idx, {"f": f, "where": where}
    if k == "fx":
        e = str(m.get("e", ""))
        if e not in FX_NAMES:
            return None
        cols = None
        c = m.get("c")
        if isinstance(c, list) and len(c) == 2 and all(isint(i) and 0 <= i < len(PAL) for i in c):
            cols = [hexrgb(PAL[i]) for i in c]
        return "fx", idx, {"e": e, "n": FX_NAMES[e], "cols": cols, "where": where}
    if k == "gifx":   # a picture, drawing or text animated on the visitor's phone (GIF attached to the message)
        if not isinstance(att, dict):
            return None
        url, size = str(att.get("url", "")), att.get("size", 0)
        if not url.startswith(GIFX_URL) or not isint(size) or not 0 < size <= GIFX_MAX:
            return None
        w, h = m.get("w"), m.get("h")
        if not isint(w) or not isint(h) or any(f["w"] != w or f["h"] != h for f in faces):
            return None
        quick = {plain(q).lower() for v in QUICK.values() for q in v}
        lines = [str(m.get("t", ""))[:40].strip(), str(m.get("t2", ""))[:40].strip()]
        for ln in lines:
            if ln and (is_bad(ln) or not (S["free"] or allow_free or plain(ln).lower() in quick)):
                return None
        if str(m.get("fx", "")) not in GIFX_FX:
            return None
        return "gifx", idx, {"url": url, "w": w, "h": h, "t": " / ".join(ln for ln in lines if ln),
                             "src": str(m.get("src", ""))[:80], "where": where}
    if k == "draw":
        p = str(m.get("p", ""))
        w, h = m.get("w"), m.get("h")
        if not isint(w) or not isint(h) or any(f["w"] != w or f["h"] != h for f in faces) or len(p) != w * h or not re.fullmatch(r"[0-8]+", p):
            return None
        return "draw", idx, {"w": w, "h": h, "p": p, "where": where}
    return None


def make_anims(kind, info, idx):
    """what each side will show (one animation per side; GIFs are downloaded once)"""
    dec = None
    if kind == "gif":
        if not page_base():
            raise ValueError("the visitors' page address is not set (the pictures come from there)")
        dec = pack_gif(info["f"])
    elif kind == "gifx":
        data = fetch(info["url"], limit=GIFX_MAX + 1)
        if len(data) > GIFX_MAX:
            raise ValueError("GIF too big")
        dec = gif_decode(data)
        if (dec[0], dec[1]) != (info["w"], info["h"]):
            raise ValueError("the GIF is not the size of the side")
    out = {}
    if kind == "prop":
        geoms = prop_geometry(info["pi"])
        if not geoms:
            raise ValueError("the prop has no models EZPlayer knows")
        return {idx[0]: PropFx(geoms, info["e"], info["cols"], info["s"])}
    for i in idx:
        f = S["faces"][i]
        w, h = f["w"], f["h"]
        if kind == "text":
            out[i] = Text(w, h, info["t"], hexrgb(info["c"]))
        elif kind in ("gif", "gifx"):
            out[i] = Gif(w, h, dec)
        elif kind == "fx":
            out[i] = Fx(w, h, info["e"], info.get("cols"))
        elif kind == "draw":
            out[i] = Static(w, h, b"".join(bytes(hexrgb(PAL[int(ch)])) for ch in info["p"]))
        elif kind == "ident":
            out[i] = Static(w, h, identify_rgb(w, h))
    return out


def add(msg, att=None):
    if not S["on"] or not (S["faces"] or S.get("props")):
        log("request ignored: requests are switched off")
        return
    try:
        m = json.loads(msg)
    except Exception:
        m = None
    if isinstance(m, dict) and m.get("k") == "sing":   # a recording to sing (WAV attached to the message)
        why = sing_msg(m, att)
        if why:
            log("sing request refused:", why)
        return
    if isinstance(m, dict) and m.get("k") == "play":   # play the lights: taps, joining and leaving the queue
        why = play_msg(m)
        if why and m.get("a") != "tap":
            log("play request refused:", why)
        return
    if isinstance(m, dict) and m.get("k") == "tree":   # decorate the tree: a bauble on a spot
        why = tree_msg(m)
        if why:
            log("tree request refused:", why)
            tree_refuse(m, why)
        return
    allow = False
    if isinstance(m, dict) and m.get("k") == "advent":   # a door of the advent calendar: its effect or message
        msg = advent_msg(m)
        if not msg:
            log("advent request refused")
            return
        allow = True
    if isinstance(m, dict) and m.get("k") == "game":   # game moves: checked by the game itself (whose turn, which game)
        if not S.get("games") or m.get("g") not in game_list_now():
            game.refuse(m, "games are off" if not S.get("games") else "game not on the list")
            return
        why = game.msg(m)
        if why and m.get("a") != "move":
            log("game request refused:", why)
            game.refuse(m, why)
        return
    job = check(msg, allow_free=allow, att=att)
    if not job:
        log("request refused:", msg[:80])
        return
    now = time.time()
    with lock:
        while recent and now - recent[0][0] > 60:
            recent.popleft()
        if any(m == msg and now - t < 3 for t, m in recent):   # the same request twice in 3 s (double tap)
            log("repeated request ignored")
            return
        if len(recent) >= RATE_MAX:
            log("too many requests this minute, ignored")
            return
        recent.append((now, msg))
    kind, idx, info = job
    if S["approve"]:
        with lock:
            if len(pending) >= QUEUE_MAX:
                log("too many requests waiting for approval, ignored")
                return
            pending.append({"id": secrets.token_hex(4), "kind": kind, "idx": idx, "info": info, "at": time.strftime("%H:%M:%S")})
        log("request waiting for approval:", kind)
        return
    enqueue(kind, idx, info)


def enqueue(kind, idx, info):
    try:
        jobs.put_nowait((kind, idx, info))
        log("request queued:", kind, "(%d waiting)" % jobs.qsize())
    except queue.Full:
        log("queue full, request ignored")


# ----------------------------------------------------------- sides: what they show, and sending ----
active = {}           # side -> {"anim", "t0"}: what is being sent to EZPlayer
leases = {}           # side -> EZPlayer overlay lease (id, token, ...)
waiting = []          # requests taken from the queue, waiting for their side to be free
reset_flag = threading.Event()   # the sides changed: drop everything


def led_map(f):
    """for each LED of a side in wiring order, the pixel of the picture it shows (picture: top row first)"""
    w, h = f["w"], f["h"]
    corner, cols, zig = f.get("corner", "tl"), f.get("dir") == "cols", f.get("zig", True)
    out = []
    lines, length = (w, h) if cols else (h, w)
    for a in range(lines):
        for b in range(length):
            bb = length - 1 - b if zig and a % 2 else b
            if cols:
                x, y = a, bb
            else:
                x, y = bb, a
            if corner in ("tr", "br"):
                x = w - 1 - x
            if corner in ("bl", "br"):
                y = h - 1 - y
            out.append(y * w + x)
    return out


ddp_maps = {}         # side -> (settings it was made for, LED map)
ddp_seq = [0]


def ddp_send(sock, f, i, rgb):
    """sends a side's picture to its board: DDP packets of up to 480 pixels, from the side's first LED"""
    key = (f["w"], f["h"], f.get("corner"), f.get("dir"), f.get("zig"))
    if ddp_maps.get(i, (None,))[0] != key:
        ddp_maps[i] = (key, led_map(f))
    m = ddp_maps[i][1]
    buf = bytearray(len(m) * 3)
    for led, px in enumerate(m):
        buf[led * 3:led * 3 + 3] = rgb[px * 3:px * 3 + 3]
    ddp_seq[0] = ddp_seq[0] % 15 + 1
    base = max(0, int(f.get("start", 1)) - 1) * 3
    n = len(buf)
    for off in range(0, n, 1440):
        part = buf[off:off + 1440]
        push = 0x01 if off + len(part) >= n else 0
        sock.sendto(struct.pack(">BBBBIH", 0x40 | push, ddp_seq[0], 0x0B, 1, base + off, len(part)) + part, (f["ip"], DDP_PORT))


def open_lease(i):
    f = S["faces"][i]
    return open_overlay(f["model"], "grid", f["w"], f["h"], f.get("n") or f["model"])


def open_overlay(model, fmt, w, h, name):
    body = {"model": model, "format": fmt, "blend": "replace", "ttlMs": 8000, "name": "ShowPlay: " + name}
    if fmt == "grid":
        body.update(width=w, height=h)
    r = ezp_call("POST", "/api/ezp/overlays", body)
    if not r.get("ok") or not r.get("lease"):
        raise RuntimeError(r.get("error") or "EZPlayer refused")
    L = r["lease"]
    L["udp"] = r.get("udpPort") or 4049
    L["seq"] = 1
    return L


def close_lease(L):
    try:
        ezp_call("DELETE", "/api/ezp/overlays/%d?token=%d" % (L["id"], L["token"]), timeout=3)
    except Exception:
        pass


def send_frame(sock, host, L, payload):
    """EZPlayer overlay UDP packets (EZO1): a 24-byte header + up to 1400 bytes of data"""
    L["seq"] = (L["seq"] + 1) & 0x7fffffff
    n = len(payload)
    for off in range(0, n, 1400):
        part = payload[off:off + 1400]
        last = 1 if off + len(part) >= n else 0
        sock.sendto(struct.pack(">4sIIIBIHB", b"EZO1", L["id"], L["token"] & 0xffffffff, L["seq"], last, off, len(part), 0) + part,
                    (host, L["udp"]))


def face_name(i):
    if i == KEY_BASE:
        return "Keys"
    if i >= PROP_BASE:
        p = S.get("props", [])
        return p[i - PROP_BASE]["n"] if i - PROP_BASE < len(p) else "prop"
    if i >= len(S["faces"]):
        return str(i)
    f = S["faces"][i]
    return f.get("n") or f.get("model") or "side %d" % (i + 1)


ddp_live = set()      # sides being sent over DDP
game_anims = {}       # side -> the game's drawing on it


def render_loop():
    """sends what each side shows to EZPlayer, FPS times a second; opens and closes the sides' overlays"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    retry = {}        # side -> when to try opening its overlay again
    last_check = 0.0
    while True:
        t0 = time.time()
        host = urllib.parse.urlparse(S["ezp"]).hostname or "127.0.0.1"
        with lock:
            items = list(active.items())
        gs = game.sides()
        if gs:
            items = [(i, a) for i, a in items if i not in gs]
            for i in gs:
                f = S["faces"][i]
                ga = game_anims.get(i)
                if ga is None or (ga["anim"].w, ga["anim"].h) != (f["w"], f["h"]) or ga.get("g") != game.cur.CODE:
                    game_anims[i] = {"anim": game.anim(f["w"], f["h"]), "t0": t0, "g": game.cur.CODE}
                items.append((i, game_anims[i]))
        else:
            game_anims.clear()
        items = sing_items(keys_items(mix_items(tree_items(race_items(items))), t0))   # the Mixer, the Keys and a singer go on top of everything else
        live = {i for i, _ in items}
        live_models = set()
        for i, a in items:
            if i >= PROP_BASE:   # a prop: one overlay for each of its models
                try:
                    payloads = a["anim"].frames(t0 - a["t0"])
                except Exception as e:
                    log("drawing error:", e)
                    continue
                for g, buf in zip(a["anim"].geoms, payloads):
                    k = (i, g.model)
                    live_models.add(k)
                    L = leases.get(k)
                    if L is None:
                        if t0 < retry.get(k, 0):
                            continue
                        try:
                            L = leases[k] = open_overlay(g.model, g.fmt, g.w, g.h, face_name(i))
                        except Exception as e:
                            retry[k] = t0 + 5
                            log("could not open the overlay on %s: %s" % (g.model, e))
                            continue
                    if len(buf) == L.get("frameBytes", len(buf)):
                        send_frame(sock, host, L, buf)
                continue
            if i >= len(S["faces"]):
                continue
            f = S["faces"][i]
            if f.get("out", "ddp") == "ddp":
                try:
                    ddp_send(sock, f, i, bytes(a["anim"].frame(t0 - a["t0"])))
                    ddp_live.add(i)
                except Exception as e:
                    if t0 >= retry.get(i, 0):
                        retry[i] = t0 + 10
                        log("could not send to %s (%s): %s" % (face_name(i), f.get("ip"), e))
                continue
            L = leases.get(i)
            if L is None:
                if t0 < retry.get(i, 0):
                    continue
                try:
                    L = leases[i] = open_lease(i)
                    log("overlay opened on EZPlayer model", S["faces"][i]["model"])
                except Exception as e:
                    retry[i] = t0 + 5
                    log("could not open the overlay on %s: %s" % (S["faces"][i]["model"], e))
                    continue
            try:
                buf = bytes(a["anim"].frame(t0 - a["t0"]))
                if len(buf) == L.get("frameBytes", len(buf)):
                    send_frame(sock, host, L, buf)
            except Exception as e:
                log("drawing error:", e)
        for k in [k for k in list(leases) if (k not in live_models if isinstance(k, tuple) else k not in live)]:
            close_lease(leases.pop(k))
        for i in [i for i in list(ddp_live) if i not in live]:   # a side that finished
            ddp_live.discard(i)
            if S.get("end_dark") and i < len(S["faces"]) and S["faces"][i].get("out", "ddp") == "ddp":
                try:
                    f = S["faces"][i]
                    ddp_send(sock, f, i, bytes(f["w"] * f["h"] * 3))
                except Exception:
                    pass
        # every 5 s: do the overlays still exist? (EZPlayer may have been restarted)
        if leases and t0 - last_check > 5:
            last_check = t0
            try:
                ids = {x.get("id") for x in ezp_call("GET", "/api/ezp/overlays", timeout=3).get("leases", [])}
                for k in [k for k, L in leases.items() if L["id"] not in ids]:
                    leases.pop(k)
                    log("EZPlayer dropped the overlay of", k[1] if isinstance(k, tuple) else face_name(k), "- opening it again")
            except Exception:
                pass
        fps = S.get("fps") if S.get("fps") in (10, 15, 20) else FPS
        time.sleep(max(0.005, 1 / fps - (time.time() - t0)))


def show_loop():
    """each side is independent; requests for the same side wait or replace (wait_turn)"""
    busy = {}         # side -> until when it is showing a request
    shown = {}        # side -> what it is showing
    while True:
        if reset_flag.is_set():
            reset_flag.clear()
            busy.clear(); shown.clear(); waiting.clear()
            with lock:
                active.clear()
        try:
            while True:
                waiting.append(jobs.get_nowait())
        except queue.Empty:
            pass
        now = time.time()
        gs = set(game.sides()) | mix_live_nums()
        for i in gs:   # a side with a game (or driven by the Mixer) shows that; requests for it wait
            busy.pop(i, None)
            shown.pop(i, None)
            with lock:
                active.pop(i, None)
        if not S["on"]:   # requests off: only "Identify" (used while setting up the sides) still shows
            waiting[:] = [j for j in waiting if j[0] == "ident"]
            for i in [i for i in list(busy) if not shown.get(i, "").startswith("identify")]:
                busy.pop(i, None)
                shown.pop(i, None)
                with lock:
                    active.pop(i, None)
            if not waiting and not busy:
                now_showing["what"] = ""
                with lock:
                    active.clear()
                time.sleep(0.3)
                continue
        if not S.get("wait_turn"):   # the newest request for a side replaces the older ones
            newest = {}
            for n, (_, idx, _) in enumerate(waiting):
                for i in idx:
                    newest[i] = n
            waiting[:] = [j for n, j in enumerate(waiting) if any(newest[i] == n for i in j[1])]
            for j in waiting:
                for i in j[1]:
                    busy.pop(i, None)
        taken = set()
        started = False
        for job in list(waiting):
            kind, idx, info = job
            if any(i in gs for i in idx):
                continue
            if any(busy.get(i, 0) > now or i in taken for i in idx):
                taken.update(idx)
                continue
            waiting.remove(job)
            taken.update(idx)
            try:
                anims = make_anims(kind, info, idx)
            except Exception as e:
                log("the request could not be prepared:", e)
                continue
            what = ("animation: %s%s" % (info["src"], " + " + info["t"] if info.get("t") else "") if kind == "gifx" else
                    ("prop %s: %s, %s" % (info["where"], info["n"], info["pal"]) if kind == "prop" else
                     "drawing" if kind == "draw" else "identify" if kind == "ident" else {"text": "text", "gif": "picture", "fx": "effect"}[kind] + ": " +
                     (info.get("t") or info.get("f") or info.get("n") or ""))) + " (" + info.get("where", "") + ")"
            log("showing", what)
            until = time.time() + (10 if kind == "ident" else max(3, int(S["seconds"].get("gif" if kind == "gifx" else kind, 15))))
            t0 = time.time()
            with lock:
                for i, an in anims.items():
                    active[i] = {"anim": an, "t0": t0}
                    busy[i] = until
                    shown[i] = what
            started = True
        now = time.time()
        for i in [i for i, t in busy.items() if t <= now]:
            if any(i in j[1] for j in waiting):
                continue
            del busy[i]
            if S["hold"]:
                continue
            shown.pop(i, None)
            with lock:
                active.pop(i, None)     # the overlay closes and the side goes back to the show
            log("finished:", face_name(i))
        mx = sorted(mix_live_nums())
        now_showing["what"] = " · ".join([shown[i] for i in sorted(shown)] + (["%s (%s)" % (game.cur.NAME, game.st)] if game.sides() else []) +
                                         (["mixer: " + ", ".join(face_name(i) for i in mx)] if mx else []))
        if not started:
            time.sleep(0.2)


# ---------------------------------------------------------------------------- internet channel ----
# ---------------------------------------------------------------------------------------- poster ----
# Everything the bridge posts to ntfy.sh goes through one poster (v19). ntfy.sh's free service gives each internet
# address a bucket of about 60 requests that refills by about one every 5-10 seconds, and answers "429 Too Many
# Requests" when it is empty. At home, the bridge and the phones on the same Wi-Fi share that bucket. So the poster:
#   - keeps only the latest message of each channel (an old game board is never sent after a newer one);
#   - sends the game first, then the status, then the Play and Sing queues;
#   - never sends the same thing twice;
#   - stays within its own budget (POST_BURST, then one every POST_EVERY seconds), leaving room for the phones;
#   - after a 429, waits (Retry-After, or 30 s, 60 s, 120 s…) instead of trying again at once.
POST_BURST = 45
POST_EVERY = 8.0
POST_PRIO = {"game": 0, "status": 1, "tree": 1, "play": 2, "sing": 2}
NTFY_DAILY = 17280          # ntfy.sh's free messages a day for each internet address (shared with the phones on the same Wi-Fi)
NTFY_MAX_WAIT = 600         # never wait longer than this after a 429, even when ntfy.sh asks for hours (v23)


class Poster:
    def __init__(self):
        self.cv = threading.Condition()
        self.pending = {}          # channel -> (body, when queued)
        self.sent = {}             # channel -> last body sent (no duplicates)
        self.tokens = float(POST_BURST)
        self.at = time.time()
        self.block = 0.0           # no posting before this time (after a 429)
        self.fails = 0
        self.stats = {"sent": 0, "429": 0, "skipped": 0}
        self.daily_until = 0.0     # ntfy.sh's daily limit is used up until about this time
        self.dirty = False

    def day(self):
        """today's counts, kept in the settings so a restart does not lose them"""
        d = S.get("ntfy_day") if isinstance(S.get("ntfy_day"), dict) else {}
        today = time.strftime("%Y-%m-%d")
        if d.get("day") != today:
            d = {"day": today, "sent": 0, "rx": 0, "429": 0, "last429": 0}
            S["ntfy_day"] = d
        return d

    def count_rx(self):
        with self.cv:
            self.day()["rx"] = self.day().get("rx", 0) + 1
            self.dirty = True

    def post(self, channel, obj, same=None):
        """queue the latest message of a channel; same = the part that decides whether it changed (default: all of it)"""
        body = json.dumps(obj).encode()
        key = json.dumps(same, sort_keys=True).encode() if same is not None else body
        with self.cv:
            if self.sent.get(channel) == key and channel not in self.pending:
                self.stats["skipped"] += 1
                return
            self.pending[channel] = (body, key, time.time())
            self.cv.notify()

    def state(self):
        with self.cv:
            d = dict(self.day())
            return {"queued": sorted(self.pending), "tokens": round(self.tokens, 1), "blocked": max(0, int(self.block - time.time())),
                    "daily": self.daily_until > time.time(), "daily_until": time.strftime("%H:%M", time.localtime(self.daily_until)) if self.daily_until > time.time() else "",
                    "today": d, "limit": NTFY_DAILY, **self.stats}

    def run(self):
        while True:
            with self.cv:
                while not self.pending:
                    self.cv.wait(5)
                now = time.time()
                self.tokens = min(POST_BURST, self.tokens + (now - self.at) / POST_EVERY)
                self.at = now
                wait = max(self.block - now, 0 if self.tokens >= 1 else (1 - self.tokens) * POST_EVERY)
                if wait > 0:
                    self.cv.wait(min(wait, 5))
                    continue
                ch = min(self.pending, key=lambda c: (POST_PRIO.get(c, 3), self.pending[c][2]))
                body, key, _ = self.pending.pop(ch)
                self.tokens -= 1
            topic = S["topic"]
            if not topic:
                continue
            try:
                urllib.request.urlopen(urllib.request.Request(RELAY + topic + "-" + ch, data=body, headers={"Cache": "yes"}), timeout=10).read()
                with self.cv:
                    self.sent[ch] = key
                    self.stats["sent"] += 1
                    self.day()["sent"] = self.day().get("sent", 0) + 1
                    self.dirty = True
                    self.daily_until = 0.0
                    if self.fails:
                        log("ntfy.sh accepts messages again")
                    self.fails = 0
            except urllib.error.HTTPError as e:
                with self.cv:
                    if (ch not in self.pending):          # keep it, unless a newer one came meanwhile
                        self.pending[ch] = (body, key, time.time())
                    if e.code == 429:
                        self.stats["429"] += 1
                        d = self.day()
                        d["429"], d["last429"], self.dirty = d.get("429", 0) + 1, int(time.time()), True
                        ra = e.headers.get("Retry-After") if e.headers else None
                        asked = int(ra) if ra and str(ra).isdigit() else min(300, 30 * 2 ** self.fails)
                        wait = min(asked, NTFY_MAX_WAIT)     # try again at least every 10 minutes (another network works at once)
                        self.fails += 1
                        self.block = time.time() + wait
                        self.tokens = 0.0
                        if asked > 3600:
                            self.daily_until = time.time() + asked
                            log("ntfy.sh: the daily limit of this internet address is used up (it resets around %s). Trying again every "
                                "%d minutes; another connection (a phone hotspot, WARP) works at once" % (time.strftime("%H:%M", time.localtime(self.daily_until)), wait // 60))
                        else:
                            log("ntfy.sh says too many messages from this internet address (429): waiting %d s before posting again" % wait)
                    else:
                        self.fails += 1
                        self.block = time.time() + min(60, 5 * self.fails)
                        log("could not post to ntfy.sh (%s): trying again in %d s" % (e, min(60, 5 * self.fails)))
            except Exception as e:
                with self.cv:
                    if ch not in self.pending:
                        self.pending[ch] = (body, key, time.time())
                    self.fails += 1
                    self.block = time.time() + min(60, 5 * self.fails)
                    if self.fails in (1, 5, 20):
                        log("could not post to ntfy.sh (%s): trying again in %d s" % (e, min(60, 5 * self.fails)))


poster = Poster()


# ------------------------------------------------------------------------------------ advent calendar ----
# 24 doors (v23). From 1 December, one more door opens each day on the visitors' page; a door holds an effect, a message
# for the cube or a game. Tapping an open door shows its surprise on the lights (a game door opens that game). With
# "unlock", a game appears on the page only from the day of its door.
ADVENT_EMOJI = {"fx": "✨", "text": "💬", "game": "🎮"}
GAME_NAMES = {"c4": "Four in a Row", "ttt": "Tic-tac-toe", "simon": "Simon", "count": "Count the colours", "snake": "Snake",
              "invaders": "Space Invaders", "pong": "Pong", "race": "Race to the Star"}


def advent_default_doors(theme="xm"):
    fx = [k for k, _ in FX_LIST.get(theme if theme in FX_LIST else "xm", FX_LIST["xm"])]
    texts = ["Hello December!", "Ho ho ho!", "Let it snow!", "Santa is coming!", "Happy Holidays!", "Almost Christmas!"]
    games = ["simon", "ttt", "snake", "invaders", "race"]   # doors 4, 8, 12, 16 and 20
    out, fi, ti, gi = [], 0, 0, 0
    for d in range(1, 25):
        if d == 24:
            out.append({"k": "text", "t": "MERRY CHRISTMAS!"})
        elif d % 4 == 0:
            out.append({"k": "game", "g": games[gi % len(games)]}); gi += 1
        elif d % 4 == 2:
            out.append({"k": "text", "t": texts[ti % len(texts)]}); ti += 1
        else:
            out.append({"k": "fx", "e": fx[fi % len(fx)]}); fi += 1
    return out


ADVENT_DEFAULT = {"on": False, "month": 12, "first": 1, "days": 24, "unlock": False, "test_day": 0, "doors": None}


def advent_cfg():
    c = dict(ADVENT_DEFAULT)
    c.update(S.get("advent") or {})
    doors = c.get("doors") if isinstance(c.get("doors"), list) else None
    base = advent_default_doors(S.get("theme") or "xm")
    c["doors"] = [(doors[i] if doors and i < len(doors) and isinstance(doors[i], dict) else base[i]) for i in range(24)]
    return c


def advent_day(c=None):
    """today's door (1-24); 0 before the first day; days+1 after the last (all doors open)"""
    c = c or advent_cfg()
    if isint(c.get("test_day")) and c["test_day"] > 0:
        return min(c["test_day"], c["days"])
    t = time.localtime()
    import datetime
    today = datetime.date(t.tm_year, t.tm_mon, t.tm_mday)
    start = datetime.date(t.tm_year, c["month"], c["first"])
    if (today - start).days < -300:                     # January: last year's calendar
        start = datetime.date(t.tm_year - 1, c["month"], c["first"])
    d = (today - start).days + 1
    return 0 if d < 1 else min(d, c["days"] + 1)


def door_label(dr):
    if dr.get("k") == "fx":
        return FX_NAMES.get(dr.get("e"), "Effect")
    if dr.get("k") == "game":
        return GAME_NAMES.get(dr.get("g"), "Game")
    return str(dr.get("t", ""))[:24]


def advent_public():
    """what the visitors' page needs: today's door and the doors already open (the next ones stay a surprise)"""
    c = advent_cfg()
    if not c["on"]:
        return None
    d = advent_day(c)
    # short, because the whole status must stay under ntfy.sh's 4096 bytes: [emoji, name] or, for a game, ["🎮", its code]
    doors = [["🎮", dr.get("g", "")] if dr.get("k") == "game" else [ADVENT_EMOJI.get(dr.get("k"), "🎁"), door_label(dr)] for dr in c["doors"][:min(d, c["days"])]]
    return {"d": d, "n": c["days"], "m": c["month"], "f": c["first"], "doors": doors}


def game_list_now():
    """the games visitors can play right now (with "unlock", a game appears from the day of its door)"""
    gl = [g for g in GAMES if g in S.get("game_list", GAMES)]
    c = advent_cfg()
    if c["on"] and c["unlock"]:
        d = advent_day(c)
        later = {dr.get("g") for i, dr in enumerate(c["doors"][:c["days"]]) if dr.get("k") == "game" and i + 1 > d}
        gl = [g for g in gl if g not in later]
    return gl


def advent_msg(m):
    """a tapped door -> the request it stands for (a JSON string for check()), or None"""
    c = advent_cfg()
    d, n = m.get("d"), advent_day(c)
    if not c["on"] or not isint(d) or not 1 <= d <= min(n, c["days"]):
        return None
    dr = c["doors"][d - 1]
    z = m.get("z", -1)
    if dr.get("k") == "fx":
        return json.dumps({"k": "fx", "e": dr.get("e"), "z": z})
    if dr.get("k") == "text":
        return json.dumps({"k": "text", "t": dr.get("t", ""), "c": 4, "z": z})
    return None                                        # a game door just opens the game on the phone


def advent_clean(b):
    c = advent_cfg()
    for k in ("on", "unlock"):
        if k in b:
            c[k] = bool(b[k])
    for k, lo, hi in (("month", 1, 12), ("first", 1, 28), ("days", 1, 24), ("test_day", 0, 24)):
        if isint(b.get(k)) and lo <= b[k] <= hi:
            c[k] = b[k]
    if isinstance(b.get("doors"), list) and len(b["doors"]) == 24:
        doors = []
        for dr, old in zip(b["doors"], c["doors"]):
            if isinstance(dr, dict) and dr.get("k") == "fx" and dr.get("e") in FX_NAMES:
                doors.append({"k": "fx", "e": dr["e"]})
            elif isinstance(dr, dict) and dr.get("k") == "game" and dr.get("g") in GAMES:
                doors.append({"k": "game", "g": dr["g"]})
            elif isinstance(dr, dict) and dr.get("k") == "text" and str(dr.get("t", "")).strip():
                t = re.sub(r"[^ -~]", "", plain(str(dr["t"])))[:30].strip()
                doors.append({"k": "text", "t": t} if t and not is_bad(t) else old)
            else:
                doors.append(old)
        c["doors"] = doors
    return c


# ---------------------------------------------------------------------------------- decorate the tree ----
# Visitors hang baubles on a tree of the show (v23): the bridge picks evenly spread spots on the tree's pixels, each
# phone picks a free spot and a colour, and the tree shows every bauble hung so far. The decorated tree is shown for a
# while after each new bauble (or all the time); when it is full there is a party and it starts again (optional).
TREE_COLS = ["ff2a2a", "ffc83c", "2a7bff", "ffffff", "ff5fc8", "a05bff", "ff8c1a", "3cf0ff"]
TREE_BASE = 980
TREE_DEFAULT = {"on": False, "models": [], "spots": 30, "every": 60, "show": 30, "always": False, "bg": "green",
                "restart": True, "bright": 100}
TREE = {"orn": "", "last": -1, "last_at": 0.0, "show_until": 0.0, "party_until": 0.0, "v": 0, "note": None, "by": {}}
tree_shape_cache = {"sig": None, "shape": None}


def tree_cfg():
    c = dict(TREE_DEFAULT)
    c.update(S.get("tree") or {})
    return c


def tree_clean(b):
    c = tree_cfg()
    for k in ("on", "always", "restart"):
        if k in b:
            c[k] = bool(b[k])
    if isinstance(b.get("models"), list):
        c["models"] = [str(x)[:120] for x in b["models"]][:64]
    for k, lo, hi in (("spots", 8, 60), ("every", 0, 600), ("show", 10, 300), ("bright", 10, 100)):
        if isint(b.get(k)) and lo <= b[k] <= hi:
            c[k] = b[k]
    if b.get("bg") in ("green", "off"):
        c["bg"] = b["bg"]
    return c


class TreeShape:
    """the tree's pixels, the spots for baubles (evenly spread), which pixels belong to which spot, and an outline"""
    def __init__(self, geoms, n):
        self.geoms = geoms
        pts = [(g.u[i], g.v[i]) for g in geoms for i in range(g.n)]
        AX = 0.6                                           # a tree is taller than wide: across counts a bit less
        cand = [p for p in pts if 0.05 <= p[1] <= 0.9] or pts
        if len(cand) > 3000:
            cand = cand[::len(cand) // 3000 + 1]
        spots = []
        if cand:
            first = min(cand, key=lambda p: (p[0] - 0.5) ** 2 + (p[1] - 0.15) ** 2)
            spots.append(first)
            dist = [((p[0] - first[0]) * AX) ** 2 + (p[1] - first[1]) ** 2 for p in cand]
            while len(spots) < min(n, len(cand)):
                j = max(range(len(cand)), key=dist.__getitem__)
                s = cand[j]
                spots.append(s)
                dist = [min(dd, ((p[0] - s[0]) * AX) ** 2 + (p[1] - s[1]) ** 2) for dd, p in zip(dist, cand)]
        self.spots = spots
        gap = min((math.sqrt(((a[0] - b[0]) * AX) ** 2 + (a[1] - b[1]) ** 2) for i, a in enumerate(spots) for b in spots[i + 1:]), default=0.1)
        r2 = (max(0.012, gap * 0.42)) ** 2
        self.map = []
        for g in geoms:
            mp = []
            for i in range(g.n):
                best, bd = -1, r2
                for k, s in enumerate(spots):
                    dd = ((g.u[i] - s[0]) * AX) ** 2 + (g.v[i] - s[1]) ** 2
                    if dd < bd:
                        best, bd = k, dd
                mp.append(best)
            self.map.append(mp)
        bands = 10                                          # the outline: widest pixels of 10 bands, for the phones
        left, right = [], []
        for b in range(bands):
            lo, hi = b / bands, (b + 1) / bands
            us = [p[0] for p in pts if lo <= p[1] <= hi]
            if us:
                left.append([round(min(us), 2), round((lo + hi) / 2, 2)])
                right.append([round(max(us), 2), round((lo + hi) / 2, 2)])
        self.outline = left + right[::-1]


def tree_shape():
    c = tree_cfg()
    if not c["models"]:
        return None
    sig = (tuple(c["models"]), c["spots"], ezp_state.get("layoutVersion"))
    if tree_shape_cache["sig"] != sig:
        geoms = model_geoms({"n": "tree", "models": c["models"], "across": True})
        tree_shape_cache["shape"] = TreeShape(geoms, c["spots"]) if geoms else None
        tree_shape_cache["sig"] = sig
    return tree_shape_cache["shape"]


def tree_orn(n):
    o = TREE["orn"] or S.get("tree_orn", "")
    o = (o + "0" * n)[:n] if re.fullmatch(r"[0-8]*", o or "") else "0" * n
    TREE["orn"] = o
    return o


class TreeAnim:
    """the decorated tree on EZPlayer: a dim tree, the baubles twinkling, the newest one sparkling, a party when full"""
    def __init__(self, shape):
        self.shape, self.geoms = shape, shape.geoms

    def frames(self, t):
        c, now = tree_cfg(), time.time()
        k = c["bright"] / 100
        orn = tree_orn(len(self.shape.spots))
        bg = (0, int(34 * k), int(6 * k)) if c["bg"] == "green" else (0, 0, 0)
        party = now < TREE["party_until"]
        out = []
        for g, mp in zip(self.geoms, self.shape.map):
            buf = bytearray(g.n * 3)
            for i in range(g.n):
                s = mp[i]
                if party:
                    col = hsv((g.v[i] * 0.7 - now * 0.5) % 1, 1, k)
                elif s >= 0 and orn[s] != "0":
                    base = hexrgb(TREE_COLS[int(orn[s]) - 1])
                    tw = 0.75 + 0.25 * math.sin(now * 2.3 + s * 1.7)
                    if s == TREE["last"] and now - TREE["last_at"] < 4 and int(now * 8) % 2:
                        col = (255, 255, 255)                 # the newest bauble sparkles
                    else:
                        col = tuple(int(v * tw * k) for v in base)
                else:
                    col = bg
                o = i * 3
                buf[o], buf[o + 1], buf[o + 2] = col[0], col[1], col[2]
            out.append(bytes(buf))
        return out


tree_anim = {"a": None}


def tree_items(items):
    """render_loop: the decorated tree, after a new bauble (or always), under the Mixer, the Keys and the singers"""
    c = tree_cfg()
    now = time.time()
    if not c["on"] or not c["models"] or not (c["always"] or now < TREE["show_until"] or now < TREE["party_until"]):
        return items
    try:
        shape = tree_shape()
    except Exception as e:
        log("tree: could not read the tree:", e)
        return items
    if not shape:
        return items
    if tree_anim["a"] is None or tree_anim["a"].shape is not shape:
        tree_anim["a"] = TreeAnim(shape)
    return list(items) + [(TREE_BASE, {"anim": tree_anim["a"], "t0": 0.0})]


def tree_msg(m):
    """a visitor hangs a bauble: {k: tree, i: spot, c: colour 1-8, p, tag}; returns a short reason when refused"""
    c = tree_cfg()
    pid, tag = str(m.get("p", "")), str(m.get("tag", ""))
    if not PID_RE.fullmatch(pid) or not TAG_RE.fullmatch(tag):
        return "bad player"
    if not c["on"] or not c["models"]:
        return "the tree is closed"
    shape = tree_shape()
    if not shape:
        return "the tree is not ready"
    n = len(shape.spots)
    i, col = m.get("i"), m.get("c")
    if not isint(i) or not 0 <= i < n or not isint(col) or not 1 <= col <= len(TREE_COLS):
        return "bad request"
    now = time.time()
    with lock:
        orn = tree_orn(n)
        if now < TREE["party_until"]:
            return "party"
        if orn[i] != "0":
            return "taken"
        wait = c["every"] - (now - TREE["by"].get(pid, 0))
        if wait > 0:
            return "wait %d" % math.ceil(wait)
        TREE["orn"] = orn[:i] + str(col) + orn[i + 1:]
        TREE["by"][pid] = now
        TREE["last"], TREE["last_at"], TREE["show_until"] = i, now, now + c["show"]
        if "0" not in TREE["orn"]:
            log("tree: full! party on the lights")
            if c["restart"]:
                TREE["party_until"] = now + 15
                TREE["show_until"] = now + 15
        S["tree_orn"] = TREE["orn"]
        TREE["v"] += 1
    log("tree: a bauble on spot %d (%d of %d)" % (i + 1, n - TREE["orn"].count("0"), n))
    save()
    return ""


def tree_refuse(m, why):
    if isinstance(m.get("tag"), str):
        TREE["note"] = {"tag": m["tag"][:12], "why": why[:30], "at": int(time.time())}
        TREE["v"] += 1


def tree_state():
    c = tree_cfg()
    shape = tree_shape() if c["on"] and c["models"] else None
    st = {"on": bool(shape), "v": TREE["v"], "at": int(time.time())}
    if shape:
        n = len(shape.spots)
        st.update(o=tree_orn(n), sp=[[round(u, 2), round(v, 2)] for u, v in shape.spots], ol=shape.outline,
                  cols=TREE_COLS, every=c["every"], party=time.time() < TREE["party_until"])
    if TREE["note"] and time.time() - TREE["note"]["at"] < 60:
        st["note"] = TREE["note"]
    return st


def tree_loop():
    """posts the tree for the phones when it changes; empties it after the party"""
    posted = None
    while True:
        try:
            now = time.time()
            if TREE["party_until"] and now > TREE["party_until"]:
                with lock:
                    TREE["party_until"] = 0.0
                    if "0" not in TREE["orn"]:
                        TREE["orn"] = "0" * len(TREE["orn"])
                        S["tree_orn"] = TREE["orn"]
                        TREE["v"] += 1
                save()
            c = tree_cfg()
            key = (c["on"], tuple(c["models"]), c["spots"], TREE["v"])
            if S["topic"] and key != posted and (c["on"] or posted is not None):
                st = tree_state()
                poster.post("tree", st, same={k: x for k, x in st.items() if k not in ("at", "v")})
                posted = key
        except Exception as e:
            log("tree:", e)
        time.sleep(0.5)


def publish_status(force=False):
    """the visitors' page reads this to know whether requests are on, the sides and their sizes"""
    try:
        on = bool(S["on"] and (S["faces"] or (S.get("props") and ezp_state["ok"])) and
                  (ezp_state["ok"] or not any(f.get("out") == "ezp" for f in S["faces"])))
        st = {"on": on, "faces": [{"n": f.get("n", ""), "w": f["w"], "h": f["h"]} for f in S["faces"]],
                           "theme": S["theme"], "free": S["free"], "wait": S["wait"], "title": S.get("title", ""), "games": bool(S.get("games")) and bool(game_list_now()),
                           "gl": game_list_now(), "adv": advent_public(), "tree": tree_cfg()["on"] and bool(tree_cfg()["models"]), "play": play_on(), "sing": sing_on(),
                           "race": {k: race_cfg()[k] for k in ("modes", "colours", "shared", "mix", "max", "min", "early")},
                           "singers": [{"k": k, "n": n, "e": e} for k, n, e, kind, on in sing_list() if on][:30],
                           "props": [{"n": p["n"], "e": p.get("e", "")} for p in S.get("props", [])] if ezp_state["ok"] else []}
        # ntfy.sh turns a message over 4096 bytes into a file the page cannot read: drop singers, then props, to fit
        while len(json.dumps(st).encode()) > 3900 and (st["singers"] or st["props"]):
            (st["singers"] or st["props"]).pop()
        same = dict(st, keep=int(time.time() // 1800) if force else 0)   # unchanged status is not posted again, except the half-hourly one
        st["at"] = int(time.time())
        poster.post("status", st, same=same)
    except Exception as e:
        log("could not make the status for the visitors' page:", e)


def status_loop():
    """posts the status at start, whenever it changes (checked every 20 s) and every half hour"""
    last_force = 0.0
    while True:
        now = time.time()
        force = now - last_force > 1800
        if force:
            last_force = now
        publish_status(force=force)
        if poster.dirty:                       # today's ntfy.sh counts, kept in the settings
            poster.dirty = False
            try:
                save()
            except Exception:
                pass
        time.sleep(20)


def listen():
    since = None
    while True:
        try:
            url = "%s%s/json" % (RELAY, S["topic"]) + ("?since=%s" % since if since else "")
            with urllib.request.urlopen(url, timeout=90) as r:
                log("connected to the show channel")
                for line in r:
                    ev = json.loads(line)
                    if ev.get("event") != "message":
                        continue
                    since = ev.get("id", since)
                    poster.count_rx()
                    add(ev.get("message", ""), ev.get("attachment"))
        except Exception as e:
            log("channel disconnected (%s); reconnecting in 5 s" % e)
            time.sleep(5)


def my_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


# ----------------------------------------------------------------------------------------- mixer ----
# The Mixer (v12): a page of pads and faders, like a MIDI controller, for whoever runs the show. It is at
# http://<this-computer's-ip>:8099/mixer and works from a phone or tablet on the same Wi-Fi. Pick one or more targets
# (sides of the cube, props of the show), hit a pad to start an effect on them, a colour pad to change the palette and
# move the faders to change speed, colour and brightness live. While the Mixer drives a target, visitors' requests and
# games for it wait; "Release" gives it back. Every control has a name (pad:fire, pal:ice, fader:speed, hold:flash…)
# so a physical MIDI controller can later be mapped to the same controls.
MIX_IDLE = (0, 5, 15, 60)     # minutes without touching the Mixer before it gives everything back (0 = never)
MIX_HOLDS = ("flash", "strobe", "black")
MIX_FADERS = ("speed", "hue", "white")
MIX_DEFAULT = {"on": False, "fx": "wave", "pal": "rainbow", "speed": 0.5, "hue": 0.0, "white": 0.0, "text": ""}
MIX = {"t": {}, "sel": [], "bright": 1.0, "hold": {}, "touched": 0.0}   # live state (not saved; scenes are)
mix_objs = {}         # target key -> MixTarget (rebuilt when the sides or props change)
mix_loading = set()   # props whose pixel positions are being read


def mix_targets():
    """what the Mixer can drive: [(key, number used by the renderer, name, kind)]"""
    out = [("s%d" % i, i, face_name(i), "side") for i in range(len(S["faces"]))]
    if ezp_state["ok"]:
        out += [("p%d" % i, PROP_BASE + i, p["n"], "prop") for i, p in enumerate(S.get("props", []))]
    return out


def mix_key_num(key):
    return int(key[1:]) + (PROP_BASE if key[0] == "p" else 0)


def mix_live_nums():
    """renderer numbers of the targets the Mixer is driving now"""
    with lock:
        return {mix_key_num(k) for k, v in MIX["t"].items() if v.get("on")}


def mix_cols(st):
    """the target's palette, turned by the colour fader and blended towards white by the white fader"""
    import colorsys
    cols = PALETTES.get(st["pal"], PALETTES["rainbow"])[1]
    out = []
    for c in cols:
        r, g, b = (x / 255 for x in hexrgb(c))
        hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
        r, g, b = colorsys.hsv_to_rgb((hh + st["hue"]) % 1.0, ss, vv)
        w = st["white"]
        out.append("%02x%02x%02x" % tuple(int(255 * (x + (1 - x) * w)) for x in (r, g, b)))
    return out


class MixTarget:
    """one side or prop driven by the Mixer: its effect follows the Mixer's state frame by frame"""
    def __init__(self, key, geoms=None, w=0, h=0):
        self.key, self.w, self.h = key, w, h
        self.geoms = geoms if geoms is not None else [PropGeom("side", "grid", w * h, [x / max(1, w - 1) for y in range(h) for x in range(w)],
                                                               [1 - y / max(1, h - 1) for y in range(h) for x in range(w)], w, h)]
        self.side = geoms is None
        self.sig = self.look = None
        self.eng = None
        self.tm, self.last = 0.0, None

    def _engine(self, st):
        fx, look = st["fx"], (st["pal"], round(st["hue"], 3), round(st["white"], 3))
        cols = None
        if (fx, st["text"] if fx == "t:text" else "") != self.sig:
            self.sig = (fx, st["text"] if fx == "t:text" else "")
            cols = mix_cols(st)
            if fx.startswith("c:") and self.side:
                self.eng = Fx(self.w, self.h, fx[2:], [hexrgb(c) for c in cols[:2]])
            elif fx == "t:text" and self.side:
                self.eng = Text(self.w, self.h, st["text"] or " ", hexrgb(cols[0]))
            else:
                self.eng = PropFx(self.geoms, fx if fx in PROP_FX else "wave", cols, 1)
            self.look = look
        elif look != self.look:   # only the colours changed: keep the effect running, change its colours
            self.look = look
            cols = mix_cols(st)
            if isinstance(self.eng, PropFx):
                self.eng.lut = pal_lut(cols, wrap=self.eng.fx != "fire")
            elif isinstance(self.eng, Fx):
                self.eng.cols = [hexrgb(c) for c in cols[:2]]
            elif isinstance(self.eng, Text):
                self.eng.color = bytes(hexrgb(cols[0]))

    def _step(self, t, st):
        dt = 0.0 if self.last is None else max(0.0, min(0.2, t - self.last))
        self.last = t
        sp = 0.2 * 15 ** st["speed"]     # the speed fader: 0.2x .. 3x
        self.tm += dt * sp
        return dt * sp

    def _post(self, buf, n):
        return mix_scale(buf, n, 1.0)

    def state(self):
        with lock:
            return dict(MIX["t"].get(self.key) or MIX_DEFAULT)

    def frame(self, t):       # a side: one picture
        st = self.state()
        self._engine(st)
        dt = self._step(t, st)
        if isinstance(self.eng, PropFx):
            buf = self.eng.one(0, self.geoms[0], self.tm, dt)
        else:
            buf = self.eng.frame(self.tm)
        return self._post(buf, self.w * self.h)

    def frames(self, t):      # a prop: one buffer for each of its models
        st = self.state()
        self._engine(st)
        dt = self._step(t, st)
        return [self._post(self.eng.one(gi, g, self.tm, dt), g.n) for gi, g in enumerate(self.geoms)]


def mix_load_prop(key):
    try:
        pi = int(key[1:])
        g = prop_geometry(pi)
        if g:
            mix_objs[key] = MixTarget(key, geoms=g)
        else:
            log("mixer: prop %s has no models EZPlayer knows" % S["props"][pi]["n"])
    except Exception as e:
        log("mixer: could not read the prop's pixel positions:", e)
    finally:
        mix_loading.discard(key)


def mix_items(items):
    """render_loop: the targets the Mixer drives replace what they would show"""
    with lock:
        live = [k for k, v in MIX["t"].items() if v.get("on")]
    if not live:
        return items
    nums = {}
    for key in live:
        n, o = mix_key_num(key), mix_objs.get(key)
        if key[0] == "s":
            i = n
            if i >= len(S["faces"]):
                continue
            f = S["faces"][i]
            if o is None or (o.w, o.h) != (f["w"], f["h"]):
                o = mix_objs[key] = MixTarget(key, w=f["w"], h=f["h"])
        elif o is None:
            if int(key[1:]) < len(S.get("props", [])) and key not in mix_loading:
                mix_loading.add(key)
                threading.Thread(target=mix_load_prop, args=(key,), daemon=True).start()
            continue
        nums[n] = {"anim": o, "t0": 0.0}
    return [(i, a) for i, a in items if i not in nums] + list(nums.items())


def mix_reset():
    """the sides or props changed: drop the Mixer's targets and drawings"""
    with lock:
        MIX["t"].clear()
        MIX["sel"] = []
    mix_objs.clear()


def mix_scene_names():
    sc = S.get("mixer_scenes") or []
    return [(s or {}).get("name", "") if s else "" for s in (sc + [None] * 8)[:8]]


def mix_state():
    tg = mix_targets()
    with lock:
        t = {k: dict(MIX["t"].get(k) or MIX_DEFAULT) for k, _, _, _ in tg}
        sel = [k for k in MIX["sel"] if k in t]
        now = time.time()
        return {"ok": True, "version": VERSION, "targets": [{"k": k, "n": n, "kind": kind} for k, _, n, kind in tg], "t": t, "sel": sel,
                "bright": MIX["bright"], "hold": [h for h in MIX_HOLDS if MIX["hold"].get(h, 0) > now], "idle": S.get("mixer_idle", 15),
                "scenes": mix_scene_names(), "ezpOk": ezp_state["ok"], "loading": sorted(mix_loading),
                "fx": [[k, n] for k, n in PROP_FX.items()], "cube": [[k, n] for k, n in FX_NAMES.items()],
                "pals": [[k, v[0], v[1]] for k, v in PALETTES.items()]}


def mix_action(b):
    """one press, fader move or hold from the Mixer page (or, later, from a MIDI controller)"""
    a = b.get("a")
    now = time.time()
    with lock:
        MIX["touched"] = now
        valid = {k for k, _, _, _ in mix_targets()}
        sel = [k for k in MIX["sel"] if k in valid]

        def each(fn):
            for k in sel:
                st = MIX["t"].setdefault(k, dict(MIX_DEFAULT))
                fn(st, k)
        if a == "sel":
            ks = b.get("keys")
            if isinstance(ks, list):
                MIX["sel"] = [k for k in ks if isinstance(k, str) and k in valid][:24]
        elif a == "pad":
            fx = str(b.get("fx", ""))
            if not (fx in PROP_FX or (fx.startswith("c:") and fx[2:] in FX_NAMES)):
                return False
            if True:
                def go(st, k):
                    if fx.startswith("c:") and k[0] != "s":   # cube effects are drawn on a grid: props keep theirs
                        return
                    st.update(fx=fx, on=True)
                each(go)
        elif a == "text":
            t = re.sub(r"[^ -~]", "", plain(str(b.get("t", ""))))[:60].strip()
            if t:
                each(lambda st, k: k[0] == "s" and st.update(fx="t:text", text=t, on=True))
        elif a == "pal":
            if b.get("pal") in PALETTES:
                each(lambda st, k: st.update(pal=b["pal"]))
        elif a == "fader":
            name, v = b.get("name"), b.get("v")
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                v = max(0.0, min(1.0, float(v)))
                if name == "bright":
                    MIX["bright"] = v
                elif name in MIX_FADERS:
                    each(lambda st, k: st.update({name: v}))
        elif a == "hold":
            name, ms = b.get("name"), b.get("ms", 0)
            if name in MIX_HOLDS and isint(ms):
                MIX["hold"][name] = now + min(1500, max(0, ms)) / 1000
        elif a == "off":
            each(lambda st, k: st.update(on=False))
        elif a == "release":
            for st in MIX["t"].values():
                st["on"] = False
            MIX["hold"].clear()
        elif a == "idle":
            if b.get("v") in MIX_IDLE:
                S["mixer_idle"] = b["v"]
                save()
        elif a in ("save", "load", "clear") and isint(b.get("n")) and 0 <= b["n"] < 8:
            sc = (list(S.get("mixer_scenes") or []) + [None] * 8)[:8]
            n = b["n"]
            if a == "save":
                sc[n] = {"name": str(b.get("name", "")).strip()[:16] or "Scene %d" % (n + 1), "bright": MIX["bright"],
                         "t": {k: dict(v) for k, v in MIX["t"].items() if v.get("on")}}
                log("mixer: saved", sc[n]["name"])
            elif a == "clear":
                sc[n] = None
            elif sc[n]:
                MIX["t"] = {k: dict(MIX_DEFAULT, **v) for k, v in sc[n]["t"].items() if k in valid}
                MIX["bright"] = float(sc[n].get("bright", 1.0))
                log("mixer: scene", sc[n]["name"])
            S["mixer_scenes"] = sc
            save()
        else:
            return False
    return True


def mix_watch():
    """gives everything back when nobody has touched the Mixer for a while (the Mixer page's setting)"""
    while True:
        time.sleep(10)
        idle = S.get("mixer_idle", 15)
        if idle and mix_live_nums() and time.time() - MIX["touched"] > idle * 60:
            mix_action({"a": "release"})
            log("mixer: nobody touched it for %d min, the lights go back to the visitors and the show" % idle)


# ------------------------------------------------------------------------------------------ keys ----
# Keys (v12): every model of every prop, and every side of the cube, becomes a key — up to 128, like the notes of
# a MIDI keyboard. Press a key and that one model lights up: how hard (velocity) sets how bright, sliding the finger
# while holding (aftertouch) changes it live, letting go fades it out (release). Each key has its own colour, effect
# and level; the Attack, Release and Master faders act on all of them. Example: a prop "Snowflakes" made of the group
# of all the snowflakes gives one key for each snowflake, to play them like a piano.
KEYS_MAX = 128
KEY_BASE = 900        # renderer number of the keys' models (one overlay for each model that is sounding)
KEY_DEFAULT = {"fx": "solid", "pal": "", "hue": 0.0, "white": 0.0, "level": 1.0}
KEYS = {"down": {}, "env": {}, "set": {}, "col": {}, "attack": 0.0, "release": 0.35, "hue": 0.0}   # col: a visitor's colour
key_geoms = {}        # key id -> PropGeom (a model) — filled in the background
key_objs = {}         # key id -> (signature, effect engine)
keys_loading = [False]


def keys_list():
    """[(key id, name, kind)]: the sides of the cube, then each model of each prop (each model once)"""
    out = [("s%d" % i, face_name(i), "side") for i in range(len(S["faces"]))]
    seen = set()
    if ezp_state["ok"]:
        for p in S.get("props", []):
            for m in p["models"]:
                if m not in seen:
                    seen.add(m)
                    out.append(("m:" + m, m, p["n"]))
    return out[:KEYS_MAX]


def keys_prepare():
    """reads where the pixels of every key's model are (once; the same reading the props use)"""
    if keys_loading[0]:
        return
    keys_loading[0] = True
    try:
        for pi in range(len(S.get("props", []))):
            try:
                for g in prop_geometry(pi):
                    key_geoms.setdefault("m:" + g.model, g)
            except Exception as e:
                log("keys: prop %s not ready: %s" % (S["props"][pi]["n"], e))
    finally:
        keys_loading[0] = False


def keys_reset():
    with lock:
        KEYS["down"].clear(); KEYS["env"].clear(); KEYS["set"].clear()
    key_geoms.clear(); key_objs.clear()


def key_setting(k, n):
    st = dict(KEY_DEFAULT, hue=(n * 0.13) % 1.0)   # keys start with different colours, like a rainbow keyboard
    st.update(KEYS["set"].get(k) or {})
    if KEYS["col"].get(k):          # a visitor playing the lights picked this colour
        st.update(fx="solid", pal="", fixcol=KEYS["col"][k])
    return st


def key_cols(st):
    if st.get("fixcol"):
        c = hexrgb(st["fixcol"])
        return [st["fixcol"]] + ["%02x%02x%02x" % tuple(int(v * k) for v in c) for k in (0.75, 0.5)]
    if st["pal"] in PALETTES:
        return mix_cols(dict(st, hue=(st["hue"] + KEYS["hue"]) % 1.0 if st["pal"] else st["hue"]))
    import colorsys
    out = []
    for dh, dv in ((0, 1.0), (0.06, 0.8), (-0.06, 0.55)):   # the key's colour and two neighbours, for the moving effects
        r, g, b = colorsys.hsv_to_rgb((st["hue"] + KEYS["hue"] + dh) % 1.0, 1.0, dv)
        w = st["white"]
        out.append("%02x%02x%02x" % tuple(int(255 * (x + (1 - x) * w)) for x in (r, g, b)))
    return out


def key_engine(k, st, geom):
    sig = (st["fx"], st["pal"], round(st["hue"], 3), round(st["white"], 3), round(KEYS["hue"], 3), geom.n, st.get("fixcol"))
    cur = key_objs.get(k)
    if cur and cur[0][1:] == sig[1:] and cur[0][0] == sig[0]:
        return cur[1]
    if cur and cur[0][0] == sig[0]:      # same effect, new colours: keep it running
        cur[1].lut = pal_lut(key_cols(st), wrap=st["fx"] != "fire")
        key_objs[k] = (sig, cur[1])
        return cur[1]
    e = PropFx([geom], st["fx"] if st["fx"] in PROP_FX else "solid", key_cols(st), 1)
    key_objs[k] = (sig, e)
    return e


def keys_levels(now, dt):
    """moves each key's envelope: up to velocity × aftertouch while held (attack), down to 0 when let go (release)"""
    out = {}
    with lock:
        down, env = KEYS["down"], KEYS["env"]
        for k in [k for k, d in down.items() if now - d["seen"] > 4 or now > d.get("off_at", float("inf"))]:
            down.pop(k)   # the phone went away while holding a key, or a visitor's tap is over
        a, r = KEYS["attack"], KEYS["release"]
        for k in set(down) | set(env):
            cur = env.get(k, 0.0)
            if k in down:
                d = down[k]
                goal = d["vel"] if d.get("after") is None else d["after"]
                cur = goal if a <= 0.01 else min(goal, cur + dt / a) if cur < goal else max(goal, cur - dt / 0.15)
            else:
                cur = 0.0 if r <= 0.01 else cur - dt / r
            if cur <= 0.003:
                env.pop(k, None)
            else:
                env[k] = cur
                out[k] = cur
    return out


class KeysAnim:
    """all the keys' models that are sounding: the renderer sends each one to its own overlay"""
    def __init__(self):
        self.geoms, self.tm, self.last, self.ids = [], 0.0, None, []

    def frames(self, t):
        dt = 0.0 if self.last is None else max(0.0, min(0.2, t - self.last))
        self.last = t
        self.tm += dt
        levels = keys_levels(time.time(), dt)
        index = {k: n for n, (k, _, _) in enumerate(keys_list())}
        self.geoms, out = [], []
        for k, lv in levels.items():
            if k[0] == "s" or k not in key_geoms or k not in index:
                continue
            g = key_geoms[k]
            st = key_setting(k, index[k])
            buf = key_engine(k, st, g).one(0, g, self.tm, dt)
            self.geoms.append(g)
            out.append(mix_scale(buf, g.n, lv * st["level"]))
        return out


class KeySide:
    """a side of the cube played as a key"""
    def __init__(self, k, w, h):
        self.k, self.w, self.h = k, w, h
        self.g = PropGeom("side", "grid", w * h, [x / max(1, w - 1) for y in range(h) for x in range(w)],
                          [1 - y / max(1, h - 1) for y in range(h) for x in range(w)], w, h)
        self.lv = 0.0

    def frame(self, t):
        n = int(self.k[1:])
        st = key_setting(self.k, n)
        buf = key_engine(self.k, st, self.g).one(0, self.g, t, 0.05)
        return mix_scale(buf, self.g.n, self.lv * st["level"])


def mix_scale(buf, n, k):
    """a frame at k brightness (0..1), then the Mixer's Master fader and Flash / Strobe / Blackout"""
    now, hold = time.time(), MIX["hold"]
    if hold.get("black", 0) > now:
        return bytes(n * 3)
    if hold.get("flash", 0) > now or (hold.get("strobe", 0) > now and int(now * 12) % 2 == 0):
        return b"\xff" * (n * 3)
    if hold.get("strobe", 0) > now:
        return bytes(n * 3)
    k = max(0.0, min(1.0, k * MIX["bright"]))
    return bytes(buf) if k >= 0.999 else bytes(buf).translate(fade_table(k))


keys_anim = KeysAnim()
key_sides = {}


def keys_items(items, t0):
    """render_loop: the keys that are sounding go on top of everything else"""
    with lock:
        busy = bool(KEYS["down"] or KEYS["env"])
    if not busy:
        keys_anim.last = None
        return items
    if not key_geoms and S.get("props") and not keys_loading[0]:
        threading.Thread(target=keys_prepare, daemon=True).start()
    with lock:
        env = dict(KEYS["env"]); sides = [k for k in set(KEYS["down"]) | set(env) if k[0] == "s"]
    out = list(items) + [(KEY_BASE, {"anim": keys_anim, "t0": 0.0})]
    for k in sides:
        i = int(k[1:])
        if i >= len(S["faces"]):
            continue
        f = S["faces"][i]
        o = key_sides.get(k)
        if o is None or (o.w, o.h) != (f["w"], f["h"]):
            o = key_sides[k] = KeySide(k, f["w"], f["h"])
        o.lv = env.get(k, 0.0)
        if o.lv > 0 or k in KEYS["down"]:
            out = [(n, a) for n, a in out if n != i] + [(i, {"anim": o, "t0": 0.0})]
    return out


def keys_state():
    lst = keys_list()
    with lock:
        return {"ok": True, "keys": [dict(key_setting(k, n), k=k, n=name, g=grp, note=n) for n, (k, name, grp) in enumerate(lst)],
                "attack": KEYS["attack"], "release": KEYS["release"], "hue": KEYS["hue"], "bright": MIX["bright"],
                "ready": len(key_geoms), "ezpOk": ezp_state["ok"],
                "fx": [[k, n] for k, n in PROP_FX.items()], "pals": [[k, v[0], v[1]] for k, v in PALETTES.items()]}


def keys_action(b):
    """note on / aftertouch / note off / settings, from the Keys page (or later from a MIDI keyboard)"""
    a, k = b.get("a"), b.get("k")
    now = time.time()
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
    with lock:
        MIX["touched"] = now
        if a in ("on", "after", "off", "set"):
            if not isinstance(k, str) or k not in {x[0] for x in keys_list()}:
                return False
        if a == "on":
            KEYS["col"].pop(k, None)   # the crew plays it: its own colour again
            v = max(0.05, min(1.0, float(b["v"]))) if num(b.get("v")) else 0.8
            KEYS["down"][k] = {"vel": v, "after": None, "seen": float("inf") if b.get("midi") else now}
        elif a == "after":
            d = KEYS["down"].get(k)
            if d:
                if num(b.get("v")):   # the page: the finger's height on the key sets how bright
                    d["after"] = max(0.0, min(1.0, float(b["v"])))
                d["seen"] = now
        elif a == "off":
            KEYS["down"].pop(k, None)
        elif a == "allOff":
            KEYS["down"].clear()
        elif a == "set":
            st = KEYS["set"].setdefault(k, {})
            if b.get("fx") in PROP_FX:
                st["fx"] = b["fx"]
            if b.get("pal") in PALETTES or b.get("pal") == "":
                st["pal"] = b["pal"]
            for f in ("hue", "white", "level"):
                if num(b.get(f)):
                    st[f] = max(0.0, min(1.0, float(b[f])))
            S["keys_set"] = KEYS["set"]
            save()
        elif a == "glob":
            for f, hi in (("attack", 2.0), ("release", 4.0), ("hue", 1.0)):
                if num(b.get(f)):
                    KEYS[f] = max(0.0, min(hi, float(b[f])))
            if num(b.get("bright")):
                MIX["bright"] = max(0.0, min(1.0, float(b["bright"])))
            S["keys_glob"] = {f: KEYS[f] for f in ("attack", "release", "hue")}
            save()
        else:
            return False
    return True


# ------------------------------------------------------------------------------------------ MIDI ----
# A real MIDI controller or keyboard plays the same controls as the Mixer and Keys pages. Notes play the keys (note
# number - first note = key number) with their velocity; aftertouch makes a held key brighter; CC messages (faders,
# knobs) and notes can be "learned" onto any control of the pages: press Learn, touch the control on the page, then
# move or press the one on the MIDI device. Where the messages come from:
#   - Windows: the bridge reads the MIDI devices itself (winmm, part of Windows);
#   - Linux and Raspberry Pi: the bridge reads /dev/snd/midi* itself (the user must be in the "audio" group);
#   - any computer (macOS included): the Mixer page in Chrome or Edge, opened at http://localhost:8099/mixer on the
#     computer the device is plugged into, passes its messages on (Web MIDI).
MIDI = {"devices": [], "last": "", "learn": "", "at": 0.0}
MIDI_CC_DEFAULT = {7: "fader:bright", 1: "keys:hue"}   # volume fader -> Master, modulation wheel -> colour of the keys
# Presets: a ready mapping for a controller. Alesis VI25, factory settings: pads = notes 36-51 on channel 10, knobs =
# CC 20-27, keys on channel 1 (they play the Keys). If a pad does nothing, the page's MIDI monitor shows what it sends:
# use Learn on it.
MIDI_PRESETS = {
    "vi25": ("Alesis VI25", dict(
        [("n9:%d" % (36 + i), "pad:" + k) for i, k in enumerate(["flap", "wave", "rise", "spin", "breathe", "sparkle",
                                                                   "fire", "ripple", "chase", "comet", "confetti", "solid"])] +
        [("n9:48", "hold:flash"), ("n9:49", "hold:strobe"), ("n9:50", "hold:black"), ("n9:51", "release")] +
        [("c0:%d" % (20 + i), c) for i, c in enumerate(["fader:bright", "fader:speed", "fader:hue", "fader:white",
                                                        "keys:attack", "keys:release", "keys:hue", "pals:all"])])),
}


def midi_controls():
    """every control a MIDI note or CC can be learned onto"""
    c = ["fader:bright", "fader:speed", "fader:hue", "fader:white", "keys:attack", "keys:release", "keys:hue",
         "hold:flash", "hold:strobe", "hold:black", "release", "off"]
    c += ["pad:" + k for k in PROP_FX] + ["cube:" + k for k in FX_NAMES] + ["pal:" + k for k in PALETTES]
    c += ["scene:%d" % n for n in range(8)] + ["pals:all", "game:p1", "game:p2", "game:ship", "game:fire", "game:left", "game:right"] + ["target:" + k for k, _, _, _ in mix_targets()] + ["key:" + k for k, _, _ in keys_list()]
    return set(c)


def midi_desc(st, d1, d2):
    t, ch = st & 0xF0, (st & 0x0F) + 1
    names = {0x80: "Note off %d", 0x90: "Note %d", 0xA0: "Aftertouch note %d", 0xB0: "CC %d", 0xD0: "Pressure", 0xE0: "Pitch bend"}
    s = names.get(t, "Message %02X" % t)
    s = s % d1 if "%d" in s else s
    return "%s = %d (channel %d)" % (s, d1 if t == 0xD0 else d2, ch)


def midi_press(cid, down, v=1.0):
    """a learned control pressed (down) or let go"""
    kind, _, arg = cid.partition(":")
    if kind == "fader":
        mix_action({"a": "fader", "name": arg, "v": v})
    elif kind == "game":   # Pong paddles and the Space Invaders ship, from knobs, faders and pads
        inv = game.all["invaders"]
        if arg in ("p1", "p2"):
            game.all["pong"].set_pad(0 if arg == "p1" else 1, 1 - v)
        elif arg == "ship":
            inv.crew_move(x=v)
        elif arg == "fire":
            if down and v > 0:
                inv.crew_fire()
        elif arg in ("left", "right"):
            inv.crew_move(d=(-1 if arg == "left" else 1) if down else 0)
    elif kind == "pals":   # a knob going through the palettes
        mix_action({"a": "pal", "pal": list(PALETTES)[min(len(PALETTES) - 1, int(v * len(PALETTES)))]})
    elif kind == "keys":
        keys_action({"a": "glob", arg: v * (2.0 if arg == "attack" else 4.0 if arg == "release" else 1.0)})
    elif kind == "hold":
        with lock:
            MIX["hold"][arg] = time.time() + (3600 if down else 0)
            MIX["touched"] = time.time()
    elif kind == "key":
        if down:
            keys_action({"a": "on", "k": arg, "v": v, "midi": True})
        else:
            keys_action({"a": "off", "k": arg})
    elif not down:
        return
    elif kind == "pad":
        mix_action({"a": "pad", "fx": arg})
    elif kind == "cube":
        mix_action({"a": "pad", "fx": "c:" + arg})
    elif kind == "pal":
        mix_action({"a": "pal", "pal": arg})
    elif kind == "scene":
        mix_action({"a": "load", "n": int(arg)})
    elif kind == "target":
        with lock:
            sel = list(MIX["sel"])
        mix_action({"a": "sel", "keys": [k for k in sel if k != arg] if arg in sel else sel + [arg]})
    elif kind in ("release", "off"):
        mix_action({"a": kind})


def midi_in(st, d1=0, d2=0):
    """one MIDI message, from the bridge's own reader or from the Mixer page"""
    t, ch = st & 0xF0, st & 0x0F
    if t not in (0x80, 0x90, 0xA0, 0xB0, 0xD0):
        return
    if t == 0x90 and d2 == 0:
        t = 0x80
    MIDI["last"], MIDI["at"] = midi_desc(st, d1, d2), time.time()
    maps = S.get("midi_map") or {}
    with lock:
        learn = MIDI["learn"]
    if MIDI.get("learnBase") and t == 0x90:
        MIDI["learnBase"] = False
        S["midi_base"] = d1
        save()
        log("MIDI: note %d now plays the first key" % d1)
        return
    if learn and t in (0x90, 0xB0):
        key = ("n" if t == 0x90 else "c") + "%d:%d" % (ch, d1)
        with lock:
            maps = {k: v for k, v in maps.items() if v != learn}
            maps[key] = learn
            S["midi_map"] = maps
            MIDI["learn"] = ""
            save()
        log("MIDI: %s is now %s" % (MIDI["last"].split(" =")[0], learn))
        return
    if t in (0x90, 0x80):
        cid = maps.get("n%d:%d" % (ch, d1))
        if cid:
            return midi_press(cid, t == 0x90, d2 / 127)
        lst = keys_list()
        n = d1 - int(S.get("midi_base", 36))
        if 0 <= n < len(lst):
            if t == 0x90:
                keys_action({"a": "on", "k": lst[n][0], "v": d2 / 127, "midi": True})
            else:
                keys_action({"a": "off", "k": lst[n][0]})
    elif t == 0xA0:            # polyphonic aftertouch: that key brighter, up to full
        lst = keys_list()
        n = d1 - int(S.get("midi_base", 36))
        if 0 <= n < len(lst):
            midi_after(lst[n][0], d2 / 127)
    elif t == 0xD0:            # channel pressure: every held key
        with lock:
            held = list(KEYS["down"])
        for k in held:
            midi_after(k, d1 / 127)
    elif t == 0xB0:
        if d1 in (120, 123):   # all sound off / all notes off
            return keys_action({"a": "allOff"})
        cid = maps.get("c%d:%d" % (ch, d1)) or (MIDI_CC_DEFAULT.get(d1) if not any(v == MIDI_CC_DEFAULT.get(d1) for v in maps.values()) else None)
        if cid:
            kind = cid.split(":")[0]
            if kind in ("fader", "keys", "pals") or cid in ("game:p1", "game:p2", "game:ship"):
                midi_press(cid, True, d2 / 127)
            else:              # a button sending CC: pressed above the middle
                midi_press(cid, d2 >= 64, 1.0)


def midi_after(k, p):
    with lock:
        d = KEYS["down"].get(k)
        if d:
            d["after"] = d["vel"] + p * (1 - d["vel"])


class MidiParser:
    """bytes from a MIDI device -> messages (running status, real-time bytes skipped)"""
    def __init__(self):
        self.st, self.buf = 0, []

    def feed(self, data):
        for b in data:
            if b >= 0xF8:
                continue
            if b >= 0x80:
                self.st, self.buf = (b if b < 0xF0 else 0), []
                continue
            if not self.st:
                continue
            self.buf.append(b)
            need = 1 if self.st & 0xF0 in (0xC0, 0xD0) else 2
            if len(self.buf) == need:
                midi_in(self.st, self.buf[0], self.buf[1] if need == 2 else 0)
                self.buf = []


def midi_linux():
    """Linux / Raspberry Pi: reads every /dev/snd/midiC*D* (a device plugged in later is found within 5 s)"""
    import glob
    open_ = {}

    def reader(path, f):
        p = MidiParser()
        try:
            while True:
                data = os.read(f, 64)
                if not data:
                    break
                p.feed(data)
        except Exception:
            pass
        finally:
            open_.pop(path, None)
            log("MIDI: device gone (%s)" % path)
    while True:
        for path in sorted(glob.glob("/dev/snd/midiC*D*")):
            if path not in open_:
                try:
                    f = os.open(path, os.O_RDONLY)
                except Exception as e:
                    if path not in MIDI.get("denied", ()):
                        MIDI.setdefault("denied", set()).add(path)
                        log("MIDI: cannot read %s (%s) - add the user to the audio group" % (path, e))
                    continue
                name = path
                try:
                    c, d = re.findall(r"\d+", os.path.basename(path))[:2]
                    with open("/proc/asound/card%s/id" % c) as fid:
                        name = fid.read().strip() + " (" + os.path.basename(path) + ")"
                except Exception:
                    pass
                open_[path] = name
                log("MIDI: reading", name)
                threading.Thread(target=reader, args=(path, f), daemon=True).start()
        MIDI["devices"] = sorted(open_.values())
        time.sleep(5)


def midi_windows():
    """Windows: opens every MIDI input with winmm (a device plugged in later is found within 10 s)"""
    import ctypes
    from ctypes import wintypes
    mm = ctypes.WinDLL("winmm")
    PROC = ctypes.WINFUNCTYPE(None, wintypes.HANDLE, wintypes.UINT, ctypes.c_size_t, ctypes.c_size_t, ctypes.c_size_t)

    class CAPS(ctypes.Structure):
        _fields_ = [("wMid", wintypes.WORD), ("wPid", wintypes.WORD), ("vDriverVersion", wintypes.UINT),
                    ("szPname", wintypes.WCHAR * 32), ("dwSupport", wintypes.DWORD)]

    def cb(h, msg, inst, p1, p2):
        if msg == 0x3C3:   # MIM_DATA
            try:
                midi_in(p1 & 0xFF, (p1 >> 8) & 0x7F, (p1 >> 16) & 0x7F)
            except Exception:
                pass
    proc = PROC(cb)
    MIDI["_proc"] = proc   # kept alive while the bridge runs
    opened = {}
    while True:
        names = []
        for i in range(mm.midiInGetNumDevs()):
            caps = CAPS()
            if mm.midiInGetDevCapsW(i, ctypes.byref(caps), ctypes.sizeof(caps)) != 0:
                continue
            name = caps.szPname
            if name not in opened:
                h = wintypes.HANDLE()
                if mm.midiInOpen(ctypes.byref(h), i, proc, 0, 0x30000) == 0:   # CALLBACK_FUNCTION
                    mm.midiInStart(h)
                    opened[name] = h
                    log("MIDI: reading", name)
                elif name not in MIDI.get("busy", ()):
                    MIDI.setdefault("busy", set()).add(name)
                    log("MIDI: %s is in use by another program (close it, or use the Mixer page in a browser)" % name)
            if name in opened:
                names.append(name)
        MIDI["devices"] = names
        time.sleep(10)


def midi_native():
    if not S.get("midi_native", True):
        return
    try:
        if os.name == "nt":
            midi_windows()
        elif os.path.isdir("/dev/snd"):
            midi_linux()
    except Exception as e:
        log("MIDI: the bridge cannot read MIDI devices here (%s) - use the Mixer page in Chrome or Edge" % e)


def midi_state():
    maps = S.get("midi_map") or {}
    def nice(k):
        return ("Note %s" if k[0] == "n" else "CC %s") % k.split(":")[1] + " (channel %d)" % (int(k[1:].split(":")[0]) + 1)
    return {"devices": MIDI["devices"], "last": MIDI["last"] if time.time() - MIDI["at"] < 30 else "", "learn": MIDI["learn"],
            "base": int(S.get("midi_base", 36)), "native": bool(S.get("midi_native", True)), "os": "mac" if sys.platform == "darwin" else os.name,
            "presets": [[k, v[0]] for k, v in MIDI_PRESETS.items()],
            "map": [{"k": k, "what": nice(k), "to": v} for k, v in sorted(maps.items(), key=lambda x: x[1])]}


def midi_action(b):
    a = b.get("a")
    if a == "msg":             # messages passed on by the Mixer page (Web MIDI)
        d = b.get("d")
        if isinstance(d, list) and 1 <= len(d) <= 3 and all(isint(x) and 0 <= x <= 255 for x in d):
            midi_in(*(d + [0, 0])[:3])
            return True
        return False
    with lock:
        if a == "learn":
            cid = str(b.get("id", ""))
            MIDI["learn"] = cid if cid in midi_controls() else ""
        elif a == "forget":
            maps = dict(S.get("midi_map") or {})
            maps.pop(str(b.get("k", "")), None)
            S["midi_map"] = maps
            save()
        elif a == "base":
            if isint(b.get("v")) and 0 <= b["v"] <= 127:
                S["midi_base"] = b["v"]
                save()
        elif a == "learnBase":
            MIDI["learn"] = ""
            MIDI["learnBase"] = True
        elif a == "preset":
            if b.get("name") in MIDI_PRESETS:
                S["midi_map"] = dict(S.get("midi_map") or {}, **MIDI_PRESETS[b["name"]][1])
                if b["name"] == "vi25":
                    S["midi_base"] = 48   # the VI25's lowest key with the octave buttons at the middle (C3)
                save()
                log("MIDI: preset %s loaded" % MIDI_PRESETS[b["name"]][0])
        elif a == "clear":
            S["midi_map"] = {}
            save()
        elif a == "native":
            S["midi_native"] = bool(b.get("v"))
            save()
        else:
            return False
    return True


# ---------------------------------------------------------------------------------- play the lights ----
# "Play the lights": visitors take turns (30 s by default) to play the models of chosen props from their phone, like
# the Keys of the Mixer page but safe for the public: taps only (each tap lights a model for a moment), a colour of
# their choice, no strobe or blackout, one visitor at a time with a queue. The phone gathers its taps for half a
# second into one message, so a turn stays well inside the relay's free limits. The turn and the queue are posted on
# "<code>-play" for the phones.
PLAY_COLS = ("ff2a2a", "ff8a1a", "ffd23f", "39d353", "2ad4ff", "2a7bff", "a35cff", "ff5cc8", "ffffff")
PLAY_MAX_KEYS = 32
PLAY_IDLE = 10        # seconds without a tap before the turn passes on
PLAY = {"queue": [], "holder": None, "until": 0.0, "last_tap": 0.0, "v": 0, "taps": 0}
PULSE = 0.45          # how long a tap keeps a model lit (then it fades with the Keys' release)


def play_keys():
    """the models visitors can play: the models of the props picked on the control page"""
    if not ezp_state["ok"]:
        return []
    pick = S.get("play_props")
    out, seen = [], set()
    for i, p in enumerate(S.get("props", [])):
        if isinstance(pick, list) and i not in pick:
            continue
        for m in p["models"]:
            if m not in seen:
                seen.add(m)
                out.append(("m:" + m, m, p["n"]))
    return out[:PLAY_MAX_KEYS]


def play_on():
    return bool(S.get("play") and S["on"] and play_keys())


def play_state():
    with lock:
        h = PLAY["holder"]
        return {"on": play_on(), "holder": h["t"] if h else "", "queue": [q["t"] for q in PLAY["queue"]],
                "left": max(0, int(PLAY["until"] - time.time())) if h else 0, "secs": int(S.get("play_secs", 30)),
                "keys": [{"n": n, "g": g} for _, n, g in play_keys()], "cols": list(PLAY_COLS), "v": PLAY["v"], "at": int(time.time())}


def play_next():
    """the next visitor in the queue gets the turn (called with the lock held)"""
    PLAY["holder"] = PLAY["queue"].pop(0) if PLAY["queue"] else None
    now = time.time()
    PLAY["until"] = now + int(S.get("play_secs", 30)) if PLAY["holder"] else 0.0
    PLAY["last_tap"] = now
    PLAY["v"] += 1


def play_msg(m):
    a, pid, tag = m.get("a"), str(m.get("p", "")), str(m.get("tag", ""))
    if not PID_RE.fullmatch(pid) or not TAG_RE.fullmatch(tag):
        return "bad player"
    if not play_on():
        return "off"
    with lock:
        h = PLAY["holder"]
        mine = bool(h and h["p"] == pid)
        if a == "join":
            if mine or any(q["p"] == pid for q in PLAY["queue"]):
                return ""
            if len(PLAY["queue"]) >= 20:
                return "queue full"
            PLAY["queue"].append({"p": pid, "t": tag})
            if not h:
                play_next()
            PLAY["v"] += 1
            return ""
        if a == "leave":
            if mine:
                play_next()
            else:
                PLAY["queue"] = [q for q in PLAY["queue"] if q["p"] != pid]
                PLAY["v"] += 1
            return ""
        if a == "tap":
            if not mine:
                return "not your turn"
            ks, c = m.get("m"), m.get("c")
            if not isinstance(ks, list) or not 1 <= len(ks) <= 8 or not all(isint(k) for k in ks):
                return "bad tap"
            col = PLAY_COLS[c] if isint(c) and 0 <= c < len(PLAY_COLS) else random.choice(PLAY_COLS)
            lst = play_keys()
            now = time.time()
            PLAY["last_tap"] = now
            PLAY["taps"] += len(ks)
            for i in ks:
                if 0 <= i < len(lst):
                    k = lst[i][0]
                    KEYS["col"][k] = col
                    KEYS["down"][k] = {"vel": 1.0, "after": None, "seen": float("inf"), "off_at": now + PULSE}
            return ""
    return "?"


def play_loop():
    """passes the turn on when it ends, and posts the turn and the queue for the phones"""
    posted = -1
    while True:
        now = time.time()
        if play_on() and not key_geoms and not keys_loading[0]:   # read the models' pixels before the first tap
            threading.Thread(target=keys_prepare, daemon=True).start()
        with lock:
            h = PLAY["holder"]
            if h and (now > PLAY["until"] or now - PLAY["last_tap"] > PLAY_IDLE or not play_on()):
                play_next()
            if not play_on() and (PLAY["queue"] or PLAY["holder"]):
                PLAY["queue"], PLAY["holder"] = [], None
                PLAY["v"] += 1
            v = PLAY["v"]
        if S["topic"] and v != posted and (play_on() or posted not in (-1, -2)):   # nothing posted while Play is off and unused
            st = play_state()
            poster.post("play", st, same={k: x for k, x in st.items() if k not in ("at", "left", "v")})
            posted = v if st["on"] else -2
        time.sleep(0.25)


# ------------------------------------------------------------------------------------------ sing ----
# Sing (v17): a visitor records up to 10 seconds on their phone (a 🎤 Sing tab), picks who sings it, and sends it.
# The recording plays on the speaker of this computer while the chosen one "sings" it:
#   - a singing model of the show (a model with a face in xLights: pumpkins, trees, skulls…) moves its mouth with the
#     voice: quiet = rest, soft = E, louder = AI, loud and round = O / U (from the loudness and the kind of sound);
#   - any other prop pulses and glows with the voice;
#   - a side of the cube shows a drawn face whose mouth opens with the voice (no EZPlayer needed).
# The phone sends the recording as a small WAV file attached to the message (no extra programs needed to play it):
# Windows plays it itself, macOS with afplay, Linux and the Raspberry Pi with aplay (or paplay / pw-play). The bridge
# deletes the file as soon as it has been played. One recording at a time, with a short queue.
SING_MAX_BYTES = 400000      # a WAV of about 10 s at 11 kHz is 220 KB
SING_MAX_SECS = 12
SING_FPS = 20                # mouth positions per second
SING_QUEUE = 6
SING_GAP = 20                # seconds between two recordings from the same phone
SING_BASE = 960              # renderer number of the singing models
MOUTHS = ("rest", "E", "AI", "O", "U", "etc", "MBP", "FV", "L", "WQ")
SING = {"faces": {}, "faces_ver": None, "loading": False, "queue": [], "pending": [], "cur": None, "v": 0,
        "last_from": {}, "devices": None}
SING_EMOJI = (("pumpkin", "🎃"), ("tree", "🌲"), ("snow", "⛄"), ("skull", "💀"), ("ghost", "👻"), ("bulb", "💡"),
              ("gargoyle", "🦇"), ("firework", "🎆"), ("nut", "💂"), ("monster", "🧟"), ("kid", "🧒"), ("globe", "🔮"),
              ("peacock", "🦚"), ("boogie", "👹"), ("chill", "😎"), ("santa", "🎅"), ("reindeer", "🦌"), ("star", "⭐"))


def node_list(spec):
    """'1-5,9,12-13' (xLights node numbers, from 1) -> [0, 1, 2, 3, 4, 8, 11, 12]"""
    out = []
    for part in str(spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            if "-" in part:
                a, b = part.split("-", 1)
                a, b = int(a), int(b)
                if 0 < a <= b <= 100000:
                    out += range(a - 1, b)
            elif int(part) > 0:
                out.append(int(part) - 1)
        except ValueError:
            pass
    return out


def face_pick(faces):
    """the face to use when a model has several: the one that defines the most (colours count a little extra)"""
    def score(f):
        filled = sum(1 for k, v in f.attrib.items() if v and not k.endswith("-Color") and k not in ("Name", "Type", "Description", "CustomColors"))
        cols = sum(1 for k, v in f.attrib.items() if k.endswith("-Color") and v)
        return filled + (min(cols, 5) if f.get("CustomColors") == "1" else 0)
    return max(faces, key=score)


def faces_from_show():
    """the singing models of the show: models with a node-range face in EZPlayer's copy of xlights_rgbeffects.xml"""
    import xml.etree.ElementTree as ET
    url = S["ezp"].rstrip("/") + "/api/file/uploads/xlights_rgbeffects.xml"
    targets = {t["model"]: t for t in ezp_state["targets"]}
    out = {}
    with urllib.request.urlopen(url, timeout=120) as r:
        for ev, el in ET.iterparse(r, events=("end",)):
            if el.tag == "model":
                name = el.get("name")
                fs = [f for f in el.findall("faceInfo") if f.get("Type") == "NodeRange" and (f.get("Mouth-O") or f.get("Mouth-AI"))]
                if fs and name in targets:
                    f = face_pick(fs)
                    colours = f.get("CustomColors") == "1"
                    parts = {}
                    for k, v in f.attrib.items():
                        base = re.sub(r"\d+$", "", k)
                        if k.endswith("-Color") or not v or base not in ["Mouth-" + m for m in MOUTHS] + ["Eyes-Open", "Eyes-Closed", "FaceOutline"]:
                            continue
                        col = f.get(k + "-Color") if colours else ""
                        parts.setdefault(base, []).append((node_list(v), col if re.fullmatch(r"#[0-9a-fA-F]{6}", col or "") else ""))
                    out[name] = {"face": f.get("Name"), "parts": parts, "n": targets[name].get("nodes", 0)}
            if el.tag in ("model", "modelGroup", "effect", "Element"):
                el.clear()
    return out


def sing_faces_load():
    if SING["loading"] or not ezp_state["ok"]:
        return
    SING["loading"] = True
    try:
        f = faces_from_show()
        SING["faces"], SING["faces_ver"] = f, ezp_state.get("layoutVersion")
        log("sing: %d singing model(s) in the show" % len(f))
        SING["v"] += 1
    except Exception as e:
        log("sing: could not read the singing models:", e)
    finally:
        SING["loading"] = False


def nice_name(model):
    n = re.sub(r"[_]+", " ", model)
    n = re.sub(r"\b(Boscoyo|GE|PPD|EFL|HiRes|P2P|Hi Res)\b", "", n, flags=re.I)
    n = re.sub(r"\s+", " ", n).strip() or model
    return n[:28]


def sing_emoji(name):
    low = name.lower()
    return next((e for k, e in SING_EMOJI if k in low), "🎤")


def sing_list():
    """who can sing: [(key, name, emoji, kind)]; kind = face (a singing model), prop (pulses), side (drawn face)"""
    names, off = S.get("sing_names") or {}, set(S.get("sing_off") or [])
    out = []
    if ezp_state["ok"]:
        for m in sorted(SING["faces"]):
            out.append(("f:" + m, nice_name(m), sing_emoji(m), "face"))
        if S.get("sing_props", True):
            for i, p in enumerate(S.get("props", [])):
                out.append(("p:%d" % i, p["n"], p.get("e") or "✨", "prop"))
    if S.get("sing_cube", True):
        for i in range(len(S["faces"])):
            out.append(("s:%d" % i, "Cube: " + face_name(i), "🧊", "side"))
    res = []
    for k, n, e, kind in out:
        custom = names.get(k) or {}
        res.append((k, (custom.get("n") or n)[:28], (custom.get("e") or e)[:4], kind, k not in off))
    return res


def sing_on():
    return bool(S.get("sing") and S["on"] and any(x[4] for x in sing_list()))


def wav_read(data):
    """a WAV from a phone -> (rate, [samples -1..1]); mono 16-bit PCM only"""
    import io
    import wave
    import array
    with wave.open(io.BytesIO(data)) as w:
        ch, sw, rate, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        if ch != 1 or sw != 2 or not 6000 <= rate <= 48000 or n > rate * SING_MAX_SECS:
            raise ValueError("not a short mono 16-bit WAV")
        a = array.array("h", w.readframes(n))
    if sys.byteorder == "big":
        a.byteswap()
    return rate, a


def mouth_track(rate, a):
    """loudness and kind of sound, SING_FPS times a second -> mouth shapes and glow levels"""
    step = max(1, rate // SING_FPS)
    rms, zcr = [], []
    for i in range(0, len(a) - step + 1, step):
        seg = a[i:i + step]
        rms.append(math.sqrt(sum(x * x for x in seg) / len(seg)) / 32768)
        zcr.append(sum(1 for j in range(1, len(seg)) if (seg[j] >= 0) != (seg[j - 1] >= 0)) / len(seg))
    if not rms:
        return [], []
    top = sorted(rms)[int(len(rms) * 0.95)] or 1e-9          # loud parts of this recording = full
    gate = max(0.008, top * 0.12)                              # below this: silence
    shapes, levels = [], []
    for r, z in zip(rms, zcr):
        lv = 0.0 if r < gate else min(1.0, (r - gate) / max(1e-9, top - gate))
        levels.append(lv)
        if lv < 0.08:
            shapes.append("rest")
        elif z > 0.18:                                         # hissy sounds (s, sh, f, t): teeth
            shapes.append("E" if lv < 0.5 else "etc")
        elif lv < 0.35:
            shapes.append("E" if z > 0.08 else "MBP")
        elif lv < 0.7:
            shapes.append("AI")
        else:
            shapes.append("O" if z < 0.05 else "AI")
    smooth = []                                                # no shape for a single frame: less flicker
    for i, s in enumerate(shapes):
        if 0 < i < len(shapes) - 1 and shapes[i - 1] == shapes[i + 1] != s:
            s = shapes[i - 1]
        smooth.append(s)
    return smooth, levels


def wav_write(path, rate, a, volume):
    import wave
    import array
    if volume < 0.999:
        a = array.array("h", (int(x * volume) for x in a))
    if sys.byteorder == "big":
        a = array.array("h", a)
        a.byteswap()
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(a.tobytes())


def audio_devices():
    """Linux: the ALSA outputs aplay knows (name, description); elsewhere only the default output"""
    if os.name == "nt" or sys.platform == "darwin":
        return []
    if SING["devices"] is None:
        import subprocess
        devs = []
        try:
            out = subprocess.run(["aplay", "-L"], capture_output=True, text=True, timeout=5).stdout.splitlines()
            for i, ln in enumerate(out):
                if ln and not ln.startswith(" ") and ln not in ("null",) and not ln.startswith(("dsnoop", "surround", "iec958", "front:", "dmix:")):
                    desc = out[i + 1].strip() if i + 1 < len(out) and out[i + 1].startswith(" ") else ""
                    devs.append([ln, desc[:60]])
        except Exception:
            pass
        SING["devices"] = devs[:24]
    return SING["devices"]


def play_audio(path):
    """plays a WAV file on this computer's speaker and returns when it ends"""
    import subprocess
    if os.name == "nt":
        import winsound
        winsound.PlaySound(path, winsound.SND_FILENAME)
        return
    if sys.platform == "darwin":
        subprocess.run(["afplay", path], timeout=SING_MAX_SECS + 10)
        return
    dev = S.get("sing_device") or ""
    for cmd in (["aplay", "-q"] + (["-D", dev] if dev else []) + [path], ["paplay", path], ["pw-play", path]):
        try:
            r = subprocess.run(cmd, timeout=SING_MAX_SECS + 10, capture_output=True)
            if r.returncode == 0:
                return
            err = (r.stderr or b"").decode(errors="ignore").strip().splitlines()
            log("sing: %s could not play: %s" % (cmd[0], err[-1] if err else r.returncode))
            if "busy" in " ".join(err).lower():
                log("sing: the sound output is in use by another program (see 'Sing' in the guide to share it)")
        except FileNotFoundError:
            continue
        except Exception as e:
            log("sing: %s failed: %s" % (cmd[0], e))
    log("sing: no program could play the sound here (install alsa-utils for aplay)")


def sing_msg(m, att):
    """a recording from a phone: checks it and puts it in the queue"""
    pid, tag, k = str(m.get("p", "")), str(m.get("tag", "")), str(m.get("s", ""))
    if not PID_RE.fullmatch(pid) or not TAG_RE.fullmatch(tag):
        return "bad player"
    if not sing_on():
        return "singing is off"
    who = {x[0]: x for x in sing_list() if x[4]}
    if k not in who:
        return "unknown singer"
    if not isinstance(att, dict):
        return "no recording"
    url, size = str(att.get("url", "")), att.get("size", 0)
    if not url.startswith(GIFX_URL) or not isint(size) or not 0 < size <= SING_MAX_BYTES:
        return "bad recording"
    now = time.time()
    with lock:
        if now - SING["last_from"].get(pid, 0) < SING_GAP:
            return "too soon"
        if len(SING["queue"]) + len(SING["pending"]) >= SING_QUEUE:
            return "queue full"
        SING["last_from"][pid] = now
        item = {"id": secrets.token_hex(4), "p": pid, "tag": tag, "k": k, "who": who[k][2] + " " + who[k][1], "url": url, "at": now}
        (SING["pending"] if S.get("sing_approve") else SING["queue"]).append(item)
        SING["v"] += 1
    log("sing: a recording for %s %s" % (who[k][1], "(waiting for approval)" if S.get("sing_approve") else "queued"))
    return ""


class SingFace:
    """a singing model: face outline and eyes on, the mouth shape of the moment (other nodes off)"""
    def __init__(self, model, face, n):
        self.geoms = [PropGeom(model, "nodes", n, [0.5] * n, [0.5] * n)]
        self.face, self.n = face, n

    def frames(self, t):
        cur = SING["cur"]
        buf = bytearray(self.n * 3)
        if not cur:
            return [bytes(buf)]
        i = int((time.time() - cur["t0"]) * SING_FPS)
        shape = cur["shapes"][i] if 0 <= i < len(cur["shapes"]) else "rest"
        parts = self.face["parts"]
        blink = int(time.time() * 10) % 37 == 0                      # a blink now and then
        mouth = parts.get("Mouth-" + shape) or parts.get("Mouth-AI" if shape != "rest" else "Mouth-rest") or []
        for key, default in (("FaceOutline", (255, 170, 60)), ("Eyes-Closed" if blink else "Eyes-Open", (255, 255, 255))):
            for nodes, col in parts.get(key, []):
                c = hexrgb(col[1:]) if col else default
                for j in nodes:
                    if j < self.n:
                        buf[j * 3:j * 3 + 3] = bytes(c)
        for nodes, col in mouth:
            c = hexrgb(col[1:]) if col else (255, 60, 60)
            for j in nodes:
                if j < self.n:
                    buf[j * 3:j * 3 + 3] = bytes(c)
        return [bytes(buf)]


class SingPulse:
    """any prop singing: it glows with the voice, its colour turning slowly"""
    def __init__(self, geoms):
        self.geoms = geoms

    def frames(self, t):
        cur = SING["cur"]
        lv = 0.0
        if cur:
            i = int((time.time() - cur["t0"]) * SING_FPS)
            lv = cur["levels"][i] if 0 <= i < len(cur["levels"]) else 0.0
        c = hsv((t * 0.08) % 1, 0.9, 0.12 + 0.88 * lv)
        return [bytes(c) * g.n for g in self.geoms]


class SingSide(Anim):
    """a side of the cube singing: two eyes and a mouth that opens with the voice"""
    def frame(self, t):
        w, h = self.w, self.h
        cur = SING["cur"]
        self.buf[:] = bytes(len(self.buf))
        lv, shape = 0.0, "rest"
        if cur:
            i = int((time.time() - cur["t0"]) * SING_FPS)
            if 0 <= i < len(cur["levels"]):
                lv, shape = cur["levels"][i], cur["shapes"][i]
        face = (255, 200, 40)
        cx, cy, r = (w - 1) / 2, (h - 1) / 2, min(w, h) / 2 - 0.5
        for y in range(h):                          # the face's outline
            for x in range(w):
                if abs(math.hypot(x - cx, y - cy) - r) < 0.6:
                    self.px(x, y, face)
        ey = int(cy - r * 0.35)
        blink = int(time.time() * 10) % 37 == 0
        for ex in (int(cx - r * 0.4), int(round(cx + r * 0.4))):
            self.px(ex, ey, (255, 255, 255))
            if not blink:
                self.px(ex, ey - 1, (255, 255, 255))
        mw = max(1, int(r * (0.9 if shape in ("E", "etc") else 0.6)))   # wide for E, round for O
        mh = 0 if shape in ("rest", "MBP") else max(1, int(lv * r * 0.8))
        my = int(cy + r * 0.35)
        for x in range(int(cx - mw / 2), int(cx + mw / 2) + 1):
            self.px(x, my, (255, 60, 60))
            if mh:
                self.px(x, my + mh, (255, 60, 60))
        for y in range(my, my + mh + 1):
            self.px(int(cx - mw / 2), y, (255, 60, 60))
            self.px(int(cx + mw / 2), y, (255, 60, 60))
        return self.buf


sing_objs = {}


def sing_items(items):
    """render_loop: the one singing now goes on top"""
    cur = SING["cur"]
    if not cur:
        return items
    k = cur["k"]
    try:
        if k.startswith("s:"):
            i = int(k[2:])
            if i < len(S["faces"]):
                f = S["faces"][i]
                o = sing_objs.get(k)
                if o is None or (o.w, o.h) != (f["w"], f["h"]):
                    o = sing_objs[k] = SingSide(f["w"], f["h"])
                return [(n, a) for n, a in items if n != i] + [(i, {"anim": o, "t0": 0.0})]
        elif k.startswith("f:"):
            m = k[2:]
            face = SING["faces"].get(m)
            if face:
                o = sing_objs.get(k)
                if o is None:
                    o = sing_objs[k] = SingFace(m, face, face["n"])
                return list(items) + [(SING_BASE, {"anim": o, "t0": 0.0})]
        elif k.startswith("p:"):
            g = prop_geometry(int(k[2:]))
            if g:
                return list(items) + [(SING_BASE + 1, {"anim": SingPulse(g), "t0": 0.0})]
    except Exception as e:
        log("sing: drawing error:", e)
    return items


def sing_play(item):
    """downloads, works out the mouth, plays the sound and makes the singer sing; deletes the file after"""
    import tempfile
    try:
        data = fetch(item["url"], limit=SING_MAX_BYTES + 1, timeout=20)
        if len(data) > SING_MAX_BYTES:
            raise ValueError("too big")
        rate, a = wav_read(data)
    except Exception as e:
        log("sing: the recording could not be read:", e)
        return
    shapes, levels = mouth_track(rate, a)
    fd, path = tempfile.mkstemp(suffix=".wav", prefix="showplay-sing-")
    os.close(fd)
    try:
        wav_write(path, rate, a, max(0.1, min(1.0, S.get("sing_volume", 100) / 100)))
        if item["k"].startswith("f:"):
            sing_objs.pop(item["k"], None)
        with lock:
            SING["cur"] = dict(item, shapes=shapes, levels=levels, t0=time.time() + max(0.0, S.get("sing_delay", 0.15)), secs=len(a) / rate)
            SING["v"] += 1
        log("sing: %s sings (%.1f s)" % (item["who"], len(a) / rate))
        play_audio(path)
        end = SING["cur"]["t0"] + len(a) / rate
        while time.time() < end:          # if the player returned early, the mouth still finishes
            time.sleep(0.05)
    finally:
        with lock:
            SING["cur"] = None
            SING["v"] += 1
        try:
            os.remove(path)
        except OSError:
            pass


def sing_loop():
    """plays the queue one recording at a time; reads the singing models; posts the queue for the phones"""
    posted, last_check = -1, 0.0
    while True:
        now = time.time()
        if now - last_check > 30:
            last_check = now
            if ezp_state["ok"] and S.get("sing") and SING["faces_ver"] != ezp_state.get("layoutVersion"):
                threading.Thread(target=sing_faces_load, daemon=True).start()
        item = None
        with lock:
            if SING["queue"] and not SING["cur"] and not SING.get("busy"):
                item = SING["queue"].pop(0)
                SING["busy"] = True
                SING["v"] += 1
        if S["topic"] and SING["v"] != posted and (sing_on() or posted not in (-1, -2)):   # nothing while Sing is off and unused
            st = sing_state()
            poster.post("sing", st, same={k: x for k, x in st.items() if k not in ("at", "v")})
            posted = st["v"] if st["on"] else -2
        if item:   # plays in its own thread, so the queue keeps being posted for the phones while it sings
            def run(it=item):
                try:
                    sing_play(it)
                finally:
                    SING["busy"] = False
            threading.Thread(target=run, daemon=True).start()
        time.sleep(0.3)


def sing_state():
    with lock:
        cur = SING["cur"]
        return {"on": sing_on(), "now": cur["tag"] if cur else "", "who": cur["who"] if cur else "",
                "q": [x["tag"] for x in SING["queue"]], "wait": [x["tag"] for x in SING["pending"]], "v": SING["v"], "at": int(time.time())}


def sing_test_wav(path):
    """a short three-note chime for the 'Test sound' button"""
    import array
    rate = 11025
    a = array.array("h")
    for f in (523, 659, 784):
        for i in range(int(rate * 0.25)):
            env = min(1.0, i / 200) * (1 - i / (rate * 0.25))
            a.append(int(12000 * env * math.sin(2 * math.pi * f * i / rate)))
    wav_write(path, rate, a, max(0.1, min(1.0, S.get("sing_volume", 100) / 100)))


# ------------------------------------------------------------------------------------ control page ----
ADMIN = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ShowPlay</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
:root{--bg:#120b1f;--card:#1d1430;--raise:#281c40;--line:#3a2d52;--fg:#fff;--muted:#c9bddc;--hot:#ff7a1a;--ok:#39d353}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,sans-serif}
main{max-width:660px;margin:0 auto;padding:20px 16px 40px;display:flex;flex-direction:column;gap:14px}
h1{margin:0;font-size:24px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px}
.ct{font-weight:700;font-size:17px}.note{font-size:14px;color:var(--muted)}label{font-size:14px;color:var(--muted)}
select,input[type=number],input[type=text]{width:100%;min-height:44px;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:var(--raise);color:var(--fg);font:inherit}
.btn{min-height:44px;padding:8px 16px;border-radius:10px;border:1px solid var(--line);background:var(--raise);color:var(--fg);font:inherit;font-weight:600;cursor:pointer}
.btn.primary{background:var(--hot);border-color:var(--hot);color:#120b1f}.btn.small{min-height:36px;padding:4px 12px;font-size:14px}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.three{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.big{display:flex;align-items:center;gap:12px;font-size:18px;font-weight:700}
.big input{width:26px;height:26px}.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:700}
.on{background:var(--ok);color:#06240f}.off{background:#5a4d6b}.url{word-break:break-all;font-size:14px;background:#000;padding:10px;border-radius:10px}
.qr{background:#fff;padding:10px;border-radius:12px;align-self:center}.qrs{display:flex;flex-wrap:wrap;gap:14px;justify-content:center}.qrb{display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center;max-width:240px}.item{display:flex;gap:10px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:8px}
.item .what{flex:1;min-width:0;word-break:break-word}canvas{image-rendering:pixelated;background:#000;border-radius:6px}
.side{border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column;gap:8px;background:#170f28}
.side h3{margin:0;font-size:16px}.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.chk{display:flex;align-items:center;gap:8px;font-size:15px;color:var(--fg)}.chk input{width:22px;height:22px}
pre{white-space:pre-wrap;font-size:12px;color:var(--muted);margin:0;max-height:220px;overflow:auto}.warn{color:#ffb36b}
[hidden]{display:none!important}
</style></head><body><main>
<div class="row" style="justify-content:space-between"><h1>ShowPlay</h1><span class="row"><a class="btn" href="/race" style="text-decoration:none;display:inline-flex;align-items:center">🌟 Race</a><a class="btn" href="/xmas" style="text-decoration:none;display:inline-flex;align-items:center">📅 Advent &amp; 🎄 Tree</a><a class="btn" href="/mixer" style="text-decoration:none;display:inline-flex;align-items:center">🎛️ Mixer &amp; 🎹 Keys</a></span></div>
<div class="card">
  <label class="big"><input type="checkbox" id="on"> Show the visitors' requests</label>
  <div class="note" id="state"></div>
</div>
<div class="card">
  <div class="ct">ntfy.sh today</div>
  <div class="note">The visitors' phones and the bridge talk through ntfy.sh. Its free service allows each internet address about 60 messages in a row, then about one every 5–10 s, and about 17,280 a day. Phones on the same Wi-Fi as this computer share that allowance; phones on mobile data have their own.</div>
  <div class="bar" style="height:12px;border-radius:8px;background:var(--raise);overflow:hidden"><div id="ntBar" style="height:100%;width:0;background:var(--ok)"></div></div>
  <div class="note" id="ntInfo"></div>
</div>
<div class="card">
  <div class="ct">Sides of the cube</div>
  <div class="note">Each side is one LED matrix panel. Tell the bridge which board it is on, where it starts in that board's LEDs, its size and how it is wired. Several sides can be on the same board, one after the other.</div>
  <div class="row"><button class="btn" id="scan" type="button">Find WLED boards</button><span class="note" id="scanMsg"></span></div>
  <div id="boards" style="display:flex;flex-direction:column;gap:8px"></div>
  <div id="sides" style="display:flex;flex-direction:column;gap:10px"></div>
  <div class="row"><button class="btn" id="addSide" type="button">➕ Add a side</button></div>
  <div class="note">After saving, use <b>Identify</b> on each side: it shows a white arrow pointing <b>up</b>, a red top row and a green left column. If they are not like that on the panel, change the side's start corner, direction or zig-zag.</div>
</div>
<div class="card" id="ezpCard">
  <div class="ct">EZPlayer (optional)</div>
  <div class="note">Only for sides set to "Through EZPlayer": the side is then a matrix model of your EZPlayer show and requests show on top of the sequence that is playing.</div>
  <label for="ezp">EZPlayer address (the same as its web UI; http://127.0.0.1:3000 by default)</label>
  <input type="text" id="ezp">
  <div class="row"><button class="btn" id="read" type="button">Read the models from EZPlayer</button><span class="note" id="ezpMsg"></span></div>
</div>
<div class="card">
  <div class="ct">Visitors' page</div>
  <label for="title">Show name (at the top of the visitors' page)</label>
  <input type="text" id="title" maxlength="40">
  <label for="page">Address where the visitors' page is published (for example https://your-name.github.io/showplay/)</label>
  <input type="text" id="page">
  <label for="theme">Theme for visitors who open the page without a theme in the address</label>
  <select id="theme"><option value="hw">Halloween</option><option value="xm">Christmas</option><option value="ev">Other celebrations</option><option value="">All</option></select>
</div>
<div class="card">
  <div class="ct">How requests show</div>
  <div class="three">
    <div><label for="sText">Text (s)</label><input type="number" id="sText" min="3" max="300"></div>
    <div><label for="sGif">Picture (s)</label><input type="number" id="sGif" min="3" max="300"></div>
    <div><label for="sDraw">Drawing (s)</label><input type="number" id="sDraw" min="3" max="300"></div>
    <div><label for="sFx">Effect (s)</label><input type="number" id="sFx" min="3" max="300"></div>
  </div>
  <label for="wait">Wait between requests from the same phone (seconds, 0 = no wait)</label>
  <input type="number" id="wait" min="0" max="600">
  <label for="fps">Frames per second sent to the lights</label>
  <select id="fps"><option value="20">20 (smoothest)</option><option value="15">15</option><option value="10">10 (for a slower computer, such as a Raspberry Pi running EZPlayer too)</option></select>
  <label class="big" style="font-size:16px"><input type="checkbox" id="hold"> Keep the last request on the lights until another arrives</label>
  <div class="note">Gives time for photos.</div>
  <label class="big" style="font-size:16px"><input type="checkbox" id="endDark"> Turn the side off when its request ends</label>
  <div class="note">Off: the board goes back to what it was showing (WLED returns to its own effect a few seconds after the bridge stops sending). Turn this on for boards that would keep the last picture.</div>
  <label class="big" style="font-size:16px"><input type="checkbox" id="waitTurn"> Each request waits for the one before to end</label>
  <div class="note">Off: a new request replaces what is on that side straight away.</div>
  <label class="big" style="font-size:16px"><input type="checkbox" id="free"> Allow free text</label>
  <div class="note">Off (recommended for children): only the ready messages, the pictures and the drawings.</div>
  <label class="big" style="font-size:16px"><input type="checkbox" id="approve"> Approve each request before it shows</label>
</div>
<div class="card">
  <div class="ct">Games</div>
  <label class="big" style="font-size:16px"><input type="checkbox" id="games"> Let visitors play games on the cube</label>
  <div class="row" style="gap:16px"><label><input type="checkbox" id="gC4"> 🔴 Four in a Row</label><label><input type="checkbox" id="gTtt"> ❌ Tic-tac-toe</label><label><input type="checkbox" id="gSimon"> 🟢 Simon</label><label><input type="checkbox" id="gCount"> 🔢 Count the colours</label><label><input type="checkbox" id="gSnake"> 🐍 Snake</label><label><input type="checkbox" id="gInv"> 👾 Space Invaders</label><label><input type="checkbox" id="gPong"> 🏓 Pong</label><label><input type="checkbox" id="gRace"> 🌟 Race to the Star</label></div>
  <div class="row"><a class="btn" href="/race" style="text-decoration:none;display:inline-flex;align-items:center">🌟 Race to the Star settings</a><span class="note">track, star, ways to play, levels, difficulty, effects, test race</span></div>
  <div class="note">Four in a Row and Tic-tac-toe: two visitors play each other from their phones, or one plays the computer. Simon: the cube shows a sequence of colours and one visitor repeats it on their phone, a colour more each round. Count the colours: up to 8 phones at once count how many times a colour flashes. Snake: one visitor steers a slow snake with arrows. Space Invaders: one visitor slides the ship and it fires by itself. Pong: one visitor slides the paddle against the computer, with a slower ball. Race to the Star: up to 8 phones race up a track (tap, voice, shake or run) and the winner lights the star; set it up on its own page. (The crew can play faster Space Invaders and Pong from the Mixer page.) One game at a time; while it is on, that side shows the game and other requests for it wait.</div>
  <label for="cpuLevel">The computer plays (Four in a Row and Tic-tac-toe)</label>
  <select id="cpuLevel"><option value="easy">Easy (good for small children)</option><option value="normal">Normal</option><option value="hard">Hard</option></select>
</div>
<div class="card" id="singCard">
  <div class="ct">Sing (visitors)</div>
  <label class="big" style="font-size:16px"><input type="checkbox" id="sgOn"> Let visitors record a song and make the show sing it</label>
  <div class="note">A 🎤 Sing tab on the visitors' page: a visitor picks who sings (a singing model of the show moves its mouth, a prop glows with the voice, or a side of the cube shows a face), records up to 10 seconds and sends it. It plays on this computer's speaker. Recordings are deleted as soon as they have been played.</div>
  <label class="big" style="font-size:16px"><input type="checkbox" id="sgApprove"> Approve each recording before it plays</label>
  <div class="row"><label class="note">Volume <select id="sgVol"><option value="25">25 %</option><option value="50">50 %</option><option value="75">75 %</option><option value="100">100 %</option></select></label>
   <label class="note" id="sgDevBox" hidden>Sound output <select id="sgDev"></select></label>
   <button class="btn" type="button" id="sgTest">🔊 Test sound</button></div>
  <div class="row"><label class="note">Mouth timing <select id="sgDelay"><option value="0">0 s</option><option value="0.1">0.1 s</option><option value="0.15">0.15 s</option><option value="0.25">0.25 s</option><option value="0.4">0.4 s</option><option value="0.6">0.6 s</option></select></label><span class="note">later if the mouth moves before the voice</span></div>
  <div class="row"><label><input type="checkbox" id="sgProps"> Props can sing (they glow with the voice)</label><label><input type="checkbox" id="sgCube"> The cube can sing (a face on a side)</label></div>
  <div class="row"><button class="btn" type="button" id="sgFind">Find the singing models in EZPlayer</button><span class="note" id="sgMsg"></span></div>
  <div class="note">Who visitors can pick (untick to hide; you can rename them and change the emoji):</div>
  <div id="sgList" style="display:flex;flex-direction:column;gap:6px;max-height:360px;overflow:auto"></div>
  <div id="sgPend"></div>
  <div class="row"><button class="btn primary" type="button" id="sgSave">Save singing settings</button><span class="note" id="sgSaved"></span></div>
</div>
<div class="card">
  <div class="ct">Play the lights (visitors)</div>
  <label class="big" style="font-size:16px"><input type="checkbox" id="play"> Let visitors take turns to play the lights</label>
  <div class="note">A 🎹 Play tab on the visitors' page: one visitor at a time gets a turn and taps pads to light up the models of the props ticked below, in a colour they pick, like the keys of a keyboard. No strobe, no blackout; the others wait in a queue. Needs EZPlayer and props.</div>
  <label for="playSecs">Each turn lasts</label>
  <select id="playSecs"><option value="20">20 s</option><option value="30">30 s</option><option value="45">45 s</option><option value="60">1 min</option></select>
  <div class="note">Props visitors can play (each of their models becomes a pad, up to 32):</div>
  <div class="row" id="playProps" style="gap:14px"></div>
</div>
<div class="card">
  <div class="ct">Props of the show (through EZPlayer)</div>
  <div class="note">Models of your EZPlayer show that visitors can light up with an effect, a palette or their own colours, for example the wings, the bats or the spinners. Pick one or more models, or a whole group. When the effect ends, the models go back to the show.</div>
  <div class="row"><button class="btn" id="readProps" type="button">Read models and groups from EZPlayer</button><span class="note" id="propsMsg"></span></div>
  <div id="props" style="display:flex;flex-direction:column;gap:10px"></div>
  <div class="row"><button class="btn" id="addProp" type="button">➕ Add a prop</button></div>
  <div><label for="sProp">Prop effect (s)</label><input type="number" id="sProp" min="3" max="300"></div>
</div>
<div class="card" style="position:sticky;bottom:8px;z-index:3;box-shadow:0 -6px 18px rgba(0,0,0,.5)">
  <div class="row"><button class="btn primary" id="save" type="button">Save</button><span class="note" id="saveMsg"></span></div>
</div>
<div class="card" id="pendCard" hidden>
  <div class="ct">Waiting for approval</div><div id="pend" style="display:flex;flex-direction:column;gap:8px"></div>
</div>
<div class="card">
  <div class="ct">QR codes for the posters</div>
  <div class="note warn" id="noPage" hidden>Set the address of the visitors' page above (and Save) to get the QR codes.</div>
  <div class="note">One for each theme: each opens the page with that theme's colours, messages and pictures.</div>
  <div class="qrs">
   <div class="qrb"><b>Halloween</b><div class="qr" id="qr_hw"></div><div class="url" id="url_hw"></div><button class="btn" type="button" data-copy="hw">Copy address</button></div>
   <div class="qrb"><b>Christmas</b><div class="qr" id="qr_xm"></div><div class="url" id="url_xm"></div><button class="btn" type="button" data-copy="xm">Copy address</button></div>
   <div class="qrb"><b>Celebrations</b><div class="qr" id="qr_ev"></div><div class="url" id="url_ev"></div><button class="btn" type="button" data-copy="ev">Copy address</button></div>
  </div>
  <div class="row"><input type="text" id="testTxt" placeholder="Test text" style="flex:1;min-width:140px"><button class="btn" id="test" type="button">Test</button></div>
</div>
<div class="card"><div class="ct">Log</div><div class="note" id="now"></div><pre id="log"></pre></div>
</main><script>
const $=id=>document.getElementById(id);let st=null,editing=false,qrFor='',sides=null,targets=[];
const THEMES=['hw','xm','ev'];
const api=(p,b)=>fetch('/api/'+p,b===undefined?{}:{method:'POST',headers:{'X-Cube':'1'},body:JSON.stringify(b)}).then(r=>r.json());
const mk=(tag,props,...kids)=>{const e=document.createElement(tag);Object.assign(e,props||{});e.append(...kids);return e;};
const field=(lab,el)=>mk('label',{},lab,el);
const num=(v,min,max,on)=>{const e=mk('input',{type:'number',min,max,value:v});e.oninput=()=>{editing=true;on(Math.max(min,Math.min(max,+e.value|0)));};return e;};
const txt=(v,ph,on)=>{const e=mk('input',{type:'text',value:v||'',placeholder:ph||''});e.oninput=()=>{editing=true;on(e.value.trim());};return e;};
const sel=(v,opts,on)=>{const e=mk('select');opts.forEach(([val,t])=>e.append(mk('option',{value:val,textContent:t})));e.value=v;e.onchange=()=>{editing=true;on(e.value);};return e;};
function newSide(){const l=sides[sides.length-1];return l&&l.out==='ddp'?{n:'',out:'ddp',ip:l.ip,start:(l.start||1)+l.w*l.h,w:l.w,h:l.h,corner:l.corner,dir:l.dir,zig:l.zig}:{n:'',out:'ddp',ip:'',start:1,w:32,h:32,corner:'tl',dir:'rows',zig:true};}
function drawSides(){
 $('sides').replaceChildren(...sides.map((f,i)=>{
  const box=mk('div',{className:'side'});
  const head=mk('div',{className:'row'},mk('h3',{textContent:'Side '+(i+1)}));
  const idb=mk('button',{type:'button',className:'btn small',textContent:'Identify'});idb.onclick=async()=>{await saveAll();api('identify',{i}).then(refresh);};
  const rm=mk('button',{type:'button',className:'btn small',textContent:'Remove'});rm.onclick=()=>{editing=true;sides.splice(i,1);drawSides();};
  head.append(idb,rm);box.append(head);
  box.append(field('Name for the visitors (for example Front, Top)',txt(f.n,'Side '+(i+1),v=>f.n=v)));
  box.append(field('Sent',sel(f.out,[['ddp','Straight to a board (DDP)'],['ezp','Through EZPlayer (a model of the show)']],v=>{f.out=v;drawSides();})));
  if(f.out==='ezp'){
   const opts=[['','Choose a model']].concat(targets.filter(t=>t.w>1&&t.h>1).map(t=>[t.model,t.model+' ('+t.w+'×'+t.h+')']));
   if(f.model&&!opts.some(o=>o[0]===f.model))opts.push([f.model,f.model+' ('+f.w+'×'+f.h+') — not found']);
   box.append(field('EZPlayer model',sel(f.model||'',opts,v=>{f.model=v;const t=targets.find(x=>x.model===v);if(t){f.w=t.w;f.h=t.h;}})));
   if(!targets.length)box.append(mk('div',{className:'note',textContent:'Click "Read the models from EZPlayer" below to list the models.'}));
  }else{
   box.append(mk('div',{className:'grid2'},field('Board IP address',txt(f.ip,'192.168.1.50',v=>f.ip=v)),field('First LED of this side on the board',num(f.start||1,1,100000,v=>f.start=v))));
   box.append(mk('div',{className:'grid2'},field('Width (LEDs across)',num(f.w,1,128,v=>f.w=v)),field('Height (LEDs down)',num(f.h,1,128,v=>f.h=v))));
   box.append(mk('div',{className:'grid2'},field('First LED is at the',sel(f.corner||'tl',[['tl','Top left'],['tr','Top right'],['bl','Bottom left'],['br','Bottom right']],v=>f.corner=v)),
    field('LEDs run',sel(f.dir||'rows',[['rows','Across (rows)'],['cols','Up and down (columns)']],v=>f.dir=v))));
   const z=mk('input',{type:'checkbox',checked:f.zig!==false});z.onchange=()=>{editing=true;f.zig=z.checked;};
   box.append(mk('label',{className:'chk'},z,'Zig-zag (each row or column goes back the other way)'));
  }
  return box;}));
 if(!sides.length)$('sides').append(mk('div',{className:'note',textContent:'No sides yet: add one, or find a WLED board above.'}));
}
let props=null,pdata={models:[],groups:{}};
const EMO=['🦋','🦇','🦅','🧚','🐉','🌀','⭐','❄️','🎄','🎃','👻','🕷️','💀','🔔','🎁','🌳','🏠','🌈','✨','🎆'];
function drawProps(){
 $('props').replaceChildren(...props.map((p,i)=>{
  const box=mk('div',{className:'side'});
  const tryb=mk('button',{type:'button',className:'btn small',textContent:'Try it'});tryb.onclick=async()=>{await saveAll();api('try-prop',{i,e:'flap',pal:'rainbow'}).then(refresh);};
  const rm=mk('button',{type:'button',className:'btn small',textContent:'Remove'});rm.onclick=()=>{editing=true;props.splice(i,1);drawProps();};
  box.append(mk('div',{className:'row'},mk('h3',{textContent:'Prop '+(i+1)}),tryb,rm));
  box.append(mk('div',{className:'grid2'},field('Name for the visitors (for example Gargoyle wings)',txt(p.n,'Wings',v=>p.n=v)),field('Icon',sel(p.e||EMO[0],EMO.map(e=>[e,e]),v=>p.e=v))));
  const chips=mk('div',{className:'row'});
  (p.models||[]).forEach((m,k)=>{const c=mk('button',{type:'button',className:'btn small',textContent:m+' ✕'});c.onclick=()=>{editing=true;p.models.splice(k,1);drawProps();};chips.append(c);});
  if(!(p.models||[]).length)chips.append(mk('span',{className:'note',textContent:'No models yet: search below.'}));
  box.append(mk('label',{},'Models'),chips);
  const q=mk('input',{type:'text',placeholder:'Search models and groups (for example wing, bat, arch)'});const res=mk('div',{style:'display:flex;flex-direction:column;gap:6px'});
  q.oninput=()=>{editing=true;const t=q.value.trim().toLowerCase();res.replaceChildren();if(t.length<2)return;
   const gs=Object.keys(pdata.groups).filter(g=>g.toLowerCase().includes(t)).slice(0,15).map(g=>['📁 '+g+' ('+pdata.groups[g].length+' models)',pdata.groups[g]]);
   const ms=pdata.models.filter(m=>m.model.toLowerCase().includes(t)).slice(0,25).map(m=>[m.model+' ('+m.nodes+' pixels)',[m.model]]);
   for(const [label,list] of gs.concat(ms)){const b=mk('button',{type:'button',className:'btn small',textContent:label,style:'text-align:left'});b.onclick=()=>{editing=true;p.models=p.models||[];list.forEach(m=>{if(!p.models.includes(m))p.models.push(m);});drawProps();};res.append(b);}
   if(!res.children.length)res.append(mk('div',{className:'note',textContent:pdata.models.length?'Nothing found.':'Click "Read models and groups from EZPlayer" first.'}));};
  box.append(q,res);
  const ac=mk('input',{type:'checkbox',checked:!!p.across});ac.onchange=()=>{editing=true;p.across=ac.checked;};
  box.append(mk('label',{className:'chk'},ac,'Spread the effect across all its models (off: each model does the same, which suits pairs of wings)'));
  return box;}));
 if(!props.length)$('props').append(mk('div',{className:'note',textContent:'No props yet.'}));
}
$('addProp').onclick=()=>{editing=true;props.push({n:'',e:EMO[0],models:[],across:false});drawProps();};
$('readProps').onclick=async()=>{$('propsMsg').textContent='Reading… (a big show can take a moment)';let r={ok:false};try{r=await api('props-models',{});}catch(e){}
 if(r.ok){pdata=r;$('propsMsg').textContent=r.models.length+' models, '+Object.keys(r.groups).length+' groups';}else $('propsMsg').textContent='EZPlayer did not answer: '+(r.msg||'');drawProps();};
$('addSide').onclick=()=>{editing=true;sides.push(newSide());drawSides();};
$('scan').onclick=async()=>{$('scanMsg').textContent='Looking… (up to 10 s)';const r=await api('scan',{});$('scanMsg').textContent=r.length+' board(s) found';
 $('boards').replaceChildren(...r.map(b=>{const use=mk('button',{type:'button',className:'btn small',textContent:'Add as a side'});
  use.onclick=()=>{editing=true;sides.push({n:'',out:'ddp',ip:b.ip,start:1,w:b.w||32,h:b.h||(b.w?b.h:32),corner:'tl',dir:'rows',zig:true});drawSides();};
  return mk('div',{className:'item'},mk('div',{className:'what',textContent:b.name+' · '+b.ip+' · '+b.leds+' LEDs'+(b.w?' · matrix '+b.w+'×'+b.h:'')}),use);}));};
$('read').onclick=async()=>{let r={ok:false,targets:[]};try{r=await api('models',{ezp:$('ezp').value.trim()});}catch(e){}
 targets=r.targets||[];$('ezpMsg').textContent=r.ok?targets.length+' model(s)':'EZPlayer did not answer: '+(r.msg||'');drawSides();};
function ntDraw(n){if(!n||!n.today)return;const t=n.today,used=(t.sent||0)+(t.rx||0),pc=Math.min(100,used/n.limit*100);
 $('ntBar').style.width=Math.max(1,pc)+'%';$('ntBar').style.background=n.daily||n.blocked?'#ff5a5a':pc>70?'#ffc83c':'';
 let s='<b>'+(t.sent||0)+'</b> posted by the bridge · <b>'+(t.rx||0)+'</b> received from phones (all networks) · about '+pc.toFixed(1)+' % of one internet address\'s daily limit';
 if(t['429'])s+=' · <b>'+t['429']+'</b> "too many" answer(s), the last at '+new Date(t.last429*1000).toTimeString().slice(0,5);
 if(n.daily)s+='<br><b>The daily limit of this internet address is used up (it resets around '+n.daily_until+').</b> The bridge tries again every 10 minutes; another connection (a phone hotspot, WARP) works at once.';
 else if(n.blocked)s+='<br><b>Waiting '+n.blocked+' s before posting again.</b>';
 else s+='<br>Now: fine, '+Math.floor(n.tokens)+' messages of short-term budget left.';
 $('ntInfo').innerHTML=s;}
function render(){
 $('on').checked=st.on;ntDraw(st.ntfy);
 const nProps=(st.props||[]).length, nFaces=st.faces.length, usesEzp=nProps>0||st.faces.some(f=>f.out==='ezp');
 const where=[nFaces?nFaces+' side(s) of the cube':'',nProps?nProps+' prop(s)':''].filter(Boolean).join(' and ');
 let line;
 if(!st.on) line='<span class="pill off">OFF</span> Visitors\' requests do not show.';
 else if(!nFaces&&!nProps) line='<span class="pill off">OFF</span> Nothing to show requests on yet: add a side of the cube or a prop below, then Save.';
 else if(!nFaces&&!st.ezpOk) line='<span class="pill off">OFF</span> The props need EZPlayer, which is not answering.';
 else line='<span class="pill on">ON</span> Requests show on '+where+'.'+(nProps&&!st.ezpOk?' The props are hidden until EZPlayer answers.':'');
 $('state').innerHTML=line+(usesEzp?'<br>EZPlayer: '+st.ezpMsg:'')+(st.ntfy&&st.ntfy.blocked?'<br><b>ntfy.sh: too many messages from this internet address, posting again in '+st.ntfy.blocked+' s</b> (phones on mobile data are not affected)':'')+'<br>bridge '+st.version;
 if(!editing){sides=JSON.parse(JSON.stringify(st.faces));drawSides();props=JSON.parse(JSON.stringify(st.props||[]));drawProps();$('sProp').value=st.seconds.prop||20;
  $('ezp').value=st.ezp;$('title').value=st.title||'';$('page').value=st.page||'';
  $('free').checked=st.free;$('theme').value=st.theme;$('sText').value=st.seconds.text;$('sGif').value=st.seconds.gif;$('sDraw').value=st.seconds.draw;$('sFx').value=st.seconds.fx||180;$('wait').value=st.wait||0;$('hold').checked=!!st.hold;$('endDark').checked=!!st.end_dark;$('waitTurn').checked=!!st.wait_turn;$('approve').checked=st.approve;$('games').checked=!!st.games;{const gl=st.game_list||['c4','ttt','simon','count','snake','invaders','pong','race'];$('gC4').checked=gl.includes('c4');$('gTtt').checked=gl.includes('ttt');$('gSimon').checked=gl.includes('simon');$('gCount').checked=gl.includes('count');$('gSnake').checked=gl.includes('snake');$('gInv').checked=gl.includes('invaders');$('gPong').checked=gl.includes('pong');$('gRace').checked=gl.includes('race');}
  $('play').checked=st.play!==false;$('playSecs').value=String(st.play_secs||30);drawPlayProps(st.props||[],st.play_props);$('fps').value=String(st.fps||20);$('cpuLevel').value=st.cpu_level||'normal';}
 $('noPage').hidden=!!st.urls.hw;
 const qk=THEMES.map(t=>st.urls[t]).join();
 for(const t of THEMES){$('url_'+t).textContent=st.urls[t]||'—';}
 if(qrFor!==qk&&window.QRCode){for(const t of THEMES){$('qr_'+t).replaceChildren();if(st.urls[t])new QRCode($('qr_'+t),{text:st.urls[t],width:200,height:200,correctLevel:QRCode.CorrectLevel.M});}qrFor=qk;}
 $('pendCard').hidden=!st.pending.length;
 $('pend').replaceChildren(...st.pending.map(p=>{const d=mk('div',{className:'item'});const w=mk('div',{className:'what'});
  if(p.kind==='draw'){const c=mk('canvas',{width:p.info.w,height:p.info.h});c.style.width=(p.info.w*5)+'px';const g=c.getContext('2d');[...p.info.p].forEach((v,i)=>{if(v!=='0'){g.fillStyle='#'+['000000','ffffff','ff2a2a','ff7a1a','ffd23f','39d353','2bb7ff','9b5cff','ff4fd8'][+v];g.fillRect(i%p.info.w,Math.floor(i/p.info.w),1,1);}});w.append(c);}
  else if(p.kind==='gifx'){const im=mk('img',{src:p.info.url,width:p.info.w*5});im.style.imageRendering='pixelated';im.style.background='#000';w.append(im,mk('div',{textContent:'Animation: '+p.info.src+(p.info.t?' + "'+p.info.t+'"':'')}));}
  else w.textContent=(p.kind==='text'?'Text: '+p.info.t:p.kind==='fx'?'Effect: '+p.info.n:'Picture: '+p.info.f);if(p.info.where)w.append(mk('div',{className:'note',textContent:p.info.where}));
  const ok=mk('button',{className:'btn primary',textContent:'Show'});ok.onclick=()=>api('approve',{id:p.id}).then(refresh);
  const no=mk('button',{className:'btn',textContent:'Refuse'});no.onclick=()=>api('reject',{id:p.id}).then(refresh);
  d.append(w,ok,no);return d;}));
 $('now').textContent=st.now?'On the cube now: '+st.now+' · '+st.queue+' queued':st.queue+' queued';$('log').textContent=st.log.slice().reverse().join('\n');}
async function refresh(){st=await api('state');render();}
$('on').onchange=()=>api('settings',{on:$('on').checked}).then(refresh);
['ezp','title','page','sText','sGif','sDraw','sFx','wait','theme','approve','free','hold','endDark','waitTurn','games','cpuLevel','sProp','fps'].forEach(id=>{const e=$(id);e.addEventListener('focus',()=>editing=true);e.addEventListener('input',()=>editing=true);e.addEventListener('change',()=>editing=true);});
async function saveAll(){
 const r=await api('settings',{ezp:$('ezp').value.trim(),title:$('title').value.trim(),page:$('page').value.trim(),faces:sides,props:props,theme:$('theme').value,approve:$('approve').checked,free:$('free').checked,hold:$('hold').checked,end_dark:$('endDark').checked,wait_turn:$('waitTurn').checked,games:$('games').checked,play:$('play').checked,play_secs:+$('playSecs').value,play_props:[...document.querySelectorAll('#playProps input:checked')].map(e=>+e.value),game_list:[['c4','gC4'],['ttt','gTtt'],['simon','gSimon'],['count','gCount'],['snake','gSnake'],['invaders','gInv'],['pong','gPong'],['race','gRace']].filter(x=>$(x[1]).checked).map(x=>x[0]),fps:+$('fps').value,cpu_level:$('cpuLevel').value,wait:Math.max(0,Math.min(600,+$('wait').value|0)),seconds:{text:+$('sText').value,gif:+$('sGif').value,draw:+$('sDraw').value,fx:+$('sFx').value,prop:+$('sProp').value}});
 const bad=r.problems&&r.problems.length;
 $('saveMsg').textContent=bad?'Not saved for these sides (fix them and save again): '+r.problems.join(' · '):'Saved.';
 if(!bad){editing=false;setTimeout(()=>$('saveMsg').textContent='',4000);}
 await refresh();}
$('save').onclick=saveAll;
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>st.urls[b.dataset.copy]&&navigator.clipboard&&navigator.clipboard.writeText(st.urls[b.dataset.copy]).then(()=>{b.textContent='Copied';setTimeout(()=>b.textContent='Copy address',2000);}));
$('test').onclick=()=>api('test',{t:$('testTxt').value||'Hello!'}).then(refresh);
refresh();setInterval(()=>{if(!editing)refresh();},3000);
function drawPlayProps(ps,pick){const box=document.getElementById('playProps');if(!box)return;const old=[...box.querySelectorAll('input')].map(e=>e.checked);
 box.replaceChildren(...ps.map((p,i)=>{const l=document.createElement('label');const c=document.createElement('input');c.type='checkbox';c.value=i;c.checked=Array.isArray(pick)?pick.includes(i):true;l.append(c,' '+(p.e||'')+' '+p.n);return l;}));
 if(!ps.length)box.textContent='No props yet: add them below.';}
// ---- Sing card (its own Save button)
let SG=null,sgDirty=false;
async function sgLoad(force){try{const r=await fetch('/api/sing');SG=await r.json();}catch(e){return;}
 const $=id=>document.getElementById(id);
 if(!sgDirty||force){$('sgOn').checked=SG.sing;$('sgApprove').checked=SG.approve;$('sgVol').value=String(SG.volume);$('sgDelay').value=String(SG.delay);$('sgProps').checked=SG.props;$('sgCube').checked=SG.cube;
  $('sgDevBox').hidden=SG.os!=='linux';if(SG.os==='linux'){$('sgDev').replaceChildren(...[['','Default']].concat(SG.devices).map(([v,d])=>{const o=document.createElement('option');o.value=v;o.textContent=v?(v+(d?' — '+d:'')):'Default';return o;}));$('sgDev').value=SG.device;}
  $('sgList').replaceChildren(...SG.singers.map(x=>{const row=document.createElement('div');row.className='row';row.dataset.k=x.k;
   const c=document.createElement('input');c.type='checkbox';c.checked=x.on;c.className='sgC';
   const e=document.createElement('input');e.type='text';e.value=x.e;e.maxLength=4;e.style.width='56px';e.className='sgE';
   const n=document.createElement('input');n.type='text';n.value=x.n;n.maxLength=28;n.style.flex='1';n.className='sgN';
   const t=document.createElement('span');t.className='note';t.textContent=x.kind==='face'?'moves its mouth':x.kind==='prop'?'glows':'cube face';
   [c,e,n].forEach(el=>el.oninput=()=>{sgDirty=true;});row.append(c,e,n,t);return row;}));
  if(!SG.singers.length)$('sgList').textContent=SG.ezpOk?'Nobody can sing yet: find the singing models, add props, or let the cube sing.':'EZPlayer is not answering: only the cube can sing for now.';}
 $('sgMsg').textContent=SG.loading?'Reading the show…':(SG.found+' singing model(s) found'+(SG.ezpOk?'':' (EZPlayer not answering)'));
 $('sgPend').replaceChildren(...(SG.pending||[]).map(x=>{const row=document.createElement('div');row.className='row';
  const a=document.createElement('audio');a.controls=true;a.src='/api/sing/audio?id='+x.id;a.preload='none';
  const ok=document.createElement('button');ok.className='btn primary';ok.type='button';ok.textContent='▶ Play';ok.onclick=()=>sgAct('approve',x.id);
  const no=document.createElement('button');no.className='btn';no.type='button';no.textContent='✕';no.onclick=()=>sgAct('reject',x.id);
  const l=document.createElement('span');l.textContent=x.who+' · '+x.ago+' s ago';row.append(l,a,ok,no);return row;}));}
async function sgPost(b){const r=await fetch('/api/sing',{method:'POST',headers:{'X-Cube':'1'},body:JSON.stringify(b)});return r.json();}
async function sgAct(a,id){await sgPost({a,id});sgLoad();}
(function(){const $=id=>document.getElementById(id);if(!$('singCard'))return;
 ['sgOn','sgApprove','sgVol','sgDelay','sgProps','sgCube','sgDev'].forEach(id=>$(id).addEventListener('input',()=>{sgDirty=true;}));
 $('sgFind').onclick=async()=>{await sgPost({a:'find'});$('sgMsg').textContent='Reading the show…';setTimeout(()=>sgLoad(true),4000);};
 $('sgTest').onclick=()=>sgPost({a:'test'});
 $('sgSave').onclick=async()=>{const off=[],names={};document.querySelectorAll('#sgList .row').forEach(r=>{const k=r.dataset.k;if(!r.querySelector('.sgC').checked)off.push(k);names[k]={n:r.querySelector('.sgN').value.trim(),e:r.querySelector('.sgE').value.trim()};});
  await sgPost({a:'set',sing:$('sgOn').checked,sing_approve:$('sgApprove').checked,sing_volume:+$('sgVol').value,sing_delay:+$('sgDelay').value,sing_props:$('sgProps').checked,sing_cube:$('sgCube').checked,sing_device:$('sgDev').value||'',sing_off:off,sing_names:names});
  sgDirty=false;$('sgSaved').textContent='Saved.';setTimeout(()=>{$('sgSaved').textContent='';},2500);sgLoad(true);};
 sgLoad(true);setInterval(()=>sgLoad(false),4000);})();
</script></body></html>"""

MIXER = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>ShowPlay Mixer</title>
<style>
:root{--bg:#0d0a16;--card:#1a1428;--raise:#261d3a;--line:#3a2d52;--fg:#fff;--muted:#bfb3d4;--hot:#ff7a1a;--ok:#39d353;--learn:#ffd23f}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:#0d0a16ee;backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:8px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
header h1{font-size:18px;margin:0 8px 0 0}a{color:var(--muted)}
.tab{min-height:40px;padding:6px 14px;border-radius:999px;border:1px solid var(--line);background:var(--raise);color:var(--fg);font:inherit;font-weight:700;cursor:pointer}
.tab.sel{background:var(--hot);border-color:var(--hot);color:#120b1f}.sp{flex:1}
#learnBtn.sel{background:var(--learn);border-color:var(--learn);color:#120b1f}
main{max-width:980px;margin:0 auto;padding:12px;display:flex;flex-direction:column;gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px}
.ct{font-weight:800;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.note{font-size:13px;color:var(--muted)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.chip{min-height:40px;padding:6px 12px;border-radius:12px;border:1px solid var(--line);background:var(--raise);color:var(--fg);font:inherit;font-weight:600;cursor:pointer;display:inline-flex;gap:8px;align-items:center}
.chip.sel{outline:3px solid var(--hot);outline-offset:-1px}.dot{width:10px;height:10px;border-radius:50%;background:#4a3d60;flex:none}.dot.on{background:var(--ok);box-shadow:0 0 8px var(--ok)}
.pads{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.pad{aspect-ratio:1;border-radius:14px;border:2px solid #2f2445;background:linear-gradient(160deg,#2b2140,#1c152b);color:var(--fg);font:inherit;font-weight:700;font-size:13px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:4px;text-align:center;touch-action:none;user-select:none;-webkit-user-select:none}
.pad .e{font-size:26px;line-height:1}.pad.lit{border-color:var(--hot);box-shadow:0 0 14px #ff7a1a88,inset 0 0 18px #ff7a1a44}
.pad:active,.pad.down{transform:scale(.96)}
.pals{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}
.pal{min-height:52px;border-radius:12px;border:2px solid #2f2445;color:#fff;font:inherit;font-weight:800;font-size:12px;text-shadow:0 1px 3px #000;cursor:pointer}
.pal.lit{border-color:#fff;box-shadow:0 0 12px #fff8}
.faders{display:flex;gap:14px;justify-content:space-around;flex-wrap:wrap}
.fader{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:62px;border-radius:12px;padding:4px}
.fader input{writing-mode:vertical-lr;direction:rtl;height:170px;width:44px;accent-color:var(--hot);touch-action:none}
.fader b{font-size:12px}.fader span{font-size:12px;color:var(--muted)}
.holds{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.hold{min-height:64px;border-radius:14px;border:2px solid #2f2445;background:#241b36;color:#fff;font:inherit;font-weight:800;font-size:16px;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
.hold.down{background:#fff;color:#000}
.scenes{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.scene{min-height:52px;border-radius:12px;border:1px dashed var(--line);background:#160f24;color:var(--muted);font:inherit;font-weight:700;cursor:pointer}
.scene.has{border-style:solid;color:#fff;background:#2b1f45}
.btn{min-height:44px;padding:8px 14px;border-radius:12px;border:1px solid var(--line);background:var(--raise);color:var(--fg);font:inherit;font-weight:700;cursor:pointer}
.btn.primary{background:var(--hot);border-color:var(--hot);color:#120b1f}.btn.sel{background:var(--learn);color:#120b1f;border-color:var(--learn)}
input[type=text],input[type=number],select{min-height:44px;padding:8px 12px;border-radius:12px;border:1px solid var(--line);background:var(--raise);color:var(--fg);font:inherit}
.keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px}
.key{position:relative;min-height:96px;border-radius:12px;border:2px solid #2f2445;background:#1c152b;color:#fff;font:inherit;font-size:11px;font-weight:700;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden;padding:18px 4px 16px;text-align:center;word-break:break-word}
.key .sw{position:absolute;left:0;right:0;top:0;height:12px}.key .no{position:absolute;right:5px;bottom:3px;font-size:10px;color:var(--muted)}
.key .lv{position:absolute;left:0;right:0;bottom:0;background:#fff3;pointer-events:none;height:0}
.key.down{border-color:#fff}.key.sel{outline:3px solid var(--hot)}
.hue{background:linear-gradient(90deg,red,#ff0,lime,cyan,blue,#f0f,red);height:10px;border-radius:5px}
[data-mid].learnable{outline:2px dashed var(--learn);outline-offset:2px}
#bar{position:fixed;left:0;right:0;bottom:0;z-index:6;background:var(--learn);color:#120b1f;font-weight:800;padding:10px 14px;text-align:center}
.mono{font-family:ui-monospace,monospace;background:#000;padding:8px 10px;border-radius:10px;font-size:13px}
.maprow{display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:10px;padding:6px 8px}.maprow .what{flex:1}
.strips{display:flex;gap:16px;justify-content:center}
.strip{position:relative;width:110px;height:300px;border-radius:16px;border:2px solid var(--line);background:#120c1e;touch-action:none;user-select:none;-webkit-user-select:none;cursor:ns-resize}
.strip .pd{position:absolute;left:8px;right:8px;height:64px;border-radius:12px;transform:translateY(-50%)}
.strip b{position:absolute;left:0;right:0;bottom:6px;text-align:center;font-size:12px;color:var(--muted)}
.score{font:900 44px/1 system-ui;text-align:center;letter-spacing:.1em}
[hidden]{display:none!important}
</style></head><body>
<header><h1>🎛️ ShowPlay</h1>
 <button class="tab sel" data-tab="mix">🎚️ Mixer</button><button class="tab" data-tab="keys">🎹 Keys</button><button class="tab" data-tab="midi">🎛️ MIDI</button><button class="tab" data-tab="pong">🏓 Pong</button><button class="tab" data-tab="inv">👾 Invaders</button>
 <span class="sp"></span><button class="tab" id="learnBtn" title="Map a MIDI control: press this, touch a control here, then move the one on the device">🎓 Learn</button><a href="/">Control page</a></header>
<main>
<!-- ================= MIXER ================= -->
<section id="t_mix" style="display:flex;flex-direction:column;gap:12px">
 <div class="card"><div class="ct">1 · Targets</div>
  <div class="note">Pick what to drive (tap again to unpick). Pads, colours and faders act on what is picked.</div>
  <div class="row" id="targets"></div>
  <div class="row"><button class="chip" id="selAll">All</button><button class="chip" id="selNone">None</button><span class="note" id="tgNote"></span></div></div>
 <div class="card"><div class="row"><span class="ct">2 · Pads</span><span class="sp"></span><button class="chip sel" data-bank="fx">Effects</button><button class="chip" data-bank="cube">Cube scenes</button><button class="chip" data-bank="text">Text</button></div>
  <div class="pads" id="pads"></div>
  <div class="row" id="textRow" hidden><input type="text" id="txt" maxlength="60" placeholder="Text for the picked sides" style="flex:1;min-width:160px"><button class="btn primary" id="txtGo">Show</button></div>
  <div class="note" id="padNote"></div></div>
 <div class="card"><div class="ct">3 · Colours</div><div class="pals" id="pals"></div></div>
 <div class="card"><div class="ct">4 · Faders</div><div class="faders" id="faders"></div>
  <div class="holds"><button class="hold" data-hold="flash" data-mid="hold:flash">⚡ Flash</button><button class="hold" data-hold="strobe" data-mid="hold:strobe">💥 Strobe</button><button class="hold" data-hold="black" data-mid="hold:black">⬛ Blackout</button></div>
  <div class="note">Hold to use. They act on everything the Mixer and the Keys are driving.</div></div>
 <div class="card"><div class="row"><span class="ct">5 · Scenes</span><span class="sp"></span><button class="btn" id="saveMode">💾 Save to…</button></div>
  <div class="scenes" id="scenes"></div><div class="note">A scene keeps every target that is on, with its effect, colours and faders. Tap to bring it back. To keep one: Save to…, then tap a slot (tap a full slot in Save mode to replace it).</div></div>
 <div class="card"><div class="row"><button class="btn" id="offBtn" data-mid="off">⏹ Stop the picked</button><button class="btn primary" id="relBtn" data-mid="release">↩️ Release all</button><span class="sp"></span>
  <label class="note">Give back after <select id="idle"><option value="5">5 min</option><option value="15">15 min</option><option value="60">1 hour</option><option value="0">never</option></select> untouched</label></div>
  <div class="note">While the Mixer drives a target, visitors' requests and games for it wait. Release gives everything back to the visitors and the show.</div></div>
</section>
<!-- ================= KEYS ================= -->
<section id="t_keys" hidden style="display:flex;flex-direction:column;gap:12px">
 <div class="card"><div class="row"><span class="ct">Keys</span><span class="sp"></span><button class="btn sel" id="kPlay">▶ Play</button><button class="btn" id="kEdit">✏️ Edit keys</button><button class="btn" id="kAllOff">All off</button></div>
  <div class="note" id="kNote">Each key is one model of your props (or one side of the cube). Press higher on a key to play it harder; slide up and down while holding to change it (aftertouch). On a computer keyboard, 1–0, Q–P, A–L and Z–M play the first 36 keys.</div>
  <div class="keys" id="keys"></div></div>
 <div class="card" id="kEditor" hidden><div class="ct" id="kEdName">Key</div>
  <div class="note">Effect</div><div class="row" id="kFx"></div>
  <div class="note">Colours</div><div class="row" id="kPal"></div>
  <div class="faders" id="kFaders"></div>
  <div class="row"><button class="btn primary" id="kTry">Hold to try</button></div></div>
 <div class="card"><div class="ct">All keys</div><div class="faders" id="kGlob"></div></div>
</section>
<!-- ================= PONG ================= -->
<section id="t_pong" hidden style="display:flex;flex-direction:column;gap:12px">
 <div class="card"><div class="ct">Pong on the lights</div>
  <div class="note">For the people running the show, on the home network: no delay. Red is on the left, blue on the right. The computer plays any side nobody moves. First to 5 points.</div>
  <div class="row"><label class="note">Side <select id="pSide"></select></label><button class="btn primary" id="pCpu">🤖 1 player (against the computer)</button><button class="btn" id="pPvp">👫 2 players</button><button class="btn" id="pStop">⏹ Stop</button></div>
  <div class="note" id="pMsg"></div>
  <div class="score" id="pScore">0 : 0</div>
  <div class="strips"><div class="strip" id="pS0"><div class="pd" style="background:#ff3c3c"></div><b>Red · W / S</b></div><div class="strip" id="pS1"><div class="pd" style="background:#3c8cff"></div><b>Blue · ↑ / ↓</b></div></div>
  <div class="note">Drag in a strip to move that paddle (two phones can each hold one). On a computer: W / S for red, ↑ / ↓ for blue. A MIDI fader or knob can be a paddle: press 🎓 Learn, touch a strip, then move the fader or knob.</div></div>
</section>
<!-- ================= INVADERS ================= -->
<section id="t_inv" hidden style="display:flex;flex-direction:column;gap:12px">
 <div class="card"><div class="ct">Space Invaders on the lights</div>
  <div class="note">The crew's game: fast, no delay. Move the ship, fire, clear the waves. Three lives; a mystery ship crosses the top for extra points. (Visitors have their own slower version on their page.)</div>
  <div class="row"><label class="note">Side <select id="iSide"></select></label><button class="btn primary" id="iStart">▶️ Start</button><button class="btn" id="iStop">⏹ Stop</button></div>
  <div class="note" id="iMsg"></div>
  <div class="score" id="iScore">0</div>
  <div class="row" style="justify-content:center" id="iLives"></div>
  <input type="range" id="iPos" min="0" max="1000" value="500" style="width:100%;height:44px;accent-color:#3cff5a">
  <div class="holds"><button class="hold" id="iL" data-mid="game:left">◀</button><button class="hold" id="iF" data-mid="game:fire" style="background:#5a1010">🔥 Fire</button><button class="hold" id="iR" data-mid="game:right">▶</button></div>
  <div class="note">On a computer: ← / → (or A / D) to move, Space to fire. MIDI: press 🎓 Learn, then touch the slider (a knob or fader moves the ship), ◀ / ▶ or 🔥 (a pad or key).</div></div>
</section>
<!-- ================= MIDI ================= -->
<section id="t_midi" hidden style="display:flex;flex-direction:column;gap:12px">
 <div class="card"><div class="ct">MIDI devices</div>
  <div id="mDevs" class="note"></div>
  <label class="row"><input type="checkbox" id="mNative" style="width:22px;height:22px"> <span>The bridge reads the MIDI devices plugged into its computer (Windows, Linux, Raspberry Pi)</span></label>
  <div class="row"><button class="btn" id="webMidi">Use the MIDI devices of this browser</button><span class="note" id="webMidiMsg"></span></div>
  <div class="note">On a Mac, or when the bridge cannot read the device: plug the device into this computer, open <b>http://localhost:8099/mixer</b> in Chrome or Edge and press the button above. Keep this page open while you play. Do not use both ways for the same device.</div>
  <div class="note">Last message received:</div><div class="mono" id="mLast">—</div></div>
 <div class="card"><div class="ct">Keys</div>
  <div class="row"><label class="note">Note that plays the first key</label><input type="number" id="mBase" min="0" max="127" style="width:100px"><button class="btn" id="mBaseLearn">Learn: press the lowest key</button></div>
  <div class="note">Then each note above plays the next key (models in the order of the Keys page). Velocity sets how bright, aftertouch makes a held key brighter.</div></div>
 <div class="card"><div class="ct">Mapped controls</div>
  <div class="row" id="mPresets"></div>
  <div class="note">Learn: press 🎓 Learn at the top, touch any pad, colour, fader, scene, target or key on these pages, then move or press the control on the MIDI device. Faders and knobs (CC) suit faders; pads and buttons suit pads, holds and scenes. Without mapping: CC 7 (volume) = Master, CC 1 (modulation wheel) = colour of the keys.</div>
  <div id="mMap" style="display:flex;flex-direction:column;gap:6px"></div>
  <div class="row"><button class="btn" id="mClear">Forget all</button></div></div>
</section>
</main>
<div id="bar" hidden></div>
<script>
const $=id=>document.getElementById(id);
const mk=(t,p,...k)=>{const e=document.createElement(t);Object.assign(e,p||{});e.append(...k);return e;};
const post=(p,b)=>fetch('/api/'+p,{method:'POST',headers:{'X-Cube':'1'},body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
const get=p=>fetch('/api/'+p).then(r=>r.json());
const EMO={flap:'🦋',wave:'🌊',rise:'⬆️',spin:'🌀',breathe:'💓',sparkle:'✨',fire:'🔥',ripple:'💧',chase:'🏃',comet:'☄️',confetti:'🎉',solid:'🎨',
 haunted:'🏚️',eyes:'👀',lightning:'⚡',firenoise:'🪄',blackhole:'🕳️',snowfall:'❄️',candy:'🍬',retro:'🎄',twinkle:'⭐',fireworks:'🎆',bursts:'💥',rainbow:'🌈',plasma:'🫧',matrix:'💻',pacifica:'🌊'};
let tab='mix',M=null,K=null,MI=null,bank='fx',saveMode=false,learn=false,busy=0,kMode='play',kSel=null;
const grad=c=>'linear-gradient(90deg,'+c.map(x=>'#'+x).join(',')+')';
function throttle(fn,ms){let t=0,last=null,tm=null;return v=>{last=v;const now=Date.now();if(now-t>=ms){t=now;fn(last);}else{clearTimeout(tm);tm=setTimeout(()=>{t=Date.now();fn(last);},ms-(now-t));}};}
// ---------- learn
function learnable(el,id){el.dataset.mid=id;el.addEventListener('click',e=>{if(!learn)return;e.preventDefault();e.stopImmediatePropagation();post('midi',{a:'learn',id}).then(()=>bar('Now move or press the control on the MIDI device for: '+id));},true);
 el.addEventListener('pointerdown',e=>{if(learn){e.stopImmediatePropagation();}},true);}
function bar(t){$('bar').hidden=!t;$('bar').textContent=t||'';}
$('learnBtn').onclick=()=>{learn=!learn;$('learnBtn').classList.toggle('sel',learn);document.querySelectorAll('[data-mid]').forEach(e=>e.classList.toggle('learnable',learn));
 bar(learn?'Learn: touch a control on this page':'');if(!learn)post('midi',{a:'learn',id:''});};
document.querySelectorAll('[data-mid]').forEach(e=>learnable(e,e.dataset.mid));
// ---------- tabs
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('sel',x===b));
 for(const t of ['mix','keys','midi','pong','inv'])$('t_'+t).hidden=t!==tab;refresh();});
// ---------- MIXER
const cur=()=>M.sel.length?M.t[M.sel[0]]:null;
function mix(b){busy=Date.now();return post('mixer',b).then(()=>get('mixer')).then(r=>{M=r;drawMix(false);});}
function drawMix(full){
 $('targets').replaceChildren(...M.targets.map(t=>{const st=M.t[t.k];const c=mk('button',{className:'chip'+(M.sel.includes(t.k)?' sel':'')},mk('span',{className:'dot'+(st.on?' on':'')}),(t.kind==='side'?'🧊 ':'✨ ')+t.n+(M.loading.includes(t.k)?' …':''));
  c.onclick=()=>{if(learn)return;const s=M.sel.includes(t.k)?M.sel.filter(x=>x!==t.k):M.sel.concat(t.k);mix({a:'sel',keys:s});};learnable(c,'target:'+t.k);return c;}));
 $('tgNote').textContent=M.targets.length?(M.sel.length?M.sel.length+' picked':'Nothing picked'):'No sides or props yet (set them on the control page'+(M.ezpOk?'':'; props need EZPlayer')+').';
 const s=cur();
 if(bank==='text'){$('pads').replaceChildren();$('textRow').hidden=false;}
 else{$('textRow').hidden=true;const list=bank==='fx'?M.fx:M.cube;
  $('pads').replaceChildren(...list.map(([k,n])=>{const fx=bank==='fx'?k:'c:'+k;const lit=M.sel.some(x=>M.t[x].on&&M.t[x].fx===fx);
   const p=mk('button',{className:'pad'+(lit?' lit':'')},mk('span',{className:'e',textContent:EMO[k]||'•'}),n);p.onclick=()=>{if(!learn)mix({a:'pad',fx});};learnable(p,(bank==='fx'?'pad:':'cube:')+k);return p;}));}
 $('padNote').textContent=bank==='cube'?'Cube scenes are drawn on the sides of the cube only (props keep their effect).':bank==='text'?'Scrolls on the picked sides, in the first colour of their palette.':'Effects work on the sides of the cube and on the props.';
 $('pals').replaceChildren(...M.pals.map(([k,n,c])=>{const b=mk('button',{className:'pal'+(s&&s.pal===k?' lit':''),textContent:n});b.style.background=grad(c);b.onclick=()=>{if(!learn)mix({a:'pal',pal:k});};learnable(b,'pal:'+k);return b;}));
 if(full||!fadersBuilt)buildFaders();
 setF('bright',M.bright);if(s){setF('speed',s.speed);setF('hue',s.hue);setF('white',s.white);}
 $('scenes').replaceChildren(...M.scenes.map((n,i)=>{const b=mk('button',{className:'scene'+(n?' has':''),textContent:n||('Slot '+(i+1))});
  b.onclick=()=>{if(learn)return;if(saveMode){const name=prompt('Name of the scene',n||'Scene '+(i+1));if(name===null)return;saveMode=false;$('saveMode').classList.remove('sel');mix({a:'save',n:i,name});}else if(n)mix({a:'load',n:i});};learnable(b,'scene:'+i);return b;}));
 $('idle').value=String(M.idle);
 document.querySelectorAll('[data-mid]').forEach(e=>e.classList.toggle('learnable',learn));
}
let fadersBuilt=false;const fEls={};
const FAD=[['bright','Master','all'],['speed','Speed','picked'],['hue','Colour','picked'],['white','White','picked']];
function buildFaders(){fadersBuilt=true;$('faders').replaceChildren(...FAD.map(([k,n,w])=>{const i=mk('input',{type:'range',min:0,max:1000,value:500});
  const send=throttle(v=>post('mixer',{a:'fader',name:k,v}),70);i.oninput=()=>{busy=Date.now();send(i.value/1000);};fEls[k]=i;
  const box=mk('div',{className:'fader'},mk('b',{textContent:n}),i,mk('span',{textContent:w}));learnable(box,'fader:'+k);return box;}));}
function setF(k,v){if(fEls[k]&&document.activeElement!==fEls[k]&&Date.now()-busy>800)fEls[k].value=Math.round(v*1000);}
document.querySelectorAll('[data-bank]').forEach(b=>b.onclick=()=>{bank=b.dataset.bank;document.querySelectorAll('[data-bank]').forEach(x=>x.classList.toggle('sel',x===b));drawMix(false);});
$('selAll').onclick=()=>mix({a:'sel',keys:M.targets.map(t=>t.k)});$('selNone').onclick=()=>mix({a:'sel',keys:[]});
$('txtGo').onclick=()=>{const t=$('txt').value.trim();if(t)mix({a:'text',t});};
$('offBtn').onclick=()=>{if(!learn)mix({a:'off'});};$('relBtn').onclick=()=>{if(!learn)mix({a:'release'});};
$('idle').onchange=()=>mix({a:'idle',v:+$('idle').value});
$('saveMode').onclick=()=>{saveMode=!saveMode;$('saveMode').classList.toggle('sel',saveMode);};
function holdBtn(el,on,off){let tm=null;const up=()=>{if(!tm)return;clearInterval(tm);tm=null;el.classList.remove('down');off();};
 el.addEventListener('pointerdown',e=>{if(learn)return;e.preventDefault();el.setPointerCapture(e.pointerId);el.classList.add('down');on();tm=setInterval(on,400);});
 el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);}
document.querySelectorAll('[data-hold]').forEach(b=>holdBtn(b,()=>post('mixer',{a:'hold',name:b.dataset.hold,ms:900}),()=>post('mixer',{a:'hold',name:b.dataset.hold,ms:0})));
// ---------- KEYS
const KB='1234567890qwertyuiopasdfghjklzxcvbnm';
const hsl=(h,w)=>{const l=50+w*50;return 'hsl('+Math.round(h*360)+',100%,'+l+'%)';};
function kColor(k){const p=K.pals.find(x=>x[0]===k.pal);return p?grad(p[2]):hsl((k.hue+K.hue)%1,k.white);}
function keysPost(b){busy=Date.now();return post('keys',b);}
function drawKeys(){
 $('kNote').hidden=false;
 if(!K.keys.length){$('keys').replaceChildren(mk('div',{className:'note',textContent:'No keys yet: add props (and their models) or sides of the cube on the control page.'+(K.ezpOk?'':' Props need EZPlayer to be running.')}));return;}
 $('keys').replaceChildren(...K.keys.map((k,i)=>{const sw=mk('div',{className:'sw'});sw.style.background=kColor(k);const lv=mk('div',{className:'lv'});
  const el=mk('button',{className:'key'+(kSel===k.k&&kMode==='edit'?' sel':''),title:k.g},sw,k.n,mk('span',{className:'no',textContent:(i<36?KB[i].toUpperCase()+' · ':'')+'#'+(i+1)}),lv);
  el.dataset.k=k.k;keyPlay(el,k,lv);learnable(el,'key:'+k.k);return el;}));
 if(kMode==='edit'&&kSel)drawEditor();
}
function keyPlay(el,k,lv){let id=null,tm=null,h=0;
 const lvl=e=>{const r=el.getBoundingClientRect();return Math.max(0.05,Math.min(1,1-(e.clientY-r.top)/r.height));};
 el.addEventListener('pointerdown',e=>{if(learn)return;e.preventDefault();
  if(kMode==='edit'){kSel=k.k;drawKeys();return;}
  id=e.pointerId;el.setPointerCapture(id);h=lvl(e);el.classList.add('down');lv.style.height=(h*100)+'%';keysPost({a:'on',k:k.k,v:h});
  tm=setInterval(()=>post('keys',{a:'after',k:k.k}),1000);});
 const af=throttle(v=>post('keys',{a:'after',k:k.k,v}),50);
 el.addEventListener('pointermove',e=>{if(e.pointerId!==id)return;h=lvl(e);lv.style.height=(h*100)+'%';af(h);});
 const up=e=>{if(id===null)return;id=null;clearInterval(tm);el.classList.remove('down');lv.style.height=0;keysPost({a:'off',k:k.k});};
 el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);}
function drawEditor(){const k=K.keys.find(x=>x.k===kSel);$('kEditor').hidden=!k;if(!k)return;
 $('kEdName').textContent='Key #'+(k.note+1)+' · '+k.n+' ('+k.g+')';
 $('kFx').replaceChildren(...K.fx.map(([f,n])=>{const b=mk('button',{className:'chip'+(k.fx===f?' sel':''),textContent:(EMO[f]||'')+' '+n});b.onclick=()=>keysPost({a:'set',k:k.k,fx:f}).then(loadKeys);return b;}));
 const own=mk('button',{className:'chip'+(!k.pal?' sel':''),textContent:'Own colour'});own.onclick=()=>keysPost({a:'set',k:k.k,pal:''}).then(loadKeys);
 $('kPal').replaceChildren(own,...K.pals.map(([p,n,c])=>{const b=mk('button',{className:'chip'+(k.pal===p?' sel':''),textContent:n});b.style.background=grad(c);b.style.textShadow='0 1px 3px #000';b.onclick=()=>keysPost({a:'set',k:k.k,pal:p}).then(loadKeys);return b;}));
 $('kFaders').replaceChildren(...[['hue','Colour'],['white','White'],['level','Level']].map(([f,n])=>{const i=mk('input',{type:'range',min:0,max:1000,value:Math.round(k[f]*1000)});
  const send=throttle(v=>keysPost({a:'set',k:k.k,[f]:v}),120);i.oninput=()=>{k[f]=i.value/1000;send(k[f]);const el=document.querySelector('.key[data-k="'+CSS.escape(k.k)+'"] .sw');if(el)el.style.background=kColor(k);};
  i.onchange=()=>loadKeys();return mk('div',{className:'fader'},mk('b',{textContent:n}),i,mk('span',{textContent:f==='hue'?'turn':''}));}));
}
holdBtn($('kTry'),()=>{if(kSel)post('keys',{a:'on',k:kSel,v:1}).then(()=>post('keys',{a:'after',k:kSel}));},()=>{if(kSel)post('keys',{a:'off',k:kSel});});
const KG=[['bright','Master',1],['attack','Attack',2],['release','Release',4],['hue','Colour all',1]];
function drawGlob(){$('kGlob').replaceChildren(...KG.map(([f,n,hi])=>{const i=mk('input',{type:'range',min:0,max:1000,value:Math.round((K[f]/hi)*1000)});
  const send=throttle(v=>keysPost({a:'glob',[f]:v*hi}),80);i.oninput=()=>send(i.value/1000);i.onchange=()=>loadKeys();
  const box=mk('div',{className:'fader'},mk('b',{textContent:n}),i,mk('span',{textContent:f==='attack'?'0–2 s':f==='release'?'0–4 s':''}));learnable(box,f==='bright'?'fader:bright':'keys:'+f);return box;}));}
$('kPlay').onclick=()=>{kMode='play';$('kPlay').classList.add('sel');$('kEdit').classList.remove('sel');$('kEditor').hidden=true;drawKeys();};
$('kEdit').onclick=()=>{kMode='edit';$('kEdit').classList.add('sel');$('kPlay').classList.remove('sel');drawKeys();};
$('kAllOff').onclick=()=>keysPost({a:'allOff'});
const kbDown=new Set();
addEventListener('keydown',e=>{if(tab!=='keys'||kMode!=='play'||e.repeat||e.target.tagName==='INPUT'||!K)return;const i=KB.indexOf(e.key.toLowerCase());
 if(i<0||i>=K.keys.length)return;kbDown.add(i);keysPost({a:'on',k:K.keys[i].k,v:0.85});const el=document.querySelectorAll('.key')[i];if(el)el.classList.add('down');});
addEventListener('keyup',e=>{const i=KB.indexOf(e.key.toLowerCase());if(!kbDown.has(i)||!K)return;kbDown.delete(i);keysPost({a:'off',k:K.keys[i].k});const el=document.querySelectorAll('.key')[i];if(el)el.classList.remove('down');});
setInterval(()=>{if(K)kbDown.forEach(i=>post('keys',{a:'after',k:K.keys[i].k}));},1000);
let keysSig='';
async function loadKeys(){K=await get('keys');const sig=JSON.stringify(K.keys)+K.hue;if(sig!==keysSig||!$('keys').children.length){keysSig=sig;drawKeys();}drawGlobIfIdle();}
let globBuilt='';function drawGlobIfIdle(){const s=[K.bright,K.attack,K.release,K.hue].join();if(s!==globBuilt&&!document.querySelector('#kGlob input:active')){globBuilt=s;drawGlob();}}
// ---------- MIDI
async function loadMidi(){MI=await get('midi');
 $('mDevs').textContent=MI.devices.length?'Read by the bridge: '+MI.devices.join(', '):(MI.native?(MI.os==='mac'?'On a Mac the bridge cannot read MIDI devices itself: use the browser button below.':'The bridge sees no MIDI device right now.'):'The bridge does not read MIDI devices (turned off below).');
 $('mNative').checked=MI.native;$('mLast').textContent=MI.last||'—';if(document.activeElement!==$('mBase'))$('mBase').value=MI.base;
 $('mPresets').replaceChildren(...MI.presets.map(([k,n])=>{const b=mk('button',{className:'btn',textContent:'Load preset: '+n});b.onclick=()=>post('midi',{a:'preset',name:k}).then(loadMidi);return b;}));
 $('mMap').replaceChildren(...(MI.map.length?MI.map.map(m=>{const x=mk('button',{className:'btn',textContent:'✕'});x.onclick=()=>post('midi',{a:'forget',k:m.k}).then(loadMidi);
  return mk('div',{className:'maprow'},mk('div',{className:'what',textContent:m.what+'  →  '+m.to}),x);}):[mk('div',{className:'note',textContent:'Nothing mapped yet.'})]));
 if(learn&&!MI.learn&&$('bar').textContent.startsWith('Now')){bar('Mapped. Touch another control, or press 🎓 Learn to finish.');}
}
$('mNative').onchange=()=>post('midi',{a:'native',v:$('mNative').checked}).then(()=>{loadMidi();alert('Restart the bridge for this to take effect.');});
$('mBase').onchange=()=>post('midi',{a:'base',v:+$('mBase').value|0}).then(loadMidi);
$('mBaseLearn').onclick=()=>post('midi',{a:'learnBase'}).then(()=>bar('Press the lowest key you want to use on the MIDI keyboard'));
$('mClear').onclick=()=>{if(confirm('Forget every mapped control?'))post('midi',{a:'clear'}).then(loadMidi);};
// Web MIDI: the page passes on the messages of devices plugged into this computer
$('webMidi').onclick=async()=>{
 if(!navigator.requestMIDIAccess){$('webMidiMsg').textContent='This browser has no Web MIDI: use Chrome or Edge.';return;}
 if(!isSecureContext){$('webMidiMsg').textContent='Browsers only allow MIDI on http://localhost: open http://localhost:8099/mixer on the computer the device is plugged into.';return;}
 try{const acc=await navigator.requestMIDIAccess();const pend=new Map();let tm=null;
  const flush=()=>{tm=null;pend.forEach(d=>post('midi',{a:'msg',d}));pend.clear();};
  const hook=()=>{const names=[];acc.inputs.forEach(inp=>{names.push(inp.name);inp.onmidimessage=ev=>{const d=Array.from(ev.data);const t=d[0]&0xF0;
   if(t===0xA0||t===0xB0||t===0xD0){pend.set(d[0]+':'+(t===0xD0?0:d[1]),d);if(!tm)tm=setTimeout(flush,25);}else if(t===0x80||t===0x90){flush();post('midi',{a:'msg',d});}};});
   $('webMidiMsg').textContent=names.length?'Passing on: '+names.join(', '):'No MIDI device found in this browser.';};
  hook();acc.onstatechange=hook;}catch(e){$('webMidiMsg').textContent='MIDI not allowed: '+e;}};
// ---------- PONG
let PG=null;const pPad=[0.5,0.5],pDrag=[false,false];
const pSend=[0,1].map(p=>throttle(v=>post('pong',{a:'pad',p,v}),40));
function pMove(p,v){pPad[p]=Math.max(0,Math.min(1,v));pSend[p](pPad[p]);pDrawPads();}
function pDrawPads(){[0,1].forEach(p=>{const el=$('pS'+p).querySelector('.pd');el.style.top=(8+pPad[p]*(300-16))+'px';});}
[0,1].forEach(p=>{const el=$('pS'+p);learnable(el,p?'game:p2':'game:p1');
 const at=e=>{const r=el.getBoundingClientRect();return (e.clientY-r.top-8)/(r.height-16);};
 el.addEventListener('pointerdown',e=>{if(learn)return;e.preventDefault();el.setPointerCapture(e.pointerId);pDrag[p]=true;pMove(p,at(e));});
 el.addEventListener('pointermove',e=>{if(pDrag[p])pMove(p,at(e));});
 const up=()=>{pDrag[p]=false;};el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);});
const pKeys={};addEventListener('keydown',e=>{if(tab!=='pong')return;const k={w:[0,-1],s:[0,1],ArrowUp:[1,-1],ArrowDown:[1,1]}[e.key];if(k){e.preventDefault();pKeys[e.key]=k;}});
addEventListener('keyup',e=>{delete pKeys[e.key];});
setInterval(()=>{if(tab!=='pong')return;Object.values(pKeys).forEach(([p,d])=>pMove(p,pPad[p]+d*0.05));},30);
$('pCpu').onclick=()=>post('pong',{a:'start',mode:'cpu',z:+$('pSide').value}).then(r=>{$('pMsg').textContent=r.ok?'':r.msg;loadPong();});
$('pPvp').onclick=()=>post('pong',{a:'start',mode:'pvp',z:+$('pSide').value}).then(r=>{$('pMsg').textContent=r.ok?'':r.msg;loadPong();});
$('pStop').onclick=()=>post('pong',{a:'stop'}).then(loadPong);
async function loadPong(){PG=await get('pong');
 const sel=$('pSide');const opts=[['-1','All sides']].concat(PG.sides.map((n,i)=>[String(i),n]));
 if(sel.options.length!==opts.length)sel.replaceChildren(...opts.map(([v,n])=>mk('option',{value:v,textContent:n})));
 $('pScore').textContent=PG.score[0]+' : '+PG.score[1];
 $('pMsg').textContent=PG.busy?('Visitors are playing '+PG.busyName+': Pong can start when it ends.'):PG.st==='over'?(PG.winner?(PG.winner===1?'Red':'Blue')+' wins! 🏆':'Stopped.'):PG.st==='playing'?(PG.mode==='pvp'?'Two players':'Against the computer (blue)'):'Pick a side and start.';
 [0,1].forEach(p=>{if(!pDrag[p]&&PG.st==='playing'&&!(Object.values(pKeys).some(k=>k[0]===p)))pPad[p]=PG.pad[p];});pDrawPads();}
// ---------- INVADERS
let IV=null;
learnable($('iPos'),'game:ship');
const iSend=throttle(x=>post('invaders',{a:'move',x}),50);
$('iPos').oninput=()=>iSend($('iPos').value/1000);
$('iStart').onclick=()=>post('invaders',{a:'start',z:+$('iSide').value}).then(r=>{$('iMsg').textContent=r.ok?'':r.msg;loadInv();});
$('iStop').onclick=()=>post('invaders',{a:'stop'}).then(loadInv);
holdBtn($('iL'),()=>post('invaders',{a:'move',d:-1}),()=>post('invaders',{a:'move',d:0}));
holdBtn($('iR'),()=>post('invaders',{a:'move',d:1}),()=>post('invaders',{a:'move',d:0}));
holdBtn($('iF'),()=>post('invaders',{a:'fire'}),()=>{});
const iHeld=new Set();
addEventListener('keydown',e=>{if(tab!=='inv'||e.repeat)return;const k=e.key;
 if(k===' '){e.preventDefault();post('invaders',{a:'fire'});}
 else if(['ArrowLeft','a','A'].includes(k)){e.preventDefault();iHeld.add('L');post('invaders',{a:'move',d:-1});}
 else if(['ArrowRight','d','D'].includes(k)){e.preventDefault();iHeld.add('R');post('invaders',{a:'move',d:1});}});
addEventListener('keyup',e=>{if(tab!=='inv')return;const k=e.key;
 if(['ArrowLeft','a','A'].includes(k))iHeld.delete('L');else if(['ArrowRight','d','D'].includes(k))iHeld.delete('R');else return;
 post('invaders',{a:'move',d:iHeld.has('L')?-1:iHeld.has('R')?1:0});});
async function loadInv(){IV=await get('invaders');
 const sel=$('iSide');const opts=[['-1','All sides']].concat(IV.sides.map((n,i)=>[String(i),n]));
 if(sel.options.length!==opts.length)sel.replaceChildren(...opts.map(([v,n])=>mk('option',{value:v,textContent:n})));
 $('iScore').textContent=IV.score+(IV.wave?'  ·  wave '+IV.wave:'');
 $('iLives').textContent=IV.st==='idle'?'':'💚'.repeat(Math.max(0,IV.lives))||'—';
 $('iMsg').textContent=IV.busy?('Visitors are playing '+IV.busyName+': the game can start when it ends.'):IV.visitor?'A visitor is playing Space Invaders from their phone.':IV.st==='over'?('Game over ('+IV.why+'). Score '+IV.score+(IV.best?', best '+IV.best:'')):IV.st==='playing'||IV.st==='ready'?'Go!':'Pick a side and start.';
 if(document.activeElement!==$('iPos')&&IV.st==='playing')$('iPos').value=Math.round(IV.x*1000);}
// ---------- refresh
async function refresh(){try{
 if(tab==='mix'&&Date.now()-busy>700){M=await get('mixer');drawMix(false);}
 if(tab==='keys'&&!document.querySelector('.key.down'))await loadKeys();
 if(tab==='midi'||learn)await loadMidi();
 if(tab==='pong')await loadPong();
 if(tab==='inv')await loadInv();}catch(e){}}
refresh();setInterval(refresh,1200);setInterval(()=>{if(tab==='pong'&&PG&&PG.st==='playing')loadPong().catch(()=>{});if(tab==='inv'&&IV&&(IV.st==='playing'||IV.st==='ready'))loadInv().catch(()=>{});},500);
</script></body></html>"""

RACE_PAGE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ShowPlay · Race to the Star</title>
<style>
:root{--bg:#0d0a16;--card:#1a1428;--raise:#261d3a;--line:#3a2d52;--fg:#fff;--muted:#bfb3d4;--hot:#ffc83c;--ok:#39d353}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:#0d0a16ee;border-bottom:1px solid var(--line);padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
header h1{font-size:19px;margin:0}a{color:var(--muted)}.sp{flex:1}
main{max-width:980px;margin:0 auto;padding:14px;display:flex;flex-direction:column;gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px}
.ct{font-weight:800;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--hot)}.note{font-size:13px;color:var(--muted)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:12px;overflow:hidden}.seg button{border:0;background:var(--raise);color:var(--fg);padding:9px 14px;font:inherit;font-weight:700;cursor:pointer}
.seg button.sel{background:var(--hot);color:#1a1200}
.btn{min-height:42px;padding:8px 14px;border-radius:12px;border:1px solid var(--line);background:var(--raise);color:var(--fg);font:inherit;font-weight:700;cursor:pointer}
.btn.primary{background:var(--hot);border-color:var(--hot);color:#1a1200}
select,input[type=text],input[type=number]{min-height:40px;padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:var(--raise);color:var(--fg);font:inherit}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:var(--raise);border:1px solid var(--line);font-size:13px}
.chip button{border:0;background:none;color:var(--muted);cursor:pointer;font-size:14px}
.pair{display:grid;grid-template-columns:28px minmax(0,1fr) minmax(0,1fr) 44px;gap:8px;align-items:center}.pair select{width:100%;min-width:0}
.sl{display:grid;grid-template-columns:160px 1fr 60px;gap:10px;align-items:center}.sl input{width:100%;accent-color:var(--hot)}
.cols{display:flex;gap:8px;flex-wrap:wrap}.cols input[type=color]{width:46px;height:38px;border:1px solid var(--line);border-radius:10px;background:none;padding:2px}
label.ck{display:inline-flex;gap:8px;align-items:center}input[type=checkbox]{width:20px;height:20px;accent-color:var(--hot)}
#bar{position:sticky;bottom:0;background:#0d0a16ee;border-top:1px solid var(--line);padding:10px 14px;display:flex;gap:10px;align-items:center;justify-content:center}
.live{font-size:13px;color:var(--muted)}
</style></head><body>
<header><h1>🌟 Race to the Star</h1><span class="sp"></span><span class="live" id="live"></span><a href="/">Control page</a><a href="/mixer">Mixer</a></header>
<main>
<div class="card"><div class="ct">1 · Track</div>
 <div class="row"><span class="note">Type</span><div class="seg" id="track"><button data-v="split">One shared track</button><button data-v="each">A track per player</button><button data-v="cube">The cube</button></div></div>
 <div id="splitBox" style="display:flex;flex-direction:column;gap:10px">
  <div class="note">The track: any models or groups of the show (a mega tree, a matrix, a custom model, strings, the roof line…). A group is added as its models.</div>
  <div class="row"><select id="trackPick" style="min-width:260px"></select><button class="btn" id="trackAdd">Add to the track</button></div>
  <div class="row" id="trackChips"></div>
  <div class="row"><span class="note">Split the track</span><div class="seg" id="split"><button data-v="stripes">Stripes</button><button data-v="halves">Side by side</button><button data-v="rings">Rings</button></div></div>
  <div class="sl" id="frontRow"><span class="note">Front of the tree (side by side)</span><input type="range" id="front" min="0" max="100"><span id="frontV"></span></div>
  <div class="note">The star: any models (a star, a snowflake, a singing prop…), several, or none (the top of the track becomes the star).</div>
  <div class="row"><select id="starPick" style="min-width:260px"></select><button class="btn" id="starAdd">Add as a star</button></div>
  <div class="row" id="starChips"></div>
 </div>
 <div id="eachBox" style="display:flex;flex-direction:column;gap:8px">
  <div class="note">One track and one star for each player (up to 8). <b>Pair automatically</b> matches names like "TreeMiniMega 1" with "StarMiniMega1".</div>
  <div class="row"><button class="btn" id="autoPair">Pair automatically</button><button class="btn" id="addPair">+ Add a pair</button></div>
  <div id="pairs" style="display:flex;flex-direction:column;gap:6px"></div>
 </div>
 <div id="cubeBox" class="row"><span class="note">Side of the cube</span><select id="side"></select><span class="note">Lanes are columns; the star is the top two rows. Works without EZPlayer.</span></div>
 <div class="row"><span class="note">Climb direction</span><div class="seg" id="dir"><button data-v="up">Up</button><button data-v="down">Down</button><button data-v="right">Right</button><button data-v="left">Left</button><button data-v="order">Along the string</button></div></div>
 <div class="note">"Down" for trees wired upside down; "Right" / "Left" for a roof line or an arch; "Along the string" follows the order of the pixels.</div>
</div>
<div class="card"><div class="ct">2 · Ways to play</div>
 <div class="row"><label class="ck"><input type="checkbox" class="mode" value="tap"> 👆 Tap</label><label class="ck"><input type="checkbox" class="mode" value="voice"> 🎤 Voice</label><label class="ck"><input type="checkbox" class="mode" value="shake"> 🤳 Shake</label><label class="ck"><input type="checkbox" class="mode" value="run"> 🏃 Run on the spot</label></div>
 <label class="ck"><input type="checkbox" id="mix"> Each player picks their own way (off: everyone plays the first player's way)</label>
 <label class="ck"><input type="checkbox" id="shared"> Two players on one phone (👆 Tap: the screen splits into two buttons)</label>
</div>
<div class="card"><div class="ct">3 · Players</div>
 <div class="row"><label class="note">At least <input type="number" id="min" min="1" max="8" style="width:70px"></label><label class="note">At most <input type="number" id="max" min="1" max="8" style="width:70px"></label><span class="note">(1 = a player can race alone, against the clock)</span></div>
 <div class="note">Colours players can pick (a colour taken is locked for the others):</div>
 <div class="cols" id="cols"></div>
 <div class="row"><label class="note">Waiting room open for <input type="number" id="lobby" min="10" max="120" style="width:80px"> s</label><label class="ck"><input type="checkbox" id="early"> The first player can start sooner</label></div>
</div>
<div class="card"><div class="ct">4 · Players' levels</div>
 <div class="note">How far the same effort climbs for each level (100 % = normal).</div>
 <div class="sl"><span>🧒 Child</span><input type="range" class="lvl" data-k="kid" min="50" max="250"><span></span></div>
 <div class="sl"><span>🧑 Adult</span><input type="range" class="lvl" data-k="adult" min="50" max="250"><span></span></div>
 <div class="sl"><span>🏃 Sporty</span><input type="range" class="lvl" data-k="sport" min="50" max="250"><span></span></div>
 <label class="ck"><input type="checkbox" id="catchup"> Help whoever is behind (they climb a little faster, so races stay close to the end)</label>
</div>
<div class="card"><div class="ct">5 · Difficulty</div>
 <div class="seg" id="difficulty"><button data-v="easy">Easy</button><button data-v="normal">Normal</button><button data-v="hard">Hard</button><button data-v="custom">Custom</button></div>
 <div class="sl"><span>Race length (average effort)</span><input type="range" id="target" min="10" max="120"><span></span></div>
 <div class="sl"><span>Slide speed when stopped</span><input type="range" id="slide" min="0" max="30"><span></span></div>
 <div class="sl"><span>Wait before sliding</span><input type="range" id="delay" min="0" max="50"><span></span></div>
 <div class="sl"><span>Longest race</span><input type="range" id="max_time" min="30" max="300"><span></span></div>
</div>
<div class="card"><div class="ct">6 · Star and effects</div>
 <label class="ck"><input type="checkbox" id="leader"> The star shows the leader's colour during the race</label>
 <label class="ck"><input type="checkbox" id="countdown"> 3-2-1 countdown on the lights</label>
 <label class="ck"><input type="checkbox" id="rainbow"> Rainbow party on the track at the end (off: the winner's colour)</label>
 <div class="sl"><span>Party length</span><input type="range" id="party" min="3" max="20"><span></span></div>
 <div class="sl"><span>Brightness</span><input type="range" id="bright" min="10" max="100"><span></span></div>
 <div class="row"><span class="note">Climbers look like</span><div class="seg" id="style"><button data-v="auto">Automatic</button><button data-v="rope">Rope</button><button data-v="climber">Climber</button></div><span class="note">Automatic: a little climber on tracks 50 pixels tall or more, a rope on smaller ones</span></div>
 <div class="row"><span class="note">Track background</span><div class="seg" id="bg"><button data-v="dim">Dim lane colours</button><button data-v="off">Off</button></div></div>
</div>
<div class="card"><div class="ct">7 · Test and profiles</div>
 <div class="row"><label class="note">Test race with <select id="testN"><option>2</option><option>3</option><option>4</option><option>6</option><option>8</option></select> pretend players</label><button class="btn" id="test">▶ Test race</button>
  <label class="note">Finish in <select id="finCol"></select></label><button class="btn" id="fin">🌟 Test the finish</button><button class="btn" id="stop">⏹ Stop</button></div>
 <div class="note" id="testMsg"></div>
 <div class="row"><select id="prof" style="min-width:180px"></select><button class="btn" id="profLoad">Load</button><button class="btn" id="profDel">Delete</button>
  <input type="text" id="profName" placeholder="Profile name (e.g. Children)" maxlength="24"><button class="btn" id="profSave">Save as profile</button></div>
 <div class="note">Saving a profile also saves the settings above. Visitors see the race in 🎮 Games when "Race to the Star" is ticked under Games on the control page.</div>
</div>
</main>
<div id="bar"><button class="btn primary" id="save">Save the race settings</button><span class="note" id="saved"></span></div>
<script>
const $=id=>document.getElementById(id);
const post=(b)=>fetch('/api/race',{method:'POST',headers:{'X-Cube':'1'},body:JSON.stringify(b)}).then(r=>r.json());
let C=null,MODELS=[],GROUPS={},R=null;
function seg(id,v){[...$(id).children].forEach(b=>b.classList.toggle('sel',b.dataset.v===v));}
function segVal(id){const b=$(id).querySelector('.sel');return b?b.dataset.v:null;}
document.querySelectorAll('.seg').forEach(s=>s.addEventListener('click',e=>{if(e.target.dataset.v){seg(s.id,e.target.dataset.v);if(s.id==='difficulty')applyPreset(e.target.dataset.v);show();}}));
const PRE={easy:{target:25,slide:0.02,delay:2.0},normal:{target:35,slide:0.035,delay:1.2},hard:{target:45,slide:0.06,delay:0.6}};
function applyPreset(v){if(PRE[v]){$('target').value=PRE[v].target;$('slide').value=Math.round(PRE[v].slide*500);$('delay').value=Math.round(PRE[v].delay*10);labels();}}
function labels(){
 $('frontV').textContent=$('front').value+'%';
 document.querySelectorAll('.lvl').forEach(i=>i.nextElementSibling.textContent=i.value+' %');
 $('target').nextElementSibling.textContent=$('target').value+' s';
 $('slide').nextElementSibling.textContent=($('slide').value/5).toFixed(1)+' %/s';
 $('delay').nextElementSibling.textContent=($('delay').value/10).toFixed(1)+' s';
 $('max_time').nextElementSibling.textContent=$('max_time').value+' s';
 $('party').nextElementSibling.textContent=$('party').value+' s';
 $('bright').nextElementSibling.textContent=$('bright').value+' %';}
['front','target','slide','delay','max_time','party','bright'].forEach(id=>$(id).addEventListener('input',()=>{labels();if(['target','slide','delay'].includes(id))seg('difficulty','custom');}));
document.querySelectorAll('.lvl').forEach(i=>i.addEventListener('input',labels));
function show(){const t=segVal('track');$('splitBox').style.display=t==='split'?'flex':'none';$('eachBox').style.display=t==='each'?'flex':'none';$('cubeBox').style.display=t==='cube'?'flex':'none';
 $('frontRow').style.display=segVal('split')==='halves'?'grid':'none';}
function opts(sel,withGroups){sel.replaceChildren(...[['','— pick —']].concat(withGroups?Object.keys(GROUPS).sort().map(g=>['g:'+g,'Group: '+g+' ('+GROUPS[g].length+')']):[]).concat(MODELS.map(m=>['m:'+m,m])).map(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;return o;}));}
function expand(v){return v.startsWith('g:')?(GROUPS[v.slice(2)]||[]):v.startsWith('m:')?[v.slice(2)]:[];}
function chips(box,list){box.replaceChildren(...list.map((m,i)=>{const c=document.createElement('span');c.className='chip';c.textContent=m;const x=document.createElement('button');x.textContent='✕';x.onclick=()=>{list.splice(i,1);chips(box,list);};c.append(x);return c;}));
 if(!list.length){const n=document.createElement('span');n.className='note';n.textContent='Nothing yet.';box.append(n);}}
$('trackAdd').onclick=()=>{expand($('trackPick').value).forEach(m=>{if(!C.models.includes(m))C.models.push(m);});chips($('trackChips'),C.models);};
$('starAdd').onclick=()=>{expand($('starPick').value).forEach(m=>{if(!C.stars.includes(m))C.stars.push(m);});chips($('starChips'),C.stars);};
function drawPairs(){$('pairs').replaceChildren(...C.pairs.map((p,i)=>{const row=document.createElement('div');row.className='pair';
  const n=document.createElement('b');n.textContent=i+1;const a=document.createElement('select'),b=document.createElement('select');opts(a,true);opts(b,true);
  a.value=p.track.length===1?'m:'+p.track[0]:'';b.value=p.star.length===1?'m:'+p.star[0]:(p.star.length?'':'');
  if(p.track.length>1){const o=document.createElement('option');o.value='keep';o.textContent=p.track.length+' models';a.prepend(o);a.value='keep';}
  a.onchange=()=>{if(a.value!=='keep')p.track=expand(a.value);};b.onchange=()=>{p.star=expand(b.value);};
  const x=document.createElement('button');x.className='btn';x.textContent='✕';x.onclick=()=>{C.pairs.splice(i,1);drawPairs();};
  row.append(n,a,b,x);return row;}));
 if(!C.pairs.length){const n=document.createElement('div');n.className='note';n.textContent='No pairs yet: press "Pair automatically" or "+ Add a pair". Left: the track, right: its star.';$('pairs').append(n);}}
$('addPair').onclick=()=>{if(C.pairs.length<8){C.pairs.push({track:[],star:[]});drawPairs();}};
$('autoPair').onclick=()=>{const key=s=>s.toLowerCase().replace(/tree|star|mega|mini/g,'').replace(/[^a-z0-9]/g,'');
 const trees=MODELS.filter(m=>/tree/i.test(m)),stars=MODELS.filter(m=>/star/i.test(m));const out=[];
 trees.forEach(t=>{const k=key(t);const s=stars.find(x=>key(x)===k);if(s&&k&&out.length<8)out.push({track:[t],star:[s]});});
 if(!out.length){$('testMsg').textContent='No matching tree / star names found: add the pairs by hand.';return;}
 C.pairs=out;drawPairs();$('testMsg').textContent='Paired '+out.length+' tracks with their stars. Check them, then save.';};
function drawCols(){$('cols').replaceChildren(...C.colours.map((c,i)=>{const w=document.createElement('span');const inp=document.createElement('input');inp.type='color';inp.value='#'+c;
 inp.oninput=()=>{C.colours[i]=inp.value.slice(1);finCols();};w.append(inp);return w;}));finCols();}
function finCols(){$('finCol').replaceChildren(...C.colours.map((c,i)=>{const o=document.createElement('option');o.value=c;o.textContent='colour '+(i+1);o.style.background='#'+c;return o;}));}
function fill(){
 seg('track',C.track);seg('split',C.split);seg('dir',C.dir);seg('difficulty',C.difficulty);seg('bg',C.bg);seg('style',C.style||'auto');
 $('front').value=Math.round(C.front*100);
 document.querySelectorAll('.mode').forEach(c=>c.checked=C.modes.includes(c.value));
 ['mix','shared','early','catchup','leader','countdown','rainbow'].forEach(k=>$(k).checked=!!C[k]);
 ['min','max','lobby'].forEach(k=>$(k).value=C[k]);
 document.querySelectorAll('.lvl').forEach(i=>i.value=Math.round(C.levels[i.dataset.k]*100));
 $('target').value=C.target;$('slide').value=Math.round(C.slide*500);$('delay').value=Math.round(C.delay*10);$('max_time').value=C.max_time;$('party').value=C.party;$('bright').value=C.bright;
 chips($('trackChips'),C.models);chips($('starChips'),C.stars);drawPairs();drawCols();
 $('side').replaceChildren(...[['-1','All sides']].concat((R.sides||[]).map((n,i)=>[String(i),n])).map(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;return o;}));$('side').value=String(C.side);
 $('prof').replaceChildren(...(R.profiles.length?R.profiles:['']).map(n=>{const o=document.createElement('option');o.value=n;o.textContent=n||'(no profiles yet)';return o;}));
 labels();show();}
function gather(){return {track:segVal('track'),models:C.models,stars:C.stars,pairs:C.pairs.filter(p=>p.track.length),split:segVal('split'),front:$('front').value/100,dir:segVal('dir'),side:+$('side').value,
 modes:[...document.querySelectorAll('.mode:checked')].map(c=>c.value),mix:$('mix').checked,shared:$('shared').checked,min:+$('min').value,max:+$('max').value,colours:C.colours,lobby:+$('lobby').value,early:$('early').checked,
 levels:Object.fromEntries([...document.querySelectorAll('.lvl')].map(i=>[i.dataset.k,i.value/100])),catchup:$('catchup').checked,
 difficulty:segVal('difficulty'),target:+$('target').value,slide:$('slide').value/500,delay:$('delay').value/10,max_time:+$('max_time').value,
 leader:$('leader').checked,countdown:$('countdown').checked,rainbow:$('rainbow').checked,party:+$('party').value,bright:+$('bright').value,bg:segVal('bg'),style:segVal('style')};}
async function save(){const r=await post(Object.assign({a:'set'},gather()));C=r.cfg;$('saved').textContent='Saved.';setTimeout(()=>{$('saved').textContent='';},2500);return r;}
$('save').onclick=save;
$('test').onclick=async()=>{await save();const r=await post({a:'test',n:+$('testN').value});$('testMsg').textContent=r.ok?'Test race on the lights…':r.msg;};
$('fin').onclick=async()=>{await save();const r=await post({a:'finish',c:$('finCol').value});$('testMsg').textContent=r.ok?'The finish, on the lights…':r.msg;};
$('stop').onclick=()=>post({a:'stop'}).then(()=>{$('testMsg').textContent='Stopped.';});
$('profSave').onclick=async()=>{const n=$('profName').value.trim();if(!n)return;await save();R=await post({a:'psave',name:n});load(false);};
$('profLoad').onclick=async()=>{if(!$('prof').value)return;await post({a:'pload',name:$('prof').value});load(true);};
$('profDel').onclick=async()=>{if(!$('prof').value||!confirm('Delete the profile '+$('prof').value+'?'))return;await post({a:'pdel',name:$('prof').value});load(false);};
async function load(full){R=await (await fetch('/api/race')).json();if(full||!C){C=R.cfg;fill();}
 else{$('prof').replaceChildren(...(R.profiles.length?R.profiles:['']).map(n=>{const o=document.createElement('option');o.value=n;o.textContent=n||'(no profiles yet)';return o;}));}}
async function models(){try{const r=await (await fetch('/api/props-models',{method:'POST',headers:{'X-Cube':'1'},body:'{}'})).json();MODELS=(r.models||[]).map(x=>x.model).sort();GROUPS=r.groups||{};
 opts($('trackPick'),true);opts($('starPick'),true);if(C)drawPairs();if(!r.ok)$('testMsg').textContent='EZPlayer: '+(r.msg||'not answering')+' (only the cube track works without it).';}catch(e){}}
async function live(){try{const s=await (await fetch('/api/race')).json();const st=s.state;
 $('live').textContent=st.st==='idle'?'No race now':(st.test?'Test: ':'')+st.st+' · '+st.n+' player(s)'+(st.winner!=null&&st.st==='over'?' · winner '+(st.winner+1):'');}catch(e){}}
load(true).then(models);setInterval(live,1500);
</script></body></html>"""

XMAS_PAGE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ShowPlay · Advent calendar & Decorate the tree</title>
<style>
:root{--bg:#08140d;--card:#11241a;--raise:#1a3326;--line:#2a4a38;--fg:#fff;--muted:#b9d3c3;--hot:#ffc83c;--ok:#39d353}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:#08140dee;border-bottom:1px solid var(--line);padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
header h1{font-size:19px;margin:0}a{color:var(--muted)}.sp{flex:1}
main{max-width:980px;margin:0 auto;padding:14px;display:flex;flex-direction:column;gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px}
.ct{font-weight:800;font-size:14px;letter-spacing:.06em;text-transform:uppercase;color:var(--hot)}.note{font-size:13px;color:var(--muted)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.btn{min-height:42px;padding:8px 14px;border-radius:12px;border:1px solid var(--line);background:var(--raise);color:var(--fg);font:inherit;font-weight:700;cursor:pointer}
.btn.primary{background:var(--hot);border-color:var(--hot);color:#1a1200}
select,input[type=text],input[type=number]{min-height:40px;padding:6px 10px;border-radius:10px;border:1px solid var(--line);background:var(--raise);color:var(--fg);font:inherit}
input[type=number]{width:90px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:var(--raise);border:1px solid var(--line);font-size:13px}
.chip button{border:0;background:none;color:var(--muted);cursor:pointer;font-size:14px}
label.ck{display:inline-flex;gap:8px;align-items:center}input[type=checkbox]{width:20px;height:20px;accent-color:var(--hot)}
.doors{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:8px}
.door{display:grid;grid-template-columns:30px 132px minmax(0,1fr);gap:6px;align-items:center;background:var(--raise);border:1px solid var(--line);border-radius:12px;padding:6px}
.door b{text-align:center}.door select,.door input{width:100%;min-width:0;min-height:36px}
.door.today{border-color:var(--hot)}
svg{background:#061009;border-radius:12px;max-width:260px}
</style></head><body>
<header><h1>📅 Advent calendar & 🎄 Decorate the tree</h1><span class="sp"></span><a href="/">Control page</a><a href="/race">Race</a><a href="/mixer">Mixer</a></header>
<main>
<div class="card"><div class="ct">📅 Advent calendar</div>
 <div class="note">From the first day, one more door opens every day on the visitors' page (📅 Advent tab). Tapping an open door shows its surprise on the lights: an effect or a message on the cube, or a game that opens on the phone. Doors not open yet stay a surprise.</div>
 <label class="ck"><input type="checkbox" id="aOn"> Show the advent calendar to visitors</label>
 <label class="ck"><input type="checkbox" id="aUnlock"> A game door unlocks its game: the game appears under 🎮 Games only from the day of its door</label>
 <div class="row"><span class="note">First day</span><input type="number" id="aFirst" min="1" max="28"><select id="aMonth"></select><span class="note">Doors</span><input type="number" id="aDays" min="1" max="24"></div>
 <div class="row"><span class="note">Test: pretend today is door</span><input type="number" id="aTest" min="0" max="24"><span class="note">(0 = the real date). Today: <b id="aToday"></b></span></div>
 <div class="row"><button class="btn" id="aDefault">Fill with the default surprises</button></div>
 <div class="doors" id="doors"></div>
 <div class="row"><button class="btn primary" id="aSave">Save the calendar</button><span class="note" id="aSaved"></span></div>
</div>
<div class="card"><div class="ct">🎄 Decorate the tree</div>
 <div class="note">Visitors hang baubles on a tree of the show (🎄 Tree tab): each phone picks a free spot and a colour. The decorated tree shows on the lights for a while after each new bauble (or all the time). Any models work: a mega tree, a matrix, a group of mini trees…</div>
 <label class="ck"><input type="checkbox" id="tOn"> Let visitors decorate the tree</label>
 <div class="row"><select id="tPick" style="min-width:260px"></select><button class="btn" id="tAdd">Add to the tree</button></div>
 <div class="row" id="tChips"></div>
 <div class="row"><span class="note">Baubles</span><input type="number" id="tSpots" min="8" max="60"><span class="note">Each phone waits</span><input type="number" id="tEvery" min="0" max="600"><span class="note">s between baubles</span></div>
 <div class="row"><span class="note">Show the tree for</span><input type="number" id="tShow" min="10" max="300"><span class="note">s after each new bauble</span><label class="ck"><input type="checkbox" id="tAlways"> All the time</label></div>
 <div class="row"><span class="note">Brightness</span><input type="number" id="tBright" min="10" max="100"><span class="note">%</span><span class="note">Tree between the baubles</span><select id="tBg"><option value="green">Dim green</option><option value="off">Off</option></select></div>
 <label class="ck"><input type="checkbox" id="tRestart"> When the tree is full: a party on the lights, then it starts again empty</label>
 <div class="row"><svg id="tSvg" viewBox="0 0 100 120" width="220" height="264"></svg><div class="note" id="tInfo" style="max-width:420px"></div></div>
 <div class="row"><button class="btn primary" id="tSave">Save the tree</button><button class="btn" id="tShowNow">Show it on the lights now</button><button class="btn" id="tClear">Take all the baubles off</button><span class="note" id="tSaved"></span></div>
</div>
</main>
<script>
const $=id=>document.getElementById(id);
const post=b=>fetch('/api/xmas',{method:'POST',headers:{'X-Cube':'1'},body:JSON.stringify(b)}).then(r=>r.json());
let X=null,MODELS=[],GROUPS={},TM=[];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
$('aMonth').replaceChildren(...MONTHS.map((m,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent=m;return o;}));
function doorRow(i,d){const r=document.createElement('div');r.className='door'+(X.today===i+1?' today':'');const n=document.createElement('b');n.textContent=i+1;
 const k=document.createElement('select');[['fx','✨ Effect'],['text','💬 Message'],['game','🎮 Game']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;k.append(o);});k.value=d.k;
 const box=document.createElement('div');
 const draw=()=>{box.replaceChildren();let el;
  if(k.value==='text'){el=document.createElement('input');el.type='text';el.maxLength=30;el.value=d.k==='text'?d.t:'Merry Christmas!';el.oninput=()=>{d.t=el.value;};d.t=el.value;}
  else{el=document.createElement('select');const list=k.value==='fx'?X.fx:X.games;list.forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;el.append(o);});
   const cur=k.value==='fx'?d.e:d.g;if(cur&&list.some(x=>x[0]===cur))el.value=cur;el.onchange=()=>{if(k.value==='fx')d.e=el.value;else d.g=el.value;};if(k.value==='fx')d.e=el.value;else d.g=el.value;}
  box.append(el);};
 k.onchange=()=>{d.k=k.value;draw();};draw();r.append(n,k,box);return r;}
function drawDoors(){$('doors').replaceChildren(...X.advent.doors.map((d,i)=>doorRow(i,d)));}
function opts(sel){sel.replaceChildren(...[['','— pick —']].concat(Object.keys(GROUPS).sort().map(g=>['g:'+g,'Group: '+g+' ('+GROUPS[g].length+')'])).concat(MODELS.map(m=>['m:'+m,m])).map(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;return o;}));}
function expand(v){return v.startsWith('g:')?(GROUPS[v.slice(2)]||[]):v.startsWith('m:')?[v.slice(2)]:[];}
function chips(){$('tChips').replaceChildren(...TM.map((m,i)=>{const c=document.createElement('span');c.className='chip';c.textContent=m;const x=document.createElement('button');x.textContent='✕';x.onclick=()=>{TM.splice(i,1);chips();};c.append(x);return c;}));
 if(!TM.length){const n=document.createElement('span');n.className='note';n.textContent='No models yet.';$('tChips').append(n);}}
$('tAdd').onclick=()=>{expand($('tPick').value).forEach(m=>{if(!TM.includes(m))TM.push(m);});chips();};
function drawTree(st){const s=$('tSvg');s.replaceChildren();if(!st||!st.on){$('tInfo').textContent=X.tree.models.length?'Save to see the spots (EZPlayer must be connected).':'Pick the models of the tree.';return;}
 const ns='http://www.w3.org/2000/svg',P=(u,v)=>[10+u*80,112-v*104];
 const poly=document.createElementNS(ns,'polygon');poly.setAttribute('points',st.ol.map(([u,v])=>P(u,v).join(',')).join(' '));poly.setAttribute('fill','#0f3b1f');s.append(poly);
 st.sp.forEach(([u,v],i)=>{const c=document.createElementNS(ns,'circle');const [x,y]=P(u,v);c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',3.2);
  const o=st.o[i];c.setAttribute('fill',o==='0'?'none':'#'+st.cols[+o-1]);c.setAttribute('stroke',o==='0'?'#6a8':'#fff');c.setAttribute('stroke-width','0.6');s.append(c);});
 const n=st.sp.length,used=n-[...st.o].filter(c=>c==='0').length;$('tInfo').textContent=used+' of '+n+' baubles hung. The spots are spread evenly over the tree\'s pixels.';}
function fill(){const a=X.advent,t=X.tree;$('aOn').checked=a.on;$('aUnlock').checked=a.unlock;$('aFirst').value=a.first;$('aMonth').value=a.month;$('aDays').value=a.days;$('aTest').value=a.test_day;
 $('aToday').textContent=X.today===0?'not open yet':X.today>a.days?'all doors open':'door '+X.today;drawDoors();
 $('tOn').checked=t.on;TM=t.models.slice();chips();$('tSpots').value=t.spots;$('tEvery').value=t.every;$('tShow').value=t.show;$('tAlways').checked=t.always;$('tBright').value=t.bright;$('tBg').value=t.bg;$('tRestart').checked=t.restart;drawTree(X.treeState);}
async function load(){X=await (await fetch('/api/xmas')).json();fill();}
$('aSave').onclick=async()=>{X=await post({a:'advent',on:$('aOn').checked,unlock:$('aUnlock').checked,first:+$('aFirst').value,month:+$('aMonth').value,days:+$('aDays').value,test_day:+$('aTest').value,doors:X.advent.doors});fill();$('aSaved').textContent='Saved.';setTimeout(()=>{$('aSaved').textContent='';},2500);};
$('aDefault').onclick=async()=>{X=await post({a:'advent-default'});fill();};
$('tSave').onclick=async()=>{X=await post({a:'tree',on:$('tOn').checked,models:TM,spots:+$('tSpots').value,every:+$('tEvery').value,show:+$('tShow').value,always:$('tAlways').checked,bright:+$('tBright').value,bg:$('tBg').value,restart:$('tRestart').checked});fill();$('tSaved').textContent=X.msg||'Saved.';setTimeout(()=>{$('tSaved').textContent='';},4000);};
$('tShowNow').onclick=async()=>{X=await post({a:'tree-show'});fill();$('tSaved').textContent='On the lights for '+X.tree.show+' s.';};
$('tClear').onclick=async()=>{if(!confirm('Take all the baubles off the tree?'))return;X=await post({a:'tree-clear'});fill();};
async function models(){try{const r=await (await fetch('/api/props-models',{method:'POST',headers:{'X-Cube':'1'},body:'{}'})).json();MODELS=(r.models||[]).map(x=>x.model).sort();GROUPS=r.groups||{};opts($('tPick'));}catch(e){}}
load().then(models);
</script></body></html>"""


def xmas_info(msg=""):
    return {"advent": advent_cfg(), "today": advent_day(), "tree": tree_cfg(), "treeState": tree_state(),
            "fx": [[k, n] for k, n in FX_LIST.get(S.get("theme") if S.get("theme") in FX_LIST else "xm", FX_LIST["xm"])],
            "games": [[g, GAME_NAMES[g]] for g in GAMES if g != "pong"], "msg": msg}


URL_RE = re.compile(r"https?://[A-Za-z0-9.\-]+(:\d{1,5})?/?")
HOST_RE = re.compile(r"[A-Za-z0-9.\-]{1,63}")


def clean_face(f, problems, n):
    """checks one side from the control page; returns (side, ok)"""
    if not isinstance(f, dict):
        return None, False
    out = "ezp" if f.get("out") == "ezp" else "ddp"
    w, h = f.get("w"), f.get("h")
    if not (isint(w) and isint(h) and 1 <= w <= FACE_MAX and 1 <= h <= FACE_MAX):
        problems.append("side %d: the size must be 1 to %d" % (n + 1, FACE_MAX))
        return None, False
    g = {"n": str(f.get("n", ""))[:20], "out": out, "w": w, "h": h}
    if out == "ezp":
        if not isinstance(f.get("model"), str) or not f["model"]:
            problems.append("side %d: choose an EZPlayer model" % (n + 1))
            return None, False
        g["model"] = f["model"][:80]
    else:
        ip = str(f.get("ip", "")).strip()
        if not HOST_RE.fullmatch(ip):
            problems.append("side %d: type the board's IP address" % (n + 1))
            return None, False
        g.update(ip=ip, start=f["start"] if isint(f.get("start")) and 1 <= f["start"] <= 100000 else 1,
                 corner=f.get("corner") if f.get("corner") in ("tl", "tr", "bl", "br") else "tl",
                 dir="cols" if f.get("dir") == "cols" else "rows", zig=f.get("zig") is not False)
    return g, True


groups_cache = {}


def prepare_props():
    """reads the pixel positions of the props' models ahead of time, so the first request starts quickly"""
    for pi in range(len(S.get("props", []))):
        try:
            g = prop_geometry(pi)
            log("prop ready: %s (%d model(s), %d pixels)" % (S["props"][pi]["n"], len(g), sum(x.n for x in g)))
        except Exception as e:
            log("prop %s not ready: %s" % (S["props"][pi]["n"], e))


def probe(ip):
    """a WLED board at this address? (name, LED count, matrix size)"""
    try:
        with urllib.request.urlopen("http://%s/json/info" % ip, timeout=0.8) as r:
            i = json.loads(r.read())
        if not isinstance(i, dict) or "ver" not in i:
            return None
        leds = i.get("leds") or {}
        mx = leds.get("matrix") or {}
        return {"ip": ip, "name": str(i.get("name", ip))[:40], "leds": leds.get("count", 0), "w": mx.get("w", 0), "h": mx.get("h", 0)}
    except Exception:
        return None


def scan():
    from concurrent.futures import ThreadPoolExecutor
    base = my_ip().rsplit(".", 1)[0]
    with ThreadPoolExecutor(64) as ex:
        found = [x for x in ex.map(probe, ["%s.%d" % (base, n) for n in range(1, 255)]) if x]
    log("network search: %d WLED board(s) found" % len(found))
    return found


def identify_rgb(w, h):
    """red top row, green left column and a white arrow pointing up"""
    img = bytearray(w * h * 3)

    def put(x, y, c):
        if 0 <= x < w and 0 <= y < h:
            img[(y * w + x) * 3:(y * w + x) * 3 + 3] = bytes(c)
    cx = w // 2
    top, bot = max(1, h // 5), h - 1 - max(1, h // 6)
    for y in range(top, bot + 1):
        put(cx, y, (255, 255, 255))
        if w >= 8:
            put(cx - 1, y, (255, 255, 255))
    for k in range(max(2, min(w, h) // 4)):
        for dx in (-k, k):
            put(cx + dx, top + k, (255, 255, 255))
            if w >= 8:
                put(cx - 1 + dx, top + k, (255, 255, 255))
    for y in range(h):
        put(0, y, (0, 255, 0))
    for x in range(w):
        put(x, 0, (255, 0, 0))
    return bytes(img)
PAGE_RE = re.compile(r"https://[A-Za-z0-9.\-]+(:\d{1,5})?(/[A-Za-z0-9._~\-/]*)?")


class Admin(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json"):
        b = body if isinstance(body, bytes) else (json.dumps(body) if ctype == "application/json" else body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return {}

    def do_GET(self):
        p = self.path.split("?")[0]
        if p in ("/", "/index.html"):
            return self.send(200, ADMIN, "text/html")
        if p in ("/mixer", "/keys"):
            return self.send(200, MIXER, "text/html")
        if p == "/race":
            return self.send(200, RACE_PAGE, "text/html")
        if p == "/xmas":
            return self.send(200, XMAS_PAGE, "text/html")
        if p == "/api/xmas":
            return self.send(200, xmas_info())
        if p == "/api/race":
            r = game.all["race"]
            return self.send(200, {"cfg": race_cfg(), "state": r.state(), "profiles": sorted(S.get("race_profiles") or {}),
                                   "sides": [face_name(i) for i in range(len(S["faces"]))], "ezpOk": ezp_state["ok"]})
        if p == "/api/mixer":
            return self.send(200, mix_state())
        if p == "/api/midi":
            return self.send(200, midi_state())
        if p == "/api/sing":
            st = sing_state()
            st.update(singers=[{"k": k, "n": n, "e": e, "kind": kind, "on": on} for k, n, e, kind, on in sing_list()],
                      sing=bool(S.get("sing")), approve=bool(S.get("sing_approve")), volume=S.get("sing_volume", 100),
                      device=S.get("sing_device", ""), devices=audio_devices(), delay=S.get("sing_delay", 0.15),
                      props=bool(S.get("sing_props", True)), cube=bool(S.get("sing_cube", True)), loading=SING["loading"],
                      found=len(SING["faces"]), ezpOk=ezp_state["ok"], os="windows" if os.name == "nt" else "mac" if sys.platform == "darwin" else "linux",
                      pending=[{"id": x["id"], "who": x["who"], "ago": int(time.time() - x["at"])} for x in SING["pending"]])
            return self.send(200, st)
        if p == "/api/sing/audio":
            sid = self.path.split("id=", 1)[-1][:16]
            it = next((x for x in SING["pending"] if x["id"] == sid), None)
            if not it:
                return self.send(404, {"error": "?"})
            try:
                data = fetch(it["url"], limit=SING_MAX_BYTES + 1, timeout=20)
            except Exception:
                return self.send(404, {"error": "?"})
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if p == "/api/invaders":
            st = game.all["invaders"].state()
            st["busy"] = game.cur.CODE != "invaders" and game.cur.st not in ("idle", "over")
            st["busyName"] = game.cur.NAME if st["busy"] else ""
            st["visitor"] = game.cur.CODE == "invaders" and st["mode"] == "visitor" and st["st"] in ("ready", "playing")
            st["sides"] = [face_name(i) for i in range(len(S["faces"]))]
            return self.send(200, st)
        if p == "/api/pong":
            st = game.all["pong"].state()
            st["busy"] = (game.cur.CODE != "pong" and game.cur.st not in ("idle", "over")) or (st["mode"] == "visitor" and st["st"] == "playing")
            st["busyName"] = ("Pong (a visitor)" if game.cur.CODE == "pong" else game.cur.NAME) if st["busy"] else ""
            st["sides"] = [face_name(i) for i in range(len(S["faces"]))]
            return self.send(200, st)
        if p == "/api/keys":
            if S.get("props") and ezp_state["ok"] and not key_geoms:
                threading.Thread(target=keys_prepare, daemon=True).start()
            return self.send(200, keys_state())
        if p == "/api/state":
            with lock:
                return self.send(200, dict(S, version=VERSION, ezpOk=ezp_state["ok"], ezpMsg=ezp_state["msg"], ntfy=poster.state(),
                                           urls={t: qr_url(t) for t in ("hw", "xm", "ev")}, log=logs[-40:], now=now_showing["what"],
                                           queue=jobs.qsize() + len(waiting),
                                           pending=[{k: v for k, v in x.items() if k != "idx"} for x in pending]))
        self.send(404, {"error": "?"})

    def do_POST(self):
        # only the control page sends this header (another website open on the home network cannot)
        if self.headers.get("X-Cube") != "1":
            return self.send(403, {"error": "forbidden"})
        p, b = self.path, self.body()
        if p == "/api/mixer":
            return self.send(200, {"ok": mix_action(b)})
        if p == "/api/keys":
            return self.send(200, {"ok": keys_action(b)})
        if p == "/api/midi":
            return self.send(200, {"ok": midi_action(b)})
        if p == "/api/race":
            a, r = b.get("a"), game.all["race"]
            if a == "set":
                with lock:
                    S["race"] = race_clean(b)
                    save()
                return self.send(200, {"ok": True, "cfg": race_cfg()})
            if a in ("test", "finish"):
                if game.cur is not r and game.cur.st not in ("idle", "over"):
                    return self.send(200, {"ok": False, "msg": "visitors are playing " + game.cur.NAME})
                if game.cur is not r:
                    with game.cur.lock:
                        game.cur.reset()
                    game.cur = r
                if a == "test":
                    why = r.start_test(b.get("n", 2) if isint(b.get("n")) else 2)
                    return self.send(200, {"ok": not why, "msg": why})
                with r.lock:
                    if r.st in ("lobby", "countdown", "race") and not r.test:
                        return self.send(200, {"ok": False, "msg": "a race is on"})
                    r.reset()
                    r.test = True
                    c = b.get("c") if b.get("c") in r.cfg["colours"] else r.cfg["colours"][0]
                    r.add_player("t" * 16, "test00", 0, c, "tap", "adult")
                    r.players[0]["h"] = 1.0
                    r.finish(0, "test")
                    r.until = time.time() + min(6, r.cfg["party"])
                return self.send(200, {"ok": True})
            if a == "stop":
                with r.lock:
                    if r.test:
                        r.reset()
                    elif r.st in ("lobby", "countdown", "race"):
                        r.finish(None, "stopped by the crew")
                return self.send(200, {"ok": True})
            if a in ("psave", "pload", "pdel"):
                name = str(b.get("name", "")).strip()[:24]
                with lock:
                    prof = dict(S.get("race_profiles") or {})
                    if a == "psave" and name:
                        prof[name] = race_cfg()
                    elif a == "pload" and name in prof:
                        S["race"] = dict(prof[name])
                    elif a == "pdel":
                        prof.pop(name, None)
                    S["race_profiles"] = prof
                    save()
                return self.send(200, {"ok": True, "cfg": race_cfg(), "state": r.state(), "profiles": sorted(prof), "sides": [face_name(i) for i in range(len(S["faces"]))]})
            return self.send(200, {"ok": False})
        if p == "/api/xmas":
            a, msg = b.get("a"), ""
            with lock:
                if a == "advent":
                    S["advent"] = advent_clean(b)
                elif a == "advent-default":
                    c = advent_cfg()
                    c["doors"] = None
                    S["advent"] = c
                elif a == "tree":
                    old = tree_cfg()
                    S["tree"] = tree_clean(b)
                    if (old["models"], old["spots"]) != (S["tree"]["models"], S["tree"]["spots"]):
                        TREE["orn"], S["tree_orn"] = "", ""          # new spots: the baubles start again
                        TREE["v"] += 1
                elif a == "tree-show":
                    TREE["show_until"] = time.time() + tree_cfg()["show"]
                elif a == "tree-clear":
                    TREE["orn"], S["tree_orn"] = "", ""
                    TREE["v"] += 1
                save()
            if a == "tree" and S["tree"]["on"] and S["tree"]["models"]:
                try:
                    msg = "Saved: %d spots on the tree." % len(tree_shape().spots) if tree_shape() else "Saved, but the tree's models could not be read (is EZPlayer connected?)."
                except Exception as e:
                    msg = "Saved, but the tree could not be read: %s" % e
            if a in ("advent", "advent-default", "tree", "tree-clear"):
                threading.Thread(target=publish_status, daemon=True).start()
            return self.send(200, xmas_info(msg))
        if p == "/api/sing":
            a = b.get("a")
            if a == "set":
                with lock:
                    for k in ("sing", "sing_approve", "sing_props", "sing_cube"):
                        if k in b:
                            S[k] = bool(b[k])
                    if b.get("sing_volume") in (25, 50, 75, 100):
                        S["sing_volume"] = b["sing_volume"]
                    if isinstance(b.get("sing_delay"), (int, float)) and 0 <= b["sing_delay"] <= 1.5:
                        S["sing_delay"] = float(b["sing_delay"])
                    if isinstance(b.get("sing_device"), str) and len(b["sing_device"]) < 120 and re.fullmatch(r"[\w:=,.\-]*", b["sing_device"]):
                        S["sing_device"] = b["sing_device"]
                    if isinstance(b.get("sing_off"), list):
                        S["sing_off"] = [str(x)[:120] for x in b["sing_off"]][:200]
                    if isinstance(b.get("sing_names"), dict):
                        S["sing_names"] = {str(k)[:120]: {"n": str(v.get("n", ""))[:28], "e": str(v.get("e", ""))[:4]}
                                           for k, v in list(b["sing_names"].items())[:200] if isinstance(v, dict)}
                    save()
                    SING["v"] += 1
                return self.send(200, {"ok": True})
            if a == "find":
                SING["faces_ver"] = None
                threading.Thread(target=sing_faces_load, daemon=True).start()
                return self.send(200, {"ok": True})
            if a == "test":
                def test():
                    import tempfile
                    fd, path = tempfile.mkstemp(suffix=".wav", prefix="showplay-test-")
                    os.close(fd)
                    try:
                        sing_test_wav(path)
                        play_audio(path)
                        log("sing: test sound played")
                    finally:
                        try:
                            os.remove(path)
                        except OSError:
                            pass
                threading.Thread(target=test, daemon=True).start()
                return self.send(200, {"ok": True})
            if a in ("approve", "reject"):
                with lock:
                    it = next((x for x in SING["pending"] if x["id"] == b.get("id")), None)
                    if it:
                        SING["pending"].remove(it)
                        if a == "approve":
                            SING["queue"].append(it)
                        SING["v"] += 1
                return self.send(200, {"ok": bool(it)})
            return self.send(200, {"ok": False})
        if p == "/api/invaders":
            a, g = b.get("a"), game.all["invaders"]
            if a == "start":
                why = game.start_crew("invaders", "crew", b.get("z", -1))
                return self.send(200, {"ok": not why, "msg": why})
            if a == "move":
                x, d = b.get("x"), b.get("d")
                g.crew_move(x=x if isinstance(x, (int, float)) and not isinstance(x, bool) else None, d=d if isint(d) else None)
                return self.send(200, {"ok": True})
            if a == "fire":
                g.crew_fire()
                return self.send(200, {"ok": True})
            if a == "stop":
                g.stop()
                return self.send(200, {"ok": True})
            return self.send(200, {"ok": False})
        if p == "/api/pong":
            a = b.get("a")
            if a == "start":
                why = game.start_pong(b.get("mode"), b.get("z", -1))
                return self.send(200, {"ok": not why, "msg": why})
            if a == "pad" and b.get("p") in (0, 1) and isinstance(b.get("v"), (int, float)):
                game.all["pong"].set_pad(b["p"], b["v"])
                return self.send(200, {"ok": True})
            if a == "stop":
                game.all["pong"].stop()
                return self.send(200, {"ok": True})
            return self.send(200, {"ok": False})
        if p == "/api/models":   # read the models from EZPlayer (with the address typed on the page, not saved yet)
            ezp = str(b.get("ezp") or S["ezp"]).strip()
            if not URL_RE.fullmatch(ezp):
                return self.send(200, {"ok": False, "targets": [], "msg": "invalid address"})
            old = S["ezp"]
            S["ezp"] = ezp.rstrip("/")
            t = ezp_targets()
            ok, msg = ezp_state["ok"], ezp_state["msg"]
            S["ezp"] = old
            return self.send(200, {"ok": ok, "targets": t, "msg": msg})
        if p == "/api/settings":
            with lock:
                if b.get("fps") in (10, 15, 20):
                    S["fps"] = b["fps"]
                if b.get("cpu_level") in ("easy", "normal", "hard"):
                    S["cpu_level"] = b["cpu_level"]
                if b.get("play_secs") in (20, 30, 45, 60):
                    S["play_secs"] = b["play_secs"]
                if isinstance(b.get("play_props"), list):
                    S["play_props"] = [i for i in b["play_props"] if isint(i) and 0 <= i < 64]
                if isinstance(b.get("game_list"), list):
                    S["game_list"] = [g for g in GAMES if g in b["game_list"]]
                for k in ("on", "approve", "free", "hold", "wait_turn", "games", "play"):
                    if k in b:
                        S[k] = bool(b[k])
                ezp = str(b.get("ezp", "")).strip()
                if ezp and URL_RE.fullmatch(ezp):
                    S["ezp"] = ezp.rstrip("/")
                if "title" in b:
                    S["title"] = str(b["title"]).strip()[:40]
                if "page" in b:
                    page = str(b["page"]).strip()
                    if page == "" or PAGE_RE.fullmatch(page):
                        S["page"] = page
                problems = []
                if isinstance(b.get("faces"), list):
                    fs = []
                    for n, f in enumerate(b["faces"][:8]):
                        f, ok = clean_face(f, problems, n)
                        if ok:
                            fs.append(f)
                    if fs != S["faces"]:
                        S["faces"] = fs
                        reset_flag.set()
                        mix_reset(); keys_reset()
                        with lock:
                            active.clear()
                if isinstance(b.get("props"), list):
                    ps = []
                    for p in b["props"][:12]:
                        if not isinstance(p, dict) or not isinstance(p.get("models"), list):
                            continue
                        ms = [m[:80] for m in p["models"][:64] if isinstance(m, str) and m]
                        name = str(p.get("n", "")).strip()[:24]
                        if not ms or not name:
                            problems.append("prop %s: give it a name and at least one model" % (name or len(ps) + 1))
                            continue
                        ps.append({"n": name, "e": str(p.get("e", ""))[:4], "models": ms, "across": bool(p.get("across"))})
                    if ps != S.get("props"):
                        S["props"] = ps
                        prop_geoms.clear()
                        mix_reset(); keys_reset()
                        threading.Thread(target=prepare_props, daemon=True).start()
                if b.get("theme") in ("hw", "xm", "ev", ""):
                    S["theme"] = b["theme"]
                if isint(b.get("wait")) and 0 <= b["wait"] <= 600:
                    S["wait"] = b["wait"]
                if isinstance(b.get("seconds"), dict):
                    for k in ("text", "gif", "draw", "fx", "prop"):
                        v = b["seconds"].get(k)
                        if isint(v) and 3 <= v <= 300:
                            S["seconds"][k] = v
                save()
            log("settings saved" + (" (on)" if S["on"] else " (off)"))
            if not S["on"]:
                with lock:
                    pending.clear()
                while not jobs.empty():
                    jobs.get_nowait()
            threading.Thread(target=lambda: (uses_ezp() and ezp_targets(), publish_status()), daemon=True).start()
            return self.send(200, {"ok": True, "problems": problems})
        if p in ("/api/approve", "/api/reject"):
            with lock:
                item = next((x for x in pending if x["id"] == b.get("id")), None)
                if item:
                    pending.remove(item)
            if item and p == "/api/approve":
                enqueue(item["kind"], item["idx"], item["info"])
            return self.send(200, {"ok": bool(item)})
        if p == "/api/props-models":   # models and groups of the EZPlayer show, to make props from
            t = ezp_targets()
            groups = {}
            if t:
                try:
                    groups = groups_cache.get("g") if groups_cache.get("v") == ezp_state.get("layoutVersion") else None
                    if groups is None:
                        groups = groups_from_show()
                        groups_cache.update(v=ezp_state.get("layoutVersion"), g=groups)
                except Exception as e:
                    log("could not read the model groups:", e)
                    groups = {}
            return self.send(200, {"ok": bool(t), "msg": ezp_state["msg"], "models": [{"model": x["model"], "nodes": x["nodes"]} for x in t],
                                   "groups": groups})
        if p == "/api/try-prop":
            i = b.get("i")
            if isint(i) and 0 <= i < len(S.get("props", [])):
                job = check(json.dumps({"k": "prop", "i": i, "e": b.get("e", "flap"), "pal": b.get("pal", "rainbow"), "s": 1}))
                if job:
                    enqueue(*job)
                    return self.send(200, {"ok": True})
            return self.send(200, {"ok": False})
        if p == "/api/scan":
            return self.send(200, scan())
        if p == "/api/identify":   # a picture that shows which way up a side is
            i = b.get("i")
            if isint(i) and 0 <= i < len(S["faces"]):
                enqueue("ident", [i], {"where": face_name(i)})
                return self.send(200, {"ok": True})
            return self.send(200, {"ok": False})
        if p == "/api/test":   # the test may use any text
            job = check(json.dumps({"k": "text", "t": str(b.get("t", "Hello!"))[:40], "c": 3, "z": -1}), allow_free=True)
            if job:
                enqueue(*job)
            return self.send(200, {"ok": bool(job)})
        self.send(404, {"error": "?"})


def another_bridge():
    """the version of a ShowPlay bridge already answering on this computer's port, or "" (v23: only one at a time)"""
    try:
        with urllib.request.urlopen("http://127.0.0.1:%d/api/state" % PORT, timeout=2) as r:
            return str(json.loads(r.read()).get("version", "?"))
    except Exception:
        return ""


class OneServer(ThreadingHTTPServer):
    allow_reuse_address = os.name != "nt"     # on Windows this would let a second bridge share the port (v23)


if __name__ == "__main__":
    other = another_bridge()
    if other:
        print("Another ShowPlay bridge (%s) is already running on this computer, so this one stops.\n"
              "Use only one: autostart.bat starts a hidden one, start_bridge.bat starts one in a window.\n"
              "To restart, end python / pythonw in Task Manager (or Activity Monitor / kill) first." % other, flush=True)
        try:
            time.sleep(8)
        except KeyboardInterrupt:
            pass
        sys.exit(1)
    load()
    log("ShowPlay bridge %s - control page: http://%s:%d" % (VERSION, my_ip(), PORT))
    for target in (poster.run, tree_loop, show_loop, render_loop, listen, status_loop, ezp_watch, game_loop, mix_watch, midi_native, play_loop, sing_loop,
                   lambda: (time.sleep(3), ezp_targets() if S.get("props") else None, prepare_props())):
        threading.Thread(target=target, daemon=True).start()
    OneServer(("0.0.0.0", PORT), Admin).serve_forever()
