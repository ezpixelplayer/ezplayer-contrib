#!/usr/bin/env python3
# Light Cube — v6 (MerryOnCherry)
#
# Visitors scan a QR code on the wall and, on their phone, send a message, a picture, an effect or a drawing to a cube
# of LED matrices. The cube is independent: no xLights and no show player needed. This bridge draws each request and
# sends the pixels straight to the cube's controller over DDP (WLED, ESPixelStick or any DDP board). Each side of the
# cube is set up on the bridge's own control page (board IP, first LED, size and wiring).
#
#     phone ──► visitors' page ──► ntfy.sh ──► cube_bridge.py ──DDP──► controller of the cube
#
# Optional: a side can instead be a matrix model of an EZPlayer show; the bridge then sends it through EZPlayer's
# overlay API and the request shows on top of the sequence that is playing.
#
# Control page, on the home network:  http://<this-computer's-ip>:8099
# Uses only the Python 3 standard library (nothing to install). Start:  python cube_bridge.py
# Settings are kept in cube_config.json, next to this file.

import json, os, time, threading, queue, unicodedata, re, socket, secrets, struct, math, random, collections
import urllib.request, urllib.parse, urllib.error
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

VERSION = "v6"
PORT = 8099
RELAY = "https://ntfy.sh/"
CFG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cube_config.json")
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

