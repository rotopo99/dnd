// Companions (docs/specs/companions-scenes.md, part 1): recruitment conditions with refusal reasons, loyalty events,
// personal quest rewards, path change. Data — data/companions.js (COMPANIONS, COMPANION_RULES); XP / levels / approval
// thresholds — world/state.js (shareXp, companionLevelUp, adjustApproval). No DOM.
import { COMPANIONS, COMPANION_RULES as CR, PERSONAL_QUESTS } from '../data/companions.js';
import { NPCS } from '../data/npcs.js';
import { ITEMS } from './data.js';
import { SKILLS } from '../data/talents.js';
import { t } from '../data/text/index.js';
import { repTier, tierAtLeast, normFaction, factionName, TIER_NAMES } from './reputation.js';
import { recruit, journal, tf, adjustApproval, effectiveRep, ensureCompanionXp } from './state.js';
import { queueBark } from './barks.js';

const E = CR.loyalty.events;
export const companionSpec = (id) => COMPANIONS[id] || null;
export const partyEntry = (save, id) => save.party.find((p) => p.npc === id) || null;
const npcName = (id) => NPCS[id]?.name || id;
/** In the party for incompatibility: active or waiting (not left / Cyberspace). */
export const inParty = (save, id) => ['active', 'waiting'].includes(partyEntry(save, id)?.state);
export const personalDone = (save, id) => save.quests[COMPANIONS[id]?.quest]?.state === 'done';
/** «Знакомство»: the first stage (meet) of the personal quest is behind. */
export function introDone(save, id) {
  const st = save.quests[COMPANIONS[id]?.quest];
  return !!st && (st.state === 'done' || st.stage !== 'meet');
}
/** Flag of a passed recruitment check / of a failed one today. */
export const checkFlag = (npcId, c) => `rc:${npcId}:${c.skills.join('+')}`;
export const checkFailFlag = (save, npcId, c) => `rcfail:${npcId}:${c.skills.join('+')}:${save.day}`;

/** Loyalty band { id, min, name } of an approval value. */
export function loyaltyBand(v) {
  const bands = CR.loyalty.bands;
  return bands.find((b) => (v ?? 0) >= b.min) || bands[bands.length - 1];
}

/**
 * State of one condition: { cond, ok, pending?, soft?, text, note?, why }.
 * pending — a check still to roll (ok after the roll, through the check scene); soft — incompatibility with friction.
 */
export function condState(save, npcId, c) {
  const why = c.why || '';
  const qName = (id) => PERSONAL_QUESTS[id]?.name || id;
  switch (c.kind) {
    case 'rep': {
      const f = normFaction(c.faction);
      return { cond: c, ok: tierAtLeast(repTier(effectiveRep(save, f)), c.min), text: tf('comp.cond.rep', { faction: factionName(f), tier: TIER_NAMES[c.min] || c.min }), why };
    }
    case 'intro': return { cond: c, ok: introDone(save, npcId), text: tf('comp.cond.intro', { quest: qName(COMPANIONS[npcId]?.quest) }), why };
    case 'quest': return { cond: c, ok: save.quests[c.id]?.state === (c.state || 'done'), text: tf('comp.cond.quest', { quest: qName(c.id) }), why };
    case 'check': {
      const passed = !!save.flags[checkFlag(npcId, c)];
      const failed = !passed && !!save.flags[checkFailFlag(save, npcId, c)];
      return { cond: c, ok: passed, pending: !passed && !failed, failed, text: tf('comp.cond.check', { skills: c.skills.map((s) => SKILLS[s]?.name || s).join('/'), dc: c.dc }),
        note: passed ? t('comp.checkPassed') : failed ? t('comp.checkTomorrow') : t('comp.checkPending'), why };
    }
    case 'pay': return { cond: c, ok: save.hero.credits >= c.credits, text: tf('comp.cond.pay', { n: c.credits }), note: t('comp.payNow'), why };
    case 'align': return { cond: c, ok: save.hero.alignment === c.is, text: tf('comp.cond.align', { is: t(`comp.align.${c.is}`) }), why };
    case 'flag': return { cond: c, ok: !!save.flags[c.flag], text: t('comp.cond.flag'), why };
    case 'item': return { cond: c, ok: (save.hero.items?.[c.item] || 0) > 0, text: tf('comp.cond.item', { item: ITEMS[c.item]?.name || c.item }), why };
    case 'level': return { cond: c, ok: save.hero.level >= c.min, text: tf('comp.cond.level', { n: c.min }), why };
    case 'notWith': {
      const together = inParty(save, c.id);
      if (!c.hard) return { cond: c, ok: true, soft: together, text: tf('comp.cond.notWithSoft', { name: npcName(c.id) }), why };
      // a hard pair is lifted by the personal quest of either of them
      const lifted = personalDone(save, npcId) || personalDone(save, c.id);
      return { cond: c, ok: !together || lifted, text: tf('comp.cond.notWith', { name: npcName(c.id) }), why };
    }
    default: return { cond: c, ok: true, text: c.kind, why };
  }
}

