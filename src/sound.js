// ============================================================================
// sound.js — WebAudio-synthesized cue library. ZERO audio files.
// Off by default (user choice). Master-gain mute keeps the graph alive for
// instant un-mute. Fails silently if AudioContext is unavailable.
// ============================================================================
import { SOUND_DEFAULT } from './config.js';
import { store } from './persistence.js';

class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = 0;
    this.maxVoices = 8;
    const pref = store.getSoundPref();
    this.enabled = pref === null ? SOUND_DEFAULT : pref;
  }

  // must be called from a user gesture (first hand-detect / tap / key)
  resume() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.5 : 0;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  }

  setEnabled(on) {
    this.enabled = on;
    store.setSoundPref(on);
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(on ? 0.5 : 0, t, 0.05);
    }
  }
  toggle() { this.setEnabled(!this.enabled); return this.enabled; }

  _voice() {
    if (!this.ctx || this.voices >= this.maxVoices) return null;
    this.voices++;
    return this.ctx.currentTime;
  }
  _release(dur) { setTimeout(() => { this.voices = Math.max(0, this.voices - 1); }, dur * 1000 + 30); }

  // generic enveloped tone
  tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.18, gain = 0.4, filter = null }) {
    if (!this.ctx || !this.enabled) return;
    const t = this._voice();
    if (t === null) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (filter) {
      const bq = this.ctx.createBiquadFilter();
      bq.type = filter.type || 'lowpass';
      bq.frequency.value = filter.freq || 1200;
      node.connect(bq); bq.connect(g);
    } else node.connect(g);
    g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
    this._release(dur);
  }

  // ---- cue library (distinct timbres per tab) ----
  sprout() { this.tone({ type: 'triangle', f0: 520, f1: 880, dur: 0.16, gain: 0.25 }); }
  bloom()  { this.tone({ type: 'triangle', f0: 660, f1: 1320, dur: 0.32, gain: 0.3 }); }
  bloop()  { this.tone({ type: 'sine', f0: 720, f1: 240, dur: 0.18, gain: 0.3 }); }
  heal()   { this.tone({ type: 'sine', f0: 880, f1: 1760, dur: 0.28, gain: 0.28 }); this.tone({ type: 'sine', f0: 1320, dur: 0.2, gain: 0.12 }); }
  whir()   { this.tone({ type: 'sawtooth', f0: 120, f1: 320, dur: 0.3, gain: 0.12, filter: { type: 'lowpass', freq: 800 } }); }
  ding()   { this.tone({ type: 'sine', f0: 1040, dur: 0.12, gain: 0.18 }); }
  select() { this.tone({ type: 'sine', f0: 600, f1: 900, dur: 0.08, gain: 0.15 }); }
  chime()  { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone({ type: 'sine', f0: f, dur: 0.22, gain: 0.2 }), i * 70)); }
  powerup(){ [330, 440, 554, 660].forEach((f, i) => setTimeout(() => this.tone({ type: 'sawtooth', f0: f, dur: 0.18, gain: 0.16, filter: { freq: 1400 } }), i * 60)); }
}

export const sound = new Sound();
