// Errands of the reserve (docs/specs/expeditions.md, data data/world/expeditions.js). Logic without DOM.
// A waiting companion at his idleHome is sent: p.exp = { type, target, start, days, mode, dc, bonus, skill }.
// passDays (exodus.js) → expTick: when save.day ≥ start + days the roll is made, rewards granted, p.expResult kept
// for the «Вернулся» window (location.js); wounded → p.expBusy (day), captive → p.expCaptive { region, until }, dead → state 'cyberspace'.
import { EXP_RULES, EXP_DC, EXP_TYPES, AUTOABLE_QUESTS, EXP_OUTCOMES, EXP_DANGER_GATE, EXP_LOOT, EXP_LOYALTY, EXP_FLAGS } from '../data/world/expeditions.js';
import { COMPANION_RULES } from '../data/companions.js';
import { REGIONS } from '../data/world/regions.js';
import { LOCATIONS, ROUTES } from '../data/world/locations.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { NPCS } from '../data/npcs.js';
import { t } from '../data/text/index.js';
import { QUESTS, sameLocation, resolveLocation, ENCOUNTER_TABLES } from './data.js';
import { grant, journal, tf, buildCompanion, openHidden, routesFrom, otherEnd, deed } from './state.js';
import { checkInfo, checkChance, hasWorldFlag } from './checks.js';
import { idleHome, loyaltyBand, partyEntry } from './companions.js';
import { adjustApproval } from './state.js';
import { mutate, instValue } from './inventory.js';
import { stageOf } from './quests.js';
import { GAME_DATA } from '../data/index.js';

const name = (p) => NPCS[p.npc]?.name || p.npc;
export const MODES = ['careful', 'normal', 'risky'];
const modeOf = (m) => EXP_RULES[m] || EXP_RULES.normal;

/** Companions out on an errand (or captive). */
export const expActive = (save) => save.party.filter((p) => p.exp);
/** Busy companion (errand / wounded rest / captive) → reason text or null. */
export function expBusy(save, p) {
  if (p.exp) return tf('exp.busyAway', { n: Math.max(0, p.exp.start + p.exp.days - save.day) });
  if (p.expCaptive) return tf('exp.busyCaptive', { region: REGIONS[p.expCaptive.region]?.name || '' });
  if (p.expBusy > save.day) return tf('exp.busyWounded', { n: p.expBusy - save.day });
  return null;
}

/** Can this companion be sent now? → { ok, why } (why — text). */
export function canSend(save, p) {
  if (!p || p.state !== 'waiting') return { ok: false, why: t('exp.why.notReserve') };
  const busy = expBusy(save, p);
  if (busy) return { ok: false, why: busy };
  const band = loyaltyBand(p.approval);
  if ((p.approval || 0) < EXP_RULES.minLoyalty || EXP_LOYALTY.banBlocks.includes(band.id)) return { ok: false, why: tf('exp.why.loyalty', { band: band.name }) };
  const home = idleHome(save, p);
  if (home && !sameLocation(save.location, home)) return { ok: false, why: tf('exp.why.away', { place: LOCATIONS[home]?.name || home }) };
  if (expActive(save).length >= EXP_RULES.maxActive) return { ok: false, why: tf('exp.why.max', { n: EXP_RULES.maxActive }) };
  return { ok: true, why: null };
}

/** Hops over routes from a node to the nearest node matching `fit` (BFS). */
function hopsTo(from, fit) {
  const start = resolveLocation(from);
  const seen = new Set([start]);
  let q = [start], d = 0;
  while (q.length && d < 30) {
    if (q.some((id) => fit(id))) return d;
    const next = [];
    for (const id of q) for (const r of routesFrom(id)) { const o = otherEnd(r, id); if (!seen.has(o)) { seen.add(o); next.push(o); } }
    q = next; d++;
  }
  return 6;
}

const regionOfTarget = (type, target) => (type === 'loot' || type === 'trade' ? target : LOCATIONS[type === 'quest' ? AUTOABLE_QUESTS[target]?.loc : target]?.region);
const dangerOf = (type, target) => {
  if (type === 'scout') return LOCATIONS[target]?.danger ?? REGIONS[LOCATIONS[target]?.region]?.danger ?? 1;
  if (type === 'quest') { const l = LOCATIONS[resolveLocation(AUTOABLE_QUESTS[target]?.loc)]; return l?.danger ?? REGIONS[l?.region]?.danger ?? 1; }
  return REGIONS[target]?.danger ?? 1;
};

