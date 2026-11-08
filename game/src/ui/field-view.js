// Battlefield view (docs/specs/battlefields.md §6): biome tiles (assets/tilesets.js) and props (assets/props.js) on the static
// map layer of a battle or a free node map, weather / time-of-day overlay with night light holes, HUD weather line.
import { drawTile, VARIANTS, BIOME_IDS } from '../assets/tilesets.js';
import { drawProp, PROPS } from '../assets/props.js';
import { TILE, drawSprite } from '../assets/sprites.js';
import { T_WALL, T_COVER, T_FULL, T_RUBBLE, T_HAZARD, T_EXIT, T_WATER } from '../rules/grid.js';
import { BATTLEFIELD, WEATHER } from '../data/combat.js';
import { visionOf, lightSources } from '../world/battlefields.js';
import { C } from './draw.js';
import { t } from '../data/text/index.js';

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const hash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 13; return (Math.imul(h, 1103515245) >>> 0); };

/** Tile biome of a map def (new id or legacy BIOMES id) or null (old look). */
export function fieldBiome(def) {
  const b = def?.biome;
  if (!b) return null;
  return BIOME_IDS.includes(b) ? b : BATTLEFIELD.legacy[b] || null;
}

/**
 * Paint one cell. ch — live map char, tile — rules tile, prop — the cell is under a prop (no slot tile), cell — px size.
 * Returns true when the cell keeps its fire animation (T_HAZARD).
 */
export function drawFieldCell(c, biome, ch, tile, x, y, px, py, cell, prop = false) {
  const s = cell / TILE;
  const h = hash(x, y);
  const v = (k) => h % VARIANTS[k];
  const floor = () => drawTile(c, biome, 'floor', v('floor'), px, py, s);
  if (ch === 'W' || ch === 'w' || tile === T_WATER) { drawTile(c, biome, 'water', v('water'), px, py, s); return false; }
  if (tile === T_WALL || ch === '#') { drawTile(c, biome, 'wall', v('wall'), px, py, s); return false; }
  floor();
  if (tile === T_EXIT || ch === 'D') { drawSprite(c, 'tile-door', px, py, s); return false; }
  if (tile === T_RUBBLE) { drawTile(c, biome, 'debris', v('debris'), px, py, s); return false; }
  if (!prop && tile === T_COVER && ch === 'c') { drawTile(c, biome, 'half', v('half'), px, py, s); return false; }
  if (!prop && tile === T_FULL && (ch === 'C' || ch === 'x')) { drawTile(c, biome, 'full', v('full'), px, py, s); return false; }
  if (ch === '=') { // bridge deck planks
    c.fillStyle = C['8']; c.fillRect(px, py + s * 2, cell, cell - s * 4);
    c.fillStyle = C['6']; for (let k = 0; k < 3; k++) c.fillRect(px, py + s * (5 + k * 4), cell, s);
    return false;
  }
  if (tile === T_HAZARD) return true;
  if ((h >>> 8) % 1000 < BATTLEFIELD.decal * 1000) drawTile(c, biome, 'decal', 2 + ((h >>> 4) & 1), px, py, s);
  return false;
}

/** Props of a map def on a layer; alive(p) — still standing (broken destructible props are skipped). */
export function drawFieldProps(c, props, cell, alive = () => true) {
  const s = cell / TILE;
  for (const p of [...(props || [])].sort((a, b) => a.y - b.y || a.x - b.x)) if (PROPS[p.id] && alive(p)) drawProp(c, p.id, p.x * cell, p.y * cell, s);
}

/** Cells covered by props (index set) — the slot tile under them is not drawn. */
export function propCells(props, w) {
  const set = new Set();
  for (const p of props || []) if (p.blocks || p.cover) for (let i = 0; i < (p.w || 1); i++) set.add(p.y * w + p.x + i);
  return set;
}

