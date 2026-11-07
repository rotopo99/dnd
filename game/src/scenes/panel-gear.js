// Party screen → «Снаряжение» tab (v3, v4 — every party member): slots (weapon, off-hand, armour, mods) of the selected
// member (S.gearKey: 'hero' | companion NPC id), the shared party backpack (save.hero.items), comparison on hover
// (KB, attack, damage, proficiency tier), requirements and penalties, transfer of an equipped piece to another member.
// Equipped items are NOT counted in save.hero.items: equipping moves one piece out of the backpack, the old one goes back.
import { t } from '../data/text/index.js';
import { ITEMS } from '../world/data.js';
import { buildHero, buildCompanion, gearHolder } from '../world/state.js';
import { NPCS } from '../data/npcs.js';
import { mod, TIER_BONUS } from '../rules/character.js';
import { isBattleItem } from '../rules/combat.js';
import { C, FONT, FONT_B, LINE, text, fit, panel } from '../ui/draw.js';
import { itemStats, soonNote, unmetReq, tierName } from '../ui/items-ui.js';
import { saveGame } from '../save.js';

const SMALL = '12px monospace';
const PAGE = 11;
const GEAR = new Set(['weapon', 'armor', 'offhand', 'mod']);

export const isGear = (it) => !!it && GEAR.has(it.slot);
const eqOf = (sv, key = 'hero') => ({ weapon: null, armor: null, offhand: null, mods: [], ...(gearHolder(sv, key)?.equipment || {}) });
const keyOf = (S) => S?.gearKey || 'hero';

/** Attack bonus of the creature's weapon (as combat.js weaponAttackBonus outside a battle). */
export const attackOf = (u) => (u.weapon ? mod(u.stats[u.weapon.stat || 'str'] ?? 10) + u.prof + (TIER_BONUS[u.weaponTier] || 0) + (u.weapon.hit || 0) + (u.hitBonus || 0) : 0);

/** Equipment after putting `id` on (mods: into the matching free mod slot of the target item). */
export function withItem(sv, id, key = 'hero') {
  const eq = eqOf(sv, key);
  const it = ITEMS[id];
  const out = { ...eq, mods: [...(eq.mods || [])] };
  if (it.slot === 'weapon') {
    out.weapon = id;
    if (it.twoHanded) out.offhand = null;
    out.mods = out.mods.filter((m) => ITEMS[m]?.target !== 'weapon');
  } else if (it.slot === 'armor') { out.armor = id; out.mods = out.mods.filter((m) => ITEMS[m]?.target !== 'armor'); }
  else if (it.slot === 'offhand') { out.offhand = id; if (ITEMS[out.weapon]?.twoHanded) out.weapon = null; }
  else if (it.slot === 'mod') {
    out.mods = out.mods.filter((m) => !(ITEMS[m]?.target === it.target && ITEMS[m]?.modSlot === it.modSlot));
    out.mods.push(id);
  }
  return out;
}

/** Why a mod cannot go on now (null — fits). */
export function modProblem(sv, id, key = 'hero') {
  const it = ITEMS[id];
  if (it?.slot !== 'mod') return null;
  const eq = eqOf(sv, key);
  const host = ITEMS[it.target === 'armor' ? eq.armor : eq.weapon];
  if (!host) return t('gear.noHost');
  if (it.modSlot && host.slots && !host.slots.includes(it.modSlot)) return t('gear.noSlot');
  const f = it.fits || {};
  if (f.group && host.group && !f.group.includes(host.group)) return t('gear.noFit');
  if (f.wtype && !f.wtype.includes(host.wtype) && !f.wtype.includes(host.type)) return t('gear.noFit');
  if (f.atype && !f.atype.includes(host.atype) && !f.atype.includes(host.type)) return t('gear.noFit');
  if (f.rofMin && (host.rof || 1) < f.rofMin) return t('gear.noFit');
  return null;
}

