// This code is copyrighted.  The copyright holder is determined as documented in the Github repository history.
// This code is licensed under the Affero General Public License, version 3.0 or later.  Other licenses may be available from the copyright holders.

/**
 * Small pictures for the theme packs (New Year, wedding, baptism, Easter, Halloween, Thanksgiving…): 8 x 8 maps drawn
 * at any size on the lights (and on the phones' page, which includes this file), plus the things that move in the back
 * of a game (snow, stars, confetti, petals, leaves, bats, bubbles). The same file on the lights and on the phone.
 *
 * In a map: '.' nothing, 'c' the item's own colour, 'd' that colour darker, 'w' white, 'g' gold, 'k' dark grey,
 * 'r' red, 'G' green, 'b' brown, 'o' orange, 'p' pink, 'y' yellow, 's' silver, 'u' blue, 'v' violet, 'l' light green.
 */

export const SPRITE_PAL = {
    w: [255, 255, 255], g: [255, 200, 60], k: [70, 70, 80], r: [255, 40, 40], G: [40, 170, 60], b: [150, 85, 35], o: [255, 130, 20],
    p: [255, 110, 190], y: [255, 230, 60], s: [180, 185, 200], u: [50, 120, 255], v: [150, 70, 255], l: [140, 230, 90],
};

