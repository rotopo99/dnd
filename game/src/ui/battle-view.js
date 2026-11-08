// Battle rendering: cached static map layer, highlights, units, bars, popups, action bar, side panel, log,
// banner and result overlays. State object S comes from scenes/battle.js.
import { t } from '../data/text/index.js';
import { drawUnitPortrait } from './portrait-of.js';
import { TILE, drawSprite, drawTeamMarker, heroSpriteIds, enemySpriteIds, tileSpriteIds, idleFrame } from '../assets/sprites.js';
import { abilityRange, unitView, movePath, statusFactor, isStatusImmune } from '../rules/combat.js';
import { drawSurfaces, drawBarrels, surfaceHover } from './surface-view.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, textBlock, wrap, fit, panel, button, bar, clear, TMP_COLOR } from './draw.js';
import { teamColor } from './battle-log.js';
import { ITEMS } from '../data/index.js';
import { beginClip, endClip, drawScrollbar, SCROLLBAR_W } from './scroll.js';
import { hotspot } from './tooltip.js';
import { resLineTip, resTip, statusTip, termTip } from './tips.js';
import { itemTip } from './items-ui.js';
import { liveChar, drawTileExtra, drawObjects, drawIntents, drawOddsCard, drawHelp } from './battle-terrain.js';
import { drawPin, intentText } from './unit-pin.js';

const PANEL_W = 340;
const BOTTOM_H = 232;
const TOP_H = 40;

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const CY_FILL = rgba(C.h, 0.16);
const CY_LINE = rgba(C.h, 0.55);
const RANGE_FILL = rgba(C.h, 0.08);
const TARGET_FILL = rgba(C.a, 0.22);
const AREA_FILL = rgba(C.n, 0.25);
const AREA_OWN = rgba(C.j, 0.2);
const areaFill = (a) => (a.target === 'self' || a.target === 'ally' ? AREA_OWN : AREA_FILL);
const RED_FILL = rgba(C.c, 0.3);
const SHADE = rgba(C['0'], 0.72);

/** Compute layout for the current canvas size. Also (re)builds the static map layer. */
export function layoutBattle(game, S) {
  const W = game.width, H = game.height;
  const g = S.b.grid;
  const area = { x: 0, y: TOP_H, w: W - PANEL_W, h: H - BOTTOM_H - TOP_H };
  const s = Math.max(1, Math.min(3, Math.floor(area.w / (g.w * TILE)), Math.floor(area.h / (g.h * TILE))));
  const cell = TILE * s;
  const mw = g.w * cell, mh = g.h * cell;
  const L = {
    W, H, s, cell, area,
    mapX: area.x + Math.floor((area.w - mw) / 2),
    mapY: area.y + Math.floor((area.h - mh) / 2),
    panel: { x: W - PANEL_W, y: 0, w: PANEL_W, h: H },
    bar: { x: 8, y: H - BOTTOM_H + 8, w: W - PANEL_W - 16, h: 60 },
    log: { x: 8, y: H - BOTTOM_H + 76, w: W - PANEL_W - 16, h: BOTTOM_H - 84 },
  };
  L.map = { x: L.mapX, y: L.mapY, w: mw, h: mh };
  S.L = L;
  buildMapLayer(S);
  if (S.buttons) layoutBattle.buttons(S);
  if (S.result) layoutBattle.result(game, S);
}

layoutBattle.buttons = (S) => {
  const L = S.L;
  const gap = 6;
  const FIXED = { attack: 92, dash: 100, disengage: 100, endTurn: 116, retreat: 100 };
  let fixed = 0, nAb = 0;
  for (const b of S.buttons) { if (FIXED[b.id]) fixed += FIXED[b.id]; else nAb++; }
  const free = L.bar.w - fixed - gap * (S.buttons.length - 1);
  let aw = nAb ? Math.min(180, Math.floor(free / nAb)) : 0;
  const bottom = L.H - 8;
  if (nAb && aw < 110) {
    // many abilities: two rows — abilities on top (min 120 px each), overflow abilities after the base actions below
    const h = 48;
    const per1 = Math.max(1, Math.min(nAb, Math.floor((L.bar.w + gap) / (120 + gap))));
    const w1 = Math.min(180, Math.floor((L.bar.w - gap * (per1 - 1)) / per1));
    let fx = L.bar.x;
    for (const b of S.buttons) if (FIXED[b.id]) { Object.assign(b, { x: fx, y: L.bar.y + h + gap, w: FIXED[b.id], h }); fx += FIXED[b.id] + gap; }
    const rest = nAb - per1;
    const w2 = rest ? Math.min(180, Math.floor((L.bar.x + L.bar.w - fx - gap * (rest - 1)) / rest)) : 0;
    let k = 0, xa = L.bar.x;
    for (const b of S.buttons) {
      if (FIXED[b.id]) continue;
      if (k < per1) { Object.assign(b, { x: xa, y: L.bar.y, w: w1, h }); xa += w1 + gap; }
      else { Object.assign(b, { x: fx, y: L.bar.y + h + gap, w: w2, h }); fx += w2 + gap; }
      k++;
    }
    const top = L.bar.y + 2 * h + gap + 8;
    L.log = { x: L.bar.x, y: top, w: L.bar.w, h: bottom - top };
    layoutQuick(S);
    return;
  }
  let x = L.bar.x;
  for (const b of S.buttons) {
    const w = FIXED[b.id] || aw;
    Object.assign(b, { x, y: L.bar.y, w, h: L.bar.h });
    x += w + gap;
  }
  const top = L.bar.y + L.bar.h + 8;
  L.log = { x: L.bar.x, y: top, w: L.bar.w, h: bottom - top };
  layoutQuick(S);
};