/** Sellable things in the companion's backpack (trade): not key, priced. */
const sellable = (p) => (p.bag?.grid || []).filter((e) => { const it = GAME_DATA.ITEMS[e.item]; return it && !it.key && (it.price || 0) > 0; });
const carriedValue = (p) => sellable(p).reduce((s, e) => s + instValue(e) * (e.n || 1), 0);

/** Targets of a type: [{ id, name, ok, why }]. */
export function expTargets(save, p, type) {
  const T = EXP_TYPES[type];
  if (!T) return [];
  const lvl = p.level || save.hero.level || 1;
  if (type === 'loot' || type === 'trade') {
    const known = new Set((save.discovered || []).map((id) => LOCATIONS[id]?.region).filter(Boolean));
    return Object.values(REGIONS).filter((r) => known.has(r.id)).map((r) => {
      let why = null;
      if (r.levels && r.levels[0] > lvl + EXP_RULES.levelCapDelta) why = tf('exp.why.level', { n: r.levels[0] });
      else if (type === 'trade' && !Object.values(LOCATIONS).some((l) => l.region === r.id && l.kind === 'hub' && !l.alias)) why = t('exp.why.noHub');
      else if (type === 'trade' && !sellable(p).length) why = t('exp.why.noGoods');
      return { id: r.id, name: r.name, ok: !why, why };
    });
  }
  if (type === 'scout') {
    return (save.discovered || []).filter((id) => LOCATIONS[id] && !LOCATIONS[id].alias && !(save.visited || []).includes(id) && !save.flags[`scouted:${id}`])
      .map((id) => ({ id, name: LOCATIONS[id].name, ok: true, why: null }));
  }
  // quest: accepted autoable quests whose check stage is ahead
  return Object.keys(AUTOABLE_QUESTS).filter((id) => save.quests[id]?.state === 'active' && QUESTS[id]).map((id) => {
    const st = stageOf(save, id);
    const ok = st && st.goal.kind === 'check' || st?.id === 'ask';
    return { id, name: QUESTS[id].name, ok: !!ok, why: ok ? null : t('exp.why.questDone') };
  });
}

/** The companion as a check member (best skill of the type). */
function bestSkill(save, p, skills) {
  const unit = buildCompanion(save, p, GAME_DATA);
  if (!unit) return null;
  const m = { key: p.npc, name: name(p), isHero: false, unit, p };
  const list = skills.length ? skills : ['perception'];
  return list.map((s) => ({ m, info: checkInfo(m, s) })).sort((a, b) => b.info.total - a.info.total)[0];
}

/** Plan of an errand: { type, target, mode, days, dc, bonus, skill, chance, risk: {captive, death}, value?, why }. */
export function expPlan(save, p, type, target, mode = 'normal') {
  const T = EXP_TYPES[type];
  const region = regionOfTarget(type, target);
  const danger = Math.max(EXP_DC.minDanger, dangerOf(type, target));
  const hops = type === 'loot' || type === 'trade' ? hopsTo(save.location, (id) => LOCATIONS[id]?.region === target)
    : hopsTo(save.location, (id) => sameLocation(id, type === 'quest' ? AUTOABLE_QUESTS[target].loc : target));
  const days = Math.min(T.days[1], T.days[0] + hops);
  const dc = Math.round(EXP_DC.base + EXP_DC.perDanger * danger + EXP_DC.perDay * days);
  const skills = type === 'quest' ? AUTOABLE_QUESTS[target].skills : T.skills;
  const best = bestSkill(save, p, skills);
  const regLvl = REGIONS[region]?.levels?.[0] ?? 1;
  const flag = { scout: EXP_FLAGS.scoutBonus, trade: EXP_FLAGS.tradeBonus, loot: EXP_FLAGS.lootBonus }[type];
  const flagBonus = flag && best && hasWorldFlag([best.m], flag) ? 2 : 0;
  const bonus = Math.floor(((p.level || 1) - regLvl) / 2) - modeOf(mode).riskDelta + flagBonus;
  const info = best ? { ...best.info, total: best.info.total + bonus } : { total: bonus, mode: 'normal' };
  const chance = checkChance(info, dc);
  const careful = !!modeOf(mode).noDeath;
  return { type, target, region, mode, days, dc, bonus, skill: best?.info.skill || null, total: info.total, chance, danger,
    risk: { captive: danger >= EXP_DANGER_GATE.captured, death: danger >= EXP_DANGER_GATE.dead && danger >= EXP_RULES.deathMinDanger && !careful },
    value: type === 'trade' ? carriedValue(p) : 0 };
}

