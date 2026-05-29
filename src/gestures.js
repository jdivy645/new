// ============================================================================
// gestures.js — derive the shared GestureState ONCE per frame (see config.js
// for the contract). Hysteresis + hand-size normalization everywhere so the
// same gesture works for a child far away and an adult up close.
// ============================================================================
import { GESTURE, TRACKING } from './config.js';
import { dist, dist2, clamp, mapLinear, wrapToPi } from './util.js';

const THUMB_TIP = 4, IDX_TIP = 8, MID_TIP = 12, RING_TIP = 16, PINKY_TIP = 20;
const IDX_MCP = 5, PINKY_MCP = 17;

export class GestureEngine {
  constructor() {
    this.presentFrames = 0;
    this.absentFrames = 99;
    this.pinch = { isPinching: false, confirm: 0 };
    this.swipeLockUntil = 0;
    this.two = { baselineD: 0, baselineTheta: 0, hadTwo: false, prevMid: null };
    // pose stabilization (finger counts are noisy -> 3-frame majority vote)
    this.pose = { cand: null, n: 0, stable: null, last: null };
  }

  reset() {
    this.pinch.isPinching = false;
    this.pinch.confirm = 0;
    this.two.hadTwo = false;
    this.swipeLockUntil = 0;
    this.pose = { cand: null, n: 0, stable: null, last: null };
  }

  // hands: HandData[], mapper from util.makeMapper, nowMs
  update(hands, mapper, nowMs) {
    const present = hands.length >= 1;
    if (present) { this.presentFrames++; this.absentFrames = 0; }
    else { this.absentFrames++; this.presentFrames = 0; if (this.absentFrames > TRACKING.exitFrames) this.reset(); }

    const stablePresent = this.presentFrames >= TRACKING.enterFrames;

    // active hand = largest (closest to camera)
    let active = null;
    for (const h of hands) if (!active || h.handSize > active.handSize) active = h;

    const state = {
      present: stablePresent && !!active,
      hands,
      active,
      openPalm: false,
      spread: 0,
      fist: false,
      fingerCount: 0,
      pointing: false,
      peace: false,
      pointEdge: false,
      peaceEdge: false,
      gestureName: null, // 'point' | 'peace' | 'palm' | 'fist' | null
      pinch: { isPinching: false, startEdge: false, endEdge: false, point: null, ndc: null },
      swipe: { dir: null, fired: false },
      twoHand: { present: false, distRatio: 1, twistDelta: 0, midpoint: null, dx: 0, dy: 0 },
      cursor: null,
      cursorNdc: null,
    };

    if (active) {
      const lm = active.lm, hs = active.handSize;
      const f = active.fingers || [false, false, false, false]; // [idx,mid,ring,pinky]
      const ext = active.fingersExtended;
      const span = dist(lm[IDX_MCP], lm[PINKY_MCP]) / hs;

      // ---- discrete poses (1 finger / 2 fingers / palm / fist) ----
      const rawPalm = ext >= GESTURE.openPalmFingers && span > GESTURE.palmSpanMin;
      const rawPeace = f[0] && f[1] && !f[2] && !f[3];
      const rawPoint = f[0] && !f[1] && !f[2] && !f[3];
      const rawFist = ext === 0;
      const rawName = rawPalm ? 'palm' : rawPeace ? 'peace' : rawPoint ? 'point' : rawFist ? 'fist' : null;
      // 3-frame majority vote so a momentary mis-track doesn't flip the pose
      if (rawName === this.pose.cand) this.pose.n++; else { this.pose.cand = rawName; this.pose.n = 1; }
      if (this.pose.n >= 3) this.pose.stable = this.pose.cand;
      const name = this.pose.stable;

      state.gestureName = name;
      state.fingerCount = ext;
      state.openPalm = name === 'palm';
      state.fist = name === 'fist';
      state.pointing = name === 'point';
      state.peace = name === 'peace';
      state.pointEdge = state.pointing && this.pose.last !== 'point';
      state.peaceEdge = state.peace && this.pose.last !== 'peace';
      this.pose.last = name;

      // ---- cursor: index fingertip when pointing (precise), else palm center ----
      const cpt = state.pointing ? { x: lm[IDX_TIP].x, y: lm[IDX_TIP].y } : active.palm;
      state.cursor = mapper.toScreen(cpt.x, cpt.y);
      state.cursorNdc = mapper.toNdc(cpt.x, cpt.y);

      // ---- spread (analog) ----
      const splay = (dist(lm[IDX_TIP], lm[MID_TIP]) + dist(lm[MID_TIP], lm[RING_TIP]) + dist(lm[RING_TIP], lm[PINKY_TIP])) / hs;
      state.spread = clamp(mapLinear(splay, GESTURE.spreadOff, 1.05, 0, 1), 0, 1);

      // ---- pinch (Schmitt trigger + confirm frames) ----
      const pinchDist = dist(lm[THUMB_TIP], lm[IDX_TIP]) / hs;
      const wasPinching = this.pinch.isPinching;
      if (!this.pinch.isPinching && pinchDist < GESTURE.pinchOn) {
        this.pinch.confirm++;
        if (this.pinch.confirm >= GESTURE.pinchConfirmFrames) this.pinch.isPinching = true;
      } else if (this.pinch.isPinching && pinchDist > GESTURE.pinchOff) {
        this.pinch.isPinching = false; this.pinch.confirm = 0;
      } else if (pinchDist >= GESTURE.pinchOn) {
        this.pinch.confirm = 0;
      }
      const pmx = (lm[THUMB_TIP].x + lm[IDX_TIP].x) / 2;
      const pmy = (lm[THUMB_TIP].y + lm[IDX_TIP].y) / 2;
      state.pinch.isPinching = this.pinch.isPinching;
      state.pinch.startEdge = !wasPinching && this.pinch.isPinching;
      state.pinch.endEdge = wasPinching && !this.pinch.isPinching;
      state.pinch.point = mapper.toScreen(pmx, pmy);
      state.pinch.ndc = mapper.toNdc(pmx, pmy);

      // ---- swipe (velocity buffer + refractory) ----
      state.swipe = this._swipe(active, mapper, nowMs);
    }

    // ---- two-hand ----
    if (hands.length >= 2) {
      const a = hands[0], b = hands[1];
      const aspect = a.handSize ? 1 : 1; // palm coords already comparable; use raw
      const dx = (a.palm.x - b.palm.x);
      const dy = (a.palm.y - b.palm.y);
      const d = Math.hypot(dx, dy);
      const theta = Math.atan2(b.palm.y - a.palm.y, b.palm.x - a.palm.x);
      const mid = { x: (a.palm.x + b.palm.x) / 2, y: (a.palm.y + b.palm.y) / 2 };

      if (!this.two.hadTwo) {
        this.two.baselineD = d || 0.0001;
        this.two.baselineTheta = theta;
        this.two.prevMid = mid;
        this.two.hadTwo = true;
      }
      let ratio = d / this.two.baselineD;
      if (Math.abs(ratio - 1) < GESTURE.zoomDeadZone) ratio = 1;
      const twist = wrapToPi(theta - this.two.baselineTheta);
      const midScreen = mapper.toScreen(mid.x, mid.y);
      const mdx = this.two.prevMid ? (mid.x - this.two.prevMid.x) : 0;
      const mdy = this.two.prevMid ? (mid.y - this.two.prevMid.y) : 0;
      this.two.prevMid = mid;

      state.twoHand = { present: true, distRatio: ratio, twistDelta: twist, midpoint: midScreen, dx: mdx, dy: mdy };
    } else {
      this.two.hadTwo = false;
      this.two.prevMid = null;
    }

    return state;
  }

