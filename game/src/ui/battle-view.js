// Battle rendering: cached static map layer, highlights, units, bars, popups, action bar, side panel, log,
// banner and result overlays. State object S comes from scenes/battle.js.
import { t } from '../data/text/index.js';
import { TILE, drawSprite, drawTeamMarker, heroSpriteIds, enemySpriteIds, tileSpriteIds, idleFrame } from '../assets/sprites.js';
import { abilityRange, unitView } from '../rules/combat.js';
import { pathTo } from '../rules/grid.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, textBlock, wrap, fit, panel, button, bar, resLine, clear } from './draw.js';
import { teamColor } from './battle-log.js';

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
};

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
      let ids = tileSpriteIds(ch, x, y);
      if (ids.includes('obj-fire')) { S.fireTiles.push(x, y); ids = ids.filter((i) => i !== 'obj-fire'); }
      drawSprite(c, ids, x * L.cell, y * L.cell, L.s);
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
}

const isHidden = (u) => u.team === 'enemies' && u.statuses.some((s) => s.id === 'invisible' || s.id === 'stealth');
/** Enemy the player cannot see (invisible / stealth): not drawn, not highlighted, not clickable. */
export const isHiddenFoe = (u) => !!u && !u.dead && !u.removed && isHidden(u);
const drawList = [];
const affected = new Set();
const byDispY = (S) => (a, c) => S.disp[a.id].y - S.disp[c.id].y;

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
  ctx.drawImage(S.mapLayer, L.mapX, L.mapY);
  const tms = S.time * 1000;
  // fire (animated)
  for (let i = 0; i < S.fireTiles.length; i += 2) {
    drawSprite(ctx, 'obj-fire', L.mapX + S.fireTiles[i] * L.cell, L.mapY + S.fireTiles[i + 1] * L.cell, L.s, { frame: idleFrame(tms * 0.8, i * 0.13) });
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
  const preview = drawHighlights(ctx, S);
  drawUnits(ctx, S, preview, tms);
  drawPopups(ctx, S);
  drawTopBar(ctx, S);
  drawActionBar(ctx, S);
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
      if (!pc || pc.idx !== idx || pc.reach !== S.reach) S.pathCache = { idx, reach: S.reach, path: pathTo(S.reach, idx) };
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
    bar(ctx, bx, by, bw, bh, d.hp, u.maxHp, 'hp');
    if (u.maxMrl > 0) bar(ctx, bx, by + bh + 1, bw, bh, d.mrl, u.maxMrl, 'mrl');
    // status pips
    let sx = bx;
    for (const s of u.statuses) {
      const def = b.data.statuses[s.id];
      ctx.fillStyle = def && def.kind === 'buff' ? C.j : C.a;
      ctx.fillRect(sx, by - 6, 4, 4);
      sx += 6;
      if (sx > bx + bw - 4) break;
    }
    if (d.down) text(ctx, t('battle.downTag'), px + L.cell - 2, py + 2, C.c, FONT_B, 'right');
  }
  // speech bubbles
  for (const bu of S.bubbles) {
    const u = b.byId[bu.id];
    const d = u ? S.dispOf(u) : null;
    if (!u || !d || d.gone || (isHidden(u) && u.team !== 'heroes')) continue;
    const lines = wrap(ctx, bu.text, 240);
    const bw = Math.min(260, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16);
    const bh = lines.length * LINE + 10;
    let x = Math.round(L.mapX + d.x * L.cell + L.cell / 2 - bw / 2);
    x = Math.max(4, Math.min(L.area.w - bw - 4, x));
    const y = Math.max(TOP_H + 2, Math.round(L.mapY + d.y * L.cell - bh - 14 * L.s / 2 - 10));
    ctx.globalAlpha = bu.t > 2.8 ? Math.max(0, (3.2 - bu.t) / 0.4) : 1;
    panel(ctx, x, y, bw, bh, C['5'], C['0']);
    lines.forEach((l, i) => text(ctx, l, x + 8, y + 5 + i * LINE, C['0']));
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

function drawLog(ctx, S) {
  const L = S.L;
  const r = L.log;
  panel(ctx, r.x, r.y, r.w, r.h, C['1'], C['2']);
  const n = Math.floor((r.h - 8) / LINE);
  const start = Math.max(0, S.log.length - n);
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let i = start, row = 0; i < S.log.length; i++, row++) {
    const y = r.y + 4 + row * LINE;
    const entry = S.log[i];
    // fitted segments are cached on the entry per log width
    if (!entry.fitted || entry.fitW !== r.w) {
      entry.fitW = r.w;
      entry.fitted = [];
      let x = r.x + 8;
      for (const [s, col] of entry) {
        if (x > r.x + r.w - 16) break;
        const str = fit(ctx, s, r.x + r.w - 8 - x);
        entry.fitted.push(str, col, x - r.x);
        x += ctx.measureText(str).width;
      }
    }
    const f = entry.fitted;
    for (let k = 0; k < f.length; k += 3) {
      ctx.fillStyle = f[k + 1];
      ctx.fillText(f[k], r.x + f[k + 2], y);
    }
  }
}

