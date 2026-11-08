// Quest consequences for the world (docs/specs/world-consequences.md, part 1). Data — data/world/consequences.js.
// At a quest's reward (quests.js `reward`: direct, claimTurnin, radio) `applyConsequences` sets the flag
// `cq:<qid>:<outcome>` and appends { qid, o, day } to save.cq (once per quest, a repeat does nothing). Only `rep` is
// applied at once; everything else is derived from save.cq on the fly (old saves / data edits stay consistent):
//   vendorMods (prices ×mult 0.7–1.5, add/remove stock, closed), npcs (data.js npcPlacement), access (closedLoc),
//   nodeMarks (description + map glyph, the latest entry for a node wins), worldRumors, consequenceLog, epilogue.
import { CONSEQUENCES, CQ_FLAG, EPILOGUE } from '../data/world/consequences.js';
import { NPCS } from '../data/npcs.js';
import { LOCATIONS, resolveLocation, ROUTES, QUESTS } from './data.js';
import { applyRep, factionName } from './reputation.js';
import { journal, tf, repToasts } from './state.js';

export { CQ_FLAG };
export const EPI_MAX = 12;           // spec: no more than 12 slides by prio (intro and outro always)
export const CQ_TOASTS = 3;          // spec: max 3 toast lines per quest
export const VENDOR_MULT = [0.7, 1.5];
export const FINAL_FLAG = 'game-complete'; // mq3-court rewards — the finale opens the epilogue

const npcName = (id) => NPCS[id]?.name || id;
const locName = (id) => LOCATIONS[resolveLocation(id)]?.name || id;

/** Outcome key of a finished quest for CONSEQUENCES: st.outcome if it has an entry, else the latest path id that is a key. */
export function cqOutcome(save, qid) {
  const c = CONSEQUENCES[qid];
  const st = save.quests?.[qid];
  if (!c || !st) return 'default';
  if (st.outcome && c[st.outcome]) return st.outcome;
  const keys = Object.keys(c).filter((k) => k !== 'default');
  const hist = [...(st.path || []), st.opt, st.stage].filter(Boolean);
  for (let i = hist.length - 1; i >= 0; i--) {
    const k = keys.find((x) => x === hist[i] || `end-${x}` === hist[i]);
    if (k) return k;
  }
  return 'default';
}

export const cqApplied = (save, qid) => (save.cq || []).some((c) => c.qid === qid);
const entries = (save) => (save?.cq || []).map((c) => ({ ...c, e: CONSEQUENCES[c.qid]?.[c.o] || CONSEQUENCES[c.qid]?.default })).filter((c) => c.e);

/** Short lines of one consequence entry (toasts and journal). */
export function cqLines(e) {
  const out = [];
  for (const n of e.nodes || []) out.push(tf('cq.node', { loc: locName(n.loc) }));
  for (const v of e.vendors || []) {
    if (v.close) out.push(tf('cq.vendorClose', { npc: npcName(v.npc) }));
    else if (v.mult && v.mult !== 1) out.push(tf(v.mult > 1 ? 'cq.vendorUp' : 'cq.vendorDown', { npc: npcName(v.npc) }));
    if (!v.close && v.add?.length) out.push(tf('cq.vendorAdd', { npc: npcName(v.npc) }));
    if (!v.close && v.remove?.length) out.push(tf('cq.vendorRemove', { npc: npcName(v.npc) }));
  }
  for (const a of e.npcs?.appear || []) out.push(tf('cq.appear', { npc: npcName(a.npc), loc: locName(a.at) }));
  for (const n of e.npcs?.vanish || []) out.push(tf('cq.vanish', { npc: npcName(n) }));
  for (const a of e.npcs?.move || []) out.push(tf('cq.move', { npc: npcName(a.npc), loc: locName(a.to) }));
  for (const l of e.access?.close || []) out.push(tf('cq.close', { loc: locName(l) }));
  for (const l of e.access?.open || []) out.push(tf('cq.open', { loc: locName(l) }));
  if (e.rumors?.length) out.push(tf('cq.rumor'));
  return out;
}

/**
 * Apply a finished quest's consequences once. → toasts (rep changes + «Мир изменился: …», max CQ_TOASTS) and journal
 * entries. Final quest (flag game-complete) → save.pendingEpilogue (the location scene opens the epilogue).
 */
