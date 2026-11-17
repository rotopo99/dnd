// Radio «Голос Пустошей» (content-wave1.md §1; data — data/world/radio.js, DSL of `when` in its header). Pure, no DOM.
// save.radio = { heard: { newsId: day }, log: [{ id, day }] } ; save.stats = { battlesWon, fled, downDay } (radioBattle);
// save.radioPush — news ids pushed by delayed consequences (heard first).
// Pick: eligible (when ok, `once` not heard, cooldown cd ?? rules.cooldownDays passed) → pushed first, then prio desc,
// then the longest unheard; news without `when` (ambient) only when nothing else fits. Jingle before a news — rules.jingleChance.
// Places (RADIO.places): handset (manual), radio-room (base with the radio mod, rules.perBaseVisit news once a day),
// tavern (after rest, chance), hub (node entry with trade/rumors, chance), tower (cq:w1-station:comms — the hub chance rises).
import { RADIO } from '../data/world/radio.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { ROMANCE_RULES } from '../data/romance.js';
import { LOCATIONS, resolveLocation, sameLocation } from './data.js';
import { exodusMark } from './exodus.js';
import { partnerOf, stageFor } from './romance.js';
import { repTier, tierAtLeast, normFaction } from './reputation.js';
import { CQ_FLAG } from '../data/world/consequences.js';

const RR = RADIO.rules;
const TIERS = ['hostile', 'suspicious', 'neutral', 'friendly', 'ally'];
const place = (id) => RADIO.places.find((p) => p.id === id) || {};

export const radioOf = (save) => {
  if (!save.radio || typeof save.radio !== 'object') save.radio = { heard: {}, log: [] };
  save.radio.heard ||= {}; save.radio.log ||= [];
  return save.radio;
};
export const statsOf = (save) => {
  if (!save.stats || typeof save.stats !== 'object') save.stats = { battlesWon: 0, fled: 0, downDay: null };
  return save.stats;
};

/** A battle ended (world-battle.js writeBack): counters for the radio DSL. */
export function radioBattle(save, { won, retreat, down }) {
  const s = statsOf(save);
  if (won && !retreat) s.battlesWon = (s.battlesWon || 0) + 1;
  if (retreat) s.fled = (s.fled || 0) + 1;
  if (down) s.downDay = save.day;
}

const maxWanted = (save) => Math.max(0, ...Object.values(save.wanted || {}).map((w) => w?.heat || 0));
function romanceIdx(save) {
  const p = partnerOf(save);
  if (!p || !save.romance?.[p]) return -1;
  return ROMANCE_RULES.stages.findIndex((s) => s.id === stageFor(save.romance[p]).id);
}

/** Condition DSL (data/world/radio.js header). Empty / missing — true. */
export function radioOk(save, w) {
  if (!w) return true;
  const f = save.flags || {};
  const qs = save.quests || {};
  for (const [k, v] of Object.entries(w)) {
    switch (k) {
      case 'any': if (!v.some((x) => radioOk(save, x))) return false; break;
      case 'not': if (radioOk(save, v)) return false; break;
      case 'flag': if (!f[v]) return false; break;
      case 'notFlag': if (f[v]) return false; break;
      case 'flagPrefix': if (!Object.keys(f).some((x) => x.startsWith(v) && f[x])) return false; break;
      case 'cq': { const [q, o] = String(v).split(':'); if (!f[CQ_FLAG(q, o)]) return false; break; }
      case 'questDone': if (qs[v]?.state !== 'done') return false; break;
      case 'questActive': if (qs[v]?.state !== 'active') return false; break;
      case 'wanted': if (maxWanted(save) < v) return false; break;
      case 'exodusMark': if (exodusMark(save) < v) return false; break;
      case 'romance': if (romanceIdx(save) < (v.min ?? 0)) return false; break;
      case 'deeds': if ((save.deeds?.[v.tag] || 0) < (v.min ?? 1)) return false; break;
      case 'party': if (!(save.party || []).some((p) => p.npc === v && p.state !== 'left')) return false; break;
      case 'partyLeft': if (!(save.party || []).some((p) => p.state === 'left' && (v === 'any' || p.npc === v))) return false; break;
      case 'partyDown': { const d = statsOf(save).downDay; if (!!v !== (d != null && save.day - d <= WORLD_RULES.wave1.radioDownDays)) return false; break; }
      case 'battlesWon': if ((statsOf(save).battlesWon || 0) < v) return false; break;
      case 'fled': if ((statsOf(save).fled || 0) < v) return false; break;
      case 'level': if ((save.hero?.level || 1) < v) return false; break;
      case 'rep': {
        const tier = repTier(save.rep?.[normFaction(v.faction)] ?? 0);
        if (v.atLeast && !tierAtLeast(tier, v.atLeast)) return false;
        if (v.atMost && TIERS.indexOf(tier) > TIERS.indexOf(v.atMost)) return false;
        break;
      }
      case 'loc': if (!sameLocation(save.location, v)) return false; break;
      case 'region': if (LOCATIONS[resolveLocation(save.location)]?.region !== v) return false; break;
      case 'dayMin': if (save.day < v) return false; break;
      case 'dayMax': if (save.day > v) return false; break;
      case 'credits': { const c = save.hero?.credits || 0; if ((v.min != null && c < v.min) || (v.max != null && c > v.max)) return false; break; }
      default: return false; // unknown key: never true (data error stays silent in game, tools/test.mjs checks the keys)
    }
  }
  return true;
}
export const RADIO_KEYS = ['any', 'not', 'flag', 'notFlag', 'flagPrefix', 'cq', 'questDone', 'questActive', 'wanted', 'exodusMark', 'romance', 'deeds',
  'party', 'partyLeft', 'partyDown', 'battlesWon', 'fled', 'level', 'rep', 'loc', 'region', 'dayMin', 'dayMax', 'credits'];