function setEquipment(sv, next, key = 'hero') {
  const before = eqOf(sv, key);
  const was = [before.weapon, before.armor, before.offhand, ...(before.mods || [])].filter(Boolean);
  const now = [next.weapon, next.armor, next.offhand, ...(next.mods || [])].filter(Boolean);
  const items = sv.hero.items;
  for (const id of was) if (!now.includes(id)) items[id] = (items[id] || 0) + 1;
  for (const id of now) if (!was.includes(id)) items[id] = Math.max(0, (items[id] || 0) - 1);
  gearHolder(sv, key).equipment = next;
}

export function equip(game, id, key = 'hero') {
  const sv = game.save;
  const p = modProblem(sv, id, key);
  if (p) { game.toast(p, 'c'); return false; }
  setEquipment(sv, withItem(sv, id, key), key);
  saveGame(sv);
  return true;
}

export function unequip(game, slot, id, key = 'hero') {
  const sv = game.save;
  const eq = eqOf(sv, key);
  const next = { ...eq, mods: [...(eq.mods || [])] };
  if (slot === 'mod') next.mods = next.mods.filter((m) => m !== id);
  else {
    next[slot] = null;
    // mods fall off with their host
    next.mods = next.mods.filter((m) => ITEMS[m]?.target !== slot);
  }
  setEquipment(sv, next, key);
  saveGame(sv);
}

/** Members whose gear can be changed: hero + active / waiting companions. [{ key, name }] */
export function gearMembers(sv) {
  return [{ key: 'hero', name: sv.hero.name }, ...sv.party.filter((p) => p.state === 'active' || p.state === 'waiting').map((p) => ({ key: p.npc, name: NPCS[p.npc]?.name || p.npc }))];
}

/** Move an equipped piece from one member to another (through the shared backpack). */
export function transferItem(game, slot, id, from, to) {
  unequip(game, slot, id, from);
  if (!equip(game, id, to)) game.toast(t('gear.transferBackpack'), 'a');
}

const backpackGear = (sv) => Object.entries(sv.hero.items).filter(([id, n]) => n > 0 && isGear(ITEMS[id])).map(([id, n]) => ({ id, n }));

export function layoutGear(game, S, b) {
  const sv = game.save;
  const ox = S.ox, oy = S.oy;
  const ms = gearMembers(sv);
  if (!ms.some((m) => m.key === S.gearKey)) S.gearKey = 'hero';
  const key = keyOf(S);
  ms.forEach((m, i) => b.push({ kind: 'gearMember', id: m.key, label: m.name, x: ox + 150 + i * 122, y: oy + 58, w: 116, h: 24, font: SMALL, selected: m.key === key }));
  const eq = eqOf(sv, key);
  const slots = [['weapon', eq.weapon], ['offhand', eq.offhand], ['armor', eq.armor], ...(eq.mods || []).map((m) => ['mod', m])];
  slots.forEach(([slot, id], i) => {
    if (!id) return;
    b.push({ kind: 'unequip', slot, id, label: t('gear.unequip'), x: ox + 524, y: oy + 84 + i * 74, w: 116, h: 30, font: SMALL });
    if (ms.length > 1 && slot !== 'mod') b.push({ kind: 'transfer', slot, id, label: t('gear.transfer'), x: ox + 524, y: oy + 118 + i * 74, w: 116, h: 30, font: SMALL });
  });
  const list = backpackGear(sv);
  S.gearPage = Math.min(S.gearPage || 0, Math.max(0, Math.ceil(list.length / PAGE) - 1));
  list.slice(S.gearPage * PAGE, S.gearPage * PAGE + PAGE).forEach((g, i) => {
    const it = ITEMS[g.id];
    const prob = modProblem(sv, g.id, key);
    b.push({ kind: 'equip', id: g.id, label: `${it.name}${g.n > 1 ? ` ×${g.n}` : ''}`, sub: itemStats(it), font: FONT_B, x: ox + 680, y: oy + 100 + i * 46, w: 576, h: 42, disabled: !!prob, reason: prob});
  });
  if (list.length > PAGE) {
    b.push({ kind: 'gearPage', id: -1, label: '◀', x: ox + 1140, y: oy + 64, w: 54, h: 28, disabled: S.gearPage === 0 });
    b.push({ kind: 'gearPage', id: 1, label: '▶', x: ox + 1202, y: oy + 64, w: 54, h: 28, disabled: (S.gearPage + 1) * PAGE >= list.length });
  }
}

