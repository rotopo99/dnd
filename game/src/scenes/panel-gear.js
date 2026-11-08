// Party screen → «Снаряжение» tab, v7 (docs/specs/inventory-mods.md): Quasimorph-style grid backpack of the selected
// member (S.gearKey), equipment slots (weapon, off-hand, armour, backpack), quick slots 1–6, the shared stash (hubs)
// and «На земле» (loot that did not fit), item card with mod slots. Drag & drop (world/inventory.js moveItem):
// LMB press — pick up (release elsewhere — drop; click without moving — carry until the next click), R / RMB while
// carrying — rotate, Shift+LMB — quick place, RMB on an item — menu, Esc — put back, drop on a member tab — give.
// Mods: drop onto a slot of the card / onto a worn or bagged weapon/armour; `req` → Tech check of the best member.
import { benchNoCheck } from '../world/base.js';
import { t } from '../data/text/index.js';
import { ITEMS, SKILL_RULES } from '../world/data.js';
import { buildHero, buildCompanion, gearHolder, members, tf } from '../world/state.js';
import { NPCS } from '../data/npcs.js';
import { mod, TIER_BONUS } from '../rules/character.js';
import { C, FONT, FONT_B, LINE, text, fit, panel, inRect } from '../ui/draw.js';
import { tierName, itemTip } from '../ui/items-ui.js';
import { hotspot, showTip } from '../ui/tooltip.js';
import { createDetails, updateDetails, drawDetails } from '../ui/details.js';
import { saveGame } from '../save.js';
import { autoCheck, disassembleDc, disassembleParts } from '../world/skill-uses.js';
import { LOOT_TABLES } from '../data/items/loot.js';
import {
  isGear, syncItems, contOf, bagOf, holderOf, gridDims, quickCount, eqInst, itemSize, entrySize, entryAt, rectFree, moveItem,
  quickMove, peek, hostInst, modSlotTypes, modCapacity, modFitProblem, canQuick, slotFor, twoHandedBlock, canStash,
  groundOf, disassemble, stashOf, MOD_SLOTS, QUICK_MAX, makeInst, countAll, takeItem,
} from '../world/inventory.js';

export { isGear };
const SMALL = '12px monospace';
const CELL = 36;
const keyOf = (S) => S?.gearKey || 'hero';

/** Attack bonus of the creature's weapon (as combat.js weaponAttackBonus outside a battle). */
export const attackOf = (u) => (u.weapon ? mod(u.stats[u.weapon.stat || 'str'] ?? 10) + u.prof + (TIER_BONUS[u.weaponTier] || 0) + (u.weapon.hit || 0) + (u.hitBonus || 0) : 0);

/** Members whose gear can be changed: hero + active / waiting companions. [{ key, name }] */
export function gearMembers(sv) {
  return [{ key: 'hero', name: sv.hero.name }, ...sv.party.filter((p) => p.state === 'active' || p.state === 'waiting').map((p) => ({ key: p.npc, name: NPCS[p.npc]?.name || p.npc }))];
}

// ----------------------------------------------------------------------------- old API (scenarios, other screens)
/** Locate an item id in a member's bag / quick slots (first instance). */
function findFrom(sv, id, key) {
  for (const k of [key, 'hero', ...sv.party.map((p) => p.npc)]) {
    if (!holderOf(sv, k)) continue;
    const g = contOf(sv, { c: 'bag', key: k }).grid;
    const i = g.findIndex((e) => e.item === id);
    if (i >= 0) return { at: 'grid', ref: { c: 'bag', key: k }, index: i };
  }
  const st = stashOf(sv).grid.findIndex((e) => e.item === id);
  return st >= 0 ? { at: 'grid', ref: { c: 'stash' }, index: st } : null;
}
/** Equip an item id from the bags (mods — onto the matching worn piece). */
export function equip(game, id, key = 'hero') {
  const sv = game.save;
  gearHolder(sv, key);
  syncItems(sv);
  const from = findFrom(sv, id, key);
  const it = ITEMS[id];
  if (!from || !it) return false;
  const to = it.slot === 'mod' ? { at: 'mod', host: { at: 'equip', key, slot: it.target === 'armor' ? 'armor' : 'weapon' } } : { at: 'equip', key, slot: slotFor(it) };
  const r = moveItem(sv, from, to, { check: modCheck(game) });
  report(game, r);
  if (r.ok) saveGame(sv);
  return r.ok;
}
export function unequip(game, slot, id, key = 'hero') {
  const sv = game.save;
  const r = slot === 'mod' ? (() => {
    for (const s of ['weapon', 'armor']) { const h = hostInst(sv, { at: 'equip', key, slot: s }); const i = h?.mods?.indexOf(id) ?? -1; if (i >= 0) return moveItem(sv, { at: 'mod', host: { at: 'equip', key, slot: s }, i }, { at: 'member', key }); }
    return { ok: false, msg: 'inv.nothing' };
  })() : moveItem(sv, { at: 'equip', key, slot }, { at: 'member', key });
  report(game, r);
  if (r.ok) saveGame(sv);
  return r.ok;
}
/** Give a worn piece to another member (lands in his bag; then he puts it on if it fits). */
export function transferItem(game, slot, id, from, to) {
  const sv = game.save;
  gearHolder(sv, to);
  const r = moveItem(sv, { at: 'equip', key: from, slot }, { at: 'member', key: to });
  if (!r.ok) { report(game, r); return; }
  if (!equip(game, id, to)) game.toast(t('gear.transferBackpack'), 'a');
  saveGame(sv);
}

