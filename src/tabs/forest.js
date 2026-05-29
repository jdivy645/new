// ============================================================================
// tabs/forest.js — Grow a Forest. Canvas2D, zero image assets.
// Open hand deposits "life" into a fertility grid; cells sprout grass ->
// flowers -> trees that animate seed->mature; the whole scene warms as it fills.
// ============================================================================
import { PALETTE, PERF } from '../config.js';
import { clamp, lerp, easeOutBack, makeRng, Pool } from '../util.js';
import { MultiCursor, mix } from './shared.js';

const COLS = 48, ROWS = 12;
const PLANT_CAP = 320;

export class ForestTab {
  constructor() {
    this.mc = new MultiCursor();
    this.plants = [];
    this.creatures = [];
    this.fert = new Float32Array(COLS * ROWS);
    this.coverage = 0;
    this.moodStep = -1;
    this.bg = document.createElement('canvas');
    this.particles = new Pool(() => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: '#fff', r: 2 }), 520,
      (o) => { o.life = 0; });
    this.rng = makeRng(1337);
    this.acc = 0;
    this.hints = { palm: 'Grow forest', point: 'Plant a tree', peace: 'Bloom wave' };
  }

  activate(env) { this.resize(env); }
  deactivate() {}

  resize(env) {
    this.W = env.width; this.H = env.height;
    this.groundTop = this.H * 0.56;
    this.groundH = this.H - this.groundTop;
    this.moodStep = -1; // force bg rebuild
    this._rebuildBg(env);
  }

  _cell(cx, cy) {
    const gx = clamp(Math.floor((cx / this.W) * COLS), 0, COLS - 1);
    const gyf = (cy - this.groundTop) / this.groundH;
    const gy = clamp(Math.floor(gyf * ROWS), 0, ROWS - 1);
    return { gx, gy, i: gy * COLS + gx, valid: cy > this.groundTop - this.H * 0.15 };
  }

  onFrame(gs, dt, env) {
    const ctx = env.ctx;
    this.acc += dt;
    const q = env.quality;
    const partCap = q >= 2 ? 200 : q === 1 ? 350 : 520;

    // ---- deposit life from cursors ----
    const cursors = this.mc.update(gs, env, dt);
    for (const c of cursors) {
      if (!c.openPalm) continue;
      const speed = clamp(c.speed * 1000, 0, 3); // px/ms -> weight
      const cell = this._cell(c.x, c.y);
      if (!cell.valid) continue;
      const radius = 2 + Math.round((gs.spread || 0.4) * 2);
      const amt = 0.04 + speed * 0.05;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const gx = cell.gx + dx, gy = cell.gy + dy;
          if (gx < 0 || gx >= COLS || gy < 0 || gy >= ROWS) continue;
          const fall = Math.exp(-(dx * dx + dy * dy) / (radius * radius + 1));
          this.fert[gy * COLS + gx] = clamp(this.fert[gy * COLS + gx] + amt * fall, 0, 1.4);
        }
      }
      // sparkle trail
      if (speed > 0.4 && this.particles.count < partCap) {
        const p = this.particles.spawn();
        if (p) { p.x = c.x; p.y = c.y; p.vx = (this.rng() - 0.5) * 0.04; p.vy = -0.05 - this.rng() * 0.05; p.life = p.max = 600; p.c = PALETTE.leaf; p.r = 2 + this.rng() * 2; }
      }
    }

    // ---- finger-gesture operations ----
    if (gs.pointEdge && gs.cursor) this._plantAt(gs.cursor, env);   // ☝️ one finger
    if (gs.peaceEdge) this._bloomWave(env);                          // ✌️ two fingers

    // two-hand bloom wave
    if (gs.twoHand && gs.twoHand.present && Math.abs(gs.twoHand.dx) > 0.02) {
      for (let gx = 0; gx < COLS; gx++) for (let gy = 0; gy < ROWS; gy++) this.fert[gy * COLS + gx] = Math.max(this.fert[gy * COLS + gx], 0.4);
    }

    // ---- grow simulation (fixed 30Hz) ----
    while (this.acc >= 33) {
      this.acc -= 33;
      this._simStep(env);
    }

    // decay fertility a touch so it doesn't saturate
    // (cheap: every frame nudge a few cells)
    // grow plant stages
    for (const p of this.plants) {
      if (p.stage < p.target) p.stage = Math.min(p.target, p.stage + p.grow);
      p.sway += dt * 0.001;
      if (p.type === 'tree' && !p.counted && p.stage > 0.95) { p.counted = true; env.hud.add('forest', 1, { silent: env.isAttract }); if (!env.isAttract) env.sound.sprout(); this._spawnPetals(p); }
    }

    // creatures wander
    for (const cr of this.creatures) {
      cr.t += dt * 0.001;
      cr.x += Math.cos(cr.t * cr.sp) * 0.4 + cr.dir * 0.3;
      cr.y += Math.sin(cr.t * cr.sp * 1.3) * 0.3;
      if (cr.x < 0 || cr.x > this.W) cr.dir *= -1;
    }

    // particles
    for (const p of this.particles.active) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.00006 * dt; p.life -= dt; }
    this.particles.sweep((o) => o.life <= 0);

    // coverage + mood
    let cov = 0; for (let i = 0; i < this.fert.length; i++) if (this.fert[i] > 0.3) cov++;
    this.coverage = lerp(this.coverage, cov / this.fert.length, 0.05);
    const step = Math.round(this.coverage * 8);
    if (step !== this.moodStep) { this.moodStep = step; this._rebuildBg(env); }

    this._draw(ctx, env);
  }

  _simStep(env) {
    // promote fertile cells into plants (respecting cap)
    if (this.plants.length >= PLANT_CAP) return;
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const i = gy * COLS + gx;
        const f = this.fert[i];
        if (f < 0.3) continue;
        // probability of sprouting scales with fertility; limited per step
        if (this.rng() > 0.06 * f) continue;
        const occupied = this._density(gx, gy);
        if (occupied > 3) continue;
        const x = (gx + this.rng()) / COLS * this.W;
        const yRow = gy / ROWS;
        const baseY = this.groundTop + this.groundH * (0.2 + yRow * 0.75);
        let type;
        if (f > 1.0 && yRow < 0.5) type = 'tree';
        else if (f > 0.7) type = this.rng() > 0.5 ? 'tree' : 'flower';
        else type = this.rng() > 0.4 ? 'grass' : 'flower';
        if (type === 'tree' && this.plants.filter((p) => p.type === 'tree').length > 120) type = 'flower';
        this._addPlant(x, baseY, type, gx, gy);
        this.fert[i] = Math.min(this.fert[i], 0.9);
        // spawn creatures in lush areas
        if (type === 'tree' && this.coverage > 0.35 && this.creatures.length < 18 && this.rng() > 0.7) {
          this.creatures.push({ x, y: baseY - this.groundH * (0.6 + this.rng() * 0.4), t: this.rng() * 10, sp: 2 + this.rng() * 2, dir: this.rng() > 0.5 ? 1 : -1, kind: this.rng() > 0.5 ? 'bfly' : 'bird', c: [PALETTE.sun, PALETTE.oceanBright, PALETTE.leaf][Math.floor(this.rng() * 3)] });
        }
      }
    }
  }

  _density(gx, gy) { let n = 0; for (const p of this.plants) if (Math.abs(p.gx - gx) <= 1 && Math.abs(p.gy - gy) <= 1) n++; return n; }

  _addPlant(x, baseY, type, gx, gy) {
    const scale = type === 'tree' ? (this.groundH * (0.35 + this.rng() * 0.35)) : type === 'flower' ? this.groundH * 0.12 : this.groundH * 0.08;
    this.plants.push({ x, baseY, type, gx, gy, stage: 0, target: 1, grow: type === 'tree' ? 0.012 : 0.04, maxH: scale, sway: this.rng() * 6, cv: Math.floor(this.rng() * 4), counted: false });
  }

  // ☝️ one finger: plant a single tree exactly where you point
  _plantAt(cur, env) {
    const cell = this._cell(cur.x, cur.y);
    const x = clamp(cur.x, 4, this.W - 4);
    const baseY = clamp(cur.y, this.groundTop + this.groundH * 0.2, this.H - 4);
    const gx = clamp(Math.floor((x / this.W) * COLS), 0, COLS - 1);
    this._addPlant(x, baseY, 'tree', gx, cell.gy);
    this.fert[gx + cell.gy * COLS] = Math.max(this.fert[gx + cell.gy * COLS] || 0, 0.7);
    for (let i = 0; i < 8; i++) { const o = this.particles.spawn(); if (!o) break; const a = (i / 8) * Math.PI * 2; o.x = x; o.y = baseY; o.vx = Math.cos(a) * 0.05; o.vy = Math.sin(a) * 0.05 - 0.03; o.life = o.max = 700; o.c = PALETTE.leaf; o.r = 2 + this.rng() * 2; }
    if (!env.isAttract) env.sound.sprout();
  }

  // ✌️ two fingers: a wave of life sweeps the whole ground
  _bloomWave(env) {
    for (let i = 0; i < this.fert.length; i++) this.fert[i] = Math.max(this.fert[i], 0.55);
    if (!env.isAttract) { env.sound.bloom(); env.hud.banner('🌿 Bloom wave!', 1200); }
  }

  _spawnPetals(p) {
    for (let i = 0; i < 8; i++) {
      const o = this.particles.spawn();
      if (!o) break;
      o.x = p.x; o.y = p.baseY - p.maxH * 0.7; o.vx = (this.rng() - 0.5) * 0.08; o.vy = -0.04 - this.rng() * 0.04; o.life = o.max = 900; o.c = [PALETTE.forestBright, PALETTE.sun, '#ff8fab'][i % 3]; o.r = 2 + this.rng() * 2;
    }
  }

  _rebuildBg(env) {
    const c = this.bg; c.width = this.W; c.height = this.H;
    const ctx = c.getContext('2d');
    const m = clamp(this.coverage, 0, 1);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, this.groundTop);
    sky.addColorStop(0, mix('#46506b', '#1d6f7a', m));
    sky.addColorStop(1, mix('#9c8767', '#a9e6c0', m));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, this.W, this.groundTop + 2);
    // sun
    const sunY = lerp(this.groundTop * 0.7, this.groundTop * 0.35, m);
    const sg = ctx.createRadialGradient(this.W * 0.8, sunY, 6, this.W * 0.8, sunY, this.W * 0.18);
    sg.addColorStop(0, mix('#d8c9a0', '#ffe39a', m)); sg.addColorStop(1, 'rgba(255,227,154,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, this.W, this.groundTop);
    // hills
    for (let h = 0; h < 3; h++) {
      ctx.fillStyle = mix('#6b5e44', '#2e8b57', m * (0.5 + h * 0.25));
      ctx.beginPath(); ctx.moveTo(0, this.groundTop);
      const amp = this.groundTop * (0.08 + h * 0.04), yb = this.groundTop - amp * (3 - h) * 0.4;
      for (let x = 0; x <= this.W; x += 40) ctx.lineTo(x, yb + Math.sin(x * 0.004 + h) * amp);
      ctx.lineTo(this.W, this.groundTop); ctx.closePath(); ctx.fill();
    }
    // ground
    const gr = ctx.createLinearGradient(0, this.groundTop, 0, this.H);
    gr.addColorStop(0, mix('#7d6a52', '#3a7d44', m)); gr.addColorStop(1, mix('#5b4d3a', '#245c33', m));
    ctx.fillStyle = gr; ctx.fillRect(0, this.groundTop, this.W, this.groundH);
  }

  _draw(ctx, env) {
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.drawImage(this.bg, 0, 0);

    // plants sorted by baseY for depth
    this.plants.sort((a, b) => a.baseY - b.baseY);
    for (const p of this.plants) this._drawPlant(ctx, p);

    // creatures
    for (const cr of this.creatures) this._drawCreature(ctx, cr);

    // particles (additive)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles.active) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  _drawPlant(ctx, p) {
    const s = easeOutBack(clamp(p.stage, 0, 1));
    const h = p.maxH * s;
    const sway = Math.sin(p.sway) * h * 0.03;
    if (p.type === 'grass') {
      ctx.strokeStyle = PALETTE.forest; ctx.lineWidth = 2;
      for (let b = -2; b <= 2; b++) { ctx.beginPath(); ctx.moveTo(p.x + b * 2, p.baseY); ctx.quadraticCurveTo(p.x + b * 2 + sway, p.baseY - h * 0.6, p.x + b * 3 + sway * 2, p.baseY - h); ctx.stroke(); }
    } else if (p.type === 'flower') {
      ctx.strokeStyle = PALETTE.forest; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.baseY); ctx.lineTo(p.x + sway, p.baseY - h); ctx.stroke();
      const col = ['#ff8fab', '#ffd166', '#c77dff', '#9bf6ff'][p.cv];
      ctx.fillStyle = col;
      for (let a = 0; a < 5; a++) { const ang = (a / 5) * Math.PI * 2 + p.sway; ctx.beginPath(); ctx.ellipse(p.x + sway + Math.cos(ang) * h * 0.12, p.baseY - h + Math.sin(ang) * h * 0.12, h * 0.1, h * 0.06, ang, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = PALETTE.sun; ctx.beginPath(); ctx.arc(p.x + sway, p.baseY - h, h * 0.07, 0, Math.PI * 2); ctx.fill();
    } else { // tree
      const trunkW = Math.max(3, h * 0.07);
      ctx.fillStyle = '#5b4126';
      ctx.beginPath(); ctx.moveTo(p.x - trunkW / 2, p.baseY); ctx.lineTo(p.x + trunkW / 2, p.baseY); ctx.lineTo(p.x + sway + trunkW * 0.3, p.baseY - h * 0.6); ctx.lineTo(p.x + sway - trunkW * 0.3, p.baseY - h * 0.6); ctx.closePath(); ctx.fill();
      const cy = p.baseY - h * 0.65, cr = h * 0.4;
      const greens = ['#2e8b57', '#3a9d63', '#57d98a', '#1f6b42'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = greens[(p.cv + i) % 4];
        const ox = (i % 2 ? 1 : -1) * cr * 0.4, oy = -i * cr * 0.18;
        ctx.beginPath(); ctx.arc(p.x + sway + ox, cy + oy, cr * (0.8 - i * 0.1), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  _drawCreature(ctx, cr) {
    ctx.fillStyle = cr.c;
    if (cr.kind === 'bfly') {
      const w = 6 + Math.sin(cr.t * 8) * 4;
      ctx.beginPath(); ctx.ellipse(cr.x - 5, cr.y, w, 5, 0, 0, Math.PI * 2); ctx.ellipse(cr.x + 5, cr.y, w, 5, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(cr.x - 7, cr.y); ctx.quadraticCurveTo(cr.x, cr.y - 5 - Math.sin(cr.t * 6) * 3, cr.x + 7, cr.y); ctx.quadraticCurveTo(cr.x, cr.y - 2, cr.x - 7, cr.y); ctx.fill();
    }
  }
}
