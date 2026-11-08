// Battle view of the combat rework (docs/specs/combat-rework.md §5, §9): objects and heights on the map layer,
// object HP bars and hover tips, cover marks, enemy intent icons, the hit/damage card at the target, help line.
// Drawn procedurally in the palette (no new sprite sheets): concrete, flimsy wall, machine, generator, rubble, heights.
import { t } from '../data/text/index.js';
import { C, FONT, FONT_B, LINE, text, fit, panel, bar } from './draw.js';
import { hotspot } from './tooltip.js';
import { T_COVER, T_FULL, T_RUBBLE, T_BARREL, OBJECT_CHARS, elevAt } from '../rules/grid.js';
import { objectAt } from '../rules/terrain.js';
import { intentText } from './unit-pin.js';
import { drawStatusIcon } from '../assets/status-icons.js';
import { PROPS } from '../assets/props.js';
import { weatherLine } from './field-view.js';

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Map char as it looks now: a broken object shows the floor. */
export function liveChar(b, ch, x, y) {
  const tl = b.grid.tiles[y * b.grid.w + x];
  if ((OBJECT_CHARS[ch] || ch === 'b' || ch === 'g') && tl !== T_COVER && tl !== T_FULL && tl !== T_BARREL) return '.';
  return ch;
}

/** Extra drawing of a tile on the static map layer (heights, new objects, rubble). */
export function drawTileExtra(c, b, ch, x, y, cell, opts = {}) {
  const g = b.grid;
  const px = x * cell, py = y * cell;
  const e = elevAt(g, x, y);
  if (e) {
    c.fillStyle = rgba(C['5'], 0.07 * e);
    c.fillRect(px, py, cell, cell);
    // bright rim where the ground drops
    c.fillStyle = rgba(C.b, 0.55);
    const rim = Math.max(2, cell / 16);
    if (elevAt(g, x, y - 1) < e) c.fillRect(px, py, cell, rim);
    if (elevAt(g, x - 1, y) < e) c.fillRect(px, py, rim, cell);
    c.fillStyle = rgba(C['0'], 0.5);
    if (elevAt(g, x, y + 1) < e) c.fillRect(px, py + cell - rim, cell, rim);
    if (elevAt(g, x + 1, y) < e) c.fillRect(px + cell - rim, py, rim, cell);
    const hs = Math.max(10, (cell / 4) | 0); // height steps: one pixel icon per level
    for (let i = 0; i < e; i++) drawStatusIcon(c, 'height', px + 2 + i * (hs - 2), py + cell - hs - 2, hs, { bare: true });
  }
  const tl = g.tiles[y * g.w + x];
  const k = cell / 16;
  if (opts.field && (tl === T_RUBBLE || ch === 'c' || ch === 'C' || ch === 'x')) return; // battlefields.md: biome tiles / props
  if (tl === T_RUBBLE) {
    c.fillStyle = C['3'];
    for (const [ox, oy, w] of [[3, 4, 3], [9, 3, 2], [6, 9, 4], [11, 10, 3], [2, 12, 2]]) c.fillRect(px + ox * k, py + oy * k, w * k, w * k * 0.7);
    return;
  }
  if (tl !== T_COVER && tl !== T_FULL) return;
  if (ch === 'C') { // concrete block: full cover
    c.fillStyle = C['3']; c.fillRect(px + k, py + k, cell - 2 * k, cell - 2 * k);
    c.fillStyle = C['4']; c.fillRect(px + k, py + k, cell - 2 * k, 2 * k);
    c.strokeStyle = C['0']; c.lineWidth = Math.max(1, k); c.strokeRect(px + k, py + k, cell - 2 * k, cell - 2 * k);
  } else if (ch === 'x') { // flimsy wall: full cover, cracked
    c.fillStyle = C['2']; c.fillRect(px, py + 2 * k, cell, cell - 4 * k);
    c.strokeStyle = C['4']; c.lineWidth = Math.max(1, k);
    c.beginPath(); c.moveTo(px + 4 * k, py + 3 * k); c.lineTo(px + 7 * k, py + 8 * k); c.lineTo(px + 5 * k, py + 13 * k);
    c.moveTo(px + 11 * k, py + 4 * k); c.lineTo(px + 10 * k, py + 9 * k); c.stroke();
  } else if (ch === 'm') { // shelf / machine: half cover, burns
    c.fillStyle = C['2']; c.fillRect(px + 2 * k, py + 3 * k, cell - 4 * k, cell - 5 * k);
    c.fillStyle = C['4']; for (let i = 0; i < 3; i++) c.fillRect(px + 2 * k, py + (5 + i * 3.5) * k, cell - 4 * k, k);
    c.fillStyle = C.h; c.fillRect(px + 11 * k, py + 4 * k, 2 * k, 2 * k);
  } else if (ch === 'G') { // generator
    c.fillStyle = C['2']; c.fillRect(px + 3 * k, py + 4 * k, cell - 6 * k, cell - 6 * k);
    c.strokeStyle = C.a; c.lineWidth = Math.max(1, 1.5 * k);
    c.beginPath(); c.moveTo(px + 9 * k, py + 5 * k); c.lineTo(px + 6.5 * k, py + 9 * k); c.lineTo(px + 9.5 * k, py + 9 * k); c.lineTo(px + 7 * k, py + 13 * k); c.stroke();
  }
}

