// Romances with companions (docs/specs/romance.md) over data/romance.js. Pure logic, no DOM.
// save.romance[id] = { bond, stage, dates, talkDay, giftDay, crisis, lost, broken, flirted, flirts, lastDateDay, peak,
//   blocked, battleDay, battleN, refuseDay, waitDay, rf }; save.romance._ = { active, last, conflicts, queue, mournDay, brokeDay }.
// Sources of bond: flirt (private talk), gifts (companions.giveGift), personal quest (personalStage/Done), battles
// (battleLoyalty), deeds (state.deed), rest (scenes/rest.js). Scenes (date, crisis, conflict, farewell, breakup) —
// scenes/romance-scene.js; the queue (save.romance._.queue) is played on the next calm scene (main.js setScene).
import { ROMANCE, ROMANCE_IDS, ROMANCE_RULES as RR, ROMANCE_CONFLICTS, ROMANCE_EVENTS as EV, romanceStage, romanceEpilogueKey } from '../data/romance.js';
import { NPCS } from '../data/npcs.js';
import { COMPANIONS } from '../data/companions.js';
import { t } from '../data/text/index.js';
import { adjustApproval, journal } from './state.js';
import { queueBark } from './barks.js';

const tf = (k, v = {}) => t(k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const STAGES = RR.stages;
const stageIdx = (id) => STAGES.findIndex((s) => s.id === id);
const nameOf = (id) => ROMANCE[id]?.name || NPCS[id]?.name || id;
const party = (save, id) => (save.party || []).find((p) => p.npc === id) || null;
const day = (save) => save.day || 1;
export const isRomanceable = (id) => !!ROMANCE[id];

// ----------------------------------------------------------------------------- state
const blank = () => ({ bond: 0, stage: 'acquaint', dates: [], talkDay: null, giftDay: null, crisis: null, lost: false, broken: false,
  flirted: false, flirts: 0, lastDateDay: null, peak: 0, blocked: false, battleDay: null, battleN: 0, refuseDay: null, waitDay: null, rf: [] });
const blankMeta = () => ({ active: null, last: null, conflicts: [], queue: [], mournDay: null, brokeDay: null });

/** Clean a saved romance object (save.js normalizeSave). */
export function normalizeRomance(raw) {
  const out = { _: blankMeta() };
  if (!raw || typeof raw !== 'object') return out;
  for (const id of ROMANCE_IDS) {
    const e = raw[id];
    if (!e || typeof e !== 'object') continue;
    const b = { ...blank(), ...e };
    b.bond = Math.max(0, Math.min(RR.max, Number(b.bond) || 0));
    b.dates = Array.isArray(b.dates) ? b.dates.filter((d) => ROMANCE[id].dates.some((x) => x.id === d)) : [];
    b.rf = Array.isArray(b.rf) ? b.rf.filter((x) => typeof x === 'string') : [];
    b.lost = !!b.lost; b.broken = !!b.broken; b.flirted = !!b.flirted; b.blocked = !!b.blocked;
    b.flirts = Math.max(0, Number(b.flirts) || 0); b.peak = Math.max(0, Number(b.peak) || 0);
    if (stageIdx(b.stage) < 0) b.stage = 'acquaint';
    out[id] = b;
  }
  const m = raw._ && typeof raw._ === 'object' ? raw._ : {};
  out._ = { ...blankMeta(), ...m,
    active: ROMANCE[m.active] ? m.active : null, last: ROMANCE[m.last] ? m.last : null,
    conflicts: Array.isArray(m.conflicts) ? m.conflicts.filter((x) => typeof x === 'string') : [],
    queue: Array.isArray(m.queue) ? m.queue.filter((q) => q && ROMANCE[q.npc] && ['farewell', 'breakup'].includes(q.kind)) : [] };
  return out;
}

export function romanceState(save) {
  if (!save.romance || typeof save.romance !== 'object') save.romance = { _: blankMeta() };
  if (!save.romance._) save.romance._ = blankMeta();
  return save.romance;
}
export const romanceMeta = (save) => romanceState(save)._;
export function romanceEntry(save, id) {
  const R = romanceState(save);
  if (!R[id]) R[id] = blank();
  return R[id];
}
/** Read-only peek (no entry created). */
export const peekRomance = (save, id) => save?.romance?.[id] || null;

/** The hero's gender from the 3D avatar: 'm' | 'f' | 'x'. */
export const heroGender = (save) => ({ m: 'm', f: 'f' })[save?.hero?.avatar?.gender] || 'x';

/** «был(а)» → m: «был», f: «была», x: as is (the neutral written form). */
export function genderize(s, g) {
  if (typeof s !== 'string' || g === 'x' || !g) return s;
  return s.replace(/([А-Яа-яЁё]+)\(([а-яё]{1,3})\)/g, (_, w, end) => (g === 'f' ? w + end : w));
}

const closed = (e) => !e || e.lost || e.broken;
/** Current partner id (active romance, not lost/broken) or null. */
export function partnerOf(save) {
  const a = save?.romance?._?.active;
  return a && !closed(save.romance[a]) ? a : null;
}
/** Effective stage: bond thresholds capped by the dates (Свидания — after date 1, Отношения — after 3, Кризис — after the crisis). */
export function stageFor(e) {
  let i = stageIdx(romanceStage(e.bond).id);
  if (e.dates.length < 1) i = Math.min(i, stageIdx('flirt'));
  if (e.dates.length < 3) i = Math.min(i, stageIdx('date'));
  if (!e.crisis) i = Math.min(i, stageIdx('bond'));
  return STAGES[Math.max(0, i)];
}
function restage(save, id) {
  const e = romanceEntry(save, id);
  e.stage = stageFor(e).id;
  e.peak = Math.max(e.peak, stageIdx(e.stage));
}

/** Present for a private talk: in the party (active), or resting at the base when where === 'base'. */
export function romancePresent(save, id, where = 'camp') {
  const p = party(save, id);
  if (!ROMANCE[id] || !p) return false;
  return p.state === 'active' || (where === 'base' && p.state === 'waiting');
}
export const talkCandidates = (save, where) => ROMANCE_IDS.filter((id) => romancePresent(save, id, where) && !peekRomance(save, id)?.lost);

// ----------------------------------------------------------------------------- bond
/** Change bond (clamped 0..max). Positive gains stop for a blocked / closed romance. → toasts. */
export function addBond(save, id, d, { quiet = false } = {}) {
  if (!ROMANCE[id] || !d) return [];
  const p = party(save, id);
  if (!p || p.state === 'left') return [];
  const e = romanceEntry(save, id);
  if (closed(e) || (d > 0 && e.blocked)) return [];
  const was = e.bond;
  e.bond = Math.max(0, Math.min(RR.max, e.bond + d));
  const real = e.bond - was;
  restage(save, id);
  const out = [];
  if (real && !quiet) out.push({ text: tf('rom.bondDelta', { n: `${real > 0 ? '+' : ''}${real}`, name: nameOf(id) }), color: real > 0 ? 'f' : 'c' });
  if (e.peak >= stageIdx('bond') && e.bond < EV.breakup.bondBelow) out.push(...breakUp(save, id, 'bond'));
  return out;
}

const passiveOk = (e) => !RR.passiveNeedsFlirt || e.flirted;

/** A gift was given: loved +giftLoved, other +giftOther; once a day per companion. */
export function romanceGift(save, id, loved) {
  if (!ROMANCE[id]) return [];
  const e = romanceEntry(save, id);
  if (e.giftDay === day(save)) return [];
  e.giftDay = day(save);
  return addBond(save, id, loved ? RR.gain.giftLoved : RR.gain.giftOther);
}
/** Personal quest: a stage (+questStage) or done (+questDone). */
export const romanceQuest = (save, id, done) => (ROMANCE[id] ? addBond(save, id, done ? RR.gain.questDone : RR.gain.questStage) : []);
/** A hero's deed: sign +1 liked / −1 disliked. */
export function romanceDeed(save, id, sign) {
  if (!ROMANCE[id] || !sign) return [];
  const e = peekRomance(save, id);
  if (!e || !passiveOk(e)) return [];
  return addBond(save, id, sign > 0 ? RR.gain.choice : RR.gain.choiceBad);
}
/** A won battle: active romanceable companions not downed +battleNoLoss, ≤ battlePerDay a day each. */
export function romanceBattle(save, units) {
  const out = [];
  for (const p of (save.party || []).filter((x) => x.state === 'active' && ROMANCE[x.npc])) {
    const e = peekRomance(save, p.npc);
    if (!e || !passiveOk(e) || closed(e)) continue;
    const u = units.find((x) => x.id === `c-${p.npc}`);
    if (!u || u.down || u.dead) continue;
    if (e.battleDay !== day(save)) { e.battleDay = day(save); e.battleN = 0; }
    if (e.battleN >= RR.gain.battlePerDay) continue;
    e.battleN++;
    out.push(...addBond(save, p.npc, RR.gain.battleNoLoss));
  }
  return out;
}
/** A 1-day rest: +restTogether to flirted active ones, waiting −1 per 3 days; barks of the couple. */
export function romanceRest(save) {
  const out = [];
  for (const p of save.party || []) {
    const e = ROMANCE[p.npc] && peekRomance(save, p.npc);
    if (!e || closed(e)) continue;
    if (p.state === 'active') {
      e.waitDay = day(save);
      if (passiveOk(e)) out.push(...addBond(save, p.npc, RR.gain.restTogether));
    } else if (p.state === 'waiting' && e.bond > 0) {
      if (!Number.isFinite(e.waitDay)) e.waitDay = day(save);
      const n = Math.floor((day(save) - e.waitDay) / 3);
      if (n > 0) { e.waitDay += n * 3; out.push(...addBond(save, p.npc, RR.loss.waitingPer3Days * n)); }
    }
  }
  const pt = partnerOf(save);
  if (pt && party(save, pt)?.state === 'active') {
    queueBark('romance', pt);
    if ((save.party || []).filter((p) => p.state === 'active').length > 1) queueBark('romanceParty');
  }
  return out;
}

/** Mourning penalty to Charisma checks (≤ 0). */
export function mourning(save) {
  const m = save?.romance?._;
  return m && Number.isFinite(m.mournDay) && day(save) <= m.mournDay + EV.death.mournDays ? EV.death.mournCha : 0;
}

// ----------------------------------------------------------------------------- private talk / flirt
export function canTalk(save, id) {
  const p = party(save, id), e = peekRomance(save, id);
  if (!ROMANCE[id] || !p || p.state === 'left' || e?.lost) return { ok: false, why: 'closed' };
  if ((p.approval || 0) < RR.gates.talk.loyaltyMin) return { ok: false, why: 'loyalty' };
  if (e?.talkDay === day(save)) return { ok: false, why: 'today' };
  return { ok: true };
}
export const flirtDc = (save, id) => Math.min(RR.flirt.dcCap, RR.flirt.baseDc + RR.flirt.dcStep * (peekRomance(save, id)?.flirts || 0));
/** Advantage on a flirt option (the skill is to the companion's taste). */
export const flirtAdv = (id, opt) => !!(RR.flirt.tasteBonusAdv && ROMANCE[id]?.taste?.skills?.includes(opt.skill));

/**
 * Flirt option idx: success → +flirtOk, failure → flirtFail (not below 0); once a day. roll(skill, dc, adv) → bool
 * (the scene rolls the hero's check, tests stub it). → { ok, reply: { w, t }, toasts } | null.
 */
export function flirt(save, id, idx, roll) {
  if (!canTalk(save, id).ok) return null;
  const opt = ROMANCE[id].flirt?.[idx];
  if (!opt) return null;
  const e = romanceEntry(save, id);
  const dc = flirtDc(save, id);
  const ok = !!roll(opt.skill || RR.flirt.skillsDefault[0], dc, flirtAdv(id, opt));
  e.talkDay = day(save); e.flirts++;
  if (ok) e.flirted = true;
  const toasts = addBond(save, id, ok ? RR.gain.flirtOk : RR.gain.flirtFail);
  if (ok) jealousyBarks(save, id);
  return { ok, reply: ok ? opt.ok : opt.fail, toasts };
}
function jealousyBarks(save, id) {
  for (const p of (save.party || []).filter((x) => x.state === 'active' && x.npc !== id && ROMANCE[x.npc])) {
    const e = peekRomance(save, p.npc);
    if (e && !closed(e) && e.flirted && e.bond >= RR.conflict.threshold) queueBark('romanceJealous', p.npc);
  }
}

// ----------------------------------------------------------------------------- dates / crisis
/** Next date: { ok, why, n, date, gate, wait? }. where — 'camp' | 'base' (null — ignore the place). */
export function dateStatus(save, id, where = null) {
  const R = ROMANCE[id], p = party(save, id), e = peekRomance(save, id) || blank();
  const n = e.dates.length;
  const date = R?.dates?.[n] || null;
  const gate = RR.gates[`date${n + 1}`];
  const res = (why, x = {}) => ({ ok: !why, why, n: n + 1, date, gate, ...x });
  if (!R || !p || p.state === 'left' || closed(e)) return res('closed');
  if (!date || !gate) return res('done');
  const m = save.romance?._ || blankMeta();
  if (m.active && m.active !== id && !closed(save.romance[m.active])) return res('taken');
  if (e.blocked) return res('blocked');
  if (Number.isFinite(m.brokeDay) && m.last !== id && day(save) - m.brokeDay < EV.breakup.cooldownDays) return res('cooldown');
  if (e.bond < gate.bond) return res('bond');
  if ((p.approval || 0) < gate.loyaltyMin) return res('loyalty');
  const wait = n && gate.minDaysBetween ? gate.minDaysBetween - (day(save) - (e.lastDateDay ?? -99)) : 0;
  if (wait > 0) return res('days', { wait });
  if (where && date.where !== where) return res('place');
  return res(null);
}
export function crisisStatus(save, id, personalDone) {
  const e = peekRomance(save, id), g = RR.gates.crisis;
  if (!ROMANCE[id]?.crisis || !e || closed(e) || e.crisis) return { ok: false };
  if (e.dates.length < g.afterDate || e.bond < g.bond) return { ok: false, why: 'bond' };
  if (g.personalQuestDone && !personalDone) return { ok: false, why: 'quest' };
  return { ok: true };
}
/** Hint for the party card: next date / crisis requirements. */
export function nextHint(save, id) {
  const e = peekRomance(save, id) || blank();
  if (e.lost) return tf('rom.lost');
  if (e.broken) return tf('rom.broken');
  const ds = dateStatus(save, id);
  if (ds.why === 'done') return e.crisis ? t('rom.nextNone') : tf('rom.nextCrisis', { bond: RR.gates.crisis.bond });
  if (!ds.gate) return '';
  return tf('rom.next', { n: ds.n, bond: ds.gate.bond, loyalty: ds.gate.loyaltyMin, place: t(`rom.place.${ds.date.where}`) })
    + (ds.wait > 0 ? tf('rom.nextDays', { d: ds.wait }) : '');
}

/** Scene result: { sum, flags: [rf], picks: [opt] }. Date done: remember, partner = id, bond Δ. → toasts. */
export function finishDate(save, id, res) {
  const ds = dateStatus(save, id);
  if (!ds.date || ['closed', 'done'].includes(ds.why)) return [];
  const e = romanceEntry(save, id), m = romanceMeta(save);
  e.dates.push(ds.date.id); e.lastDateDay = day(save); e.flirted = true;
  m.active = id; m.last = id;
  setFlags(save, e, res.flags);
  journal(save, tf('rom.dateDone', { name: ds.date.name, who: nameOf(id) }));
  const out = [{ text: tf('rom.dateDone', { name: ds.date.name, who: nameOf(id) }), color: 'f' }];
  out.push(...addBond(save, id, res.sum || 0));
  restage(save, id);
  jealousyBarks(save, id);
  return out;
}
/** Refuse a date the companion offers: −refuseDate, once a day. */
export function refuseDate(save, id) {
  const e = romanceEntry(save, id);
  if (e.refuseDay === day(save)) return [];
  e.refuseDay = day(save);
  return addBond(save, id, RR.loss.refuseDate);
}
/** Crisis done: the choice flag; an option with Δ ≤ −8 breaks the romance. → toasts. */
export function finishCrisis(save, id, res) {
  const e = romanceEntry(save, id);
  e.crisis = res.flags?.[0] || 'done';
  setFlags(save, e, res.flags);
  const out = addBond(save, id, res.sum || 0);
  restage(save, id);
  if ((res.picks || []).some((o) => (o.d ?? 0) <= -8)) out.push(...breakUp(save, id, 'crisis'));
  return out;
}
function setFlags(save, e, flags = []) {
  save.flags = save.flags || {};
  for (const f of flags) { if (!f) continue; save.flags[f] = true; if (!e.rf.includes(f)) e.rf.push(f); }
}

// ----------------------------------------------------------------------------- jealousy
const pairKey = (a, b) => (ROMANCE_CONFLICTS[`${a}+${b}`] ? `${a}+${b}` : ROMANCE_CONFLICTS[`${b}+${a}`] ? `${b}+${a}` : [a, b].sort().join('+'));
/** Two flirted romances ≥ conflict threshold, both in the active party, pair not seen → { key, a, b, scene } | null. */
export function conflictPending(save) {
  const m = save?.romance?._;
  if (!m) return null;
  const th = RR.conflict.threshold;
  const ids = ROMANCE_IDS.filter((id) => {
    const e = save.romance[id];
    return e && !closed(e) && !e.blocked && e.bond >= th && (!RR.conflictNeedsFlirt || e.flirted) && party(save, id)?.state === 'active';
  });
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const key = pairKey(ids[i], ids[j]);
    if (m.conflicts.includes(key)) continue;
    const own = ROMANCE_CONFLICTS[key];
    const [a, b] = own ? key.split('+') : [ids[i], ids[j]];
    return { key, a, b, scene: own || ROMANCE_CONFLICTS.default };
  }
  return null;
}
/** Conflict result: flags rom-pick-<id> | rom-pick-first/second | rom-wait. Loser −bond, −loyalty, blocked. → toasts. */
export function resolveConflict(save, c, res) {
  const m = romanceMeta(save);
  if (!m.conflicts.includes(c.key)) m.conflicts.push(c.key);
  const f = (res.flags || [])[0] || 'rom-wait';
  const win = f === 'rom-pick-first' ? c.a : f === 'rom-pick-second' ? c.b : f.startsWith('rom-pick-') ? f.slice(9) : null;
  save.flags = save.flags || {};
  const out = [];
  if (!win || ![c.a, c.b].includes(win)) {
    save.flags['rom-wait'] = true;
    for (const id of [c.a, c.b]) out.push(...addBond(save, id, res.sum || 0));
    return out;
  }
  const lose = win === c.a ? c.b : c.a;
  save.flags[`rom-pick-${win}`] = true;
  out.push(...addBond(save, lose, RR.conflict.bondPenalty));
  romanceEntry(save, lose).blocked = true;
  const p = party(save, lose);
  if (p) out.push(...adjustApproval(save, p, RR.conflict.loyaltyPenalty));
  if (!partnerOf(save)) { m.active = win; m.last = win; }
  out.push({ text: tf('rom.picked', { name: nameOf(win) }), color: 'f' });
  return out;
}

