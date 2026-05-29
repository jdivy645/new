// ============================================================================
// main.js — bootstrap + single render loop + ATTRACT/ACTIVE/COOLDOWN machine.
// ONE camera, ONE HandLandmarker, ONE rAF loop; only the active tab updates.
// ============================================================================
import { TABS, STATE, PERF, OPERATOR_RESET, FEATURES, BRANDING } from './config.js';
import { HandTracker } from './tracking.js';
import { GestureEngine } from './gestures.js';
import { TabManager } from './tabManager.js';
import { hud } from './hud.js';
import { sound } from './sound.js';
import { store } from './persistence.js';
import { attract } from './attract.js';
import { pledge } from './pledge.js';
import { makeMapper, QualityGovernor, Watchdog, installErrorBoundary, clamp } from './util.js';

import { ForestTab } from './tabs/forest.js';
import { OceanTab } from './tabs/ocean.js';
import { EarthTab } from './tabs/earth.js';
import { EnergyTab } from './tabs/energy.js';

const APP_STATE = { ATTRACT: 'ATTRACT', ACTIVE: 'ACTIVE', COOLDOWN: 'COOLDOWN' };

class App {
  constructor() {
    this.tracker = new HandTracker();
    this.engine = new GestureEngine();
    this.state = APP_STATE.ATTRACT;
    this.lastHandSeen = 0;
    this.lastNow = performance.now();
    this.governor = new QualityGovernor(PERF.frameBudgetMs, PERF.adaptiveWindow);
    this.brightScratch = document.createElement('canvas');
    this.darkFrames = 0;
    this.firstGesture = false;
    this._resetHold = null;

    this.canvas = document.getElementById('canvas2d');
    this.ctx = this.canvas.getContext('2d');
    this.threeMount = document.getElementById('three-mount');
    this.cursorEl = document.getElementById('cursor');
    this.cursorTagEl = document.getElementById('cursorTag');
    this.gestureBarEl = document.getElementById('gesturebar');

    this.env = {
      ctx: this.ctx, canvas: this.canvas, threeMount: this.threeMount,
      width: 0, height: 0, mapper: null, hud, sound, store, quality: 0, isAttract: false,
    };

    this.tabs = {
      forest: new ForestTab(),
      ocean: new OceanTab(),
      earth: new EarthTab(),
      energy: new EnergyTab(),
    };
    // Allow the landing page (or a deep link) to open a specific visualization
    // via ?tab=<id>, e.g. /app/?tab=ocean
    const wanted = new URLSearchParams(location.search).get('tab');
    this.activeId = TABS.some((t) => t.id === wanted) ? wanted : TABS[0].id;
  }

  async start() {
    installErrorBoundary(() => this._toAttract(true));
    // Embedded inside the landing page's iframe (or ?embed=1): the landing
    // provides Back + title, so hide our own brand bar + tab rail (no overlap).
    if (window.self !== window.top || new URLSearchParams(location.search).has('embed')) {
      document.body.classList.add('embed');
    }
    hud.mount();
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this.tabManager = new TabManager((id, prev) => this._onSwitch(id, prev));
    attract.init({ switchTo: (id) => this.tabManager.switchTo(id, true), env: this.env });
    attract.noCycle = new URLSearchParams(location.search).has('tab'); // stay on the launched experience
    if (FEATURES.pledge) pledge.init(this.env);

    this._wireControls();
    this._setupWakeLock();
    this.watchdog = new Watchdog(4000, () => this._toAttract(true));

    // activate first tab visually now (renders behind loading screen)
    this._onSwitch(this.activeId, null, true);

    // boot camera + model
    const loadingStatus = document.getElementById('loadingStatus');
    this.tracker.onStatus = (s) => { loadingStatus.textContent = s; };
    // Fallback: never hang on "Warming up…" forever — if the camera is slow to
    // initialize, show the experience anyway and keep connecting in the background.
    this._beginTimer = setTimeout(() => this._begin(), 12000);
    try {
      await this.tracker.init(document.getElementById('cam'));
      this._buildMapper();
    } catch (e) {
      console.error('[main] tracker init failed', e);
      this._showError(e);
      // keep the experience self-running as a demo even without a camera
    }
    this._begin();
  }

  // Hide the loading screen and start the render loop exactly once.
  _begin() {
    if (this._begun) return;
    this._begun = true;
    clearTimeout(this._beginTimer);
    document.getElementById('loading').classList.add('hidden');
    document.body.classList.add('is-attract');
    attract.start();
    requestAnimationFrame((t) => this._loop(t));
    this._retryCameraLoop();
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    // 2D canvas backing store at 1:1 CSS px (projectors ~1080p; bold art)
    this.canvas.width = w; this.canvas.height = h;
    this.env.width = w; this.env.height = h;
    this._buildMapper();
    for (const id in this.tabs) if (this.tabs[id].resize) this.tabs[id].resize(this.env);
  }