export const SPRITES = {
    // --- shared ---
    star: ['...g....', '...g....', '..ggg...', 'ggggggg.', '.ggwgg..', '..ggg...', '.gg.gg..', 'g.....g.'],
    heart: ['........', '.cc.cc..', 'cwcccccc', 'cccccccc', 'cccccccc', '.cccccc.', '..cccc..', '...cc...'],
    present: ['..g..g..', '...gg...', 'ccccgccc', 'ccccgccc', 'gggggggg', 'ccccgccc', 'ccccgccc', 'ccccgccc'],
    flower: ['..p.p...', '.ppppp..', 'ppcycpp.', '.pyyyp..', 'ppcycpp.', '.ppppp..', '...G....', '..GGG...'],
    balloon: ['..ccc...', '.cwccc..', '.ccccc..', '.ccccc..', '..ccc...', '...c....', '...w....', '....w...'],
    candy: ['........', 'c......c', 'cc.cc.cc', '.cwcccc.', '.cccccc.', 'cc.cc.cc', 'c......c', '........'],
    // --- New Year ---
    glass: ['.w...w..', '.wcccw..', '.wcwcw..', '..ccc...', '...w....', '...w....', '...w....', '.wwwww..'],
    bottle: ['...gg...', '...gg...', '...GG...', '..GGGG..', '..GwwG..', '..GwwG..', '..GGGG..', '..GGGG..'],
    popper: ['c.y..p..', '.p..u...', 'y..g..c.', '...ggg..', '..gcg...', '.gcg....', 'gcg.....', 'gg......'],
    coin: ['..gggg..', '.gyyyyg.', 'gyggggyg', 'gygyygyg', 'gygyygyg', 'gyggggyg', '.gyyyyg.', '..gggg..'],
    bomb: ['.....o..', '....k.y.', '...kk...', '..kkkk..', '.kwkkkk.', '.kkkkkk.', '.kkkkkk.', '..kkkk..'],
    clock: ['..wwww..', '.w.ww.w.', 'w...w..w', 'w...w..w', 'w...ww.w', 'w......w', '.w....w.', '..wwww..'],
    rocket: ['...c....', '..cwc...', '..ccc...', '..cwc...', '..ccc...', '.cccc...', '.c.c.c..', '..o.o...'],
    firework: ['c..c..c.', '.c.c.c..', '..ccc...', 'ccwwwcc.', '..ccc...', '.c.c.c..', 'c..c..c.', '........'],
    grapes: ['....G...', '...GG...', '.ccc....', 'ccdcc...', '.ccdcc..', '..ccc...', '...c....', '........'],
    tophat: ['........', '..kkkk..', '..kkkk..', '..kkkk..', '..rrrr..', '..kkkk..', 'kkkkkkkk', '........'],
    // --- wedding ---
    ring: ['...ww...', '..wuw...', '..ggg...', '.g...g..', 'g.....g.', 'g.....g.', '.g...g..', '..ggg...'],
    rose: ['..rrr...', '.rdrrr..', '.rrdrr..', '..rrr...', '...G.G..', '...GG...', '..GG....', '...G....'],
    dove: ['........', '..ww....', '.wkww...', 'oowwwww.', '..wwwwww', '...wwwww', '....ww..', '........'],
    bell: ['...g....', '..ggg...', '.gggyg..', '.gggyg..', '.gggyg..', 'ggggggg.', '...g....', '........'],
    cake: ['...y....', '...w....', '..pwwp..', '..wwww..', '.pwwwwp.', '.wwwwww.', 'pwwwwwwp', 'wwwwwwww'],
    cloud: ['........', '..kkk...', '.kkkkkk.', 'kkkkkkkk', 'kkkkkkkk', '.u.u.u..', 'u.u.u...', '........'],
    // --- baptism ---
    shell: ['...cc...', '..cwcc..', '.cwcwcc.', 'cwcwcwcc', 'cwcwcwcc', '.cwcwcc.', '..cccc..', '...cc...'],
    drop: ['...u....', '...u....', '..uuu...', '..uwu...', '.uuwuu..', '.uuuuu..', '..uuu...', '........'],
    almond: ['........', '..cccc..', '.cwcccc.', 'cwcccccc', 'cccccccc', '.cccccc.', '..cccc..', '........'],
    candle: ['...y....', '..yoy...', '...o....', '..www...', '..wcw...', '..www...', '..wcw...', '.ggggg..'],
    babybottle: ['...pp...', '...pp...', '..wwww..', '..wcww..', '..wcww..', '..wcww..', '..wwww..', '..wwww..'],
    // --- Easter ---
    egg: ['...cc...', '..cccc..', '.cwwwwc.', '.cccccc.', 'cyycyycc', 'cccccccc', '.cccccc.', '..cccc..'],
    goldegg: ['...gg...', '..gwgg..', '.gwggggg', '.gggggg.', 'gyyggyyg', 'gggggggg', '.gggggg.', '..gggg..'],
    rottenegg: ['...ll...', '..lkll..', '.llllkl.', '.lklll..', 'llllkll.', 'lllllll.', '.lllll..', '..lll...'],
    bunny: ['.w...w..', '.wp.wp..', '.wp.wp..', '.wwwww..', 'wwkwkww.', 'wwwpwww.', '.wwwww..', '.ww.ww..'],
    chick: ['........', '..yyy...', '.yykyy..', '.yyyyoo.', '.yyyyy..', 'yyyyyyy.', '.yyyyy..', '..o.o...'],
    carrot: ['...GG...', '..G.G...', '..ooo...', '..ooo...', '...oo...', '...oo...', '...o....', '...o....'],
    butterfly: ['cc...cc.', 'cwc.cwc.', 'ccckccc.', '.cckcc..', 'ccckccc.', 'cwc.cwc.', 'cc...cc.', '........'],
    basket: ['..bbbb..', '.b....b.', 'b......b', 'bbbbbbbb', 'bybybyby', '.bybyby.', '.bbbbbb.', '........'],
    // --- Halloween ---
    pumpkin: ['...G....', '..GG....', '.oooooo.', 'oo.oo.oo', 'oooooooo', 'oo....oo', '.oooooo.', '..oooo..'],
    ghost: ['..www...', '.wwwww..', 'wwkwkww.', 'wwwwwww.', 'wwwkwww.', 'wwwwwww.', 'wwwwwww.', 'w.w.w.w.'],
    bat: ['........', 'v..vv..v', 'vv.vv.vv', 'vvvvvvvv', '.vkvvkv.', '..vvvv..', '...vv...', '........'],
    spider: ['k..k..k.', '.k.k.k..', '..kkk...', 'kkkkkkk.', '..krk...', '.k.k.k..', 'k..k..k.', '........'],
    skull: ['.wwwww..', 'wwwwwww.', 'wkkwkkw.', 'wkkwkkw.', 'wwwkwww.', '.wwwww..', '.w.w.w..', '........'],
    cauldron: ['.l.l.l..', 'lllllll.', 'kkkkkkkk', '.kkkkkk.', 'kkkkkkkk', 'kkkkkkkk', '.kkkkkk.', '.k....k.'],
    witchhat: ['....v...', '...vv...', '...vv...', '..vvvv..', '..gggg..', '.vvvvvv.', 'vvvvvvvv', '........'],
    lollipop: ['.cccc...', 'cwcwcc..', 'ccwcwc..', 'cwcwcc..', '.cccc...', '...w....', '...w....', '...w....'],
    eye: ['........', '.wwwww..', 'wwwuwww.', 'wwukuww.', 'wwwuwww.', '.wwwww..', '........', '........'],
    // --- Thanksgiving ---
    leaf: ['....c...', '...cc...', '.ccccc..', 'cccdccc.', '.ccdcc..', '..cdc...', '...b....', '...b....'],
    apple: ['....b...', '...bG...', '.rrrrr..', 'rrwrrrr.', 'rrrrrrr.', 'rrrrrrr.', '.rrrrr..', '..r.r...'],
    rottenapple: ['....b...', '...bk...', '.bbbbb..', 'bbbkbbb.', 'bkbbbbb.', 'bbbbbkb.', '.bbbbb..', '..b.b...'],
    acorn: ['..b.....', '.bbbb...', 'bbbbbb..', '.oooo...', '.oooo...', '.oooo...', '..oo....', '........'],
    corn: ['..G.....', '.GyyG...', '.GyyG...', '.GyyG...', '.GyyG...', '..GyG...', '..GG....', '........'],
    pie: ['........', '..bbbb..', '.boooob.', 'boowooob', 'bbbbbbbb', '.bbbbbb.', '........', '........'],
    turkey: ['.ror.ro.', 'oryrory.', '.rbbbr..', '..bkbr..', '.bbbbr..', '.bbbb...', '..o.o...', '........'],
    // --- Carnival ---
    mask: ['........', 'g......g', 'cccccccc', 'c..cc..c', 'cccccccc', '.cc..cc.', '..g..g..', '........'],
    streamer: ['c.......', '.c......', '..c.ccc.', '..cc...c', '.......c', '...ccc.c', '..c...c.', '..c.....'],
    drum: ['.w....w.', '..w..w..', 'rrrrrrrr', 'rwgwgwgr', 'rgwgwgwr', 'rwgwgwgr', 'rrrrrrrr', '........'],
    parrot: ['...rr...', '..rrrr..', '..rwkr..', '..rrrgg.', '..urru..', '.uuuuu..', '..yyy...', '..y.y...'],
    // --- Valentine's Day ---
    chocolate: ['........', '.rrrrrr.', 'rbbbbbbr', 'rbgbbgbr', 'rbbbbbbr', 'rbgbbgbr', 'rbbbbbbr', '.rrrrrr.'],
    letter: ['........', 'kkkkkkkk', 'kwkwwkwk', 'kwwkkwwk', 'kwwrrwwk', 'kwwwwwwk', 'kkkkkkkk', '........'],
    arrow: ['......gg', '......gg', '.....b..', '....b...', '...b....', '.cb.....', 'cc......', 'c.......'],
    brokenheart: ['........', '.kk.kk..', 'kkkk.kkk', 'kkk.kkkk', 'kkkk.kkk', '.kk.kkk.', '..k.kk..', '...k....'],
    // --- birthday ---
    partyhat: ['...y....', '...c....', '..cyc...', '..ccc...', '.cyccy..', '.ccccc..', 'cyccccyc', 'gggggggg'],
    // --- Children's Day ---
    kite: ['...c....', '..ccc...', '.ccwcc..', 'ccwwwcc.', '.ccwcc..', '..ccc...', '...c..r.', '....rr.r'],
    ball: ['..ryyu..', '.rryyuu.', 'rrryyuuu', 'rrryyuuu', 'GGGwwppp', '.GGwwpp.', '..Gwwp..', '........'],
    icecream: ['..ccc...', '.cwccc..', '.ccccc..', '..ccc...', '.ggggg..', '..ggg...', '..gg....', '...g....'],
    teddy: ['.b....b.', 'bbbbbbbb', '.bkbbkb.', '.bbbbbb.', '..bkkb..', '.bbbbbb.', 'bbbbbbbb', '.bb..bb.'],
    rainbow: ['........', '..rrrr..', '.roooor.', 'royyyyor', 'royGGyor', 'roG..Gor', '........', '........'],
    broccoli: ['.GG.GG..', 'GGGGGGG.', 'GGlGGlGG', '.GGGGGG.', '..lll...', '...l....', '...l....', '........'],
    // --- 4th of July ---
    flag: ['uuurrrrr', 'uwuwwwww', 'uuurrrrr', 'uwuwwwww', 'rrrrrrrr', 'wwwwwwww', 'rrrrrrrr', 'wwwwwwww'],
    hotdog: ['........', '.bbbbbb.', 'boooooob', 'byyyyyyb', 'boooooob', '.bbbbbb.', '........', '........'],
    eagle: ['k......k', 'kk....kk', 'kkkwwkkk', '.kkwkkk.', '..kkkk..', '...yy...', '..y..y..', '........'],
};

