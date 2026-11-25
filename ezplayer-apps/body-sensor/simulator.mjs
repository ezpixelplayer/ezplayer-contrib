// A pretend body sensor for trying the games without the ESP32: answers GET /targets like the real one.
// node simulator.mjs [port]            people walk slowly from side to side
// POST /set {"t":[{"x":-500,"y":1500}]} puts people exactly where you say (for tests)
import http from 'node:http';
const port = +(process.argv[2] || 8099);
let fixed = null;
const t0 = Date.now();
http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/set') {
        let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => { try { fixed = JSON.parse(b).t; } catch (e) { fixed = null; } res.end('{}'); });
        return;
    }
    if (req.url.startsWith('/targets')) {
        const s = (Date.now() - t0) / 1000;
        const t = fixed ?? [{ x: Math.round(Math.sin(s * 0.6) * 1200), y: 1800, v: 0, i: 0 }, { x: Math.round(Math.sin(s * 0.45 + 2) * 1200), y: 2400, v: 0, i: 1 }];
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify({ t, at: Date.now() - t0 }));
        return;
    }
    res.writeHead(404); res.end();
}).listen(port, () => console.log(`pretend body sensor on http://127.0.0.1:${port}/targets`));
