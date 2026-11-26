// Skill check windows (world.md §5, UI): pick who rolls, see mode (advantage/disadvantage and why), DC, dice.
// openCheck — single check; openGroupCheck — everyone rolls, success if at least half pass;
// openChallenge — N successes before M failures, each round: skill + performer.
import { t } from '../data/text/index.js';
import { checkInfo, checkChance, rollCheck, skillName, hasWorldFlag } from '../world/checks.js';
import { saveGame } from '../save.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
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
    // v4: «the best rolls» first — the best member with the best skill of the list, then every skill to pick by hand
    const top = bestPair(o.members, o.skills, o.dc, o.extraAdv);
    game.openModal({
      title: o.title, lines: [...(o.lines || []), { text: `${t('check.pickSkill')} · ${t('battle.dc')} ${o.dc}`, color: 'a' }],
      onCancel: o.cancel ? undefined : false,
      options: [
        ...(top && !game.save?.memo?.[o.memoKey] ? [{ label: `${t('check.bestRoll')}: ${top.m.name} · ${skillName(top.skill)}`, sub: `${Math.round(top.c * 100)}%`,
          run: (g) => openCheck(g, { ...o, skill: top.skill, cancel: false, auto: top.m }) }] : []),
        ...o.skills.map((sk) => ({ label: skillName(sk), sub: bestOf(o.members, sk, o.dc, o.extraAdv), run: (g) => openCheck(g, { ...o, skill: sk, cancel: false }) })),
        ...(o.cancel ? [{ label: t('check.cancel'), run: () => {} }] : [])],
    });
    return;
  }
  const save = game.save;
  const finish = (g, ok, res, m) => {
    if (save && o.memoKey) { delete save.memo[o.memoKey]; }
    o.onDone(g, ok, res, m);
    if (save) saveGame(save);
  };
  // a roll already made for this check (the page was reloaded before «Дальше»): no re-roll
  const memo = save && o.memoKey ? save.memo?.[o.memoKey] : null;
  if (memo) {
    game.openModal({ title: o.title, lines: [...memo.lines, { text: t('check.memo'), color: '4' }], border: memo.success ? 'j' : 'c', onCancel: false,
      options: [{ label: t('battle.continue'), run: (g2) => finish(g2, memo.success, null, null) }] });
    return;
  }
  const roll = (g, m, info) => {
    const res = rollCheck(m, info, o.dc);
    play(res.success ? 'buff' : 'miss');
    const lines = resultLines(m.name, res);
    if (save && o.memoKey) { save.memo = save.memo || {}; save.memo[o.memoKey] = { success: res.success, lines }; saveGame(save); }
    g.openModal({
      title: o.title, lines, border: res.success ? 'j' : 'c', onCancel: false,
      options: [{ label: t('battle.continue'), run: (g2) => finish(g2, res.success, res, m) }],
    });
  };
  if (o.auto) return roll(game, o.auto, checkInfo(o.auto, o.skill, o.extraAdv));
  const opts = performerOptions(o.members, o.skill, o.dc, o.extraAdv, roll);
  if (o.members.length > 1) {
    const top = bestPair(o.members, [o.skill], o.dc, o.extraAdv);
    opts.unshift({ label: `${t('check.bestRoll')}: ${top.m.name}`, sub: `${Math.round(top.c * 100)}%`, run: (g) => roll(g, top.m, checkInfo(top.m, o.skill, o.extraAdv)) });
  }
  // world flags that replace the roll: bribe (social), break-door (athletics, once per node), silent-pick (lockpicking, once per rest)
  if (save && o.members?.length) {
    const auto = (label, mark) => opts.push({ label, run: (g) => { mark(); play('buff'); g.openModal({ title: o.title, lines: [{ text: label, color: 'j' }, { text: t('check.success'), color: 'j', font: 'bold 24px monospace' }], onCancel: false,
      options: [{ label: t('battle.continue'), run: (g2) => finish(g2, true, null, null) }] }); } });
    const cost = R.bribePerLevel * (save.hero.level || 1);
    if (R.socialSkills.includes(o.skill) && hasWorldFlag(o.members, 'bribe') && save.hero.credits >= cost) auto(`${t('check.bribe')} — ${cost}`, () => { save.hero.credits -= cost; });
    if (o.skill === 'athletics' && hasWorldFlag(o.members, 'break-door') && !game.visit?.breakDoor) auto(t('check.breakDoor'), () => { game.visit = { ...(game.visit || {}), breakDoor: true }; });
    if (o.skill === 'lockpicking' && hasWorldFlag(o.members, 'silent-pick') && !save.flags['used:silent-pick']) auto(t('check.silentPick'), () => { save.flags['used:silent-pick'] = true; });
  }
  // QA v52 #8: one performer and nothing else to choose — roll at once, no «Кто бросает?» window with a single option
  if (opts.length === 1 && o.members?.length === 1 && !o.cancel) return roll(game, o.members[0], checkInfo(o.members[0], o.skill, o.extraAdv));
  if (o.cancel) opts.push({ label: t('check.cancel'), run: () => {} });
  game.openModal({
    title: o.title,
    lines: [...(o.lines || []), { text: `${skillName(o.skill)}, ${t('battle.dc')} ${o.dc}. ${t('check.pick')}`, color: 'a' }],
    options: opts, onCancel: o.cancel ? undefined : false,
  });
}