// ----------------------------------------------------------------------------- helpers
function modCheck(game) {
  return (req) => {
    const sv = game.save;
    if (benchNoCheck(sv)) return { success: true, bench: true }; // world-consequences ч.3: the base workbench — no check, no tool
    if (req.tool && !(countAll(sv)[req.tool] > 0)) return { success: false, noTool: true };
    const r = autoCheck(members(sv, game.data), [req.skill || 'tech'], req.dc || 10);
    if (r.success && req.tool === 'repair-kit') takeItem(sv, req.tool, 1); // ремнабор тратит 1 заряд
    return r;
  };
}
function report(game, r) {
  if (!r) return;
  if (r.ok) { for (const k of r.toasts || []) game.toast(t(k), 'j'); return; }
  const who = r.member ? `${r.member.name}: ` : '';
  game.toast(`${who}${t(r.msg || 'inv.noFit')}`, 'c');
}

function layoutZones(game, S) {
  const sv = game.save;
  const ox = S.ox, oy = S.oy;
  const key = keyOf(S);
  const h = holderOf(sv, key) || sv.hero;
  const [gw, gh] = gridDims(h);
  const Z = { key, grids: [], equip: [], quick: [], mods: [], members: [] };
  Z.equip = [
    { slot: 'weapon', x: ox + 24, y: oy + 96, w: 196, h: 64 },
    { slot: 'offhand', x: ox + 228, y: oy + 96, w: 96, h: 64 },
    { slot: 'armor', x: ox + 24, y: oy + 168, w: 196, h: 64 },
    { slot: 'pack', x: ox + 228, y: oy + 168, w: 96, h: 64 },
  ];
  for (let i = 0; i < QUICK_MAX; i++) Z.quick.push({ i, x: ox + 24 + i * 50, y: oy + 262, w: 44, h: 44 });
  Z.grids.push({ ref: { c: 'bag', key }, x: ox + 344, y: oy + 118, cell: CELL, w: gw, h: gh });
  const side = S.inv?.side;
  if (side === 'stash' && canStash(sv)) { const c = contOf(sv, { c: 'stash' }); Z.grids.push({ ref: { c: 'stash' }, x: ox + 344, y: oy + 450, cell: 22, w: c.w, h: c.h }); }
  if (side === 'ground') { const c = contOf(sv, { c: 'ground' }); Z.grids.push({ ref: { c: 'ground' }, x: ox + 344, y: oy + 450, cell: 28, w: c.w, h: c.h }); }
  gearMembers(sv).forEach((m, i) => Z.members.push({ key: m.key, name: m.name, x: ox + 24 + i * 122, y: oy + 62, w: 116, h: 26 }));
  // card mod slots of the selected host
  const host = cardHost(sv, S);
  const hi = host && hostInst(sv, host);
  if (hi) modSlotTypes(ITEMS[hi.item]).forEach((type, i) => Z.mods.push({ type, host, x: ox + 700 + i * 72, y: oy + 448, w: 64, h: 52 }));
  S.Z = Z;
  return Z;
}
/** The host whose mod slots the card shows: selected weapon/armour (worn or in a grid), else the worn weapon. */
function cardHost(sv, S) {
  const sel = S.inv?.sel;
  const ok = (f) => { const p = f && peek(sv, f); return p && ['weapon', 'armor'].includes(ITEMS[p.item]?.slot); };
  if (sel && (sel.at === 'equip' || sel.at === 'grid') && ok(sel)) return sel;
  const key = keyOf(S);
  if (eqInst(holderOf(sv, key), 'weapon')) return { at: 'equip', key, slot: 'weapon' };
  if (eqInst(holderOf(sv, key), 'armor')) return { at: 'equip', key, slot: 'armor' };
  return null;
}

/** What is under the mouse: { from } (an item) and/or { to } (a drop target). */
function pick(game, S, mx, my, carry) {
  const sv = game.save;
  const Z = S.Z;
  for (const g of Z.grids) {
    const r = { x: g.x, y: g.y, w: g.w * g.cell, h: g.h * g.cell };
    if (!inRect(r, mx, my)) continue;
    const cx = Math.floor((mx - g.x) / g.cell), cy = Math.floor((my - g.y) / g.cell);
    const grid = contOf(sv, g.ref).grid;
    const idx = entryAt(grid, cx, cy);
    const out = { zone: g, cx, cy };
    if (idx >= 0) out.from = { at: 'grid', ref: g.ref, index: idx };
    if (carry) {
      const [w, h] = itemSize(ITEMS[carry.item]);
      const [sw, sh] = carry.r ? [h, w] : [w, h];
      const x = Math.max(0, Math.min(g.w - sw, cx - Math.floor((sw - 1) / 2))), y = Math.max(0, Math.min(g.h - sh, cy - Math.floor((sh - 1) / 2)));
      const tgt = idx >= 0 ? grid[idx] : null;
      const tIt = tgt && ITEMS[tgt.item];
      if (ITEMS[carry.item]?.slot === 'mod' && tIt && ['weapon', 'armor'].includes(tIt.slot) && !(carry.from.at === 'grid' && carry.from.index === idx)) out.to = { at: 'mod', host: { at: 'grid', ref: g.ref, index: idx } };
      else out.to = { at: 'grid', ref: g.ref, x, y, r: !!carry.r, sw, sh };
    }
    return out;
  }
  for (const e of Z.equip) {
    if (!inRect(e, mx, my)) continue;
    const out = {};
    if (eqInst(holderOf(sv, Z.key), e.slot)) out.from = { at: 'equip', key: Z.key, slot: e.slot };
    if (carry) out.to = ITEMS[carry.item]?.slot === 'mod' && ['weapon', 'armor'].includes(e.slot) ? { at: 'mod', host: { at: 'equip', key: Z.key, slot: e.slot } } : { at: 'equip', key: Z.key, slot: e.slot };
    out.equip = e;
    return out;
  }
  for (const q of Z.quick) {
    if (!inRect(q, mx, my)) continue;
    const out = { quick: q };
    if (bagOf(holderOf(sv, Z.key)).quick[q.i]) out.from = { at: 'quick', key: Z.key, i: q.i };
    if (carry) out.to = { at: 'quick', key: Z.key, i: q.i };
    return out;
  }
  for (const m of Z.mods) {
    if (!inRect(m, mx, my)) continue;
    const hi = hostInst(sv, m.host);
    const i = (hi?.mods || []).findIndex((id) => ITEMS[id]?.modSlot === m.type);
    const out = { mod: m };
    if (i >= 0) out.from = { at: 'mod', host: m.host, i };
    if (carry) out.to = { at: 'mod', host: m.host };
    return out;
  }
  for (const m of Z.members) {
    if (!inRect(m, mx, my) || m.key === Z.key) continue;
    if (carry) return { to: { at: 'member', key: m.key }, member: m };
  }
  return {};
}