export function clickGear(game, S, b, after = () => {}) {
  const key = keyOf(S);
  if (b.kind === 'gearMember') { S.gearKey = b.id; return true; }
  if (b.kind === 'equip') { equip(game, b.id, key); return true; }
  if (b.kind === 'unequip') { unequip(game, b.slot, b.id, key); return true; }
  if (b.kind === 'transfer') {
    const others = gearMembers(game.save).filter((m) => m.key !== key);
    game.openModal({ title: `${t('gear.transfer')}: ${ITEMS[b.id]?.name || b.id}`, lines: [{ text: t('gear.transferTo'), color: 'a' }],
      options: [...others.map((m) => ({ label: m.name, run: (g) => { transferItem(g, b.slot, b.id, key, m.key); S.gearKey = m.key; after(g); } })), { label: t('loc.close'), run: () => {} }] });
    return true;
  }
  if (b.kind === 'gearPage') { S.gearPage = (S.gearPage || 0) + b.id; return true; }
  return false;
}

function slotLine(ctx, u, slot, id, x, y, w) {
  const it = id ? ITEMS[id] : null;
  panel(ctx, x, y, w, 70, C['1'], C['2']);
  text(ctx, t(`gear.slot.${slot}`), x + 10, y + 6, C['4'], SMALL);
  if (!it) {
    const twoH = slot === 'offhand' && u.weapon?.twoHanded;
    text(ctx, twoH ? t('gear.twoHandedBusy') : slot === 'weapon' ? `${u.weapon?.name || '—'} (${t('gear.classDefault')})` : slot === 'armor' ? t('gear.classDefault') : '—', x + 10, y + 24, C['3'], FONT);
    return;
  }
  text(ctx, fit(ctx, it.name, w - 150, FONT_B), x + 10, y + 22, C['5'], FONT_B);
  const soon = soonNote(it);
  text(ctx, fit(ctx, `${itemStats(it)}${soon ? ` · ${soon}` : ''}`, w - 20, SMALL), x + 10, y + 42, soon ? C.a : C['4'], SMALL);
  const tier = slot === 'weapon' ? u.weaponTier : slot === 'armor' ? u.armorTier : null;
  const req = unmetReq(it, u);
  const warn = [tier != null ? `${t('prof.tier')} ${tier}: ${tierName(tier)}${tier <= 1 ? ` — ${t('gear.penalty')}` : ''}` : null, req.length ? `${t('item.req')} ${req.join(', ')}` : null].filter(Boolean).join(' · ');
  if (warn) text(ctx, fit(ctx, warn, w - 20, SMALL), x + 10, y + 56, tier <= 1 || req.length ? C.c : C.j, SMALL);
}

export function renderGear(game, S) {
  const { ctx } = game;
  const sv = game.save;
  const ox = S.ox, oy = S.oy;
  const key = keyOf(S);
  const u = S.units[key] || S.units.hero;
  const eq = eqOf(sv, key);
  text(ctx, t('gear.slots'), ox + 24, oy + 62, C['4'], FONT_B);
  const slots = [['weapon', eq.weapon], ['offhand', eq.offhand], ['armor', eq.armor], ...(eq.mods || []).map((m) => ['mod', m])];
  slots.forEach(([slot, id], i) => slotLine(ctx, u, slot, id, ox + 24, oy + 84 + i * 74, 624));
  // summary + penalties
  let y = oy + 84 + slots.length * 74 + 8;
  text(ctx, `${t('res.kb')} ${u.kb} · ${t('gear.attack')} +${attackOf(u)} · ${t('gear.damage')} ${u.weapon?.dice || '—'}${u.weapon?.dmg ? `+${u.weapon.dmg}` : ''} · ${t('create.speed')} ${u.speed}`, ox + 24, y, C.h, FONT_B);
  y += LINE + 4;
  const pen = [];
  if (u.weaponTier <= 1) pen.push(t('gear.penWeapon'));
  if (u.armorPenalty) pen.push(t('gear.penArmor'));
  if (u.stealthDis) pen.push(t('gear.penStealth'));
  if ((u.weapon?.rof || 1) > 1) pen.push(`${t('item.rof')} ${u.weapon.rof} (${t('item.recoil')} ${u.weapon.recoil || 0})`);
  text(ctx, fit(ctx, pen.join(' · ') || t('gear.noPenalty'), 624, FONT), ox + 24, y, pen.length ? C.a : C['4'], FONT);
  // belt (battle items)
  y += LINE + 8;
  const belt = Object.entries(sv.hero.items).filter(([id, n]) => n > 0 && isBattleItem(ITEMS[id])).map(([id, n]) => `${ITEMS[id].name} ×${n}`);
  if (key === 'hero') text(ctx, fit(ctx, `${t('gear.belt')}: ${belt.join(', ') || '—'}`, 624, FONT), ox + 24, y, C['5'], FONT);
  else text(ctx, fit(ctx, t('gear.sharedBackpack'), 624, FONT), ox + 24, y, C['4'], FONT);
  // backpack + comparison
  text(ctx, t('gear.backpack'), ox + 680, oy + 64, C['4'], FONT_B);
  if (!backpackGear(sv).length) text(ctx, t('gear.empty'), ox + 680, oy + 100, C['3'], FONT);
}

