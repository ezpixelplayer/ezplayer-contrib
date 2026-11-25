# Body sensor (ESP32 + HLK-LD2450)

A small box in front of the lights that sees up to **3 people** and tells the games where they are, so visitors play
**by moving their body**, without a phone: walk left and right to move the sleigh, the ship or the paddle.

It is used by the EZPlayer apps catch-the-presents, pong and space-invaders, and by ShowPlay (v30 and later) in the same
three games. On the phone, visitors pick **🧍 Body** under **Play with**.

## What to buy

- an **ESP32** board (any ESP32 DevKit, about 5 to 8 €);
- an **HLK-LD2450** 24 GHz radar (about 15 €): it tracks up to 3 people, up to about 6 m away, through a thin plastic
  box, day or night;
- 4 wires and a 5 V USB power supply.

## Wiring

| LD2450 | ESP32 |
| --- | --- |
| 5V | 5V (VIN) |
| GND | GND |
| TX | GPIO 16 (RX2) |
| RX | GPIO 17 (TX2) |

## Program the ESP32

1. Install the Arduino IDE and the **ESP32** boards (Boards Manager: "esp32 by Espressif").
2. Open `showplay_sensor/showplay_sensor.ino`, write your Wi-Fi name and password at the top.
3. Board **ESP32 Dev Module**, pick the port, **Upload**.
4. Open the serial monitor (115200): it prints the sensor's address, for example `http://192.168.1.80/`.
5. Open that address (or `http://showplay-sensor.local/`) in a browser: a live picture shows the people it sees,
   with circles every metre. Use it to aim the sensor.

## Put it in place

- At the lights, at about waist height, facing the visitors (the side with the antennas towards them).
- The play area: by default 3 m wide, from 0.5 m to 4 m in front of the sensor. The games split it into lanes when
  two people play (left player, right player).

## Set up the games

- **EZPlayer apps**: in each game's settings, section **Body sensor**, write the sensor's address (for example
  `192.168.1.80`), and if needed the width of the play area and where it starts and ends. Save.
- **ShowPlay**: on the control page, card **Body sensor**, the same.

The phones then show **🧍 Body** under **Play with** (only while the sensor answers).

## What it sends

`GET /targets` → `{"t":[{"x":-420,"y":1830,"v":12,"i":0}],"at":123456}`: for each person seen, `x` across in
millimetres (+ is the sensor's right as you face it), `y` the distance in front of it, `v` the speed in cm/s.

## Trying without the sensor

`node simulator.mjs` starts a pretend sensor on `http://127.0.0.1:8099/targets` with two people walking from side to
side; `POST /set {"t":[{"x":-500,"y":1500}]}` puts people where you say.
