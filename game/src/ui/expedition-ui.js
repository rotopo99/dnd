// Errands of the reserve UI (docs/specs/expeditions.md §6): list → companion → type → target → mode (DC, chance, days, risk) → sent.
// openExpeditions(game, onDone) — from location.js («Поручения резерву») and base.js (idle menu). Logic — world/expeditions.js.
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { EXP_TYPES, EXP_RULES } from '../data/world/expeditions.js';
import { tf } from '../world/state.js';
import { canSend, expTargets, expPlan, startExp, expBusy, MODES } from '../world/expeditions.js';
import { idleHomeName } from '../world/companions.js';
import { skillName } from '../world/checks.js';
import { saveGame } from '../save.js';
import { play } from '../audio/sfx.js';

const nameOf = (p) => NPCS[p.npc]?.name || p.npc;
const toastAll = (g, list) => { for (const x of list || []) g.toast(x.text, x.color); };

/** Reserve list: who can go (or why not) and who is away. */
export function openExpeditions(game, onDone) {
  const sv = game.save;
  const list = sv.party.filter((p) => p.state === 'waiting');
  const done = (g) => onDone?.(g);
  const options = list.map((p) => {
    const c = canSend(sv, p);
    const busy = expBusy(sv, p);
    return { label: `${nameOf(p)} · ${t('world.level')} ${p.level || 1}`, sub: busy || (c.ok ? t('exp.send') : c.why), disabled: !c.ok, reason: c.why,
      run: (g) => pickType(g, p, done) };
  });
  const lines = list.length ? [] : [{ text: t('exp.none'), color: '4' }];
  game.openModal({ title: t('exp.menu'), lines, onCancel: done, options: [...options, { label: t('loc.close'), run: done }] });
}

function pickType(game, p, done) {
  const sv = game.save;
  game.openModal({ title: `${t('exp.pickType')} — ${nameOf(p)}`, lines: [], onCancel: done,
    options: [...Object.entries(EXP_TYPES).map(([id, T]) => {
      const targets = expTargets(sv, p, id);
      const any = targets.some((x) => x.ok);
      return { label: T.name, sub: any ? `${T.days[0]}–${T.days[1]} ${t('exp.days')} · ${T.desc}` : (targets[0]?.why || T.desc), disabled: !any,
        tip: { title: T.name, lines: [T.desc, T.skills.length ? T.skills.map(skillName).join(', ') : ''] }, run: (g) => pickTarget(g, p, id, done) };
    }), { label: t('loc.close'), run: done }] });
}

function pickTarget(game, p, type, done) {
  const sv = game.save;
  const targets = expTargets(sv, p, type);
  game.openModal({ title: `${t('exp.pickTarget')} — ${EXP_TYPES[type].name}`, lines: [], onCancel: done,
    options: [...targets.map((x) => {
      const pl = x.ok ? expPlan(sv, p, type, x.id, 'normal') : null;
      return { label: x.name, sub: x.ok ? tf('exp.modeSub', { k: 1, days: pl.days, dc: pl.dc, chance: Math.round(pl.chance * 100) }) : x.why, disabled: !x.ok, run: (g) => pickMode(g, p, type, x.id, done) };
    }), { label: t('loc.close'), run: done }] });
}

function pickMode(game, p, type, target, done) {
  const sv = game.save;
  const plans = MODES.map((m) => expPlan(sv, p, type, target, m));
  const pl0 = plans[1];
  const lines = [{ text: `${nameOf(p)} · ${EXP_TYPES[type].name}${pl0.skill ? ` · ${skillName(pl0.skill)}` : ''}`, color: 'a' }];
  if (type === 'trade') lines.push({ text: tf('exp.goods', { n: pl0.value }), color: 'b' });
  lines.push({ text: `${tf('exp.why.away', { place: idleHomeName(sv, p) || '—' })}`, color: '4' });
  game.openModal({ title: `${t('exp.pickMode')}`, lines, onCancel: done,
    options: [...plans.map((pl) => ({
      label: t(`exp.mode.${pl.mode}`),
      sub: `${tf('exp.modeSub', { k: EXP_RULES[pl.mode].rewardMul, days: pl.days, dc: pl.dc, chance: Math.round(pl.chance * 100) })} · ${pl.risk.death ? t('exp.riskDeath') : pl.risk.captive ? t('exp.riskCaptive') : t('exp.riskNone')}`,
      subColor: pl.risk.death ? 'c' : null,
      run: (g) => { toastAll(g, startExp(sv, p, pl)); play('uiClick'); saveGame(sv); done(g); },
    })), { label: t('loc.close'), run: done }] });
}

/** «Вернулся» window for the unseen results at this node. */
export function openExpResults(game, list, onDone) {
  const lines = [];
  for (const p of list) {
    const r = p.expResult;
    lines.push({ text: `${nameOf(p)}: ${r.text}`, color: ['great', 'success', 'partial'].includes(r.outcome) ? 'j' : 'c' });
    if (r.got?.length) lines.push({ text: `  ${r.got.join(', ')}`, color: 'a' });
    r.seen = true;
  }
  saveGame(game.save);
  game.openModal({ title: t('exp.returned'), lines, onCancel: (g) => onDone?.(g), options: [{ label: t('battle.continue'), run: (g) => onDone?.(g) }] });
}