// ----------------------------------------------------------------------------- death / breakup
/** A companion died (world-battle writeBack). Partner (bond ≥ minBond) → lost, mourning, farewell queued. → toasts. */
export function romanceDeath(save, id) {
  const e = peekRomance(save, id);
  if (!ROMANCE[id] || !e || closed(e) || e.bond < EV.death.minBond) return [];
  const m = romanceMeta(save);
  e.lost = true;
  save.flags = save.flags || {};
  save.flags[`romance-lost:${id}`] = true;
  m.mournDay = day(save);
  if (m.active === id) m.active = null;
  m.last = id;
  m.queue.push({ kind: 'farewell', npc: id });
  const out = [{ text: tf('rom.lostToast', { name: nameOf(id) }), color: 'c' }];
  for (const p of (save.party || []).filter((x) => x.state === 'active' && x.npc !== id)) out.push(...adjustApproval(save, p, EV.death.loyaltyOthers, { quiet: true }));
  journal(save, tf('rom.lostToast', { name: nameOf(id) }));
  return out;
}
/** Break up (talk «Расстаться» / crisis / bond fell): bond −30, loyalty −10, leaves below stayLoyalty; scene queued. */
export function breakUp(save, id, why = 'talk') {
  const e = peekRomance(save, id);
  if (!ROMANCE[id] || !e || closed(e)) return [];
  const m = romanceMeta(save);
  e.broken = true; e.why = why;
  e.bond = Math.max(0, e.bond + EV.breakup.resultBond);
  save.flags = save.flags || {};
  save.flags[`romance-broken:${id}`] = true;
  if (m.active === id) m.active = null;
  m.last = id; m.brokeDay = day(save);
  m.queue.push({ kind: 'breakup', npc: id });
  const out = [{ text: tf('rom.brokeToast', { name: nameOf(id) }), color: 'c' }];
  const p = party(save, id);
  if (p && p.state !== 'left') {
    out.push(...adjustApproval(save, p, EV.breakup.loyalty));
    if (p.state !== 'left' && (p.approval || 0) < EV.breakup.stayLoyalty) {
      p.state = 'left';
      const line = COMPANIONS[id]?.leave?.line;
      journal(save, tf('rom.leftToast', { name: nameOf(id) }) + (line ? ` «${line}»` : ''));
      out.push({ text: tf('rom.leftToast', { name: nameOf(id) }), color: 'c' });
    }
  }
  journal(save, tf('rom.brokeToast', { name: nameOf(id) }));
  return out;
}
/** Next queued scene ({ kind: farewell|breakup, npc }) — removed from the queue. */
export const takeRomanceEvent = (save) => save?.romance?._?.queue?.shift() || null;
export const hasRomanceEvent = (save) => !!save?.romance?._?.queue?.length;

// ----------------------------------------------------------------------------- epilogue
/** Epilogue of the partner (or the last one): { id, key, music, slides: [{ title, text, music }] } | null. */
export function romanceEpilogue(save) {
  const m = save?.romance?._;
  const id = m?.active || m?.last;
  const e = id && save.romance[id];
  if (!e || (!e.dates.length && !e.lost)) return null;
  const key = romanceEpilogueKey(e);
  const music = key === 'tragedy' ? RR.music.epilogueTragic : RR.music.epilogue;
  const g = heroGender(save);
  const title = tf(`rom.epi.${key}`, { name: nameOf(id) });
  const slides = (ROMANCE[id].epilogue?.[key] || []).map((text) => ({ id: `rom-${id}-${key}`, title, text: genderize(text, g), music }));
  return { id, key, music, slides };
}
