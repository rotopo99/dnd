// «Третий исход» на дорогах (third-exodus.md §1, метки 2–5): какие бои эскалации добавить в таблицу встреч региона.
// Без импорта state.js (его зовёт state.pickEncounter): метка — save.exodus.mark, выключена флагами остановки.
import { EXODUS } from '../data/world/exodus.js';
import { REGIONS } from '../data/world/regions.js';
import { ENCOUNTERS_EXODUS } from '../data/enemies-exodus.js';

/** Current escalation mark (0 — no timer / stopped). */
export const roadMark = (save) => (save?.exodus && !EXODUS.stopFlags.some((f) => save.flags?.[f]) ? save.exodus.mark || 0 : 0);

/**
 * Escalation battles for a region's encounter table at the current mark.
 * → { list: [{ w, kind: 'battle', encounter, faction: 'cult', exodus: true }], only: bool } (only — the table is replaced).
 */
export function exodusRoad(save, region) {
  const m = roadMark(save);
  const cfg = EXODUS.roads?.[Math.min(5, m)];
  if (!cfg || !REGIONS[region]) return { list: [], only: false };
  const top = REGIONS[region].levels?.[1] || 0;
  const list = [];
  const add = (w, id) => { if (w > 0 && ENCOUNTERS_EXODUS[id]) list.push({ w, kind: 'battle', encounter: id, faction: 'cult', exodus: true }); };
  if (cfg.cult && top >= (cfg.cult.minLevel || 0)) add(cfg.cult.w, `x-cult-${region}-${cfg.cult.size || 1}`);
  if (cfg.revenant) add(cfg.revenant.w, `x-revenant-${region}`);
  return { list, only: !!cfg.onlyCult?.includes(region) && list.length > 0 };
}
