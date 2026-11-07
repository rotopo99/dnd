// Item text for screens (inventory, equipment, shop, creation): stat lines, requirements, «(скоро)» for fields the
// engine does not support yet (`needs` in data/items/*), proficiency tier names.
import { t } from '../data/text/index.js';
import { WEAPON_TYPES } from '../data/items/weapons.js';
import { ARMOR_TYPES } from '../data/items/armor.js';
import { weaponTierFor, armorTierFor } from '../rules/equipment.js';
import { C } from './draw.js';
import { FACTIONS } from '../data/factions.js';
import { surfaceLines } from './tips.js';
import { QUALITY, MOD_SLOTS } from '../data/items/mods.js';
import { itemSize, modSlotTypes, modCapacity } from '../world/inventory.js';
import { SURFACES } from '../data/surfaces.js';
import { ITEMS } from '../data/index.js';

const sign = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v)}`;
export const weaponTypeName = (k) => WEAPON_TYPES[k]?.name || k;
export const armorTypeName = (k) => ARMOR_TYPES[k]?.name || k;
export const tierName = (n) => t(`prof.tier.${n}`);

/** One-line numbers of an item. */
export function itemStats(it) {
  if (!it) return '';
  if (it.slot === 'weapon') {
    const p = [`${it.dice} ${t(`dmg.${it.dmgType}`)}`, `${t('battle.range')} ${it.range}`];
    if (it.hit) p.push(`${t('item.hit')} ${sign(it.hit)}`);
    if (it.dmg) p.push(`${t('item.dmg')} ${sign(it.dmg)}`);
    if ((it.rof || 1) > 1) p.push(`${t('item.rof')} ${it.rof}${it.recoil ? ` (${t('item.recoil')} ${it.recoil})` : ''}`);
    if (it.ap) p.push(`${t('item.ap')} ${it.ap}`);
    if (it.twoHanded) p.push(t('item.twoHanded'));
    if (it.type) p.push(weaponTypeName(it.type));
    return p.join(' · ');
  }
  if (it.slot === 'armor') {
    const p = [`${t('res.kb')} +${it.kb || 0}`, armorTypeName(it.type)];
    const cap = it.dexCap ?? ARMOR_TYPES[it.type]?.dexCap;
    if (cap != null) p.push(`${t('stat.dex')} ≤ ${cap}`);
    if (it.stealthDis) p.push(t('item.stealthDis'));
    for (const [d, v] of Object.entries(it.resist || {})) p.push(`${t(`create.${v}`)}: ${t(`dmg.${d}`)}`);
    if (it.speed) p.push(`${t('create.speed')} ${sign(it.speed)}`);
    return p.join(' · ');
  }
  if (it.slot === 'mod') {
    const p = [];
    for (const k of ['hit', 'dmg', 'ap', 'rof', 'recoil', 'range', 'kb']) if (it[k]) p.push(`${t(`item.${k}`)} ${sign(it[k])}`);
    return `${t('item.mod')} (${t(`item.target.${it.target || 'weapon'}`)}): ${p.join(' · ') || '—'}`;
  }
  return it.desc || '';
}

/** «(скоро: …)» — a special property the engine does not run yet. */
export const soonNote = (it) => (it?.needs ? `${t('item.soon')}: ${it.needs}` : '');

/** Unmet stat requirements of an item for a creature: ['СИЛ 13'] (below — disadvantage / slower). */
export function unmetReq(it, u) {
  return Object.entries(it?.req || {}).filter(([k, v]) => typeof v === 'number' && (u?.stats?.[k] ?? 10) < v).map(([k, v]) => `${t(`stat.${k}`)} ${v}`);
}

/** Proficiency tier of a creature for an item (1 none — disadvantage, 2 can, 3 proficient, 4 mastery). */
export function itemTier(u, it) {
  const prof = u?.proficiencies;
  if (!prof || !it) return null;
  if (it.slot === 'weapon') return weaponTierFor(prof, it);
  if (it.slot === 'armor') return armorTierFor(prof, it);
  return null;
}

// ----------------------------------------------------------------------------- hover card (ui/tooltip.js spec)
const GLYPH = { weapon: '/', armor: '▣', offhand: '◫', mod: '+', consumable: '✚', pack: '▤' };
const GLYPH_COL = { weapon: 'c', armor: 'b', offhand: 'b', mod: 'a', consumable: 'j', pack: 'n' };
const surfName = (k) => SURFACES?.[k]?.name || k;

/** v7 mod lines: new fields (§3.4), what it fits, mount requirement. */
export function modLines(it) {
  const out = [];
  if (it.modSlot) out.push({ text: `${t('inv.modSlot')}: ${MOD_SLOTS[it.modSlot] || it.modSlot}`, color: '4' });
  const f = it.fits || {};
  const fit = [];
  if (f.group) fit.push(f.group.map((g) => t(`inv.group.${g}`)).join(', '));
  if (f.wtype) fit.push(f.wtype.map(weaponTypeName).join(', '));
  if (f.atype) fit.push(f.atype.map(armorTypeName).join(', '));
  if (f.rofMin) fit.push(`${t('item.rof')} ≥ ${f.rofMin}`);
  if (f.quality) fit.push(f.quality.map((q) => QUALITY[q]?.name || q).join(', '));
  out.push({ text: `${t('inv.fits')}: ${fit.join(' · ') || t(`inv.fitsAny.${it.target || 'weapon'}`)}`, color: '4' });
  const ex = [];
  if (it.speed) ex.push(`${t('create.speed')} ${sign(it.speed)}`);
  if (it.quick) ex.push(`${t('inv.quickSlots')} +${it.quick}`);
  if (it.ignoreSmoke) ex.push(t('inv.ignoreSmoke'));
  if (it.thorns) ex.push(`${t('inv.thorns')} ${it.thorns.dice} ${t(`dmg.${it.thorns.dmgType}`)}`);
  if (it.immuneSurface?.length) ex.push(`${t('inv.immuneSurface')}: ${it.immuneSurface.map(surfName).join(', ')}`);
  if (it.immuneStatus?.length) ex.push(`${t('inv.immuneStatus')}: ${it.immuneStatus.join(', ')}`);
  if (it.surfaceOnHit) ex.push(`${t(it.surfaceOnHit.on === 'crit' ? 'inv.surfaceOnCrit' : 'inv.surfaceOnHit')}: ${surfName(it.surfaceOnHit.kind)}`);
  if (ex.length) out.push({ text: ex.join(' · '), color: 'j' });
  if (it.req?.skill) out.push({ text: `🔒 ${t('inv.mount')}: ${t(`skill.${it.req.skill}`)} ${t('battle.dc')} ${it.req.dc}${it.req.tool ? ` + ${t('inv.tool')}` : ''}`, color: 'a' });
  return out;
}

function propText(k, v) {
  const name = t(`prop.${k}`);
  if (typeof v === 'number') return `${name} ${v}`;
  if (typeof v === 'string') return `${name} ${v}`;
  if (k === 'area' && v?.shape) return `${name}: ${t(`area.${v.shape}`)} ${v.size || 1}`;
  if (k === 'extra' && v?.dice) return `${name} ${v.dice}${v.dmgType ? ` ${t(`dmg.${v.dmgType}`)}` : ''}`;
  if (k === 'stigma' && v && typeof v === 'object') return `${name}: ${Object.entries(v).map(([f, d]) => `${factionLabel(f)} ${d}`).join(', ')}`;
  return name;
}
const factionLabel = (f) => FACTIONS[f]?.name || f;

const avg = (dice) => {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(String(dice || '').replace(/\s/g, ''));
  return m ? (Number(m[1]) * (Number(m[2]) + 1)) / 2 + Number(m[3] || 0) : 0;
};

/**
 * Tooltip spec for an item: glyph, name, type, numbers, properties, effect, price, requirements and comparison
 * with the equipped item of the same slot. o: { u (creature — requirements and tier), equipped (item), price, have }.
 */
export function itemTip(it, o = {}) {
  if (!it) return null;
  const lines = [];
  const slot = it.slot || 'consumable';
  const q = o.q && QUALITY[o.q] && it.quality !== 'relic' ? QUALITY[o.q] : null;
  const type = slot === 'weapon' ? `${t('gear.slot.weapon')} · ${weaponTypeName(it.type)}${it.twoHanded ? ` · ${t('item.twoHanded')}` : ''}`
    : slot === 'armor' ? `${t('gear.slot.armor')} · ${armorTypeName(it.type)}`
    : slot === 'mod' ? `${t('item.mod')} · ${t(`item.target.${it.target || 'weapon'}`)}`
    : slot === 'offhand' ? `${t('gear.slot.offhand')}${it.kind ? ` · ${t(`inv.offKind.${it.kind}`)}` : ''}`
    : slot === 'pack' ? t('gear.slot.pack')
    : it.kind ? `${t('tip.consumable')} · ${t(`item.kind.${it.kind}`)}` : t(it.price ? 'tip.misc' : 'tip.quest');
  lines.push({ text: type, color: '4' });
  if (q && o.q !== 'working') {
    const qm = [q.hit ? `${t('item.hit')} ${sign(q.hit)}` : '', q.dmg ? `${t('item.dmg')} ${sign(q.dmg)}` : '', q.kb && slot !== 'weapon' ? `${t('res.kb')} ${sign(q.kb)}` : ''].filter(Boolean);
    lines.push({ text: `${t('inv.quality')}: ${q.name}${qm.length ? ` (${qm.join(', ')})` : ''}`, color: o.q === 'junk' ? 'n' : 'b' });
  }
  if (slot === 'offhand' && it.kind === 'shield') lines.push({ text: `${t('res.kb')} +${(it.kb || 0) + (q && it.kb ? q.kb || 0 : 0)}`, color: 'h', font: 'bold 22px monospace' });
  if (slot === 'offhand' && it.offAction) {
    const a = it.offAction;
    lines.push({ text: `${t('inv.offAction')}: ${a.name} — ${t(`act.${a.action || 'bonus'}`)}${a.dice ? `, ${a.dice} ${t(`dmg.${a.dmgType}`)}` : ''}, ${t('battle.range')} ${a.range}${a.usesPerBattle ? `, ${a.usesPerBattle} ${t('inv.perBattle')}` : ''}`, color: 'j' });
  }
  if (slot === 'pack') lines.push({ text: `${t('inv.grid')}: ${it.grid[0]}×${it.grid[1]}${it.quick ? ` · ${t('inv.quickSlots')} +${it.quick}` : ''}`, color: '5' });
  if (it.quick && slot === 'armor') lines.push({ text: `${t('inv.quickSlots')}: ${it.quick}`, color: 'j' });
  if (slot === 'weapon') {
    lines.push({ text: `${t('tip.dice')}: ${it.dice}${it.dmg ? ` ${sign(it.dmg)}` : ''} ${t(`dmg.${it.dmgType}`)} · ${t('battle.range')} ${it.range || 1}${it.hit ? ` · ${t('item.hit')} ${sign(it.hit)}` : ''}`, color: '5' });
    const ex = [];
    if ((it.rof || 1) > 1) ex.push(`${t('item.rof')} ${it.rof}${it.recoil ? ` (${t('item.recoil')} ${it.recoil})` : ''}`);
    if (it.ap) ex.push(`${t('item.ap')} ${it.ap}`);
    if (ex.length) lines.push({ text: ex.join(' · '), color: '5' });
  } else if (slot === 'armor' || slot === 'offhand') {
    const p = slot === 'offhand' ? [] : [`${t('res.kb')} +${it.kb || 0}`]; // shield KB — the big line above
    const cap = it.dexCap ?? ARMOR_TYPES[it.type]?.dexCap;
    if (cap != null) p.push(`${t('stat.dex')} ≤ ${cap}`);
    if (it.speed) p.push(`${t('create.speed')} ${sign(it.speed)}`);
    if (it.stealthDis) p.push(t('item.stealthDis'));
    if (p.length) lines.push({ text: p.join(' · '), color: '5' });
    const rs = Object.entries(it.resist || {});
    if (rs.length) lines.push({ text: rs.map(([d, v]) => `${t(`create.${v}`)}: ${t(`dmg.${d}`)}`).join(' · '), color: 'b' });
  } else if (slot === 'mod') { lines.push({ text: itemStats(it), color: '5' }); lines.push(...modLines(it)); }
  // v7: installed mods and capacity, grid size
  const types = modSlotTypes(it);
  if (types.length) {
    const mods = o.mods || [];
    const cap = modCapacity(it, o.q || 'working');
    lines.push({ text: `${t('inv.slots')}: ${mods.length}/${cap} (${types.map((x) => MOD_SLOTS[x] || x).join(', ')})`, color: '4' });
    if (mods.length) lines.push({ text: `${t('inv.mods')}: ${mods.map((m) => ITEMS[m]?.name || m).join(', ')}`, color: 'a' });
  }
  if (o.size !== false) { const [w, h] = itemSize(it); lines.push({ text: `${t('inv.size')}: ${w}×${h}`, color: '3' }); }
  const props = Object.entries(it.props || {}).filter(([k, v]) => v && k !== 'ap');
  if (props.length) lines.push({ text: `${t('tip.props')}: ${props.map(([k, v]) => propText(k, v)).join(', ')}`, color: 'a' });
  const eff = it.battle?.desc || (it.field?.heal ? `+${it.field.heal.dice}${it.field.heal.bonus ? `+${it.field.heal.bonus}` : ''} ${t(`res.${it.field.heal.resource === 'mrl' ? 'mrl' : 'hp'}`)}` : '');
  if (eff) lines.push({ text: `${t('tip.effect')}: ${eff}`, color: 'j' });
  if (slot === 'consumable' && (it.effects || it.trap || it.surface)) lines.push(...surfaceLines({ surface: it.surface, effects: [...(it.effects || []), ...(it.trap?.effects || [])] }));
  if (it.desc && it.desc !== eff) lines.push({ text: it.desc, color: '4' });
  const soon = soonNote(it);
  if (soon) lines.push({ text: soon, color: 'a' });
  const req = Object.entries(it.req || {}).filter(([, v]) => typeof v === 'number');
  if (req.length) {
    const unmet = unmetReq(it, o.u);
    lines.push({ text: `${t('tip.req')}: ${req.map(([k, v]) => `${t(`stat.${k}`)} ${v}`).join(', ')}${unmet.length ? ` — ${t('gear.reqPenalty')}` : ''}`, color: unmet.length ? 'c' : '4' });
  }
  const tier = o.u && o.tier !== false ? itemTier(o.u, it) : null;
  if (tier != null) lines.push({ text: `${t('prof.tier')} ${tier}: ${tierName(tier)}`, color: tier <= 1 ? 'c' : '4' });
  const price = o.price ?? it.price;
  if (price) lines.push({ text: `${t('tip.price')}: ${price}${o.have != null ? ` · ${t('loc.have')} ${o.have}` : ''}`, color: 'b' });
  // comparison with what is worn in the same slot
  const eq = o.equipped;
  if (eq && eq !== it && eq.slot === it.slot) {
    lines.push({ text: '' });
    lines.push({ text: `${t('tip.worn')}: ${eq.name}`, color: '4' });
    const cmp = (label, a, b) => {
      if (a === b) return;
      lines.push({ text: `${label}: ${a} → ${b}`, color: b > a ? 'j' : 'c' });
    };
    if (slot === 'weapon') {
      cmp(t('tip.avgDmg'), avg(eq.dice) + (eq.dmg || 0), avg(it.dice) + (it.dmg || 0));
      cmp(t('item.hit'), eq.hit || 0, it.hit || 0);
      cmp(t('battle.range'), eq.range || 1, it.range || 1);
    } else if (slot === 'armor' || slot === 'offhand') cmp(t('res.kb'), eq.kb || 0, it.kb || 0);
  }
  return { title: q && o.q !== 'working' ? `${it.name} (${q.name})` : it.name, glyph: { ch: GLYPH[slot] || '?', color: C[GLYPH_COL[slot] || '4'] }, lines };
}