function statusLine(b, u) {
  return u.statuses.map((s) => `${b.data.statuses[s.id]?.name || s.id}${s.turns != null ? ` ${s.turns}` : ''}`).join(', ');
}

function unitCard(ctx, S, u, x, y, w, odds) {
  const b = S.b;
  const v = unitView(b, u);
  const d = S.dispOf(u);
  text(ctx, fit(ctx, S.name(u.id), w, FONT_B), x, y, teamColor(u), FONT_B);
  y += 24;
  resLine(ctx, x, y, w, 'hp', d.hp, v.maxHp, t('res.hp')); y += 22;
  if (v.maxMrl > 0) { resLine(ctx, x, y, w, 'mrl', d.mrl, v.maxMrl, t('res.mrl')); y += 22; }
  if (v.maxEnr > 0) { resLine(ctx, x, y, w, 'enr', v.enr, v.maxEnr, t('res.enr')); y += 22; }
  let info = `${t('res.kb')} ${v.kb}  ${t('create.speed')} ${v.speed}`;
  if (v.shield) info += `  ${t('battle.shield')} ${v.shield}`;
  text(ctx, info, x, y, C['4']); y += LINE;
  if (v.down) { text(ctx, t('state.unconscious'), x, y, C.c, FONT_B); y += LINE; }
  if (v.nadlom) { text(ctx, t('state.strain'), x, y, C.n, FONT_B); y += LINE; }
  const st = statusLine(b, u);
  if (st) y = textBlock(ctx, st, x, y, w, C.a, FONT, LINE, 3);
  if (odds) {
    y += 4;
    if (odds.kind === 'hit') {
      const mode = odds.mode === 'adv' ? ` · ${t('battle.advantage')}` : odds.mode === 'dis' ? ` · ${t('battle.disadvantage')}` : '';
      text(ctx, `${t('battle.hitChance')}: ${Math.round(odds.chance * 100)}%`, x, y, C.a, FONT_B); y += LINE;
      text(ctx, `${t('battle.critChance')} ${Math.round(odds.crit * 100)}%${mode}`, x, y, C['4']); y += LINE;
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
    if (a.usesPerBattle) parts.push(`${(hero.uses?.[a.id] || 0)}/${a.usesPerBattle}`);
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
  panel(ctx, x - 6, y - 4, w + 12, 64, C['2'], C['3']);
  drawSprite(ctx, heroSpriteIds(hero.raceId, hero.classId, hero.look), x, y + 4, 3, { frame: idleFrame(S.time * 1000) });
  const raceName = b.data.races[hero.raceId]?.name || '';
  const cls = b.data.classes[hero.classId];
  text(ctx, fit(ctx, S.name(hero.id), w - 60, FONT_B), x + 58, y + 6, C.h, FONT_B);
  text(ctx, fit(ctx, `${raceName} · ${cls?.name || ''}`, w - 60), x + 58, y + 30, C['4']);
  y += 70;
  resLine(ctx, x, y, w, 'hp', S.dispOf(hero).hp, hero.maxHp, t('res.hp')); y += 22;
  resLine(ctx, x, y, w, 'mrl', S.dispOf(hero).mrl, hero.maxMrl, t('res.mrl')); y += 22;
  resLine(ctx, x, y, w, 'enr', hero.enr, hero.maxEnr, t('res.enr')); y += 24;
  const v = unitView(b, hero);
  text(ctx, `${t('res.kb')} ${v.kb}${v.shield ? `  ${t('battle.shield')} ${v.shield}` : ''}`, x, y, C['5'], FONT_B);
  if (S.playerTurn) {
    const tr = b.turn;
    const pip = (on) => (on ? '●' : '○');
    text(ctx, `${t('battle.moveLeft')} ${tr.move}`, x + w, y, C.h, FONT_B, 'right');
    y += LINE;
    text(ctx, `${t('battle.action')} ${pip(tr.actions > 0)}   ${t('battle.bonus')} ${pip(tr.bonus > 0)}`, x, y, C['5']);
  } else y += LINE;
  y += LINE;
  const st = statusLine(b, hero);
  if (v.down) { text(ctx, t('state.unconscious'), x, y, C.c, FONT_B); y += LINE; }
  if (v.nadlom) { text(ctx, t('state.strain'), x, y, C.n, FONT_B); y += LINE; }
  if (st) y = textBlock(ctx, st, x, y, w, C.a, FONT, LINE, 2);
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
    text(ctx, u.down ? t('battle.downTag') : `${S.dispOf(u).hp}/${u.maxHp}`, x + w, y, u.down ? C.c : C['3'], FONT, 'right');
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

