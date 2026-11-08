// Player base — Lis bunker (world-consequences.md ч.3) over data/world/base.js. Logic only, no DOM.
// save.base = { mods: { id: level }, queue: { id, level, ready } | null, openDay, lastVisit, lastCheck, fuelDay,
//   raid: { ev, day, until } | null, custom: { id: true | choice }, customDay: { id: day }, upgraded: [instKey], log: [] }.
// Opening: quest sq-galina-hatch done and turned in (or flag base-open) → syncBase sets base-open, gives the gift,
// opens the hidden route. Modules with `needs: ['generator']` work only while the generator supplies enough power.
// Building takes credits + materials (bags, then stash) now; the level is ready after cost.days (baseTick).
// Raids: baseTick rolls once per checkEveryDays of absence after graceDays; the raid waits defendDays for the party
// (defence battle in the base scene), then auto-resolves: d20 + defence vs dcBase + region level.
import { BASE_LOCATION, BASE_UNLOCK, BASE_MODULES, BASE_CUSTOM, BASE_ATTACKS as BA, BASE_TEXT } from '../data/world/base.js';
import { GUARDS, GUARD_FALLBACK } from '../data/world/crime.js';
import { LOCATIONS, REGIONS, ITEMS } from './data.js';
import { countAll, takeItem, addInst, makeInst, syncItems, refreshView } from './inventory.js';
import { applyRep } from './reputation.js';
import { addLoyalty } from './companions.js';

export const MODULE_IDS = Object.keys(BASE_MODULES);
export const BASE_LOC = BASE_LOCATION;
const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

export const baseOpen = (save) => !!save?.flags?.[BASE_UNLOCK.openOn.flag];
export const lisOnline = (save) => !!save?.flags?.[BASE_UNLOCK.lisOn.flag];
export const atBase = (save) => baseOpen(save) && save.location === BASE_LOCATION;

/** save.base, created on first use. */
export function baseState(save) {
  if (!save.base) {
    save.base = { mods: {}, queue: null, openDay: save.day, lastVisit: save.day, lastCheck: save.day, fuelDay: save.day,
      raid: null, custom: {}, customDay: {}, upgraded: [], log: [] };
    for (const id of BASE_UNLOCK.freeModules) save.base.mods[id] = 1;
  }
  return save.base;
}

/** Open the base once the hatch quest is done and turned in. → toasts [{text, color}]. */
export function syncBase(save) {
  const q = save.quests?.[BASE_UNLOCK.openOn.quest];
  if (!baseOpen(save) && q?.state === 'done' && !q.turnin) save.flags[BASE_UNLOCK.openOn.flag] = true;
  if (!baseOpen(save) || save.flags['base-gift']) return [];
  save.flags['base-gift'] = true;
  baseState(save);
  for (const k of ['discovered']) if (save[k] && !save[k].includes(BASE_LOCATION)) save[k].push(BASE_LOCATION);
  save.flags['galina-told'] = true; // the hidden trail to the hatch stays open
  syncItems(save);
  for (const it of BASE_UNLOCK.firstGift.items) if (ITEMS[it.id]) addInst(save, makeInst(it.id), it.n);
  save.hero.credits += BASE_UNLOCK.firstGift.credits || 0;
  refreshView(save);
  return [{ text: BASE_TEXT.open, color: 'h' }, { text: BASE_UNLOCK.firstGift.text, color: '5' }];
}

export const modLevel = (save, id) => (save.base?.mods?.[id] || 0);
const lvDef = (id, n) => BASE_MODULES[id]?.levels[n - 1] || null;

/** Power supply: generator level (0 without fuel), use: sum of built modules' power. */
export function power(save) {
  const g = modLevel(save, 'generator');
  const supply = g && !save.base?.noFuel ? lvDef('generator', g).fx.supply : 0;
  let use = 0;
  for (const id of MODULE_IDS) { const n = modLevel(save, id); if (n) use += lvDef(id, n).power || 0; }
  return { supply, use, ok: use <= supply };
}

