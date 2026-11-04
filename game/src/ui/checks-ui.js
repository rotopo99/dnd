// Skill check windows (world.md §5, UI): pick who rolls, see mode (advantage/disadvantage and why), DC, dice.
// openCheck — single check; openGroupCheck — everyone rolls, success if at least half pass;
// openChallenge — N successes before M failures, each round: skill + performer.
import { t } from '../data/text/index.js';
import { checkInfo, checkChance, rollCheck, skillName } from '../world/checks.js';
import { play } from '../audio/sfx.js';

const MODE = { adv: 'check.adv', normal: 'check.normal', dis: 'check.dis' };
const sign = (n) => (n >= 0 ? `+${n}` : `−${-n}`);

function modeReason(info) {
  const r = [];
  if (info.kind === 'spec') r.push(t('check.spec'));
  else if (info.kind === 'related') r.push(t('check.related'));
  else r.push(t('check.other'));
  for (const n of info.notes) r.push(n.adv ? `${t('check.advFrom')}: ${n.text}` : `${sign(n.bonus)} ${n.text}`);
  return r.join(' · ');
}

export function resultLines(name, res) {
  const i = res.info;
  const dice = res.rolls.length > 1 ? `[${res.rolls.join('|')}]` : `[${res.natural}]`;
  return [
    { text: `${t('check.who')}: ${name} · ${skillName(i.skill)} (${t(`stat.${i.stat}`)})`, color: '5' },
    { text: `${t(MODE[i.mode])} — ${modeReason(i)}`, color: i.mode === 'adv' ? 'j' : i.mode === 'dis' ? 'c' : '4' },
    { text: `d20${dice} ${sign(i.statMod)} ${t('check.statMod')}${i.prof ? ` +${i.prof} ${t('check.prof')}` : ''}${i.bonus ? ` ${sign(i.bonus)} ${t('check.talents')}` : ''} = ${res.total} ${t('battle.vs')} ${t('battle.dc')} ${res.dc}`, color: '5' },
    { text: res.success ? t('check.success') : t('check.fail'), color: res.success ? 'j' : 'c', font: 'bold 24px monospace' },
  ];
}

function performerOptions(members, skill, dc, extraAdv, pick) {
  return members.map((m) => {
    const info = checkInfo(m, skill, extraAdv);
    return {
      label: m.name, sub: `${t(MODE[info.mode])} · ${sign(info.total)} · ${Math.round(checkChance(info, dc) * 100)}%`,
      run: (game) => pick(game, m, info),
    };
  });
}

/**
 * openCheck(game, { title, lines?, skill, dc, members, extraAdv?, cancel?, onDone(game, success, res) })
 * cancel — show «Отмена» (onDone not called).
 */
export function openCheck(game, o) {
  if (!o.skill && o.skills) {
    if (o.skills.length === 1) return openCheck(game, { ...o, skill: o.skills[0] });
    game.openModal({
      title: o.title, lines: [...(o.lines || []), { text: `${t('check.pickSkill')} · ${t('battle.dc')} ${o.dc}`, color: 'a' }],
      onCancel: o.cancel ? undefined : false,
      options: [...o.skills.map((sk) => ({ label: skillName(sk), sub: bestOf(o.members, sk, o.dc, o.extraAdv), run: (g) => openCheck(g, { ...o, skill: sk, cancel: false }) })),
        ...(o.cancel ? [{ label: t('check.cancel'), run: () => {} }] : [])],
    });
    return;
  }
  const opts = performerOptions(o.members, o.skill, o.dc, o.extraAdv, (g, m, info) => {
    const res = rollCheck(m, info, o.dc);
    play(res.success ? 'buff' : 'miss');
    g.openModal({
      title: o.title, lines: resultLines(m.name, res), border: res.success ? 'j' : 'c', onCancel: false,
      options: [{ label: t('battle.continue'), run: (g2) => o.onDone(g2, res.success, res, m) }],
    });
  });
  if (o.cancel) opts.push({ label: t('check.cancel'), run: () => {} });
  game.openModal({
    title: o.title,
    lines: [...(o.lines || []), { text: `${skillName(o.skill)}, ${t('battle.dc')} ${o.dc}. ${t('check.pick')}`, color: 'a' }],
    options: opts, onCancel: o.cancel ? undefined : false,
  });
}

