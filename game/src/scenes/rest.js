// Rest window (data/world/rest.js): «Привал» from the location (action), the world map (Z) and the base (R).
// openRestMenu(game, { back, locId?, lodging?: { cost }, mode?: 'field'|'base', afterLong?(g), done?(g), again?(g) })
//   back — the scene that resumes after an encounter battle; lodging — a night for credits instead of rations;
//   afterLong — extra effects after any 1-day rest (base: medkits, souls, loyalty); done — refresh the caller.
import { t } from '../data/text/index.js';
import { REST } from '../data/world/rest.js';
import { EXODUS } from '../data/world/exodus.js';
import { LOCATIONS } from '../world/data.js';
import { tf, restDepartures, pickEncounter, members } from '../world/state.js';
import { passDays } from '../world/exodus.js';
import { waitingLoyalty, restLoyalty } from '../world/companions.js';
import { hasWorldFlag } from '../world/checks.js';
import { autoCheck } from '../world/skill-uses.js';
import { giveItem } from '../world/inventory.js';
import { hunterEncounter } from '../world/crime.js';
import {
  restState, shortRest, longRest, provisionCount, rationsNeed, restRisk, restMembers, hitDice, forageFind, canForage, baseRestBonus,
} from '../world/rest.js';
import { openGroupCheck } from '../ui/checks-ui.js';
import { eventsFor, runEvent } from './event.js';
import { runEncounter } from './encounter.js';
import { startExodusZero } from './exodus-zero.js';
import { saveGame } from '../save.js';

const toastAll = (game, list) => { for (const x of list || []) game.toast(x.text, x.color); };

/** Can the party make camp at this node (harmony and boss nodes — only with a «rest» service)? */
export function canCampAt(locId) {
  const l = LOCATIONS[locId];
  if (!l) return false;
  return (l.services || []).includes('rest') || (l.region !== 'harmony' && l.kind !== 'boss');
}

export function openRestMenu(game, o = {}) {
  const sv = game.save;
  const locId = o.locId || sv.location;
  const mode = o.mode || 'field';
  const st = restState(sv);
  const food = provisionCount(sv), need = rationsNeed(sv, game.data);
  const risk = mode === 'base' ? { risky: false } : restRisk(sv, locId, game.data);
  const done = (g) => { saveGame(sv); if (o.done) o.done(g); };
  const lines = [{ text: tf('rest.status', { n: st.short, max: st.max, food, need }), color: 'b' }];
  for (const m of restMembers(sv, game.data)) {
    const hd = hitDice(m.holder, m.unit, game.data);
    lines.push({ text: tf('rest.dice', { name: m.name, hp: m.unit.hp, maxHp: m.unit.maxHp, enr: m.unit.enr, maxEnr: m.unit.maxEnr, left: hd.left, total: hd.total, die: hd.die }), color: '4' });
  }
  if (risk.risky) {
    lines.push({ text: tf('rest.risk', { need: risk.need, skill: t(`skill.${REST.ambush.skill}`), dc: REST.ambush.dc }), color: 'c' });
    if (risk.wanted) lines.push({ text: t('rest.riskWanted'), color: 'c' });
  }
  if (mode === 'base') {
    const b = baseRestBonus(sv);
    if (b.medbay) lines.push({ text: t('rest.baseMedbay'), color: 'j' });
    if (b.generator) lines.push({ text: t('rest.baseGenerator'), color: 'j' });
  }
  const opts = [];
  opts.push({ label: t('rest.short'), sub: tf('rest.shortSub', { n: st.short, max: st.max }), disabled: st.short <= 0, reason: t('rest.noShort'),
    run: (g) => guarded(g, o, risk, () => {
      const r = shortRest(sv, g.data);
      g.toast(t('rest.shortDone'), 'j'); toastAll(g, r.toasts); done(g);
    }) });
  opts.push({ label: t('rest.long'), sub: tf('rest.longSub', { need, food }), disabled: food < need, reason: tf('rest.noFood', { need, food }),
    run: (g) => dayRest(g, o, risk, mode === 'base' ? 'base' : 'field') });
  if (o.lodging) {
    const cost = o.lodging.cost || 0;
    opts.push({ label: t('rest.lodging'), sub: tf('rest.lodgingSub', { cost: cost ? `${cost} ${t('world.credits')}` : t('rest.free') }), disabled: sv.hero.credits < cost,
      run: (g) => { sv.hero.credits -= cost; dayRest(g, o, { risky: false }, 'lodging'); } });
  }
  if (food < need) opts.push({ label: t('rest.hungry'), sub: tf('rest.hungrySub', { pct: Math.round(REST.hungry.mrlLoss * 100) }), run: (g) => dayRest(g, o, risk, 'hungry') });
  opts.push({ label: t('rest.cancel'), run: () => {} });
  game.openModal({ title: t('rest.title'), lines, options: opts, width: 760 });
}