/** v7 quick slots (1–6) + «Порыться»: right part of the log row; the log gets narrower. */
function layoutQuick(S) {
  const list = S.quickBtns || [];
  if (!list.length) return;
  const L = S.L;
  const slots = list.filter((b) => b.id !== 'rummage');
  const w = slots.length * 50 + 4;
  const x0 = L.log.x + L.log.w - Math.max(w, 160);
  L.log = { ...L.log, w: Math.max(200, x0 - L.log.x - 8) };
  slots.forEach((b, i) => Object.assign(b, { x: x0 + i * 50, y: L.log.y, w: 46, h: 44 }));
  const r = list.find((b) => b.id === 'rummage');
  if (r) Object.assign(r, { x: x0, y: L.log.y + 48, w: Math.max(150, w - 4), h: Math.min(40, Math.max(24, L.log.h - 48)) });
}

layoutBattle.result = (game, S) => {
  const W = game.width, H = game.height;
  const pw = 640, ph = 300;
  const x = Math.floor((W - pw) / 2), y = Math.floor((H - ph) / 2);
  S.resultBox = { x, y, w: pw, h: ph };
  const by = y + ph - 64;
  S.resultButtons = S.result === 'win'
    ? [{ id: 'next', label: t('battle.continue'), x: x + pw / 2 - 110, y: by, w: 220, h: 44 }]
    : S.opts.onLose ? [{ id: 'lose', label: t('battle.continue'), x: x + pw / 2 - 110, y: by, w: 220, h: 44 }]
    : [
      { id: 'retry', label: t('battle.retry'), x: x + pw / 2 - 230, y: by, w: 220, h: 44 },
      { id: 'menu', label: t('menu.back'), x: x + pw / 2 + 10, y: by, w: 220, h: 44 },
    ];
};

function buildMapLayer(S) {
  const { b } = S;
  const L = S.L;
  const g = b.grid;
  const rows = b.map.grid;
  const cv = document.createElement('canvas');
  cv.width = g.w * L.cell;
  cv.height = g.h * L.cell;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  S.fireTiles = [];
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const ch = rows[y][x] ?? '#';
      let ids = tileSpriteIds(liveChar(b, ch, x, y), x, y);
      if (ids.includes('obj-fire')) { S.fireTiles.push(x, y); ids = ids.filter((i) => i !== 'obj-fire'); }
      drawSprite(c, ids, x * L.cell, y * L.cell, L.s);
      drawTileExtra(c, b, ch, x, y, L.cell); // combat rework: heights, new objects, rubble
    }
  }
  // grid seams: very faint, helps reading distances
  c.strokeStyle = rgba(C['0'], 0.25);
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 1; x < g.w; x++) { c.moveTo(x * L.cell + 0.5, 0); c.lineTo(x * L.cell + 0.5, cv.height); }
  for (let y = 1; y < g.h; y++) { c.moveTo(0, y * L.cell + 0.5); c.lineTo(cv.width, y * L.cell + 0.5); }
  c.stroke();
  S.mapLayer = cv;
  S.gridV = b.gridVersion || 0;
}

const isHidden = (u) => u.team === 'enemies' && u.statuses.some((s) => s.id === 'invisible' || s.id === 'stealth');
/** Enemy the player cannot see (invisible / stealth): not drawn, not highlighted, not clickable. */
export const isHiddenFoe = (u) => !!u && !u.dead && !u.removed && isHidden(u);
const drawList = [];
const affected = new Set();
const byDispY = (S) => (a, c) => S.disp[a.id].y - S.disp[c.id].y;

/** Portraits v2 in battle: live hp/mrl from the display state, event emotion (battle.js emote) or neutral. */
function battlePortrait(ctx, S, u, x, y, scale) {
  const d = S.dispOf(u);
  const emotion = d.emoT > 0 && d.emo ? d.emo : 'neutral';
  drawUnitPortrait(ctx, u, x, y, scale, { native: true, emotion, hurtAt: d.hurtAt, hp: u.maxHp ? d.hp / u.maxHp : 1, mrl: u.maxMrl ? d.mrl / u.maxMrl : 1 });
}

function unitSprite(u) {
  return u.kind === 'hero' ? heroSpriteIds(u.raceId, u.classId, u.look) : enemySpriteIds(u.enemyId);
}
const markerTeam = (u) => (u.team === 'heroes' ? (u.kind === 'hero' ? 'player' : 'ally') : u.team === 'enemies' ? 'enemy' : 'a');

