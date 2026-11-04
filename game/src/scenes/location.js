// Location / hub screen (world.md §1, §3–§6): NPCs from LOCATIONS[id].npcs with actions from their `services`
// (talk, trade, train/implant, recruit, quest), location actions (rest, heal, revive, trade, rumors, terminal, battles,
// caches, quest goals, field camp), entry gate by reputation, unique events on enter/rest,
// bottom bar: map / party / reputation / journal / menu. Every change is autosaved.
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, talentAllowed, isCombatTalent } from '../data/talents.js';
import { drawPortrait } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, textBlock, fit, panel, button, hitButton, clear, bar } from '../ui/draw.js';
import { openCheck, openGroupCheck, openChallenge } from '../ui/checks-ui.js';
import {
  LOCATIONS, REGIONS, ITEMS, SHOP_STOCK, TERMINAL_ACTIONS, SERVICE_PRICES, QUESTS, ENCOUNTER_TABLES,
  npcsAt, npcGreeting, npcTopics, npcRepFaction, TRAINER_ALIAS, encounterName,
} from '../world/data.js';
import { repTier, factionName, normFaction, tierAtLeast } from '../world/reputation.js';
import {
  members, activeCompanions, buildHero, canRecruit, recruit, grant, restParty, restDepartures, journal,
  locFaction, regionOf, hasFlagInParty, discover, pickEncounter, learnTalent, talentOk, openHidden, encounterThreshold, MAX_PARTY,
} from '../world/state.js';
import { questsOffered, startQuest, slotsAt, onTalk, onBattleWon, completeSlot, chooseOption, failSlot, autoProgress, availableOptions } from '../world/quests.js';
import { startWorldBattle } from './world-battle.js';
import { createDialogueScene } from './dialogue.js';
import { eventsFor, runEvent } from './event.js';
import { saveGame } from '../save.js';
import { openShop } from './shop.js';
import { runEncounter } from './encounter.js';
import { hasWorldFlag } from '../world/checks.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { FIELD_CAMP } from '../world/data.js';

const BASE_W = 1280, BASE_H = 720;
const PAGE = 7;
const MAX_ACTIONS = 9;
const TIER_COL = { hostile: 'c', suspicious: 'a', neutral: '4', friendly: 'j', ally: 'h' };
export const tierColor = (tier) => C[TIER_COL[tier] || '4'];

