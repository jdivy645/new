// ============================================================================
// config.js — single source of truth for tuned constants, paths, palette.
// Edit values here; everything else imports from CONFIG.
// ============================================================================

// --- Offline / asset paths --------------------------------------------------
// DEV: keep OFFLINE = false to load MediaPipe + Three.js from CDN (needs net).
// EVENT: run download-vendor.ps1 once, then set OFFLINE = true to use the
// self-hosted copies under ./vendor and ./models (zero internet required).
export const OFFLINE = false;

const MP_VERSION = '0.10.35';
const THREE_VERSION = '0.184.0';

export const PATHS = {
  // MediaPipe Tasks Vision
  mpModule: OFFLINE
    ? './vendor/tasks-vision/vision_bundle.mjs'
    : `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`,
  mpWasm: OFFLINE
    ? './vendor/tasks-vision/wasm'
    : `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
  handModel: OFFLINE
    ? './models/hand_landmarker.task'
    : 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
  // Three.js (importmap is written in index.html; these are documented here)
  three: OFFLINE
    ? './vendor/three/build/three.module.js'
    : `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js`,
  threeAddons: OFFLINE
    ? './vendor/three/examples/jsm/'
    : `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/`,
  // Real Blue-Marble Earth maps (three.js examples, public-domain NASA source).
  // Online: load from CDN. Offline: download-vendor.ps1 fetches these locally.
  // A procedural globe is used as a fallback if any fail to load.
  earthTexture: OFFLINE
    ? './textures/earth_day_2048.jpg'
    : `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/textures/planets/earth_atmos_2048.jpg`,
  earthSpecular: OFFLINE
    ? './textures/earth_specular_2048.jpg'
    : `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/textures/planets/earth_specular_2048.jpg`,
  earthClouds: OFFLINE
    ? './textures/earth_clouds_1024.png'
    : `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/textures/planets/earth_clouds_1024.png`,
};

export const MP_VERSION_STR = MP_VERSION;
export const THREE_VERSION_STR = THREE_VERSION;

// --- Branding (shown on the HUD / attract screen) ---------------------------
export const BRANDING = {
  title: 'World Environment Day',
  subtitle: 'June 5 · Heal the planet with your hands',
  host: 'Digital Hammerr', // shown on the HUD next to the event title
};

// --- Camera -----------------------------------------------------------------
export const CAMERA = {
  width: 1280,
  height: 720,
  facingMode: 'user',
};

// --- Hand tracking ----------------------------------------------------------
export const TRACKING = {
  numHands: 2,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  // Presence debounce (frames)
  enterFrames: 4,
  exitFrames: 8,
  // Hand size sanity (fraction of frame); reject too-far / sensor noise
  minHandSize: 0.04,
  maxHandSize: 0.6,
  presenceConfidence: 0.6,
  // One-Euro-ish smoothing
  emaAlphaSlow: 0.3,
  emaAlphaFast: 0.8,
};

// --- Gesture thresholds (all distances are fractions of HAND SIZE) ----------
export const GESTURE = {
  // pinch: thumb tip (4) <-> index tip (8) over hand size
  pinchOn: 0.35,
  pinchOff: 0.55,
  pinchConfirmFrames: 2,
  // open palm: count of extended non-thumb fingers
  openPalmFingers: 4,
  fingerExtendRatio: 1.15, // tip-from-wrist must exceed pip-from-wrist * this
  palmSpanMin: 0.55, // dist(5,17)/handSize — rejects edge-on hands
  // spread fingers
  spreadOn: 0.85,
  spreadOff: 0.65,
  // swipe
  swipeSpeed: 0.012, // normalized units per ms (hand-size corrected)
  swipeMinTravel: 0.6,
  swipeAxisRatio: 1.7,
  swipeRefractoryMs: 450,
  swipeBufferFrames: 6,
  // two-hand
  zoomDeadZone: 0.05,
};

// --- Tab switching (dwell) ---------------------------------------------------
export const DWELL = {
  ms: 1200,
  cooldownMs: 600,
  decayMs: 600,
  hoverHysteresis: 1.25, // R_out = R_in * this
};

// --- App state machine timings ---------------------------------------------
export const STATE = {
  attractAfterMs: 8000, // no hand -> attract
  cooldownMs: 6000, // hand lost -> grace before attract
  presenceBufferMs: 1500,
};

// --- Sound ------------------------------------------------------------------
export const SOUND_DEFAULT = false; // user chose: off by default (quiet gallery)

// --- Performance ------------------------------------------------------------
export const PERF = {
  maxPixelRatio: 1.5,
  frameBudgetMs: 22, // above this for N frames -> adaptive quality step down
  adaptiveWindow: 30,
};

// --- Feature flags ----------------------------------------------------------
export const FEATURES = {
  pledge: true, // user chose: include handprint pledge
  cameraPip: true, // small mirrored "it sees me" thumbnail in attract
};

// --- Okabe–Ito-derived, colorblind-safe eco palette -------------------------
// Meaning is never encoded by hue alone elsewhere (always + icon/label/shape).
export const PALETTE = {
  // structural
  bg: '#0a1f1c',
  bgDeep: '#06140f',
  ink: '#f2fbf4',
  inkDim: '#a9c6b4',
  scrim: 'rgba(4, 16, 11, 0.55)',
  // eco accents (Okabe–Ito leaning)
  forest: '#2e8b57',
  forestBright: '#57d98a',
  leaf: '#8fe388',
  soilDead: '#7d6a52',
  soilDeadDry: '#9c8767',
  ocean: '#0aa6c2',
  oceanDeep: '#075b76',
  oceanBright: '#3fd3e6',
  murk: '#5b5234',
  murkGrey: '#4a4a44',
  sun: '#ffcc4d',
  sunDeep: '#ff9f1c',
  energy: '#f0a202',
  energyBright: '#ffd166',
  sky: '#2a2f5a',
  skyClean: '#1d6f7a',
  // status
  warn: '#e67700',
  good: '#57d98a',
  // text accents
  gold: '#ffd166',
};

// --- Counter / score keys + labels ------------------------------------------
export const COUNTERS = {
  forest: { key: 'forest', label: 'Trees grown today', icon: '🌳', color: PALETTE.forestBright },
  ocean: { key: 'ocean', label: 'Plastic removed today', icon: '♻️', color: PALETTE.oceanBright },
  earth: { key: 'earth', label: 'Trees planted today', icon: '🌍', color: PALETTE.leaf },
  energy: { key: 'energy', label: 'CO₂ saved today (kg)', icon: '⚡', color: PALETTE.energyBright },
};

// --- Tab registry (order = on-screen order) ---------------------------------
export const TABS = [
  { id: 'forest', name: 'Grow a Forest', icon: '🌳' },
  { id: 'ocean', name: 'Clean the Ocean', icon: '🌊' },
  { id: 'earth', name: 'Earth in Your Hands', icon: '🌍' },
  { id: 'energy', name: 'Power the Future', icon: '⚡' },
];

// localStorage namespace
export const LS_NS = 'wed_gesture_v1';

// Operator reset: hold this combo to zero today's counters.
// (Ctrl+Alt+R, not Ctrl+Shift+R, so it never collides with browser hard-reload.)
export const OPERATOR_RESET = { code: 'KeyR', ctrl: true, alt: true, holdMs: 1500 };

// ----------------------------------------------------------------------------
// GestureState contract (documented for all tab modules)
// Produced once per frame by gestures.js, consumed by the active tab + dwell.
//
// gestureState = {
//   present: boolean,                 // a usable hand is in frame
//   hands: HandData[],                // 0..2 entries (smoothed)
//   active: HandData | null,          // the primary (largest/closest) hand
//   openPalm: boolean,                // active hand is a flat open palm
//   spread: number,                   // 0..1 analog finger-spread of active hand
//   pinch: {
//     isPinching: boolean,
//     startEdge: boolean,             // true only on the frame pinch begins
//     endEdge: boolean,               // true only on the frame pinch ends
//     point: {x, y} | null,           // screen px (mirrored) of pinch midpoint
//     ndc: {x, y} | null,             // normalized device coords for raycasting
//   },
//   swipe: { dir: 'left'|'right'|'up'|'down'|null, fired: boolean },
//   twoHand: {
//     present: boolean,
//     distRatio: number,              // current dist / baseline (zoom)
//     twistDelta: number,             // radians from baseline (roll)
//     midpoint: {x, y} | null,        // screen px
//     dx: number, dy: number,         // midpoint delta vs prev frame (norm)
//   },
//   cursor: {x, y} | null,            // screen px (mirrored) palm-center cursor
//   fist: boolean,                    // active hand is a closed fist
// }
//
// HandData = {
//   id: 'A'|'B', label: 'Left'|'Right',
//   lm: [{x,y,z} x21],                // smoothed, IMAGE space (unmirrored)
//   handSize: number, palm: {x,y},    // normalized
//   palmScreen: {x,y},                // mirrored screen px
//   velocity: {vx,vy,speed},          // normalized/ms, hand-size corrected
//   fingersExtended: number,
// }
// ----------------------------------------------------------------------------