// ---------------------------------------------------------------- main render
export function renderBattle(game, S) {
  const { ctx } = game;
  const L = S.L;
  const b = S.b;
  clear(ctx, L.W, L.H);
  ctx.imageSmoothingEnabled = false;
  if ((b.gridVersion || 0) !== S.gridV) buildMapLayer(S); // a barrel / object broke
  // combat rework: camera shake on crits, explosions, boss phases
  const shaking = S.shake > 0;
  if (shaking) { ctx.save(); ctx.translate(Math.round((Math.random() - 0.5) * 8), Math.round((Math.random() - 0.5) * 8)); }
  ctx.drawImage(S.mapLayer, L.mapX, L.mapY);
  const tms = S.time * 1000;
  drawSurfaces(ctx, S, tms, 'floor');
  drawBarrels(ctx, S);
  // fire (animated)
  for (let i = 0; i < S.fireTiles.length; i += 2) {
    drawSprite(ctx, 'obj-fire', L.mapX + S.fireTiles[i] * L.cell, L.mapY + S.fireTiles[i + 1] * L.cell, L.s, { frame: idleFrame(tms * 0.8, i * 0.13) });
  }
  // v3.1: zones (smoke) — soft clouds over their cells
  for (const z of b.zones || []) {
    const R = z.size || 1, c = L.cell;
    for (let y = z.y - R; y <= z.y + R; y++) for (let x = z.x - R; x <= z.x + R; x++) {
      if (x < 0 || y < 0 || x >= b.grid.w || y >= b.grid.h) continue;
      const px = L.mapX + (x + 0.5) * c, py = L.mapY + (y + 0.5) * c;
      const ph = tms / 900 + x * 0.7 + y * 1.3;
      ctx.fillStyle = z.kind === 'smoke' ? 'rgba(180,186,200,0.32)' : 'rgba(120,200,140,0.25)';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(px + Math.cos(ph + k * 2.1) * c * 0.18, py + Math.sin(ph + k * 2.1) * c * 0.14, c * 0.36, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // v3.1: dropped (thrown) weapons
  for (const d of b.drops || []) {
    const c = L.cell, px = L.mapX + d.x * c, py = L.mapY + d.y * c;
    ctx.strokeStyle = C['5']; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px + c * 0.2, py + c * 0.8); ctx.lineTo(px + c * 0.8, py + c * 0.2); ctx.stroke();
  }
  // v3: own traps (enemy traps stay hidden)
  for (const tr of b.traps || []) {
    if (tr.team !== 'heroes') continue;
    const x = L.mapX + tr.x * L.cell, y = L.mapY + tr.y * L.cell, c = L.cell;
    ctx.strokeStyle = C.a; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + c * 0.25, y + c * 0.25); ctx.lineTo(x + c * 0.75, y + c * 0.75);
    ctx.moveTo(x + c * 0.75, y + c * 0.25); ctx.lineTo(x + c * 0.25, y + c * 0.75); ctx.stroke();
    ctx.strokeRect(x + c * 0.18, y + c * 0.18, c * 0.64, c * 0.64);
  }
  drawObjects(ctx, S);
  const preview = drawHighlights(ctx, S);
  drawUnits(ctx, S, preview, tms);
  drawIntents(ctx, S);
  drawSurfaces(ctx, S, tms, 'gas');
  {
    const hc = S.hover.cell;
    const inReach = !!(hc && S.playerTurn && !S.sel && S.reach && S.reach.dist[hc.y * b.grid.w + hc.x] > 0);
    surfaceHover(S, b.byId[S.heroId], inReach);
  }
  drawPopups(ctx, S);
  drawActPops(ctx, S);
  if (shaking) ctx.restore();
  drawOddsCard(ctx, S, preview);
  drawHelp(ctx, S);
  drawPin(ctx, S);
  drawTopBar(ctx, S);
  drawActionBar(ctx, S);
  drawQuickBar(ctx, S);
  drawLog(ctx, S);
  drawPanel(ctx, S, preview);
  if (S.message) {
    const w = Math.min(L.area.w - 40, 560);
    const x = L.area.x + Math.floor((L.area.w - w) / 2);
    panel(ctx, x, L.mapY + 8, w, 32, C['1'], C.a);
    text(ctx, fit(ctx, S.message.text, w - 16), x + w / 2, L.mapY + 16, C.a, FONT, 'center');
  }
  if (S.banner) drawBanner(ctx, S);
  if (S.result) drawResult(ctx, S);
}

function cellRect(ctx, L, x, y, fill, stroke) {
  const px = L.mapX + x * L.cell, py = L.mapY + y * L.cell;
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(px, py, L.cell, L.cell); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, L.cell - 2, L.cell - 2); }
}

function unitAtCell(b, x, y) {
  for (const u of b.units) if (!u.dead && !u.removed && u.x === x && u.y === y && !isHidden(u)) return u;
  return null;
}

/** Highlights for reach / path / ability range and area. Returns preview info for the panel. */
function drawHighlights(ctx, S) {
  const L = S.L, b = S.b;
  const w = b.grid.w;
  const hc = S.hover.cell;
  const out = { target: null, odds: null, area: null, path: null };
  const hero = b.byId[S.heroId];
  const busy = S.queue.length > 0;
  if (!S.playerTurn || busy || S.result) {
    if (hc) out.target = unitAtCell(b, hc.x, hc.y);
    return out;
  }
  if (S.sel) {
    // ability / attack range
    const range = S.sel.kind === 'attack' ? (hero.weapon?.range || 1) : abilityRange(hero, S.sel.a);
    if (range > 0) {
      for (let y = hero.y - range; y <= hero.y + range; y++) {
        for (let x = hero.x - range; x <= hero.x + range; x++) {
          if (x < 0 || y < 0 || x >= w || y >= b.grid.h || b.grid.tiles[y * w + x] === 1) continue;
          cellRect(ctx, L, x, y, RANGE_FILL);
        }
      }
    }
    for (const [idx] of S.targetCells || []) cellRect(ctx, L, idx % w, (idx / w) | 0, TARGET_FILL, rgba(C.a, 0.7));
    const tc = hc && S.targetCells && S.targetCells.get(hc.y * w + hc.x);
    if (tc) {
      if (S.sel.kind === 'ability') {
        const pv = S.areaPreview(S.sel.a, tc);
        for (const idx of pv.tiles) if (b.grid.tiles[idx] !== 1) cellRect(ctx, L, idx % w, (idx / w) | 0, areaFill(S.sel.a));
        out.area = pv;
      }
      const tu = tc.target ? b.byId[tc.target] : unitAtCell(b, hc.x, hc.y);
      out.target = tu;
      if (tu) out.odds = S.odds(tu);
      cellRect(ctx, L, hc.x, hc.y, null, C.a);
    } else if (hc) out.target = unitAtCell(b, hc.x, hc.y);
    return out;
  }
  // hovering a self/aura ability button: show its area around the hero
  const hb = S.hover.button;
  if (hb && hb.a && hb.a.area && !hb.disabled) {
    const pv = S.areaPreview(hb.a, null);
    for (const idx of pv.tiles) if (b.grid.tiles[idx] !== 1) cellRect(ctx, L, idx % w, (idx / w) | 0, areaFill(hb.a));
    out.area = pv;
  }
  // reachable tiles
  if (S.reach) {
    for (const idx of S.reach.list) if (S.reach.dist[idx] > 0) cellRect(ctx, L, idx % w, (idx / w) | 0, CY_FILL);
  }
  if (hc) {
    const idx = hc.y * w + hc.x;
    const u = unitAtCell(b, hc.x, hc.y);
    out.target = u;
    if (u && S.attackTargets.has(u.id)) {
      cellRect(ctx, L, hc.x, hc.y, RED_FILL, C.c);
      out.odds = S.odds(u, { kind: 'attack' });
    } else if (S.reach && S.reach.dist[idx] > 0) {
      const pc = S.pathCache;
      if (!pc || pc.idx !== idx || pc.reach !== S.reach || pc.sv !== b.surfaceVersion) {
        S.pathCache = { idx, reach: S.reach, sv: b.surfaceVersion, path: movePath(b, hero, { x: hc.x, y: hc.y }) || [] };
      }
      const path = S.pathCache.path;
      out.path = path;
      ctx.fillStyle = C.h;
      const d = Math.max(2, L.s * 2);
      for (const p of path) ctx.fillRect(L.mapX + p.x * L.cell + L.cell / 2 - d / 2, L.mapY + p.y * L.cell + L.cell / 2 - d / 2, d, d);
      cellRect(ctx, L, hc.x, hc.y, null, CY_LINE);
      text(ctx, String(path.length), L.mapX + hc.x * L.cell + L.cell - 3, L.mapY + hc.y * L.cell + 2, C.h, '12px monospace', 'right');
    }
  }
  return out;
}