function afterMove(game, S, r, rebuild, to) {
  report(game, r);
  if (r.ok) {
    const sv = game.save;
    if (to?.at === 'grid') { const g = contOf(sv, to.ref).grid; const i = g.findIndex((e) => e.x === to.x && e.y === to.y); S.inv.sel = i >= 0 ? { at: 'grid', ref: to.ref, index: i } : null; }
    else if (to?.at === 'equip') S.inv.sel = to;
    else if (to?.at !== 'mod') S.inv.sel = null;
    saveGame(sv);
  }
  rebuild(game);
}

function drop(game, S, rebuild) {
  const d = S.inv.drag;
  S.inv.drag = null;
  const p = pick(game, S, game.input.mouse.x, game.input.mouse.y, d);
  if (!p.to) return;
  const r = moveItem(game.save, d.from, p.to, { check: modCheck(game) });
  afterMove(game, S, r, rebuild, p.to);
}

/** Mouse / keys of the gear tab. → true if the input was used (panels.js skips its buttons). */
export function updateGear(game, S, rebuild) {
  const inp = game.input;
  const m = inp.mouse;
  S.inv = S.inv || { drag: null, sel: null, side: null, card: createDetails() };
  layoutZones(game, S);
  const sv = game.save;
  const cardR = { x: S.ox + 690, y: S.oy + 96, w: 566, h: 322 };
  if (updateDetails(S.inv.card, cardR, m)) return true;
  const d = S.inv.drag;
  if (d) {
    if (inp.wasPressed('KeyR') || m.rightClicked) { d.r = !d.r; return true; }
    if (inp.wasPressed('Escape')) { S.inv.drag = null; return true; }
    if (m.released && (Math.abs(m.x - d.sx) > 6 || Math.abs(m.y - d.sy) > 6)) { drop(game, S, rebuild); return true; }
    if (m.clicked && d.armed) { drop(game, S, rebuild); return true; }
    if (m.released) d.armed = true; // click without moving: carry until the next click
    return m.clicked;
  }
  if (m.clicked) {
    const p = pick(game, S, m.x, m.y, null);
    if (!p.from) return false;
    const src = peek(sv, p.from);
    if (!src) return false;
    S.inv.sel = p.from;
    if (inp.isDown('ShiftLeft') || inp.isDown('ShiftRight')) {
      const r = quickMove(sv, p.from, keyOf(S), { host: cardHost(sv, S), check: modCheck(game) });
      afterMove(game, S, r, rebuild, null);
      return true;
    }
    S.inv.drag = { from: p.from, item: src.item, q: src.q, n: src.n, r: !!src.r, sx: m.x, sy: m.y, armed: !!m.released, ver: (S.inv.ver = (S.inv.ver || 0) + 1) };
    layoutZones(game, S);
    return true;
  }
  if (m.rightClicked) {
    const p = pick(game, S, m.x, m.y, null);
    if (p.from) { S.inv.sel = p.from; contextMenu(game, S, p.from, rebuild); return true; }
  }
  return false;
}
/** R / Esc are taken by the gear tab while carrying (panels.js asks before switching tabs). */
export const gearBusy = (S) => !!S?.inv?.drag;