/**
 * Recruitment status of a companion: { npc, spec, already, left, paths: [{ id: 'main'|'alt', rows, ready, ok, checks, pay, why }] }.
 * ready — everything but pending checks holds (the player may try); ok — all done; why — the first unmet reason.
 * `left` companions come back by apology (+ leave.return Cond if any; hard incompatibilities still hold).
 */
export function recruitStatus(save, npcId) {
  const spec = companionSpec(npcId);
  const p = partyEntry(save, npcId);
  const already = !!p && p.state !== 'left';
  const left = p?.state === 'left';
  const mk = (id, conds) => {
    const rows = conds.map((c) => condState(save, npcId, c));
    const bad = rows.find((r) => !r.ok && !r.pending);
    const checks = rows.filter((r) => r.pending).map((r) => r.cond);
    const pay = rows.filter((r) => r.cond.kind === 'pay').reduce((s, r) => s + r.cond.credits, 0);
    return { id, rows, ready: !bad, ok: !bad && !checks.length, checks, pay, why: bad ? bad.why || bad.text : null };
  };
  let paths = [];
  if (left) {
    const conds = [...(spec?.leave?.return ? [spec.leave.return] : []), ...(spec?.recruit?.conditions || []).filter((c) => c.kind === 'notWith' && c.hard)];
    paths = [mk('return', conds)];
  } else if (spec) {
    paths = [mk('main', spec.recruit.conditions || [])];
    if (spec.recruit.alt?.length) paths.push(mk('alt', spec.recruit.alt));
  }
  return { npc: npcId, spec, already, left, paths };
}

/** Can be recruited right now without rolls (tests / UI): a path with ok. */
export const canJoin = (save, npcId) => recruitStatus(save, npcId).paths.some((x) => x.ok);

/** A recruitment check was rolled: success — the condition holds from now on; failure — retry tomorrow. */
export function markRecruitCheck(save, npcId, c, success) {
  if (success) save.flags[checkFlag(npcId, c)] = true;
  else save.flags[checkFailFlag(save, npcId, c)] = true;
}

/**
 * Finish recruitment by a path (all its conditions hold): pays, joins (recruit), starts the personal quest if not yet.
 * → { state, toasts } or null if the path is not ok.
 */
export function joinCompanion(save, npcId, pathId) {
  const st = recruitStatus(save, npcId);
  const path = st.paths.find((x) => x.id === pathId);
  if (!path?.ok || st.already) return null;
  if (path.pay) save.hero.credits -= path.pay;
  const state = recruit(save, npcId);
  const p = ensureCompanionXp(save, partyEntry(save, npcId));
  const out = [];
  if (path.pay) out.push({ text: tf('fx.credits', { n: `−${path.pay}` }), color: 'b' });
  if (st.left) { out.push({ text: tf('comp.returned', { name: npcName(npcId) }), color: 'a' }); journal(save, tf('comp.returned', { name: npcName(npcId) })); }
  const q = st.spec?.quest;
  if (q && !save.quests[q] && p) {
    save.quests[q] = { state: 'active', stage: PERSONAL_QUESTS[q].stages[0].id, opt: null, subs: {}, fails: {}, failedOpts: {} };
    journal(save, tf('q.new', { name: PERSONAL_QUESTS[q].name }));
    out.push({ text: tf('q.new', { name: PERSONAL_QUESTS[q].name }), color: 'h' });
  }
  return { state, toasts: out };
}

// ----------------------------------------------------------------------------- loyalty events (COMPANION_RULES.loyalty.events)
/** Loyalty change of one companion by id (in the party). → toasts. */
export function addLoyalty(save, npcId, d) {
  const p = partyEntry(save, npcId);
  if (!p || p.state === 'left') return [];
  return adjustApproval(save, p, d);
}