/** the colour of a map cell (null: nothing); col: the item's own colour */
export function spriteCell(name, gx, gy, col) {
    const m = SPRITES[name];
    if (!m) return null;
    const ch = (m[gy] || '')[gx];
    if (!ch || ch === '.') return null;
    if (ch === 'c') return col;
    if (ch === 'd') return col.map((v) => Math.round(v * 0.55));
    return SPRITE_PAL[ch] || col;
}

/** draws a map b pixels across with its top-left at (0, 0) through P(x, y, rgb, k); tiny sizes become a dot of its main colour */
export function drawSprite(P, name, col, b, k = 1) {
    if (!SPRITES[name]) return;
    if (b <= 2) {   // too small for a picture: its most used colour
        const count = new Map();
        for (const row of SPRITES[name]) for (const ch of row) if (ch !== '.') count.set(ch, (count.get(ch) || 0) + 1);
        const main = [...count.entries()].sort((a, b2) => b2[1] - a[1])[0]?.[0] ?? 'c';
        const c = main === 'c' ? col : main === 'd' ? col.map((v) => Math.round(v * 0.55)) : SPRITE_PAL[main] || col;
        for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) P(x, y, c, k);
        return;
    }
    for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) {
        const c = spriteCell(name, Math.min(7, Math.floor((x + 0.5) * 8 / b)), Math.min(7, Math.floor((y + 0.5) * 8 / b)), col);
        if (c) P(x, y, c, k);
    }
}