// ---------------------------------------------------------------- weather overlay
let wxCanvas = null;
/** Overlay over the map rect (after units, before UI): time of day, weather, night light holes. */
export function drawWeather(ctx, S, tms) {
  const b = S.b, L = S.L, def = b.map;
  const T = WEATHER.tod[def.tod], Wd = WEATHER.weather[def.weather];
  if ((!T || !T.overlay) && (!Wd || def.weather === 'clear')) return;
  const mw = b.grid.w * L.cell, mh = b.grid.h * L.cell;
  const v = visionOf(def);
  ctx.save();
  ctx.beginPath(); ctx.rect(L.mapX, L.mapY, mw, mh); ctx.clip();
  // darkness with light holes (night / storm blackout)
  const dark = v.dark ? (T?.overlay && def.tod === 'night' ? T.overlay : WEATHER.tod.night.overlay) : null;
  if (dark) {
    if (!wxCanvas) wxCanvas = document.createElement('canvas');
    if (wxCanvas.width !== mw || wxCanvas.height !== mh) { wxCanvas.width = mw; wxCanvas.height = mh; }
    const x2 = wxCanvas.getContext('2d');
    x2.globalCompositeOperation = 'source-over';
    x2.clearRect(0, 0, mw, mh);
    x2.fillStyle = rgba(C[dark[0]], dark[1]); x2.fillRect(0, 0, mw, mh);
    x2.globalCompositeOperation = 'destination-out';
    for (const [x, y, r] of lightSources(b)) {
      const cx = (x + 0.5) * L.cell, cy = (y + 0.5) * L.cell, R = (r + 0.5) * L.cell;
      const g = x2.createRadialGradient(cx, cy, R * 0.25, cx, cy, R);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x2.fillStyle = g; x2.fillRect(cx - R, cy - R, R * 2, R * 2);
    }
    x2.globalCompositeOperation = 'source-over';
    ctx.drawImage(wxCanvas, L.mapX, L.mapY);
  } else if (T?.overlay) { ctx.fillStyle = rgba(C[T.overlay[0]], T.overlay[1]); ctx.fillRect(L.mapX, L.mapY, mw, mh); }
  if (Wd && Wd.overlay && def.weather !== 'storm') { ctx.fillStyle = rgba(C[Wd.overlay[0]], Wd.overlay[1]); ctx.fillRect(L.mapX, L.mapY, mw, mh); }
  const sec = tms / 1000;
  if (def.weather === 'fog') {
    ctx.fillStyle = rgba(C[Wd.drift[0]], Wd.drift[1]);
    for (let k = 0; k < 2; k++) {
      const off = ((sec * 0.2 * (k ? -1 : 1) * L.cell) % (L.cell * 6) + L.cell * 6) % (L.cell * 6);
      for (let y = k * L.cell; y < mh; y += L.cell * 3) for (let x = -L.cell * 6 + off; x < mw; x += L.cell * 6) ctx.fillRect(L.mapX + x, L.mapY + y, L.cell * 4, L.cell * 0.8);
    }
  } else if (def.weather === 'rain') {
    const s = L.s;
    for (let i = 0; i < 120; i++) {
      const sx = (hash(i, 7) % mw), sp = 300 + (hash(i, 3) % 200);
      const y = (hash(i, 11) % mh + sec * sp) % mh, x = (sx + y * 0.35) % mw;
      ctx.fillStyle = i % 3 ? C['4'] : C.f;
      ctx.fillRect(L.mapX + x, L.mapY + y, 2 * s, s);
      ctx.fillRect(L.mapX + x - s, L.mapY + y - s, s, s);
    }
  } else if (def.weather === 'blizzard') {
    const s = L.s;
    for (let i = 0; i < 140; i++) {
      const y = hash(i, 5) % mh, x = (hash(i, 9) % mw + sec * (500 + hash(i, 2) % 300)) % mw;
      ctx.fillStyle = i % 2 ? C['5'] : C['4'];
      ctx.fillRect(L.mapX + x, L.mapY + y, 2 * s, s);
    }
  } else if (def.weather === 'storm') {
    const [a, c2] = Wd.flash;
    const period = a + (hash(Math.floor(sec / a), 1) % (c2 - a + 1));
    if (sec % period < 0.15) { ctx.fillStyle = rgba(C[Math.floor(sec) % 2 ? 'a' : 'h'], 0.35); ctx.fillRect(L.mapX, L.mapY, mw, mh); }
  }
  ctx.restore();
}

/** «Ночь · дождь · обзор 6» for the help line (null on a clear day). */
export function weatherLine(def) {
  if (!def || (!def.tod && !def.weather) || ((def.tod || 'day') === 'day' && (def.weather || 'clear') === 'clear')) return null;
  const v = visionOf(def);
  return [t(`wx.${def.tod || 'day'}`), def.weather && def.weather !== 'clear' ? t(`wx.${def.weather}`) : '', v.vis ? t('wx.vis').replace('{n}', v.vis) : t('wx.visAll')].filter(Boolean).join(' · ');
}