S = {   # settings (kept in cube_config.json)
    "on": False,
    "topic": "",                       # the show code in the QR address (made once, on the first start)
    "title": "MerryOnCherry",          # the show's name, at the top of the visitors' page
    "page": "",                        # where the visitors' page is published, e.g. https://name.github.io/light-cube/
    "ezp": "http://127.0.0.1:3000",    # EZPlayer address, only for sides sent through EZPlayer (port of its web UI)
    "faces": [],          # sides of the cube, see FACE_KEYS: {"n": name for the visitors, "w", "h", "out": "ddp" or "ezp", ...}
    "end_dark": False,    # True = a side goes dark when its request ends; False = the board goes back to its own effect
    "seconds": {"text": 20, "gif": 12, "draw": 15, "fx": 180, "prop": 20}, "theme": "hw", "approve": False,
    "props": [],          # props visitors can light up (EZPlayer models): [{"n": name, "e": emoji, "models": [...], "across": bool}]
    "wait": 0,            # seconds between two requests from the same phone (0 = no wait)
    "hold": False,        # True = the last request stays on the lights until another arrives (time for photos)
    "wait_turn": False,   # False = a new request replaces what is on that side; True = it waits for the one before to end
    "free": True,         # True = free text (with a bad-word filter); False = ready messages only
    "games": True,        # True = visitors can play four in a row on the cube
    "cpu_level": "normal",   # the computer in four in a row: easy, normal or hard
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
    try:
        with open(CFG_FILE, encoding="utf-8") as f:
            S.update(json.load(f))
    except Exception:
        pass
    S["seconds"] = dict(sec, **S["seconds"])
    for f in S["faces"]:   # sides saved by v1-v3 were all EZPlayer models
        if "out" not in f:
            f["out"] = "ezp" if f.get("model") else "ddp"
    if not S["topic"]:
        S["topic"] = "cube-" + secrets.token_hex(6)   # the show code, made once
        save()


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
    return bool(S.get("props")) or any(f.get("out") == "ezp" for f in S["faces"])


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
        self.b = [0] * (C4_ROWS * C4_COLS)
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
            return {"g": "c4", "st": self.st, "id": self.id, "mode": self.mode, "tags": self.tags, "turn": self.turn, "n": self.n,
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
                log("game: four in a row against", "the computer" if mode == "cpu" else "a friend (waiting for them to join)")
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
                if self.st != "playing" or self.turn != me or n != self.n or not isint(c) or not 0 <= c < C4_COLS:
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
                self.play(c4_cpu_move(list(self.b), 2, S.get("cpu_level", "normal")))
            elif self.st == "waiting" and now > self.until:
                self.finish(0, "nobody joined")
            elif self.st == "playing" and now > self.until:
                self.finish(2 - self.turn if self.mode == "pvp" else 0, "time ran out")
            elif self.st == "over" and now > self.until:
                self.reset()


game = FourInARow()


def game_loop():
    """runs the game clock and posts the board for the phones (once per change, at most about one post a second)"""
    posted, fails = -1, 0
    while True:
        game.tick()
        if game.v != posted and S["topic"]:
            st = game.state()
            try:
                urllib.request.urlopen(urllib.request.Request(RELAY + S["topic"] + "-game", data=json.dumps(st).encode(),
                                                              headers={"Cache": "yes"}), timeout=10).read()
                posted, fails = st["v"], 0
            except Exception as e:
                fails += 1
                if fails in (1, 10):
                    log("could not post the game board:", e)
                time.sleep(min(10, 2 * fails))
            time.sleep(0.8)
        time.sleep(0.2)


class C4Anim(Anim):
    """the board on a side of the cube: 7 columns x 6 rows, a strip on top with the colour of whose turn it is"""
    def frame(self, t):
        w, h = self.w, self.h
        st = game
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
    key = (json.dumps(prop, sort_keys=True), ezp_state.get("layoutVersion"))
    if prop_geoms.get(pi, (None,))[0] == key:
        return prop_geoms[pi][1]
    tg = {t["model"]: t for t in (ezp_state["targets"] or ezp_targets())}
    geoms, raw = [], None
    for m in prop["models"]:
        t = tg.get(m)
        if not t:
            log("prop %s: model %s is not in the EZPlayer show" % (prop["n"], m))
            continue
        if t.get("w") and t.get("h"):   # a grid (matrix, tree): the bridge draws the grid, EZPlayer maps it
            w, h = t["w"], t["h"]
            if w * h > 40000:            # very big matrices are drawn smaller and EZPlayer enlarges them
                k = math.sqrt(40000 / (w * h))
                w, h = max(1, int(w * k)), max(1, int(h * k))
            u = [x / max(1, w - 1) for y in range(h) for x in range(w)]
            v = [1 - y / max(1, h - 1) for y in range(h) for x in range(w)]
            geoms.append(PropGeom(m, "grid", w * h, u, v, w, h))
            continue
        raw = raw or coords_raw()
        c = model_coords(raw, m)
        nodes = (c or {}).get("nodes") or []
        if not nodes or len(nodes) != t.get("nodes", len(nodes)):
            log("prop %s: no pixel positions for %s" % (prop["n"], m))
            continue
        xs, ys = [], []
        across = prop.get("across")
        for nd in nodes:
            k = (nd.get("coords") or [{}])[0]
            if not across and "bufX" in k:
                xs.append(float(k["bufX"])); ys.append(float(k["bufY"]))
            else:
                xs.append(float(k.get("wX", 0))); ys.append(float(k.get("wY", 0)))
        geoms.append([m, xs, ys])
    # positions to 0..1: each model on its own grid, or the whole prop together ("across")
    out = []
    allx = [x for g in geoms if isinstance(g, list) for x in g[1]]
    ally = [y for g in geoms if isinstance(g, list) for y in g[2]]
    for g in geoms:
        if not isinstance(g, list):
            out.append(g)
            continue
        m, xs, ys = g
        bx, by = (allx, ally) if prop.get("across") else (xs, ys)
        x0, x1, y0, y1 = min(bx), max(bx), min(by), max(by)
        u = [(x - x0) / ((x1 - x0) or 1) for x in xs]
        v = [(y - y0) / ((y1 - y0) or 1) for y in ys]
        out.append(PropGeom(m, "nodes", len(xs), u, v))
    prop_geoms[pi] = (key, out)
    return out


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
    if isinstance(m, dict) and m.get("k") == "game":   # game moves: checked by the game itself (whose turn, which game)
        if not S.get("games") or m.get("g") != "c4":
            return
        why = game.msg(m)
        if why and m.get("a") != "move":
            log("game request refused:", why)
        return
    job = check(msg, att=att)
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
    body = {"model": model, "format": fmt, "blend": "replace", "ttlMs": 8000, "name": "Light Cube: " + name}
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
                if i not in game_anims or (game_anims[i]["anim"].w, game_anims[i]["anim"].h) != (f["w"], f["h"]):
                    game_anims[i] = {"anim": C4Anim(f["w"], f["h"]), "t0": t0}
                items.append((i, game_anims[i]))
        else:
            game_anims.clear()
        live = {i for i, _ in items}
        for i, a in items:
            if i >= PROP_BASE:   # a prop: one overlay for each of its models
                try:
                    payloads = a["anim"].frames(t0 - a["t0"])
                except Exception as e:
                    log("drawing error:", e)
                    continue
                for g, buf in zip(a["anim"].geoms, payloads):
                    k = (i, g.model)
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
        for k in [k for k in list(leases) if (k[0] if isinstance(k, tuple) else k) not in live]:
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
        time.sleep(max(0.005, 1 / FPS - (time.time() - t0)))


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
        gs = set(game.sides())
        for i in gs:   # a side with a game on it shows the game; requests for it wait
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
        now_showing["what"] = " · ".join([shown[i] for i in sorted(shown)] + (["four in a row (%s)" % game.st] if gs else []))
        if not started:
            time.sleep(0.2)


# ---------------------------------------------------------------------------- internet channel ----
def publish_status():
    """the visitors' page reads this to know whether requests are on, the sides and their sizes"""
    try:
        on = bool(S["on"] and (S["faces"] or (S.get("props") and ezp_state["ok"])) and
                  (ezp_state["ok"] or not any(f.get("out") == "ezp" for f in S["faces"])))
        body = json.dumps({"on": on, "faces": [{"n": f.get("n", ""), "w": f["w"], "h": f["h"]} for f in S["faces"]],
                           "theme": S["theme"], "free": S["free"], "wait": S["wait"], "title": S.get("title", ""), "games": bool(S.get("games")),
                           "props": [{"n": p["n"], "e": p.get("e", "")} for p in S.get("props", [])] if ezp_state["ok"] else [],
                           "at": int(time.time())}).encode()
        urllib.request.urlopen(urllib.request.Request(RELAY + S["topic"] + "-status", data=body, headers={"Cache": "yes"}), timeout=10).read()
    except Exception as e:
        log("could not post the status for the visitors' page:", e)


def status_loop():
    while True:
        publish_status()
        time.sleep(1800)


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


# ------------------------------------------------------------------------------------ control page ----
ADMIN = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Light Cube</title>
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
<h1>Light Cube</h1>
<div class="card">
  <label class="big"><input type="checkbox" id="on"> Show the visitors' requests</label>
  <div class="note" id="state"></div>
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
  <label for="page">Address where the visitors' page is published (for example https://your-name.github.io/light-cube/)</label>
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
  <label class="big" style="font-size:16px"><input type="checkbox" id="games"> Let visitors play Four in a Row on the cube</label>
  <div class="note">Two visitors play each other from their phones, or one plays the computer. While a game is on, that side shows the board and other requests for it wait.</div>
  <label for="cpuLevel">The computer plays</label>
  <select id="cpuLevel"><option value="easy">Easy (good for small children)</option><option value="normal">Normal</option><option value="hard">Hard</option></select>
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
function render(){
 $('on').checked=st.on;
 $('state').innerHTML=(st.on&&st.faces.length?'<span class="pill on">ON</span> Requests show on the cube ('+st.faces.length+' side(s)).':'<span class="pill off">OFF</span> Visitors\' requests do not show.')+(st.faces.some(f=>f.out==='ezp')?'<br>EZPlayer: '+st.ezpMsg:'')+'<br>bridge '+st.version;
 if(!editing){sides=JSON.parse(JSON.stringify(st.faces));drawSides();props=JSON.parse(JSON.stringify(st.props||[]));drawProps();$('sProp').value=st.seconds.prop||20;
  $('ezp').value=st.ezp;$('title').value=st.title||'';$('page').value=st.page||'';
  $('free').checked=st.free;$('theme').value=st.theme;$('sText').value=st.seconds.text;$('sGif').value=st.seconds.gif;$('sDraw').value=st.seconds.draw;$('sFx').value=st.seconds.fx||180;$('wait').value=st.wait||0;$('hold').checked=!!st.hold;$('endDark').checked=!!st.end_dark;$('waitTurn').checked=!!st.wait_turn;$('approve').checked=st.approve;$('games').checked=!!st.games;$('cpuLevel').value=st.cpu_level||'normal';}
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
['ezp','title','page','sText','sGif','sDraw','sFx','wait','theme','approve','free','hold','endDark','waitTurn','games','cpuLevel','sProp'].forEach(id=>{const e=$(id);e.addEventListener('focus',()=>editing=true);e.addEventListener('input',()=>editing=true);e.addEventListener('change',()=>editing=true);});
async function saveAll(){
 const r=await api('settings',{ezp:$('ezp').value.trim(),title:$('title').value.trim(),page:$('page').value.trim(),faces:sides,props:props,theme:$('theme').value,approve:$('approve').checked,free:$('free').checked,hold:$('hold').checked,end_dark:$('endDark').checked,wait_turn:$('waitTurn').checked,games:$('games').checked,cpu_level:$('cpuLevel').value,wait:Math.max(0,Math.min(600,+$('wait').value|0)),seconds:{text:+$('sText').value,gif:+$('sGif').value,draw:+$('sDraw').value,fx:+$('sFx').value,prop:+$('sProp').value}});
 const bad=r.problems&&r.problems.length;
 $('saveMsg').textContent=bad?'Not saved for these sides (fix them and save again): '+r.problems.join(' · '):'Saved.';
 if(!bad){editing=false;setTimeout(()=>$('saveMsg').textContent='',4000);}
 await refresh();}
$('save').onclick=saveAll;
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>st.urls[b.dataset.copy]&&navigator.clipboard&&navigator.clipboard.writeText(st.urls[b.dataset.copy]).then(()=>{b.textContent='Copied';setTimeout(()=>b.textContent='Copy address',2000);}));
$('test').onclick=()=>api('test',{t:$('testTxt').value||'Hello!'}).then(refresh);
refresh();setInterval(()=>{if(!editing)refresh();},3000);
</script></body></html>"""

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
        if p == "/api/state":
            with lock:
                return self.send(200, dict(S, version=VERSION, ezpOk=ezp_state["ok"], ezpMsg=ezp_state["msg"],
                                           urls={t: qr_url(t) for t in ("hw", "xm", "ev")}, log=logs[-40:], now=now_showing["what"],
                                           queue=jobs.qsize() + len(waiting),
                                           pending=[{k: v for k, v in x.items() if k != "idx"} for x in pending]))
        self.send(404, {"error": "?"})

    def do_POST(self):
        # only the control page sends this header (another website open on the home network cannot)
        if self.headers.get("X-Cube") != "1":
            return self.send(403, {"error": "forbidden"})
        p, b = self.path, self.body()
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
                if b.get("cpu_level") in ("easy", "normal", "hard"):
                    S["cpu_level"] = b["cpu_level"]
                for k in ("on", "approve", "free", "hold", "wait_turn", "games"):
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


if __name__ == "__main__":
    load()
    log("Light Cube bridge %s - control page: http://%s:%d" % (VERSION, my_ip(), PORT))
    for target in (show_loop, render_loop, listen, status_loop, ezp_watch, game_loop,
                   lambda: (time.sleep(3), ezp_targets() if S.get("props") else None, prepare_props())):
        threading.Thread(target=target, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", PORT), Admin).serve_forever()
