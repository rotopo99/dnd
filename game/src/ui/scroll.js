// Scrollable area: mouse wheel over the view + a slider on its right edge (drag the thumb or click the track).
// State is a plain object (createScroll()) kept by the screen; offset `off` is in pixels from the top of the content.
//   updateScroll(s, view, contentH, mouse, { step, follow }) — in update(); follow: stick to the end while at the end
//   beginClip(ctx, view) … endClip(ctx) — draw content at y − s.off inside the view; drawScrollbar(ctx, s, view)
import { C, inRect } from './draw.js';

export const SCROLLBAR_W = 10;

export const createScroll = () => ({ off: 0, max: 0, drag: null, atEnd: true });

function track(r) { return { x: r.x + r.w - SCROLLBAR_W - 2, y: r.y + 2, w: SCROLLBAR_W, h: r.h - 4 }; }
function thumb(s, r, contentH) {
  const tr = track(r);
  const h = Math.max(24, Math.round(tr.h * Math.min(1, r.h / Math.max(1, contentH))));
  const y = tr.y + (s.max > 0 ? Math.round(((tr.h - h) * s.off) / s.max) : 0);
  return { x: tr.x, y, w: tr.w, h };
}

/** Wheel/slider input. Returns true if the mouse was consumed (click on the slider). */
export function updateScroll(s, r, contentH, m, { step = 60, follow = false } = {}) {
  s.contentH = contentH;
  s.max = Math.max(0, Math.round(contentH - r.h));
  if (follow && s.atEnd) s.off = s.max;
  let used = false;
  if (m.inside && m.wheel && inRect(r, m.x, m.y)) s.off += m.wheel * step;
  if (s.max > 0 && m.clicked && inRect(track(r), m.x, m.y)) {
    const th = thumb(s, r, contentH);
    // click on the track outside the thumb: jump there, then drag from the thumb centre
    if (!inRect(th, m.x, m.y)) s.off = ((m.y - track(r).y - th.h / 2) / (track(r).h - th.h)) * s.max;
    s.drag = { y: m.y, off: Math.max(0, Math.min(s.max, s.off)) };
    used = true;
  }
  if (s.drag) {
    if (!m.down) s.drag = null;
    else {
      const tr = track(r), th = thumb(s, r, contentH);
      s.off = s.drag.off + ((m.y - s.drag.y) * s.max) / Math.max(1, tr.h - th.h);
      used = true;
    }
  }
  s.off = Math.max(0, Math.min(s.max, Math.round(s.off)));
  s.atEnd = s.off >= s.max;
  return used;
}

export function beginClip(ctx, r) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
}
export function endClip(ctx) { ctx.restore(); }

export function drawScrollbar(ctx, s, r) {
  if (!(s.max > 0)) return;
  const tr = track(r);
  ctx.fillStyle = C['0'];
  ctx.fillRect(tr.x, tr.y, tr.w, tr.h);
  const th = thumb(s, r, s.contentH || r.h);
  ctx.fillStyle = s.drag ? C.h : C['3'];
  ctx.fillRect(th.x + 1, th.y, th.w - 2, th.h);
}