function drawUnits(ctx, S, preview, tms) {
  const L = S.L, b = S.b;
  drawList.length = 0;
  for (const u of b.units) {
    const d = S.dispOf(u);
    if (!d.gone && (!(u.dead || u.removed) || d.fade > 0)) drawList.push(u);
  }
  if (!S.sortByY) S.sortByY = byDispY(S);
  drawList.sort(S.sortByY);
  const list = drawList;
  const cur = b.turn ? b.turn.unitId : null;
  affected.clear();
  if (preview.area) for (const au of preview.area.units) affected.add(au.id);
  for (const u of list) {
    const d = S.dispOf(u);
    const hidden = isHidden(u) && !(u.dead || u.removed);
    const own = u.team === 'heroes';
    if (hidden && !own) continue;
    const px = Math.round(L.mapX + d.x * L.cell);
    let py = Math.round(L.mapY + d.y * L.cell);
    let alpha = 1;
    if (u.dead || u.removed) { alpha = Math.max(0, d.fade); py -= Math.round((1 - d.fade) * (d.drift ? L.cell : 4)); }
    if (d.down) alpha = 0.5;
    if (hidden) alpha = 0.55;
    ctx.globalAlpha = alpha;
    if (!(u.dead || u.removed)) drawTeamMarker(ctx, markerTeam(u), px, py, L.s);
    let tint = null;
    if (u.id === cur && !(u.dead || u.removed)) tint = own ? (u.kind === 'hero' ? 'h' : 'j') : 'c';
    if ((preview.target === u) || affected.has(u.id)) tint = 'a';
    const moving = d.path.length > 0;
    drawSprite(ctx, unitSprite(u), px, py, L.s, {
      frame: d.down ? 0 : moving ? 1 : idleFrame(tms, d.phase), flip: u.team === 'enemies', tint, mono: d.flash > 0 ? '5' : null,
    });
    ctx.globalAlpha = 1;
    if (u.dead || u.removed) continue;
    // overhead bars
    const bw = L.cell - 6, bh = Math.max(2, L.s + 1);
    const bx = px + 3;
    const base = String(u.enemyId || '').split('^')[0];
    const by = py - (base.startsWith('acolyte') ? 8 : base.startsWith('junk-mech') ? 4 : 0) * L.s - bh * 2 - 4;
    bar(ctx, bx, by, bw, bh, d.hp, u.maxHp, 'hp', u.shield ? u.shield.value : 0);
    if (u.maxMrl > 0) bar(ctx, bx, by + bh + 1, bw, bh, d.mrl, u.maxMrl, 'mrl');
    // status icons (Stage B: palette colour per status, max 4, then «+N»)
    let sx = bx;
    const pip = Math.max(4, L.s * 2);
    u.statuses.forEach((s, i) => {
      if (i > 4 || (i === 4 && u.statuses.length > 5)) return;
      if (i === 4 || sx + pip > bx + bw) {
        if (i < u.statuses.length) text(ctx, `+${u.statuses.length - i}`, sx, by - pip - 8, C['5'], '10px monospace');
        sx = bx + bw + 99;
        return;
      }
      const def = b.data.statuses[s.id];
      ctx.fillStyle = C['0']; ctx.fillRect(sx - 1, by - pip - 3, pip + 2, pip + 2);
      ctx.fillStyle = def && def.icon ? C[def.icon] : def && def.kind === 'buff' ? C.j : C.a;
      ctx.fillRect(sx, by - pip - 2, pip, pip);
      sx += pip + 2;
    });
    if (d.down) text(ctx, t('battle.downTag'), px + L.cell - 2, py + 2, C.c, FONT_B, 'right');
  }
  // speech bubbles
  for (const bu of S.bubbles) {
    const u = b.byId[bu.id];
    const d = u ? S.dispOf(u) : null;
    if (!u || !d || d.gone || (isHidden(u) && u.team !== 'heroes')) continue;
    const pw = bu.portrait ? 52 : 0; // story lines carry a 48 px portrait
    const lines = wrap(ctx, bu.text, 240);
    const bw = Math.min(260, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16) + pw;
    const bh = Math.max(lines.length * LINE + 10, pw ? 56 : 0);
    let x = Math.round(L.mapX + d.x * L.cell + L.cell / 2 - bw / 2);
    x = Math.max(4, Math.min(L.area.w - bw - 4, x));
    const y = Math.max(TOP_H + 2, Math.round(L.mapY + d.y * L.cell - bh - 14 * L.s / 2 - 10));
    ctx.globalAlpha = bu.t > 2.8 ? Math.max(0, (3.2 - bu.t) / 0.4) : 1;
    panel(ctx, x, y, bw, bh, C['5'], C['0']);
    if (pw) battlePortrait(ctx, S, u, x + 4, y + 4, 1);
    lines.forEach((l, i) => text(ctx, l, x + 8 + pw, y + 5 + i * LINE, C['0']));
    ctx.globalAlpha = 1;
  }
}