function contextMenu(game, S, from, rebuild) {
  const sv = game.save;
  const src = peek(sv, from);
  const it = src && ITEMS[src.item];
  if (!it) return;
  const key = keyOf(S);
  const run = (to, o = {}) => (g) => afterMove(g, S, moveItem(sv, from, to, { check: modCheck(g), ...o }), rebuild, to);
  const opts = [];
  const slot = slotFor(it);
  if (from.at === 'equip' || from.at === 'quick' || from.at === 'mod') opts.push({ label: t('gear.unequip'), run: run({ at: 'member', key: from.key || from.host?.key || key }) });
  else if (slot) opts.push({ label: `${t('inv.wear')}: ${t(`gear.slot.${slot}`)}`, disabled: slot === 'offhand' && !!twoHandedBlock(holderOf(sv, key)), run: run({ at: 'equip', key, slot }) });
  if (from.at === 'grid' && canQuick(it)) opts.push({ label: t('inv.toQuick'), run: (g) => afterMove(g, S, quickMove(sv, from, key), rebuild, null) });
  if (from.at === 'grid' && it.slot === 'mod') {
    const host = cardHost(sv, S);
    if (host) opts.push({ label: `${t('inv.installOn')}: ${ITEMS[hostInst(sv, host)?.item]?.name || ''}`, run: run({ at: 'mod', host }) });
  }
  for (const m of gearMembers(sv)) if (m.key !== key) opts.push({ label: `${t('gear.transfer')}: ${m.name}`, run: run({ at: 'member', key: m.key }) });
  if (from.at === 'grid' && canStash(sv) && from.ref.c !== 'stash') opts.push({ label: t('inv.toStash'), run: (g) => { const c = contOf(sv, { c: 'stash' }); const p = findDrop(c, src); if (!p) { g.toast(t('inv.stashFull'), 'c'); return; } run({ at: 'grid', ref: { c: 'stash' }, ...p })(g); } });
  if (from.at === 'grid' && isGear(it) && it.slot !== 'mod') opts.push({ label: `${t('inv.disassemble')} (${t('skill.tech')} ${t('battle.dc')} ${disassembleDc(it)})`, disabled: !canStash(sv), reason: t('inv.hubOnly'), run: (g) => doDisassemble(g, S, from, rebuild) });
  if (from.at === 'grid' && from.ref.c !== 'ground') opts.push({ label: t('inv.drop'), run: (g) => { const c = contOf(sv, { c: 'ground' }); const p = findDrop(c, src); if (!p) { g.toast(t('inv.groundFull'), 'c'); return; } S.inv.side = 'ground'; run({ at: 'grid', ref: { c: 'ground' }, ...p })(g); } });
  opts.push({ label: t('loc.close'), run: () => {} });
  game.openModal({ title: `${it.name}${src.n > 1 ? ` ×${src.n}` : ''}`, lines: [], options: opts.map((o) => (o.disabled ? { ...o, sub: o.reason } : o)) });
}
function findDrop(cont, src) {
  const [w, h] = itemSize(ITEMS[src.item]);
  for (const r of [false, true]) {
    const [sw, sh] = r ? [h, w] : [w, h];
    for (let y = 0; y + sh <= cont.h; y++) for (let x = 0; x + sw <= cont.w; x++) if (rectFree(cont, x, y, sw, sh)) return { x, y, r };
  }
  return null;
}
function doDisassemble(game, S, from, rebuild) {
  const sv = game.save;
  const src = peek(sv, from);
  const it = ITEMS[src.item];
  const D = SKILL_RULES.economy.disassemble;
  const r = autoCheck(members(sv, game.data), [D.skill], disassembleDc(it));
  const table = LOOT_TABLES[(it.factions || [])[0]];
  const pool = (table?.entries || []).map((e) => e.item).filter((id) => ITEMS[id]?.slot === 'mod');
  const bonusMod = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  const res = disassemble(sv, from.ref, from.index, { success: r.success, partsId: D.item, parts: disassembleParts(it), bonusMod });
  if (!res.ok) { report(game, res); return; }
  game.toast(`${r.member?.name || ''}: ${t(res.msg)}`, r.success ? 'j' : 'c');
  for (const x of res.got) game.toast(`+ ${ITEMS[x.id]?.name || x.id}${x.n > 1 ? ` ×${x.n}` : ''}`, 'a');
  S.inv.sel = null;
  saveGame(sv);
  rebuild(game);
}

// ----------------------------------------------------------------------------- layout (buttons) and clicks
export function layoutGear(game, S, b) {
  const sv = game.save;
  const ms = gearMembers(sv);
  if (!ms.some((m) => m.key === S.gearKey)) S.gearKey = 'hero';
  gearHolder(sv, keyOf(S));
  syncItems(sv);
  S.inv = S.inv || { drag: null, sel: null, side: null, card: createDetails() };
  if (S.inv.side === 'stash' && !canStash(sv)) S.inv.side = null;
  if (!S.inv.side && groundOf(sv).grid.length) S.inv.side = 'ground';
  const Z = layoutZones(game, S);
  for (const m of Z.members) b.push({ kind: 'gearMember', id: m.key, label: m.name, x: m.x, y: m.y, w: m.w, h: m.h, font: SMALL, selected: m.key === Z.key });
  const ox = S.ox, oy = S.oy;
  let x = ox + 344;
  if (canStash(sv)) { b.push({ kind: 'gearSide', id: 'stash', label: t('inv.stash'), x, y: oy + 414, w: 110, h: 28, font: SMALL, selected: S.inv.side === 'stash' }); x += 116; }
  const gn = groundOf(sv).grid.length;
  if (gn) {
    b.push({ kind: 'gearSide', id: 'ground', label: `${t('inv.ground')} (${gn})`, x, y: oy + 414, w: 130, h: 28, font: SMALL, selected: S.inv.side === 'ground' }); x += 136;
    b.push({ kind: 'gearDropAll', label: t('inv.dropAll'), x, y: oy + 414, w: 130, h: 28, font: SMALL });
  }
  // card buttons
  const sel = S.inv.sel && peek(sv, S.inv.sel);
  if (sel && S.inv.sel.at === 'grid' && isGear(ITEMS[sel.item]) && ITEMS[sel.item].slot !== 'mod') {
    b.push({ kind: 'gearDis', label: t('inv.disassemble'), x: ox + 700, y: oy + 512, w: 150, h: 30, font: SMALL, disabled: !canStash(sv), reason: t('inv.hubOnly') });
  }
  if (sel && ms.length > 1) b.push({ kind: 'gearGive', label: t('gear.transfer'), x: ox + 858, y: oy + 512, w: 150, h: 30, font: SMALL });
  // hidden hover/click targets for bag items (scenarios / tooltips): wearables first
  const g = Z.grids[0];
  const grid = contOf(sv, g.ref).grid;
  const order = grid.map((e, i) => [e, i]).sort(([a], [c]) => !!slotFor(ITEMS[c.item]) - !!slotFor(ITEMS[a.item]));
  for (const [e, i] of order) { const [w, h] = entrySize(e); b.push({ kind: 'equip', hidden: true, id: e.item, index: i, x: g.x + e.x * g.cell, y: g.y + e.y * g.cell, w: w * g.cell, h: h * g.cell }); }
}