/** HP bars of damaged objects and a tip for the hovered object / height. */
export function drawObjects(ctx, S) {
  const b = S.b, L = S.L;
  if (!b.objects) return;
  const list = [...new Set(b.objects.values()), ...(b.barrels || []).filter((r) => r.hp != null).map((r) => ({ ...r, kind: 'barrel' }))];
  for (const o of list) {
    if (o.hp >= o.maxHp) continue;
    bar(ctx, L.mapX + o.x * L.cell + 3, L.mapY + o.y * L.cell + L.cell - 6, L.cell - 6, Math.max(2, L.s + 1), o.hp, o.maxHp, 'hp');
  }
  // attack mode: mark smashable objects
  if (S.sel && S.sel.kind === 'attack' && S.smashTiles) {
    ctx.strokeStyle = rgba(C.a, 0.8); ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    for (const idx of S.smashTiles) ctx.strokeRect(L.mapX + (idx % b.grid.w) * L.cell + 2, L.mapY + ((idx / b.grid.w) | 0) * L.cell + 2, L.cell - 4, L.cell - 4);
    ctx.setLineDash([]);
  }
  const hc = S.hover.cell;
  if (!hc) return;
  const o = objectAt(b, hc.x, hc.y);
  const e = elevAt(b.grid, hc.x, hc.y);
  if (!o && !e) return;
  hotspot(L.mapX + hc.x * L.cell, L.mapY + hc.y * L.cell, L.cell, L.cell, () => {
    if (!o) return { title: `${t('elev.tile')} ${e}`, lines: [t('elev.hint')] };
    const C2 = b.data.combat?.objects?.[o.kind] || {};
    const lines = [
      { text: `${t('obj.hp')} ${Math.max(0, o.hp)}/${o.maxHp} · ${t('obj.armor')} ${o.armor} · ${t(`cover.${o.cover}`)}`, color: 'b' },
      t(o.kind === 'barrel' ? 'obj.leaves.barrel' : o.kind === 'generator' ? 'obj.leaves.generator' : C2.leaves === 'floor' ? 'obj.leaves.floor' : 'obj.leaves.rubble'),
    ];
    if (o.cover === 'full') lines.push(t('cover.fullHint'));
    lines.push({ text: t('obj.smashHint'), color: '4' });
    return { title: o.name || (o.prop && PROPS[o.prop]?.name) || t(`obj.${o.kind}`), lines };
  });
}

