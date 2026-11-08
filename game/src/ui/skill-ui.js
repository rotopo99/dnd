// Skills v3 UI (docs/specs/skills-v3.md): skill badges («здесь пригодится X»), the «Навыки» list of a node and the action
// window (scene → roll by the best member → outcome + toasts). Shared by scenes/location.js and scenes/roam.js.
import { t } from '../data/text/index.js';
import { C, text } from './draw.js';
import { hotspot } from './tooltip.js';
import { play } from '../audio/sfx.js';
import { queueBark } from '../world/barks.js';
import { saveGame } from '../save.js';
import { tf } from '../world/state.js';
import { skillName } from '../world/checks.js';
import { skillActionsAt, runSkillAction, skillOwners, hintLines, chancePct } from '../world/node-actions.js';

/** Two-letter badge of a skill; bright when somebody in the party has it. */
export function drawSkillBadge(ctx, skill, x, y, size, bright) {
  const name = skillName(skill);
  ctx.fillStyle = C['0']; ctx.fillRect(x, y, size, size);
  ctx.fillStyle = bright ? C.a : C['2']; ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
  ctx.fillStyle = C['1']; ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
  const f = `bold ${Math.max(9, Math.floor(size * 0.5))}px monospace`;
  text(ctx, name.slice(0, 2), x + size / 2, y + size * 0.2, bright ? C.a : C['4'], f, 'center');
}

/** A row of hint badges (right-to-left from x when align = 'right') with one tip. Returns the drawn width. */
export function drawHintBadges(ctx, save, skills, x, y, size = 22, align = 'left') {
  if (!skills.length) return 0;
  const gap = 4, w = skills.length * (size + gap) - gap;
  const x0 = align === 'right' ? x - w : x;
  skills.forEach((s, i) => drawSkillBadge(ctx, s, x0 + i * (size + gap), y, size, skillOwners(save, s).length > 0));
  hotspot(x0, y, w, size, () => ({ title: t('hint.title'), lines: hintLines(save, skills) }));
  return w;
}

/** Modal options of a node's skill actions (done — grey with the reason). */
export function skillActionOptions(game, locId, onDone) {
  return skillActionsAt(game.save, locId).map((x) => ({
    label: x.label,
    sub: x.done ? t(`nsa.${x.why}`) : x.best ? tf('nsa.sub', { skill: skillName(x.skill), dc: x.dc, who: x.best.member.name, pct: chancePct(x.best) }) : t('nsa.noSkill'),
    disabled: x.done, reason: x.done ? t(`nsa.${x.why}`) : null,
    run: (g) => openSkillAction(g, locId, x, onDone),
  }));
}

/** «Навыки» list of the node. */
export function openSkillActions(game, locId, onDone) {
  game.openModal({ title: t('nsa.group'), width: 860, lines: [],
    options: [...skillActionOptions(game, locId, onDone), { label: t('loc.close'), run: () => {} }] });
}

/** One action: the scene, then the roll and the outcome. */
export function openSkillAction(game, locId, x, onDone) {
  const owners = skillOwners(game.save, x.skill);
  game.openModal({
    title: x.label, width: 760,
    lines: [{ text: x.text }, { text: x.best ? tf('nsa.sub', { skill: skillName(x.skill), dc: x.dc, who: x.best.member.name, pct: chancePct(x.best) }) : t('nsa.noSkill'), color: owners.length ? 'a' : '4' }],
    options: [
      { label: t('nsa.go'), disabled: x.done, run: (g) => {
        const r = runSkillAction(g.save, locId, x.a);
        play(r.ok ? 'buff' : 'miss');
        if (r.ok) queueBark('check');
        saveGame(g.save);
        const head = r.outcome === 'critSuccess' ? t('nsa.crit') : r.outcome === 'critFail' ? t('nsa.critFail') : t(r.ok ? 'nsa.ok' : 'nsa.fail');
        g.openModal({ title: `${x.label}: ${head}`, width: 760, border: r.ok ? 'j' : 'c', titleColor: r.ok ? 'j' : 'c',
          lines: [
            { text: tf('nsa.roll', { who: r.member?.name || '—', skill: skillName(x.skill), nat: r.natural, total: r.total, dc: r.dc }), color: '4' },
            { text: r.text },
            ...r.toasts.map((q) => ({ text: q.text, color: q.color })),
          ],
          options: [{ label: t('battle.ok'), run: (g2) => onDone?.(g2) }] });
      } },
      { label: t('nsa.close'), run: () => {} },
    ],
  });
}