function drawPopups(ctx, S) {
  const L = S.L;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = 3;
  ctx.strokeStyle = C['0'];
  for (const p of S.popups) {
    if (p.t < 0) continue;
    const x = L.mapX + p.x * L.cell + L.cell / 2;
    const y = L.mapY + p.y * L.cell - 8 - p.t * 28;
    ctx.globalAlpha = p.t > 0.8 ? Math.max(0, (1.1 - p.t) / 0.3) : 1;
    ctx.strokeText(p.text, x, y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y);
  }
  ctx.globalAlpha = 1;
}

/** Action / ability / item names over the acting unit in its team colour (S.actPops, ~1 s). */
function drawActPops(ctx, S) {
  const L = S.L;
  const font = 'bold 14px monospace';
  for (const p of S.actPops || []) {
    const u = p.tx != null ? null : S.b.byId[p.id];
    if (!u && p.tx == null) continue;
    const d = u ? S.dispOf(u) : { x: p.tx, y: p.ty };
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(p.text).width) + 14;
    const x = Math.round(L.mapX + d.x * L.cell + L.cell / 2 - w / 2);
    const y = Math.max(TOP_H + 2, Math.round(L.mapY + d.y * L.cell - 34 - Math.min(0.25, p.t) * 16));
    ctx.globalAlpha = p.t > 0.9 ? Math.max(0, (1.2 - p.t) / 0.3) : 1;
    panel(ctx, x, y, w, 20, C['0'], p.color);
    text(ctx, p.text, x + w / 2, y + 3, p.color, font, 'center');
    ctx.globalAlpha = 1;
  }
}

function drawTopBar(ctx, S) {
  const L = S.L, b = S.b;
  const cu = b.turn && !b.winner ? b.byId[b.turn.unitId] : null;
  const roundW = 110;
  let labelW = 0;
  if (cu) {
    const many = S.partySize > 1;
    const label = cu.id === S.heroId && S.playerTurn ? (many ? `${t('battle.yourTurn')}: ${S.name(cu.id)}` : t('battle.yourTurn')) : cu.team === 'heroes' ? `${t('battle.allyTurn')}: ${S.name(cu.id)}` : `${t('battle.enemyTurn')}: ${S.name(cu.id)}`;
    const s = fit(ctx, label, L.area.w - 2 * roundW - 40, FONT_L);
    ctx.font = FONT_L;
    labelW = ctx.measureText(s).width;
    text(ctx, s, L.area.w / 2, 8, teamColor(cu), FONT_L, 'center');
  }
  const titleW = Math.floor((L.area.w - labelW) / 2) - 24;
  if (titleW > 40) text(ctx, fit(ctx, S.opts.title || '', titleW, FONT_B), 12, 12, C['4'], FONT_B);
  text(ctx, `${t('battle.round')} ${b.round}`, L.area.w - 12, 12, C['4'], FONT_B, 'right');
  if (S.sel && S.playerTurn) {
    const key = S.sel.kind === 'ability' && S.sel.a.target === 'tile' ? 'battle.selectTile' : 'battle.selectTarget';
    text(ctx, t(key), L.area.w / 2, L.area.y + L.area.h - 20, C.a, FONT, 'center');
  }
}

const AB_FONT = 'bold 14px monospace';
function drawActionBar(ctx, S) {
  for (const btn of S.buttons) {
    if (!btn.a) { button(ctx, btn, S.hover.button === btn); continue; }
    // ability: name in up to 2 lines + cost line
    const hover = S.hover.button === btn;
    const fill = btn.selected ? C.i : hover && !btn.disabled ? C['3'] : C['2'];
    panel(ctx, btn.x, btn.y, btn.w, btn.h, fill, btn.selected ? C.h : hover && !btn.disabled ? C['4'] : C['3']);
    const col = btn.disabled ? C['3'] : C['5'];
    const lines = wrap(ctx, btn.label, btn.w - 12, AB_FONT);
    const cx = btn.x + btn.w / 2;
    if (btn.h < 56) {
      const sm = 'bold 12px monospace';
      const l2 = wrap(ctx, btn.label, btn.w - 20, sm);
      if (l2.length === 1) text(ctx, l2[0], cx, btn.y + 10, col, sm, 'center');
      else { text(ctx, fit(ctx, l2[0], btn.w - 20, sm), cx, btn.y + 4, col, sm, 'center'); text(ctx, fit(ctx, l2.slice(1).join(' '), btn.w - 20, sm), cx, btn.y + 17, col, sm, 'center'); }
    }
    else if (lines.length === 1) text(ctx, lines[0], cx, btn.y + 18, col, AB_FONT, 'center');
    else {
      text(ctx, fit(ctx, lines[0], btn.w - 12, AB_FONT), cx, btn.y + 12, col, AB_FONT, 'center');
      text(ctx, fit(ctx, lines.slice(1).join(' '), btn.w - 12, AB_FONT), cx, btn.y + 27, col, AB_FONT, 'center');
    }
    text(ctx, fit(ctx, btn.sub, btn.w - 8, '12px monospace'), cx, btn.y + btn.h - 15, btn.disabled ? C['3'] : btn.a.cost ? C.b : C['4'], '12px monospace', 'center');
    if (btn.key) text(ctx, btn.key, btn.x + 4, btn.y + 2, btn.disabled ? C['3'] : C.a, '12px monospace');
    if (btn.a.action === 'bonus') text(ctx, t('battle.bonusTag'), btn.x + btn.w - 4, btn.y + 2, btn.disabled ? C['3'] : C.j, '12px monospace', 'right');
  }
}

