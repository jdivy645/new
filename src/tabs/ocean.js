// ============================================================================
// tabs/ocean.js — Clean the Ocean. Canvas2D scratch-card reveal.
// A clean sea is drawn under a brown "murk" layer; the hand is a squeegee that
// erases the murk (destination-out) to reveal water + fish. Coverage is tracked
// via a cheap occupancy grid (no per-frame getImageData).
// ============================================================================
import { PALETTE } from '../config.js';
import { clamp, lerp, makeRng, Pool } from '../util.js';
import { MultiCursor, mix } from './shared.js';

const GCOLS = 56, GROWS = 32;

export class OceanTab {
  constructor() {
    this.mc = new MultiCursor();
    this.murk = document.createElement('canvas');
    this.occ = new Uint8Array(GCOLS * GROWS);
    this.cleared = 0;
    this.fish = [];
    this.trash = [];
    this.rng = makeRng(7);
    this.particles = new Pool(() => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '#fff', r: 2 }), 280, (o) => { o.life = 0; });
    this.t = 0; this.finaleUntil = 0; this.repolluteAt = 0;
    this.dolphin = -1;
    this.hints = { palm: 'Wipe clean', point: 'Grab trash', peace: 'Clear blast' };
  }

  activate(env) { this.resize(env); this._buildMurk(); }
  deactivate() {}

  resize(env) {
    this.W = env.width; this.H = env.height;
    this.murk.width = this.W; this.murk.height = this.H;
    this._seedFish(); this._buildMurk();
  }

  _seedFish() {
    this.fish = [];
    for (let i = 0; i < 44; i++) this.fish.push({ x: this.rng() * this.W, y: this.H * (0.25 + this.rng() * 0.7), vx: (0.4 + this.rng() * 0.6) * (this.rng() > 0.5 ? 1 : -1), phase: this.rng() * 10, size: 14 + this.rng() * 22, hue: 30 + this.rng() * 40 });
  }

  _buildMurk() {
    const ctx = this.murk.getContext('2d');
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.W, this.H);
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, '#6b6238'); g.addColorStop(1, '#403a2a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
    // oil slicks
    for (let i = 0; i < 10; i++) {
      const x = this.rng() * this.W, y = this.rng() * this.H, r = this.W * (0.06 + this.rng() * 0.1);
      const rg = ctx.createRadialGradient(x, y, 2, x, y, r);
      rg.addColorStop(0, 'rgba(20,18,10,0.85)'); rg.addColorStop(0.7, 'rgba(60,50,30,0.5)'); rg.addColorStop(1, 'rgba(60,50,30,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // trash items (also tracked for scoring)
    this.trash = [];
    for (let i = 0; i < 36; i++) {
      const x = this.rng() * this.W, y = this.H * (0.12 + this.rng() * 0.8);
      const type = Math.floor(this.rng() * 3);
      this.trash.push({ x, y, type, counted: false });
      this._drawTrash(ctx, x, y, type);
    }
    this.occ.fill(0); this.cleared = 0;
  }

  _drawTrash(ctx, x, y, type) {
    ctx.save(); ctx.translate(x, y); ctx.rotate((this.rng() - 0.5) * 1.2);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    if (type === 0) { // bottle
      ctx.fillStyle = 'rgba(120,160,160,0.7)';
      ctx.fillRect(-10, -22, 20, 40); ctx.fillRect(-5, -30, 10, 10); ctx.strokeRect(-10, -22, 20, 40);
    } else if (type === 1) { // bag
      ctx.fillStyle = 'rgba(220,220,230,0.55)';
      ctx.beginPath(); ctx.moveTo(-16, -10); ctx.quadraticCurveTo(0, -26, 16, -10); ctx.quadraticCurveTo(20, 20, 0, 24); ctx.quadraticCurveTo(-20, 20, -16, -10); ctx.fill();
    } else { // rings
      ctx.strokeStyle = 'rgba(230,230,180,0.7)';
      for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.arc(-12 + r * 12, 0, 7, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.restore();
  }

  _stamp(x, y, r) {
    const ctx = this.murk.getContext('2d');
    ctx.globalCompositeOperation = 'destination-out';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.7, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // mark occupancy
    const gx0 = clamp(Math.floor(((x - r) / this.W) * GCOLS), 0, GCOLS - 1);
    const gx1 = clamp(Math.floor(((x + r) / this.W) * GCOLS), 0, GCOLS - 1);
    const gy0 = clamp(Math.floor(((y - r) / this.H) * GROWS), 0, GROWS - 1);
    const gy1 = clamp(Math.floor(((y + r) / this.H) * GROWS), 0, GROWS - 1);
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const idx = gy * GCOLS + gx; if (!this.occ[idx]) { this.occ[idx] = 1; this.cleared++; }
    }
  }

  onFrame(gs, dt, env) {
    const ctx = env.ctx; this.t += dt;
    const cursors = this.mc.update(gs, env, dt);

    if (this.t < this.finaleUntil) {
      // finale running; keep animating dolphin
    } else {
      // ---- erase along cursor paths ----
      // ☝️ one finger: grab one trash item · ✌️ two fingers: clear blast
      if (gs.pointEdge && gs.cursor) this._grabTrash(gs.cursor, env);
      if (gs.peaceEdge && gs.cursor) this._clearBlast(gs.cursor, env);
      for (const c of cursors) {
        if (c.pinch) { this._grabTrash(c, env); continue; }
        if (!c.openPalm) continue; // ✋ palm = wipe (point/peace handled above)
        const speed = clamp(c.speed * 1000, 0, 4);
        const r = (this.H * 0.11) * (1 + speed * 0.15);
        const prev = this._prev?.[c.id];
        if (prev) { const steps = Math.min(12, 1 + Math.hypot(c.x - prev.x, c.y - prev.y) / (r * 0.4)); for (let s = 1; s <= steps; s++) this._stamp(lerp(prev.x, c.x, s / steps), lerp(prev.y, c.y, s / steps), r); }
        else this._stamp(c.x, c.y, r);
        if (!this._prev) this._prev = {}; this._prev[c.id] = { x: c.x, y: c.y };
      }
      // count cleared trash
      for (const tr of this.trash) {
        if (tr.counted) continue;
        const gx = clamp(Math.floor((tr.x / this.W) * GCOLS), 0, GCOLS - 1);
        const gy = clamp(Math.floor((tr.y / this.H) * GROWS), 0, GROWS - 1);
        if (this.occ[gy * GCOLS + gx]) { tr.counted = true; env.hud.add('ocean', 1, { silent: env.isAttract }); if (!env.isAttract) env.sound.bloop(); this._pop(tr.x, tr.y); }
      }
    }

    const pct = this.cleared / this.occ.length;
    const shown = lerp(this._shownPct || 0, pct, 0.1); this._shownPct = shown;

    if (pct > 0.9 && this.t > this.finaleUntil && this.t > this.repolluteAt) {
      this.finaleUntil = this.t + 4000; this.repolluteAt = this.t + 8000; this.dolphin = 0;
      env.hud.banner('🌊 OCEAN RESTORED!', 2600); if (!env.isAttract) env.sound.chime();
    }
    if (this.repolluteAt && this.t > this.repolluteAt) { this.repolluteAt = 0; this._buildMurk(); this._shownPct = 0; }

    this._drawBase(ctx, shown, dt);
    ctx.drawImage(this.murk, 0, 0);
    this._drawParticles(ctx, dt);
    if (this.dolphin >= 0) this._drawDolphin(ctx, dt);
  }

  _grabTrash(c, env) {
    let best = -1, bd = 80 * 80;
    for (let i = 0; i < this.trash.length; i++) { const tr = this.trash[i]; if (tr.counted) continue; const d = (tr.x - c.x) ** 2 + (tr.y - c.y) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best >= 0) { const tr = this.trash[best]; tr.counted = true; this._stamp(tr.x, tr.y, 60); env.hud.add('ocean', 1, { silent: env.isAttract }); if (!env.isAttract) env.sound.bloop(); this._pop(tr.x, tr.y); }
  }

  // ✌️ two fingers: a big circular blast clears a wide area + all trash inside it
  _clearBlast(cur, env) {
    const R = this.H * 0.28;
    this._stamp(cur.x, cur.y, R);
    for (const tr of this.trash) {
      if (tr.counted) continue;
      if ((tr.x - cur.x) ** 2 + (tr.y - cur.y) ** 2 < R * R) { tr.counted = true; env.hud.add('ocean', 1, { silent: env.isAttract }); this._pop(tr.x, tr.y); }
    }
    if (!env.isAttract) { env.sound.bloop(); env.hud.banner('💥 Clear blast!', 1200); }
  }

  _pop(x, y) {
    for (let i = 0; i < 12; i++) { const p = this.particles.spawn(); if (!p) break; const a = (i / 12) * Math.PI * 2; p.x = x; p.y = y; p.vx = Math.cos(a) * (0.1 + this.rng() * 0.15); p.vy = Math.sin(a) * (0.1 + this.rng() * 0.15); p.life = p.max = 600; p.c = [PALETTE.oceanBright, '#fff', PALETTE.leaf][i % 3]; p.r = 2 + this.rng() * 2; }
  }

  _drawBase(ctx, pct, dt) {
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, mix('#0a3a4a', '#3fd3e6', pct)); g.addColorStop(1, mix('#062633', '#075b76', pct));
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
    // sun glow grows with clean
    const sy = lerp(this.H * 0.1, this.H * 0.05, pct);
    const sg = ctx.createRadialGradient(this.W * 0.5, sy, 4, this.W * 0.5, sy, this.W * 0.4 * (0.5 + pct));
    sg.addColorStop(0, `rgba(255,236,170,${0.25 * pct})`); sg.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, this.W, this.H * 0.5);
    // waves
    ctx.strokeStyle = `rgba(255,255,255,${0.06 + 0.08 * pct})`; ctx.lineWidth = 2;
    for (let l = 0; l < 3; l++) { ctx.beginPath(); const yb = this.H * (0.2 + l * 0.12); for (let x = 0; x <= this.W; x += 24) ctx.lineTo(x, yb + Math.sin(x * 0.01 + this.t * 0.001 + l) * 8); ctx.stroke(); }
    // fish (count scales with cleared)
    const show = Math.floor(this.fish.length * (0.15 + pct * 0.85));
    for (let i = 0; i < show; i++) { const f = this.fish[i]; f.x += f.vx * dt * 0.06; if (f.x > this.W + 40) f.x = -40; if (f.x < -40) f.x = this.W + 40; const wob = Math.sin(this.t * 0.005 + f.phase) * 6; this._drawFish(ctx, f.x, f.y + wob, f.size, f.vx > 0 ? 1 : -1, f.hue); }
  }

  _drawFish(ctx, x, y, s, dir, hue) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = `hsl(${hue},80%,60%)`;
    ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s * 1.5, -s * 0.4); ctx.lineTo(-s * 1.5, s * 0.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#06222b'; ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.1, s * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  _drawParticles(ctx, dt) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles.active) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore(); ctx.globalAlpha = 1;
    this.particles.sweep((o) => o.life <= 0);
  }

  _drawDolphin(ctx, dt) {
    this.dolphin += dt * 0.0006;
    if (this.dolphin > 1) { this.dolphin = -1; return; }
    const t = this.dolphin; const x = lerp(-100, this.W + 100, t); const y = this.H * 0.4 - Math.sin(t * Math.PI) * this.H * 0.3;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.cos(t * Math.PI) * 0.6); ctx.fillStyle = '#0a2a33';
    ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(0, -30, 50, 0); ctx.quadraticCurveTo(60, 6, 50, 12); ctx.quadraticCurveTo(0, 6, -40, 18); ctx.quadraticCurveTo(-55, 6, -40, 0); ctx.fill();
    ctx.restore();
  }
}
