// Recruitment dialogue (companions-scenes.md): the companion's pitch, the list of conditions with marks and refusal
// reasons, «Позвать» / «Запасной путь» / «Извиниться». Checks of a path roll through the check scene (autoScene).
import { t } from '../data/text/index.js';
import { recruitStatus, markRecruitCheck, joinCompanion } from '../world/companions.js';
import { members, tf } from '../world/state.js';
import { openCheckScene } from '../scenes/check-scene.js';
import { plainScene } from '../world/check-run.js';
import { saveGame } from '../save.js';

const mark = (r) => (r.ok ? '✓' : r.pending ? '?' : '✗');
const rowColor = (r) => (r.ok ? (r.soft ? 'a' : 'j') : r.pending ? 'a' : 'c');

/** Lines of a path's conditions: «✓ text — note» or «✗ text — why». */
export function pathLines(path) {
  return path.rows.map((r) => ({ text: `${mark(r)} ${r.text}${!r.ok && !r.pending && r.why ? ` — ${r.why}` : r.note ? ` (${r.note})` : r.pending && r.why ? ` — ${r.why}` : ''}`, color: rowColor(r) }));
}

/** openRecruit(game, npc, onDone(game, joined)) */
export function openRecruit(game, npc, onDone) {
  const sv = game.save;
  const st = recruitStatus(sv, npc.id);
  const lines = [];
  if (st.left) lines.push({ text: tf('comp.apologyText', { name: npc.name, n: -40 }), color: '4' });
  else if (st.spec?.recruit?.pitch) lines.push({ text: `«${st.spec.recruit.pitch}»`, color: '5' });
  const main = st.paths.find((x) => x.id !== 'alt');
  const alt = st.paths.find((x) => x.id === 'alt');
  if (main?.rows.length) { lines.push({ text: t('comp.conditions'), color: 'a' }, ...pathLines(main)); }
  if (alt) { lines.push({ text: t('comp.alt'), color: 'a' }, ...pathLines(alt)); }
  const label = (p) => (p.id === 'return' ? t('comp.apologize') : p.id === 'alt' ? t('comp.hireAlt') : t('comp.hire'));
  game.openModal({
    title: tf('comp.recruitTitle', { name: npc.name }), width: 1000, lines,
    options: [
      ...st.paths.map((p) => ({ label: label(p), sub: p.ready ? (p.checks.length ? t('comp.checkPending') : null) : tf('comp.blocked', { why: p.why }),
        disabled: !p.ready, reason: p.why, run: (g) => runPath(g, npc, p, onDone) })),
      { label: t('comp.later'), run: (g) => onDone?.(g, false) },
    ],
    onCancel: (g) => onDone?.(g, false),
  });
}

/** Roll the pending checks of a path one by one, then join. */
function runPath(game, npc, path, onDone) {
  const sv = game.save;
  const [c, ...rest] = path.checks;
  if (!c) {
    const r = joinCompanion(sv, npc.id, path.id);
    if (!r) return onDone?.(game, false);
    for (const x of r.toasts) game.toast(x.text, x.color);
    game.toast(`${npc.name}: ${t(r.state === 'active' ? 'loc.joined' : 'loc.waiting')}`, 'j');
    saveGame(sv);
    return onDone?.(game, true);
  }
  openCheckScene(game, {
    title: tf('comp.recruitTitle', { name: npc.name }), scene: plainScene(c.skills, c.why), dc: c.dc, members: members(sv, game.data),
    memoKey: `recruit:${npc.id}:${c.skills.join('+')}`,
    onDone: (g, ok) => {
      markRecruitCheck(sv, npc.id, c, ok);
      if (!ok) { g.toast(tf('comp.recruitFailed', { name: npc.name }), 'c'); saveGame(sv); return onDone?.(g, false); }
      runPath(g, npc, { ...path, checks: rest }, onDone);
    },
    onCancel: (g) => onDone?.(g, false),
  });
}