/** v7 quick slots (keys 1–6) + «Порыться в рюкзаке» over the map's bottom-left corner. */
function drawQuickBar(ctx, S) {
  const list = S.quickBtns || [];
  if (!list.length) return;
  const items = S.b.data.items;
  for (const btn of list) {
    if (btn.id === 'rummage') { button(ctx, btn, S.hover.button === btn); continue; }
    const hover = S.hover.button === btn;
    panel(ctx, btn.x, btn.y, btn.w, btn.h, btn.selected ? C.i : hover && !btn.disabled ? C['3'] : C['1'], btn.selected ? C.h : btn.quick ? C['4'] : C['2']);
    text(ctx, btn.key, btn.x + 3, btn.y + 1, btn.disabled ? C['3'] : C.a, '12px monospace');
    if (!btn.quick) continue;
    const it = items[btn.quick];
    const short = fit(ctx, it.name, btn.w - 6, 'bold 11px monospace');
    text(ctx, short, btn.x + btn.w / 2, btn.y + 15, btn.disabled ? C['3'] : C['5'], 'bold 11px monospace', 'center');
    text(ctx, `×${btn.n}`, btn.x + btn.w - 3, btn.y + btn.h - 14, C.b, '12px monospace', 'right');
    hotspot(btn.x, btn.y, btn.w, btn.h, () => itemTip(it, { have: btn.n }));
  }
}

function drawLog(ctx, S) {
  const L = S.L;
  const r = L.log;
  const sc = S.logScroll || { off: Math.max(0, S.log.length * LINE + 8 - r.h), max: 0 };
  panel(ctx, r.x, r.y, r.w, r.h, C['1'], C['2']);
  const first = Math.max(0, Math.floor((sc.off - 4) / LINE));
  const last = Math.min(S.log.length, first + Math.ceil(r.h / LINE) + 1);
  const right = r.x + r.w - SCROLLBAR_W - 8;
  beginClip(ctx, r);
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let i = first; i < last; i++) {
    const y = r.y + 4 + i * LINE - sc.off;
    const entry = S.log[i];
    // fitted segments (+ hover tips of terms: statuses, abilities, items) are cached on the entry per log width
    if (!entry.fitted || entry.fitW !== r.w) {
      entry.fitW = r.w;
      entry.fitted = [];
      entry.tips = [];
      let x = r.x + 8;
      for (const [str0, col] of entry) {
        if (x > right - 8) break;
        const str = fit(ctx, str0, right - x);
        const w = ctx.measureText(str).width;
        entry.fitted.push(str, col, x - r.x);
        const tip = col !== C['4'] ? logTermTip(S, str0) : null;
        if (tip) entry.tips.push({ dx: x - r.x, w, tip });
        x += w;
      }
    }
    const f = entry.fitted;
    for (let k = 0; k < f.length; k += 3) {
      ctx.fillStyle = f[k + 1];
      ctx.fillText(f[k], r.x + f[k + 2], y);
    }
    if (y >= r.y && y + LINE <= r.y + r.h) for (const tp of entry.tips) {
      // dotted underline marks a «hyperlink»
      ctx.fillStyle = C['3'];
      for (let xx = 0; xx < tp.w; xx += 3) ctx.fillRect(r.x + tp.dx + xx, y + 17, 1, 1);
      hotspot(r.x + tp.dx, y, tp.w, LINE, tp.tip);
    }
  }
  endClip(ctx);
  ctx.font = FONT;
  if (S.logScroll) drawScrollbar(ctx, S.logScroll, r);
}

/** Tip for a log segment: status / ability name, or an item «name». */
function logTermTip(S, str) {
  const b = S.b;
  if (!S._abilities) S._abilities = b.units.flatMap((u) => u.abilities || []);
  const tip = termTip(str, b.data.statuses, S._abilities);
  if (tip) return tip;
  const m = /«(.+)»/.exec(str);
  if (m) {
    const it = Object.values(ITEMS).find((x) => x.name === m[1]);
    if (it) return itemTip(it);
  }
  return null;
}

/** Battle details for a status tip: rounds left, source, the bearer's resistance. */
function statusExtra(b, u, st) {
  const bu = b.byId[u.id] || u;
  const src = st.source && b.byId[st.source];
  const f = bu.tags ? statusFactor(b, bu, st.id) : 1;
  return {
    turns: st.turns, source: src ? src.name : null,
    resist: bu.tags && isStatusImmune(b, bu, st.id) ? 'I' : f < 1 ? 'R' : f > 1 ? 'V' : null,
  };
}

/** Statuses as hover-able names (wrapping). Returns the y after the last row. */
function statusChips(ctx, b, u, x, y, w, maxRows = 3) {
  const list = u.statuses || [];
  if (!list.length) return y;
  ctx.font = FONT;
  let cx = x, row = 0;
  list.forEach((st, i) => {
    const d = b.data.statuses[st.id];
    const s = `${d?.name || st.id}${st.turns != null ? ` ${st.turns}` : ''}${i < list.length - 1 ? ',' : ''}`;
    const sw = ctx.measureText(s).width;
    if (cx + sw > x + w && cx > x) { cx = x; row++; }
    if (row >= maxRows) return;
    text(ctx, s, cx, y + row * LINE, d?.kind === 'buff' ? C.j : C.a, FONT);
    hotspot(cx, y + row * LINE, sw, LINE, () => statusTip(st.id, b.data.statuses, statusExtra(b, u, st)));
    cx += sw + ctx.measureText(' ').width;
  });
  return y + (Math.min(row, maxRows - 1) + 1) * LINE;
}