/** Send the companion. → toasts. */
export function startExp(save, p, plan) {
  p.exp = { type: plan.type, target: plan.target, region: plan.region, start: save.day, days: plan.days, mode: plan.mode, dc: plan.dc, total: plan.total, mode2: plan.mode, skill: plan.skill };
  delete p.expResult;
  const out = [];
  const npc = COMPANION_RULES && NPCS[p.npc];
  // sent «to his taste» (a loved deed tag fits the type): EXP_LOYALTY.sentOnTrait
  const likes = (NPCS[p.npc]?.likes || []).concat(npc?.companion?.spec?.likes || []);
  if ((plan.type === 'trade' && likes.includes('greed')) || (plan.type === 'scout' && likes.includes('explore'))) out.push(...adjustApproval(save, p, EXP_LOYALTY.sentOnTrait));
  const text = tf('exp.sent', { name: name(p), type: EXP_TYPES[plan.type].name, days: plan.days });
  journal(save, text);
  out.unshift({ text, color: 'a' });
  return out;
}

const pickW = (rng, list) => { const s = list.reduce((a, x) => a + x.w, 0); let r = rng() * s; for (const x of list) { r -= x.w; if (r < 0) return x.id; } return list[0].id; };
const lootTier = (danger) => (danger >= 4 ? 3 : danger >= 2 ? 2 : 1);

/** Outcome row by margin (nat 20 / 1 shift one row), gated by danger and mode. */
export function outcomeFor(margin, natural, danger, mode) {
  let i = EXP_OUTCOMES.findIndex((o) => margin >= o.minMargin);
  if (i < 0) i = EXP_OUTCOMES.length - 1;
  if (natural === 20) i = Math.max(0, i - 1);
  if (natural === 1) i = Math.min(EXP_OUTCOMES.length - 1, i + 1);
  let o = EXP_OUTCOMES[i];
  const hurt = EXP_OUTCOMES.find((x) => x.id === 'hurt'), cap = EXP_OUTCOMES.find((x) => x.id === 'captured');
  if (o.id === 'dead' && (danger < EXP_DANGER_GATE.dead || modeOf(mode).noDeath)) o = danger >= EXP_DANGER_GATE.captured ? cap : hurt;
  if (o.id === 'captured' && danger < EXP_DANGER_GATE.captured) o = hurt;
  return o;
}