/** Does a module work: built, and (needs generator) the generator runs with enough power. → { ok, why }. */
export function modActive(save, id) {
  if (!baseOpen(save) || !modLevel(save, id)) return { ok: false, why: 'none' };
  if ((BASE_MODULES[id].needs || []).includes('generator')) {
    if (!modLevel(save, 'generator')) return { ok: false, why: BASE_TEXT.powerLack };
    const p = power(save);
    if (!p.supply || !p.ok) return { ok: false, why: BASE_TEXT.powerLack };
  }
  return { ok: true, level: modLevel(save, id) };
}
/** fx of the active level (merged over levels 1..n) or null. */
export function modFx(save, id) {
  const a = modActive(save, id);
  if (!a.ok) return null;
  return Object.assign({}, ...BASE_MODULES[id].levels.slice(0, a.level).map((l) => l.fx));
}

/** Next level info: { id, level, max, next, cost, power, rows: [{id, need, have}], ok, why }. */
export function buildInfo(save, id) {
  const m = BASE_MODULES[id];
  const level = modLevel(save, id), max = m.levels.length;
  const out = { id, level, max, next: level + 1, cost: null, rows: [], ok: false, why: null };
  if (level >= max) { out.why = 'max'; return out; }
  const L = lvDef(id, level + 1);
  out.cost = L.cost; out.power = L.power || 0; out.note = L.fx.note;
  const have = countAll(save);
  out.rows = L.cost.items.map((it) => ({ id: it.id, need: it.n, have: have[it.id] || 0 }));
  const B = save.base || {};
  if (B.queue) out.why = 'busy';
  else if (L.fx.needsFlag && !save.flags[L.fx.needsFlag]) out.why = 'lis';
  else if (save.hero.credits < L.cost.credits) out.why = 'credits';
  else if (out.rows.some((r) => r.have < r.need)) out.why = 'items';
  out.ok = !out.why;
  return out;
}

/** Pay and queue the next level. → { ok, why, ready }. */
export function startBuild(save, id) {
  const info = buildInfo(save, id);
  if (!info.ok) return { ok: false, why: info.why };
  const B = baseState(save);
  syncItems(save);
  save.hero.credits -= info.cost.credits;
  for (const r of info.rows) takeItem(save, r.id, r.need);
  refreshView(save);
  const days = info.cost.days || 0;
  if (!days) { B.mods[id] = info.next; return { ok: true, ready: save.day, done: true }; }
  B.queue = { id, level: info.next, ready: save.day + days };
  return { ok: true, ready: B.queue.ready };
}

/** Customisation: buy once (choice for lis-voice). → { ok, why }. */
export function buyCustom(save, id, choice = null) {
  const c = BASE_CUSTOM.find((x) => x.id === id);
  const B = baseState(save);
  if (!c) return { ok: false, why: 'none' };
  if (c.needsFlag && !save.flags[c.needsFlag]) return { ok: false, why: 'lis' };
  if (B.custom[id] && !choice) return { ok: false, why: 'owned' };
  if (!B.custom[id]) {
    if (save.hero.credits < c.cost) return { ok: false, why: 'credits' };
    save.hero.credits -= c.cost;
  }
  B.custom[id] = choice || true;
  B.customDay[id] = save.day;
  return { ok: true };
}
export const hasCustom = (save, id) => !!save.base?.custom?.[id];

/** Defence value: module + Military (applied in the battle window) is not here. */
export const defenseValue = (save) => (modActive(save, 'defense').ok ? modFx(save, 'defense').defense || 0 : 0);

/** Raid chance of one check (0..1). */
export function raidChance(save) {
  const M = BA.mods;
  const heat = Math.max(0, ...Object.values(save.wanted || {}).map((w) => w?.heat || 0));
  let p = BA.baseChance;
  if (heat >= 4) p += M.wantedHeat4; else if (heat >= 3) p += M.wantedHeat3;
  p += (save.exodus?.mark || 0) * M.exodusMark;
  p += defenseValue(save) * M.defensePer;
  if (lisOnline(save)) p += M.lisOnline;
  return Math.max(0, Math.min(1, p));
}