function unitCard(ctx, S, u, x, y, w, odds) {
  const b = S.b;
  const v = unitView(b, u);
  const d = S.dispOf(u);
  // portraits v2: 48 px portrait on the left, name and HP/MRL beside it
  const top = y;
  battlePortrait(ctx, S, u, x, y, 1);
  const tx = x + 56, tw = w - 56;
  text(ctx, fit(ctx, S.name(u.id), tw, FONT_B), tx, y, teamColor(u), FONT_B);
  y += 24;
  resLineTip(ctx, tx, y, tw, 'hp', d.hp, v.maxHp, t('res.hp'), v.shield); y += 22;
  if (v.maxMrl > 0) { resLineTip(ctx, tx, y, tw, 'mrl', d.mrl, v.maxMrl, t('res.mrl')); y += 22; }
  y = Math.max(y, top + 52);
  if (v.maxEnr > 0) { resLineTip(ctx, x, y, w, 'enr', v.enr, v.maxEnr, t('res.enr')); y += 22; }
  let info = `${t('res.kb')} ${v.kb}  ${t('create.speed')} ${v.speed}`;
  if (v.shield) info += `  ${t('battle.shield')} ${v.shield}`;
  text(ctx, info, x, y, C['4']);
  hotspot(x, y, 70, LINE, resTip('kb')); y += LINE;
  if (v.down) { text(ctx, t('state.unconscious'), x, y, C.c, FONT_B); y += LINE; }
  if (v.nadlom) { text(ctx, t('state.strain'), x, y, C.n, FONT_B); y += LINE; }
  y = statusChips(ctx, b, u, x, y, w, 3);
  if (u.arch && u.team !== 'heroes') {
    const it = S.intents?.[u.id];
    text(ctx, fit(ctx, `${t(`arch.${u.arch}`)}${u.arch === 'boss' ? ` · ${t('pin.phase')} ${u.phase || 1}` : ''}${it ? ` · ${intentText(S, it)}` : ''}`, w), x, y, C.a); y += LINE;
  }
  if (odds) {
    y += 4;
    if (odds.kind === 'hit') {
      const mode = odds.mode === 'adv' ? ` · ${t('battle.advantage')}` : odds.mode === 'dis' ? ` · ${t('battle.disadvantage')}` : '';
      text(ctx, `${t('battle.hitChance')}: ${Math.round(odds.chance * 100)}%`, x, y, C.a, FONT_B); y += LINE;
      text(ctx, `${t('battle.critChance')} ${Math.round(odds.crit * 100)}%${mode}`, x, y, C['4']); y += LINE;
      if (odds.dmg) { text(ctx, fit(ctx, `${t('odds.dmg')} ${odds.dmg[0]}–${odds.dmg[1]} (${t('odds.crit')} ${odds.dmg[2]})`, w), x, y, C['5']); y += LINE; }
      const mods = [odds.cover ? `${t('odds.cover')} +${odds.cover}` : '', odds.elev ? `${t('odds.elev')} ${odds.elev > 0 ? '+' : ''}${odds.elev}` : '', odds.flank ? `${t('odds.flank')} +${odds.flank}` : ''].filter(Boolean);
      if (mods.length) { text(ctx, fit(ctx, mods.join(' · '), w), x, y, C['4']); y += LINE; }
    } else {
      text(ctx, `${t('battle.saveChance')}: ${Math.round(odds.chance * 100)}%`, x, y, C.a, FONT_B); y += LINE;
      text(ctx, `${t('battle.save')} ${t(`stat.${odds.stat}`)}, ${t('battle.dc')} ${odds.dc}`, x, y, C['4']); y += LINE;
    }
  }
  return y;
}

function abilityCard(ctx, S, btn, x, y, w) {
  const a = btn.a;
  const hero = S.b.byId[S.heroId];
  text(ctx, fit(ctx, btn.label, w, FONT_B), x, y, C['5'], FONT_B); y += 22;
  if (a) {
    const parts = [t(`act.${a.action}`)];
    if (a.cost) parts.push(`${a.cost} ${t('battle.cost')}`);
    const r = abilityRange(hero, a);
    parts.push(r ? `${t('battle.range')} ${r}` : t('battle.self'));
    if (a.area) parts.push(`${t('battle.area')}: ${t(`area.${a.area.shape}`)} ${a.area.size}`);
    if (a.recharge) parts.push(`${(hero.uses?.[a.id] || 0)}/${a.usesPerBattle} · ${t(a.recharge === 'long' ? 'rest.perLong' : 'rest.perShort')}`);
    else if (a.usesPerBattle) parts.push(`${(hero.uses?.[a.id] || 0)}/${a.usesPerBattle}`);
    y = textBlock(ctx, parts.join(' · '), x, y, w, C.b, FONT, LINE, 2);
    y = textBlock(ctx, a.desc || '', x, y + 2, w, C['4'], FONT, LINE, 7);
  } else if (btn.id === 'attack' && hero.weapon) {
    const wpn = hero.weapon;
    y = textBlock(ctx, `${wpn.name}: ${wpn.dice} ${t(`dmg.${wpn.dmgType}`)}, ${t('battle.range')} ${wpn.range || 1}`, x, y, w, C['4'], FONT, LINE, 3);
  }
  if (btn.reason) y = textBlock(ctx, btn.reason, x, y + 4, w, C.c, FONT_B, LINE, 2);
  return y;
}

