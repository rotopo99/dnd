// Skirmish choice window and battles (docs/specs/skirmishes.md): join A / join B / against all / sneak past / wait.
// openClash(game, clash, { back?, done?(game), cancel? }) — `done` runs when it is over (win, sneak, leave);
// a defeat goes the usual way (cyberspace), a retreat leaves the marker until it expires.
import { t } from '../data/text/index.js';
import { CHOICES, REP, THANKS } from '../data/world/skirmishes.js';
import { ITEMS, ENEMIES } from '../data/index.js';
import {
  clashSide, clashName, powerWord, daysLeft, clashDanger, sneakDc, waitOutcome, clashRep, removeClash, sideFriendly, clashTpl,
} from '../world/clashes.js';
import { members, grant, tf, repToasts, journal } from '../world/state.js';
import { meetFaction, factionName } from '../world/reputation.js';
import { openGroupCheck } from '../ui/checks-ui.js';
import { startWorldBattle, openLoot } from './world-battle.js';
import { battleXp } from '../rules/progression.js';
import { rollLoot } from '../world/loot.js';
import { saveGame } from '../save.js';
import { play } from '../audio/sfx.js';

const sideLine = (s, p) => ({
  text: `${s.faction ? tf('skirm.side', { name: s.name, faction: factionName(s.faction), units: s.units }) : tf('skirm.sideNoFaction', { name: s.name, units: s.units })} · ${powerWord(p)}`,
  color: 'c',
});

/** Card lines «кто против кого» (also used by the world map hover card). */
export function clashLines(save, c) {
  const A = clashSide(c, 'a'), B = clashSide(c, 'b');
  const out = [
    { text: tf('skirm.vs', { a: A.name, b: B.name }), color: 'h' },
    sideLine(A, c.power.a), { ...sideLine(B, c.power.b), color: 'a' },
  ];
  if (c.loc || c.route) out.push({ text: tf('skirm.daysLeft', { n: daysLeft(save, c) }), color: daysLeft(save, c) <= 1 ? 'c' : '4' });
  for (const s of [A, B]) if (sideFriendly(save, s)) out.push({ text: tf('skirm.friendHint', { name: s.name }), color: 'j' });
  return out;
}

export function openClash(game, c, o = {}) {
  const save = game.save;
  const A = clashSide(c, 'a'), B = clashSide(c, 'b');
  for (const s of [A, B]) if (s.faction) meetFaction(save, s.faction);
  const dc = sneakDc(clashDanger(c));
  const joinSub = (ally, foe) => tf('skirm.sub.join', { xp: CHOICES.joinA.xpMul, rep: REP.join + (sideFriendly(save, ally) ? REP.friendlyTierBonus : 0), foe: foe.faction && foe.faction !== ally.faction ? REP.joinFoe : 0 });
  const options = [
    { label: tf('skirm.choice.joinA', { name: A.name }), sub: joinSub(A, B), subColor: sideFriendly(save, A) ? 'j' : undefined, run: (g) => fight(g, c, 'joinA', o) },
    { label: tf('skirm.choice.joinB', { name: B.name }), sub: joinSub(B, A), subColor: sideFriendly(save, B) ? 'j' : undefined, run: (g) => fight(g, c, 'joinB', o) },
    { label: t('skirm.choice.all'), sub: tf('skirm.sub.all', { xp: CHOICES.all.xpMul, rep: REP.all }), run: (g) => fight(g, c, 'all', o) },
    { label: tf('skirm.choice.sneak', { dc }), sub: tf('skirm.sub.sneak', { n: CHOICES.sneak.failInit }), run: (g) => sneak(g, c, dc, o) },
    { label: t('skirm.choice.wait'), sub: tf('skirm.sub.wait', { n: CHOICES.wait.deadLootMul, rep: REP.waitKillWinner }), run: (g) => wait(g, c, o) },
  ];
  if (o.cancel) options.push({ label: t('skirm.choice.leave'), run: (g) => o.done?.(g) });
  play('enemyTurn');
  game.openModal({
    title: `${c.road ? t('skirm.ahead') : t('skirm.title')}: ${clashName(c)}`, border: 'c', titleColor: 'c', width: 760,
    lines: [...clashLines(save, c), { text: t('skirm.prompt'), color: '4' }],
    onCancel: o.cancel ? (g) => o.done?.(g) : false,
    options,
  });
}

/** Back to the calling scene after the clash. */
function finish(g, o) {
  if (o.back) g.resume(o.back);
  o.done?.(g);
}

/** Sneak past: group Stealth; fail — «against all» with the sides +failInit initiative. */
function sneak(game, c, dc, o) {
  const S = CHOICES.sneak;
  openGroupCheck(game, {
    title: `${t('skirm.title')}: ${clashName(c)}`, lines: [{ text: tf('skirm.choice.sneak', { dc }) }],
    skill: S.skill, dc, members: members(game.save, game.data), memoKey: `clash:${c.id}:sneak`,
    onDone: (g, ok) => {
      if (!ok) { g.toast(t('skirm.sneakFail'), 'c'); fight(g, c, 'all', o, { enemyInit: S.failInit }); return; }
      const xp = Math.floor(battleXp([...c.sides.a.ids, ...c.sides.b.ids], g.data) * S.okXpMul);
      g.toast(t('skirm.sneakOk'), 'j');
      for (const x of grant(g.save, { xp }, g.data)) g.toast(x.text, x.color);
      saveGame(g.save);
      finish(g, o);
    },
  });
}

