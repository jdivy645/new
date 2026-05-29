// ============================================================================
// tabs/energy.js — Power the Future. Canvas2D, zero image assets.
// Hand wave speed = wind (turbines spin); open palm to the sun = solar charge.
// A light pulse travels into a dark city; windows ignite left->right; smog
// lifts; a CO2-saved counter climbs.
// ============================================================================
import { PALETTE } from '../config.js';
import { clamp, lerp, makeRng, Pool } from '../util.js';
import { MultiCursor, mix } from './shared.js';

export class EnergyTab {
  constructor() {
    this.mc = new MultiCursor();
    this.rng = makeRng(99);
    this.wind = 0; this.solar = 0; this.cityPower = 0;
    this.bladeAngle = 0;
    this.co2acc = 0;
    this.bg = document.createElement('canvas');
    this.particles = new Pool(() => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '#fff', r: 2, kind: 0 }), 260, (o) => { o.life = 0; });
    this.t = 0; this.full = false; this.fullAt = 0; this.surgeUntil = 0;
    this.hints = { palm: 'Wind / Solar', point: 'Light a tower', peace: 'Power surge' };
  }

  activate(env) { this.resize(env); }
  deactivate() {}

  resize(env) {
    this.W = env.width; this.H = env.height;
    this._layout();
    this._buildStatic();
  }

  _layout() {
    const W = this.W, H = this.H;
    this.horizon = H * 0.62;
    this.sun = { x: W * 0.16, y: H * 0.2, r: W * 0.05 };
    // turbines
    this.turbines = [];
    const tn = 4;
    for (let i = 0; i < tn; i++) this.turbines.push({ x: W * (0.22 + i * 0.11), baseY: this.horizon, h: H * (0.18 + this.rng() * 0.06) });
    // solar panels (right)
    this.panels = { x: W * 0.72, y: this.horizon - H * 0.02, w: W * 0.24, h: H * 0.12 };
    // city buildings + windows
    this.buildings = [];
    let bx = 0;
    while (bx < W) {
      const bw = W * (0.04 + this.rng() * 0.05);
      const bh = H * (0.12 + this.rng() * 0.22);
      const b = { x: bx, w: bw, h: bh, y: H - bh, windows: [], boostUntil: 0 };
      const cols = Math.max(2, Math.floor(bw / (W * 0.012)));
      const rows = Math.max(3, Math.floor(bh / (H * 0.03)));
      const ww = bw / cols * 0.5, wh = bh / rows * 0.5;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        b.windows.push({ x: b.x + (c + 0.25) * (bw / cols), y: b.y + (r + 0.25) * (bh / rows), w: ww, h: wh, lit: 0, target: 0, order: (b.x + c * 5) / W });
      }
      this.buildings.push(b); bx += bw + W * 0.005;
    }
  }

  _buildStatic() {
    const c = this.bg; c.width = this.W; c.height = this.H;
    const ctx = c.getContext('2d');
    // stars
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 90; i++) { const x = this.rng() * this.W, y = this.rng() * this.horizon * 0.8; ctx.globalAlpha = 0.3 + this.rng() * 0.5; ctx.fillRect(x, y, 2, 2); }
    ctx.globalAlpha = 1;
  }

  onFrame(gs, dt, env) {
    const ctx = env.ctx; this.t += dt;
    const cursors = this.mc.update(gs, env, dt);

    // ---- derive wind + solar from gestures ----
    let windInput = 0, solarInput = 0;
    for (const c of cursors) {
      const sp = clamp(Math.abs(c.vx) * 1000, 0, 5); // horizontal speed -> wind
      windInput = Math.max(windInput, sp / 5);
      // open palm in upper-left near sun -> solar
      if (c.openPalm && c.y < this.H * 0.45 && c.x < this.W * 0.45) solarInput = 1;
    }
    this.wind = lerp(this.wind, windInput, windInput > this.wind ? 0.2 : 0.03); // momentum decay
    this.solar = lerp(this.solar, solarInput, 0.06);
    this.cityPower = clamp(0.6 * this.solar + 0.4 * this.wind, 0, 1);

    // ☝️ one finger: light up the nearest tower · ✌️ two fingers: power surge
    if (gs.pointEdge && gs.cursor) this._lightTower(gs.cursor, env);
    if (gs.peaceEdge) this._powerSurge(env);
    if (this.t < this.surgeUntil) this.cityPower = Math.max(this.cityPower, 0.92);

    // spin blades by wind
    this.bladeAngle += (0.002 + this.wind * 0.03) * dt;

    // CO2 accrues with power
    this.co2acc += this.cityPower * dt * 0.02; // kg
    if (this.co2acc >= 1) { const add = Math.floor(this.co2acc); this.co2acc -= add; env.hud.add('energy', add, { silent: env.isAttract, minGap: 200 }); }

    // light city left->right by cityPower (boosted towers force-lit briefly)
    const lit = this.cityPower;
    for (const b of this.buildings) {
      const boosted = b.boostUntil > this.t;
      for (const w of b.windows) {
        w.target = (boosted || w.order < lit) ? (0.6 + this.rng() * 0.4) : 0.05;
        w.lit = lerp(w.lit, w.target, boosted ? 0.2 : 0.05);
      }
    }

    // particles: wind streaks + solar photons
    if (this.wind > 0.2 && this.particles.count < 200) { const p = this.particles.spawn(); if (p) { p.x = -10; p.y = this.rng() * this.horizon; p.vx = 0.2 + this.wind * 0.6; p.vy = 0; p.life = p.max = 2000; p.c = 'rgba(180,230,255,0.7)'; p.kind = 0; p.r = 2; } }
    if (this.solar > 0.3 && this.particles.count < 220) { const p = this.particles.spawn(); if (p) { p.x = this.sun.x; p.y = this.sun.y; const tx = this.panels.x, ty = this.panels.y; const a = Math.atan2(ty - p.y, tx - p.x); p.vx = Math.cos(a) * 0.4; p.vy = Math.sin(a) * 0.4; p.life = p.max = 1400; p.c = PALETTE.energyBright; p.kind = 1; p.r = 3; } }

    // finale
    if (this.cityPower > 0.96 && !this.full) { this.full = true; this.fullAt = this.t; env.hud.banner('⚡ CITY POWERED — 100% CLEAN', 2600); if (!env.isAttract) env.sound.powerup(); this._fireworks(); }
    if (this.cityPower < 0.8) this.full = false;

    this._draw(ctx, dt, env);
  }

  _fireworks() {
    for (let b = 0; b < 4; b++) { const cx = this.W * (0.3 + this.rng() * 0.4), cy = this.H * (0.2 + this.rng() * 0.2); for (let i = 0; i < 24; i++) { const p = this.particles.spawn(); if (!p) break; const a = (i / 24) * Math.PI * 2; p.x = cx; p.y = cy; p.vx = Math.cos(a) * 0.3; p.vy = Math.sin(a) * 0.3; p.life = p.max = 1200; p.c = [PALETTE.energyBright, '#ff8fab', PALETTE.oceanBright][b % 3]; p.kind = 2; p.r = 3; } }
  }

  // ☝️ one finger: instantly light the nearest tower
  _lightTower(cur, env) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) { const cx = b.x + b.w / 2; const d = Math.abs(cx - cur.x); if (d < bd) { bd = d; best = b; } }
    if (best) { best.boostUntil = this.t + 5000; env.hud.add('energy', 5, { silent: env.isAttract, minGap: 150 }); if (!env.isAttract) env.sound.ding(); }
  }

  // ✌️ two fingers: a surge that powers the whole city for a moment
  _powerSurge(env) {
    this.surgeUntil = this.t + 1800;
    for (const b of this.buildings) b.boostUntil = Math.max(b.boostUntil, this.t + 1500);
    this._fireworks();
    if (!env.isAttract) { env.sound.powerup(); env.hud.banner('⚡ Power surge!', 1300); }
  }

  _draw(ctx, dt, env) {
    const cp = this.cityPower;
    // sky grey -> teal
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, mix('#23263f', '#10545c', cp)); g.addColorStop(1, mix('#2a2f4a', '#1d6f7a', cp));
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.W, this.H);
    ctx.globalAlpha = clamp(cp, 0.2, 1); ctx.drawImage(this.bg, 0, 0); ctx.globalAlpha = 1;

    // sun
    const sg = ctx.createRadialGradient(this.sun.x, this.sun.y, 4, this.sun.x, this.sun.y, this.sun.r * (2 + this.solar * 2));
    sg.addColorStop(0, mix('#caa84a', '#ffe39a', this.solar)); sg.addColorStop(1, 'rgba(255,227,154,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(this.sun.x, this.sun.y, this.sun.r * (2 + this.solar * 2), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = mix('#b59b4a', '#ffd166', this.solar); ctx.beginPath(); ctx.arc(this.sun.x, this.sun.y, this.sun.r, 0, Math.PI * 2); ctx.fill();

    // smog haze (alpha = 1-power)
    ctx.fillStyle = `rgba(120,116,96,${0.5 * (1 - cp)})`; ctx.fillRect(0, 0, this.W, this.horizon);

    // hill
    ctx.fillStyle = mix('#1c2a22', '#214d35', cp); ctx.fillRect(0, this.horizon, this.W, this.H - this.horizon);

    // solar panels
    const pan = this.panels;
    ctx.save(); ctx.translate(pan.x, pan.y);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      ctx.fillStyle = mix('#10131c', '#3fd3e6', this.solar * (0.4 + 0.6 * this.rng2(r, c)));
      ctx.fillRect(c * pan.w / 6, r * pan.h / 3, pan.w / 6 - 4, pan.h / 3 - 4);
    }
    ctx.restore();

    // turbines
    for (const tb of this.turbines) this._drawTurbine(ctx, tb);

    // power line pulse
    if (cp > 0.05) {
      const px = (this.t * 0.0004 * (0.5 + cp)) % 1;
      ctx.strokeStyle = `rgba(255,209,102,${0.3 + cp * 0.5})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, this.horizon + 4); ctx.lineTo(this.W, this.horizon + 4); ctx.stroke();
      ctx.fillStyle = PALETTE.energyBright; ctx.beginPath(); ctx.arc(px * this.W, this.horizon + 4, 5 + cp * 4, 0, Math.PI * 2); ctx.fill();
    }

    // city
    for (const b of this.buildings) {
      ctx.fillStyle = '#0a0d14'; ctx.fillRect(b.x, b.y, b.w, b.h);
      for (const w of b.windows) { ctx.fillStyle = `rgba(255,210,120,${w.lit})`; ctx.fillRect(w.x, w.y, w.w, w.h); }
    }

    // particles
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles.active) {
      p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === 2) p.vy += 0.0004 * dt; p.life -= dt;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.c;
      if (p.kind === 0) ctx.fillRect(p.x, p.y, 14, 2);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore(); ctx.globalAlpha = 1;
    this.particles.sweep((o) => o.life <= 0 || o.x > this.W + 20);
  }

  rng2(r, c) { return ((Math.sin(r * 12.9 + c * 78.2) * 43758.5) % 1 + 1) % 1; }

  _drawTurbine(ctx, tb) {
    const topY = tb.baseY - tb.h;
    ctx.strokeStyle = '#d7e0e6'; ctx.lineWidth = Math.max(4, tb.h * 0.04); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tb.x, tb.baseY); ctx.lineTo(tb.x, topY); ctx.stroke();
    const bladeLen = tb.h * 0.5;
    // motion-blur ghosts scale with wind
    const ghosts = this.wind > 0.4 ? 2 : this.wind > 0.15 ? 1 : 0;
    for (let g = ghosts; g >= 0; g--) {
      ctx.globalAlpha = g === 0 ? 1 : 0.25;
      ctx.save(); ctx.translate(tb.x, topY); ctx.rotate(this.bladeAngle - g * 0.25);
      ctx.strokeStyle = '#eef3f6'; ctx.lineWidth = Math.max(5, tb.h * 0.05);
      for (let b = 0; b < 3; b++) { ctx.rotate((Math.PI * 2) / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -bladeLen); ctx.stroke(); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tb.x, topY, Math.max(4, tb.h * 0.04), 0, Math.PI * 2); ctx.fill();
  }
}