/** Pick a raid event (weights; `onlyIf: 'wanted>=3'`). Encounter 'by-wanted' → the hottest faction's guards. */
export function pickRaid(save, rng = Math.random) {
  const heatOf = Object.entries(save.wanted || {}).sort((a, b) => (b[1]?.heat || 0) - (a[1]?.heat || 0))[0];
  const heat = heatOf?.[1]?.heat || 0;
  const list = BA.events.filter((e) => !e.onlyIf || (e.onlyIf === 'wanted>=3' && heat >= 3));
  const total = list.reduce((s, e) => s + e.w, 0);
  let r = rng() * total;
  let ev = list[list.length - 1];
  for (const e of list) { r -= e.w; if (r < 0) { ev = e; break; } }
  const encounter = ev.encounter === 'by-wanted' ? GUARDS[heatOf?.[0]] || GUARD_FALLBACK : ev.encounter;
  return { ...ev, encounter };
}

/**
 * Time passes for the base (call on arrival / rest / map). Completes the build queue, burns fuel, garden,
 * raid checks while away, auto-resolves an expired raid. → toasts.
 */
export function baseTick(save, rng = Math.random) {
  if (!baseOpen(save)) return [];
  const B = baseState(save);
  const out = [];
  const here = save.location === BASE_LOCATION;
  if (B.queue && save.day >= B.queue.ready) {
    B.mods[B.queue.id] = B.queue.level;
    out.push({ text: fmt(BASE_TEXT.upgradeDone, { module: BASE_MODULES[B.queue.id].name, n: B.queue.level }), color: 'j' });
    B.queue = null;
  }
  // fuel: one item per perDays of base time; none → no power
  const g = modLevel(save, 'generator');
  if (g) {
    const fuel = lvDef('generator', g).fx.fuel;
    while (save.day - B.fuelDay >= fuel.perDays) {
      B.fuelDay += fuel.perDays;
      syncItems(save);
      B.noFuel = takeItem(save, fuel.item, 1) < 1;
      refreshView(save);
    }
  } else B.fuelDay = save.day;
  // garden etc.: customisations with { item, everyDays } put items into the stash
  for (const c of BASE_CUSTOM) {
    if (!B.custom[c.id] || !c.fx.item || !c.fx.everyDays) continue;
    while (save.day - (B.customDay[c.id] ?? save.day) >= c.fx.everyDays) { B.customDay[c.id] += c.fx.everyDays; addInst(save, makeInst(c.fx.item), 1, { overflow: 'stash' }); }
  }
  // raid checks while away
  if (here) { B.lastVisit = save.day; B.lastCheck = save.day; }
  while (!here && B.lastCheck < save.day) {
    B.lastCheck++;
    const d = B.lastCheck;
    if (B.raid || d - B.openDay < BA.graceDays || (d - B.lastVisit) % BA.checkEveryDays !== 0) continue;
    if (rng() >= raidChance(save)) continue;
    const ev = pickRaid(save, rng);
    B.raid = { ev, day: d, until: d + BA.defendDays };
    if (modFx(save, 'radio')?.warning) out.push({ text: fmt(BASE_TEXT.attackWarn, { name: ev.name }), color: 'c' });
  }
  if (B.raid && !here && save.day > B.raid.until) out.push(...autoResolve(save, rng));
  return out;
}

/** Region level for the auto-resolve DC. */
const regionLevel = () => REGIONS[LOCATIONS[BASE_LOCATION]?.region]?.levels?.[1] || 1;

/** Lower one random built module by 1 (stash never below 1). → module id | null. */
export function loseModule(save, rng = Math.random) {
  const B = baseState(save);
  const ids = MODULE_IDS.filter((id) => B.mods[id] > (BASE_UNLOCK.freeModules.includes(id) ? 1 : 0));
  if (!ids.length) return null;
  const id = ids[Math.floor(rng() * ids.length)];
  B.mods[id]--;
  return id;
}

