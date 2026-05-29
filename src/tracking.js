// ============================================================================
// tracking.js — owns the camera + MediaPipe HandLandmarker.
// Produces, each frame, an array of smoothed HandData with stable identity.
// Detection runs on the UNFLIPPED frame; mirroring is done at the mapping layer.
// ============================================================================
import { PATHS, CAMERA, TRACKING } from './config.js';
import { clamp, lerp, adaptiveAlpha, dist2 } from './util.js';

// MediaPipe landmark indices
const WRIST = 0, MID_MCP = 9, IDX_MCP = 5, PINKY_MCP = 17;
const TIPS = [8, 12, 16, 20];     // index, middle, ring, pinky tips
const PIPS = [6, 10, 14, 18];     // matching PIP joints

export class HandTracker {
  constructor() {
    this.landmarker = null;
    this.video = null;
    this.stream = null;
    this.lastVideoTime = -1;
    this.delegate = 'GPU';
    this.ready = false;
    this.aspect = 16 / 9;
    // identity tracking: previous hands keyed by id
    this._tracked = []; // [{id, wrist:{x,y}, lm:[], palmHist:[], label}]
    this._nextId = 0;
    this.onStatus = () => {};
  }

  async init(videoEl) {
    this.video = videoEl;
    // Kick off the camera prompt IMMEDIATELY so the user sees it right away,
    // and download the model concurrently while they click Allow.
    this.onStatus('Starting camera…');
    const camPromise = this.startCamera();
    camPromise.catch(() => {}); // mark handled; the real await below still throws

    this.onStatus('Loading hand-tracking model…');
    const mp = await import(/* @vite-ignore */ PATHS.mpModule);
    const { HandLandmarker, FilesetResolver } = mp;
    const vision = await FilesetResolver.forVisionTasks(PATHS.mpWasm);

    const makeOpts = (delegate) => ({
      baseOptions: { modelAssetPath: PATHS.handModel, delegate },
      runningMode: 'VIDEO',
      numHands: TRACKING.numHands,
      minHandDetectionConfidence: TRACKING.minHandDetectionConfidence,
      minHandPresenceConfidence: TRACKING.minHandPresenceConfidence,
      minTrackingConfidence: TRACKING.minTrackingConfidence,
    });

    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, makeOpts('GPU'));
      this.delegate = 'GPU';
    } catch (e) {
      console.warn('[tracking] GPU delegate failed, falling back to CPU:', e);
      this.onStatus('Using CPU hand tracking…');
      this.landmarker = await HandLandmarker.createFromOptions(vision, makeOpts('CPU'));
      this.delegate = 'CPU';
    }

    this.onStatus('Waiting for camera…');
    await camPromise; // throws here if the camera was denied/unavailable
    this.ready = true;
    this.onStatus('Ready');
  }

  async startCamera() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: CAMERA.width }, height: { ideal: CAMERA.height }, facingMode: CAMERA.facingMode },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    await new Promise((res) => {
      if (this.video.videoWidth) return res();
      this.video.onloadedmetadata = () => res();
    });
    this.aspect = (this.video.videoWidth || CAMERA.width) / (this.video.videoHeight || CAMERA.height);
  }

  stopCamera() {
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
  }

  destroy() {
    this.stopCamera();
    if (this.landmarker) { try { this.landmarker.close(); } catch (_) {} this.landmarker = null; }
  }

  get videoWidth() { return this.video?.videoWidth || CAMERA.width; }
  get videoHeight() { return this.video?.videoHeight || CAMERA.height; }

  // Returns { hands: HandData[], freshFrame: boolean }.
  detect(nowMs) {
    if (!this.ready || !this.landmarker) return { hands: [], freshFrame: false };
    // Only infer on a NEW video frame; timestamp must strictly increase.
    if (this.video.currentTime === this.lastVideoTime) {
      return { hands: this._lastHands || [], freshFrame: false };
    }
    this.lastVideoTime = this.video.currentTime;

    let res;
    try {
      res = this.landmarker.detectForVideo(this.video, nowMs);
    } catch (e) {
      console.warn('[tracking] detect error', e);
      return { hands: this._lastHands || [], freshFrame: false };
    }

    const raw = [];
    const n = res?.landmarks?.length || 0;
    for (let h = 0; h < n; h++) {
      const lm = res.landmarks[h];
      if (!lm || lm.length < 21) continue;
      const handSize = this._handSize(lm);
      if (handSize < TRACKING.minHandSize || handSize > TRACKING.maxHandSize) continue;
      const label = res.handedness?.[h]?.[0]?.categoryName || 'Right';
      const score = res.handedness?.[h]?.[0]?.score || 1;
      if (score < TRACKING.presenceConfidence && n > 1) continue;
      raw.push({ lm, handSize, label });
    }

    const hands = this._assignIdentity(raw);
    this._lastHands = hands;
    return { hands, freshFrame: true };
  }

  _handSize(lm) {
    return dist2(lm[WRIST].x * this.aspect, lm[WRIST].y, lm[MID_MCP].x * this.aspect, lm[MID_MCP].y);
  }

  _palmCenter(lm) {
    let x = 0, y = 0;
    for (const i of [WRIST, IDX_MCP, MID_MCP, 13, PINKY_MCP]) { x += lm[i].x; y += lm[i].y; }
    return { x: x / 5, y: y / 5 };
  }

  // Per-finger extension [index, middle, ring, pinky]: tip is farther from the
  // wrist than its PIP joint when the finger is extended (rotation-invariant).
  _fingerStates(lm) {
    const wrist = lm[WRIST];
    const arr = [false, false, false, false];
    for (let i = 0; i < TIPS.length; i++) {
      const tip = lm[TIPS[i]], pip = lm[PIPS[i]];
      const dTip = dist2(tip.x, tip.y, wrist.x, wrist.y);
      const dPip = dist2(pip.x, pip.y, wrist.x, wrist.y);
      arr[i] = dTip > dPip * 1.06;
    }
    return arr;
  }

  // Match raw hands to tracked identities by nearest wrist; smooth landmarks.
  _assignIdentity(raw) {
    const used = new Set();
    const out = [];

    for (const r of raw) {
      const wrist = r.lm[WRIST];
      // find nearest existing tracked hand within radius
      let best = -1, bestD = 0.15;
      for (let t = 0; t < this._tracked.length; t++) {
        if (used.has(t)) continue;
        const d = dist2(wrist.x, wrist.y, this._tracked[t].wrist.x, this._tracked[t].wrist.y);
        if (d < bestD) { bestD = d; best = t; }
      }
      let track;
      if (best >= 0) { track = this._tracked[best]; used.add(best); }
      else { track = { id: String.fromCharCode(65 + (this._nextId++ % 2)), wrist: { ...wrist }, lm: null, palmHist: [] }; }

      // smooth landmarks (EMA, adaptive alpha by palm speed)
      const palm = this._palmCenter(r.lm);
      let speed = 0;
      if (track.lm) {
        const pPalm = this._palmCenter(track.lm);
        speed = dist2(palm.x, palm.y, pPalm.x, pPalm.y);
      }
      const alpha = adaptiveAlpha(speed, TRACKING.emaAlphaSlow, TRACKING.emaAlphaFast);
      const sm = new Array(21);
      for (let i = 0; i < 21; i++) {
        if (track.lm) {
          sm[i] = {
            x: lerp(track.lm[i].x, r.lm[i].x, alpha),
            y: lerp(track.lm[i].y, r.lm[i].y, alpha),
            z: lerp(track.lm[i].z, r.lm[i].z, alpha),
          };
        } else sm[i] = { x: r.lm[i].x, y: r.lm[i].y, z: r.lm[i].z };
      }
      track.lm = sm;
      track.wrist = { x: sm[WRIST].x, y: sm[WRIST].y };
      track.label = r.label;

      const smPalm = this._palmCenter(sm);
      const now = performance.now();
      track.palmHist.push({ x: smPalm.x, y: smPalm.y, t: now });
      if (track.palmHist.length > 8) track.palmHist.shift();

      const fingers = this._fingerStates(sm);
      out.push({
        id: track.id,
        label: r.label,
        lm: sm,
        handSize: r.handSize,
        palm: smPalm,
        palmHist: track.palmHist,
        fingers,
        fingersExtended: fingers.reduce((n, b) => n + (b ? 1 : 0), 0),
        rawHandSize: r.handSize,
      });
    }

    // keep only tracked hands that were matched/created this frame
    this._tracked = out.map((o) => ({ id: o.id, wrist: { x: o.lm[WRIST].x, y: o.lm[WRIST].y }, lm: o.lm, palmHist: o.palmHist, label: o.label }));
    return out;
  }

  // Average frame brightness 0..1 (for dark-room detection). Cheap: 32x18 sample.
  sampleBrightness(scratchCanvas) {
    if (!this.video || !this.video.videoWidth) return 1;
    const c = scratchCanvas;
    c.width = 32; c.height = 18;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(this.video, 0, 0, 32, 18);
    const data = ctx.getImageData(0, 0, 32, 18).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    return clamp(sum / (data.length / 4) / 255, 0, 1);
  }
}