  _buildMapper() {
    const vw = this.tracker.videoWidth, vh = this.tracker.videoHeight;
    this.env.mapper = makeMapper(vw, vh, window.innerWidth, window.innerHeight);
  }

  _onSwitch(id, prev, initial = false) {
    if (prev && this.tabs[prev]) this.tabs[prev].deactivate?.();
    this.activeId = id;
    const isEarth = id === 'earth';
    this.canvas.classList.toggle('hidden', isEarth);
    this.threeMount.classList.toggle('active', isEarth);
    this.tabs[id].activate?.(this.env);
    this._updateGestureBar(this.tabs[id]);
    if (!initial) this.engine.reset?.();
  }

  _updateGestureBar(tab) {
    if (!this.gestureBarEl) return;
    const h = tab && tab.hints;
    if (!h) { this.gestureBarEl.innerHTML = ''; return; }
    const rows = [['point', '☝️', h.point], ['peace', '✌️', h.peace], ['palm', '✋', h.palm]];
    this.gestureBarEl.innerHTML = rows
      .map(([g, ico, label]) => `<div class="gb-row" data-g="${g}"><span class="gb-ico">${ico}</span><span class="gb-label">${label}</span></div>`)
      .join('');
  }

  _updateGestureUI(gs) {
    const name = gs.present ? gs.gestureName : null;
    if (this.gestureBarEl) for (const row of this.gestureBarEl.children) row.classList.toggle('on', row.dataset.g === name);
    if (this.cursorTagEl) { const map = { point: '☝️', peace: '✌️', palm: '✋' }; this.cursorTagEl.textContent = gs.pinch.isPinching ? '🤏' : (map[name] || ''); }
  }

