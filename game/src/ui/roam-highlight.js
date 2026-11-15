// Interactive objects highlight on the free node map (2D and 3D) and the pulse shared with battle markers.
// roamMarks(ents, o) -> marks [{e, kind, col, icon, x0, y0, x1, y1, a, ia, strong, dim, label}] by the setting
// «Подсветка объектов» (gfx prefs `highlight`: always — weak everywhere, near — only within ROAM.highlight.nearR,
// alt — only while Alt is held); in reach / hovered / Alt -> strong + the object's name. 2D: drawMarkFrames2d (cell
// outlines under units); 3D: frames go to drawRoam3d({marks}) as floor quads. Icons and labels — drawMarkIcons, in the
// 2D layer by projection (both modes). Numbers and colours — ROAM.highlight; icons — assets/status-icons.js `obj:*`.
import { C, text } from './draw.js';
import { ROAM } from '../data/world/roam.js';
import { gfxPrefs } from '../gfx/settings.js';
import { drawStatusIcon } from '../assets/status-icons.js';

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`; };

export function hlMode() {
  const M = ROAM.highlight.modes, m = gfxPrefs().highlight;
  return M.includes(m) ? m : M[0];
}
/** Brightness factor around 1 (ROAM.highlight.pulse, ≤ 1 Hz); constant with «Снизить движение». */
export function hlPulse(time) {
  const P = ROAM.highlight.pulse;
  return gfxPrefs().reduceMotion ? 1 : 1 + P.amp * Math.sin(time * 2 * Math.PI * P.hz);
}

/** What an entity is for the highlight: {kind, icon, dim} or null (not interactive / not highlighted). */
export function markKind(e) {
  if (e.kind === 'npc') {
    if (e.n.mark === 'turnin') return { kind: 'quest', icon: 'obj:turnin' };
    if (e.n.mark) return { kind: 'quest', icon: 'obj:quest' };
    return { kind: e.n.trader ? 'trade' : 'npc', icon: null };
  }
  if (e.kind === 'skill') return { kind: 'skill', icon: null }; // the skill badge is its icon
  if (e.kind !== 'obj') return null;
  const o = e.o;
  switch (o.type) {
    case 'stall': return o.npc ? { kind: 'trade', icon: 'obj:coin' } : null;
    case 'stash': return { kind: 'loot', icon: o.opened ? null : 'obj:crate', dim: !!o.opened };
    case 'exit': return { kind: 'exit', icon: 'obj:door' };
    case 'bed': return { kind: 'rest', icon: 'obj:bed' };
    case 'bench': return { kind: 'craft', icon: 'obj:gear' };
    case 'terminal': return { kind: 'tech', icon: 'obj:screen' };
    case 'transit': return { kind: 'transit', icon: 'obj:post' };
    default: return null;
  }
}

/**
 * Marks of the entities. o: {ld: {cx, cy}, reach(e) -> bool, hovered(e) -> bool, alt, time, name(e) -> label}.
 */
export function roamMarks(ents, o) {
  const HL = ROAM.highlight, mode = hlMode(), pulse = hlPulse(o.time || 0), out = [];
  for (const e of ents) {
    const k = markKind(e);
    if (!k) continue;
    let x0, y0, x1, y1;
    if (e.kind === 'obj' && e.o.cells?.length) {
      x0 = Math.min(...e.o.cells.map((c) => c[0])); y0 = Math.min(...e.o.cells.map((c) => c[1]));
      x1 = Math.max(...e.o.cells.map((c) => c[0])) + 1; y1 = Math.max(...e.o.cells.map((c) => c[1])) + 1;
    } else { x0 = Math.round(e.x); y0 = Math.round(e.y); x1 = x0 + 1; y1 = y0 + 1; }
    const dx = Math.max(x0 - o.ld.cx, 0, o.ld.cx - (x1 - 1)), dy = Math.max(y0 - o.ld.cy, 0, o.ld.cy - (y1 - 1));
    const hov = !!o.hovered?.(e), reach = !!o.reach?.(e);
    const strong = hov || reach || !!o.alt;
    const show = hov || o.alt || mode === 'always' || (mode === 'near' && Math.max(dx, dy) <= HL.nearR);
    if (!show) continue;
    const base = k.dim ? HL.alpha.dim : strong ? HL.alpha.strong : k.kind === 'npc' ? HL.alpha.npc : HL.alpha.weak;
    out.push({
      e, kind: k.kind, col: HL.colors[k.kind] || '5', icon: k.icon, dim: !!k.dim, strong, x0, y0, x1, y1,
      a: k.dim || strong ? base : base * pulse,
      ia: strong ? 1 : k.dim ? 0 : HL.alpha.iconWeak,
      label: strong && e.kind === 'obj' && o.name ? o.name(e) : null,
    });
  }
  return out;
}

/** 2D: thin outlines of the marked cells (dark backing line + the kind's colour). scr(x, y) -> [px, py] of the cell. */
export function drawMarkFrames2d(ctx, marks, scr, c) {
  for (const m of marks) {
    const [px, py] = scr(m.x0, m.y0), w = (m.x1 - m.x0) * c, h = (m.y1 - m.y0) * c;
    const lw = m.strong ? 2 : 1;
    ctx.strokeStyle = rgba(C['0'], Math.min(0.5, m.a * 0.6)); ctx.lineWidth = lw + 2;
    ctx.strokeRect(px + 1 + lw / 2, py + 1 + lw / 2, w - 2 - lw, h - 2 - lw);
    ctx.strokeStyle = rgba(C[m.col], m.a); ctx.lineWidth = lw;
    ctx.strokeRect(px + 1 + lw / 2, py + 1 + lw / 2, w - 2 - lw, h - 2 - lw);
  }
}

/** 3D floor frames for drawRoam3d({marks}): [{x0, y0, x1, y1, key, a, w}]. */
export const marks3d = (marks) => marks.map((m) => ({ x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1, key: m.col, a: m.a, w: m.strong ? 0.07 : 0.045 }));

/** Icons over the marks (and the name when strong). at(m) -> {x, y} — bottom centre of the icon in screen px. */
export function drawMarkIcons(ctx, marks, at, W0, H0) {
  const S = ROAM.highlight.icon, P = S + 4;
  for (const m of marks) {
    if (!m.icon && !m.label) continue;
    const p = at(m);
    if (!p || p.x < -P || p.y < -P || p.x > W0 + P || p.y > H0 + P) continue;
    const x = Math.round(p.x - P / 2), y = Math.round(p.y - P);
    if (m.icon && m.ia > 0) {
      ctx.save(); ctx.globalAlpha = m.ia;
      ctx.fillStyle = rgba(C['0'], 0.75); ctx.fillRect(x, y, P, P);
      ctx.strokeStyle = rgba(C[m.col], m.strong ? 0.95 : 0.6); ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, P - 1, P - 1);
      drawStatusIcon(ctx, m.icon, x + 2, y + 2, S, { bare: true });
      ctx.restore();
    }
    if (m.label) {
      ctx.font = '12px monospace';
      const tw = ctx.measureText(m.label).width + 8, ly = m.icon ? y - 16 : y + P - 15;
      ctx.fillStyle = rgba(C['0'], 0.75); ctx.fillRect(Math.round(p.x - tw / 2), ly, tw, 15);
      text(ctx, m.label, p.x, ly + 1, C[m.col], '12px monospace', 'center');
    }
  }
}
