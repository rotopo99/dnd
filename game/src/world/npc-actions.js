// NPC actions of a node (free-roam.md, решение режиссёра 3): the list of buttons of an NPC (Говорить, Лавка, Обучение,
// Нанять, Украсть, Напасть…) and what each does. Shared by the menu view (scenes/location.js) and the free node map
// (scenes/roam.js) — one builder, no copies. Opens the existing windows (dialogue, shop, checks, recruitment, crime).
// createNpcActions(ctx): ctx = { locId, loc, home() — the scene to resume after a dialogue / shop, refresh(g), back(g),
//   again(g) — re-create the node after a battle, V(g) — visit state, toMap(g) }.
import { t } from '../data/text/index.js';
import { TALENTS, talentAllowed, isCombatTalent } from '../data/talents.js';
import { play } from '../audio/sfx.js';
import { openCheck } from '../ui/checks-ui.js';
import { LOCATIONS, ITEMS, SHOP_STOCK, npcsAt, npcGreeting, npcTopics, npcRepFaction, TRAINER_ALIAS, encounterName, factionStock } from './data.js';
import { repTier, factionName, normFaction, tierAtLeast, meetFaction } from './reputation.js';
import { buildHero, recruit, hireInfo, grant, tf, locFaction, hasFlagInParty, effectiveRep, discover, learnTalent, members } from './state.js';
import { serviceOff, exodusNpcLine } from './exodus.js';
import { backstoryTopics, useBackstoryTopic } from './backstory.js';
import { questsOffered, startQuest, onTalk } from './quests.js';
import { saveGame } from '../save.js';
import { VENDORS } from './vendors.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { recruitStatus } from './companions.js';
import { shopClosed } from './consequences.js';
import {
  npcFaction, npcRole, attackBlock, attackHeatText, attackSetup, attackFailed, killNpc, theftPlaces, theftDc, theftLoot, theftTried, theftCap,
  resolveTheft, payFine, fineFor, serviceBlocked, guardEnemies,
} from './crime.js';
import { CRIME_RULES, ATTACK_RULES } from '../data/world/crime.js';
import { heroBuild } from '../ui/portrait-of.js';
import { createDialogueScene } from '../scenes/dialogue.js';
import { openShop } from '../scenes/shop.js';
import { openRecruit } from '../ui/recruit-ui.js';
import { startWorldBattle, openLoot } from '../scenes/world-battle.js';

/** «Trial» quests for suspicious factions: side quests (sq-*) without key (no explicit mark in the data). */
export const isTrialQuest = (q) => !q.key && (q.trial ?? q.id.startsWith('sq-'));

const ORIGIN_FACTIONS = { tinBrotherhood: 1, pirates: 1, neutralVillages: 1, technikums: 1 };
const heroOf = (sv) => heroBuild(sv.hero); // portraits v2: build for drawHeroPortrait
const toastAll = (game, list) => { for (const x of list) game.toast(x.text, x.color); };
const persist = (game) => saveGame(game.save);
const ms = (game) => members(game.save, game.data);
// v3.1: gear stigma shifts how the faction sees the party (effectiveRep)
export const facTier = (game, f) => (f ? repTier(effectiveRep(game.save, f, game.data)) : 'neutral');