  _wireControls() {
    const muteBtn = document.getElementById('muteBtn');
    const setMuteLabel = () => {
      muteBtn.innerHTML = sound.enabled ? '🔊 <span>Sound on</span>' : '🔇 <span>Sound off</span>';
      muteBtn.classList.toggle('on', sound.enabled);
    };
    setMuteLabel();
    muteBtn.addEventListener('click', () => { sound.resume(); sound.toggle(); setMuteLabel(); });

    document.getElementById('helpBtn').addEventListener('click', () => this._showHelp());
    document.getElementById('errRetry').addEventListener('click', () => this._retryCamera());

    window.addEventListener('keydown', (e) => {
      sound.resume();
      if (e.key === 'm' || e.key === 'M') { sound.toggle(); setMuteLabel(); }
      else if (e.key === 'h' || e.key === 'H') this._showHelp();
      else if (e.key === 'f' || e.key === 'F') this._toggleFullscreen();
      // operator reset (hold)
      if (e.code === OPERATOR_RESET.code && e.ctrlKey === !!OPERATOR_RESET.ctrl && e.altKey === !!OPERATOR_RESET.alt) {
        e.preventDefault();
        if (!this._resetHold) {
          this._resetHold = setTimeout(() => {
            store.resetDay();
            location.reload(); // simplest clean way to re-init counters/HUD
          }, OPERATOR_RESET.holdMs);
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === OPERATOR_RESET.code && this._resetHold) { clearTimeout(this._resetHold); this._resetHold = null; }
    });

    // first interaction unlocks audio context
    window.addEventListener('pointerdown', () => sound.resume(), { once: true });
  }

  _toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  _showHelp() {
    hud.nudge('✋ Raise a hand · ✊ open hand to act · 🤏 pinch · 🖐️🖐️ two hands · hover a tab to switch', 5000);
  }

  async _setupWakeLock() {
    this._wakeLock = null;
    const acquire = async () => {
      try { if ('wakeLock' in navigator) this._wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
    };
    await acquire();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) acquire(); });
  }

  // ---- camera error / retry ----
  _showError(e) {
    const panel = document.getElementById('errpanel');
    const msg = document.getElementById('errMsg');
    const name = e?.name || '';
    const text = (e?.message || '') + '';
    if (name === 'NotAllowedError') msg.textContent = 'Camera permission was blocked. Operator: allow the camera for this page, then press Try again.';
    else if (name === 'NotFoundError') msg.textContent = 'No camera found. Operator: connect the USB webcam, then press Try again.';
    else if (name === 'NotReadableError') msg.textContent = 'The camera is in use by another app. Operator: close it, then press Try again.';
    else if (/fetch|wasm|model|network|load|import/i.test(text)) { document.getElementById('errTitle').textContent = 'Could not load hand-tracking files'; msg.textContent = 'If this machine is offline, run download-vendor.ps1 and set OFFLINE = true in src/config.js. Otherwise check the internet connection, then press Try again.'; }
    else msg.textContent = 'Operator: check the camera connection. The demo keeps running meanwhile.';
    document.getElementById('loading').classList.add('hidden');
    panel.classList.remove('hidden');
  }

  async _retryCamera() {
    document.getElementById('errpanel').classList.add('hidden');
    try {
      if (!this.tracker.landmarker) await this.tracker.init(document.getElementById('cam'));
      else await this.tracker.startCamera();
      this._buildMapper();
    } catch (e) { this._showError(e); }
  }

  _retryCameraLoop() {
    // auto-recover if the webcam is re-plugged
    setInterval(async () => {
      if (!this.tracker.ready && this.tracker.landmarker) {
        try { await this.tracker.startCamera(); this._buildMapper(); this.tracker.ready = true;
          document.getElementById('errpanel').classList.add('hidden'); } catch (_) {}
      }
    }, 5000);
  }

  // ---- state machine ----
  _toAttract(force = false) {
    if (this.state === APP_STATE.ATTRACT && !force) return;
    this.state = APP_STATE.ATTRACT;
    this.env.isAttract = true;
    document.body.classList.add('is-attract');
    attract.start();
  }
  _toActive() {
    if (this.state === APP_STATE.ACTIVE) return;
    this.state = APP_STATE.ACTIVE;
    this.env.isAttract = false;
    document.body.classList.remove('is-attract');
    attract.stop();
    if (!this._sessionCounted) { store.bumpSession(); this._sessionCounted = true; }
  }

  _updateStateMachine(gs, now) {
    if (gs.present) {
      this.lastHandSeen = now;
      if (!this.firstGesture) { this.firstGesture = true; sound.resume(); }
      this._toActive();
    } else {
      const gap = now - this.lastHandSeen;
      if (this.state === APP_STATE.ACTIVE && gap > 600) { this.state = APP_STATE.COOLDOWN; this._sessionCounted = false; }
      if (this.state === APP_STATE.COOLDOWN && gap > STATE.cooldownMs) this._toAttract();
    }
  }

  _updateCursor(gs) {
    if (gs.present && gs.cursor) {
      this.cursorEl.classList.add('show');
      this.cursorEl.classList.toggle('pinch', gs.pinch.isPinching);
      this.cursorEl.style.left = gs.cursor.x + 'px';
      this.cursorEl.style.top = gs.cursor.y + 'px';
    } else this.cursorEl.classList.remove('show');
  }

  _checkEnvironment(now, freshFrame) {
    // dark-room detection (only when camera live, throttled)
    if (!this.tracker.ready) return;
    if (!this._lastBright || now - this._lastBright > 1500) {
      this._lastBright = now;
      const present = this.engine.presentFrames > 0;
      if (!present) {
        const b = this.tracker.sampleBrightness(this.brightScratch);
        if (b < 0.12) { this.darkFrames++; } else this.darkFrames = 0;
        if (this.darkFrames >= 3 && this.state === APP_STATE.ATTRACT) {
          hud.nudge('💡 Step into the light, or operator: add a front fill light', 2500);
        }
      } else this.darkFrames = 0;
    }
  }

  _loop(now) {
    const dt = Math.min(50, now - this.lastNow);
    this.lastNow = now;
    this.watchdog.beat(now);

    let gs;
    try {
      const { hands, freshFrame } = this.tracker.detect(now);
      gs = this.engine.update(hands, this.env.mapper, now);
      this._updateStateMachine(gs, now);
      this._updateCursor(gs);
      this._updateGestureUI(gs);
      this._checkEnvironment(now, freshFrame);

      // too-many-hands hint
      if (hands.length > 1 && this.state === APP_STATE.ACTIVE) {
        // (we already lock to the largest hand; gentle social hint occasionally)
      }

      // tab switching always uses the REAL cursor
      this.tabManager.update(gs, now, dt);

      // during attract, feed a scripted ghost gesture to the active tab
      const feed = this.state === APP_STATE.ATTRACT ? attract.update(now, dt, this.activeId) : gs;
      this.env.isAttract = this.state === APP_STATE.ATTRACT;
      this.env.quality = this.governor.level;

      const tab = this.tabs[this.activeId];
      if (tab && tab.onFrame) tab.onFrame(feed, dt, this.env);

      // pledge offer when a session ends with enough activity
      if (FEATURES.pledge) pledge.maybeOffer(this.state, gs, now);

      hud.tick();
    } catch (e) {
      console.error('[loop] error', e);
    }

    this.governor.sample(performance.now() - now);
    requestAnimationFrame((t) => this._loop(t));
  }
}

const app = new App();
app.start();
window.__wed = app; // debugging handle
