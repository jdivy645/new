// ============================================================================
// tabManager.js — touch-free dwell-to-switch tab rail with a progress ring,
// plus a real <button> click/keyboard fallback (works even if the camera dies).
// Cursor is fed every frame regardless of active tab so switching always works.
// ============================================================================
import { TABS, DWELL } from './config.js';
import { sound } from './sound.js';
import { el } from './util.js';

const RING_R = 47;
const RING_C = 2 * Math.PI * RING_R; // circumference

export class TabManager {
  constructor(onSwitch) {
    this.onSwitch = onSwitch;
    this.activeId = TABS[0].id;
    this.tabs = {}; // id -> { node, ringFg, rect, progress, dwelling }
    this.cooldownUntil = 0;
    this._buildRail();
    window.addEventListener('resize', () => this._measure());
    window.addEventListener('keydown', (e) => this._onKey(e));
  }

  _buildRail() {
    const rail = document.getElementById('tabrail');
    rail.innerHTML = '';
    TABS.forEach((t, i) => {
      const ringFg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ringFg.setAttribute('class', 'ring-fg');
      ringFg.setAttribute('cx', '50'); ringFg.setAttribute('cy', '50'); ringFg.setAttribute('r', String(RING_R));
      ringFg.style.strokeDasharray = String(RING_C);
      ringFg.style.strokeDashoffset = String(RING_C);

      const ringBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ringBg.setAttribute('class', 'ring-bg');
      ringBg.setAttribute('cx', '50'); ringBg.setAttribute('cy', '50'); ringBg.setAttribute('r', String(RING_R));

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ring'); svg.setAttribute('viewBox', '0 0 100 100');
      svg.appendChild(ringBg); svg.appendChild(ringFg);

      const node = el('button', {
        class: 'tab' + (i === 0 ? ' active' : ''),
        'data-id': t.id,
        'aria-label': t.name,
        title: t.name,
        onclick: () => this.switchTo(t.id, true),
      }, [
        el('span', { class: 'tab-icon' }, t.icon),
        el('span', { class: 'tab-name' }, t.name),
      ]);
      node.appendChild(svg);
      rail.appendChild(node);

      this.tabs[t.id] = { node, ringFg, rect: null, progress: 0, dwelling: false };
    });
    this._measure();
  }

  _measure() {
    for (const id in this.tabs) {
      const r = this.tabs[id].node.getBoundingClientRect();
      this.tabs[id].rect = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 };
    }
  }

  _onKey(e) {
    const ids = TABS.map((t) => t.id);
    const idx = ids.indexOf(this.activeId);
    if (e.key === 'ArrowRight') this.switchTo(ids[(idx + 1) % ids.length], true);
    else if (e.key === 'ArrowLeft') this.switchTo(ids[(idx - 1 + ids.length) % ids.length], true);
    else if (e.key >= '1' && e.key <= String(ids.length)) this.switchTo(ids[+e.key - 1], true);
  }

  switchTo(id, immediate = false) {
    if (id === this.activeId) return;
    const prev = this.activeId;
    this.activeId = id;
    for (const tid in this.tabs) this.tabs[tid].node.classList.toggle('active', tid === id);
    this._resetAll();
    if (immediate) this.cooldownUntil = performance.now() + DWELL.cooldownMs;
    sound.select();
    this.onSwitch(id, prev);
  }

  _resetAll() {
    for (const id in this.tabs) { this.tabs[id].progress = 0; this.tabs[id].dwelling = false; this._draw(id); }
  }

  _draw(id) {
    const t = this.tabs[id];
    t.ringFg.style.strokeDashoffset = String(RING_C * (1 - t.progress));
    t.node.classList.toggle('dwelling', t.dwelling && t.progress > 0.02);
  }

  // Called every frame with the gesture state. cursor = {x,y} px or null.
  update(gestureState, nowMs, dtMs) {
    const cursor = gestureState?.cursor;
    const canDwell = cursor && gestureState.present && !gestureState.pinch.isPinching && nowMs > this.cooldownUntil;

    for (const id of Object.keys(this.tabs)) {
      const t = this.tabs[id];
      if (!t.rect) continue;
      const inside = canDwell && this._hit(cursor, t.rect, t.dwelling);
      if (inside) {
        if (id === this.activeId) { // already here — no need to dwell
          t.progress = 0; t.dwelling = false; this._draw(id); continue;
        }
        t.dwelling = true;
        t.progress = Math.min(1, t.progress + dtMs / DWELL.ms);
        if (t.progress >= 1) { this.switchTo(id, false); continue; }
      } else {
        // decay (not snap) so a brief dropout doesn't waste the user's effort
        if (t.progress > 0) t.progress = Math.max(0, t.progress - dtMs / DWELL.decayMs);
        t.dwelling = t.progress > 0;
      }
      this._draw(id);
    }
  }

  // hover hysteresis: enter at r, leave at r*1.25
  _hit(cursor, rect, currentlyInside) {
    const d = Math.hypot(cursor.x - rect.cx, cursor.y - rect.cy);
    const r = currentlyInside ? rect.r * DWELL.hoverHysteresis : rect.r;
    return d <= r;
  }
}
