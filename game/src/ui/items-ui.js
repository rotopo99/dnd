// Item text for screens (inventory, equipment, shop, creation): stat lines, requirements, «(скоро)» for fields the
// engine does not support yet (`needs` in data/items/*), proficiency tier names.
import { t } from '../data/text/index.js';
import { WEAPON_TYPES } from '../data/items/weapons.js';
import { ARMOR_TYPES } from '../data/items/armor.js';
import { weaponTierFor, armorTierFor } from '../rules/equipment.js';

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