export function createLocationScene(locId) {
  const S = { page: 0, apage: 0, buttons: [], hover: null, time: 0, gate: false, visit: {} };
  let self;
  const loc = LOCATIONS[locId];
  const save = (game) => game.save;
  const toastAll = (game, list) => { for (const x of list) game.toast(x.text, x.color); };
  const persist = (game) => saveGame(game.save);
  const facTier = (game, f) => (f ? repTier(game.save.rep[normFaction(f)]) : 'neutral');
  const back = (game) => { game.resume(self); refresh(game); };
  const refresh = (game) => { toastAll(game, autoProgress(save(game), game.data)); persist(game); layout(game); };
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
    persist(g);
    if (!v.enterEvents) {
      v.enterEvents = true;
      const ev = eventsFor(save(g), locId, 'enter')[0];
      if (ev) { runEvent(g, ev, (g2) => again(g2)); return; }
    }
    pendingChoice(g);
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
      const toll = SERVICE_PRICES.toll(e.toll || G.toll);
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

  function npcActions(game, npc) {
    const sv = npc.services || [];
    const acts = [{ id: 'talk', label: t('loc.talk') }];
    if (sv.includes('trade')) acts.push({ id: 'trade', label: t('loc.trade') });
    if (sv.includes('train') && trainerTalents(game, npc).length) acts.push({ id: 'train', label: loc.services.includes('implant') ? t('loc.implant') : t('loc.train') });
    if (npc.recruitable) {
      const why = canRecruit(save(game), npc.id);
      if (why !== 'already') acts.push({ id: 'recruit', label: t('loc.recruit'), disabled: !!why, reason: why ? t(`loc.recruit.${why}`) : null });
    }
    return acts;
  }

  function doNpc(game, npc, act) {
    const sv = save(game);
    const tier = facTier(game, npcRepFaction(npc));
    if (act === 'talk') return talk(game, npc, tier);
    if (act === 'trade') return openShopHere(game, npc.name, tier);
    if (act === 'train') return openTrain(game, npc);
    if (act === 'recruit') {
      const state = recruit(sv, npc.id);
      game.toast(`${npc.name}: ${t(state === 'active' ? 'loc.joined' : 'loc.waiting')}`, 'j');
      return refresh(game);
    }
  }

  function talk(game, npc, tier) {
    const sv = save(game);
    sv.npcs[npc.id] = { ...(sv.npcs[npc.id] || {}), met: true };
    const askTopics = (g) => {
      const topics = npcTopics(npc);
      if (!topics.length || tier === 'hostile') return finishTalk(g);
      g.openModal({
        title: npc.name, onCancel: (g2) => finishTalk(g2),
        lines: [{ text: t('loc.topics'), color: 'a' }],
        options: [...topics.map((tp) => ({ label: tp.q, run: (g2) => {
          g2.openModal({ title: npc.name, lines: [{ text: `— ${tp.q}`, color: '4' }, { text: tp.a }], onCancel: (g3) => askTopics(g3),
            options: [{ label: t('battle.continue'), run: (g3) => { if (tp.hook && LOCATIONS[tp.hook]) discover(sv, tp.hook); askTopics(g3); } }] });
        } })), { label: t('loc.bye'), run: (g2) => finishTalk(g2) }],
      });
    };
    const finishTalk = (g) => {
      toastAll(g, onTalk(sv, npc.id, g.data));
      const offered = questsOffered(sv, npc.id);
      if (offered.length) offerQuest(g, offered[0], npc.id);
      refresh(g);
    };
    game.setScene(createDialogueScene({
      title: loc.name, lines: [npcGreeting(npc, tier)], hero: { race: sv.hero.race, cls: sv.hero.cls },
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

  function openShopHere(game, who, tier, stock = SHOP_STOCK) {
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

  // ---------------------------------------------------------------- quest slots → actions
  function slotAction(game, s) {
    const sv = save(game);
    const q = QUESTS[s.qid];
    const goal = s.goal;
    const done = (g, extra) => { toastAll(g, completeSlot(sv, s, g.data)); if (extra) toastAll(g, extra); refresh(g); };
    const failed = (g) => { toastAll(g, failSlot(sv, s, g.data)); refresh(g); };
    if (s.kind === 'choice') {
      return { label: `${t('loc.decide')}: ${q.name}`, sub: s.stage.text, run: (g) => g.openModal({
        title: q.name, width: 960, lines: [{ text: s.stage.text }],
        options: [...availableOptions(sv, s).map((o) => {
          const ok = !o.requires || requires(g, o.requires);
          return { label: o.text, disabled: !ok, sub: ok ? null : t('loc.notAvailable'), run: (g2) => { toastAll(g2, chooseOption(sv, s, o.id, g2.data)); refresh(g2); } };
        }), { label: t('loc.questLater'), run: () => {} }],
      }) };
    }
    if (goal.kind === 'battle') {
      return { label: `${t('loc.fight')}: ${q.name}`, sub: `${s.option?.text || s.stage.text} · ${encounterName(goal.encounter)}`,
        run: (g) => startWorldBattle(g, { encounter: goal.encounter, location: locId, onWin: (g2) => { toastAll(g2, completeSlot(sv, s, g2.data)); persist(g2); again(g2); } }) };
    }
    if (goal.kind === 'check') {
      const party = ms(game);
      return { label: `${t('loc.solve')}: ${q.name}`, sub: `${s.option?.text || s.stage.text} · ${goal.skills.map((x) => t(`skill.${x}`)).join('/')} ${t('battle.dc')} ${goal.dc}`,
        run: (g) => (goal.group ? openGroupCheck : openCheck)(g, { title: q.name, skills: goal.skills, dc: goal.dc, members: party, cancel: !goal.group, memoKey: `quest:${s.qid}:${s.stage.id}:${s.sub ?? '-'}:${s.option?.id ?? '-'}`,
          onDone: (g2, ok) => (ok ? done(g2) : failed(g2)) }) };
    }
    if (goal.kind === 'challenge') {
      return { label: `${t('loc.negotiate')}: ${q.name}`, sub: `${s.option?.text || s.stage.text} · ${goal.successes}/${goal.failures} · ${t('battle.dc')} ${goal.dc}`,
        run: (g) => openChallenge(g, { title: q.name, skills: goal.skills, dc: goal.dc, successes: goal.successes, failures: goal.failures, members: ms(g),
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
    return true;
  };

  // ---------------------------------------------------------------- location actions
  function actions(game) {
    const sv = save(game);
    const out = [];
    const tier = homeTier(game);
    for (const s of slotsAt(sv, locId)) { const a = slotAction(game, s); if (a) out.push(a); }
    // quests given by the location (giver not standing here)
    for (const qid of loc.quests || []) {
      const q = QUESTS[qid];
      if (!q || sv.quests[qid] || (q.giver && npcsAt(locId).includes(q.giver)) || !requires(game, q.requires || {})) continue;
      out.push({ label: `${t('loc.questOffer')}: ${q.name}`, sub: q.summary, run: (g) => offerQuest(g, q, null) });
    }
    // free battles of the location
    for (const bd of loc.battles) {
      if (bd.when === 'quest') continue;
      if (bd.when === 'terminal' && sv.terminals[loc.terminal?.id] !== 'ritual') continue;
      if (bd.once && sv.battlesDone.includes(bd.id)) continue;
      out.push({ label: `${t('loc.fight')}: ${encounterName(bd.encounter)}`, sub: bd.when === 'terminal' ? t('loc.guards') : t('loc.fightSub'),
        run: (g) => startWorldBattle(g, { encounter: bd.encounter, map: bd.map, location: locId, id: bd.id,
          onWin: (g2) => { toastAll(g2, onBattleWon(sv, bd.encounter, locId, g2.data)); persist(g2); again(g2); } }) });
    }
    // caches
    for (const c of loc.caches) {
      if (sv.caches.includes(c.id)) continue;
      out.push({ label: t('loc.search'), sub: c.check ? `${t(`skill.${c.check.skill}`)} ${t('battle.dc')} ${c.check.dc}` : t('loc.free'), run: (g) => searchCache(g, c) });
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
    const svc = loc.services;
    if (svc.includes('rest')) {
      const free = tierAtLeast(tier, 'friendly');
      const cost = free ? 0 : SERVICE_PRICES.rest(sv.hero.level);
      out.push({ label: t('loc.rest'), sub: cost ? `${cost} ${t('world.credits')} · 100%` : `${t('loc.free')} · 100%`, disabled: sv.hero.credits < cost,
        run: (g) => { sv.hero.credits -= cost; doRest(g, 1); } });
    } else if (loc.region !== 'harmony' && loc.kind !== 'boss') {
      out.push({ label: t('loc.camp'), sub: t('loc.campSub'), run: (g) => doRest(g, FIELD_CAMP.restore, true) });
    }
    if (svc.includes('heal')) out.push({ label: t('loc.heal'), sub: t('loc.healSub'), run: (g) => { restParty(sv, g.data, 1); g.toast(t('loc.healed'), 'j'); refresh(g); } });
    const cyber = sv.party.filter((p) => p.state === 'cyberspace');
    if ((svc.includes('revive') || (loc.terminal && sv.terminals[loc.terminal.id] === 'ours')) && cyber.length) {
      const free = loc.region === 'harmony' && tierAtLeast(facTier(game, 'technikums'), 'friendly');
      const cost = free ? 0 : SERVICE_PRICES.revive(sv.hero.level) * cyber.length;
      out.push({ label: t('loc.revive'), sub: cost ? `${cost} ${t('world.credits')}` : t('loc.free'), disabled: sv.hero.credits < cost,
        run: (g) => { sv.hero.credits -= cost; for (const p of cyber) { p.state = activeCompanions(sv).length < MAX_PARTY ? 'active' : 'waiting'; p.hp = null; p.mrl = null; } g.toast(t('loc.revived'), 'j'); refresh(g); } });
    }
    if (svc.includes('trade') && !npcsAt(locId).some((id) => (NPCS[id].services || []).includes('trade'))) out.push({ label: t('loc.trade'), sub: t('loc.shopSub'), run: (g) => openShopHere(g, loc.name, tier) });
    if (hasFlagInParty(sv, game.data, 'black-market') && ['town', 'hub'].includes(loc.kind)) out.push({ label: t('loc.blackMarket'), sub: t('loc.blackMarketSub'), run: (g) => openShopHere(g, t('loc.blackMarket'), tier, WORLD_RULES.blackMarket) });
    if (svc.includes('rumors')) out.push({ label: t('loc.rumor'), sub: `${WORLD_RULES.rumorPrice} ${t('world.credits')}`, disabled: sv.hero.credits < WORLD_RULES.rumorPrice, run: (g) => { sv.hero.credits -= WORLD_RULES.rumorPrice; rumor(g); refresh(g); } });
    if (hasFlagInParty(sv, game.data, 'gig') && ['town', 'hub'].includes(loc.kind) && !V(game).gig) {
      out.push({ label: t('loc.perform'), sub: `${t(`skill.${WORLD_RULES.gig.skill}`)} ${t('battle.dc')} ${WORLD_RULES.gig.dc}`, run: (g) => openCheck(g, { title: t('loc.perform'), skill: WORLD_RULES.gig.skill, dc: WORLD_RULES.gig.dc, members: [ms(g)[0]],
        memoKey: `gig:${locId}:${sv.day}`, onDone: (g2, ok) => { V(g2).gig = true; const f = locFaction(locId) || 'technikums'; const gg = WORLD_RULES.gig; if (ok) toastAll(g2, grant(sv, { credits: gg.credits, rep: { [f]: gg.rep } }, g2.data)); refresh(g2); } }) });
    }
    return out;
  }

  function doRest(game, frac, field) {
    const sv = save(game);
    const party = ms(game);
    const has = (f) => hasWorldFlag(party, f);
    // rest-heal: a field camp restores everything; rest-mrl: MRL fully
    restParty(sv, game.data, field && has('rest-heal') ? 1 : frac);
    if (field && has('rest-mrl') && !has('rest-heal')) { sv.hero.mrl = null; for (const p of activeCompanions(sv)) p.mrl = null; }
    if (has('free-medkit') || has('herb-medkit') || has('multitool')) sv.hero.items.medkit = (sv.hero.items.medkit || 0) + 1;
    delete sv.flags['used:disguise'];
    delete sv.flags['used:silent-pick'];
    S.canSwap = true;
    game.toast(frac >= 1 ? t('loc.rested') : t('loc.camped'), 'j');
    toastAll(game, restDepartures(sv));
    refresh(game);
    const ev = eventsFor(sv, locId, 'rest')[0];
    if (ev) return runEvent(game, ev, (g) => again(g));
    if (field && FIELD_CAMP.encounterRoll) {
      // as a travel day (world.md §2): d20 ≤ 3 × danger + mod, the encounter through the shared handler
      const th = encounterThreshold(sv, { to: locId }, game.data);
      if (!th.need) return;
      const roll = 1 + Math.floor(Math.random() * 20);
      game.toast(`${t('world.encounterRoll')}: d20 = ${roll} ${t('map.vs')} ≤ ${th.need}`, roll <= th.need ? 'c' : '4');
      if (roll <= th.need) {
        const e = pickEncounter(sv, loc.region);
        if (e) runEncounter(game, e, loc.region, self, () => { game.resume(self); refresh(game); });
      }
    }
  }

  function rumor(game) {
    const sv = save(game);
    const pool = Object.values(LOCATIONS).filter((l) => !sv.discovered.includes(l.id) && !l.requires);
    if (!pool.length) { game.toast(t('loc.noRumor'), '4'); return; }
    const l = pool[Math.floor(Math.random() * pool.length)];
    openHidden(sv, l.id);
    journal(sv, `${t('loc.rumorFound')}: ${l.name}`);
    game.toast(`${t('loc.rumorFound')}: ${l.name}`, 'a');
  }

  function searchCache(game, c) {
    const sv = save(game);
    const loot = { items: c.loot.filter((x) => x.item), credits: c.loot.reduce((s, x) => s + (x.credits || 0), 0) };
    const take = (g) => { sv.caches.push(c.id); g.toast(t('loc.found'), 'a'); toastAll(g, grant(sv, loot, g.data)); refresh(g); };
    if (!c.check || hasFlagInParty(sv, game.data, 'find-cache')) return take(game);
    openCheck(game, { title: t('loc.search'), skill: c.check.skill, dc: c.check.dc, members: ms(game), cancel: true, memoKey: `cache:${c.id}`,
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

  /** talentChoice from quest rewards: pick one. */
  function pendingChoice(game) {
    const sv = save(game);
    const list = (sv.pendingTalentChoice || []).shift();
    if (!list) return false;
    const opts = list.filter((id) => TALENTS[id] && !sv.hero.talents.includes(id) && talentOk(sv, id, game.data));
    if (!opts.length) return pendingChoice(game);
    game.openModal({ title: t('talent.choice'), width: 900, onCancel: false, lines: [{ text: t('talent.choiceText'), color: 'a' }],
      options: opts.map((id) => ({ label: TALENTS[id].name, sub: TALENTS[id].desc, run: (g) => { toastAll(g, learnTalent(sv, id, g.data)); refresh(g); pendingChoice(g); } })) });
    return true;
  }

  // ---------------------------------------------------------------- layout & input
  function layout(game) {
    const sv = save(game);
    const ox = Math.max(0, Math.floor((game.width - BASE_W) / 2)), oy = Math.max(0, Math.floor((game.height - BASE_H) / 2));
    S.ox = ox; S.oy = oy;
    const btns = [];
    const ids = npcsAt(locId);
    S.npcs = ids;
    S.rows = [];
    const pages = Math.max(1, Math.ceil(ids.length / PAGE));
    S.page = Math.min(S.page, pages - 1);
    ids.slice(S.page * PAGE, S.page * PAGE + PAGE).forEach((id, i) => {
      const npc = NPCS[id];
      const y = oy + 120 + i * 66;
      let x = ox + 24 + 600 - 8;
      const acts = npcActions(game, npc);
      for (let k = acts.length - 1; k >= 0; k--) {
        const a = acts[k];
        x -= 92 + 4;
        btns.push({ ...a, kind: 'npc', npc: id, act: a.id, x, y: y + 14, w: 92, h: 34, font: FONT });
      }
      S.rows.push({ id, y, quest: questsOffered(sv, id).length > 0, tier: sv.rep[normFaction(npcRepFaction(npc))] != null ? repTier(sv.rep[normFaction(npcRepFaction(npc))]) : null });
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
    const nav = [['map', 'loc.map', 'M'], ['party', 'panel.party', 'P'], ['rep', 'panel.rep', 'R'], ['journal', 'panel.journal', 'J'], ['menu', 'loc.toMenu', 'Esc']];
    nav.forEach(([id, key, k], i) => btns.push({ kind: 'nav', id, label: t(key), key: k, x: ox + 648 + i * 122, y: oy + BASE_H - 60, w: 116, h: 44 }));
    if (sv.hero.pendingTalents > 0) btns.push({ kind: 'nav', id: 'party', label: t('talent.pending'), x: ox + 1016, y: oy + 16, w: 240, h: 36, selected: true });
    S.buttons = btns;
    S.members = members(sv, game.data, { includeDown: true });
  }

  function nav(game, id) {
    if (id === 'map') return toMap(game);
    if (id === 'menu') { persist(game); return import('./menu.js').then((m) => game.setScene(m.menuScene)); }
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
      const v = V(game);
      if (!v.gate && gateCheck(game)) return;
      afterGate(game);
    },
    resume(game) { layout(game); pendingChoice(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      S.time += dt;
      const inp = game.input;
      S.hover = hitButton(S.buttons, inp.mouse);
      if (inp.mouse.clicked && S.hover) click(game, S.hover);
      else if (inp.wasPressed('KeyM')) nav(game, 'map');
      else if (inp.wasPressed('KeyP')) nav(game, 'party');
      else if (inp.wasPressed('KeyR')) nav(game, 'rep');
      else if (inp.wasPressed('KeyJ')) nav(game, 'journal');
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
      text(ctx, `${reg?.name || ''}${f ? ` · ${factionName(f)}: ${t(`tier.${tier}`)}` : ''}`, ox + 24, oy + 50, f ? tierColor(tier) : C['4'], FONT);
      if (!sv.hero.pendingTalents) text(ctx, `${t('world.day')} ${sv.day} · ${t('world.credits')} ${sv.hero.credits} · ${t('world.level')} ${sv.hero.level} (${sv.hero.xp} XP)`, ox + BASE_W - 24, oy + 20, C.b, FONT_B, 'right');
      textBlock(ctx, loc.desc || '', ox + 24, oy + 72, BASE_W - 300, C['4'], FONT, LINE, 1);
      text(ctx, t('loc.people'), ox + 24, oy + 100, C['4'], FONT_B);
      S.rows.forEach((row) => {
        const npc = NPCS[row.id];
        panel(ctx, ox + 24, row.y, 600, 60, C['1'], C['2']);
        drawPortrait(ctx, row.id, ox + 36, row.y + 14, 1);
        const nActs = S.buttons.filter((b) => b.kind === 'npc' && b.npc === row.id).length;
        const tw = 600 - 70 - nActs * 96 - 12;
        text(ctx, fit(ctx, `${npc.name}${row.quest ? ' !' : ''}`, tw, FONT_B), ox + 86, row.y + 8, row.quest ? C.a : C['5'], FONT_B);
        text(ctx, fit(ctx, npc.role || '', tw, '12px monospace'), ox + 86, row.y + 34, row.tier ? tierColor(row.tier) : C['4'], '12px monospace');
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
      });
    },
  };
  return self;
}

const ORIGIN_FACTIONS = { tinBrotherhood: 1, pirates: 1, neutralVillages: 1, technikums: 1 };