function drawPanel(ctx, S, preview) {
  const L = S.L, b = S.b;
  const p = L.panel;
  ctx.fillStyle = C['1'];
  ctx.fillRect(p.x, p.y, p.w, p.h);
  ctx.fillStyle = C['2'];
  ctx.fillRect(p.x, p.y, 1, p.h);
  const x = p.x + 14, w = p.w - 28;
  let y = 12;
  // hero card
  const hero = b.byId[S.heroId];
  panel(ctx, x - 6, y - 4, w + 12, 104, C['2'], C['3']);
  battlePortrait(ctx, S, hero, x - 2, y, 2);
  const raceName = b.data.races[hero.raceId]?.name || '';
  const cls = b.data.classes[hero.classId];
  text(ctx, fit(ctx, S.name(hero.id), w - 108, FONT_B), x + 106, y + 6, C.h, FONT_B);
  text(ctx, fit(ctx, raceName, w - 108), x + 106, y + 30, C['4']);
  text(ctx, fit(ctx, cls?.name || '', w - 108), x + 106, y + 50, C['4']);
  y += 110;
  resLineTip(ctx, x, y, w, 'hp', S.dispOf(hero).hp, hero.maxHp, t('res.hp'), hero.shield ? hero.shield.value : 0); y += 22;
  resLineTip(ctx, x, y, w, 'mrl', S.dispOf(hero).mrl, hero.maxMrl, t('res.mrl')); y += 22;
  resLineTip(ctx, x, y, w, 'enr', hero.enr, hero.maxEnr, t('res.enr')); y += 24;
  const v = unitView(b, hero);
  text(ctx, `${t('res.kb')} ${v.kb}${v.shield ? `  ${t('battle.shield')} ${v.shield}` : ''}`, x, y, C['5'], FONT_B);
  hotspot(x, y, 70, LINE, resTip('kb'));
  if (S.playerTurn) {
    const tr = b.turn;
    const pip = (on) => (on ? '●' : '○');
    text(ctx, `${t('battle.moveLeft')} ${tr.move}`, x + w, y, C.h, FONT_B, 'right');
    y += LINE;
    text(ctx, `${t('battle.action')} ${pip(tr.actions > 0)}   ${t('battle.bonus')} ${pip(tr.bonus > 0)}`, x, y, C['5']);
  } else y += LINE;
  y += LINE;
  if (v.down) { text(ctx, t('state.unconscious'), x, y, C.c, FONT_B); y += LINE; }
  if (v.nadlom) { text(ctx, t('state.strain'), x, y, C.n, FONT_B); y += LINE; }
  y = statusChips(ctx, b, hero, x, y, w, 2);
  y += 8;
  // context card
  const cardY = y;
  const cardH = 236;
  panel(ctx, x - 6, cardY, w + 12, cardH, C['0'], C['2']);
  y = cardY + 8;
  const hb = S.hover.button;
  if (hb && !S.result) abilityCard(ctx, S, hb, x, y, w);
  else if (preview.target && preview.target.id !== S.heroId) unitCard(ctx, S, preview.target, x, y, w, preview.odds);
  else if (S.sel && S.sel.kind === 'ability') abilityCard(ctx, S, S.buttons.find((bb) => bb.selected) || { label: S.sel.a.name, a: S.sel.a }, x, y, w);
  else if (S.opts.hint) {
    text(ctx, t('battle.hint'), x, y, C['4'], FONT_B);
    textBlock(ctx, t(S.opts.hint), x, y + 24, w, C['4'], FONT, LINE, 9);
  }
  // initiative order
  y = cardY + cardH + 12;
  text(ctx, t('battle.order'), x, y, C['4'], FONT_B);
  y += 24;
  const n = Math.floor((L.H - y - 8) / 22);
  let shown = 0;
  const start = Math.max(0, b.turnIndex);
  for (let k = 0; k < b.order.length && shown < n; k++) {
    const u = b.byId[b.order[(start + k) % b.order.length]];
    if (!u || u.dead || u.removed || (isHidden(u) && u.team !== 'heroes')) continue;
    const curr = k === 0 && b.turn && b.turn.unitId === u.id;
    if (curr) { ctx.fillStyle = C['2']; ctx.fillRect(x - 6, y - 2, w + 12, 22); }
    ctx.fillStyle = teamColor(u);
    ctx.fillRect(x, y + 4, 8, 8);
    text(ctx, fit(ctx, S.name(u.id), w - 90), x + 16, y, curr ? C['5'] : C['4'], curr ? FONT_B : FONT);
    text(ctx, u.down ? t('battle.downTag') : `${S.dispOf(u).hp}/${u.maxHp}`, x + w - (u.shield && !u.down ? 34 : 0), y, u.down ? C.c : C['3'], FONT, 'right');
    if (u.shield && !u.down) text(ctx, `+${u.shield.value}`, x + w, y, TMP_COLOR, FONT_B, 'right');
    y += 22;
    shown++;
  }
}

function drawBanner(ctx, S) {
  const L = S.L;
  ctx.fillStyle = SHADE;
  ctx.fillRect(0, 0, L.W, L.H);
  const w = 720;
  const x = Math.floor((L.W - w) / 2);
  const introLines = S.opts.intro ? wrap(ctx, t(S.opts.intro), w - 48) : [];
  const hintLines = S.opts.hint ? wrap(ctx, t(S.opts.hint), w - 48) : [];
  const h = 120 + (introLines.length + hintLines.length) * LINE + (hintLines.length ? 40 : 0);
  const y = Math.floor((L.H - h) / 2);
  panel(ctx, x, y, w, h, C['1'], C.h);
  text(ctx, S.opts.title || '', x + w / 2, y + 20, C.h, FONT_L, 'center');
  let yy = textBlock(ctx, introLines.join(' '), x + 24, y + 64, w - 48, C['5']);
  if (hintLines.length) {
    text(ctx, t('battle.hint'), x + 24, yy + 12, C.a, FONT_B);
    yy = textBlock(ctx, hintLines.join(' '), x + 24, yy + 36, w - 48, C['4']);
  }
  text(ctx, t('dlg.next'), x + w / 2, y + h - 28, C['3'], FONT, 'center');
}

function drawResult(ctx, S) {
  const L = S.L;
  ctx.fillStyle = SHADE;
  ctx.fillRect(0, 0, L.W, L.H);
  const r = S.resultBox;
  const win = S.result === 'win';
  panel(ctx, r.x, r.y, r.w, r.h, C['1'], win ? C.j : C.c);
  text(ctx, win ? t('battle.victory') : t('battle.defeat'), r.x + r.w / 2, r.y + 22, win ? C.j : C.c, 'bold 32px monospace', 'center');
  let y = r.y + 76;
  const body = win ? [S.opts.winText ? t(S.opts.winText) : t('battle.victoryText')]
    : (S.opts.defeatLines || [{ text: t('battle.defeatText') }]).map((l) => l.text);
  for (const s of body) y = textBlock(ctx, s, r.x + 32, y, r.w - 64, C['5'], FONT, LINE, 4) + 6;
  for (const btn of S.resultButtons) button(ctx, btn, S.hover.button === btn);
}