/** Comparison card over the buttons (call after they are drawn). */
export function renderGearHover(game, S) {
  if (S.hover?.kind === 'equip') compare(game, S, S.hover);
}

/** Hover card: what changes if the item is put on. */
function compare(game, S, b) {
  const { ctx } = game;
  const sv = game.save;
  const key = keyOf(S);
  const cur = S.units[key] || S.units.hero;
  const nextEq = withItem(sv, b.id, key);
  let nu;
  try {
    if (key === 'hero') nu = buildHero({ ...sv, hero: { ...sv.hero, equipment: nextEq } }, game.data);
    else nu = buildCompanion(sv, { ...gearHolder(sv, key), equipment: nextEq }, game.data);
  } catch { nu = null; }
  if (!nu) return;
  const it = ITEMS[b.id];
  const d = (a, c) => (c === a ? `${a}` : `${a} → ${c}`);
  const col = (a, c) => (c > a ? C.j : c < a ? C.c : C['5']);
  const rows = [
    [t('res.kb'), cur.kb, nu.kb],
    [t('gear.attack'), attackOf(cur), attackOf(nu)],
    [t('create.speed'), cur.speed, nu.speed],
  ];
  const lines = rows.map(([k, a, c]) => ({ text: `${k}: ${d(a, c)}`, color: col(a, c) }));
  if (it.slot === 'weapon') {
    lines.push({ text: `${t('gear.damage')}: ${cur.weapon?.dice || '—'} → ${nu.weapon?.dice || '—'} ${t(`dmg.${nu.weapon?.dmgType}`)}`, color: C['5'] });
    lines.push({ text: `${t('prof.tier')}: ${d(cur.weaponTier, nu.weaponTier)} (${tierName(nu.weaponTier)})`, color: nu.weaponTier <= 1 ? C.c : col(cur.weaponTier, nu.weaponTier) });
  }
  if (it.slot === 'armor') lines.push({ text: `${t('prof.tier')}: ${d(cur.armorTier, nu.armorTier)} (${tierName(nu.armorTier)})${nu.armorPenalty ? ` — ${t('gear.penalty')}` : ''}`, color: nu.armorPenalty ? C.c : C['5'] });
  const req = unmetReq(it, nu);
  if (req.length) lines.push({ text: `${t('item.req')} ${req.join(', ')}: ${t('gear.reqPenalty')}`, color: C.c });
  const soon = soonNote(it);
  if (soon) lines.push({ text: soon, color: C.a });
  if (it.desc) lines.push({ text: it.desc, color: C['4'] });
  const w = 420, hgt = 14 + lines.length * 18;
  const x = Math.max(8, b.x - w - 8), y = Math.min(S.oy + 700 - hgt, b.y);
  panel(ctx, x, y, w, hgt, C['0'], C.h);
  lines.forEach((l, i) => text(ctx, fit(ctx, l.text, w - 20, SMALL), x + 10, y + 8 + i * 18, l.color, SMALL));
}