/** Wait: the sides fight it out unseen; dead loot ×deadLootMul; the party finishes the survivors. */
function wait(game, c, o) {
  const save = game.save;
  const W = CHOICES.wait;
  const r = waitOutcome(c, game.data);
  const A = clashSide(c, 'a'), B = clashSide(c, 'b');
  const dl = rollLoot(r.dead, { ...game.data, ENEMIES }, Math.random);
  const extraLoot = { credits: Math.round(dl.credits * W.deadLootMul), items: dl.items.filter(() => Math.random() < W.deadLootMul) };
  const surv = r.winner ? { enemies: r.survivors[r.winner], rivals: null } : { enemies: r.survivors.a, rivals: r.survivors.b };
  const line = r.winner ? tf('skirm.waitResult', { w: (r.winner === 'a' ? A : B).name, l: (r.winner === 'a' ? B : A).name })
    : surv.enemies.length || surv.rivals?.length ? tf('skirm.waitDraw', { a: A.name, b: B.name }) : t('skirm.waitNone');
  journal(save, line);
  if (!surv.enemies.length && !surv.rivals?.length) { // nobody left: only the loot of the dead
    removeClash(save, c.id);
    saveGame(save);
    game.openModal({ title: t('skirm.title'), lines: [{ text: line, color: 'a' }], onCancel: false,
      options: [{ label: t('battle.continue'), run: (g) => openLoot(g, { ...extraLoot, notes: [] }, () => finish(g, o)) }] });
    return;
  }
  if (!surv.enemies.length) { surv.enemies = surv.rivals; surv.rivals = null; }
  game.openModal({ title: t('skirm.title'), lines: [{ text: line, color: 'a' }], onCancel: false,
    options: [{ label: t('battle.continue'), run: (g) => battle(g, c, 'wait', o, { enemies: surv.enemies, rivals: surv.rivals?.length ? surv.rivals : null, extraLoot, winner: r.winner }) }] });
}

/** Join a side or go against all. */
function fight(game, c, choice, o, extra = {}) {
  const a = c.sides.a.ids, b = c.sides.b.ids;
  if (choice === 'joinA') return battle(game, c, choice, o, { enemies: b, allies: a, ...extra });
  if (choice === 'joinB') return battle(game, c, choice, o, { enemies: a, allies: b, ...extra });
  return battle(game, c, 'all', o, { enemies: a, rivals: b, ...extra });
}

function battle(game, c, choice, o, { enemies, allies = [], rivals = null, enemyInit = 0, extraLoot = null, winner = null }) {
  const save = game.save;
  const ch = CHOICES[choice] || CHOICES.all;
  play('uiClick');
  startWorldBattle(game, {
    enemies, allies, rivals, enemyInit, extraLoot,
    title: tf('skirm.titleBattle', { name: clashName(c) }),
    location: c.loc || save.location, objective: null, xpMul: ch.xpMul ?? 1,
    afterLoot: (g, loot, notes, S) => rewards(g, c, choice, loot, notes, S, winner),
    onWin: (g) => { removeClash(g.save, c.id); saveGame(g.save); finish(g, o); },
  });
}

/** Reputation + «благодарность» after a won clash; lines go to the loot window. */
function rewards(game, c, choice, loot, notes, S, winner) {
  const save = game.save;
  for (const x of repToasts(clashRep(save, c, choice, winner))) { game.toast(x.text, x.color); notes.push({ text: x.text, color: x.color }); }
  if (!CHOICES[choice]?.thanks) return;
  const ally = clashSide(c, choice === 'joinA' ? 'a' : 'b');
  const value = loot.credits + loot.items.reduce((s, x) => s + (ITEMS[x.id]?.price || 0) * x.n, 0);
  const cr = Math.round(value * THANKS.credits);
  if (cr > 0) { loot.credits += cr; notes.push({ text: tf('skirm.thanks', { name: ally.name, n: cr }), color: 'b' }); }
  if (ally.faction && Math.random() < THANKS.favorChance) {
    save.flags[`skirm-favor:${ally.faction}`] = true;
    notes.push({ text: tf('skirm.favor', { name: factionName(ally.faction), n: Math.round(THANKS.favorDiscount * 100) }), color: 'j' });
  }
  if (Math.random() < THANKS.escortChance && S?.b) {
    const alive = S.b.units.filter((u) => u.kind === 'ally' && u.team === 'heroes' && !u.dead && !u.removed && u.enemyId && ENEMIES[u.enemyId]);
    const cmd = alive.sort((x, y) => (y.level || 0) - (x.level || 0))[0];
    if (cmd) { save.flags['skirm-escort'] = cmd.enemyId; notes.push({ text: tf('skirm.escort', { name: ENEMIES[cmd.enemyId].name }), color: 'j' }); }
  }
  const quest = clashTpl(c.tpl)?.quest;
  if (quest && Math.random() < THANKS.questChance) {
    save.flags[`skirm-quest:${quest}`] = true;
    journal(save, tf('skirm.questJournal', { name: ally.name, quest }));
    notes.push({ text: tf('skirm.quest', { name: ally.name }), color: 'a' });
  }
}
