// Lore finds (docs/lore/BIBLE.md §8, content-wave1.md §6): notes of text/lore-notes.js (`where: 'loc:<node>'`, layers 1–3)
// and of world/lore-wave1.js (`where: 'stage:<qid>/<stage>' | 'cq:<qid>:<outcome>' | 'scene:<check key>'`).
// Pure, no DOM. A trigger queues the note id in save.pendingFinds; the location scene shows the «Находка» window
// (scenes/finds.js) and takeFind marks it read: codex flag `lore:<id>` (codex «Записки»), secrets progress (codex «Тайны мира»).
// Secret progress = min(found notes revealing it, WORLD_RULES.wave1.secretSteps) → «1/3 … 3/3».
import { LORE_NOTES, LORE_SECRETS } from '../data/text/lore-notes.js';
import { LORE_WAVE1, SECRETS } from '../data/world/lore-wave1.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { codexOf } from './codex.js';
import { wave1Key } from './data.js';

const STEPS = WORLD_RULES.wave1.secretSteps;
export const LORE_KEY = (id) => `lore:${id}`;

/** All notes by id: { id, title, text, reveals, where, loc?, kind, layer?, qid? }. Scene keys use the 0-based subgoal path. */
export const NOTES = {};
for (const n of LORE_NOTES) NOTES[n.id] = n;
for (const [qid, q] of Object.entries(LORE_WAVE1)) {
  for (const n of q.notes) NOTES[n.id] = { ...n, qid, kind: n.kind || 'note', where: n.where.startsWith('scene:') ? wave1Key(n.where) : n.where };
}
/** Secret titles: lore-notes titles + wave-1 secrets (with the summary text). */
export const SECRET_IDS = [...new Set([...Object.keys(LORE_SECRETS), ...Object.keys(SECRETS)])];
export const secretTitle = (id) => SECRETS[id]?.title || LORE_SECRETS[id] || id;
export const secretInfo = (id) => SECRETS[id] || null;
export const notesOfSecret = (id) => Object.values(NOTES).filter((n) => n.reveals.includes(id));

export const noteFound = (save, id) => codexOf(save).flags.includes(LORE_KEY(id));
const queued = (save, id) => (save.pendingFinds || []).includes(id);

/** Queue one note for the «Находка» window (unknown / found / queued — no-op). → true if queued. */
export function queueFind(save, id) {
  if (!NOTES[id] || noteFound(save, id) || queued(save, id)) return false;
  save.pendingFinds = [...(save.pendingFinds || []), id];
  return true;
}

/** Queue every note bound to a trigger key ('stage:…', 'cq:…', 'scene:…'). → number queued. */
export function findsAt(save, where) {
  let n = 0;
  for (const note of Object.values(NOTES)) if (note.where === where && queueFind(save, note.id)) n++;
  return n;
}

/** Node entry: up to WORLD_RULES.wave1.findsPerEntry unread notes of the node (one more on every later visit). */
export function nodeFinds(save, locId) {
  if ((save.pendingFinds || []).some((id) => NOTES[id]?.where === `loc:${locId}`)) return 0; // one still waits for the window
  let n = 0;
  for (const note of Object.values(NOTES)) {
    if (n >= WORLD_RULES.wave1.findsPerEntry) break;
    if (note.where === `loc:${locId}` && queueFind(save, note.id)) n++;
  }
  return n;
}

/** Progress of a secret: { found, total, n (0..STEPS) }. */
export function secretProgress(save, id) {
  const list = notesOfSecret(id);
  const found = list.filter((x) => noteFound(save, x.id)).length;
  return { found, total: list.length, n: Math.min(STEPS, found), steps: STEPS };
}

/**
 * Take the next queued note: marks it read (codex), → { note, secrets: [{ id, title, n, steps, solved }] } or null.
 * Notes already read through another path are skipped.
 */
export function takeFind(save) {
  while ((save.pendingFinds || []).length) {
    const id = save.pendingFinds.shift();
    const note = NOTES[id];
    if (!note || noteFound(save, id)) continue;
    codexOf(save).flags.push(LORE_KEY(id));
    const secrets = note.reveals.map((s) => { const p = secretProgress(save, s); return { id: s, title: secretTitle(s), n: p.n, steps: p.steps, solved: p.n >= p.steps }; });
    return { note, secrets };
  }
  return null;
}

/** Codex «Записки»: read lore notes [{ id, note }] in data order. */
export const readNotes = (save) => Object.values(NOTES).filter((n) => noteFound(save, n.id));