// ---------------------------------------------------------------- intents
/** Icons over enemies (not over the one acting now) with a tip «Бьёт Имя, ~N урона». */
export function drawIntents(ctx, S) {
  const b = S.b, L = S.L;
  if (!S.intents || b.winner) return;
  const cur = b.turn ? b.turn.unitId : null;
  const s = Math.max(10, 5 * L.s);
  for (const id in S.intents) {
    const it = S.intents[id];
    const u = b.byId[id];
    if (!it || !u || u.dead || u.removed || u.down || id === cur) continue;
    const d = S.dispOf(u);
    const x = Math.round(L.mapX + d.x * L.cell + L.cell - s - 1), y = Math.round(L.mapY + d.y * L.cell + 1);
    ctx.fillStyle = C['0']; ctx.fillRect(x - 1, y - 1, s + 2, s + 2);
    drawStatusIcon(ctx, `intent:${it.kind}`, x, y, s);
    hotspot(x - 1, y - 1, s + 2, s + 2, { title: `${t('intent.title')}: ${S.name(id)}`, lines: [intentText(S, it)] });
  }
}

// ---------------------------------------------------------------- hit card at the target
/** «Шанс X% · урон a–b (крит c) · укрытие +N КБ · высота ±N · фланг +1» next to the hovered target. */
export function drawOddsCard(ctx, S, preview) {
  const o = preview.odds, u = preview.target;
  if (!o || !u || o.kind !== 'hit') return;
  const L = S.L;
  const pct = Math.round(o.chance * 100);
  const col = pct >= 75 ? C.j : pct >= 40 ? C.a : C.c;
  const rows = [[`${pct}%`, col, FONT_B]];
  if (o.dmg) rows.push([`${t('odds.dmg')} ${o.dmg[0]}–${o.dmg[1]} (${t('odds.crit')} ${o.dmg[2]})`, C['5'], FONT]);
  const mods = [];
  if (o.cover) mods.push(`${t('odds.cover')} +${o.cover}`);
  if (o.elev) mods.push(`${t('odds.elev')} ${o.elev > 0 ? '+' : ''}${o.elev}`);
  if (o.flank) mods.push(`${t('odds.flank')} +${o.flank}`);
  if (mods.length) rows.push([mods.join(' · '), C['4'], FONT]);
  ctx.font = FONT;
  const w = Math.max(...rows.map((r) => { ctx.font = r[2]; return ctx.measureText(r[0]).width; })) + 14;
  const h = rows.length * LINE + 8;
  const d = S.dispOf(u);
  let x = Math.round(L.mapX + (d.x + 1) * L.cell + 4), y = Math.round(L.mapY + d.y * L.cell - 4);
  if (x + w > L.area.x + L.area.w - 4) x = Math.round(L.mapX + d.x * L.cell - w - 4);
  y = Math.max(L.area.y + 2, Math.min(L.area.y + L.area.h - h - 2, y));
  panel(ctx, x, y, w, h, C['0'], col);
  rows.forEach((r, i) => text(ctx, fit(ctx, r[0], w - 10, r[2]), x + 7, y + 4 + i * LINE, r[1], r[2]));
}

/** Help line under the map + pace indicator. */
export function drawHelp(ctx, S) {
  const L = S.L;
  const y = L.area.y + L.area.h - 20;
  if (S.sel && S.playerTurn) return; // the selection hint lives there
  const wx = weatherLine(S.b.map); // battlefields.md §4: time of day / weather / sight range
  const s0 = S.skip ? t('battle.skipping') : S.fast ? `${t('battle.fastOn')} · ${t('battle.help')}` : t('battle.help');
  const s = wx ? `${wx} · ${s0}` : s0;
  text(ctx, fit(ctx, s, L.area.w - 24), L.area.w / 2, y, S.fast || S.skip ? C.a : C['3'], FONT, 'center');
}