export function createNpcActions(ctx) {
  const { locId, loc } = ctx;
  const save = (game) => game.save;

  function heroCtx(game) {
    const sv = save(game);
    const hu = buildHero(sv, game.data);
    return { race: sv.hero.race, cls: sv.hero.cls, origin: sv.hero.origin, alignment: sv.hero.alignment, stats: hu.stats, level: sv.hero.level, weaponRange: hu.weapon?.range || 1, tags: hu.tags };
  }

  function trainerTalents(game, npc) {
    const keys = new Set([normFaction(npc.faction), npc.id]);
    for (const [k, ids] of Object.entries(TRAINER_ALIAS)) if (ids.includes(npc.id)) keys.add(k);
    const implants = loc.services.includes('implant');
    const hc = heroCtx(game);
    return Object.values(TALENTS).filter((x) => ((x.source?.kind === 'trainer' && keys.has(x.source.trainer)) || (implants && x.source?.kind === 'implant'))
      && talentAllowed(x, { ...hc, level: 5 }));
  }

  /**
   * Quests an NPC offers under the reputation rules (world.md §3): hostile — none; suspicious — only «trial» ones
   * (side quests sq-* without key); bribe (social check replaced by a bribe) lifts the suspicious limit.
   */
  function offeredBy(game, npc) {
    const sv = save(game);
    const tier = facTier(game, npcRepFaction(npc));
    const list = questsOffered(sv, npc.id);
    if (tier === 'hostile') return [];
    if (tier === 'suspicious' && !hasFlagInParty(sv, game.data, 'bribe')) return list.filter((q) => isTrialQuest(q));
    return list;
  }

  /** Trade under the reputation rules: hostile — closed, except black-market (always) and bribe (pay to trade). */
  function tradeAccess(game, npc) {
    const sv = save(game);
    if (facTier(game, npcRepFaction(npc)) !== 'hostile') return { ok: true };
    if (hasFlagInParty(sv, game.data, 'black-market')) return { ok: true };
    if (hasFlagInParty(sv, game.data, 'bribe')) return { ok: true, bribe: WORLD_RULES.bribePerLevel * sv.hero.level };
    return { ok: false, reason: t('loc.closedHostile') };
  }

  /** Rep tier that gates a mercenary: their faction, or the node's faction for faction-less ones (null — no gate). */
  function hireTier(game, npc) {
    const f = normFaction(npcRepFaction(npc));
    if (f && f !== 'none' && game.save.rep[f] != null) return facTier(game, f);
    const lf = locFaction(locId);
    return lf ? facTier(game, lf) : null;
  }

  /** Buttons of an NPC: [{id, label, disabled?, reason?, crime?}]. */
  function npcActions(game, npc) {
    const sv = (npc.services || []).filter((x) => !serviceOff(save(game), loc, x));
    const acts = [{ id: 'talk', label: t('loc.talk') }];
    if (sv.includes('trade')) {
      const ta = tradeAccess(game, npc);
      acts.push({ id: 'trade', label: ta.bribe ? `${t('loc.trade')} ${ta.bribe}` : t('loc.trade'), disabled: !ta.ok || (ta.bribe && save(game).hero.credits < ta.bribe), reason: ta.reason || (ta.bribe ? t('loc.noMoney') : null) });
    }
    if (sv.includes('train') && trainerTalents(game, npc).length) acts.push({ id: 'train', label: loc.services.includes('implant') ? t('loc.implant') : t('loc.train') });
    if (!sv.includes('trade') && sv.includes('train') && VENDORS[npc.id]?.mentor) acts.push({ id: 'trade', label: t('shop.mentorBuy') }); // vendors-bestiary.md: mentor shop
    if (npc.recruitable) {
      // companions-scenes.md: the button opens the recruitment dialogue with conditions; reasons are shown there
      const rs = recruitStatus(save(game), npc.id);
      if (!rs.already) acts.push({ id: 'recruit', label: rs.left ? t('comp.apologize') : t('loc.recruit'), reason: rs.paths.some((x) => x.ready) ? null : rs.paths[0]?.why || null });
    } else if (sv.includes('recruit')) {
      // N2: mercenaries — paid hire (hero CHA 14+, «friendly»), price lowered by CHA
      const h = hireInfo(save(game), npc.id, hireTier(game, npc), game.data);
      if (h.why !== 'already' && h.why !== 'no') acts.push({ id: 'hire', label: `${t('loc.hire')} ${h.price}`, disabled: !!h.why, reason: h.why ? t(`loc.hire.${h.why}`) : null });
    }
    return worldActs(game, npc, acts);
  }

  function doNpc(game, npc, act) {
    const sv = save(game);
    const tier = facTier(game, npcRepFaction(npc));
    if (act === 'talk') return talk(game, npc, tier);
    if (act === 'trade') {
      const ta = tradeAccess(game, npc);
      if (!ta.ok) return;
      if (ta.bribe) { sv.hero.credits -= ta.bribe; game.toast(`${t('check.bribe')}: −${ta.bribe}`, 'b'); }
      return openShopHere(game, npc.name, tier, null, npc);
    }
    if (act === 'steal') return openTheft(game, npc);
    if (act === 'attack') return openAttack(game, npc);
    if (act === 'train') return openTrain(game, npc);
    if (act === 'recruit') return openRecruit(game, npc, (g) => ctx.refresh(g));
    if (act === 'hire') {
      const h = hireInfo(sv, npc.id, hireTier(game, npc), game.data);
      if (h.why) return;
      sv.hero.credits -= h.price;
      const state = recruit(sv, npc.id);
      game.toast(`${npc.name}: ${t('loc.hired')} · ${t(state === 'active' ? 'loc.joined' : 'loc.waiting')}`, 'j');
      return ctx.refresh(game);
    }
  }

  function talk(game, npc, tier) {
    const sv = save(game);
    sv.npcs[npc.id] = { ...(sv.npcs[npc.id] || {}), met: true };
    meetFaction(sv, npcRepFaction(npc));
    const askTopics = (g) => {
      // world-consequences.md ч.4: backstory questions (TOPIC_TALK) join the NPC's own topics
      const bfac = npcFaction(npc) || normFaction(npcRepFaction(npc));
      const topics = [...npcTopics(npc), ...backstoryTopics(sv, npc.id, bfac).map((x) => ({ q: `✦ ${x.q}`, a: x.a, bg: x.id }))];
      if (!topics.length || tier === 'hostile') return finishTalk(g);
      g.openModal({
        title: npc.name, onCancel: (g2) => finishTalk(g2),
        lines: [{ text: t('loc.topics'), color: 'a' }],
        options: [...topics.map((tp) => ({ label: tp.q, run: (g2) => {
          // portraits v2: the hero asks, the NPC answers (emotion by text, ui/emotion.js)
          g2.setScene(createDialogueScene({
            title: npc.name, lines: [{ who: 'hero', text: tp.q }, { who: npc.id, name: npc.name, text: tp.a }], hero: heroOf(sv), wounds: true,
            onDone: (g3) => {
              g3.resume(ctx.home());
              if (tp.hook && LOCATIONS[tp.hook]) discover(sv, tp.hook);
              const fx = tp.bg ? useBackstoryTopic(sv, npc.id, tp.bg) : null;
              if (fx) { toastAll(g3, grant(sv, { xp: fx.xp, credits: fx.credits }, g3.data)); if (fx.hook && LOCATIONS[fx.hook]) discover(sv, fx.hook); }
              askTopics(g3);
            },
          }));
        } })), { label: t('loc.bye'), run: (g2) => finishTalk(g2) }],
      });
    };
    const finishTalk = (g) => {
      toastAll(g, onTalk(sv, npc.id, g.data));
      const offered = offeredBy(g, npc);
      if (offered.length) offerQuest(g, offered[0], npc.id);
      ctx.refresh(g);
    };
    // third-exodus.md: once per mark the NPC mentions the Exodus (a line by faction)
    const xl = tier !== 'hostile' ? exodusNpcLine(sv, npc.id, npcFaction(npc) || normFaction(npcRepFaction(npc))) : null;
    game.setScene(createDialogueScene({
      title: loc.name, lines: [npcGreeting(npc, tier), ...(xl ? [{ who: npc.id, name: npc.name, text: xl }] : [])], hero: heroOf(sv), wounds: true,
      onDone: (g) => { g.resume(ctx.home()); askTopics(g); },
    }));
  }

  function offerQuest(game, q, npcId) {
    game.openModal({
      title: `${t('loc.questOffer')}: ${q.name}`, width: 900,
      lines: [{ text: q.summary || '' }, { text: q.stages[0].text, color: 'a' }, ...(q.key ? [{ text: t('journal.key'), color: 'a' }] : [])],
      options: [
        { label: t('loc.questTake'), run: (g) => { const sv = save(g); toastAll(g, startQuest(sv, q.id)); if (npcId) toastAll(g, onTalk(sv, npcId, g.data)); ctx.refresh(g); } },
        { label: t('loc.questLater'), run: () => {} },
      ],
    });
  }

  function openShopHere(game, who, tier, stock, npc = null) {
    // vendors-bestiary.md: an NPC with a VENDORS profile — his own shelf (world/vendors.js); else the old faction shop
    if (npc && VENDORS[npc.id]) return openShop(game, { title: `${t('loc.trade')}: ${who}`, vendor: npc.id, tier, faction: normFaction(npcRepFaction(npc)), onClose: (g) => ctx.back(g) });
    // v3: the faction's shop (items/shops.js) plus the basic v1.0 goods
    if (!stock) stock = [...new Set([...(factionStock(locFaction(locId), tier) || []), ...SHOP_STOCK])];
    openShop(game, { title: `${t('loc.trade')}: ${who}`, stock, tier, faction: locFaction(locId), onClose: (g) => ctx.back(g) });
  }

  function openTrain(game, npc) {
    const list = trainerTalents(game, npc);
    game.openModal({
      width: 980,
      build: (g) => {
        const sv = save(g);
        const hc = heroCtx(g);
        return {
          title: `${t('loc.train')}: ${npc.name}`,
          lines: [{ text: `${t('world.credits')}: ${sv.hero.credits}`, color: 'b' }],
          options: [
            ...list.map((x) => {
              const cost = x.source.cost || 100;
              const owned = sv.hero.talents.includes(x.id);
              const needRep = x.source.rep && !tierAtLeast(facTier(g, x.source.trainer in ORIGIN_FACTIONS ? x.source.trainer : npc.faction), x.source.rep);
              const needItem = x.source.item && !(sv.hero.items[x.source.item] > 0);
              const needLvl = !talentAllowed(x, hc);
              const why = owned ? t('loc.owned') : needRep ? t('loc.needRep') : needItem ? `${t('loc.needItem')}: ${ITEMS[x.source.item]?.name}` : needLvl ? t('loc.needLevel') : sv.hero.credits < cost ? t('loc.noMoney') : null;
              return { label: `${x.name} — ${cost}${isCombatTalent(x) ? ` · ${t('talent.combat')}` : ''}`, sub: why || x.desc, disabled: !!why, keep: true,
                run: (g2) => { sv.hero.credits -= cost; toastAll(g2, learnTalent(sv, x.id, g2.data, { force: true })); play('buff'); persist(g2); } };
            }),
            { label: t('loc.close'), run: (g2) => ctx.back(g2) },
          ],
        };
      },
    });
  }

  // ---------------------------------------------------------------- world-consequences.md: crime, wanted, world changes
  /** NPC buttons under world changes: closed shop, services closed by the wanted level, «Украсть» / «Напасть». */
  function worldActs(game, npc, acts) {
    const sv = save(game);
    const f = npcFaction(npc);
    for (const a of acts) {
      if (a.id === 'trade' && VENDORS[npc.id] && shopClosed(sv, npc.id)) { a.disabled = true; a.reason = t('cq.shopClosed'); }
      const svc = { trade: 'trade', train: 'training', recruit: 'recruit', hire: 'recruit' }[a.id];
      if (svc && f && serviceBlocked(sv, f, svc)) { a.disabled = true; a.reason = t('wanted.service'); }
    }
    if (sv.party.some((p) => p.npc === npc.id && p.state !== 'left')) return acts;
    acts.push({ id: 'steal', label: t('crime.steal'), crime: true, disabled: theftTried(sv, npc.id), reason: t('crime.tooSoon') });
    const why = attackBlock(sv, npc.id);
    acts.push({ id: 'attack', label: t('crime.attack'), crime: true, disabled: !!why, reason: why });
    return acts;
  }

  function openTheft(game, npc) {
    const sv = save(game);
    game.openModal({
      title: tf('crime.stealTitle', { name: npc.name }), lines: [{ text: t('crime.stealLines'), color: 'a' }],
      options: [...theftPlaces(sv, npc, loc).map((pl) => {
        const dc = theftDc(sv, npc, pl);
        return { label: t(`crime.place.${pl}`), sub: tf('crime.placeSub', { dc, cap: theftCap(sv) }), run: (g) => stealRoll(g, npc, pl, dc) };
      }), { label: t('check.cancel'), run: () => {} }],
    });
  }

  function stealRoll(game, npc, place, dc) {
    const sv = save(game);
    const loot = theftLoot(sv, npc, place);
    openCheck(game, { title: tf('crime.stealTitle', { name: npc.name }), skills: CRIME_RULES.theft.skills, dc, members: ms(game), cancel: true,
      memoKey: `theft:${npc.id}:${sv.day}`,
      onDone: (g, ok, res) => {
        const r = resolveTheft(sv, npc, loot, { ok, gap: res ? dc - res.total : 4, natural: res?.natural || 0, place });
        toastAll(g, r.toasts);
        persist(g);
        if (r.ok) { ctx.refresh(g); return; }
        theftFail(g, npc, r, loot);
      } });
  }

  function theftFail(game, npc, r, loot) {
    const sv = save(game);
    const f = npcFaction(npc) || locFaction(locId);
    const fine = r.fail.id === 'caught' ? fineFor(loot.value) : CRIME_RULES.fine.min;
    const opts = [];
    for (const a of r.ask) {
      if (a === 'return') opts.push({ label: t('crime.return'), run: (g) => ctx.refresh(g) });
      if (a === 'fine') opts.push({ label: tf('crime.fine', { n: fine }), run: (g) => { toastAll(g, payFine(sv, fine)); ctx.refresh(g); } });
      if (a === 'fight') opts.push({ label: t('crime.fight'), sub: encounterName(guardEnemies(sv, f).encounter), run: (g) => guardFight(g, f) });
      if (a === 'run') opts.push({ label: t('crime.run'), sub: tf('crime.runSub', { dc: CRIME_RULES.run.dc }), run: (g) => runAway(g, f) });
    }
    game.openModal({ title: r.fail.text, border: 'c', onCancel: false, lines: [{ text: npc.name, color: 'a' }], options: opts });
  }

  /** Fight the node's guards (theft alarm, wanted at the gate). The win counts as passing the gate. */
  function guardFight(game, f) {
    const sv = save(game);
    const ge = guardEnemies(sv, f);
    ctx.V(game).gate = true;
    startWorldBattle(game, { enemies: ge.enemies, faction: f, title: tf('crime.guardsTitle', { faction: f ? factionName(f) : loc.name }), onWin: ctx.again });
  }

  /** Escape: Acrobatics / Athletics / Stealth; success — to the previous node, failure — the guards. */
  function runAway(game, f) {
    const R = CRIME_RULES.run;
    openCheck(game, { title: t('crime.run'), skills: R.skill.split('|'), dc: R.dc, members: ms(game), memoKey: `run:${locId}:${save(game).day}`,
      onDone: (g, ok) => {
        if (!ok) return guardFight(g, f);
        const sv = save(g);
        g.toast(t('crime.ranAway'), 'j');
        if (sv.prevLocation && LOCATIONS[sv.prevLocation] && sv.prevLocation !== locId) sv.location = sv.prevLocation;
        persist(g);
        ctx.toMap(g);
      } });
  }

  function openAttack(game, npc) {
    const sv = save(game);
    const why = attackBlock(sv, npc.id);
    if (why) { game.toast(why, 'c'); return; }
    const A = ATTACK_RULES, f = npcFaction(npc);
    const fill = (s) => s.replace(/\{(\w+)\}/g, (_, k) => ({ name: npc.name, role: t(`crime.role.${npcRole(npc)}`), faction: f ? factionName(f) : t('crime.noFaction'), heat: attackHeatText(sv, npc) }[k] ?? ''));
    const S2 = A.surprise;
    game.openModal({
      title: fill(A.confirm.title), border: 'c', width: 820,
      lines: A.confirm.lines.map((l) => ({ text: fill(l), color: 'a' })),
      options: [
        { label: t('crime.attackSure'), run: (g) => attackFight(g, npc, 0) },
        { label: tf('crime.surprise', { dc: S2.dc }), sub: tf('crime.surpriseSub', { n: S2.init }),
          run: (g) => openCheck(g, { title: fill(A.confirm.title), skill: S2.skill, dc: S2.dc, members: ms(g), memoKey: `surprise:${npc.id}:${sv.day}`,
            onDone: (g2, ok) => { if (ok) g2.toast(tf('crime.surpriseOk', { n: S2.init }), 'j'); attackFight(g2, npc, ok ? S2.init : 0); } }) },
        { label: A.confirm.cancel, run: () => {} },
      ],
    });
  }

  function attackFight(game, npc, init) {
    const sv = save(game);
    const st = attackSetup(sv, npc, npcsAt(locId, sv));
    ctx.V(game).gate = true;
    startWorldBattle(game, {
      enemies: st.enemies, faction: st.faction, title: tf('crime.attackTitle', { name: npc.name }), heroInit: init,
      onWin: (g) => { const k = killNpc(sv, npc.id); toastAll(g, k.toasts); persist(g); openLoot(g, k.loot, () => { persist(g); ctx.again(g); }); },
      onFlee: (g) => { toastAll(g, attackFailed(sv, npc)); },
    });
  }

  return { npcActions, doNpc, talk, offerQuest, openShopHere, openTrain, offeredBy, tradeAccess, hireTier, trainerTalents, worldActs, openTheft, openAttack, guardFight, runAway };
}
