// Cyberspace v2 logic without DOM (docs/specs/cyberspace-v2.md, data data/world/cyberspace.js).
// Persistent progress: save.cs = { zones: {zid: [true…] per node}, events: {evId: true}, hacks, cool, diveDay, souls }.
// The current visit: save.cyberspace = { mode: 'escape'|'dive'|'free', entry: 'death'|'dive'|'implant'|'spirit', … }.
//   escape — the old episode (death): 3 nodes from zones by level, 2 of 3, Judge marks (scenes/cyberspace.js finish);
//   dive / free — a sortie into the zones (terminal 'ours' / Нейропорт / spirit): up to CS_RULES.dive.maxNodes nodes,
//   a failed node ejects the soul (−МРЛ), no mark. Zone cleared → flag cs-zone:<id> + rewards.
import { CS_ZONES, CS_EVENTS, CS_ENTRY, CS_RULES, HACK_EFFECTS, HACK_POINTS, CS_ITEMS, SPIRIT } from '../data/world/cyberspace.js';
import { LOCATIONS } from '../data/world/locations.js';
import { BASE_LOCATION } from '../data/world/base.js';
import { csEnemies, zoneLevel } from '../data/enemies-cyber.js';
import { t } from '../data/text/index.js';
import { grant, journal, tf, requiresOk, gainXp, deed, buildHero, members, locFaction } from './state.js';
import { factionName } from './reputation.js';
import { passDays, exodusExtend } from './exodus.js';
import { dropHeat } from './crime.js';
import { startQuest } from './quests.js';
import { hackKey, hackActive } from './cs-hacks.js';
import { isSpirit } from './spirit.js';
import { hackTier } from './hack.js';

export { hackActive };
const P = CS_RULES.flagPrefix;

export function csState(save) {
  if (!save.cs || typeof save.cs !== 'object') save.cs = {};
  const c = save.cs;
  c.zones = c.zones || {}; c.events = c.events || {}; c.hacks = c.hacks || {}; c.cool = c.cool || {};
  if (!Number.isFinite(c.diveDay)) c.diveDay = -99;
  return c;
}

const hasItem = (save, id) => (save.hero.items?.[id] || 0) > 0;
export const zoneCleared = (save, zid) => !!save.flags[`${P.zone}${zid}`];
/** XP of the cyberspace: base × level / 5 (CS_RULES.xp). */
export const csXp = (save, base) => Math.max(1, Math.round(base * Math.max(1, save.hero.level || 1) / 5));

/** Is the zone open now? → { ok, why } (why — text). Entry 'implant' — only CS_ENTRY.implant.noTerminalZones. */
export function zoneStatus(save, zid, entry = null) {
  const z = CS_ZONES[zid];
  if (!z) return { ok: false, why: '?' };
  if (entry === 'implant' && !CS_ENTRY.implant.noTerminalZones.includes(zid)) return { ok: false, why: t('cyb.why.implant') };
  const r = z.requires;
  if (!r) return { ok: true, why: null };
  if (r.spirit && !(isSpirit(save) || (save.hero.judgeMarks || 0) >= 2)) return { ok: false, why: t('cyb.why.spirit') };
  const need = r.zoneCleared ? [].concat(r.zoneCleared) : [];
  const miss = need.filter((x) => !zoneCleared(save, x));
  if (miss.length) return { ok: false, why: tf('cyb.why.clear', { zones: miss.map((x) => CS_ZONES[x].name).join(', ') }) };
  if (r.item && !hasItem(save, r.item)) return { ok: false, why: tf('cyb.why.item', { item: CS_ITEMS[r.item]?.name || r.item }) };
  if (r.terminalsOff && !requiresOk(save, { terminalsOff: r.terminalsOff })) return { ok: false, why: tf('cyb.why.terminals', { n: r.terminalsOff }) };
  return { ok: true, why: null };
}

/** Nodes of a zone with their state: [{ i, kind, …node, done }]. */
export function zoneNodes(save, zid) {
  const done = csState(save).zones[zid] || [];
  return CS_ZONES[zid].nodes.map((n, i) => ({ ...n, i, done: !!done[i] }));
}

/** Enemies of a battle node / event for the hero's level (scaled within the zone's levels). */
export const nodeEnemies = (save, zid, list) => csEnemies(list, zoneLevel(CS_ZONES[zid], save.hero.level));

