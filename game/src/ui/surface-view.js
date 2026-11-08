// Stage B: drawing battle surfaces (fire, current, water, oil, acid, gas…) and the tile hover tip.
// Colours — palette keys from data/surfaces.js (docs/STYLE.md). Animations: fire flickers (3 frames × 0.15 s), current
// arcs, water/oil/ice/blood shine, acid bubbles, cringe pulses, proxy stripes; gas is fog drawn over units.
import { drawProp } from '../assets/props.js';
import { C } from './draw.js';
import { hotspot } from './tooltip.js';
import { surfaceTip } from './tips.js';
import { surfaceEnterPreview } from '../rules/surfaces.js';

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
const sameKind = (b, x, y, layer, kind) => b.surfaces.get(`${x},${y}`)?.[layer]?.kind === kind;

/** layer 'floor' — under units; 'gas' — fog over units. */
export function drawSurfaces(ctx, S, tms, layer) {
  const b = S.b;
  if (!b.surfaces || !b.surfaces.size) return;
  const defs = b.data.surfaces || {};
  const L = S.L, c = L.cell;
  const frame = Math.floor(tms / 150) % 3;
  for (const [k, cell] of b.surfaces) {
    const s = cell[layer];
    if (!s) continue;
    const d = defs[s.kind];
    if (!d) continue;
    const [x, y] = k.split(',').map(Number);
    const px = L.mapX + x * c, py = L.mapY + y * c;
    const col = C[d.color] || C['5'], core = C[d.core] || col;
    const h = hash(x, y);
    if (layer === 'gas') { drawFog(ctx, px, py, c, col, tms, x, y, s.kind === 'toxgas' ? 0.4 : 0.32); continue; }
    if (s.hazard) continue; // the map sprite already shows permanent fire
    let alpha = 0.35;
    if (d.anim === 'pulse') alpha = 0.25 + 0.15 * Math.sin(tms / 260 + x + y);
    ctx.fillStyle = rgba(col, alpha);
    ctx.fillRect(px, py, c, c);
    // 2 px border on the puddle edge
    ctx.fillStyle = rgba(col, 0.85);
    if (!sameKind(b, x, y - 1, layer, s.kind)) ctx.fillRect(px, py, c, 2);
    if (!sameKind(b, x, y + 1, layer, s.kind)) ctx.fillRect(px, py + c - 2, c, 2);
    if (!sameKind(b, x - 1, y, layer, s.kind)) ctx.fillRect(px, py, 2, c);
    if (!sameKind(b, x + 1, y, layer, s.kind)) ctx.fillRect(px + c - 2, py, 2, c);
    switch (d.anim) {
      case 'flicker': {
        for (let i = 0; i < 3; i++) {
          const fh = c * (0.28 + 0.12 * ((((h >> (i * 3)) & 7) + frame + i) % 3));
          const fx = px + c * (0.2 + 0.3 * i);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(fx, py + c - 3); ctx.lineTo(fx + c * 0.12, py + c - 3 - fh); ctx.lineTo(fx + c * 0.24, py + c - 3); ctx.fill();
          ctx.fillStyle = core;
          ctx.fillRect(fx + c * 0.09, py + c - 3 - fh * 0.45, Math.max(2, c * 0.06), fh * 0.35);
        }
        break;
      }
      case 'arc': drawArc(ctx, px, py, c, col, core, tms, h); break;
      case 'shine': {
        const t = ((tms / 1400 + (h % 100) / 100) % 1);
        ctx.fillStyle = rgba(core, 0.7);
        ctx.fillRect(px + c * (0.15 + 0.5 * t), py + c * (0.3 + (h % 5) * 0.08), Math.max(2, c * 0.18), Math.max(1, c * 0.05));
        break;
      }
      case 'bubble': {
        for (let i = 0; i < 2; i++) {
          const t = ((tms / 1100 + i * 0.5 + (h % 10) / 10) % 1);
          ctx.strokeStyle = rgba(core, 1 - t); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(px + c * (0.3 + 0.4 * i), py + c * (0.8 - 0.5 * t), c * 0.07 + 1, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'pulse': {
        ctx.fillStyle = rgba(core, 0.6);
        const r = c * (0.08 + 0.04 * Math.sin(tms / 200 + h));
        ctx.fillRect(px + c / 2 - r, py + c / 2 - r, r * 2, r * 2);
        break;
      }
      case 'stripes': {
        ctx.strokeStyle = rgba(core, 0.45); ctx.lineWidth = 2;
        const off = (tms / 60) % (c / 2);
        ctx.save(); ctx.beginPath(); ctx.rect(px, py, c, c); ctx.clip();
        ctx.beginPath();
        for (let i = -c; i < c * 2; i += c / 2) { ctx.moveTo(px + i + off, py + c); ctx.lineTo(px + i + off + c, py); }
        ctx.stroke(); ctx.restore();
        break;
      }
      default:
    }
    if (s.charged && s.kind !== 'electric') drawArc(ctx, px, py, c, C.h, C['5'], tms, h);
  }
}

function drawArc(ctx, px, py, c, col, core, tms, h) {
  const step = Math.floor(tms / 120);
  const seed = (h + step * 2654435761) >>> 0;
  ctx.strokeStyle = (seed & 7) === 0 ? core : col;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let x = px + 2, y = py + c * (0.3 + ((seed >> 3) & 3) * 0.12);
  ctx.moveTo(x, y);
  for (let i = 1; i <= 4; i++) {
    x = px + 2 + (c - 4) * i / 4;
    y = py + c * (0.2 + (((seed >> (i * 4)) & 7) / 7) * 0.6);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawFog(ctx, px, py, c, col, tms, x, y, a) {
  const cx = px + c / 2, cy = py + c / 2;
  const ph = tms / 900 + x * 0.7 + y * 1.3;
  ctx.fillStyle = rgba(col, a);
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ph + k * 2.1) * c * 0.18, cy + Math.sin(ph + k * 2.1) * c * 0.14, c * 0.36, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Barrels (T_BARREL): drawn over the cached map layer (they can break mid-battle). */
export function drawBarrels(ctx, S) {
  const b = S.b;
  if (!b.barrels || !b.barrels.length) return;
  const L = S.L, c = L.cell;
  for (const br of b.barrels) {
    const px = L.mapX + br.x * c, py = L.mapY + br.y * c;
    if (b.map?.biome) { drawProp(ctx, br.kind === 'toxgas' ? 'barrel-toxic' : 'barrel', px, py, c / 16); continue; } // battlefields.md props
    ctx.fillStyle = C['0']; ctx.fillRect(px + c * 0.22, py + c * 0.12, c * 0.56, c * 0.8);
    ctx.fillStyle = br.kind === 'toxgas' ? C.k : C['7']; ctx.fillRect(px + c * 0.26, py + c * 0.16, c * 0.48, c * 0.72);
    ctx.fillStyle = C['6']; ctx.fillRect(px + c * 0.26, py + c * 0.32, c * 0.48, Math.max(2, c * 0.06)); ctx.fillRect(px + c * 0.26, py + c * 0.66, c * 0.48, Math.max(2, c * 0.06));
    ctx.fillStyle = C.a; ctx.fillRect(px + c * 0.44, py + c * 0.44, c * 0.12, c * 0.12);
  }
}

/** Tile hover: surface card(s) + «Шаг сюда» preview when the tile is in the hero's move range. */
export function surfaceHover(S, hero, inReach) {
  const b = S.b;
  const hc = S.hover && S.hover.cell;
  if (!hc || !b.surfaces || !b.surfaces.size) return;
  const cell = b.surfaces.get(`${hc.x},${hc.y}`);
  if (!cell) return;
  const step = hero && inReach ? surfaceEnterPreview(b, hero, hc.x, hc.y) : null;
  const L = S.L;
  hotspot(L.mapX + hc.x * L.cell, L.mapY + hc.y * L.cell, L.cell, L.cell, () => {
    const parts = [cell.floor, cell.gas].filter(Boolean).map((s, i, arr) => surfaceTip(s, i === arr.length - 1 ? step : null, b.data.surfaces)).filter(Boolean);
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    return { ...parts[0], lines: [...parts[0].lines, { text: parts[1].title, color: parts[1].titleColor }, ...parts[1].lines.slice(1)] };
  });
}
