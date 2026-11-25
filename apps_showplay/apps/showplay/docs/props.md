# ShowPlay: Props of the Show

Props let visitors light up real models of an EZPlayer show, such as a pair of wings, the bats or the spinners, from
their phone. They pick an effect, a palette or their own colours, and a speed. The effect shows on top of the sequence
that is playing, and when it ends the models go back to the show.

The bridge does all the drawing and EZPlayer does all the sending, so a prop request never touches a controller
directly.

**What it needs:**

- **EZPlayer 0.7 or newer** with the show loaded (Props use its overlay API).
- **The ShowPlay bridge** (`showplay_bridge.py` in `Windows/` or `arm64/`, v6 or newer) on a computer that can reach EZPlayer.
- **The visitors' page** published on the web. Props appear there as the **✨ Props** tab.

```
phone ──► ntfy.sh ──► ShowPlay bridge ──(a colour for each pixel, UDP)──► EZPlayer ──► controllers ──► the prop's models
                              ▲                                               │
                              └──────────── pixel positions, once ────────────┘
```

## What visitors do

1. **The prop:** one of the props you set up, shown with its icon and name.
2. **The effect:** one of 12 (table below).
3. **The colours:** one of 11 palettes, or **My colours** (1 to 3 of the page's 9 colours).
4. **The speed:** slow, normal or fast.

Before sending, a preview on the phone plays the effect on a pair of feathered wings, with the same maths as the
bridge. The tab only appears while the bridge can reach EZPlayer and at least one prop is set up. The usual limits
apply:

- the wait between requests from one phone;
- at most 20 requests a minute;
- approval, if it is switched on.

## Setting up props

On the bridge's control page (http://localhost:8099), in **Props of the show (through EZPlayer)**:

1. Under **EZPlayer**, type its address (`http://127.0.0.1:3000` when both run on the same PC).
2. Click **Read models and groups from EZPlayer**.
3. Click **➕ Add a prop**, then give it a name and an icon.
4. Search (`wing`, `bat`, `spinner`, `arch`…) and click the models or groups to add. A group adds all of its models.
5. Choose **Spread the effect across all its models**:
   - Off (the default): each model does the same. This suits pairs of wings.
   - On: one effect runs across all the models together. This suits a row of arches.
6. Click **Save**, then **Try it**.

Up to 12 props can be set up, each with up to 64 models. **Prop effect** sets how long each request lasts (20 s by
default).

| Prop (example, MerryOnCherry 2026) | Models | Spread across |
| --- | --- | --- |
| Gargoyle wings | WingGargoyleLeft, WingGargoyleRight | Off |
| Butterfly | Wing_Boscoyo_Butterfly_Left, Wing_Boscoyo_Butterfly_Right | Off |
| Hawk wings | WingsGEHawkLeft, WingsGEHawkRight | Off |
| Fairy wings | Group "GE Fairy Wing Sm GRP" | Off |
| Mini arches | ArchMini1 to ArchMini5 | On |

## How it works

1. **The request.** The phone posts a message such as `{"k":"prop","i":0,"e":"flap","pal":"halloween","s":1}`. The
   bridge accepts it only if every value comes from its fixed lists, then queues it like any other request.
2. **Where each pixel is.** The bridge reads EZPlayer's 2D pixel positions (`/api/ezp/model-coordinates-2d`) once and
   keeps only its props' models.
   - **Own grid:** each pixel is placed on its model's own grid, so models turned sideways in 3D keep their real
     shape.
   - **Across and up:** each pixel gets its position across and up its model.
   - **Distance from the body:** the body is the right edge for a model ending in Left/L, the left edge for Right/R,
     and the middle otherwise.
   - **Angle and distance from the middle:** for Spin and Ripples.
   - **Order along the wiring:** for Chase and Comet.
   - **Spread across:** uses the layout positions of all the models together instead.
   - **Matrices and trees:** these need none of this. The bridge draws a plain grid and EZPlayer maps it.
   - **Groups:** read from `xlights_rgbeffects.xml` through EZPlayer's file API.
3. **Drawing.** The palette is blended into 256 colours. Twenty times a second, each pixel gets a place in that palette
   and a brightness from its position, the time and the speed.
4. **Sending.** The bridge opens one exclusive overlay lease per model (`POST /api/ezp/overlays`); a model another
   app is painting is refused, and the error names that app:
   - **Format:** nodes format (one RGB value per pixel, in the model's pixel order) for pixel models, grid format for
     matrices and trees.
   - **Frames:** they go to EZPlayer's overlay port as `EZO1` UDP packets of up to 1,400 bytes.
5. **Back to the show.** When the effect time ends, the bridge closes the overlays and the models play the sequence
   again.
   - **If the bridge stops:** EZPlayer drops the overlays after 8 s without frames.
   - **If EZPlayer restarts:** the bridge checks every 5 s and reopens its overlays.

## Effects

| Effect | What it does | Driven by |
| --- | --- | --- |
| Flap | Bands move out from the body while the whole wing beats brighter and dimmer | Distance from the body |
| Colour wave | The palette flows outward from the body | Distance from the body |
| Rising | The palette climbs from bottom to top | Height |
| Spin | The palette turns around the middle, mirrored on a pair | Angle |
| Breathe | The whole prop brightens and dims while the colours drift | Time |
| Sparkle | Random pixels flash in palette colours over a dim base | Random |
| Fire | Flames rise from the bottom | Height and flicker |
| Ripples | Rings spread out from the middle | Distance from the middle |
| Chase | Bright segments run along the wiring | Pixel order |
| Comet | A bright head with a fading tail runs along the wiring | Pixel order |
| Confetti | Random pixels pop in palette colours and fade | Random |
| Colours | The palette spread over the prop, drifting slowly | Distance from the body |

## Palettes

| Palette | Colours |
| --- | --- |
| Rainbow | red, orange, yellow, green, cyan, blue, magenta |
| Halloween | orange, purple, toxic green |
| Christmas | red, green, white |
| Fire | deep red, red, orange, yellow, pale yellow |
| Ice | white, light blue, blue, cyan |
| Ocean | navy, blue, turquoise, light cyan |
| Candy | pink, white, red |
| Forest | dark green, green, lime, gold |
| Sunset | red, orange, yellow, purple |
| Gold | gold, amber, pale gold |
| Party | pink, aqua, yellow, purple |
| My colours | 1 to 3 colours the visitor picks |

**Speed:** slow = 0.5×, normal = 1×, fast = 1.8×.

## Limits and troubleshooting

- **Version:** needs EZPlayer 0.7 or newer. DMX lights (floods, moving heads, wands) cannot be props yet.
- **Big matrices:** matrices over 40,000 pixels are drawn smaller and enlarged by EZPlayer.
- **One request per prop at a time:** a new one replaces it, or waits if "Each request waits" is on.
- **Fixed choices only:** visitors pick from fixed lists, so prop requests carry no free text.
- **No strobe:** no effect flashes faster than a gentle beat.

| Problem | What to check |
| --- | --- |
| No Props tab on the phone | The control page must show "EZPlayer: connected", and at least one prop must be saved |
| "model Y is not in the EZPlayer show" | The model was renamed or removed: read the models again and fix the prop |
| "no pixel positions for Y" | EZPlayer has not loaded the layout yet: reload the show, then save the props again |
| A pair mirrors the wrong way | The body side comes from Left/Right (or L/R) at the end of the model name |
| Log says "showing prop" but nothing lights up | Check EZPlayer's overlay list for "ShowPlay: <prop>" overlays |
