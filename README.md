# 🌍 Digital Hammerr — World Environment Day Hand-Gesture Installation

A **cinematic React landing page** (the "Digital Hammerr" home) that launches **4
gesture-controlled experiences**. A webcam tracks your hands (MediaPipe HandLandmarker,
21 points/hand); you control each scene with gestures — no touching. Built for a
**projector + crowd**, runs in Chrome.

## Two parts
- **`landing/`** — the React + Vite + Tailwind + TypeScript + shadcn/ui home page
  (fullscreen video hero, glassmorphic nav, 4 tabs). Clicking a tab opens that
  visualization full-screen.
- **repo root** — the vanilla-JS gesture app (the 4 visualizations), served at `/app`.

## Run the whole site (landing + visualizations)
```bash
cd landing && npm install && npm run build   # build the home page once
cd ..       && node server.js                 # serves landing at /  and gesture app at /app
# open http://localhost:8000   (or double-click start.bat for kiosk mode)
```
Clicking a tab loads `http://localhost:8000/app/?tab=<id>` in a fullscreen iframe.

## Develop the landing (hot reload)
```bash
node server.js                 # terminal 1: gesture app at http://localhost:8000
cd landing && npm run dev      # terminal 2: landing at http://localhost:5173
```
In dev the landing iframes the gesture app cross-origin (camera allowed via the iframe).

> The hero **video + Google Fonts load from the CDN** (need internet), per the design
> spec. The **gesture app** itself works fully offline (see below).

---

## The gesture app (also runnable on its own)
A single web app with **4 gesture-controlled experiences** as tabs, fully offline-capable.

| Tab | Gesture | What happens |
|-----|---------|--------------|
| 🌳 **Grow a Forest** | open / spread hand, sweep | barren land blooms into a forest |
| 🌊 **Clean the Ocean** | wipe like a squeegee · 🤏 pinch to grab | clear plastic & oil, fish return |
| 🌍 **Earth in Your Hands** | move = spin · two hands = zoom · 🤏 pinch | heal brown scars back to green (3D) |
| ⚡ **Power the Future** | wave fast = wind · palm to the sun = solar | turbines spin, a dark city lights up |

Switch tabs **touch-free** by hovering your hand over a tab for ~1.2 s (a ring fills),
or just click them.

---

## Run it (development — needs internet for the first load)

You must serve over `http://localhost` (the camera and modules are blocked on `file://`).

```bash
# easiest:
node server.js          # then open http://localhost:8000
# or
npx serve               # or:  python -m http.server 8000
```

On Windows, just **double-click `start.bat`** — it starts the server and opens Chrome
in fullscreen kiosk mode with the camera auto-allowed.

Allow the camera when prompted, then raise a hand. 🎉

---

## Run it at the event (fully offline, recommended)

The venue may have no Wi-Fi, so bundle everything once beforehand:

1. On a machine **with** internet, run **`download-vendor.ps1`** (right-click → Run with
   PowerShell). It fetches the hand-tracking model + wasm, Three.js, and an Earth
   texture into `vendor/`, `models/`, `textures/`.
2. Open **`src/config.js`** and set `export const OFFLINE = true;`
3. Verify: open the app, then **DevTools → Network → Offline**, hard-reload — nothing
   should fail. (Confirm `.wasm` is served as `application/wasm`; `server.js` does this.)
4. Use `start.bat` on the event laptop.

---

## Event-day operator notes

- **Keys:** `M` mute/un-mute · `H` help · `F` fullscreen · **`Ctrl+Alt+R` (hold 1.5 s)** reset today's counters.
- **Camera:** mount an external USB webcam top-center, angled slightly down. Tape a
  "stand here" floor mark ~1 m back. Add a **soft front fill light**; avoid backlight.
- **Don't sleep:** set Windows power plan to *never sleep / never turn off display* and
  disable the screensaver. The app also requests a Screen Wake Lock.
- **Counters** are cumulative for the day, saved in `localStorage`, and survive refresh/
  reboot. They reset automatically on a new calendar day.
- **Sound** is **off by default** (synthesized, no audio files). Toggle with the on-screen
  button or `M`.
- **Handprint pledge:** after a bit of play, hold an open palm still to leave a stylized
  handprint pledge card (no face photo — built from hand landmarks). It joins the
  "wall of handprints" on the idle screen.
- **Branding:** edit `BRANDING` in `src/config.js` to add your school/org name.

If the camera is missing or denied, the app shows a friendly panel and keeps running an
attract demo — it never shows an error screen to the public.

---

## How it's built

- **No bundler.** Plain ES modules. MediaPipe and Three.js are loaded with dynamic
  `import()` from URLs in `src/config.js`, so the offline switch is one flag.
- **One** camera + **one** HandLandmarker + **one** render loop (`src/main.js`); only the
  active tab updates each frame, so cost is constant regardless of tab count.
- Gestures are derived once per frame (`src/gestures.js`) with hand-size-normalized
  thresholds + hysteresis, so they work for kids far away and adults up close.
- 3 tabs are pure **Canvas2D** with **zero image assets** (procedural). The Earth tab uses
  **Three.js** with a painted shader heal-mask; if no texture is bundled it falls back to a
  procedural globe.

See `src/config.js` to tune every threshold, color, and timing in one place.