/** Mark a node of a zone passed; the last one clears the zone (rewards once). → toasts. */
export function passNode(save, zid, i, data) {
  const c = csState(save);
  const arr = (c.zones[zid] = c.zones[zid] || []);
  if (arr[i]) return [];
  arr[i] = true;
  const out = gainXp(save, csXp(save, CS_RULES.xp.node), data);
  if (CS_ZONES[zid].nodes.every((_, k) => arr[k]) && !zoneCleared(save, zid)) out.push(...clearZone(save, zid, data));
  return out;
}

/** Zone rewards (CS_ZONES.rewards): flag cs-zone:<id>, xp × level/5, items, flags, Exodus extension. → toasts. */
export function clearZone(save, zid, data) {
  const z = CS_ZONES[zid], r = z.rewards || {};
  save.flags[`${P.zone}${zid}`] = true;
  journal(save, tf('cyb.zoneCleared', { zone: z.name }));
  const out = [{ text: tf('cyb.zoneCleared', { zone: z.name }), color: 'j' }];
  out.push(...grant(save, { xp: csXp(save, r.xp || CS_RULES.xp.zoneClear), items: (r.items || []).map((x) => ({ item: x.id, n: x.n })), flags: r.flags }, data));
  if (r.exodus?.ext) out.push(...exodusExtend(save, `cs-zone:${zid}`, r.exodus.ext));
  return out;
}

// ---------------------------------------------------------------- entries
/** Can the hero dive now? entry: 'dive' | 'implant' | 'spirit' → { ok, why }. */
export function diveStatus(save, entry) {
  const loc = LOCATIONS[save.location];
  const c = csState(save);
  if (save.cyberspace) return { ok: false, why: t('cyb.why.inside') };
  if (entry === 'spirit') return isSpirit(save) ? { ok: true, why: null } : { ok: false, why: t('cyb.why.notSpirit') };
  if (entry === 'implant' && !hasItem(save, CS_ENTRY.implant.needsItem)) return { ok: false, why: tf('cyb.why.item', { item: CS_ITEMS['cs-neuroport'].name }) };
  if (entry === 'dive' && !(loc?.terminal && save.terminals?.[loc.terminal.id] === CS_ENTRY.dive.needsTerminal)) return { ok: false, why: t('cyb.why.terminal') };
  const ready = c.diveDay + CS_RULES.dive.cooldownDays;
  if (save.day < ready) return { ok: false, why: tf('cyb.why.cooldown', { n: ready - save.day }) };
  return { ok: true, why: null };
}

/** Entries available on this node (location action «Нырнуть в Сеть»). → [{ entry, ok, why }]. */
export function diveEntries(save) {
  const out = [];
  if (isSpirit(save)) return [{ entry: 'spirit', ...diveStatus(save, 'spirit') }];
  const loc = LOCATIONS[save.location];
  if (loc?.terminal && save.terminals?.[loc.terminal.id] === 'ours') out.push({ entry: 'dive', ...diveStatus(save, 'dive') });
  if (hasItem(save, CS_ENTRY.implant.needsItem)) out.push({ entry: 'implant', ...diveStatus(save, 'implant') });
  return out;
}

/** Start a sortie: a day passes (not for a spirit), save.cyberspace = dive state. → toasts. */
export function startDive(save, entry) {
  const c = csState(save);
  const out = [];
  if (entry !== 'spirit') {
    c.diveDay = save.day;
    const r = passDays(save, CS_ENTRY[entry]?.days ?? CS_RULES.dive.timerDays);
    out.push(...(r.out || []));
  }
  save.cyberspace = { mode: entry === 'spirit' ? 'free' : 'dive', entry, nodesDone: 0, trace: 0, zone: null, from: save.location, returnTo: save.location, allies: [] };
  journal(save, t(`cyb.enter.${entry}`));
  return out;
}

/** End a sortie. ejected — the soul was thrown out: −CS_RULES.dive.ejectMrlLoss of max МРЛ. Body raid roll outside base/hubs. → toasts. */
export function endDive(save, data, { ejected = false, rng = Math.random } = {}) {
  const c = save.cyberspace;
  const out = [];
  if (ejected) {
    const u = buildHero(save, data);
    save.hero.mrl = Math.max(1, Math.round(u.mrl - u.maxMrl * CS_RULES.dive.ejectMrlLoss));
    out.push({ text: t('cyb.ejected'), color: 'n' });
  }
  const loc = LOCATIONS[c?.from || save.location];
  if (c?.mode === 'dive' && loc && loc.kind !== 'hub' && loc.id !== BASE_LOCATION && rng() < CS_RULES.dive.bodyGuardRaid) {
    // the party guarding the body fought raiders (abstracted): everyone loses a fifth of HP
    for (const m of members(save, data)) { const e = m.isHero ? save.hero : m.p; e.hp = Math.max(1, Math.round(m.unit.hp - m.unit.maxHp * 0.2)); }
    out.push({ text: t('cyb.raid'), color: 'c' });
  }
  save.cyberspace = null;
  journal(save, ejected ? t('cyb.ejected') : t('cyb.surfaced'));
  return out;
}

