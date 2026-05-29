// ============================================================================
// pledge.js — optional, privacy-first handprint pledge (no face photo).
// After enough activity, invites the visitor to hold an open palm still; we
// build a stylized handprint from the 21 landmarks onto a shareable card and
// add it to the attract-screen "wall of handprints". Fully local/offline.
// ============================================================================
import { BRANDING, FEATURES, PALETTE, COUNTERS } from './config.js';
import { store } from './persistence.js';
import { sound } from './sound.js';
import { el, dist2, convexHull } from './util.js';

const PLEDGES = [
  'I will plant a tree 🌱',
  'I will cut single-use plastic ♻️',
  'I will save water 💧',
  'I will switch off when not in use ⚡',
];

class Pledge {
  constructor() {
    this.env = null;
    this.offering = false;
    this.offered = false;
    this.holdMs = 0;
    this.prevState = 'ATTRACT';
    this.sessionBaseline = 0;
    this.open = false;
    this.selected = 0;
  }

  init(env) {
    this.env = env;
    this.overlay = document.getElementById('pledge');
  }

  // called each frame from main
  maybeOffer(appState, gs, now) {
    if (!FEATURES.pledge) return;
    if (this.open) { this._tickOpen(gs, now); return; }

    // new session begins
    if (appState === 'ACTIVE' && this.prevState !== 'ACTIVE') {
      this.sessionBaseline = store.get('actions');
      this.offered = false; this.offering = false; this.holdMs = 0;
    }
    this.prevState = appState;
    if (appState !== 'ACTIVE') { this.offering = false; this.env.hud.nudge(null); return; }

    const did = store.get('actions') - this.sessionBaseline;
    if (!this.offered && did >= 6) {
      this.offering = true;
    }
    if (this.offering && !this.offered) {
      // need a real hand with landmarks, open palm, held steady
      const active = gs.active;
      const steady = gs.openPalm && active && active.lm && this._isSteady(gs, now);
      if (steady) {
        this.holdMs += 16;
        this.env.hud.nudge(`✋ Hold still… ${Math.ceil((1500 - this.holdMs) / 100) / 10}s`, 1000);
        if (this.holdMs >= 1500) { this._capture(gs); }
      } else {
        this.holdMs = Math.max(0, this.holdMs - 24);
        this.env.hud.nudge('✋ Hold your open hand still to leave a pledge', 1500);
      }
    }
  }

  _isSteady(gs, now) {
    const c = gs.cursor;
    if (!this._prevC) { this._prevC = { ...c, t: now }; return false; }
    const d = dist2(c.x, c.y, this._prevC.x, this._prevC.y);
    this._prevC = { ...c, t: now };
    return d < 6; // px/frame
  }

  _capture(gs) {
    this.offered = true; this.offering = false; this.holdMs = 0;
    this.env.hud.nudge(null);
    sound.heal();
    const card = this._renderCard(gs.active.lm);
    const url = card.toDataURL('image/png');
    store.addHandprint(url);
    this._show(card);
  }

  // build a stylized handprint card from 21 normalized landmarks
  _renderCard(lm) {
    const W = 720, H = 900;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // background
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d3a2e'); g.addColorStop(1, '#06140f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // title
    ctx.fillStyle = PALETTE.leaf; ctx.textAlign = 'center';
    ctx.font = '800 46px Segoe UI, Arial';
    ctx.fillText(BRANDING.title, W / 2, 70);
    ctx.font = '400 24px Segoe UI, Arial'; ctx.fillStyle = PALETTE.inkDim || '#a9c6b4';
    ctx.fillText('My pledge for the planet', W / 2, 108);

    // map landmarks into a centered box (mirror x for selfie)
    const box = { x: 110, y: 150, w: 500, h: 480 };
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    const pts = lm.map((p) => ({ x: 1 - p.x, y: p.y }));
    for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const sw = (maxX - minX) || 1, sh = (maxY - minY) || 1;
    const sc = Math.min(box.w / sw, box.h / sh) * 0.9;
    const ox = box.x + box.w / 2, oy = box.y + box.h / 2;
    const ax = (maxX + minX) / 2, ay = (maxY + minY) / 2;
    const P = pts.map((p) => ({ x: ox + (p.x - ax) * sc, y: oy + (p.y - ay) * sc }));

    // palm fill (convex hull) with glow
    const hull = convexHull(P);
    ctx.save();
    ctx.shadowColor = 'rgba(87,217,138,0.6)'; ctx.shadowBlur = 40;
    ctx.beginPath();
    hull.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    const hg = ctx.createRadialGradient(ox, oy, 20, ox, oy, box.w * 0.6);
    hg.addColorStop(0, 'rgba(143,227,136,0.55)'); hg.addColorStop(1, 'rgba(46,139,87,0.25)');
    ctx.fillStyle = hg; ctx.fill();
    ctx.restore();

    // finger bones
    const bones = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    ctx.strokeStyle = PALETTE.forestBright; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [a, b] of bones) { ctx.beginPath(); ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); ctx.stroke(); }
    // tip dots
    ctx.fillStyle = PALETTE.gold;
    for (const i of [4, 8, 12, 16, 20]) { ctx.beginPath(); ctx.arc(P[i].x, P[i].y, 10, 0, Math.PI * 2); ctx.fill(); }

    // pledge line
    ctx.fillStyle = PALETTE.ink || '#f2fbf4'; ctx.font = '800 38px Segoe UI, Arial';
    ctx.fillText(PLEDGES[this.selected], W / 2, 720);

    // collective impact
    ctx.font = '400 22px Segoe UI, Arial'; ctx.fillStyle = PALETTE.inkDim || '#a9c6b4';
    const total = store.get('actions');
    ctx.fillText(`Together today: ${total.toLocaleString()} positive actions`, W / 2, 770);
    ctx.fillText(`🌳 ${store.get('forest')}  ·  ♻️ ${store.get('ocean')}  ·  🌍 ${store.get('earth')}  ·  ⚡ ${store.get('energy')} kg CO₂`, W / 2, 805);
    ctx.font = '700 20px Segoe UI, Arial'; ctx.fillStyle = PALETTE.gold;
    ctx.fillText('📸 Take a photo to keep your pledge', W / 2, 860);
    return c;
  }

  _show(card) {
    this.open = true;
    this.openUntil = performance.now() + 9000;
    this.overlay.innerHTML = '';
    card.className = 'pledge-card';
    card.style.maxHeight = '70vh'; card.style.width = 'auto';
    this.overlay.appendChild(el('h2', {}, 'Your pledge 🌱'));
    this.overlay.appendChild(card);
    const row = el('div', { class: 'pledge-row' });
    const dl = el('button', { class: 'pledge-chip', onclick: () => {
      const a = document.createElement('a'); a.href = card.toDataURL('image/png'); a.download = 'my-pledge.png'; a.click();
    } }, '⬇ Download');
    const done = el('button', { class: 'pledge-chip', onclick: () => this._close() }, 'Done ✓');
    row.appendChild(dl); row.appendChild(done);
    this.overlay.appendChild(row);
    this.overlay.classList.remove('hidden');
  }

  _tickOpen(gs, now) {
    if (now > this.openUntil || (!gs.present && now > this.openUntil - 6000)) this._close();
  }

  _close() {
    this.open = false;
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
  }
}

export const pledge = new Pledge();
