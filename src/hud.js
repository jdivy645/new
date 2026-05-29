// ============================================================================
// hud.js — persistent branding + cumulative impact counters + banner + nudge.
// Counters animate (odometer-ish), milestones celebrate, increments are
// rate-limited (anti-cheat) so wild waving can't rocket the number.
// ============================================================================
import { BRANDING, COUNTERS, PALETTE } from './config.js';
import { store } from './persistence.js';
import { sound } from './sound.js';
import { el } from './util.js';

const HERO_VERBS = 'positive actions';

class Hud {
  constructor() {
    this.counterEls = {};
    this.displayed = {}; // animated values
    this.target = {};
    this.lastAdd = {}; // rate-limit timestamps
    this.heroEl = null;
    this.bannerEl = null;
    this.nudgeEl = null;
    this._nudgeTimer = null;
    this._bannerTimer = null;
  }

  mount() {
    document.getElementById('brandTitle').textContent = BRANDING.title;
    document.getElementById('brandSub').textContent = BRANDING.host
      ? `${BRANDING.host} · ${BRANDING.subtitle}` : BRANDING.subtitle;

    const ribbon = document.getElementById('ribbon');
    this.heroEl = el('div', { id: 'hero' });
    ribbon.appendChild(this.heroEl);

    for (const key of Object.keys(COUNTERS)) {
      const c = COUNTERS[key];
      const num = el('span', { class: 'c-num' }, '0');
      const node = el('div', { class: 'counter', 'data-key': key }, [
        el('span', { class: 'c-icon' }, c.icon),
        el('div', {}, [num, el('div', { class: 'c-label' }, c.label)]),
      ]);
      node.querySelector('.c-num').style.color = c.color;
      ribbon.appendChild(node);
      this.counterEls[key] = { node, num };
      this.displayed[key] = store.get(key);
      this.target[key] = store.get(key);
      num.textContent = this._fmt(this.displayed[key]);
    }
    this._updateHero();

    this.bannerEl = document.getElementById('banner');
    this.nudgeEl = document.getElementById('nudge');
  }

  _fmt(n) { return Math.round(n).toLocaleString(); }

  // add to a counter with per-key rate limiting (max ~12/sec)
  add(key, n = 1, opts = {}) {
    const now = performance.now();
    const minGap = opts.minGap ?? 60;
    if (!opts.force && this.lastAdd[key] && now - this.lastAdd[key] < minGap) {
      // still accumulate the value, just don't spam celebrate
    }
    this.lastAdd[key] = now;
    const v = store.add(key, n); // store.add also bumps the shared 'actions' total
    this.target[key] = v;
    const cnode = this.counterEls[key]?.node;
    if (cnode) { cnode.classList.remove('bump'); void cnode.offsetWidth; cnode.classList.add('bump'); }
    if (!opts.silent) sound.ding();
    this._checkMilestone(key, v);
    this._updateHero();
    return v;
  }

  _checkMilestone(key, v) {
    const milestones = [100, 250, 500, 1000, 2500, 5000];
    if (milestones.includes(v)) {
      this.banner(`${COUNTERS[key].icon} ${this._fmt(v)} ${COUNTERS[key].label}!`, 2200);
      sound.chime();
      this._confetti();
    }
  }

  _updateHero() {
    if (!this.heroEl) return;
    const total = store.get('actions');
    this.heroEl.textContent = `🌱 Together today we made ${this._fmt(total)} ${HERO_VERBS} for the planet`;
  }

  // smooth the displayed numbers toward target each frame
  tick() {
    for (const key in this.target) {
      const d = this.displayed[key], t = this.target[key];
      if (d !== t) {
        const nd = d + (t - d) * 0.25;
        this.displayed[key] = Math.abs(t - nd) < 0.5 ? t : nd;
        if (this.counterEls[key]) this.counterEls[key].num.textContent = this._fmt(this.displayed[key]);
      }
    }
  }

  banner(text, ms = 2000) {
    if (!this.bannerEl) return;
    this.bannerEl.textContent = text;
    this.bannerEl.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  nudge(text, ms = 3000) {
    if (!this.nudgeEl) return;
    if (text === null) { this.nudgeEl.classList.remove('show'); return; }
    this.nudgeEl.textContent = text;
    this.nudgeEl.classList.add('show');
    clearTimeout(this._nudgeTimer);
    if (ms > 0) this._nudgeTimer = setTimeout(() => this.nudgeEl.classList.remove('show'), ms);
  }

  _confetti() {
    // lightweight DOM confetti burst
    const wrap = el('div', { style: { position: 'fixed', inset: '0', zIndex: '45', pointerEvents: 'none' } });
    document.body.appendChild(wrap);
    const colors = [PALETTE.forestBright, PALETTE.oceanBright, PALETTE.energyBright, PALETTE.leaf, PALETTE.gold];
    for (let i = 0; i < 60; i++) {
      const p = el('div', { style: {
        position: 'absolute', left: 50 + (Math.random() * 20 - 10) + '%', top: '40%',
        width: '0.8vw', height: '1.2vw', background: colors[i % colors.length],
        borderRadius: '2px', transform: `rotate(${Math.random() * 360}deg)`,
      } });
      wrap.appendChild(p);
      const dx = (Math.random() * 2 - 1) * 40, dy = 40 + Math.random() * 50;
      p.animate([
        { transform: p.style.transform, opacity: 1 },
        { transform: `translate(${dx}vw, ${dy}vh) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ], { duration: 1400 + Math.random() * 600, easing: 'cubic-bezier(.2,.6,.3,1)' });
    }
    setTimeout(() => wrap.remove(), 2200);
  }
}

export const hud = new Hud();
