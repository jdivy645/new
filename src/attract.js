// ============================================================================
// attract.js — idle "no hands" loop that pulls a crowd.
// Auto-cycles the 4 tabs and feeds each a SCRIPTED ghost-hand gesture through
// the SAME code path real input uses, so the demo is a true preview.
// Anti-burn-in: the CTA drifts on a slow Lissajous; never a full-white frame.
// ============================================================================
import { TABS, FEATURES } from './config.js';
import { store } from './persistence.js';

const CYCLE_MS = 4200; // time per tab in the sizzle loop

class Attract {
  constructor() {
    this.active = false;
    this.cycleStart = 0;
    this.cycleIdx = 0;
    this.t = 0;
    this.overlay = null;
    this.noCycle = false; // when deep-linked (?tab=), stay on the chosen tab
  }

  init({ switchTo, env }) {
    this.switchTo = switchTo;
    this.env = env;
    this.overlay = document.getElementById('attract');
    this.cta = document.getElementById('attractCta');
    this.wall = document.getElementById('attractWall');
    this.pip = document.getElementById('pip');
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.cycleStart = performance.now();
    this.cycleIdx = TABS.findIndex((t) => t.id === (this.env?.activeId)) || 0;
    this.overlay.classList.remove('hidden');
    this._renderWall();
    this._startPip();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.overlay.classList.add('hidden');
    this._stopPip();
  }

  async _startPip() {
    if (!FEATURES.cameraPip || !this.pip) return;
    try {
      const cam = document.getElementById('cam');
      if (cam && cam.srcObject) { this.pip.srcObject = cam.srcObject; await this.pip.play(); this.pip.classList.remove('hidden'); }
    } catch (_) { this.pip?.classList.add('hidden'); }
  }
  _stopPip() { if (this.pip) { this.pip.pause?.(); } }

  _renderWall() {
    if (!this.wall) return;
    this.wall.innerHTML = '';
    const prints = store.getHandprints();
    for (const url of prints.slice(-24)) {
      const img = new Image();
      img.src = url; img.style.width = '4vw'; img.style.height = '4vw'; img.style.opacity = '0.8';
      this.wall.appendChild(img);
    }
  }

  // Called each frame while in ATTRACT. Switches tab on cycle boundary and
  // returns a synthetic gestureState to feed the active tab. activeId in/out.
  update(now, dt, activeId) {
    this.t += dt;
    // anti-burn-in drift of the CTA
    if (this.cta) {
      const dx = Math.sin(now / 4200) * 1.4, dy = Math.cos(now / 5300) * 1.0;
      this.cta.style.transform = `translate(${dx}vw, ${dy}vw)`;
    }
    // cycle tabs (disabled when deep-linked to a single experience)
    if (!this.noCycle && now - this.cycleStart > CYCLE_MS) {
      this.cycleStart = now;
      this.cycleIdx = (this.cycleIdx + 1) % TABS.length;
      this.switchTo(TABS[this.cycleIdx].id);
    }
    return this._ghost(activeId, now);
  }

  // produce a scripted gesture for the current tab's demo
  _ghost(activeId, now) {
    const W = this.env.width, H = this.env.height;
    const phase = (now / 1000) % 6;
    // base looping cursor path
    const cx = W * (0.5 + 0.28 * Math.sin(now / 1500));
    const cy = H * (0.55 + 0.18 * Math.sin(now / 900));
    const gs = {
      present: true,
      hands: [],
      active: { id: 'G', label: 'Right', palm: { x: 1 - cx / W, y: cy / H }, handSize: 0.16, fingersExtended: 5 },
      openPalm: true, spread: 0.5, fist: false,
      pinch: { isPinching: false, startEdge: false, endEdge: false, point: { x: cx, y: cy }, ndc: { x: (cx / W) * 2 - 1, y: -((cy / H) * 2 - 1) } },
      swipe: { dir: null, fired: false },
      twoHand: { present: false, distRatio: 1, twistDelta: 0, midpoint: null, dx: 0, dy: 0 },
      cursor: { x: cx, y: cy },
      ghost: true,
    };

    switch (activeId) {
      case 'forest':
        gs.openPalm = true; gs.spread = 0.6 + 0.4 * Math.sin(now / 700);
        break;
      case 'ocean':
        // S-curve squeegee
        gs.cursor.x = W * (0.5 + 0.34 * Math.sin(now / 1200));
        gs.cursor.y = H * (0.5 + 0.28 * Math.sin(now / 600));
        gs.openPalm = true;
        break;
      case 'earth':
        // rotate, with periodic pinch-heal
        gs.cursor.x = W * (0.5 + 0.2 * Math.sin(now / 1800));
        gs.cursor.y = H * (0.5 + 0.1 * Math.cos(now / 1600));
        gs.pinch.point = { x: gs.cursor.x, y: gs.cursor.y };
        gs.pinch.ndc = { x: (gs.cursor.x / W) * 2 - 1, y: -((gs.cursor.y / H) * 2 - 1) };
        if (phase > 2 && phase < 2.12) { gs.pinch.isPinching = true; gs.pinch.startEdge = true; }
        break;
      case 'energy':
        // fast wave then palm-to-sun
        if (phase < 3) {
          gs.cursor.x = W * (0.4 + 0.18 * Math.sin(now / 220)); // fast = wind
          gs.cursor.y = H * 0.55;
        } else {
          gs.cursor.x = W * 0.32; gs.cursor.y = H * 0.22; // palm to sun (top-left)
          gs.openPalm = true;
        }
        break;
    }
    return gs;
  }
}

export const attract = new Attract();
