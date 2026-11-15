// Context menu items of the free map (docs/specs/controls-divinity.md §2) — pure: the scene gathers the facts (env),
// this builds the ordered list. Order: talk, trade, recruit / hire, other NPC services, quest, give, steal, attack,
// inspect, skill, hack, search, use, pin, go. Unavailable items stay (grey) with a reason.
//   ctxItems(kind, env) -> [{id, label, disabled?, reason?, sub?}]
//   kind: 'npc' | 'post' | 'hostile' | 'corpse' | 'obj' | 'skill' | 'member' | 'cell' | 'unit' (battle)
//   env: { acts (npc-actions npcActions), sneak, behind, theftMod, quests, gifts, reach, obj (objectAction kind), opened,
//          skills (open skill actions here), passable, hero (member is the hero), foe (battle: enemy), canAttack, pinned }
//   onlyInspect(items) -> true when the menu would hold only «Осмотреть» (then the scene shows a toast instead)
import { t } from '../data/text/index.js';

const tf = (key, vars = {}) => t(key).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

const it = (id, extra = {}) => ({ id, label: t(`ctx.${id}`), ...extra });

export function ctxItems(kind, env = {}) {
  const out = [];
  if (kind === 'npc') {
    const acts = env.acts || [];
    const byId = (id) => acts.find((a) => a.id === id);
    const far = env.reach === false ? t('ctx.far') : null;
    const talk = byId('talk');
    if (talk) out.push({ ...it('talk'), disabled: !!far, reason: far });
    for (const a of acts) {
      if (['talk', 'steal', 'attack'].includes(a.id)) continue;
      out.push({ id: a.id, label: a.label, disabled: !!a.disabled || !!far, reason: a.reason || far });
    }
    if (env.quests) out.push({ ...it('quest'), sub: tf('ctx.questSub', { n: env.quests }), disabled: !!far, reason: far });
    if (env.gifts != null) out.push({ ...it('give'), disabled: !env.gifts, reason: env.gifts ? null : t('ctx.noGift') });
    const steal = byId('steal');
    if (steal) {
      const why = !env.sneak ? t('ctx.needSneak') : steal.disabled ? steal.reason : null;
      out.push({ ...it('steal'), disabled: !!why, reason: why, sub: !why && env.theftMod ? tf('roam.theftSub', { n: env.theftMod }) : null });
    }
    const atk = byId('attack');
    if (atk) out.push({ ...it('attack'), disabled: !!atk.disabled, reason: atk.reason });
    out.push(it('inspect'));
    return out;
  }
  if (kind === 'post' || kind === 'hostile') {
    out.push({ ...it('attack'), sub: env.sneak && env.behind ? t('ctx.surpriseSub') : null });
    out.push(it('inspect'));
    return out;
  }
  if (kind === 'member') {
    out.push(it('select'));
    if (!env.hero && env.gifts != null) out.push({ ...it('give'), disabled: !env.gifts, reason: env.gifts ? null : t('ctx.noGift') });
    out.push(it('inspect'));
    return out;
  }
  if (kind === 'skill') {
    out.push({ ...it('skill'), sub: env.sub || null });
    out.push(it('inspect'));
    return out;
  }
  if (kind === 'obj') {
    const k = env.obj;
    if (k === 'trade') out.push(it('trade'));
    if (k === 'terminal') out.push(it('hack'));
    if (k === 'stash' || k === 'cache' || k === 'empty') out.push({ ...it('search'), disabled: k === 'empty', reason: k === 'empty' ? t('roam.stashOpened') : null });
    if (['rest', 'disassemble', 'exit', 'transit'].includes(k)) out.push(it(k === 'exit' ? 'leave' : 'use'));
    if (env.skills) out.push({ ...it('skill'), sub: tf('ctx.skillSub', { n: env.skills }) });
    out.push(it('inspect'));
    return out;
  }
  if (kind === 'unit') { // battle (§6): attack an enemy, pin the card, inspect
    if (env.foe) out.push({ ...it('attack'), disabled: !env.canAttack, reason: env.canAttack ? null : t('ctx.noAttack') });
    out.push({ ...it('pin'), label: env.pinned ? t('ctx.unpin') : t('ctx.pin') });
    out.push(it('inspect'));
    return out;
  }
  if (kind === 'cell') {
    if (env.passable) out.push(it('go'));
    if (env.skills) out.push({ ...it('skill'), sub: tf('ctx.skillSub', { n: env.skills }) });
    out.push(it('inspect'));
    return out;
  }
  out.push(it('inspect')); // corpse and the rest
  return out;
}

export const onlyInspect = (items) => items.length === 1 && items[0].id === 'inspect';