/** Node budget of the sortie (free spirit — no limit). */
export const nodesLeft = (c) => (c.mode === 'free' ? Infinity : Math.max(0, CS_RULES.dive.maxNodes - (c.nodesDone || 0)));

// ---------------------------------------------------------------- escape (death)
/** Zones for the death episode: open by level (not necessarily cleared); Пустошь — only for a spirit. */
export function escapeZones(save) {
  const L = save.hero.level || 1;
  return Object.entries(CS_ZONES).filter(([zid, z]) => L >= z.levels[0] && L <= z.levels[1]
    && (zid !== 'cs-void' || isSpirit(save)) && zid !== 'cs-throne').map(([zid]) => zid);
}

/** 3 nodes of the death episode: [{ zone, i, kind, res: null }] — one per zone (zones repeat if few), battle / check / hack. */
export function escapeNodes(save, rng = Math.random) {
  const zones = escapeZones(save);
  const pool = zones.length ? zones : ['cs-gate'];
  const shuffled = [...pool].sort(() => rng() - 0.5);
  const out = [];
  for (let k = 0; k < CS_RULES.zonesInEscape; k++) {
    const zid = shuffled[k % shuffled.length];
    const nodes = CS_ZONES[zid].nodes.map((n, i) => ({ n, i })).filter(({ n }) => ['battle', 'check', 'hack'].includes(n.kind));
    const pick = nodes[Math.floor(rng() * nodes.length)] || { n: { kind: 'check' }, i: 0 };
    out.push({ zone: zid, i: pick.i, kind: pick.n.kind, res: null });
  }
  return out;
}

/** Old episode saves (nodes: 'pass'|'fail'|null) → v2 node objects in the Gate. */
export function normalizeEpisode(c) {
  if (!c || c.mode) return c;
  c.mode = 'escape'; c.entry = 'death';
  if (Array.isArray(c.nodes)) c.nodes = c.nodes.map((n, k) => (n && typeof n === 'object' ? n : { zone: 'cs-gate', i: k % 2, kind: CS_ZONES['cs-gate'].nodes[k % 2].kind, res: n }));
  return c;
}

// ---------------------------------------------------------------- events
export const eventDone = (save, id) => !!csState(save).events[id];

/** Can the option be taken: negative items must be in the bag. */
export function optionOk(save, o) {
  const need = [...(o.fx?.items || [])].filter((x) => x.n < 0);
  const miss = need.find((x) => (save.hero.items?.[x.id] || 0) < -x.n);
  return miss ? { ok: false, why: tf('cyb.why.item', { item: CS_ITEMS[miss.id]?.name || miss.id }) } : { ok: true, why: null };
}

/**
 * Event / option effects (CS_EVENTS fx / win / lose). → { toasts, battle?, hackMenu?, trace }.
 * Handles items ± ({id, n}), flags, realFlags (cs-hack:<effect> on the node the dive started from), mrl, credits, xp,
 * trace, allies (battles of this visit), deeds, spiritReturn (quest sq-new-body), battle / openHackMenu (for the scene).
 */
