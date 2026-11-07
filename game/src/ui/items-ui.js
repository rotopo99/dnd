// Item text for screens (inventory, equipment, shop, creation): stat lines, requirements, «(скоро)» for fields the
// engine does not support yet (`needs` in data/items/*), proficiency tier names.
import { t } from '../data/text/index.js';
import { WEAPON_TYPES } from '../data/items/weapons.js';
import { ARMOR_TYPES } from '../data/items/armor.js';
import { weaponTierFor, armorTierFor } from '../rules/equipment.js';
import { C } from './draw.js';
import { FACTIONS } from '../data/factions.js';

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
const GLYPH = { weapon: '/', armor: '▣', offhand: '◫', mod: '+', consumable: '✚' };
const GLYPH_COL = { weapon: 'c', armor: 'b', offhand: 'b', mod: 'a', consumable: 'j' };

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
  const type = slot === 'weapon' ? `${t('gear.slot.weapon')} · ${weaponTypeName(it.type)}${it.twoHanded ? ` · ${t('item.twoHanded')}` : ''}`
    : slot === 'armor' ? `${t('gear.slot.armor')} · ${armorTypeName(it.type)}`
    : slot === 'mod' ? `${t('item.mod')} · ${t(`item.target.${it.target || 'weapon'}`)}`
    : slot === 'offhand' ? t('gear.slot.offhand')
    : it.kind ? `${t('tip.consumable')} · ${t(`item.kind.${it.kind}`)}` : t(it.price ? 'tip.misc' : 'tip.quest');
  lines.push({ text: type, color: '4' });
  if (slot === 'weapon') {
    lines.push({ text: `${t('tip.dice')}: ${it.dice}${it.dmg ? ` ${sign(it.dmg)}` : ''} ${t(`dmg.${it.dmgType}`)} · ${t('battle.range')} ${it.range || 1}${it.hit ? ` · ${t('item.hit')} ${sign(it.hit)}` : ''}`, color: '5' });
    const ex = [];
    if ((it.rof || 1) > 1) ex.push(`${t('item.rof')} ${it.rof}${it.recoil ? ` (${t('item.recoil')} ${it.recoil})` : ''}`);
    if (it.ap) ex.push(`${t('item.ap')} ${it.ap}`);
    if (ex.length) lines.push({ text: ex.join(' · '), color: '5' });
  } else if (slot === 'armor' || slot === 'offhand') {
    const p = [`${t('res.kb')} +${it.kb || 0}`];
    const cap = it.dexCap ?? ARMOR_TYPES[it.type]?.dexCap;
    if (cap != null) p.push(`${t('stat.dex')} ≤ ${cap}`);
    if (it.speed) p.push(`${t('create.speed')} ${sign(it.speed)}`);
    if (it.stealthDis) p.push(t('item.stealthDis'));
    lines.push({ text: p.join(' · '), color: '5' });
    const rs = Object.entries(it.resist || {});
    if (rs.length) lines.push({ text: rs.map(([d, v]) => `${t(`create.${v}`)}: ${t(`dmg.${d}`)}`).join(' · '), color: 'b' });
  } else if (slot === 'mod') lines.push({ text: itemStats(it), color: '5' });
  const props = Object.entries(it.props || {}).filter(([k, v]) => v && k !== 'ap');
  if (props.length) lines.push({ text: `${t('tip.props')}: ${props.map(([k, v]) => propText(k, v)).join(', ')}`, color: 'a' });
  const eff = it.battle?.desc || (it.field?.heal ? `+${it.field.heal.dice}${it.field.heal.bonus ? `+${it.field.heal.bonus}` : ''} ${t(`res.${it.field.heal.resource === 'mrl' ? 'mrl' : 'hp'}`)}` : '');
  if (eff) lines.push({ text: `${t('tip.effect')}: ${eff}`, color: 'j' });
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
  return { title: it.name, glyph: { ch: GLYPH[slot] || '?', color: C[GLYPH_COL[slot] || '4'] }, lines };
}