/** Resolve a finished errand. → toasts. */
export function resolveExp(save, p, data = GAME_DATA, rng = Math.random) {
  const e = p.exp;
  const natural = 1 + Math.floor(rng() * 20);
  const total = natural + (e.total || 0);
  const danger = Math.max(0, dangerOf(e.type, e.target));
  const o = outcomeFor(total - e.dc, natural, danger, e.mode);
  const mul = o.mul * modeOf(e.mode).rewardMul;
  const out = [];
  const got = [];
  delete p.exp;
  if (mul > 0) {
    const R = EXP_TYPES[e.type].reward;
    const lvl = p.level || 1;
    if (e.type === 'loot') {
      const cr = Math.round((R.credits[0] + rng() * (R.credits[1] - R.credits[0]) + R.perLevel * lvl) * mul);
      const items = [];
      const rolls = Math.max(1, Math.round(R.rolls * Math.min(1, mul)));
      for (let k = 0; k < rolls; k++) items.push({ item: pickW(rng, EXP_LOOT[lootTier(danger)]), n: 1 });
      out.push(...grant(save, { credits: cr, items }, data));
      got.push(tf('exp.got.credits', { n: cr }), ...items.map((x) => data.ITEMS[x.item]?.name || x.item));
    } else if (e.type === 'trade') {
      let value = 0;
      mutate(save, () => { const sold = sellable(p); value = sold.reduce((s, x) => s + instValue(x) * (x.n || 1), 0); p.bag.grid = p.bag.grid.filter((x) => !sold.includes(x)); });
      const cr = Math.round(value * WORLD_RULES.prices.sell * R.creditsMulOfCarried * mul);
      const hub = Object.values(LOCATIONS).find((l) => l.region === e.target && l.kind === 'hub' && !l.alias);
      const f = REGIONS[e.target]?.faction || REGIONS[e.target]?.minorFaction;
      out.push(...grant(save, { credits: cr, rep: f ? { [f]: R.rep } : null }, data));
      got.push(tf('exp.got.credits', { n: cr }));
      if (rng() < R.rare) { out.push(...grant(save, { items: [{ item: 'rare-parts', n: 1 }] }, data)); got.push(data.ITEMS['rare-parts']?.name || 'rare-parts'); }
      void hub;
    } else if (e.type === 'scout') {
      openHidden(save, e.target);
      save.flags[`scouted:${e.target}`] = true;
      out.push(...grant(save, { xp: Math.round(R.xp * mul) }, data));
      got.push(tf('exp.got.scout', { place: LOCATIONS[e.target]?.name || e.target }));
    } else if (e.type === 'quest') {
      const st = save.quests[e.target];
      const q = QUESTS[e.target];
      if (st?.state === 'active' && q) {
        // the companion did the check stage: the quest jumps to its turn-in stage; the reward later × questRewardMul
        const back = q.stages.find((s) => s.id === 'back') || q.stages[q.stages.length - 1];
        st.stage = back.id; st.opt = null; st.subs = {};
        (st.path = st.path || []).push(back.id);
        st.expMul = R.questRewardMul;
        journal(save, tf('q.stage', { name: q.name, text: back.text }));
        got.push(tf('exp.got.quest', { name: q.name }));
      }
    }
    // companion XP: a share of the reward (COMPANION_RULES.xp.waitingShare)
    const xp = Math.round(40 * (p.level || 1) * mul * EXP_RULES.xpShare);
    if (xp > 0) { p.xp = (p.xp || 0) + xp; }
  }
  if (o.loyalty) out.push(...adjustApproval(save, p, o.loyalty));
  const unit = buildCompanion(save, p, data);
  if (o.state === 'wounded') {
    p.expBusy = save.day + EXP_RULES.woundedRestDays;
    if (unit) p.hp = Math.max(1, Math.round(unit.maxHp * o.hp));
  } else if (o.state === 'captive') {
    p.expCaptive = { region: e.region || LOCATIONS[e.target]?.region, until: save.day + EXP_RULES.captiveRescueDays };
  } else if (o.state === 'dead') {
    p.state = 'cyberspace'; p.hp = 0;
  }
  p.expResult = { type: e.type, target: e.target, outcome: o.id, text: o.text, got, day: save.day, seen: false };
  const text = tf('exp.back', { name: name(p), text: o.text });
  journal(save, text + (got.length ? ` (${got.join(', ')})` : ''));
  out.unshift({ text, color: o.mul > 0 ? 'j' : 'c' });
  return out;
}

/** Day tick (passDays): finished errands resolve, captives past the deadline are lost. → toasts. */
export function expTick(save, data = GAME_DATA, rng = Math.random) {
  const out = [];
  if (!save?.party) return out;
  for (const p of save.party) {
    if (p.exp && save.day >= p.exp.start + p.exp.days) out.push(...resolveExp(save, p, data, rng));
    if (p.expCaptive && save.day > p.expCaptive.until) {
      delete p.expCaptive;
      out.push(...adjustApproval(save, p, EXP_LOYALTY.ghostedReturn));
      p.state = 'left'; p.lost = true;
      const text = tf('exp.lost', { name: name(p) });
      journal(save, text);
      out.push({ text, color: 'c' });
    }
  }
  return out;
}

/** Captives that can be freed from this node (a battle in their region). → [{ p, encounter }]. */
export function rescuesAt(save, locId) {
  const reg = LOCATIONS[resolveLocation(locId)]?.region;
  return save.party.filter((p) => p.expCaptive && p.expCaptive.region === reg).map((p) => ({
    p, encounter: (ENCOUNTER_TABLES[reg] || []).find((x) => x.kind === 'battle' && x.encounter)?.encounter || 'w-road-scavengers' }));
}

/** The captive is freed: back to the reserve on this node. → toasts. */
export function freeCaptive(save, p) {
  delete p.expCaptive;
  p.waitAt = save.location;
  const text = tf('exp.freed', { name: name(p) });
  journal(save, text);
  return [{ text, color: 'j' }];
}

/** Results not yet shown at the companion's home node (location.js «Вернулся» window). */
export const unseenResults = (save, locId) => save.party.filter((p) => p.expResult && !p.expResult.seen && (!idleHome(save, p) || sameLocation(idleHome(save, p), locId)));

export { partyEntry, deed, ROUTES };