export function eventFx(save, fx, data) {
  const out = [];
  const res = { toasts: out, trace: 0 };
  if (!fx) return res;
  const add = (fx.items || []).filter((x) => x.n > 0).map((x) => ({ item: x.id, n: x.n }));
  const rem = (fx.items || []).filter((x) => x.n < 0).map((x) => ({ item: x.id, n: -x.n }));
  out.push(...grant(save, { items: add, removeItems: rem, flags: fx.flags, credits: fx.credits, xp: fx.xp ? csXp(save, fx.xp) : 0 }, data));
  for (const x of rem) out.push({ text: `− ${data.ITEMS?.[x.item]?.name || x.item}${x.n > 1 ? ` ×${x.n}` : ''}`, color: '4' });
  if (fx.mrl) {
    const u = buildHero(save, data);
    save.hero.mrl = Math.max(1, Math.min(u.maxMrl, u.mrl + fx.mrl));
    out.push({ text: tf('cs.mrl', { n: fx.mrl > 0 ? `+${fx.mrl}` : fx.mrl }), color: fx.mrl > 0 ? 'j' : 'n' });
  }
  for (const f of fx.realFlags || []) {
    const m = /^cs-hack:(\w+)$/.exec(f);
    const target = save.cyberspace?.from || save.location;
    if (m && HACK_EFFECTS[m[1]]) out.push(...applyHackEffect(save, m[1], target, { free: true }));
  }
  if (fx.trace) { res.trace = fx.trace; if (save.cyberspace) save.cyberspace.trace = (save.cyberspace.trace || 0) + fx.trace; out.push({ text: tf('cyb.traceUp', { n: fx.trace }), color: 'n' }); }
  if (fx.allies && save.cyberspace) save.cyberspace.allies = [...new Set([...(save.cyberspace.allies || []), ...fx.allies])];
  for (const d of fx.deeds || []) out.push(...deed(save, d));
  if (fx.spiritReturn) {
    if (!save.quests['sq-new-body'] && isSpirit(save)) out.push(...startQuest(save, 'sq-new-body'));
    else out.push({ text: t('cyb.newBodyKnown'), color: '4' });
  }
  if (fx.battle) res.battle = fx.battle;
  if (fx.openHackMenu) res.hackMenu = true;
  return res;
}

// ---------------------------------------------------------------- real-world hacks (Relay, HACK_POINTS)
/**
 * Windows of the Relay: [{ term, loc, name, state, hacks: [{ eff, target, targetName, ok, why, dc, tier }] }].
 * Only 'ours' terminals have hacks; 'ritual' — a red window (battle); 'dead' / other — closed.
 */
export function hackWindows(save) {
  const c = csState(save);
  const out = [];
  for (const [term, hp] of Object.entries(HACK_POINTS)) {
    const state = save.terminals?.[term] || LOCATIONS[hp.loc]?.terminal?.state || 'dead';
    const hacks = [];
    if (state === 'ours') for (const [eff, targets] of Object.entries(hp.hacks)) for (const target of targets) {
      const E = HACK_EFFECTS[eff];
      let why = null;
      const cool = c.cool[hackKey(eff, target)];
      if (Number.isFinite(cool) && save.day < cool) why = tf('cyb.why.cooldown', { n: cool - save.day });
      else if (E.needsItem && !hasItem(save, E.needsItem)) why = tf('cyb.why.item', { item: CS_ITEMS[E.needsItem]?.name || E.needsItem });
      else if (eff === 'wanted' && !(save.wanted?.[wantedFaction(target)]?.heat > 0)) why = t('cyb.why.noWanted');
      hacks.push({ eff, target, targetName: LOCATIONS[target]?.name || factionLabel(target), ok: !why, why, dc: E.dc, tier: Math.max(E.tier, 1) });
    }
    out.push({ term, loc: hp.loc, name: LOCATIONS[hp.loc]?.name || hp.loc, state, hacks });
  }
  return out;
}
// 'wanted' targets are node ids or faction ids (HACK_POINTS: wanted: ['agrozone'] / ['cult'])
const wantedFaction = (target) => (LOCATIONS[target] ? locFaction(target) : target);
const factionLabel = (f) => factionName(f) || f;

/** Hack tier for the board: the effect's tier, at least the hero's (HACK_RULES.tiers). */
export const hackBoardTier = (save, eff) => Math.max(HACK_EFFECTS[eff]?.tier || 1, Math.min(3, hackTier(save.hero.level || 1)));

/** Apply a real-world hack (after a won board, or free from an event). → toasts. */
export function applyHackEffect(save, eff, target, { free = false } = {}) {
  const c = csState(save);
  const E = HACK_EFFECTS[eff];
  if (!E) return [];
  const key = hackKey(eff, target);
  const out = [];
  if (!free) c.cool[key] = save.day + (E.cooldown || 0);
  if (eff === 'wanted') {
    const f = wantedFaction(target);
    out.push(...dropHeat(save, f, 2));
  } else {
    c.hacks[key] = save.day + Math.max(0, (E.days || 1) - 1);
    save.flags[`${P.hack}${eff}:${target}`] = true;
  }
  const text = tf('cyb.hackDone', { name: E.name, target: LOCATIONS[target]?.name || factionLabel(target), n: E.days });
  journal(save, text);
  out.unshift({ text, color: 'h' });
  return out;
}

/** Spirit perks (SPIRIT.perks): checks in the Net with advantage. */
export const cyberAdv = (save) => isSpirit(save) && SPIRIT.perks.cyberAdv;
