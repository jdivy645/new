// ============================================================================
// util.js — math, smoothing, object pooling, screen mapping, error boundary.
// No external dependencies.
// ============================================================================

// --- Math -------------------------------------------------------------------
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mapLinear = (v, a1, a2, b1, b2) => b1 + ((v - a1) * (b2 - b1)) / (a2 - a1);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const dist2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const wrapToPi = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const smoothstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Seeded RNG (mulberry32) — deterministic visuals across reboots.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- EMA smoothing helper ---------------------------------------------------
// Velocity-adaptive alpha: smoother when slow, snappier when fast.
export function adaptiveAlpha(speed, slow, fast) {
  const t = clamp(speed / 0.02, 0, 1);
  return lerp(slow, fast, t);
}

// --- Coordinate mapping -----------------------------------------------------
// Normalized image coords (0..1, top-left) -> mirrored screen px, object-fit:cover.
export function makeMapper(videoW, videoH, screenW, screenH) {
  const scale = Math.max(screenW / videoW, screenH / videoH);
  const ox = (screenW - videoW * scale) / 2;
  const oy = (screenH - videoH * scale) / 2;
  return {
    // x is mirrored for selfie display
    toScreen(nx, ny) {
      const mx = 1 - nx;
      return { x: mx * videoW * scale + ox, y: ny * videoH * scale + oy };
    },
    // NDC for Three.js raycasting (mirrored)
    toNdc(nx, ny) {
      const mx = 1 - nx;
      return { x: mx * 2 - 1, y: -(ny * 2 - 1) };
    },
  };
}

// --- Object pool ------------------------------------------------------------
// Avoids per-frame allocation (no GC stutter in front of a crowd).
export class Pool {
  constructor(factory, size, reset) {
    this.factory = factory;
    this.reset = reset || (() => {});
    this.items = new Array(size);
    for (let i = 0; i < size; i++) this.items[i] = factory();
    this.active = [];
    this.free = this.items.slice();
  }
  spawn(init) {
    let o = this.free.pop();
    if (!o) {
      // recycle the oldest active rather than grow unboundedly
      o = this.active.shift();
      if (!o) return null;
    }
    this.reset(o);
    if (init) init(o);
    this.active.push(o);
    return o;
  }
  // call after integrating; remove dead (o.life<=0 by convention)
  sweep(isDead) {
    const next = [];
    for (const o of this.active) {
      if (isDead(o)) this.free.push(o);
      else next.push(o);
    }
    this.active = next;
  }
  get count() { return this.active.length; }
}

// --- Convex hull (for handprint pledge) -------------------------------------
export function convexHull(points) {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// --- Adaptive quality watchdog ----------------------------------------------
// Tracks frame time; .level steps 0(high)->1->2(low) under sustained load.
export class QualityGovernor {
  constructor(budgetMs, window) {
    this.budget = budgetMs;
    this.window = window;
    this.over = 0;
    this.under = 0;
    this.level = 0; // 0 = full quality, 2 = lowest
  }
  sample(frameMs) {
    if (frameMs > this.budget) { this.over++; this.under = 0; }
    else { this.under++; this.over = 0; }
    if (this.over >= this.window && this.level < 2) { this.level++; this.over = 0; }
    else if (this.under >= this.window * 3 && this.level > 0) { this.level--; this.under = 0; }
    return this.level;
  }
}

// --- Global error boundary + render watchdog --------------------------------
// Never show a stack trace to the public; fade to attract / auto-reload.
export function installErrorBoundary(onError) {
  window.addEventListener('error', (e) => {
    console.error('[boundary] error:', e.error || e.message);
    if (onError) try { onError(e.error || e.message); } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[boundary] rejection:', e.reason);
    if (onError) try { onError(e.reason); } catch (_) {}
  });
}

// Watchdog: if `beat()` isn't called within timeoutMs, run onStall.
export class Watchdog {
  constructor(timeoutMs, onStall) {
    this.timeout = timeoutMs;
    this.onStall = onStall;
    this.last = 0;
    this.started = false;
  }
  beat(now) { this.last = now; this.started = true; }
  check(now) {
    if (this.started && now - this.last > this.timeout) {
      this.started = false;
      try { this.onStall(); } catch (_) {}
    }
  }
}

// --- DOM helper -------------------------------------------------------------
export function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const k in props) {
    if (k === 'style') Object.assign(n.style, props[k]);
    else if (k === 'class') n.className = props[k];
    else if (k.startsWith('on') && typeof props[k] === 'function') n.addEventListener(k.slice(2).toLowerCase(), props[k]);
    else if (k === 'text') n.textContent = props[k];
    else n.setAttribute(k, props[k]);
  }
  for (const c of [].concat(children)) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}

// Today's date key (resets counters each event day, local time).
export function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
