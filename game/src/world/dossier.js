// Dossier «защита по форме» (docs/specs/content-wave4.md §1). Pure: reads save.flags / hero.items / party only.
//   dossierRows(save)      rows of DOSSIER (+ companion witnesses) that count now: [{ id, pts }]
//   dossierPoints(save)    Σ pts, capped by DOSSIER_RULES.cap (12)
//   dossierDc(save, goal)  DC of a goal with dcFrom: 'dossier' (inside: 17 − ⌊pts/2⌋, min 11) or dossierPer (verdict: −1 per 3)
//   courtLimits(save, g)   { successes, failures } of the inside challenge (≥ 6 pts: +1 failure; c11 torn / signature)
//   applyDossier(save)     entering mq3-court/inside: snapshot save.dossier + flags dossier-<2..12 step 2>, ≥ 8 pts → court-proof
import { DOSSIER, DOSSIER_WITNESSES, DOSSIER_RULES as R } from '../data/world/dossier.js';

const flagOn = (save, f) => !!save?.flags?.[f];
const inPartyLoy = (save, npc, min) => (save?.party || []).some((p) => p.npc === npc && ['active', 'waiting'].includes(p.state) && (p.approval || 0) >= min);

export function dossierRows(save) {
  const out = [];
  for (const r of DOSSIER) {
    if (r.unless && flagOn(save, r.unless)) continue;
    const ok = (r.flag && flagOn(save, r.flag)) || (r.any || []).some((f) => flagOn(save, f)) || (r.item && (save?.hero?.items?.[r.item] || 0) > 0);
    if (ok) out.push({ id: r.id, pts: r.pts });
  }
  for (const w of DOSSIER_WITNESSES) if (inPartyLoy(save, w.npc, w.minLoy)) out.push({ id: `witness-${w.npc}`, pts: w.pts });
  return out;
}

export function dossierPoints(save) {
  return Math.min(R.cap, dossierRows(save).reduce((a, r) => a + r.pts, 0));
}

/** DC by the dossier: goal.dcFrom 'dossier' — the inside formula; goal.dossierPer N — −1 per N points from goal.dc. */
export function dossierDc(save, goal, dc = goal.dc || 0) {
  const pts = dossierPoints(save);
  if (goal.dcFrom === 'dossier') return Math.max(R.inside.min, R.inside.base - Math.floor(pts / R.inside.per));
  if (goal.dossierPer) return dc - Math.floor(pts / goal.dossierPer);
  return dc;
}

/** Successes / failures of the court challenge (inside): the dossier and the c11 consent outcome move them. */
export function courtLimits(save, goal) {
  let successes = goal.successes || 0, failures = goal.failures || 0;
  if (goal.dcFrom !== 'dossier') return { successes, failures };
  if (dossierPoints(save) >= R.extraFail) failures += 1;
  if (flagOn(save, 'consent-torn')) successes += R.torn.successes;
  if (flagOn(save, 'judge-has-signature')) failures += R.signature.failures;
  return { successes: Math.max(1, successes), failures: Math.max(1, failures) };
}

/** Entering the court: the snapshot for the UI / epilogue and the automatic proof (≥ R.proof). */
export function applyDossier(save) {
  const pts = dossierPoints(save);
  save.dossier = pts;
  for (const n of R.marks) if (pts >= n) save.flags[`dossier-${n}`] = true; // snapshot flags for scenes / stage swaps
  if (pts >= R.proof) save.flags['court-proof'] = true;
  return pts;
}

export const dossierAtLeast = (save, n) => dossierPoints(save) >= n;
export { R as DOSSIER_RULES };