export function clickGear(game, S, b, after = () => {}) {
  const sv = game.save;
  if (b.kind === 'gearMember') { S.gearKey = b.id; S.inv.sel = null; return true; }
  if (b.kind === 'equip') return true; // handled by updateGear (drag)
  if (b.kind === 'gearSide') { S.inv.side = S.inv.side === b.id ? null : b.id; return true; }
  if (b.kind === 'gearDropAll') {
    game.openModal({ title: t('inv.dropAll'), lines: [{ text: t('inv.dropAllAsk'), color: 'c' }],
      options: [{ label: t('inv.dropAllYes'), run: (g) => { groundOf(sv).grid = []; S.inv.side = null; saveGame(sv); after(g); } }, { label: t('loc.close'), run: () => {} }] });
    return true;
  }
  if (b.kind === 'gearDis') { if (S.inv.sel?.at === 'grid') doDisassemble(game, S, S.inv.sel, after); return true; }
  if (b.kind === 'gearGive') {
    const from = S.inv.sel;
    const others = gearMembers(sv).filter((m) => m.key !== keyOf(S));
    game.openModal({ title: t('gear.transferTo'), lines: [],
      options: [...others.map((m) => ({ label: m.name, run: (g) => afterMove(g, S, moveItem(sv, from, { at: 'member', key: m.key }), after, null) })), { label: t('loc.close'), run: () => {} }] });
    return true;
  }
  return false;
}

// ----------------------------------------------------------------------------- render
function drawItem(ctx, it, x, y, w, h, o = {}) {
  const col = { weapon: C.c, armor: C.b, offhand: C.b, mod: C.a, pack: C.n }[it.slot] || (it.cat === 'consumable' ? C.j : C['4']);
  ctx.globalAlpha = o.alpha ?? 1;
  panel(ctx, x + 1, y + 1, w - 2, h - 2, o.fill || C['2'], o.border || col);
  const small = Math.min(w, h) < 30;
  const font = small ? 'bold 10px monospace' : 'bold 11px monospace';
  const name = it.name;
  if (w >= h) text(ctx, fit(ctx, name, w - 6, font), x + 4, y + 3, C['5'], font);
  else {
    // vertical items: short name, one word per line
    const words = name.split(/\s+/).slice(0, Math.max(1, Math.floor((h - 6) / 12)));
    words.forEach((wd, i) => text(ctx, fit(ctx, wd, w - 4, font), x + 3, y + 3 + i * 12, C['5'], font));
  }
  if (o.n > 1) text(ctx, `×${o.n}`, x + w - 3, y + h - 13, C.b, '11px monospace', 'right');
  if (o.q && o.q !== 'working' && o.q !== 'relic') text(ctx, o.q === 'junk' ? '▾' : '★', x + w - 3, y + 2, o.q === 'junk' ? C.n : C.b, '11px monospace', 'right');
  if (o.mods?.length) text(ctx, `+${o.mods.length}`, x + 3, y + h - 13, C.a, '11px monospace');
  ctx.globalAlpha = 1;
}

function drawGrid(ctx, sv, g, S) {
  const cont = contOf(sv, g.ref);
  const W = g.w * g.cell, H = g.h * g.cell;
  panel(ctx, g.x - 2, g.y - 2, W + 4, H + 4, C['1'], C['3']);
  ctx.strokeStyle = C['2'];
  ctx.lineWidth = 1;
  for (let i = 1; i < g.w; i++) { ctx.beginPath(); ctx.moveTo(g.x + i * g.cell + 0.5, g.y); ctx.lineTo(g.x + i * g.cell + 0.5, g.y + H); ctx.stroke(); }
  for (let j = 1; j < g.h; j++) { ctx.beginPath(); ctx.moveTo(g.x, g.y + j * g.cell + 0.5); ctx.lineTo(g.x + W, g.y + j * g.cell + 0.5); ctx.stroke(); }
  const d = S.inv?.drag;
  cont.grid.forEach((e, i) => {
    const it = ITEMS[e.item];
    const [w, h] = entrySize(e);
    const lifted = d && d.from.at === 'grid' && d.from.ref.c === g.ref.c && d.from.ref.key === g.ref.key && d.from.index === i;
    const sel = S.inv?.sel?.at === 'grid' && S.inv.sel.ref.c === g.ref.c && S.inv.sel.ref.key === g.ref.key && S.inv.sel.index === i;
    drawItem(ctx, it, g.x + e.x * g.cell, g.y + e.y * g.cell, w * g.cell, h * g.cell, { n: e.n, q: e.q, mods: e.mods, alpha: lifted ? 0.3 : 1, border: sel ? C.h : undefined, fill: sel ? C.i : undefined });
    if (!d) hotspot(g.x + e.x * g.cell, g.y + e.y * g.cell, w * g.cell, h * g.cell, () => tipFor(S, sv, e));
  });
}