/** Risky node: group Stealth; failure → the encounter roll; a hit → encounter instead of `apply` (a short rest is lost). */
function guarded(game, o, risk, apply) {
  const sv = game.save;
  if (!risk.risky) return apply(game);
  const roll = (g) => {
    const r = 1 + Math.floor(Math.random() * 20);
    g.toast(`${t('world.encounterRoll')}: d20 = ${r} ${t('map.vs')} ≤ ${risk.need}`, r <= risk.need ? 'c' : '4');
    if (r > risk.need) return apply(g);
    const loc = LOCATIONS[o.locId || sv.location];
    const e = hunterEncounter(sv) || pickEncounter(sv, loc?.region);
    if (!e) return apply(g);
    g.toast(t('rest.interrupted'), 'c');
    runEncounter(g, e, loc?.region, o.back, () => { if (o.back) g.resume(o.back); if (o.done) o.done(g); });
  };
  openGroupCheck(game, { title: t('rest.title'), lines: [{ text: tf('rest.risk', { need: risk.need, skill: t(`skill.${REST.ambush.skill}`), dc: REST.ambush.dc }) }],
    skill: REST.ambush.skill, dc: REST.ambush.dc, members: members(sv, game.data), memoKey: `rest-ambush:${sv.day}:${restState(sv).short}`,
    onDone: (g, ok) => { if (ok) { g.toast(t('rest.ambushOk'), 'j'); apply(g); } else roll(g); } });
}

/** A 1-day rest: long (field / base / lodging) or hungry. Day of the Exodus, loyalty, events, foraging, night risk. */
function dayRest(game, o, risk, mode) {
  const sv = game.save;
  const locId = o.locId || sv.location;
  const r = longRest(sv, game.data, { mode });
  if (!r.ok) { game.toast(tf('rest.noFood', { need: rationsNeed(sv, game.data), food: provisionCount(sv) }), 'c'); return; }
  const party = members(sv, game.data);
  const has = (f) => hasWorldFlag(party, f);
  if (mode !== 'hungry') {
    if (has('rest-mrl')) { sv.hero.mrl = null; for (const p of sv.party) if (p.state === 'active') p.mrl = null; }
    if (has('free-medkit') || has('herb-medkit') || has('multitool')) giveItem(sv, 'medkit', 1);
  }
  game.toast(mode === 'lodging' ? t('rest.lodgingDone') : mode === 'hungry' ? t('rest.hungryDone') : tf('rest.longDone', { n: r.eaten }), mode === 'hungry' ? 'c' : 'j');
  toastAll(game, r.toasts);
  if (r.bonus?.medbay) game.toast(t('rest.baseMedbay'), 'j');
  if (r.bonus?.generator) game.toast(t('rest.baseGenerator'), 'j');
  // third-exodus.md: a rest costs a day of the Exodus timer
  const ex = passDays(sv, REST.long.days ?? EXODUS.restDays);
  toastAll(game, ex.out);
  toastAll(game, waitingLoyalty(sv)); // companions-scenes.md: waiting on a hub costs loyalty
  toastAll(game, restLoyalty(sv)); // soft-incompatible pairs at the fire
  if (o.afterLong) o.afterLong(game);
  toastAll(game, restDepartures(sv));
  saveGame(sv);
  if (ex.zero) return startExodusZero(game);
  const finish = (g) => {
    // hunting and gathering: Survival of the best — +1 ration in the wild
    if (mode !== 'lodging' && mode !== 'base' && canForage(locId)) {
      const F = REST.forage;
      const c = autoCheck(members(sv, g.data), [F.skill], F.dc);
      if (c.success && forageFind(sv)) g.toast(tf('rest.forage', { name: c.member.name }), 'j');
      else g.toast(t('rest.forageFail'), '4');
    }
    if (o.done) o.done(g);
    saveGame(sv);
    if (risk.risky) guarded(g, o, risk, () => {});
  };
  const ev = mode !== 'base' && eventsFor(sv, locId, 'rest')[0];
  if (ev) return runEvent(game, ev, (g) => { if (o.again) o.again(g); finish(g); });
  finish(game);
}
