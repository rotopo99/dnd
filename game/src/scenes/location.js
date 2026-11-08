// Location / hub screen (world.md §1, §3–§6): NPCs from LOCATIONS[id].npcs with actions from their `services`
// (talk, trade, train/implant, recruit, quest), location actions (rest, heal, revive, trade, rumors, terminal, battles,
// caches, quest goals, field camp), entry gate by reputation, unique events on enter/rest,
// bottom bar: map / party / reputation / journal / menu. Every change is autosaved.
import { giveItem, dropItem, countAll } from '../world/inventory.js';
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, talentAllowed, isCombatTalent } from '../data/talents.js';
import { drawPortrait } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, textBlock, fit, panel, button, hitButton, clear, bar, flowButtons } from '../ui/draw.js';
import { openCheck, openGroupCheck, openChallenge } from '../ui/checks-ui.js';
import {
  LOCATIONS, REGIONS, ITEMS, SHOP_STOCK, TERMINAL_ACTIONS, SERVICE_PRICES, QUESTS, ENCOUNTER_TABLES,
  npcsAt, npcGreeting, npcTopics, npcRepFaction, TRAINER_ALIAS, encounterName, resolveLocation, factionStock,
  locationLore, LORE_RUMORS, SKILL_RULES, QUEST_TURNIN,
} from '../world/data.js';
import { autoCheck, disassembleDc, disassembleParts } from '../world/skill-uses.js';
import { isGear } from './panel-gear.js';
import { rollDice } from '../rules/dice.js';
import { repTier, factionName, normFaction, tierAtLeast, meetFaction } from '../world/reputation.js';
import { openPauseMenu, openSaveMenu } from '../ui/save-ui.js';
import { hotspot } from '../ui/tooltip.js';
import { resTip, xpInfo, talentTip } from '../ui/tips.js';
import {
  members, activeCompanions, buildHero, canRecruit, recruit, hireInfo, grant, restParty, restDepartures, journal, tf,
  locFaction, regionOf, hasFlagInParty, effectiveRep, discover, pickEncounter, learnTalent, talentOk, openHidden, encounterThreshold, MAX_PARTY, squadFree, requiresOk,
} from '../world/state.js';
import { exodusSync, passDays, serviceOff, tollMult, exodusRumor, exodusNpcLine } from '../world/exodus.js';
import { EXODUS_UI } from '../data/text/exodus.js';
import { backstoryTopics, useBackstoryTopic } from '../world/backstory.js';
import { EXODUS } from '../data/world/exodus.js';
import { startExodusZero } from './exodus-zero.js';
import { questsOffered, startQuest, slotsAt, onTalk, onBattleWon, completeSlot, chooseOption, failSlot, autoProgress, availableOptions, goalDc,
  pendingTurnins, claimTurnin, turninFallback, turninLines } from '../world/quests.js';
import { startWorldBattle, startSkirmish } from './world-battle.js';
import { createDialogueScene } from './dialogue.js';
import { heroBuild } from '../ui/portrait-of.js';
import { eventsFor, runEvent } from './event.js';
import { saveGame } from '../save.js';
import { openShop } from './shop.js';
import { VENDORS } from '../world/vendors.js';
import { runEncounter } from './encounter.js';
import { hasWorldFlag } from '../world/checks.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { FIELD_CAMP } from '../world/data.js';
import { openLevelUp } from './levelup.js';
import { openCheckScene } from './check-scene.js';
import { questScene, stageXp } from '../world/check-run.js';
import { openRecruit } from '../ui/recruit-ui.js';
import { recruitStatus, restLoyalty, waitingLoyalty, giftOptions, giveGift, lovedTypes, companionRequest, refuseRequest, acceptRequest } from '../world/companions.js';
import { syncBase, baseTick, atBase, modActive as baseModActive, radioTurnin } from '../world/base.js';
import { nodeMark, worldRumors, shopClosed, closedLoc, TONE_COLOR, isDispute } from '../world/consequences.js';
import { openEpilogue } from './epilogue.js';
import {
  npcFaction, npcRole, attackBlock, attackHeatText, attackSetup, attackFailed, killNpc, theftPlaces, theftDc, theftLoot, theftTried, theftCap,
  resolveTheft, payFine, fineFor, serviceBlocked, wantedTick, entryThreat, entryCheckOf, guardEnemies, bribeInfo, applyBribe, heatOf, crimeRumors, isOfficial,
  amnestiesAt, amnestyInfo, applyAmnesty, amnestyFailed,
} from '../world/crime.js';
import { CRIME_RULES, ATTACK_RULES } from '../data/world/crime.js';
import { openLoot } from './world-battle.js';
import { openRestMenu, canCampAt } from './rest.js';
import { restState } from '../world/rest.js';

const heroOf = (sv) => heroBuild(sv.hero); // portraits v2: build for drawHeroPortrait

const BASE_W = 1280, BASE_H = 720;
const PAGE = 7;
const NPC_NAME_W = 140; // name / role column of an NPC row (buttons get the rest)
const NPC_BTN_FONT = 'bold 13px monospace';
const MAX_ACTIONS = 9;
const TIER_COL = { hostile: 'c', suspicious: 'a', neutral: '4', friendly: 'j', ally: 'h' };
export const tierColor = (tier) => C[TIER_COL[tier] || '4'];