/** the map at a point of a shape that goes from -1 to 1 both ways (for decorations drawn round a spot): rgb or null */
export function spriteAt(name, x, y, col) {
    if (x < -1 || x > 1 || y < -1 || y > 1) return null;
    return spriteCell(name, Math.min(7, Math.floor((x + 1) * 4)), Math.min(7, Math.floor((y + 1) * 4)), col);
}

const CONFETTI = [[255, 60, 60], [255, 200, 60], [60, 160, 255], [80, 220, 100], [255, 110, 200], [170, 90, 255]];
/** what moves in the back of a game, dim: 'snow', 'stars', 'confetti', 'petals', 'leaves', 'bats', 'bubbles' or 'none' */
export function backdrop(set, w, h, t, kind) {
    if (!kind || kind === 'none') return;
    const n = Math.ceil(w * h / 40);
    for (let i = 0; i < n; i++) {
        const sx = i * 7.3, sy = i * 13.7;
        if (kind === 'stars') {   // still, twinkling
            const k = 0.5 + 0.5 * Math.sin(t * (1 + (i % 5) * 0.4) + i);
            set(Math.floor(sx % w), Math.floor(sy % h), [40, 40, 60].map((v) => v * k));
            continue;
        }
        if (kind === 'bubbles') {   // rising
            const x = (sx + Math.sin(t * 0.9 + i) * 1.2) % w, y = h - 1 - ((sy % h) + t * (1 + (i % 3) * 0.5)) % h;
            set((x + w) % w, y, [20, 40, 60]);
            continue;
        }
        const fall = kind === 'bats' ? 0.6 : kind === 'leaves' || kind === 'petals' ? 1.1 : 1.5 + (i % 3);
        const sway = kind === 'leaves' || kind === 'petals' ? 2.5 : kind === 'bats' ? 3 : 1.5;
        const x = (sx + Math.sin(t * 0.7 + i) * sway) % w, y = kind === 'bats' ? (sy % h + Math.sin(t * 2 + i) * 1.5 + h) % h : ((sy % h) + t * fall) % h;
        const col = kind === 'snow' ? [26, 26, 36] : kind === 'confetti' ? CONFETTI[i % CONFETTI.length].map((v) => v * 0.16)
            : kind === 'petals' ? [50, 20, 36] : kind === 'leaves' ? (i % 2 ? [55, 25, 5] : [45, 35, 5]) : [26, 10, 40];
        set((x + w) % w, y, col);
        if (kind === 'bats' && Math.floor(t * 6 + i) % 2) { set((x + w + 1) % w, y - 1, col); set((x + w - 1) % w, y - 1, col); }
    }
}
