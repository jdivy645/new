// ============================================================================
// tabs/shared.js — helpers common to the Canvas2D tabs.
// MultiCursor turns the GestureState into 1–2 screen-space cursors with
// velocity (works identically for real hands and the attract ghost).
// ============================================================================

export class MultiCursor {
  constructor() { this.prev = new Map(); }

  // returns [{ id, x, y, vx, vy, speed, openPalm, pinch, fingers }]
  update(gs, env, dtMs) {
    const out = [];
    const dt = Math.max(1, dtMs);
    const push = (id, x, y, extra) => {
      const p = this.prev.get(id);
      let vx = 0, vy = 0;
      if (p) { vx = (x - p.x) / dt; vy = (y - p.y) / dt; }
      this.prev.set(id, { x, y });
      out.push({ id, x, y, vx, vy, speed: Math.hypot(vx, vy), ...extra });
    };

    if (gs.hands && gs.hands.length) {
      for (const h of gs.hands) {
        const s = env.mapper.toScreen(h.palm.x, h.palm.y);
        push(h.id, s.x, s.y, { openPalm: h.fingersExtended >= 4, fingers: h.fingersExtended, pinch: gs.pinch.isPinching && gs.active?.id === h.id });
      }
    } else if (gs.cursor) {
      // ghost / synthetic single cursor
      push('G', gs.cursor.x, gs.cursor.y, { openPalm: gs.openPalm, fingers: gs.openPalm ? 5 : 1, pinch: gs.pinch.isPinching });
    }

    // forget stale ids
    const live = new Set(out.map((o) => o.id));
    for (const k of this.prev.keys()) if (!live.has(k)) this.prev.delete(k);
    return out;
  }
}

// mix two hex colors
export function mix(a, b, t) {
  const pa = hex(a), pb = hex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
function hex(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
