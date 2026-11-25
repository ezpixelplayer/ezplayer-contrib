// ShowPlay body sensor: an ESP32 with an HLK-LD2450 radar that sees up to 3 people in front of the lights and tells
// the games where they are, so visitors can play by moving their body (no phone needed).
//
// The ESP32 joins the home Wi-Fi and answers:
//   GET /targets  ->  {"t":[{"x":-420,"y":1830,"v":12},...],"at":123456}   (millimetres from the radar; x: + is to the
//                     radar's right as you face it, y: distance in front of it; v: speed in cm/s; only the people seen)
//   GET /         ->  a live picture of what the radar sees (to aim it and check the play area)
// The EZPlayer apps and the ShowPlay bridge read /targets about 20 times a second.
//
// Wiring (LD2450 -> ESP32): 5V -> 5V (VIN), GND -> GND, TX -> GPIO 16 (RX2), RX -> GPIO 17 (TX2).
// Libraries: only the ones that come with the ESP32 board package (WiFi, WebServer, ESPmDNS).
// Board: "ESP32 Dev Module" (or your ESP32 board). Fill in your Wi-Fi below, upload, then open
// http://showplay-sensor.local/ (or the IP address printed on the serial monitor at 115200).

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>

const char* WIFI_NAME = "YOUR-WIFI";          // <- your Wi-Fi name
const char* WIFI_PASS = "YOUR-PASSWORD";      // <- your Wi-Fi password
const char* HOST_NAME = "showplay-sensor";    // http://showplay-sensor.local/
const int RX_PIN = 16, TX_PIN = 17;           // the ESP32 pins the radar is wired to
const unsigned long LOST_MS = 400;            // a person not seen for this long is gone

WebServer server(80);
struct Target { int x, y, v; bool on; unsigned long at; };
Target targets[3];
uint8_t frame[30];
int pos = 0;

// the LD2450 sends numbers with the top bit as the sign: set = positive, clear = negative
int decode(uint8_t lo, uint8_t hi) {
  int raw = lo | (hi << 8);
  return (raw & 0x8000) ? (raw & 0x7FFF) : -(raw & 0x7FFF);
}

// a report frame: AA FF 03 00, three targets of 8 bytes (x, y, speed, resolution), 55 CC
void readRadar() {
  while (Serial2.available()) {
    uint8_t b = Serial2.read();
    if (pos < 4) {                                   // waiting for the header
      const uint8_t head[4] = {0xAA, 0xFF, 0x03, 0x00};
      if (b == head[pos]) frame[pos++] = b; else pos = (b == 0xAA) ? 1 : 0;
      if (pos == 1) frame[0] = b;
      continue;
    }
    frame[pos++] = b;
    if (pos < 30) continue;
    pos = 0;
    if (frame[28] != 0x55 || frame[29] != 0xCC) continue;
    unsigned long now = millis();
    for (int i = 0; i < 3; i++) {
      const uint8_t* t = frame + 4 + i * 8;
      bool empty = true;
      for (int k = 0; k < 8; k++) if (t[k]) { empty = false; break; }
      if (empty) continue;
      targets[i].x = decode(t[0], t[1]);
      targets[i].y = decode(t[2], t[3]);
      targets[i].v = decode(t[4], t[5]);
      targets[i].on = true;
      targets[i].at = now;
    }
  }
  unsigned long now = millis();
  for (int i = 0; i < 3; i++) if (targets[i].on && now - targets[i].at > LOST_MS) targets[i].on = false;
}

void sendTargets() {
  String j = "{\"t\":[";
  bool first = true;
  for (int i = 0; i < 3; i++) {
    if (!targets[i].on) continue;
    if (!first) j += ",";
    first = false;
    j += "{\"x\":" + String(targets[i].x) + ",\"y\":" + String(targets[i].y) + ",\"v\":" + String(targets[i].v) + ",\"i\":" + String(i) + "}";
  }
  j += "],\"at\":" + String(millis()) + "}";
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", j);
}

const char PAGE[] PROGMEM = R"HTML(<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ShowPlay body sensor</title><style>body{margin:0;background:#0d0a16;color:#fff;font:16px system-ui;text-align:center}canvas{width:100%;max-width:600px;background:#1a1428;border-radius:12px}</style></head>
<body><h2>👀 ShowPlay body sensor</h2><canvas id="c" width="600" height="450"></canvas><p id="m">…</p>
<script>
const c=document.getElementById('c'),g=c.getContext('2d'),cols=['#ff3c3c','#3c8cff','#3cdc5a'];
async function tick(){try{const r=await fetch('/targets').then(r=>r.json());g.clearRect(0,0,600,450);
 g.strokeStyle='#3a2d52';for(let m=1;m<=6;m++){g.beginPath();g.arc(300,440,m*70,Math.PI,2*Math.PI);g.stroke();g.fillStyle='#776';g.fillText(m+' m',304,440-m*70);}
 g.fillStyle='#ffc83c';g.fillRect(292,436,16,8);
 r.t.forEach((t,k)=>{const x=300+t.x/1000*70,y=440-t.y/1000*70;g.fillStyle=cols[t.i%3];g.beginPath();g.arc(x,y,14,0,6.3);g.fill();});
 document.getElementById('m').textContent=r.t.length+' '+(r.t.length===1?'person':'people')+': '+r.t.map(t=>'x '+(t.x/1000).toFixed(2)+' m, '+(t.y/1000).toFixed(2)+' m away').join(' · ');
}catch(e){document.getElementById('m').textContent='…';}setTimeout(tick,120);}tick();
</script></body></html>)HTML";

void setup() {
  Serial.begin(115200);
  Serial2.begin(256000, SERIAL_8N1, RX_PIN, TX_PIN);
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(HOST_NAME);
  WiFi.begin(WIFI_NAME, WIFI_PASS);
  Serial.print("Joining the Wi-Fi");
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) Serial.println("Sensor ready: http://" + WiFi.localIP().toString() + "/  (or http://" + String(HOST_NAME) + ".local/)");
  else Serial.println("Could not join the Wi-Fi: check WIFI_NAME and WIFI_PASS");
  MDNS.begin(HOST_NAME);
  server.on("/targets", sendTargets);
  server.on("/", []() { server.send_P(200, "text/html", PAGE); });
  server.begin();
}

void loop() {
  readRadar();
  server.handleClient();
  if (WiFi.status() != WL_CONNECTED) { static unsigned long last = 0; if (millis() - last > 10000) { last = millis(); WiFi.reconnect(); } }
}