function bestOf(members, skill, dc, extraAdv) {
  let best = null;
  for (const m of members) {
    const c = checkChance(checkInfo(m, skill, extraAdv), dc);
    if (!best || c > best.c) best = { c, m };
  }
  return best ? `${t('check.best')}: ${best.m.name} · ${Math.round(best.c * 100)}%` : '';
}

/** Everyone rolls; success when at least half pass. With o.skills — the party picks one skill first. */
export function openGroupCheck(game, o) {
  if (!o.skill && o.skills) {
    if (o.skills.length === 1) return openGroupCheck(game, { ...o, skill: o.skills[0] });
    game.openModal({ title: o.title, lines: [...(o.lines || []), { text: `${t('check.group')}: ${t('check.pickSkill')} · ${t('battle.dc')} ${o.dc}`, color: 'a' }], onCancel: false,
      options: o.skills.map((sk) => ({ label: skillName(sk), run: (g) => openGroupCheck(g, { ...o, skill: sk }) })) });
    return;
  }
  const lines = [];
  let ok = 0;
  for (const m of o.members) {
    const res = rollCheck(m, checkInfo(m, o.skill, o.extraAdv), o.dc);
    if (res.success) ok++;
    lines.push({ text: `${m.name}: d20[${res.rolls.join('|')}] ${sign(res.info.total)} = ${res.total} — ${res.success ? t('check.success') : t('check.fail')}`, color: res.success ? 'j' : 'c' });
  }
  const success = ok * 2 >= o.members.length;
  lines.push({ text: `${t('check.group')}: ${ok}/${o.members.length} — ${success ? t('check.success') : t('check.fail')}`, color: success ? 'j' : 'c', font: 'bold 24px monospace' });
  game.openModal({
    title: o.title, lines: [...(o.lines || []), { text: `${skillName(o.skill)}, ${t('battle.dc')} ${o.dc}`, color: 'a' }, ...lines],
    onCancel: false, options: [{ label: t('battle.continue'), run: (g) => o.onDone(g, success) }],
  });
}

/** Skill challenge: { title, lines, skills, dc, successes, failures, members, forgiveFirst?, onDone(game, success) }. */
export function openChallenge(game, o) {
  const st = { ok: 0, bad: 0, forgiven: !o.forgiveFirst };
  const round = (g, last) => {
    if (st.ok >= o.successes || st.bad >= o.failures) {
      const success = st.ok >= o.successes;
      g.openModal({ title: o.title, lines: [...(last || []), { text: success ? t('check.challengeWon') : t('check.challengeLost'), color: success ? 'j' : 'c', font: 'bold 24px monospace' }],
        onCancel: false, options: [{ label: t('battle.continue'), run: (g2) => o.onDone(g2, success) }] });
      return;
    }
    g.openModal({
      title: o.title,
      lines: [...(last || o.lines || []), { text: `${t('check.progress')}: ${st.ok}/${o.successes} · ${t('check.fails')}: ${st.bad}/${o.failures} · ${t('battle.dc')} ${o.dc}`, color: 'a' }],
      onCancel: false,
      options: o.skills.map((sk) => ({
        label: skillName(sk), run: (g2) => g2.openModal({
          title: `${o.title}: ${skillName(sk)}`, onCancel: false, lines: [{ text: t('check.pick'), color: 'a' }],
          options: performerOptions(o.members, sk, o.dc, null, (g3, m, info) => {
            const res = rollCheck(m, info, o.dc);
            if (res.success) st.ok++;
            else if (!st.forgiven) st.forgiven = true;
            else st.bad++;
            play(res.success ? 'buff' : 'miss');
            round(g3, resultLines(m.name, res));
          }),
        }),
      })),
    });
  };
  round(game, null);
}