export function applyConsequences(save, qid) {
  const c = CONSEQUENCES[qid];
  if (!c || cqApplied(save, qid)) return [];
  const o = cqOutcome(save, qid);
  const e = c[o] || c.default;
  if (!e) return [];
  save.flags[CQ_FLAG(qid, o)] = true;
  save.cq = [...(save.cq || []), { qid, o, day: save.day }];
  const out = [];
  for (const [f, d] of Object.entries(e.rep || {})) if (d) out.push(...repToasts(applyRep(save, f, d)));
  // access.open: the place and its hidden routes become known (as state.openHidden)
  for (const raw of e.access?.open || []) {
    const id = resolveLocation(raw);
    if (!LOCATIONS[id]) continue;
    if (!save.discovered.includes(id)) save.discovered.push(id);
    for (const r of ROUTES) if ((r.from === id || r.to === id) && r.hidden) save.flags[`route:${r.from}:${r.to}`] = true;
  }
  const lines = cqLines(e);
  const name = QUESTS[qid]?.name || qid;
  for (const l of lines) journal(save, tf('cq.journal', { name, text: l }));
  for (const l of lines.slice(0, CQ_TOASTS)) out.push({ text: tf('cq.toast', { text: l }), color: 'h' });
  return out;
}

/** Quest finale reached → the epilogue waits for the location scene. */
export function markFinale(save) {
  if (save.flags[FINAL_FLAG] && !save.flags['epilogue-seen']) save.pendingEpilogue = true;
}

/** Vendor changes: { mult (clamped), add: [itemId], remove: Set, closed }. */
export function vendorMods(save, npcId) {
  let mult = 1, closed = false;
  const add = [], remove = new Set();
  for (const { e } of entries(save)) for (const v of e.vendors || []) {
    if (v.npc !== npcId) continue;
    if (v.mult) mult *= v.mult;
    for (const id of v.add || []) { if (!add.includes(id)) add.push(id); remove.delete(id); }
    for (const id of v.remove || []) remove.add(id);
    if (v.close) closed = true;
  }
  if (save?.npcs?.[npcId]?.dead || save?.npcs?.[npcId]?.shopClosed) closed = true;
  return { mult: Math.max(VENDOR_MULT[0], Math.min(VENDOR_MULT[1], mult)), add, remove, closed };
}
export const shopClosed = (save, npcId) => vendorMods(save, npcId).closed;

/** Access state of a place: 'closed' | 'open' | null (no change); the latest consequence wins. */
export function accessOf(save, raw) {
  const id = resolveLocation(raw);
  let st = null;
  for (const { e } of entries(save)) {
    if ((e.access?.open || []).some((l) => resolveLocation(l) === id)) st = 'open';
    if ((e.access?.close || []).some((l) => resolveLocation(l) === id)) st = 'closed';
  }
  return st;
}
export const closedLoc = (save, raw) => accessOf(save, raw) === 'closed';

/**
 * Node marks: { descs: [string] (all, oldest first), glyph, tone } of the latest entry; null — unchanged.
 * A node entry with `until: [flag]` is hidden once any of the flags stands; a later entry with `glyph: null` removes the icon.
 */
export function nodeMark(save, raw) {
  const id = resolveLocation(raw);
  let m = null;
  for (const { e } of entries(save)) for (const n of e.nodes || []) {
    if (resolveLocation(n.loc) !== id) continue;
    if ((n.until || []).some((f) => save.flags?.[f])) continue; // an antagonist flag hides the mark
    m = m || { descs: [] };
    m.descs.push(n.desc);
    m.glyph = n.glyph; m.tone = n.tone;
  }
  return m;
}
export const TONE_COLOR = { good: 'j', bad: 'c', warn: 'a' };

/** Rumors of the world while their flags stand. */
export function worldRumors(save) {
  return entries(save).flatMap(({ e }) => e.rumors || []);
}

/** Journal section «Последствия»: [{ qid, name, day, lines }], newest first. */
export function consequenceLog(save) {
  return entries(save).map(({ qid, day, e }) => ({ qid, name: QUESTS[qid]?.name || qid, day, lines: cqDetail(e) })).reverse();
}
/** Journal lines of an entry (QA v9 B11): what the places look like now, the reputation shifts, then the short lines. */
export function cqDetail(e) {
  const out = (e.nodes || []).map((n) => n.desc).filter(Boolean);
  for (const [f, d] of Object.entries(e.rep || {})) if (d) out.push(tf('cq.rep', { faction: factionName(f), d: `${d > 0 ? '+' : ''}${d}` }));
  return [...out, ...cqLines(e).filter((l) => !(e.nodes || []).some((n) => l === tf('cq.node', { loc: locName(n.loc) })))];
}

/** Epilogue slides by flags: when.all / any / not; ≤ EPI_MAX by prio, shown by order; intro and outro always. */
export function epilogueSlides(save, max = EPI_MAX) {
  const f = save?.flags || {};
  const ok = (w = {}) => (!w.all || w.all.every((x) => f[x])) && (!w.any || w.any.some((x) => f[x])) && (!w.not || !w.not.some((x) => f[x]));
  const fixed = EPILOGUE.filter((s) => s.id === 'epi-intro' || s.id === 'epi-outro');
  const pool = EPILOGUE.filter((s) => !fixed.includes(s) && ok(s.when)).sort((a, b) => b.prio - a.prio).slice(0, Math.max(0, max - fixed.length));
  return [...fixed, ...pool].sort((a, b) => a.order - b.order);
}