function tipFor(S, sv, inst, worn = false) {
  const it = ITEMS[inst.item];
  const key = keyOf(S);
  const u = S.units[key] || S.units.hero;
  const slot = slotFor(it);
  const cur = slot ? eqInst(holderOf(sv, key), slot) : null;
  const tip = itemTip(it, { u, q: inst.q, mods: inst.mods, have: inst.n > 1 ? inst.n : undefined, equipped: cur && !worn ? ITEMS[cur.item] : null, tier: worn ? undefined : false });
  if (!slot || worn) return tip;
  return { ...tip, width: 440, lines: [...tip.lines, '', { text: t('tip.ifEquip'), color: C.h }, ...compareLines(S, sv, inst)] };
}

/** «Если надеть»: KB / attack / speed / damage / tier after putting `inst` on the selected member. */
function compareLines(S, sv, inst) {
  const key = keyOf(S);
  const it = ITEMS[inst.item];
  const slot = slotFor(it);
  const cur = S.units[key] || S.units.hero;
  const h = holderOf(sv, key);
  const eq = { weapon: null, armor: null, offhand: null, pack: null, mods: [], ...(h?.equipment || {}) };
  const next = { ...eq, inst: { ...(eq.inst || {}) }, [slot]: inst.item };
  next.inst[slot] = { q: inst.q, mods: inst.mods || [] };
  if (slot === 'weapon' && it.twoHanded) { next.offhand = null; delete next.inst.offhand; }
  if (slot === 'offhand' && twoHandedBlock(h)) return [{ text: t('inv.twoHandedBlock'), color: C.c }];
  let nu = null;
  try { nu = key === 'hero' ? buildHero({ ...sv, hero: { ...sv.hero, equipment: next } }) : buildCompanion(sv, { ...h, equipment: next }); } catch { nu = null; }
  if (!nu) return [];
  const dd = (a, c) => (c === a ? `${a}` : `${a} → ${c}`);
  const col = (a, c) => (c > a ? C.j : c < a ? C.c : C['5']);
  const rows = [[t('res.kb'), cur.kb, nu.kb], [t('gear.attack'), attackOf(cur), attackOf(nu)], [t('create.speed'), cur.speed, nu.speed]];
  const out = rows.map(([k, a, c]) => ({ text: `${k}: ${dd(a, c)}`, color: col(a, c) }));
  if (slot === 'weapon') {
    out.push({ text: `${t('gear.damage')}: ${cur.weapon?.dice || '—'}${cur.weapon?.dmg ? `+${cur.weapon.dmg}` : ''} → ${nu.weapon?.dice || '—'}${nu.weapon?.dmg ? `+${nu.weapon.dmg}` : ''} ${t(`dmg.${nu.weapon?.dmgType}`)}`, color: C['5'] });
    out.push({ text: `${t('prof.tier')}: ${dd(cur.weaponTier, nu.weaponTier)} (${tierName(nu.weaponTier)})`, color: nu.weaponTier <= 1 ? C.c : col(cur.weaponTier, nu.weaponTier) });
  }
  if (slot === 'armor') out.push({ text: `${t('prof.tier')}: ${dd(cur.armorTier, nu.armorTier)} (${tierName(nu.armorTier)})${nu.armorPenalty ? ` — ${t('gear.penalty')}` : ''}`, color: nu.armorPenalty ? C.c : C['5'] });
  if (slot === 'armor' || slot === 'pack') out.push({ text: `${t('inv.quickSlots')}: ${quickCount(h)} → ${quickCount({ equipment: next })}`, color: C['5'] });
  if (nu.reqPenalty?.length) out.push({ text: t('gear.reqPenalty'), color: C.c });
  return out;
}