  _swipe(active, mapper, nowMs) {
    const out = { dir: null, fired: false };
    const hist = active.palmHist;
    if (!hist || hist.length < GESTURE.swipeBufferFrames) return out;
    if (nowMs < this.swipeLockUntil) return out;
    // require open-ish hand (not a fist/pinch) to count as a swipe
    if (active.fingersExtended < 3) return out;

    const oldest = hist[0], now = hist[hist.length - 1];
    const dt = now.t - oldest.t;
    if (dt <= 0) return out;
    const hs = active.handSize || 0.1;
    const vx = (now.x - oldest.x) / dt / hs;
    const vy = (now.y - oldest.y) / dt / hs;
    const speed = Math.hypot(vx, vy);
    if (speed < GESTURE.swipeSpeed) return out;

    const travelX = Math.abs(now.x - oldest.x) / hs;
    const travelY = Math.abs(now.y - oldest.y) / hs;

    let dir = null;
    if (Math.abs(vx) > GESTURE.swipeAxisRatio * Math.abs(vy) && travelX > GESTURE.swipeMinTravel) {
      // raw x increases to the user's right; display is mirrored -> flip
      dir = vx > 0 ? 'left' : 'right';
    } else if (Math.abs(vy) > GESTURE.swipeAxisRatio * Math.abs(vx) && travelY > GESTURE.swipeMinTravel) {
      dir = vy > 0 ? 'down' : 'up';
    }
    if (dir) { out.dir = dir; out.fired = true; this.swipeLockUntil = nowMs + GESTURE.swipeRefractoryMs; }
    return out;
  }
}