export function createLocationScene(rawId) {
  const locId = resolveLocation(rawId);
  const S = { page: 0, apage: 0, buttons: [], hover: null, time: 0, gate: false, visit: {} };
  let self;
  const loc = LOCATIONS[locId];
  const save = (game) => game.save;
  const toastAll = (game, list) => { for (const x of list) game.toast(x.text, x.color); };
  const persist = (game) => saveGame(game.save);
  // v3.1: gear stigma shifts how the faction sees the party (effectiveRep)
  const facTier = (game, f) => (f ? repTier(effectiveRep(game.save, f, game.data)) : 'neutral');
  const back = (game) => { game.resume(self); refresh(game); };
  const refresh = (game) => { S.turnin = true; toastAll(game, autoProgress(save(game), game.data)); toastAll(game, exodusSync(save(game)).out); toastAll(game, syncBase(save(game))); toastAll(game, baseTick(save(game))); persist(game); layout(game); };
  const ms = (game) => members(save(game), game.data);
  const homeTier = (game) => facTier(game, locFaction(locId) || (loc.region === 'harmony' ? 'technikums' : null));
  const toMap = (g) => { g.visit = null; import('./world-map.js').then((m) => g.setScene(m.createWorldMapScene())); };
  const again = (g) => g.setScene(createLocationScene(locId));
  /** Visit state lives in game.visit (survives scene re-creation after battles), reset when leaving to the map. */
  const V = (g) => (g.visit && g.visit.loc === locId ? g.visit : (g.visit = { loc: locId, gate: false, gig: false, enterEvents: false }));
  /** After the gate is passed: entry events, then talent choices. */
  function afterGate(g) {
    const v = V(g);
    v.gate = true;
    S.turnin = true; // quest turn-ins / radio calls — from update(), when no modal is open
    toastAll(g, autoProgress(save(g), g.data)); // e.g. a 'reach' goal of this very node
    persist(g);
    layout(g);
    if (!v.enterEvents) {
      v.enterEvents = true;
      const ev = eventsFor(save(g), locId, 'enter')[0];
      if (ev) { runEvent(g, ev, (g2) => again(g2)); return; }
    }
    if (!pendingChoice(g)) levelUp(g);
  }
  // levels-20.md: level-up window (news + ASI choice) when nothing else is on screen
  function levelUp(g) {
    if (!g.modals.length) openLevelUp(g, (g2) => { persist(g2); layout(g2); });
  }

  // ---------------------------------------------------------------- entry gate (world.md §3)
  function gateCheck(game) {
    const e = loc.entry;
    if (!e) return false;
    const f = e.faction;
    let tier = facTier(game, f);
    const party = ms(game);
    const sv0 = save(game);
    const has = (flag) => hasWorldFlag(party, flag);
    if (tier === 'suspicious' && has('badge-entry')) tier = 'neutral';
    if (tier === 'suspicious' && f.startsWith('mutants') && has('mutant-kin') ) tier = 'neutral';
    const G = WORLD_RULES.gate;
    const pass = (g) => afterGate(g);
    const leave = (g) => {
      const sv = save(g);
      if (sv.prevLocation && LOCATIONS[sv.prevLocation]) sv.location = sv.prevLocation;
      persist(g);
      toMap(g);
    };
    const fightEnc = e.battle || (ENCOUNTER_TABLES[loc.region] || []).find((x) => x.kind === 'battle' && x.faction === f)?.encounter || 'w-road-scavengers';
    // the gate battle counts as passing: after the win the scene is re-created with game.visit.gate = true
    const fight = (g) => { V(g).gate = true; startWorldBattle(g, { encounter: fightEnc, faction: f, onWin: again }); };
    if (tier === 'hostile') {
      const opts = [
        { label: t('loc.gateFight'), sub: encounterName(fightEnc), run: fight },
        { label: t('loc.gateSneak'), sub: `${t('check.group')} · ${t('battle.dc')} ${G.sneakDc}`, run: (g) => openGroupCheck(g, { title: t('loc.gateSneak'), skill: 'stealth', dc: G.sneakDc, members: party, memoKey: `gate:${locId}:${sv0.day}:sneak`,
          onDone: (g2, ok) => { if (!ok) leave(g2); else { g2.toast(t('loc.gateSneaked'), 'j'); pass(g2); } } }) },
      ];
      // disguise: once per rest — enter as if neutral; parley: talk instead of a fight (Persuasion)
      if (has('disguise') && !sv0.flags['used:disguise']) opts.push({ label: t('loc.gateDisguise'), run: (g) => { sv0.flags['used:disguise'] = true; g.toast(t('loc.gateDisguised'), 'j'); pass(g); } });
      if (has('parley')) opts.push({ label: t('loc.gateParley'), sub: `${t('skill.persuasion')} · ${t('battle.dc')} ${G.parleyDc}`,
        run: (g) => openCheck(g, { title: t('loc.gateParley'), skill: 'persuasion', dc: G.parleyDc, members: party, memoKey: `gate:${locId}:${sv0.day}:parley`, onDone: (g2, ok) => (ok ? pass(g2) : fight(g2)) }) });
      opts.push({ label: t('loc.gateLeave'), run: leave });
      game.openModal({ title: t('loc.gateHostile'), border: 'c', onCancel: false, lines: [{ text: t('loc.gateHostileText').replace('{f}', factionName(f)) }], options: opts });
      return true;
    }
    if (tier === 'suspicious') {
      const ch = e.check || { skills: G.talkSkills, dc: G.talkDc };
      const toll = Math.round(SERVICE_PRICES.toll(e.toll || G.toll) * tollMult(sv0));
      // forge-pass: AI Party checkpoints (aiParty / agrozone) — the document check with advantage
      const forge = has('forge-pass') && ['aiParty', 'agrozone'].includes(f) ? t('flag.forge-pass') : null;
      game.openModal({
        title: t('loc.gateSuspicious'), border: 'a', onCancel: false,
        lines: [{ text: t('loc.gateSuspiciousText').replace('{f}', factionName(f)) }],
        options: [
          { label: t('loc.gateTalk'), sub: `${ch.skills.map((s) => t(`skill.${s}`)).join(' / ')} · ${t('battle.dc')} ${ch.dc}`,
            run: (g) => openCheck(g, { title: loc.name, skills: ch.skills, dc: ch.dc, members: party, extraAdv: forge, memoKey: `gate:${locId}:${sv0.day}:talk`,
              onDone: (g2, ok) => { if (!ok) { if (e.battle) fight(g2); else leave(g2); } else pass(g2); } }) },
          { label: `${t('loc.gateToll')} — ${toll}`, disabled: save(game).hero.credits < toll, run: (g) => { save(g).hero.credits -= toll; refresh(g); pass(g); } },
          { label: t('loc.gateLeave'), run: leave },
        ],
      });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- NPC actions
  function heroCtx(game) {
    const sv = save(game);
    const hu = buildHero(sv, game.data);
    return { race: sv.hero.race, cls: sv.hero.cls, origin: sv.hero.origin, alignment: sv.hero.alignment, stats: hu.stats, level: sv.hero.level, weaponRange: hu.weapon?.range || 1, tags: hu.tags };
  }

  function trainerTalents(game, npc) {
    const keys = new Set([normFaction(npc.faction), npc.id]);
    for (const [k, ids] of Object.entries(TRAINER_ALIAS)) if (ids.includes(npc.id)) keys.add(k);
    const implants = loc.services.includes('implant');
    const ctx = heroCtx(game);
    return Object.values(TALENTS).filter((x) => ((x.source?.kind === 'trainer' && keys.has(x.source.trainer)) || (implants && x.source?.kind === 'implant'))
      && talentAllowed(x, { ...ctx, level: 5 }));
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
    if (act === 'recruit') return openRecruit(game, npc, (g) => refresh(g));
    if (act === 'hire') {
      const h = hireInfo(sv, npc.id, hireTier(game, npc), game.data);
      if (h.why) return;
      sv.hero.credits -= h.price;
      const state = recruit(sv, npc.id);
      game.toast(`${npc.name}: ${t('loc.hired')} · ${t(state === 'active' ? 'loc.joined' : 'loc.waiting')}`, 'j');
      return refresh(game);
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
              g3.resume(self);
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
      refresh(g);
    };
    // third-exodus.md: once per mark the NPC mentions the Exodus (a line by faction)
    const xl = tier !== 'hostile' ? exodusNpcLine(sv, npc.id, npcFaction(npc) || normFaction(npcRepFaction(npc))) : null;
    game.setScene(createDialogueScene({
      title: loc.name, lines: [npcGreeting(npc, tier), ...(xl ? [{ who: npc.id, name: npc.name, text: xl }] : [])], hero: heroOf(sv), wounds: true,
      onDone: (g) => { g.resume(self); askTopics(g); },
    }));
  }

  function offerQuest(game, q, npcId) {
    game.openModal({
      title: `${t('loc.questOffer')}: ${q.name}`, width: 900,
      lines: [{ text: q.summary || '' }, { text: q.stages[0].text, color: 'a' }, ...(q.key ? [{ text: t('journal.key'), color: 'a' }] : [])],
      options: [
        { label: t('loc.questTake'), run: (g) => { const sv = save(g); toastAll(g, startQuest(sv, q.id)); if (npcId) toastAll(g, onTalk(sv, npcId, g.data)); refresh(g); } },
        { label: t('loc.questLater'), run: () => {} },
      ],
    });
  }

  function openShopHere(game, who, tier, stock, npc = null) {
    // vendors-bestiary.md: an NPC with a VENDORS profile — his own shelf (world/vendors.js); else the old faction shop
    if (npc && VENDORS[npc.id]) return openShop(game, { title: `${t('loc.trade')}: ${who}`, vendor: npc.id, tier, faction: normFaction(npcRepFaction(npc)), onClose: (g) => back(g) });
    // v3: the faction's shop (items/shops.js) plus the basic v1.0 goods
    if (!stock) stock = [...new Set([...(factionStock(locFaction(locId), tier) || []), ...SHOP_STOCK])];
    openShop(game, { title: `${t('loc.trade')}: ${who}`, stock, tier, faction: locFaction(locId), onClose: (g) => back(g) });
  }

  function openTrain(game, npc) {
    const list = trainerTalents(game, npc);
    game.openModal({
      width: 980,
      build: (g) => {
        const sv = save(g);
        const ctx = heroCtx(g);
        return {
          title: `${t('loc.train')}: ${npc.name}`,
          lines: [{ text: `${t('world.credits')}: ${sv.hero.credits}`, color: 'b' }],
          options: [
            ...list.map((x) => {
              const cost = x.source.cost || 100;
              const owned = sv.hero.talents.includes(x.id);
              const needRep = x.source.rep && !tierAtLeast(facTier(g, x.source.trainer in ORIGIN_FACTIONS ? x.source.trainer : npc.faction), x.source.rep);
              const needItem = x.source.item && !(sv.hero.items[x.source.item] > 0);
              const needLvl = !talentAllowed(x, ctx);
              const why = owned ? t('loc.owned') : needRep ? t('loc.needRep') : needItem ? `${t('loc.needItem')}: ${ITEMS[x.source.item]?.name}` : needLvl ? t('loc.needLevel') : sv.hero.credits < cost ? t('loc.noMoney') : null;
              return { label: `${x.name} — ${cost}${isCombatTalent(x) ? ` · ${t('talent.combat')}` : ''}`, sub: why || x.desc, disabled: !!why, keep: true,
                run: (g2) => { sv.hero.credits -= cost; toastAll(g2, learnTalent(sv, x.id, g2.data, { force: true })); play('buff'); persist(g2); } };
            }),
            { label: t('loc.close'), run: (g2) => back(g2) },
          ],
        };
      },
    });
  }

  /** «Холодная голова» (cool-head): social approaches get advantage in a quest that is a dispute of two sides. */
  function coolHeadScene(game, s, scene) {
    if (!isDispute(s.qid) || !hasFlagInParty(save(game), game.data, 'cool-head')) return scene;
    const SOCIAL = ['persuasion', 'deception', 'intimidation'];
    return { ...scene, approaches: scene.approaches.map((ap) => ((ap.skills || []).some((x) => SOCIAL.includes(x)) ? { ...ap, adv: true } : ap)) };
  }

  // ---------------------------------------------------------------- quest slots → actions
  function slotAction(game, s) {
    const sv = save(game);
    const q = QUESTS[s.qid];
    const goal = s.goal;
    const done = (g, extra) => { toastAll(g, completeSlot(sv, s, g.data)); if (extra) toastAll(g, extra); refresh(g); };
    const failed = (g) => { toastAll(g, failSlot(sv, s, g.data)); refresh(g); };
    if (s.locked) return { label: `${s.goal.kind === 'battle' ? t('loc.fight') : t('loc.decide')}: ${q.name}`, sub: s.locked, disabled: true, reason: s.locked };
    if (s.kind === 'choice') {
      return { label: `${t('loc.decide')}: ${q.name}`, sub: s.gate || s.stage.text, run: (g) => g.openModal({
        title: q.name, width: 960, lines: [{ text: s.stage.text }, ...(s.gate ? [{ text: s.gate, color: 'c' }] : [])],
        options: [...availableOptions(sv, s).map((o) => {
          const ok = !o.requires || requires(g, o.requires);
          return { label: o.text, disabled: !ok, sub: ok ? null : t('loc.notAvailable'), run: (g2) => { toastAll(g2, chooseOption(sv, s, o.id, g2.data)); refresh(g2); } };
        }), { label: t('loc.questLater'), run: () => {} }],
      }) };
    }
    if (goal.kind === 'battle') {
      return { label: `${t('loc.fight')}: ${q.name}`, sub: `${s.option?.text || s.stage.text} · ${encounterName(goal.encounter)}`,
        run: (g) => startWorldBattle(g, { encounter: goal.encounter, location: locId, onWin: (g2) => { toastAll(g2, completeSlot(sv, s, g2.data)); toastAll(g2, autoProgress(sv, g2.data)); persist(g2); again(g2); } }) };
    }
    if (goal.kind === 'check') {
      return { label: `${t('loc.solve')}: ${q.name}`, sub: `${goal.desc || s.option?.text || s.stage.text} · ${goal.skills.map((x) => t(`skill.${x}`)).join('/')} ${t('battle.dc')} ${goalDc(sv, goal)}`,
        // companions-scenes.md part 2: every quest check is a check scene (explicit by key or autoScene); group — everyone rolls
        run: (g) => openCheckScene(g, { title: q.name, scene: coolHeadScene(g, s, questScene(s).scene), dc: goalDc(sv, goal), members: ms(g), group: !!goal.group, cancel: true,
          memoKey: `quest:${s.qid}:${s.stage.id}:${s.sub ?? '-'}:${s.option?.id ?? '-'}`, xpBase: stageXp(s.qid), stageText: s.stage.text,
          onDone: (g2, ok) => (ok ? done(g2) : failed(g2)) }) };
    }
    if (goal.kind === 'challenge') {
      return { label: `${t('loc.negotiate')}: ${q.name}`, sub: `${goal.desc || s.option?.text || s.stage.text} · ${goal.successes}/${goal.failures} · ${t('battle.dc')} ${goalDc(sv, goal)}`,
        run: (g) => openChallenge(g, { title: q.name, skills: goal.skills, dc: goalDc(sv, goal), successes: goal.successes, failures: goal.failures, members: ms(g),
          forgiveFirst: hasFlagInParty(sv, g.data, 'challenge-forgive'), onDone: (g2, ok) => (ok ? done(g2) : failed(g2)) }) };
    }
    if (goal.kind === 'pay') {
      return { label: `${t('loc.pay')} ${goal.credits}: ${q.name}`, sub: s.option?.text || s.stage.text, disabled: sv.hero.credits < goal.credits,
        run: (g) => { sv.hero.credits -= goal.credits; done(g); } };
    }
    return null;
  }

  const requires = (game, r) => {
    const sv = save(game);
    if (r.flag && !sv.flags[r.flag]) return false;
    if (r.notFlag && sv.flags[r.notFlag]) return false;
    if (r.alignment && sv.hero.alignment !== r.alignment) return false;
    if (r.rep && !tierAtLeast(facTier(game, r.rep.faction), r.rep.min)) return false;
    if (r.item && !(sv.hero.items[r.item] > 0)) return false;
    if (r.credits && sv.hero.credits < r.credits) return false;
    if (r.worldFlag && !hasFlagInParty(sv, game.data, r.worldFlag)) return false;
    // third-exodus.md §2: level / terminals / regions / any / not — the shared world check
    const { avgLevel, terminalsOff, visitedRegions, flags, any, not } = r;
    if ((avgLevel || terminalsOff || visitedRegions || flags || any || not) && !requiresOk(sv, { avgLevel, terminalsOff, visitedRegions, flags, any, not }, game.data)) return false;
    return true;
  };

  // ---------------------------------------------------------------- location actions
  function actions(game) {
    const sv = save(game);
    const out = [];
    const tier = homeTier(game);
    // world-consequences.md ч.3: the base panel (bunker after sq-galina-hatch)
    if (atBase(sv)) out.push({ label: t('base.enter'), sub: t('base.enterSub'), run: (g) => import('./base.js').then((m) => g.setScene(m.createBaseScene(self))) });
    const lore = locationLore(locId);
    const mark = nodeMark(sv, locId); // world-consequences.md: the node changed after a quest
    if (lore || mark) out.push({ label: t('lore.look'), sub: mark ? mark.descs.at(-1) : lore.problem ? `${t('lore.problem')}: ${lore.problem}` : t('lore.lookSub'), run: (g) => openLore(g) });
    const bribe = bribeAction(game);
    if (bribe) out.push(bribe);
    out.push(...amnestyActions(game));
    for (const s of slotsAt(sv, locId)) { const a = slotAction(game, s); if (a) out.push(a); }
    // quests given by the location (giver not standing here)
    for (const qid of loc.quests || []) {
      const q = QUESTS[qid];
      if (!q || sv.quests[qid] || (q.giver && npcsAt(locId, sv).includes(q.giver)) || !requires(game, q.requires || {})) continue;
      if (tier === 'hostile' || (tier === 'suspicious' && !isTrialQuest(q) && !hasFlagInParty(sv, game.data, 'bribe'))) {
        out.push({ label: `${t('loc.questOffer')}: ${q.name}`, sub: tier === 'hostile' ? t('loc.closedHostile') : t('loc.onlyTrial'), disabled: true });
        continue;
      }
      out.push({ label: `${t('loc.questOffer')}: ${q.name}`, sub: q.summary, run: (g) => offerQuest(g, q, null) });
    }
    // free battles of the location
    for (const bd of loc.battles) {
      if (bd.when === 'quest') continue;
      if (bd.when === 'terminal' && sv.terminals[loc.terminal?.id] !== 'ritual') continue;
      if (bd.once && sv.battlesDone.includes(bd.id)) continue;
      out.push({ label: `${t('loc.fight')}: ${encounterName(bd.encounter)}`, sub: bd.when === 'terminal' ? t('loc.guards') : t('loc.fightSub'),
        run: (g) => (bd.when === 'terminal' ? startWorldBattle : startSkirmish)(g, { encounter: bd.encounter, map: bd.map, location: locId, id: bd.id, danger: loc.danger,
          onWin: (g2) => { toastAll(g2, onBattleWon(sv, bd.encounter, locId, g2.data)); toastAll(g2, autoProgress(sv, g2.data)); persist(g2); again(g2); } }) });
    }
    // caches
    for (const c of loc.caches) {
      if (sv.caches.includes(c.id)) continue;
      out.push({ label: t('loc.search'), sub: c.check ? `${cacheSkills(c).map((x) => t(`skill.${x}`)).join(' / ')} ${t('battle.dc')} ${c.check.dc}` : t('loc.free'), run: (g) => searchCache(g, c) });
    }
    // N7 Athletics: crates on the node (once per node)
    const CR = SKILL_RULES.economy.crates;
    if (CR.kinds.includes(loc.kind) && !sv.caches.includes(`crate:${locId}`)) {
      out.push({ label: t('skillUse.crates'), sub: `${t('skillUse.cratesSub')} ${CR.dc}`, run: (g) => openCheck(g, { title: t('skillUse.crates'), skill: CR.skill, dc: CR.dc, members: ms(g), cancel: true, memoKey: `crate:${locId}`,
        onDone: (g2, ok) => {
          sv.caches.push(`crate:${locId}`);
          if (ok) { const c = rollDice(Math.random, CR.credits) * CR.mult; toastAll(g2, grant(sv, { credits: c }, g2.data)); } else g2.toast(t('skillUse.cratesEmpty'), '4');
          refresh(g2);
        } }) });
    }
    // terminal
    if (loc.terminal) {
      const state = sv.terminals[loc.terminal.id];
      const guarded = loc.battles.some((b) => b.when === 'terminal' && !sv.battlesDone.includes(b.id));
      if (state === 'ritual' && !guarded) {
        for (const [aid, ta] of Object.entries(TERMINAL_ACTIONS)) {
          if (!ta.check) continue;
          out.push({ label: `${t('map.terminal')}: ${ta.name}`, sub: `${ta.check.skills.map((x) => t(`skill.${x}`)).join(' / ')} · ${t('battle.dc')} ${ta.check.dc}`,
            run: (g) => terminalCheck(g, aid, ta) });
        }
      } else if (state !== 'ritual') out.push({ label: `${t('map.terminal')}: ${t(`term.${state}`)}`, sub: t('loc.termInfo'), disabled: true });
    }
    // services
    const svc = loc.services.filter((x) => !serviceOff(sv, loc, x));
    if (canCampAt(locId)) out.push(restAction(sv, svc, tier));
    // companions-scenes.md: gifts (giftRare) and requests (refuseOrder)
    if (activeCompanions(sv).length) {
      const asks = activeCompanions(sv).filter((p) => companionRequest(sv, p.npc)).length;
      out.push({ label: `${t('comp.menu')}${asks ? ' ●' : ''}`, sub: t('comp.menuSub'), run: (g) => openCompanions(g) });
    }
    if (['town', 'hub'].includes(loc.kind) || (atBase(sv) && baseModActive(sv, 'workbench').ok)) out.push({ label: t('skillUse.disassemble'), sub: t('skillUse.disassembleSub'), run: (g) => openDisassemble(g) });
    if (svc.includes('heal')) out.push({ label: t('loc.heal'), sub: t('loc.healSub'), run: (g) => { restParty(sv, g.data, 1); g.toast(t('loc.healed'), 'j'); refresh(g); } });
    const cyber = sv.party.filter((p) => p.state === 'cyberspace');
    if ((svc.includes('revive') || (loc.terminal && sv.terminals[loc.terminal.id] === 'ours')) && cyber.length) {
      const free = loc.region === 'harmony' && tierAtLeast(facTier(game, 'technikums'), 'friendly');
      const cost = free ? 0 : SERVICE_PRICES.revive(sv.hero.level) * cyber.length;
      out.push({ label: t('loc.revive'), sub: cost ? `${cost} ${t('world.credits')}` : t('loc.free'), disabled: sv.hero.credits < cost,
        run: (g) => { sv.hero.credits -= cost; for (const p of cyber) { p.state = squadFree(sv) > 0 ? 'active' : 'waiting'; p.hp = null; p.mrl = null; } g.toast(t('loc.revived'), 'j'); refresh(g); } });
    }
    if (svc.includes('trade') && !npcsAt(locId, sv).some((id) => (NPCS[id].services || []).includes('trade'))) out.push({ label: t('loc.trade'), sub: tier === 'hostile' && !hasFlagInParty(sv, game.data, 'black-market') ? t('loc.closedHostile') : t('loc.shopSub'), disabled: tier === 'hostile' && !hasFlagInParty(sv, game.data, 'black-market'), run: (g) => openShopHere(g, loc.name, tier) });
    if (hasFlagInParty(sv, game.data, 'black-market') && ['town', 'hub'].includes(loc.kind)) out.push({ label: t('loc.blackMarket'), sub: t('loc.blackMarketSub'), run: (g) => openShopHere(g, t('loc.blackMarket'), tier, WORLD_RULES.blackMarket) });
    if (svc.includes('rumors')) out.push({ label: t('loc.rumor'), sub: `${WORLD_RULES.rumorPrice} ${t('world.credits')}`, disabled: sv.hero.credits < WORLD_RULES.rumorPrice, run: (g) => { sv.hero.credits -= WORLD_RULES.rumorPrice; rumor(g); refresh(g); } });
    if (hasFlagInParty(sv, game.data, 'gig') && ['town', 'hub'].includes(loc.kind) && !V(game).gig) {
      out.push({ label: t('loc.perform'), sub: `${t(`skill.${WORLD_RULES.gig.skill}`)} ${t('battle.dc')} ${WORLD_RULES.gig.dc}`, run: (g) => openCheck(g, { title: t('loc.perform'), skill: WORLD_RULES.gig.skill, dc: WORLD_RULES.gig.dc, members: [ms(g)[0]],
        memoKey: `gig:${locId}:${sv.day}`, onDone: (g2, ok) => { V(g2).gig = true; const f = locFaction(locId) || 'technikums'; const gg = WORLD_RULES.gig; if (ok) toastAll(g2, grant(sv, { credits: gg.credits, rep: { [f]: gg.rep } }, g2.data)); refresh(g2); } }) });
    }
    return out;
  }

  /** Rest (scenes/rest.js): «Привал» — short / long / lodging (a «rest» service: a night for credits, free when friendly). */
  function restAction(sv, svc, tier) {
    const lodging = svc.includes('rest') ? { cost: tierAtLeast(tier, 'friendly') ? 0 : SERVICE_PRICES.rest(sv.hero.level) } : null;
    const st = restState(sv);
    return { label: t('rest.button'), sub: `${t('rest.buttonSub')} · ${st.short}/${st.max}`,
      run: (g) => openRestMenu(g, { back: self, locId, lodging, done: (g2) => { S.canSwap = true; refresh(g2); }, again }) };
  }

  function rumor(game) {
    const sv = save(game);
    const pool = Object.values(LOCATIONS).filter((l) => !sv.discovered.includes(l.id) && !l.requires);
    const l = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (l) {
      openHidden(sv, l.id);
      journal(sv, `${t('loc.rumorFound')}: ${l.name}`);
      game.toast(`${t('loc.rumorFound')}: ${l.name}`, 'a');
    }
    // third-exodus.md: at marks 1–5 the taverns talk about the Exodus (chance EXODUS.tavernChance)
    const xr = exodusRumor(sv);
    if (xr) {
      journal(sv, `${EXODUS_UI.rumor}: ${xr}`);
      game.openModal({ title: t('lore.rumorsHeard'), lines: [{ text: EXODUS_UI.rumor, color: 'c' }, { text: `«${xr}»` }], options: [{ label: t('battle.continue'), run: () => {} }] });
      return;
    }
    // world-consequences.md: rumors about the party's deeds (quest consequences, crimes) — every second time
    const wr = [...worldRumors(sv), ...crimeRumors(sv)];
    if (wr.length && Math.random() < 0.5) {
      const text = wr[Math.floor(Math.random() * wr.length)];
      journal(sv, `${t('cq.worldRumor')}: ${text}`);
      game.openModal({ title: t('lore.rumorsHeard'), lines: [{ text: t('cq.worldRumor'), color: 'a' }, { text: `«${text}»` }], options: [{ label: t('battle.continue'), run: () => {} }] });
      return;
    }
    // v4: the shared rumor pool (locations-lore.js) — about the revealed place, else any other place
    const others = LORE_RUMORS.filter((r) => r.loc !== locId);
    const lr = (l && LORE_RUMORS.find((r) => r.loc === l.id)) || (others.length ? others[Math.floor(Math.random() * others.length)] : null);
    if (!l && !lr) { game.toast(t('loc.noRumor'), '4'); return; }
    if (lr) {
      journal(sv, `${t('map.rumor')} (${LOCATIONS[lr.loc]?.name || lr.loc}): ${lr.text}`);
      game.openModal({ title: t('lore.rumorsHeard'), lines: [{ text: LOCATIONS[lr.loc]?.name || '', color: 'a' }, { text: `«${lr.text}»` }], options: [{ label: t('battle.continue'), run: () => {} }] });
    }
  }

  // ---------------------------------------------------------------- v4: location lore (locations-lore.js)
  function openLore(game) {
    const sv = save(game);
    const mark = nodeMark(sv, locId);
    const lore = locationLore(locId) || (mark ? {} : null);
    if (!lore) return;
    const hook = npcsAt(locId, sv).some((id) => offeredBy(game, NPCS[id]).length);
    const lines = [{ text: lore.desc || loc.desc || '' }];
    if (mark) for (const d of mark.descs) lines.push({ text: d, color: TONE_COLOR[mark.tone] || 'a' });
    if (lore.problem) lines.push({ text: `${t('lore.problem')}: ${lore.problem}`, color: 'a' }, ...(hook ? [{ text: t('lore.problemQuest'), color: 'j' }] : []));
    if (lore.rumor) lines.push({ text: `${t('lore.rumor')}: «${lore.rumor}»`, color: '4' });
    if (lore.spots?.length) lines.push({ text: t('lore.spots'), color: 'h' });
    game.openModal({ title: loc.name, width: 1000, lines,
      options: [...(lore.spots || []).map((sp) => ({ label: sp.name, sub: spotSub(sv, sp), run: (g) => openSpot(g, sp) })), { label: t('loc.close'), run: () => {} }] });
  }

  const spotCache = (sp) => (sp.cache ? (loc.caches || []).find((c) => c.id === sp.cache) : null);
  const spotDone = (sv, sp) => sv.caches.includes(`spot:${locId}:${sp.id}`) || (spotCache(sp) && sv.caches.includes(sp.cache));
  function spotSub(sv, sp) {
    const c = sp.check ? sp.check : spotCache(sp)?.check;
    const extra = (sp.check || sp.cache) && !spotDone(sv, sp) ? ` · ${c ? `${cacheSkills({ check: c }).map((x) => t(`skill.${x}`)).join('/')} ${t('battle.dc')} ${c.dc}` : t('lore.spotCache')}` : '';
    return `${sp.desc || ''}`.slice(0, 90) + extra;
  }

  /** A point of interest: description; an optional check (spot.check { skill|skills, dc, loot?, xp? }) or cache (spot.cache = id in loc.caches). */
  function openSpot(game, sp) {
    const sv = save(game);
    const opts = [];
    const cache = spotCache(sp);
    if (cache && !sv.caches.includes(cache.id)) opts.push({ label: t('lore.spotCache'), sub: spotSub(sv, sp), run: (g) => searchCache(g, cache) });
    if (sp.check && !spotDone(sv, sp)) {
      opts.push({ label: t('lore.spotCheck'), sub: `${cacheSkills({ check: sp.check }).map((x) => t(`skill.${x}`)).join(' / ')} ${t('battle.dc')} ${sp.check.dc}`,
        run: (g) => openCheck(g, { title: sp.name, skills: cacheSkills({ check: sp.check }), dc: sp.check.dc, members: ms(g), cancel: true, memoKey: `spot:${locId}:${sp.id}`,
          onDone: (g2, ok) => {
            sv.caches.push(`spot:${locId}:${sp.id}`);
            if (ok) toastAll(g2, grant(sv, { xp: sp.check.xp, items: (sp.check.loot || []).filter((x) => x.item), credits: (sp.check.loot || []).reduce((a, x) => a + (x.credits || 0), 0) || undefined }, g2.data));
            else g2.toast(t('check.fail'), 'c');
            refresh(g2);
          } }) });
    }
    game.openModal({ title: `${loc.name}: ${sp.name}`, width: 900, lines: [{ text: sp.desc || '' }],
      options: [...opts, { label: t('battle.continue'), run: (g) => openLore(g) }], onCancel: (g) => openLore(g) });
  }

  // ---------------------------------------------------------------- N7 Tech: take gear apart into servo parts
  function openDisassemble(game) {
    const sv = save(game);
    const D = SKILL_RULES.economy.disassemble;
    const list = Object.entries(sv.hero.items).filter(([id, n]) => n > 0 && isGear(ITEMS[id]) && !ITEMS[id].key);
    game.openModal({ title: t('skillUse.disassemble'), width: 900, lines: list.length ? [{ text: t('skillUse.disassembleSub'), color: 'a' }] : [{ text: t('skillUse.disassembleNone'), color: '4' }],
      options: [...list.map(([id, n]) => {
        const it = ITEMS[id];
        const tried = sv.flags[`dis:${id}:${sv.day}`];
        return { label: `${it.name} ×${n}`, sub: tried ? t('skillUse.disassembleFail') : `${t(`skill.${D.skill}`)} ${t('battle.dc')} ${disassembleDc(it)} → ${ITEMS[D.item]?.name || D.item} ×${disassembleParts(it)}`, disabled: !!tried,
          run: (g) => openCheck(g, { title: `${t('skillUse.disassemble')}: ${it.name}`, skill: D.skill, dc: disassembleDc(it), members: ms(g), cancel: true, memoKey: `dis:${id}:${sv.day}`,
            onDone: (g2, ok) => {
              if (ok) { dropItem(sv, id, 1); toastAll(g2, grant(sv, { items: [{ item: D.item, n: disassembleParts(it) }] }, g2.data)); } else { sv.flags[`dis:${id}:${sv.day}`] = true; g2.toast(t('skillUse.disassembleFail'), 'c'); }
              refresh(g2);
            } }) };
      }), { label: t('loc.close'), run: () => {} }] });
  }

  function searchCache(game, c) {
    const sv = save(game);
    const loot = { items: c.loot.filter((x) => x.item), credits: c.loot.reduce((s, x) => s + (x.credits || 0), 0), ...(c.flag ? { flag: c.flag } : {}) }; // flag: codex find cx-*
    const take = (g) => {
      sv.caches.push(c.id); g.toast(t('loc.found'), 'a'); toastAll(g, grant(sv, loot, g.data)); refresh(g);
      if (c.text) g.openModal({ title: t('loc.found'), lines: [{ text: c.text }], options: [{ label: t('battle.ok'), run: () => {} }] });
    };
    if (!c.check || hasFlagInParty(sv, game.data, 'find-cache')) return take(game);
    openCheck(game, { title: t('loc.search'), skills: cacheSkills(c), dc: c.check.dc, members: ms(game), cancel: true, memoKey: `cache:${c.id}`,
      onDone: (g, ok) => { if (ok) take(g); else { sv.caches.push(c.id); g.toast(t('loc.notFound'), 'c'); refresh(g); } } });
  }

  function terminalCheck(game, aid, ta) {
    const sv = save(game);
    const party = ms(game);
    const adv = (ta.advFlags || []).find((f) => hasFlagInParty(sv, game.data, f));
    openCheck(game, { title: `${loc.name}: ${ta.name}`, skills: ta.check.skills, dc: ta.check.dc, members: party, extraAdv: adv ? t(`flag.${adv}`) : null, cancel: true, memoKey: `term:${loc.terminal.id}:${aid}`,
      onDone: (g, ok) => {
        if (ok) {
          sv.terminals[loc.terminal.id] = ta.result;
          journal(sv, `${loc.name}: ${t(`term.${ta.result}`)}`);
          g.toast(`${loc.name}: ${t(`term.${ta.result}`)}`, 'h');
          toastAll(g, grant(sv, { xp: ta.xp, rep: ta.cultRep ? { cult: ta.cultRep } : null }, g.data));
        } else g.toast(t('check.fail'), 'c');
        refresh(g);
      } });
    void aid;
  }

  /**
   * Quest turn-ins (data/text/quest-turnin.js): unreachable NPC → reward with a short line; queued radio calls → modal;
   * a pending 'return' NPC on this node or in the active party → dialogue with its portrait, then the reward list.
   * → true if something was opened.
   */
  function turnins(game) {
    const sv = save(game);
    toastAll(game, turninFallback(sv, game.data));
    const radio = (sv.pendingRadio || []).shift();
    if (radio) { openRadio(game, radio); persist(game); return true; }
    const near = new Set([...npcsAt(locId, sv), ...activeCompanions(sv).map((p) => p.npc)]);
    const qid = pendingTurnins(sv).find((id) => near.has(QUEST_TURNIN[id].npc));
    if (!qid) {
      // world-consequences.md ч.3: base radio — a «return» turn-in is claimed from anywhere
      const rq = radioTurnin(sv) && pendingTurnins(sv)[0];
      if (!rq) return false;
      const got = claimTurnin(sv, rq, game.data);
      persist(game);
      game.toast(`${t('base.radioTurnin')}: ${QUESTS[rq].name}`, 'a');
      showReward(game, QUESTS[rq].name, got);
      return true;
    }
    const npc = NPCS[QUEST_TURNIN[qid].npc];
    const st = sv.quests[qid];
    game.setScene(createDialogueScene({
      title: tf('q.turninTitle', { name: QUESTS[qid].name }),
      lines: turninLines(qid, st.outcome).slice(0, 3).map((text) => ({ who: npc.id, name: npc.name, text })), hero: heroOf(sv), wounds: true,
      onDone: (g) => {
        g.resume(self);
        const got = claimTurnin(sv, qid, g.data);
        persist(g);
        showReward(g, QUESTS[qid].name, got);
      },
    }));
    return true;
  }

  function showReward(game, name, got) {
    if (!got.length) { refresh(game); return; }
    game.openModal({ title: `${t('q.reward')}: ${name}`, lines: got.map((x) => ({ text: x.text, color: x.color })),
      options: [{ label: t('battle.ok'), run: (g) => { refresh(g); if (!pendingChoice(g)) levelUp(g); } }], onCancel: (g) => refresh(g) });
  }

  function openRadio(game, qid) {
    const sv = save(game);
    const td = QUEST_TURNIN[qid], st = sv.quests[qid];
    const npc = NPCS[td.npc];
    const lines = [{ text: tf('q.radioFrom', { npc: npc?.name || td.npc }), color: 'a' }];
    if (td.radioCall) lines.push({ text: `${sv.hero.name}: «${td.radioCall}»`, color: 'h' });
    for (const l of turninLines(qid, st?.outcome).slice(0, 3)) lines.push({ text: `${npc?.name || td.npc}: «${l}»` });
    game.openModal({ title: `${t('q.radio')} · ${QUESTS[qid].name}`, width: 820, lines,
      options: [{ label: t('battle.continue'), run: (g) => refresh(g) }], onCancel: (g) => refresh(g) });
  }

  /** talentChoice from quest rewards: pick one. */
  function pendingChoice(game) {
    const sv = save(game);
    const list = (sv.pendingTalentChoice || []).shift();
    if (!list) return false;
    const opts = list.filter((id) => TALENTS[id] && !sv.hero.talents.includes(id) && talentOk(sv, id, game.data));
    if (!opts.length) {
      // nothing fits the hero (race / alignment / owned): credits instead, noted in the journal
      const n = WORLD_RULES.talentFallbackCredits;
      toastAll(game, grant(sv, { credits: n }, game.data));
      journal(sv, tf('talent.fallback', { n }));
      persist(game);
      return pendingChoice(game);
    }
    game.openModal({ title: t('talent.choice'), width: 900, onCancel: false, lines: [{ text: t('talent.choiceText'), color: 'a' }],
      options: opts.map((id) => ({ label: TALENTS[id].name, sub: TALENTS[id].desc, detail: talentTip(id), run: (g) => { toastAll(g, learnTalent(sv, id, g.data)); refresh(g); pendingChoice(g); } })) });
    return true;
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
        if (r.ok) { refresh(g); return; }
        theftFail(g, npc, r, loot);
      } });
  }

  function theftFail(game, npc, r, loot) {
    const sv = save(game);
    const f = npcFaction(npc) || locFaction(locId);
    const fine = r.fail.id === 'caught' ? fineFor(loot.value) : CRIME_RULES.fine.min;
    const opts = [];
    for (const a of r.ask) {
      if (a === 'return') opts.push({ label: t('crime.return'), run: (g) => refresh(g) });
      if (a === 'fine') opts.push({ label: tf('crime.fine', { n: fine }), run: (g) => { toastAll(g, payFine(sv, fine)); refresh(g); } });
      if (a === 'fight') opts.push({ label: t('crime.fight'), sub: encounterName(guardEnemies(sv, f).encounter), run: (g) => guardFight(g, f) });
      if (a === 'run') opts.push({ label: t('crime.run'), sub: tf('crime.runSub', { dc: CRIME_RULES.run.dc }), run: (g) => runAway(g, f) });
    }
    game.openModal({ title: r.fail.text, border: 'c', onCancel: false, lines: [{ text: npc.name, color: 'a' }], options: opts });
  }

  /** Fight the node's guards (theft alarm, wanted at the gate). The win counts as passing the gate. */
  function guardFight(game, f) {
    const sv = save(game);
    const ge = guardEnemies(sv, f);
    V(game).gate = true;
    startWorldBattle(game, { enemies: ge.enemies, faction: f, title: tf('crime.guardsTitle', { faction: f ? factionName(f) : loc.name }), onWin: again });
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
        toMap(g);
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
    V(game).gate = true;
    startWorldBattle(game, {
      enemies: st.enemies, faction: st.faction, title: tf('crime.attackTitle', { name: npc.name }), heroInit: init,
      onWin: (g) => { const k = killNpc(sv, npc.id); toastAll(g, k.toasts); persist(g); openLoot(g, k.loot, () => { persist(g); again(g); }); },
      onFlee: (g) => { toastAll(g, attackFailed(sv, npc)); },
    });
  }

  /** Wanted / closed access at the entry (before the reputation gate). → true if a modal was opened. */
  function wantedGate(game) {
    const sv = save(game);
    const leave = (g) => { if (sv.prevLocation && LOCATIONS[sv.prevLocation]) sv.location = sv.prevLocation; persist(g); toMap(g); };
    if (closedLoc(sv, locId) && sv.prevLocation && sv.prevLocation !== locId) {
      game.openModal({ title: tf('cq.closed', { loc: loc.name }), border: 'c', onCancel: false, lines: [{ text: t('cq.closedText') }], options: [{ label: t('wanted.leave'), run: leave }] });
      return true;
    }
    const f = locFaction(locId);
    const th = f ? entryThreat(sv, f) : null;
    if (!th) return false;
    if (hasFlagInParty(sv, game.data, 'forge-pass') && !V(game).forged) { V(game).forged = true; game.toast(t('wanted.forge'), 'j'); return false; }
    const pass = (g) => { if (!gateCheck(g)) afterGate(g); };
    const title = tf('wanted.entryTitle', { faction: factionName(f) });
    if (th === 'check') {
      const ec = entryCheckOf(sv, f);
      game.openModal({ title, border: 'a', onCancel: false, lines: [{ text: t('wanted.entryText') }],
        options: [
          { label: t('wanted.entryCheck'), sub: `${ec.skill.split('|').map((s) => t(`skill.${s}`)).join(' / ')} · ${t('battle.dc')} ${ec.dc}`,
            run: (g) => openCheck(g, { title, skills: ec.skill.split('|'), dc: ec.dc, members: ms(g), memoKey: `wanted:${locId}:${sv.day}`, onDone: (g2, ok) => (ok ? pass(g2) : guardFight(g2, f)) }) },
          { label: t('crime.fight'), run: (g) => guardFight(g, f) },
          { label: t('wanted.leave'), run: leave },
        ] });
      return true;
    }
    game.openModal({ title, border: 'c', onCancel: false, lines: [{ text: t('wanted.guardsText') }],
      options: [
        { label: t('crime.fight'), sub: encounterName(guardEnemies(sv, f).encounter), run: (g) => guardFight(g, f) },
        { label: t('crime.run'), sub: tf('crime.runSub', { dc: CRIME_RULES.run.dc }), run: (g) => runAway(g, f) },
      ] });
    return true;
  }

  /** Bribe an official of the node's faction (wanted 1–4). */
  function bribeAction(game) {
    const sv = save(game);
    const f = locFaction(locId);
    if (!f || !heatOf(sv, f) || !npcsAt(locId, sv).some((id) => npcFaction(NPCS[id]) === f && isOfficial(NPCS[id]))) return null;
    const b = bribeInfo(sv, f);
    const title = tf('wanted.bribe', { faction: factionName(f) });
    return { label: title, sub: b.why || tf('wanted.bribeSub', { n: b.price, dc: b.dc }), disabled: !!b.why, reason: b.why,
      run: (g) => openCheck(g, { title, skills: b.skills, dc: b.dc, members: ms(g), cancel: true, memoKey: `bribe:${f}:${sv.day}`,
        onDone: (g2, ok, res) => { toastAll(g2, applyBribe(sv, f, ok, res ? res.total - b.dc : 0)); refresh(g2); } }) };
  }

  /** Companions: pick one → gift (liked items, once per id) / the personal-quest request (yes / refuse). */
  function openCompanions(game) {
    const sv = save(game);
    game.openModal({ title: t('comp.menu'), lines: [],
      options: [...activeCompanions(sv).map((p) => ({ label: NPCS[p.npc]?.name || p.npc, sub: companionRequest(sv, p.npc) ? `● ${t('comp.request')}` : '',
        run: (g) => openCompanion(g, p.npc) })), { label: t('loc.close'), run: () => {} }] });
  }
  function openCompanion(game, id) {
    const sv = save(game);
    const name = NPCS[id]?.name || id;
    const gifts = giftOptions(sv, id, countAll(sv));
    const req = companionRequest(sv, id);
    const loved = lovedTypes(id).map((x) => t(`comp.type.${x}`)).join(', ');
    game.openModal({ title: name, lines: [],
      options: [
        { label: t('comp.giftBtn'), sub: gifts.length ? gifts.slice(0, 4).map((x) => ITEMS[x].name).join(', ') : tf('comp.giftNone', { types: loved }), disabled: !gifts.length,
          run: (g) => g.openModal({ title: `${t('comp.giftBtn')}: ${name}`, lines: [],
            options: [...gifts.slice(0, 10).map((x) => ({ label: ITEMS[x].name, run: (g2) => { toastAll(g2, giveGift(sv, id, x, dropItem)); refresh(g2); } })),
              { label: t('loc.close'), run: () => {} }] }) },
        ...(req ? [{ label: t('comp.request'), sub: req.text, run: (g) => g.openModal({ title: name, lines: [{ text: tf('comp.requestAsk', { name, text: req.text }) }],
          options: [
            { label: t('comp.requestYes'), run: (g2) => { toastAll(g2, acceptRequest(sv, id)); refresh(g2); } },
            { label: t('comp.requestNo'), run: (g2) => { g2.toast(tf('comp.refused', { name }), '4'); toastAll(g2, refuseRequest(sv, id)); refresh(g2); } },
          ] }) }] : []),
        { label: t('loc.close'), run: () => {} },
      ] });
  }

  /** world-consequences.md §2: amnesty — pay / work off at the faction's official (crime.js WANTED.clear.quest). */
  function amnestyActions(game) {
    const sv = save(game);
    return amnestiesAt(sv, npcsAt(locId, sv)).map(({ faction: f, def, npc }) => {
      const a = amnestyInfo(sv, f, countAll);
      const cost = [
        a.credits ? `${a.credits} ${t('world.credits')}` : '',
        ...a.items.map((x) => `${ITEMS[x.id]?.name || x.id} ×${x.n}`),
        a.days ? tf('wanted.amnestyDays', { n: a.days }) : '',
        a.check ? tf('wanted.amnestyCheck', { skills: a.check.skills.map((x) => t(`skill.${x}`)).join(' / '), dc: a.check.dc }) : '',
      ].filter(Boolean).join(' · ');
      const title = tf('wanted.amnesty', { faction: factionName(f) });
      const pay = (g) => {
        toastAll(g, applyAmnesty(sv, f, dropItem));
        if (a.days) { const ex = passDays(sv, a.days); toastAll(g, ex.out); }
        refresh(g);
      };
      return { label: title, sub: a.why || `${NPCS[npc]?.name || ''}: ${def.task} — ${cost}`, disabled: !!a.why, reason: a.why,
        run: (g) => g.openModal({ title, width: 860, lines: [{ text: `${NPCS[npc]?.name || ''}: ${def.task}` }, { text: `${t('wanted.amnestyCost')}: ${cost}`, color: 'b' }],
          options: [
            { label: t('wanted.amnestyGo'), run: (g2) => {
              if (!a.check) return pay(g2);
              openCheck(g2, { title, skills: a.check.skills, dc: a.check.dc, members: ms(g2), cancel: true, memoKey: `amnesty:${f}:${sv.day}`,
                onDone: (g3, ok) => { if (ok) pay(g3); else { toastAll(g3, amnestyFailed(sv, f)); refresh(g3); } } });
            } },
            { label: t('loc.close'), run: () => {} },
          ] }) };
    });
  }

  /** The finale reached (consequences.js markFinale): the epilogue once, then back here. → true if opened. */
  function pendingEpilogue(game) {
    const sv = save(game);
    if (!sv.pendingEpilogue || game.modals.length) return false;
    sv.pendingEpilogue = false;
    sv.flags['epilogue-seen'] = true;
    persist(game);
    openEpilogue(game, { onDone: (g) => g.resume(self) });
    return true;
  }

  // ---------------------------------------------------------------- layout & input
  function layout(game) {
    const sv = save(game);
    const ox = Math.max(0, Math.floor((game.width - BASE_W) / 2)), oy = Math.max(0, Math.floor((game.height - BASE_H) / 2));
    S.ox = ox; S.oy = oy;
    const btns = [];
    const ids = npcsAt(locId, sv);
    S.npcs = ids;
    S.rows = [];
    const pages = Math.max(1, Math.ceil(ids.length / PAGE));
    S.page = Math.min(S.page, pages - 1);
    ids.slice(S.page * PAGE, S.page * PAGE + PAGE).forEach((id, i) => {
      const npc = NPCS[id];
      const y = oy + 120 + i * 66;
      const acts = npcActions(game, npc);
      // QA v9 B3: natural widths, a second row when they do not fit; the name column keeps NPC_NAME_W
      const bx0 = ox + 86 + NPC_NAME_W, pos = flowButtons(game.ctx, acts, { x: bx0, y: y + 4, w: ox + 24 + 600 - 8 - bx0, h: 52, font: NPC_BTN_FONT, minW: 52 });
      const one = pos.every((p) => p.row === 0);
      acts.forEach((a, k) => btns.push({ ...a, kind: 'npc', npc: id, act: a.id, x: pos[k].x, y: one ? y + 13 : pos[k].y, w: pos[k].w, h: one ? 34 : pos[k].h, font: NPC_BTN_FONT }));
      const all = questsOffered(sv, id);
      S.rows.push({ id, y, quest: offeredBy(game, npc).length > 0 || pendingTurnins(sv, id).length > 0, questLocked: all.length > 0 && !offeredBy(game, npc).length, tier: sv.rep[normFaction(npcRepFaction(npc))] != null ? repTier(sv.rep[normFaction(npcRepFaction(npc))]) : null });
    });
    if (pages > 1) {
      btns.push({ kind: 'page', dir: -1, label: '‹', x: ox + 24, y: oy + 120 + PAGE * 66, w: 40, h: 28, disabled: S.page === 0 });
      btns.push({ kind: 'page', dir: 1, label: '›', x: ox + 70, y: oy + 120 + PAGE * 66, w: 40, h: 28, disabled: S.page >= pages - 1 });
    }
    const acts = actions(game);
    const apages = Math.max(1, Math.ceil(acts.length / MAX_ACTIONS));
    S.apage = Math.min(S.apage, apages - 1);
    acts.slice(S.apage * MAX_ACTIONS, S.apage * MAX_ACTIONS + MAX_ACTIONS).forEach((a, i) => btns.push({ ...a, kind: 'act', x: ox + 648, y: oy + 120 + i * 52, w: 608, h: 46 }));
    if (apages > 1) {
      btns.push({ kind: 'apage', dir: -1, label: '‹', x: ox + 1170, y: oy + 96, w: 40, h: 22, disabled: S.apage === 0 });
      btns.push({ kind: 'apage', dir: 1, label: '›', x: ox + 1216, y: oy + 96, w: 40, h: 22, disabled: S.apage >= apages - 1 });
    }
    const nav = [['map', 'loc.map', 'M'], ['party', 'panel.party', 'P'], ['rep', 'panel.rep', 'R'], ['journal', 'panel.journal', 'J'], ['save', 'save.save', 'S'], ['menu', 'loc.toMenu', 'Esc']];
    nav.forEach(([id, key, k], i) => btns.push({ kind: 'nav', id, label: t(key), key: k, x: ox + 648 + i * 102, y: oy + BASE_H - 60, w: 98, h: 44 }));
    if (sv.hero.pendingTalents > 0) btns.push({ kind: 'nav', id: 'party', label: t('talent.pending'), x: ox + 1016, y: oy + 16, w: 240, h: 36, selected: true });
    else if ((sv.hero.pendingAsi || []).length) btns.push({ kind: 'nav', id: 'party', label: t('lvl.asiPending'), x: ox + 1016, y: oy + 16, w: 240, h: 36, selected: true });
    S.buttons = btns;
    S.members = members(sv, game.data, { includeDown: true });
  }

  function nav(game, id) {
    if (id === 'map') return toMap(game);
    if (id === 'toMenu') { persist(game); return import('./menu.js').then((m) => game.setScene(m.menuScene)); }
    if (id === 'menu') return openPauseMenu(game, { onMenu: (g) => nav(g, 'toMenu') });
    if (id === 'save') { persist(game); return openSaveMenu(game); }
    return import('./panels.js').then((m) => game.setScene(m.createPanelsScene({ tab: id, back: self, canSwap: !!S.canSwap || loc.services.includes('rest') })));
  }

  function click(game, b) {
    if (b.disabled) { if (b.reason) game.toast(b.reason, 'c'); return; }
    play('uiClick');
    if (b.kind === 'npc') doNpc(game, NPCS[b.npc], b.act);
    else if (b.kind === 'act') b.run(game);
    else if (b.kind === 'page') { S.page += b.dir; layout(game); }
    else if (b.kind === 'apage') { S.apage += b.dir; layout(game); }
    else if (b.kind === 'nav') nav(game, b.id);
  }

  self = {
    id: 'location', locId,
    S,
    enter(game) {
      S.time = 0;
      layout(game);
      // third-exodus.md: the zero — the Judge incarnates, the party is pulled to the Main node
      const ex = exodusSync(save(game));
      toastAll(game, ex.out);
      toastAll(game, waitingLoyalty(save(game)));
      if (ex.zero && !save(game).cyberspace) { startExodusZero(game); return; }
      const v = V(game);
      toastAll(game, wantedTick(save(game), locId)); // world-consequences.md: wanted cools outside the faction
      if (!v.gate && wantedGate(game)) return;
      if (!v.gate && gateCheck(game)) return;
      afterGate(game);
    },
    resume(game) { layout(game); if (!pendingChoice(game)) levelUp(game); },
    // toasts over the lower part of the actions column (free space), above the bottom bar
    toastAnchor() { return { x: S.ox + 648 + 304, y: S.oy + BASE_H - 120, dir: -1 }; },
    resize(game) { layout(game); },
    update(game, dt) {
      S.time += dt;
      const inp = game.input;
      if (S.turnin && V(game).gate) { S.turnin = false; if (turnins(game)) return; }
      if (V(game).gate && pendingEpilogue(game)) return;
      S.hover = hitButton(S.buttons, inp.mouse);
      if (inp.mouse.clicked && S.hover) click(game, S.hover);
      else if (inp.wasPressed('KeyM')) nav(game, 'map');
      else if (inp.wasPressed('KeyP')) nav(game, 'party');
      else if (inp.wasPressed('KeyR')) nav(game, 'rep');
      else if (inp.wasPressed('KeyJ')) nav(game, 'journal');
      else if (inp.wasPressed('KeyG')) nav(game, 'gear');
      else if (inp.wasPressed('KeyB')) nav(game, 'codex');
      else if (inp.wasPressed('KeyS')) nav(game, 'save');
      else if (inp.wasPressed('Escape')) nav(game, 'menu');
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      const sv = save(game);
      clear(ctx, W, H);
      const ox = S.ox, oy = S.oy;
      const reg = REGIONS[loc.region];
      const f = locFaction(locId);
      text(ctx, fit(ctx, loc.name, 640, FONT_L), ox + 24, oy + 16, C.h, FONT_L);
      const tier = f ? facTier(game, f) : null;
      const regName = reg?.name && !loc.name.startsWith(reg.name) ? reg.name : '';
      text(ctx, [regName, f ? `${factionName(f)}: ${t(`tier.${tier}`)}` : ''].filter(Boolean).join(' · '), ox + 24, oy + 50, f ? tierColor(tier) : C['4'], FONT);
      if (!sv.hero.pendingTalents && !(sv.hero.pendingAsi || []).length) text(ctx, `${t('world.day')} ${sv.day} · ${t('world.credits')} ${sv.hero.credits} · ${t('world.level')} ${sv.hero.level} (${xpInfo(sv.hero.xp, sv.hero.level).max ? sv.hero.xp : `${sv.hero.xp}/${xpInfo(sv.hero.xp, sv.hero.level).to}`} ${t('res.xp')})`, ox + BASE_W - 24, oy + 20, C.b, FONT_B, 'right');
      const mark = nodeMark(sv, locId); // world-consequences.md: the latest change of the node replaces its line
      textBlock(ctx, mark ? mark.descs.at(-1) : loc.desc || '', ox + 24, oy + 72, BASE_W - 300, mark ? C[TONE_COLOR[mark.tone] || '4'] : C['4'], FONT, LINE, 1);
      text(ctx, t('loc.people'), ox + 24, oy + 100, C['4'], FONT_B);
      S.rows.forEach((row) => {
        const npc = NPCS[row.id];
        panel(ctx, ox + 24, row.y, 600, 60, C['1'], C['2']);
        drawPortrait(ctx, row.id, ox + 32, row.y + 6, 1, { native: true });
        const bx = Math.min(ox + 24 + 600, ...S.buttons.filter((b) => b.kind === 'npc' && b.npc === row.id).map((b) => b.x));
        const tw = bx - (ox + 86) - 8;
        text(ctx, fit(ctx, `${npc.name}${row.quest ? ' !' : row.questLocked ? ` · ${t('loc.questLocked')}` : ''}`, tw, FONT_B), ox + 86, row.y + 8, row.quest ? C.a : C['5'], FONT_B);
        const role = fit(ctx, npc.role || '', tw, '12px monospace');
        text(ctx, role, ox + 86, row.y + 34, row.tier ? tierColor(row.tier) : C['4'], '12px monospace');
        if (role !== (npc.role || '')) hotspot(ox + 86, row.y + 30, tw, 20, { title: npc.name, lines: [npc.role] });
      });
      if (!S.npcs.length) text(ctx, t('loc.nobody'), ox + 24, oy + 130, C['3']);
      text(ctx, t('loc.actions'), ox + 648, oy + 100, C['4'], FONT_B);
      for (const b of S.buttons) {
        if (b.kind === 'act') {
          const hv = S.hover === b;
          panel(ctx, b.x, b.y, b.w, b.h, hv && !b.disabled ? C['3'] : C['2'], hv ? C['4'] : C['3']);
          text(ctx, fit(ctx, b.label, b.w - 24, FONT_B), b.x + 12, b.y + 5, b.disabled ? C['3'] : C['5'], FONT_B);
          if (b.sub) text(ctx, fit(ctx, b.sub, b.w - 24, '12px monospace'), b.x + 12, b.y + 27, b.disabled ? C['3'] : C['4'], '12px monospace');
        } else button(ctx, b, S.hover === b);
      }
      S.members.forEach((m, i) => {
        const x = ox + 24 + i * 152, y = oy + BASE_H - 64;
        panel(ctx, x, y, 146, 52, C['1'], m.isHero ? C.h : C['2']);
        text(ctx, fit(ctx, m.name, 130, FONT_B), x + 8, y + 4, m.isHero ? C.h : C['5'], FONT_B);
        bar(ctx, x + 8, y + 28, 130, 6, m.unit.hp, m.unit.maxHp, 'hp');
        bar(ctx, x + 8, y + 39, 130, 6, m.unit.mrl, m.unit.maxMrl, 'mrl');
        hotspot(x + 4, y + 24, 138, 10, resTip('hp'));
        hotspot(x + 4, y + 35, 138, 10, resTip('mrl'));
        if (m.isHero) {
          // XP to the next level (hover — numbers)
          const xi = xpInfo(sv.hero.xp, sv.hero.level);
          bar(ctx, x + 8, y + 47, 130, 3, xi.k, 1, 'xp');
          hotspot(x + 4, y + 45, 138, 7, { ...resTip('xp'), lines: [t('tip.res.xp'), { text: xi.text, color: 'a' }] });
        }
      });
    },
  };
  return self;
}

/** N5: skills of a cache check — check.skills (several, the best roll or a pick) or check.skill. */
const cacheSkills = (c) => (c.check?.skills?.length ? c.check.skills : [c.check?.skill || 'perception']);

/** «Trial» quests for suspicious factions: side quests (sq-*) without key (no explicit mark in the data). */
const isTrialQuest = (q) => !q.key && (q.trial ?? q.id.startsWith('sq-'));

const ORIGIN_FACTIONS = { tinBrotherhood: 1, pirates: 1, neutralVillages: 1, technikums: 1 };