/** Best (member, skill) pair by success chance: { m, skill, c }. */
function bestPair(members, skills, dc, extraAdv) {
  let best = null;
  for (const skill of skills) for (const m of members) {
    const c = checkChance(checkInfo(m, skill, extraAdv), dc);
    if (!best || c > best.c) best = { c, m, skill };
  }
  return best;
}

/** Expected successes of a group check with this skill (sum of chances), for the skill picker. */
function groupExpect(members, skill, dc, extraAdv) {
  const e = members.reduce((s, m) => s + checkChance(checkInfo(m, skill, extraAdv), dc), 0);
  return `${t('check.groupExpect')} ${e.toFixed(1)}/${members.length} · ${bestOf(members, skill, dc, extraAdv)}`;
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
  const save = game.save;
  const memo = save && o.memoKey ? save.memo?.[o.memoKey] : null;
  if (memo) {
    game.openModal({ title: o.title, lines: [...memo.lines, { text: t('check.memo'), color: '4' }], onCancel: false,
      options: [{ label: t('battle.continue'), run: (g) => { delete save.memo[o.memoKey]; o.onDone(g, memo.success); saveGame(save); } }] });
    return;
  }
  if (!o.skill && o.skills) {
    if (o.skills.length === 1) return openGroupCheck(game, { ...o, skill: o.skills[0] });
    game.openModal({ title: o.title, lines: [...(o.lines || []), { text: `${t('check.group')}: ${t('check.pickSkill')} · ${t('battle.dc')} ${o.dc}`, color: 'a' }], onCancel: false,
      options: o.skills.map((sk) => ({ label: skillName(sk), sub: groupExpect(o.members, sk, o.dc, o.extraAdv), run: (g) => openGroupCheck(g, { ...o, skill: sk }) })) });
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
  if (save && o.memoKey) { save.memo = save.memo || {}; save.memo[o.memoKey] = { success, lines }; saveGame(save); }
  game.openModal({
    title: o.title, lines: [...(o.lines || []), { text: `${skillName(o.skill)}, ${t('battle.dc')} ${o.dc}`, color: 'a' }, ...lines],
    onCancel: false, options: [{ label: t('battle.continue'), run: (g) => { if (save && o.memoKey) delete save.memo[o.memoKey]; o.onDone(g, success); if (save) saveGame(save); } }],
  });
}

/** Skill challenge: { title, lines, skills, dc, successes, failures, members, forgiveFirst?, onDone(game, success) }.
 *  QA v52 #8: skill buttons show the odds and roll at once — by the best member for that skill, or by the member the
 *  player fixed with «Бросает: … (сменить)»; no extra «Кто бросает?» window. */
export function openChallenge(game, o) {
  const st = { ok: 0, bad: 0, forgiven: !o.forgiveFirst, roller: null };
  const fill = (k, v) => t(k).replace(/\{(\w+)\}/g, (m, x) => (v[x] ?? m));
  const rollerFor = (sk) => {
    if (st.roller) return { m: st.roller, c: checkChance(checkInfo(st.roller, sk, null), o.dc) };
    const top = bestPair(o.members, [sk], o.dc, null);
    return top ? { m: top.m, c: top.c } : null;
  };
  const doRoll = (g, m, sk) => {
    const res = rollCheck(m, checkInfo(m, sk, null), o.dc);
    if (res.success) st.ok++;
    else if (!st.forgiven) st.forgiven = true;
    else st.bad++;
    play(res.success ? 'buff' : 'miss');
    round(g, resultLines(m.name, res));
  };
  const round = (g, last) => {
    if (st.ok >= o.successes || st.bad >= o.failures) {
      const success = st.ok >= o.successes;
      g.openModal({ title: o.title, lines: [...(last || []), { text: success ? t('check.challengeWon') : t('check.challengeLost'), color: success ? 'j' : 'c', font: 'bold 24px monospace' }],
        onCancel: false, options: [{ label: t('battle.continue'), run: (g2) => o.onDone(g2, success) }] });
      return;
    }
    const options = o.skills.map((sk) => {
      const r = rollerFor(sk);
      return { label: skillName(sk), sub: r ? `${r.m.name} · ${Math.round(r.c * 100)}%` : '', run: (g2) => r && doRoll(g2, r.m, sk) };
    });
    if (o.members.length > 1) {
      options.push({ label: st.roller ? fill('ch.roller', { name: st.roller.name }) : t('ch.rollerAuto'),
        run: (g2) => g2.openModal({ title: o.title, lines: [{ text: t('ch.rollerPick'), color: 'a' }], onCancel: false,
          options: [{ label: t('ch.rollerBest'), run: (g3) => { st.roller = null; round(g3, last); } },
            ...o.members.map((m) => ({ label: m.name, run: (g3) => { st.roller = m; round(g3, last); } }))] }) });
    }
    g.openModal({
      title: o.title,
      lines: [...(last || o.lines || []), { text: fill('ch.progress', { ok: st.ok, s: o.successes, bad: st.bad, f: o.failures, dc: `${t('battle.dc')} ${o.dc}` }), color: 'a' }],
      onCancel: false, options,
    });
  };
  round(game, null);
}