const ambient = (n) => !n.when || !Object.keys(n.when).length;

/** News that may sound now: [news]. */
export function radioEligible(save) {
  const r = radioOf(save);
  return RADIO.news.filter((n) => {
    const h = r.heard[n.id];
    if (h != null && (n.once || save.day - h < (n.cd ?? RR.cooldownDays))) return false;
    return radioOk(save, n.when);
  });
}

/** Fresh news (never heard, not ambient) — the «new» badge. → count. */
export function radioFresh(save) {
  const r = radioOf(save);
  return radioEligible(save).filter((n) => !ambient(n) && r.heard[n.id] == null).length;
}

/** Order of the eligible news: pushed (delayed consequences) → prio desc → longest unheard; ambient only as a fallback. */
export function radioQueue(save) {
  const r = radioOf(save);
  const push = save.radioPush || [];
  const all = radioEligible(save);
  const real = all.filter((n) => !ambient(n));
  const list = real.length ? real : all;
  const key = (n) => [push.includes(n.id) ? 0 : 1, -(n.prio || 0), r.heard[n.id] ?? -1e9];
  return list.sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
}

/**
 * Tune in: up to n different news, marked heard. rng — for the jingle. → [{ news, text: [lines], jingle? }].
 * The hero name fills `{hero}`.
 */
export function radioPick(save, { n = 1, rng = Math.random } = {}) {
  const r = radioOf(save);
  const out = [];
  for (const news of radioQueue(save).slice(0, n)) {
    r.heard[news.id] = save.day;
    r.log = [...r.log, { id: news.id, day: save.day }].slice(-50);
    save.radioPush = (save.radioPush || []).filter((x) => x !== news.id);
    const jingle = rng() < RR.jingleChance ? RADIO.jingles[Math.floor(rng() * RADIO.jingles.length)] : null;
    out.push({ news, jingle, text: news.text.map((l) => l.replaceAll('{hero}', save.hero?.name || '')) });
  }
  return out;
}

/** Chance a node entry plays the receiver: hub / town with trade or rumors (place `hub`), raised by `tower` after comms. */
export function radioEnterChance(save, locId, services = null) {
  const L = LOCATIONS[resolveLocation(locId)];
  if (!L) return 0;
  const svc = services || L.services || [];
  const tower = place('tower');
  const towerOn = tower.needs ? radioOk(save, { cq: tower.needs.replace(/^cq:/, '') }) : false;
  const hubLike = ['hub', 'town'].includes(L.kind) || svc.includes('trade') || svc.includes('rumors');
  if (towerOn && (hubLike || sameLocation(locId, 'ostanovka'))) return tower.chance ?? 0;
  return hubLike ? place('hub').chance ?? 0 : 0;
}
export const radioRestChance = () => place('tavern').chance ?? 0;
export const RADIO_INFO = { station: RADIO.station, dj: RADIO.dj, perBase: RR.perBaseVisit, perVisit: RR.perVisit };