export function renderGear(game, S) {
  const { ctx } = game;
  const sv = game.save;
  const ox = S.ox, oy = S.oy;
  const key = keyOf(S);
  const h = holderOf(sv, key) || sv.hero;
  const u = S.units[key] || S.units.hero;
  const Z = layoutZones(game, S);
  const d = S.inv?.drag;
  const time = S.time || 0;
  // --- equipment slots
  text(ctx, t('gear.slots'), ox + 24, oy + 94 - 18, C['4'], SMALL);
  const bagHasOff = contOf(sv, { c: 'bag', key }).grid.some((e) => ITEMS[e.item]?.slot === 'offhand');
  const hov = d ? pick(game, S, game.input.mouse.x, game.input.mouse.y, d) : null;
  for (const e of Z.equip) {
    const inst = eqInst(h, e.slot);
    const blocked = e.slot === 'offhand' && twoHandedBlock(h);
    let border = C['3'];
    if (d && hov?.equip === e) {
      const why = probe(sv, d, hov.to);
      border = why ? C.c : C.j;
      if (why) showTip({ title: t(`gear.slot.${e.slot}`), titleColor: C.c, lines: [{ text: t(why), color: 'c' }] });
    } else if (e.slot === 'offhand' && !inst && !blocked && bagHasOff) border = Math.sin(time * 4) > 0 ? C.h : C['4']; // soft pulse
    panel(ctx, e.x, e.y, e.w, e.h, blocked ? C['0'] : C['1'], border);
    text(ctx, t(`gear.slot.${e.slot}`), e.x + 6, e.y + 3, C['4'], SMALL);
    if (inst) {
      const lifted = d && d.from.at === 'equip' && d.from.slot === e.slot;
      drawItem(ctx, ITEMS[inst.item], e.x + 4, e.y + 18, e.w - 8, e.h - 22, { q: inst.q, mods: inst.mods, alpha: lifted ? 0.3 : 1 });
      if (!d) hotspot(e.x, e.y, e.w, e.h, () => tipFor(S, sv, inst, true));
    } else if (blocked) {
      text(ctx, '🔒', e.x + e.w / 2, e.y + 22, C['4'], FONT, 'center');
      hotspot(e.x, e.y, e.w, e.h, () => ({ title: t('gear.slot.offhand'), lines: [{ text: tf('inv.busyTwoHanded', { name: blocked.name }), color: 'c' }, { text: t('inv.twoHandedHint'), color: '4' }] }));
    } else {
      const hint = e.slot === 'weapon' ? `${u.weapon?.name || '—'}` : e.slot === 'armor' ? t('gear.classDefault') : e.slot === 'offhand' ? t('inv.offEmpty') : t('inv.pockets');
      text(ctx, fit(ctx, hint, e.w - 12, SMALL), e.x + 6, e.y + 24, C['3'], SMALL);
      if (e.slot === 'offhand') hotspot(e.x, e.y, e.w, e.h, () => ({ title: t('gear.slot.offhand'), lines: [{ text: t('inv.offEmptyTip'), color: '5' }] }));
    }
  }
  // --- quick slots
  const qn = quickCount(h);
  text(ctx, `${t('inv.quick')} ${qn}/${QUICK_MAX}`, ox + 24, oy + 244, C['4'], SMALL);
  const bag = bagOf(h);
  for (const q of Z.quick) {
    const on = q.i < qn;
    let border = on ? C['3'] : C['1'];
    if (d && hov?.quick === q) border = probe(sv, d, hov.to) ? C.c : C.j;
    panel(ctx, q.x, q.y, q.w, q.h, on ? C['1'] : C['0'], border);
    text(ctx, String(q.i + 1), q.x + 3, q.y + 1, on ? C.a : C['2'], '11px monospace');
    const e = bag.quick[q.i];
    if (e) {
      const lifted = d && d.from.at === 'quick' && d.from.i === q.i;
      drawItem(ctx, ITEMS[e.item], q.x + 2, q.y + 10, q.w - 4, q.h - 12, { n: e.n, alpha: lifted ? 0.3 : on ? 1 : 0.4 });
      if (!d) hotspot(q.x, q.y, q.w, q.h, () => itemTip(ITEMS[e.item], { have: e.n }));
    } else if (!on) hotspot(q.x, q.y, q.w, q.h, () => ({ title: t('inv.quick'), lines: [{ text: t('inv.quickLockedTip'), color: '4' }] }));
  }
  // --- summary + penalties
  let y = oy + 318;
  const sum = `${t('res.kb')} ${u.kb}${u.offhand?.kb ? ` (${t('gear.slot.offhand')} +${u.offhand.kb})` : ''} · ${t('gear.attack')} +${attackOf(u)} · ${t('gear.damage')} ${u.weapon?.dice || '—'}${u.weapon?.dmg ? `+${u.weapon.dmg}` : ''} · ${t('create.speed')} ${u.speed}`;
  for (const line of wrapLines(ctx, sum, 300, FONT_B)) { text(ctx, line, ox + 24, y, C.h, FONT_B); y += LINE; }
  const pen = [];
  if (u.weaponTier <= 1) pen.push(t('gear.penWeapon'));
  if (u.armorPenalty) pen.push(t('gear.penArmor'));
  if (u.stealthDis) pen.push(t('gear.penStealth'));
  if (u.reqPenalty?.length) pen.push(`${t('item.req')}: ${u.reqPenalty.map((id) => ITEMS[id]?.name || id).join(', ')} — ${t('gear.reqPenalty')}`);
  if ((u.weapon?.rof || 1) > 1) pen.push(`${t('item.rof')} ${u.weapon.rof} (${t('item.recoil')} ${u.weapon.recoil || 0})`);
  for (const line of wrapLines(ctx, pen.join(' · ') || t('gear.noPenalty'), 300, SMALL)) { text(ctx, line, ox + 24, y + 4, pen.length ? C.a : C['4'], SMALL); y += 16; }
  // --- grids
  const g0 = Z.grids[0];
  const pk = ITEMS[h.equipment?.pack];
  text(ctx, `${t('gear.backpack')}: ${pk ? pk.name : t('inv.pockets')} ${g0.w}×${g0.h}`, g0.x, g0.y - 20, C['4'], FONT_B);
  for (const g of Z.grids) {
    if (g !== g0) text(ctx, g.ref.c === 'stash' ? `${t('inv.stash')} ${g.w}×${g.h}` : t('inv.groundTitle'), g.x + g.w * g.cell + 10, g.y, C['4'], SMALL);
    drawGrid(ctx, sv, g, S);
  }
  // --- card (selected item or the worn weapon)
  renderCard(game, S, Z);
  // --- drag ghost
  if (d) drawGhost(game, S, d, hov);
  text(ctx, t('inv.help'), ox + 24, oy + 700, C['3'], SMALL);
}

const wrapLines = (ctx, s, w, font) => {
  ctx.font = font;
  const out = [];
  let cur = '';
  for (const wd of s.split(' ')) { const tr = cur ? `${cur} ${wd}` : wd; if (ctx.measureText(tr).width > w && cur) { out.push(cur); cur = wd; } else cur = tr; }
  if (cur) out.push(cur);
  return out;
};

/** Why a drop would fail (text key) or null — dry run on a copy of the save. */
function probe(sv, d, to) {
  if (!to) return 'inv.noFit';
  const key = JSON.stringify([d.from, to, d.r, d.ver]);
  if (probe.k === key && probe.sv === sv) return probe.v;
  const copy = JSON.parse(JSON.stringify({ hero: sv.hero, party: sv.party, stash: sv.stash, ground: sv.ground, location: sv.location }));
  const r = moveItem(copy, d.from, to, { check: () => ({ success: true }) });
  probe.k = key; probe.sv = sv; probe.v = r.ok ? null : r.msg;
  return probe.v;
}

