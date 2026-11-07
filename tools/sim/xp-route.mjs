// Темп опыта «средним маршрутом» (docs/specs/levels-20.md, «Мир 6–20»): регионы по порядку, в каждом —
// все свободные бои узлов (1 раз) + N случайных встреч по таблице региона + доля квестов региона.
// Usage: node tools/sim/xp-route.mjs [--rand 6] [--quests 0.7] [--stops 1]  (--stops 0 = все узлы с боями/квестами)
import { GAME_DATA } from '../../game/src/data/index.js';
import { LOCATIONS } from '../../game/src/data/world/locations.js';
import { REGIONS } from '../../game/src/data/world/regions.js';
import { ENCOUNTER_TABLES } from '../../game/src/data/world/travel.js';
import { QUESTS_V3 } from '../../game/src/data/world/quests-v3.js';
import { QUESTS as Q1 } from '../../game/src/data/world/quests.js';
import { QUESTS_NPC } from '../../game/src/data/world/quests-npc.js';
import { XP_THRESHOLDS, levelForXp, battleXp, questXp } from '../../game/src/rules/progression.js';
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const RAND = opt('--rand', 6), QSHARE = opt('--quests', 0.7);
const encXp = (id) => { const e = GAME_DATA.ENCOUNTERS[id]; return e ? battleXp(e.enemies, GAME_DATA) : 0; };
const ORDER = ['harmony', 'neutralVillages', 'tinBrotherhood', 'pirates', 'mutantsBeast', 'scavengers', 'agrozone', 'mutantsPlant', 'tekhonki', 'mechanids',
  'renegades', 'wilds', 'warprom', 'cringegons', 'aiParty', 'cult'];
const quests = Object.values({ ...Q1, ...QUESTS_V3, ...QUESTS_NPC });
const alias = { villages: 'neutralVillages', corruption: 'aiParty' };
let xp = 350; // пролог
console.log(`region          levels   nodeXP  randXP  questXP  total   → level`);
for (const r of ORDER) {
  let node = 0, rnd = 0, qx = 0;
  const seen = new Set();
  for (const l of Object.values(LOCATIONS)) {
    if (l.aliasOf || l.region !== r) continue;
    for (const b of l.battles) if (!seen.has(b.id) && b.when !== 'quest') { seen.add(b.id); node += encXp(b.encounter); }
  }
  const t = (ENCOUNTER_TABLES[r] || []); const tw = t.reduce((s, e) => s + e.w, 0) || 1;
  const bs = t.filter((e) => e.kind === 'battle'); rnd = RAND * bs.reduce((s, e) => s + (e.w / tw) * encXp(e.encounter), 0);
  for (const q of quests) if ((alias[q.region] || q.region) === r) qx += questXp(q) * QSHARE;
  xp += node + rnd + qx;
  console.log(`${r.padEnd(15)} ${REGIONS[r].levels.join('–').padEnd(7)} ${String(Math.round(node)).padStart(7)} ${String(Math.round(rnd)).padStart(7)} ${String(Math.round(qx)).padStart(8)} ${String(Math.round(xp)).padStart(7)}   → ${levelForXp(xp)}`);
}
console.log('threshold L5/10/15/20:', [5, 10, 15, 20].map((l) => XP_THRESHOLDS[l - 1]).join(' / '));

// ---- Дни «базового маршрута» B (docs/specs/third-exodus.md §1): регионы в том же порядке, внутри — жадно к ближайшей
// остановке (узел с боями/квестами; районы узла = одна остановка, 0 дней), кратчайшие пути по ROUTES (без скрытых),
// +1 день отдыха на остановку; в конце — к `cc-node`. T0 = ceil5(B × 1.2).
const { ROUTES } = await import('../../game/src/data/world/travel.js');
const { START_LOCATION } = await import('../../game/src/data/world/locations.js');
const adj = {};
for (const r of ROUTES) if (!r.hidden) { (adj[r.from] ||= []).push([r.to, r.days, r.kind]); (adj[r.to] ||= []).push([r.from, r.days, r.kind]); }
const groupOf = {};
for (const id of Object.keys(LOCATIONS)) if (!LOCATIONS[id].aliasOf && !groupOf[id]) {
  const st = [id]; groupOf[id] = id;
  while (st.length) for (const [o, , k] of adj[st.pop()] || []) if (k === 'district' && !groupOf[o]) { groupOf[o] = id; st.push(o); }
}
const dij = (from) => {
  const d = { [from]: 0 }, h = { [from]: 0 }, open = [from];
  while (open.length) { open.sort((a, b) => d[a] - d[b]); const c = open.shift();
    for (const [o, w, k] of adj[c] || []) { const nd = d[c] + w + 0.001; if (d[o] == null || nd < d[o]) { d[o] = nd; h[o] = h[c] + (k === 'district' ? 0 : 1); open.push(o); } } }
  return { d, h };
};
const PER = opt('--stops', 1); // остановок на регион (0 = все)
let pos = START_LOCATION, days = 0, hops = 0, stops = 0;
const isStop = (l) => l.battles.some((b) => b.when !== 'quest') || l.quests.length;
for (const r of [...ORDER, 'final']) {
  const left = new Set(r === 'final' ? [groupOf['cc-node']]
    : Object.values(LOCATIONS).filter((l) => !l.aliasOf && l.region === r && isStop(l)).map((l) => groupOf[l.id]));
  let n = 0;
  while (left.size && (r === 'final' || !PER || n++ < PER)) {
    const { d, h } = dij(pos);
    let best = null; for (const g of left) if (d[g] != null && (!best || d[g] < d[best])) best = g;
    if (!best) { console.warn('unreachable', [...left]); break; }
    left.delete(best); days += Math.round(d[best]); hops += h[best]; pos = best;
    if (r !== 'final') { stops++; days += 1; }
  }
}
const ceil5 = (x) => Math.ceil(x / 5) * 5;
console.log(`B (days route): ${days} days = travel ${days - stops} + rest ${stops}; stops ${stops}, hops ${hops}; T0 = ceil5(B×1.2) = ${ceil5(days * 1.2)}`);