/** Personal quest: a stage passed (+questStage) — quests.js toStage. */
export function personalStage(save, q) {
  if (!q?.personal) return [];
  if (partyEntry(save, q.personal.npc)?.state === 'active') queueBark('questStageDone', q.personal.npc);
  return addLoyalty(save, q.personal.npc, E.questStage);
}

/** Personal quest done: +loyalty (rewards.loyalty / questDone), the alternative path unlocks. → toasts. */
export function personalQuestDone(save, q) {
  if (!q?.personal) return [];
  const npc = q.personal.npc;
  const out = addLoyalty(save, npc, q.personal.loyalty ?? E.questDone);
  const p = partyEntry(save, npc);
  const alt = COMPANIONS[npc]?.altPath;
  if (q.personal.altPath && alt && p) {
    p.altUnlocked = true;
    out.push({ text: tf('comp.altUnlocked', { name: npcName(npc), path: alt, n: CR.levelup.altPathAtLevel }), color: 'a' });
  }
  return out;
}

/** Path change (once, from level altPathAtLevel, after the personal quest): { ok, why }. */
export function canChangePath(save, npcId, data) {
  const p = partyEntry(save, npcId);
  const alt = COMPANIONS[npcId]?.altPath;
  const cls = data?.CLASSES?.[NPCS[npcId]?.cls];
  if (!p || p.state === 'left' || !alt || !cls?.paths?.some((x) => x.id === alt)) return false;
  return !!p.altUnlocked && !p.pathChanged && (p.level || 1) >= CR.levelup.altPathAtLevel;
}
export function changePath(save, npcId, data) {
  if (!canChangePath(save, npcId, data)) return [];
  const p = partyEntry(save, npcId);
  const alt = COMPANIONS[npcId].altPath;
  p.path = alt; p.pathChanged = true; p.hp = null; p.mrl = null;
  const name = data.CLASSES[NPCS[npcId].cls].paths.find((x) => x.id === alt)?.name || alt;
  journal(save, tf('comp.pathChanged', { name: npcName(npcId), path: name }));
  return [{ text: tf('comp.pathChanged', { name: npcName(npcId), path: name }), color: 'a' }];
}

/**
 * After a won battle: downed and not raised −downedInBattle, raised by the hero +reviveInBattle, every 3 clean wins
 * (nobody of the party down) +sharedVictory. units — battle units; revived — set of companion npc ids raised by the hero.
 */
export function battleLoyalty(save, units, revived = new Set()) {
  const out = [];
  const party = save.party.filter((p) => p.state === 'active');
  const down = (p) => { const u = units.find((x) => x.id === `c-${p.npc}`); return !!u && (u.down || u.dead); };
  const clean = !party.some(down) && !units.find((u) => u.id === 'hero' && (u.down || u.dead));
  for (const p of party) {
    if (revived.has(p.npc)) out.push(...adjustApproval(save, p, E.reviveInBattle));
    if (down(p)) out.push(...adjustApproval(save, p, E.downedInBattle));
    if (clean) {
      p.cleanWins = (p.cleanWins || 0) + 1;
      if (p.cleanWins >= 3) { p.cleanWins = 0; out.push(...adjustApproval(save, p, E.sharedVictory)); }
    }
  }
  return out;
}

/** Rest / camp: soft-incompatible pairs together in the active party lose frictionRest each (until a personal quest is done). */
export function restLoyalty(save) {
  const out = [];
  const act = save.party.filter((p) => p.state === 'active');
  for (const p of act) {
    const soft = (COMPANIONS[p.npc]?.recruit?.conditions || []).filter((c) => c.kind === 'notWith' && !c.hard && act.some((x) => x.npc === c.id));
    const ends = CR.friction.endsWhenQuestDone;
    if (soft.some((c) => !(ends && (personalDone(save, p.npc) || personalDone(save, c.id))))) out.push(...adjustApproval(save, p, E.frictionRest));
  }
  if (act.length) queueBark('campRest');
  return out;
}

/** Waiting on a hub: −leftWaiting for every 3 days since p.waitDay. Call when days pass. → toasts. */
export function waitingLoyalty(save) {
  const out = [];
  for (const p of save.party) {
    if (p.state !== 'waiting') { if (p.state === 'active') p.waitDay = save.day; continue; }
    if (!Number.isFinite(p.waitDay)) p.waitDay = save.day;
    const n = Math.floor((save.day - p.waitDay) / 3);
    if (n > 0) { p.waitDay += n * 3; out.push(...adjustApproval(save, p, E.leftWaiting * n)); }
  }
  return out;
}