/** Nobody came: d20 + defence vs DC. → toasts; result in save.base.lastRaid { result, lost, credits }. */
export function autoResolve(save, rng = Math.random) {
  const B = baseState(save);
  const ev = B.raid?.ev;
  B.raid = null;
  if (!ev) return [];
  const roll = 1 + Math.floor(rng() * 20);
  const total = roll + defenseValue(save), dc = BA.autoResolve.dcBase + regionLevel();
  const res = total >= dc ? 'win' : total >= dc - BA.partMargin ? 'part' : 'fail';
  return raidLoss(save, ev, res, rng, `d20 ${roll} + ${total - roll} = ${total} / ${dc}`);
}

function raidLoss(save, ev, res, rng, rollText = '') {
  const B = baseState(save);
  const out = [{ text: `${ev.name}: ${BA.autoResolve[res].loss}${rollText ? ` (${rollText})` : ''}`, color: res === 'win' ? 'j' : 'c' }];
  let lost = null, credits = 0;
  if (res !== 'win') {
    lost = loseModule(save, rng);
    if (lost) out.push({ text: fmt(BASE_TEXT.attackLost, { module: BASE_MODULES[lost].name }), color: 'c' });
  }
  if (res === 'fail') {
    credits = Math.floor(save.hero.credits * BA.lossCredits);
    save.hero.credits -= credits;
  }
  B.lastRaid = { id: ev.id, result: res, lost, credits, day: save.day };
  B.log.push(B.lastRaid);
  return out;
}

/** The defence battle ended. → toasts. */
export function defendResult(save, won, rng = Math.random) {
  const B = baseState(save);
  const ev = B.raid?.ev;
  B.raid = null;
  if (!ev) return [];
  const out = [];
  const companions = (save.party || []).filter((p) => p.state === 'active' || p.state === 'waiting');
  if (won) {
    for (const [f, d] of Object.entries(BA.winRep)) applyRep(save, f, d);
    for (const p of companions) addLoyalty(save, p.npc, BA.winLoyalty);
    B.lastRaid = { id: ev.id, result: 'defended', day: save.day };
    B.log.push(B.lastRaid);
    out.push({ text: `${ev.name}: ${BA.lisReaction[2]}`, color: 'j' });
    return out;
  }
  for (const p of companions) addLoyalty(save, p.npc, BA.loseLoyalty);
  return raidLoss(save, ev, 'fail', rng);
}

/** Allies for the defence battle: one turret per `turrets` of the defence module. */
export function defenseAllies(save) {
  const n = modActive(save, 'defense').ok ? modFx(save, 'defense').turrets || 0 : 0;
  return Array(n).fill(BA.turretAlly);
}

/** Rest at the base: medbay heal / withdrawal / soul, quarters loyalty, vinyl. → { frac, keepWithdrawal, toasts, revive }. */
export function baseRestPlan(save) {
  const med = modFx(save, 'medbay');
  const q = modFx(save, 'quarters');
  const plan = { frac: med ? med.restHeal : BA.restNoMedbay, keepWithdrawal: !med?.withdrawalClear, revive: !!med?.reviveSoul, medkits: med?.freeMedkitPerRest || 0, loyalty: [] };
  const per = (q?.restLoyalty || 0) + (hasCustom(save, 'vinyl') ? BASE_CUSTOM.find((c) => c.id === 'vinyl').fx.restLoyalty : 0);
  if (per) {
    const rooms = q?.rooms ?? 0;
    const list = (save.party || []).filter((p) => p.state === 'active' || p.state === 'waiting').slice(0, rooms || (q ? 0 : 99));
    for (const p of list) plan.loyalty.push({ npc: p.npc, d: per });
  }
  return plan;
}

/** Radio level 1+: «return» turn-ins can be claimed from anywhere. */
export const radioTurnin = (save) => !!modFx(save, 'radio')?.turninRadio;
/** Workbench: mods without a check. */
export const benchNoCheck = (save) => atBase(save) && modFx(save, 'workbench')?.modInstall === 'noCheck';
