// ============================================================================
// persistence.js — date-keyed cumulative counters in localStorage.
// Resets each event day, survives refresh/reboot, debounced writes,
// try/catch fallback to in-memory if storage is unavailable.
// ============================================================================
import { LS_NS } from './config.js';
import { todayKey } from './util.js';

class Store {
  constructor() {
    this.day = todayKey();
    this.mem = this._defaults();
    this._dirty = false;
    this._timer = null;
    this._load();
    // flush on tab hide / close so an all-day kiosk never loses the tally
    window.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
    window.addEventListener('beforeunload', () => this.flush());
  }

  _defaults() {
    return { day: this.day, forest: 0, ocean: 0, earth: 0, energy: 0, actions: 0, sessions: 0, sound: null, handprints: [] };
  }

  _load() {
    try {
      const raw = localStorage.getItem(LS_NS);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.day === this.day) { this.mem = Object.assign(this._defaults(), data); return; }
        // keep a rolling all-time backup, then reset for the new day
        if (data) localStorage.setItem(LS_NS + '_lastday', raw);
      }
    } catch (e) { console.warn('[persist] load failed, in-memory only', e); }
    this.mem = this._defaults();
    this.flush();
  }

  _scheduleWrite() {
    this._dirty = true;
    if (this._timer) return;
    this._timer = setTimeout(() => { this._timer = null; this.flush(); }, 1000);
  }

  flush() {
    if (!this._dirty && this._loadedOnce) return;
    this._loadedOnce = true;
    try {
      // keep a last-good snapshot so a corrupt write is recoverable
      const prev = localStorage.getItem(LS_NS);
      if (prev) localStorage.setItem(LS_NS + '_bak', prev);
      localStorage.setItem(LS_NS, JSON.stringify(this.mem));
      this._dirty = false;
    } catch (e) { /* storage blocked — stay in-memory */ }
  }

  get(key) { return this.mem[key] || 0; }

  add(key, n = 1) {
    this.mem[key] = (this.mem[key] || 0) + n;
    this.mem.actions = (this.mem.actions || 0) + (key === 'actions' ? 0 : n);
    this._scheduleWrite();
    return this.mem[key];
  }

  bumpSession() { this.mem.sessions = (this.mem.sessions || 0) + 1; this._scheduleWrite(); }

  // sound preference (null = use default)
  getSoundPref() { return this.mem.sound; }
  setSoundPref(on) { this.mem.sound = !!on; this._scheduleWrite(); }

  // handprint wall (store small dataURLs, ring-buffer)
  addHandprint(dataUrl, cap = 60) {
    if (!this.mem.handprints) this.mem.handprints = [];
    this.mem.handprints.push(dataUrl);
    while (this.mem.handprints.length > cap) this.mem.handprints.shift();
    this._scheduleWrite();
  }
  getHandprints() { return this.mem.handprints || []; }

  resetDay() {
    const sound = this.mem.sound;
    this.mem = this._defaults();
    this.mem.sound = sound; // keep operator's sound choice
    this.flush();
  }
}

export const store = new Store();