function drawGhost(game, S, d, hov) {
  const { ctx } = game;
  const sv = game.save;
  const m = game.input.mouse;
  const it = ITEMS[d.item];
  const [w0, h0] = itemSize(it);
  const [w, h] = d.r ? [h0, w0] : [w0, h0];
  const to = hov?.to;
  if (to?.at === 'grid') {
    const g = hov.zone;
    const why = probe(sv, d, to);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = why ? C.c : C.j;
    ctx.fillRect(g.x + to.x * g.cell, g.y + to.y * g.cell, w * g.cell, h * g.cell);
    ctx.globalAlpha = 1;
  }
  if (to?.at === 'mod' || to?.at === 'member') {
    const why = probe(sv, d, to);
    if (why) showTip({ title: it.name, titleColor: C.c, lines: [{ text: t(why), color: 'c' }] });
    else if (to.at === 'mod') showTip({ title: it.name, titleColor: C.j, lines: [{ text: it.req ? tf('inv.modReq', { dc: it.req.dc }) : t('inv.modDrop'), color: it.req ? 'a' : 'j' }] });
  }
  drawItem(ctx, it, m.x - (w * CELL) / 2, m.y - (h * CELL) / 2, w * CELL, h * CELL, { n: d.n, q: d.q, alpha: 0.85, border: C.h });
}

function renderCard(game, S, Z) {
  const { ctx } = game;
  const sv = game.save;
  const ox = S.ox, oy = S.oy;
  const r = { x: ox + 690, y: oy + 96, w: 566, h: 322 };
  const sel = S.inv?.sel && peek(sv, S.inv.sel);
  const host = cardHost(sv, S);
  const show = sel || (host && peek(sv, host));
  panel(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, C['1'], C['2']);
  if (!show) { text(ctx, t('inv.cardEmpty'), r.x + 8, r.y + 8, C['3'], FONT); }
  else {
    const it = ITEMS[show.item];
    const worn = (S.inv?.sel || host)?.at === 'equip';
    const spec = tipFor(S, sv, show, worn);
    drawDetails(ctx, S.inv.card, r, spec, `${show.item}:${show.q}:${(show.mods || []).join(',')}`);
    void it;
  }
  // mod slots of the host
  const hi = host && hostInst(sv, host);
  if (!hi) return;
  const hostIt = ITEMS[hi.item];
  const cap = modCapacity(hostIt, hi.q);
  text(ctx, `${t('inv.modsOf')}: ${hostIt.name} · ${t('inv.slots')} ${hi.mods.length}/${cap}`, ox + 700, oy + 428, C['4'], SMALL);
  const d = S.inv?.drag;
  const dIt = d && ITEMS[d.item];
  for (const z of Z.mods) {
    const mid = hi.mods.find((id) => ITEMS[id]?.modSlot === z.type);
    let border = mid ? C.a : C['3'];
    let why = null;
    if (dIt?.slot === 'mod') {
      why = dIt.modSlot !== z.type ? 'gear.noSlot' : modFitProblem(dIt, hi);
      border = why ? C.c : C.j;
    }
    panel(ctx, z.x, z.y, z.w, z.h, C['1'], border);
    if (mid) {
      const lifted = d && d.from.at === 'mod';
      drawItem(ctx, ITEMS[mid], z.x + 2, z.y + 2, z.w - 4, z.h - 18, { alpha: lifted ? 0.3 : 1 });
      if (!d) hotspot(z.x, z.y, z.w, z.h, () => itemTip(ITEMS[mid], { size: false }));
    }
    text(ctx, fit(ctx, MOD_SLOTS[z.type] || z.type, z.w - 4, '10px monospace'), z.x + z.w / 2, z.y + z.h - 13, C['4'], '10px monospace', 'center');
    if (dIt?.slot === 'mod' && inRect(z, game.input.mouse.x, game.input.mouse.y)) showTip({ title: dIt.name, titleColor: why ? C.c : C.j, lines: [{ text: why ? t(why) : dIt.req ? tf('inv.modReq', { dc: dIt.req.dc }) : t('inv.modDrop'), color: why ? 'c' : 'j' }] });
  }
}

/** Kept for panels.js: the old comparison card is now part of the hover tip. */
export function renderGearHover() {}

/** Inline list of items «name ×n» with hover cards (wraps; returns the y after the last row). */
export function itemChips(ctx, label, entries, x, y, w, o = {}) {
  ctx.font = FONT;
  let cx = x;
  if (label) { text(ctx, label, x, y, C['4'], FONT); cx += ctx.measureText(label).width + 8; }
  if (!entries.length) { text(ctx, '—', cx, y, C['3'], FONT); return y + LINE; }
  entries.forEach(([id, n], i) => {
    const it = ITEMS[id];
    const s = `${it?.name || id}${n > 1 ? ` ×${n}` : ''}${i < entries.length - 1 ? ',' : ''}`;
    const sw = ctx.measureText(s).width;
    if (cx + sw > x + w && cx > x) { cx = x; y += LINE; }
    text(ctx, s, cx, y, C['5'], FONT);
    if (it) hotspot(cx, y, sw, LINE, () => itemTip(it, { u: o.u, have: n }));
    cx += sw + ctx.measureText(' ').width;
  });
  return y + LINE;
}
export { makeInst };
