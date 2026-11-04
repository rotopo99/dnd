// Location / hub screen (world.md §1, §3–§6): NPCs with actions from `services` (talk, trade, train, recruit, quest),
// location actions (rest, heal, terminal, battles, caches, quest goals, field camp), entry gate by reputation,
// bottom bar: party / reputation / journal / world map / menu. Every change is autosaved.
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, talentAllowed, isCombatTalent, COMBAT_TALENT_LIMIT } from '../data/talents.js';
import { drawSprite, heroSpriteIds, idleFrame } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, textBlock, fit, panel, button, hitButton, clear, bar } from '../ui/draw.js';
import { openCheck, openGroupCheck, openChallenge } from '../ui/checks-ui.js';
import { LOCATIONS, REGIONS, ITEMS, SHOP_STOCK, npcsAt, npcLines, TRAINER_ALIAS } from '../world/data.js';
import { repTier, factionName, normFaction } from '../world/reputation.js';
import {
  members, activeCompanions, buildHero, canRecruit, recruit, grant, restParty, restDepartures, journal,
  locFaction, regionOf, hasFlagInParty, scaleEnemies, discover, pickEncounter,
} from '../world/state.js';
import { questsOffered, startQuest, goalsAt, onTalk, onBattleWon, advance, questDef } from '../world/quests.js';
import { startWorldBattle } from './world-battle.js';
import { createDialogueScene } from './dialogue.js';
import { saveGame } from '../save.js';

const BASE_W = 1280, BASE_H = 720;
const PAGE = 7;
const TIER_COL = { hostile: 'c', suspicious: 'a', neutral: '4', friendly: 'j', ally: 'h' };
export const tierColor = (tier) => C[TIER_COL[tier] || '4'];

const priceMult = (tier) => (tier === 'suspicious' ? 1.25 : tier === 'friendly' ? 0.9 : tier === 'ally' ? 0.8 : 1);

export function createLocationScene(locId) {
  const S = { page: 0, buttons: [], hover: null, time: 0, gate: false, visitFlags: {} };
  let self;
  const loc = LOCATIONS[locId];

  const save = (game) => game.save;
  const toastAll = (game, list) => { for (const x of list) game.toast(x.text, x.color); };
  const persist = (game) => saveGame(game.save);
  const facTier = (game, f) => (f ? repTier(game.save.rep[normFaction(f)]) : 'neutral');
  const back = (game) => { game.resume(self); refresh(game); };

  function refresh(game) { persist(game); layout(game); }

  // ---------------------------------------------------------------- entry gate (world.md §3)
  function gateCheck(game) {
    S.gate = true;
    const f = locFaction(locId);
    if (!f || loc.kind === 'terminal' || loc.kind === 'cache') return;
    let tier = facTier(game, f);
    if (tier === 'suspicious' && hasFlagInParty(save(game), game.data, 'arbiter-badge')) tier = 'neutral';
    if (tier === 'suspicious' && hasFlagInParty(save(game), game.data, 'mutant-kin') && f.startsWith('mutants')) tier = 'neutral';
    const ms = members(save(game), game.data);
    const leave = (g) => {
      const sv = save(g);
      if (sv.prevLocation && LOCATIONS[sv.prevLocation]) sv.location = sv.prevLocation;
      saveGame(sv);
      import('./world-map.js').then((m) => g.setScene(m.createWorldMapScene()));
    };
    if (tier === 'hostile') {
      game.openModal({
        title: t('loc.gateHostile'), border: 'c', onCancel: false,
        lines: [{ text: t('loc.gateHostileText').replace('{f}', factionName(f)) }],
        options: [
          { label: t('loc.gateFight'), run: (g) => startWorldBattle(g, { title: loc.name, enemies: scaleEnemies(gateEnemies(locId), activeCompanions(save(g)).length + 1, save(g).hero.level, g.data), faction: f, onWin: (g2) => { g2.setScene(createLocationScene(locId)); } }) },
          { label: t('loc.gateSneak'), sub: `${t('check.group')} · ${t('battle.dc')} 14`, run: (g) => openGroupCheck(g, { title: t('loc.gateSneak'), skill: 'stealth', dc: 14, members: ms, onDone: (g2, ok) => { if (!ok) leave(g2); else g2.toast(t('loc.gateSneaked'), 'j'); } }) },
          { label: t('loc.gateLeave'), run: leave },
        ],
      });
    } else if (tier === 'suspicious') {
      game.openModal({
        title: t('loc.gateSuspicious'), border: 'a', onCancel: false,
        lines: [{ text: t('loc.gateSuspiciousText').replace('{f}', factionName(f)) }],
        options: [
          { label: t('loc.gatePersuade'), sub: `${t('battle.dc')} 13`, run: (g) => openCheck(g, { title: t('loc.gatePersuade'), skill: 'persuasion', dc: 13, members: ms, onDone: (g2, ok) => { if (!ok) leave(g2); } }) },
          { label: t('loc.gateDeceive'), sub: `${t('battle.dc')} 13`, run: (g) => openCheck(g, { title: t('loc.gateDeceive'), skill: 'deception', dc: 13, members: ms, onDone: (g2, ok) => { if (!ok) leave(g2); } }) },
          { label: t('loc.gateToll'), sub: '20', disabled: save(game).hero.credits < 20, run: (g) => { save(g).hero.credits -= 20; refresh(g); } },
          { label: t('loc.gateLeave'), run: leave },
        ],
      });
    }
  }

  function gateEnemies(id) {
    const reg = regionOf(id);
    const b = (reg?.encounters || []).find((e) => e.kind === 'battle');
    return b ? b.enemies : ['scavenger', 'scavenger'];
  }

  // ---------------------------------------------------------------- NPC actions
  function trainerTalents(game, npc) {
    const keys = new Set([normFaction(npc.faction), npc.id]);
    for (const [k, ids] of Object.entries(TRAINER_ALIAS)) if (ids.includes(npc.id)) keys.add(k);
    const implants = npc.id === 'nikola' || (loc.services.includes('implant') && (npc.services || []).includes('train'));
    const hu = buildHero(save(game), game.data);
    const ctx = { race: save(game).hero.race, cls: save(game).hero.cls, origin: save(game).hero.origin, alignment: save(game).hero.alignment,
      stats: hu.stats, level: save(game).hero.level, weaponRange: hu.weapon?.range || 1, tags: hu.tags };
    return Object.values(TALENTS).filter((x) => ((x.source?.kind === 'trainer' && keys.has(x.source.trainer)) || (implants && x.source?.kind === 'implant'))
      && talentAllowed(x, ctx));
  }

  function npcActions(game, npc) {
    const sv = npc.services || [];
    const acts = [{ id: 'talk', label: t('loc.talk') }];
    if (sv.includes('trade')) acts.push({ id: 'trade', label: t('loc.trade') });
    if (sv.includes('train') && trainerTalents(game, npc).length) acts.push({ id: 'train', label: t('loc.train') });
    if (npc.recruitable) {
      const why = canRecruit(save(game), npc.id);
      if (why !== 'already') acts.push({ id: 'recruit', label: t('loc.recruit'), disabled: !!why, reason: why ? t(`loc.recruit.${why}`) : null });
    }
    if (questsOffered(save(game), npc.id).length) acts.push({ id: 'quest', label: t('loc.quest') });
    return acts;
  }

  function doNpc(game, npc, act) {
    const sv = save(game);
    const tier = facTier(game, npc.faction);
    if (act === 'talk') {
      sv.npcs[npc.id] = { ...(sv.npcs[npc.id] || {}), met: true };
      const lines = npcLines(npc, tier);
      const portrait = heroSpriteIds(game.data.RACES[npc.race] ? npc.race : 'human', npc.cls || null);
      game.setScene(createDialogueScene({
        title: loc.name, lines, hero: { race: sv.hero.race, cls: sv.hero.cls }, portraits: { [npc.id]: portrait },
        onDone: (g) => {
          g.resume(self);
          toastAll(g, onTalk(sv, npc.id, g.data));
          const offered = questsOffered(sv, npc.id);
          if (offered.length) offerQuest(g, offered[0]);
          refresh(g);
        },
      }));
      return;
    }
    if (act === 'trade') return openShop(game, npc.name, tier);
    if (act === 'train') return openTrain(game, npc);
    if (act === 'recruit') {
      const state = recruit(sv, npc.id);
      game.toast(`${npc.name}: ${t(state === 'active' ? 'loc.joined' : 'loc.waiting')}`, 'j');
      return refresh(game);
    }
    if (act === 'quest') return offerQuest(game, questsOffered(sv, npc.id)[0]);
  }

  function offerQuest(game, q) {
    game.openModal({
      title: `${t('loc.questOffer')}: ${q.name}`, lines: [{ text: q.desc }, { text: q.stages[0].text, color: 'a' }],
      options: [
        { label: t('loc.questTake'), run: (g) => { toastAll(g, startQuest(save(g), q.id)); refresh(g); } },
        { label: t('loc.questLater'), run: () => {} },
      ],
    });
  }

  function openShop(game, who, tier) {
    const m = priceMult(tier);
    game.openModal({
      build: (g) => ({
        title: `${t('loc.trade')}: ${who}`,
        lines: [{ text: `${t('world.credits')}: ${save(g).hero.credits}`, color: 'b' }, ...(m !== 1 ? [{ text: `${t('loc.prices')} ×${m}`, color: '4' }] : [])],
        options: [
          ...SHOP_STOCK.map((id) => {
            const it = ITEMS[id];
            const price = Math.round(it.price * m);
            const have = save(g).hero.items[id] || 0;
            return { label: `${it.name} — ${price}`, sub: `${it.desc} (${t('loc.have')} ${have})`, keep: true, disabled: save(g).hero.credits < price,
              run: (g2) => { save(g2).hero.credits -= price; save(g2).hero.items[id] = have + 1; play('buff'); persist(g2); } };
          }),
          { label: t('loc.close'), run: (g2) => back(g2) },
        ],
      }),
    });
  }

  function openTrain(game, npc) {
    const list = trainerTalents(game, npc);
    game.openModal({
      build: (g) => {
        const sv = save(g);
        return {
          title: `${t('loc.train')}: ${npc.name}`, width: 900,
          lines: [{ text: `${t('world.credits')}: ${sv.hero.credits}`, color: 'b' }],
          options: [
            ...list.map((x) => {
              const cost = x.source.cost || 100;
              const owned = sv.hero.talents.includes(x.id);
              const repNeed = x.source.rep && facTier(g, npc.faction) !== 'ally' && !(x.source.rep === 'friendly' && facTier(g, npc.faction) === 'friendly');
              const why = owned ? t('loc.owned') : repNeed ? t('loc.needRep') : sv.hero.credits < cost ? t('battle.noEnr').replace('ЭНР', t('world.credits')) : null;
              return { label: `${x.name} — ${cost} ${isCombatTalent(x) ? `· ${t('talent.combat')}` : ''}`, sub: why || x.desc, disabled: !!why, keep: true,
                run: (g2) => {
                  sv.hero.credits -= cost;
                  sv.hero.talents.push(x.id);
                  if (isCombatTalent(x) && sv.hero.activeCombat.length < COMBAT_TALENT_LIMIT(sv.hero.level)) sv.hero.activeCombat.push(x.id);
                  g2.toast(`${t('talent.new')}: ${x.name}`, 'a');
                  play('buff');
                  journal(sv, `${t('talent.new')}: ${x.name}`);
                  persist(g2);
                } };
            }),
            { label: t('loc.close'), run: (g2) => back(g2) },
          ],
        };
      },
    });
  }

  // ---------------------------------------------------------------- location actions
  function actions(game) {
    const sv = save(game);
    const out = [];
    const f = locFaction(locId);
    const tier = facTier(game, f || (loc.region === 'harmony' ? 'technikums' : null));
    // quest goals here
    for (const g of goalsAt(sv, locId)) {
      const q = questDef(g.quest);
      const goal = g.stage.goal;
      if (goal.kind === 'battle') {
        const bd = loc.battles.find((x) => x.id === goal.battle);
        out.push({ id: `qb:${g.quest}`, label: `${t('loc.fight')}: ${q.name}`, sub: g.stage.text, run: (gm) => locationBattle(gm, bd, g.quest) });
        if (goal.alt) out.push({ id: `qc:${g.quest}`, label: `${t('loc.solve')}: ${q.name}`, sub: g.stage.text,
          run: (gm) => openCheck(gm, { title: q.name, skill: goal.alt.skill, dc: goal.alt.dc, members: members(save(gm), gm.data), cancel: true,
            onDone: (gm2, ok) => { if (ok) { sv.battlesDone.push(goal.battle); toastAll(gm2, advance(sv, g.quest, null, gm2.data)); } else gm2.toast(t('loc.checkFailedFight'), 'c'); refresh(gm2); } }) });
      } else if (goal.kind === 'choice') {
        out.push({ id: `qch:${g.quest}`, label: `${t('loc.decide')}: ${q.name}`, sub: g.stage.text, run: (gm) => openChoice(gm, g.quest, goal) });
      } else if (goal.kind === 'challenge') {
        out.push({ id: `qcl:${g.quest}`, label: `${t('loc.negotiate')}: ${q.name}`, sub: g.stage.text, run: (gm) => runChallenge(gm, g.quest, goal) });
      } else if (goal.kind === 'check') {
        out.push({ id: `qk:${g.quest}`, label: `${t('loc.solve')}: ${q.name}`, sub: g.stage.text,
          run: (gm) => openCheck(gm, { title: q.name, skill: goal.skill, dc: goal.dc, members: members(save(gm), gm.data), cancel: true,
            onDone: (gm2, ok) => { if (ok) toastAll(gm2, advance(sv, g.quest, null, gm2.data)); refresh(gm2); } }) });
      }
    }
    // free battles of the location
    for (const bd of loc.battles) {
      if (bd.quest && goalsAt(sv, locId).some((g) => g.stage.goal.battle === bd.id)) continue;
      if (bd.once && sv.battlesDone.includes(bd.id)) continue;
      if (bd.quest && !(sv.quests[bd.quest]?.state === 'active')) continue;
      out.push({ id: `b:${bd.id}`, label: t('loc.fight'), sub: bd.enemies.map((e) => game.data.ENEMIES[e]?.name || e).join(', '), run: (gm) => locationBattle(gm, bd, null) });
    }
    // caches
    for (const c of loc.caches) {
      if (sv.caches.includes(c.id)) continue;
      out.push({ id: `c:${c.id}`, label: t('loc.search'), sub: `${t(`skill.${c.check.skill}`)} ${t('battle.dc')} ${c.check.dc}`, run: (gm) => searchCache(gm, c) });
    }
    // terminal
    if (loc.terminal) {
      const state = sv.terminals[loc.terminal.id];
      if (state === 'ritual') {
        out.push({ id: 'term-break', label: t('loc.termBreak'), sub: `${t('skill.tech')} ${t('battle.dc')} 13`, run: (gm) => terminalCheck(gm, 'tech', 13, 'dead') });
        out.push({ id: 'term-flash', label: t('loc.termFlash'), sub: `${t('skill.hacking')} / ${t('skill.judge')} ${t('battle.dc')} 15`, run: (gm) => {
          gm.openModal({ title: t('loc.termFlash'), lines: [{ text: t('loc.termFlashPick') }], options: [
            { label: t('skill.hacking'), run: (g2) => terminalCheck(g2, 'hacking', 15, 'ours') },
            { label: t('skill.judge'), run: (g2) => terminalCheck(g2, 'judge', 15, 'ours') },
            { label: t('check.cancel'), run: () => {} },
          ] });
        } });
      }
      const cyber = sv.party.filter((p) => p.state === 'cyberspace');
      if (state === 'ours' && cyber.length) {
        const free = loc.region === 'harmony' && ['friendly', 'ally'].includes(facTier(game, 'technikums'));
        const cost = free ? 0 : 50 * sv.hero.level;
        out.push({ id: 'term-revive', label: t('loc.revive'), sub: cost ? `${cost} ${t('world.credits')}` : t('loc.free'), disabled: sv.hero.credits < cost * cyber.length,
          run: (gm) => { sv.hero.credits -= cost * cyber.length; for (const p of cyber) { p.state = 'active'; p.hp = null; p.mrl = null; } gm.toast(t('loc.revived'), 'j'); refresh(gm); } });
      }
    }
    // services
    const sv2 = loc.services;
    if (sv2.includes('rest')) {
      const free = ['friendly', 'ally'].includes(tier);
      const cost = free ? 0 : 10 * sv.hero.level;
      out.push({ id: 'rest', label: t('loc.rest'), sub: cost ? `${cost} ${t('world.credits')} · 100%` : `${t('loc.free')} · 100%`, disabled: sv.hero.credits < cost,
        run: (gm) => { sv.hero.credits -= cost; doRest(gm, 1); } });
    } else if (loc.region !== 'harmony') {
      out.push({ id: 'camp', label: t('loc.camp'), sub: t('loc.campSub'), run: (gm) => doRest(gm, 0.5, true) });
    }
    if (sv2.includes('heal')) {
      const cyber = sv.party.filter((p) => p.state === 'cyberspace');
      out.push({ id: 'heal', label: t('loc.heal'), sub: t('loc.healSub'), run: (gm) => {
        if (['friendly', 'ally'].includes(facTier(gm, 'technikums'))) for (const p of cyber) { p.state = 'active'; p.hp = null; p.mrl = null; }
        doRest(gm, 1);
      } });
    }
    if (sv2.includes('trade') && !npcsAt(locId).some((id) => (NPCS[id].services || []).includes('trade'))) out.push({ id: 'shop', label: t('loc.trade'), sub: t('loc.shopSub'), run: (gm) => openShop(gm, loc.name, tier) });
    if (sv2.includes('rumors')) out.push({ id: 'rumor', label: t('loc.rumor'), sub: `10 ${t('world.credits')}`, disabled: sv.hero.credits < 10, run: (gm) => { sv.hero.credits -= 10; rumor(gm); refresh(gm); } });
    if (sv.hero.cls === 'reper' && loc.kind === 'city' && !S.visitFlags.performed) {
      out.push({ id: 'perform', label: t('loc.perform'), sub: `${t('skill.persuasion')} ${t('battle.dc')} 13`, run: (gm) => openCheck(gm, { title: t('loc.perform'), skill: 'persuasion', dc: 13, members: [members(sv, gm.data)[0]],
        onDone: (gm2, ok) => { S.visitFlags.performed = true; if (ok) toastAll(gm2, grant(sv, { credits: 20, rep: f ? { [f]: 3 } : { technikums: 3 } }, gm2.data)); refresh(gm2); } }) });
    }
    return out;
  }

  function doRest(game, frac, field) {
    const sv = save(game);
    restParty(sv, game.data, frac);
    if (hasFlagInParty(sv, game.data, 'free-medkit')) sv.hero.items.medkit = (sv.hero.items.medkit || 0) + 1;
    S.canSwap = true;
    game.toast(frac >= 1 ? t('loc.rested') : t('loc.camped'), 'j');
    toastAll(game, restDepartures(sv));
    refresh(game);
    if (field) {
      const reg = regionOf(locId);
      const need = Math.max(1, 3 * (reg?.danger || 0));
      const roll = 1 + Math.floor(Math.random() * 20);
      game.toast(`${t('world.encounterRoll')}: d20 = ${roll} ≤ ${need}?`, roll <= need ? 'c' : '4');
      if (roll <= need) {
        const e = pickEncounter(sv, loc.region);
        if (e && e.kind === 'battle') locationBattle(game, { id: null, enemies: e.enemies, faction: e.faction }, null);
      }
    }
  }

  function rumor(game) {
    const sv = save(game);
    const pool = Object.values(LOCATIONS).filter((l) => !sv.discovered.includes(l.id));
    if (!pool.length) { game.toast(t('loc.noRumor'), '4'); return; }
    const l = pool[Math.floor(Math.random() * pool.length)];
    discover(sv, l.id);
    journal(sv, `${t('loc.rumorFound')}: ${l.name}`);
    game.toast(`${t('loc.rumorFound')}: ${l.name}`, 'a');
  }

  function searchCache(game, c) {
    const sv = save(game);
    const take = (g) => { sv.caches.push(c.id); toastAll(g, grant(sv, c.loot, g.data)); g.toast(t('loc.found'), 'a'); refresh(g); };
    if (hasFlagInParty(sv, game.data, 'find-cache')) return take(game);
    openCheck(game, { title: t('loc.search'), skill: c.check.skill, dc: c.check.dc, members: members(sv, game.data), cancel: true,
      onDone: (g, ok) => { if (ok) take(g); else { sv.caches.push(c.id); g.toast(t('loc.notFound'), 'c'); refresh(g); } } });
  }

  function terminalCheck(game, skill, dc, result) {
    const sv = save(game);
    const extraAdv = hasFlagInParty(sv, game.data, 'terminal-touch') ? TALENTS['terminal-access']?.name || 'terminal-touch' : null;
    openCheck(game, { title: loc.name, skill, dc, members: members(sv, game.data), extraAdv, cancel: true,
      onDone: (g, ok) => {
        if (ok) {
          sv.terminals[loc.terminal.id] = result;
          journal(sv, `${loc.name}: ${t(`term.${result}`)}`);
          g.toast(`${loc.name}: ${t(`term.${result}`)}`, 'h');
          toastAll(g, grant(sv, { xp: 100, rep: { cult: -5 } }, g.data));
        }
        refresh(g);
      } });
  }

  function locationBattle(game, bd, questId) {
    const sv = save(game);
    const n = activeCompanions(sv).filter((p) => p.hp !== 0).length + 1;
    const enemies = bd.boss ? bd.enemies.slice(0, Math.max(2, bd.enemies.length - finalDiscount(sv))) : scaleEnemies(bd.enemies, n, sv.hero.level, game.data);
    startWorldBattle(game, {
      id: bd.id, title: loc.name, enemies, faction: bd.faction || null, hazard: loc.hazard,
      onWin: (g) => {
        if (questId) toastAll(g, advance(sv, questId, null, g.data));
        else if (bd.id) toastAll(g, onBattleWon(sv, bd.id, g.data));
        saveGame(sv);
        g.setScene(createLocationScene(locId));
      },
    });
  }

  /** Each dead / ours terminal makes the final easier: −1 enemy (world.md §1). */
  function finalDiscount(sv) {
    let n = 0;
    for (const [id, st] of Object.entries(sv.terminals)) if (id !== 'term-harmony' && st !== 'ritual') n++;
    return n;
  }

  function openChoice(game, questId, goal) {
    const q = questDef(questId);
    game.openModal({
      title: q.name, lines: [{ text: q.stages.find((s) => s.goal === goal).text }], width: 900,
      options: [
        ...goal.options.map((o) => ({ label: o.text, run: (g) => runOption(g, questId, o) })),
        { label: t('loc.questLater'), run: () => {} },
      ],
    });
  }

  function runOption(game, questId, o) {
    const sv = save(game);
    const finish = (g) => { toastAll(g, advance(sv, questId, o.next, g.data, { rep: o.rep, deeds: o.deeds, keyChoice: true })); refresh(g); };
    if (o.battle) {
      startWorldBattle(game, { title: questDef(questId).name, enemies: scaleEnemies(o.battle.enemies, activeCompanions(sv).length + 1, sv.hero.level, game.data),
        onWin: (g) => { g.setScene(createLocationScene(locId)); finish(g); } });
    } else if (o.challenge) {
      const forgive = hasFlagInParty(sv, game.data, 'challenge-forgive');
      openChallenge(game, { title: questDef(questId).name, ...o.challenge, members: members(sv, game.data), forgiveFirst: forgive,
        onDone: (g, ok) => {
          if (ok) finish(g);
          else {
            const alt = questDef(questId).stages.find((s) => s.goal.kind === 'choice')?.goal.options.find((x) => x.id === o.onFail);
            g.toast(t('check.challengeLost'), 'c');
            if (alt) runOption(g, questId, alt);
          }
        } });
    } else finish(game);
  }

  function runChallenge(game, questId, goal) {
    const sv = save(game);
    openChallenge(game, { title: questDef(questId).name, ...goal.challenge, members: members(sv, game.data), forgiveFirst: hasFlagInParty(sv, game.data, 'challenge-forgive'),
      onDone: (g, ok) => {
        if (ok) { toastAll(g, advance(sv, questId, null, g.data, { deeds: goal.deeds })); refresh(g); return; }
        const f = goal.onFail || {};
        if (f.rep) toastAll(g, grant(sv, { rep: f.rep }, g.data));
        if (f.battle) startWorldBattle(g, { title: questDef(questId).name, enemies: scaleEnemies(f.battle.enemies, activeCompanions(sv).length + 1, sv.hero.level, g.data),
          onWin: (g2) => { g2.setScene(createLocationScene(locId)); toastAll(g2, advance(sv, questId, null, g2.data)); } });
        else refresh(g);
      } });
  }

  // ---------------------------------------------------------------- layout & input
  function layout(game) {
    const sv = save(game);
    const ox = Math.max(0, Math.floor((game.width - BASE_W) / 2)), oy = Math.max(0, Math.floor((game.height - BASE_H) / 2));
    S.ox = ox; S.oy = oy;
    const btns = [];
    const ids = npcsAt(locId);
    S.npcs = ids;
    const pages = Math.max(1, Math.ceil(ids.length / PAGE));
    S.page = Math.min(S.page, pages - 1);
    ids.slice(S.page * PAGE, S.page * PAGE + PAGE).forEach((id, i) => {
      const npc = NPCS[id];
      const y = oy + 120 + i * 66;
      let x = ox + 24 + 600 - 8;
      const acts = npcActions(game, npc);
      for (let k = acts.length - 1; k >= 0; k--) {
        const a = acts[k];
        const w = 92;
        x -= w + 4;
        btns.push({ ...a, kind: 'npc', npc: id, act: a.id, x, y: y + 14, w, h: 34, font: FONT, sub: null });
      }
      S[`npcRow${i}`] = { id, y };
    });
    if (pages > 1) {
      btns.push({ kind: 'page', dir: -1, label: '‹', x: ox + 24, y: oy + 120 + PAGE * 66, w: 40, h: 28, disabled: S.page === 0 });
      btns.push({ kind: 'page', dir: 1, label: '›', x: ox + 70, y: oy + 120 + PAGE * 66, w: 40, h: 28, disabled: S.page >= pages - 1 });
    }
    const acts = actions(game);
    acts.slice(0, 9).forEach((a, i) => btns.push({ ...a, kind: 'act', x: ox + 648, y: oy + 120 + i * 54, w: 608, h: 48, font: FONT_B }));
    const nav = [
      { kind: 'nav', id: 'map', label: t('loc.map'), key: 'M' },
      { kind: 'nav', id: 'party', label: t('panel.party'), key: 'P' },
      { kind: 'nav', id: 'rep', label: t('panel.rep'), key: 'R' },
      { kind: 'nav', id: 'journal', label: t('panel.journal'), key: 'J' },
      { kind: 'nav', id: 'menu', label: t('loc.toMenu'), key: 'Esc' },
    ];
    nav.forEach((b, i) => Object.assign(b, { x: ox + 648 + i * 122, y: oy + BASE_H - 60, w: 116, h: 44 }));
    btns.push(...nav);
    if (sv.hero.pendingTalents > 0) btns.push({ kind: 'nav', id: 'party', label: t('talent.pending'), x: ox + 648, y: oy + BASE_H - 112, w: 240, h: 40, selected: true });
    S.buttons = btns;
    S.members = members(sv, game.data, { includeDown: true });
  }

  function nav(game, id) {
    if (id === 'map') return import('./world-map.js').then((m) => game.setScene(m.createWorldMapScene()));
    if (id === 'menu') { persist(game); return import('./menu.js').then((m) => game.setScene(m.menuScene)); }
    return import('./panels.js').then((m) => game.setScene(m.createPanelsScene({ tab: id, back: self, canSwap: !!S.canSwap || loc.services.includes('rest') })));
  }

  function click(game, b) {
    if (b.disabled) { if (b.reason) game.toast(b.reason, 'c'); return; }
    play('uiClick');
    if (b.kind === 'npc') doNpc(game, NPCS[b.npc], b.act);
    else if (b.kind === 'act') b.run(game);
    else if (b.kind === 'page') { S.page += b.dir; layout(game); }
    else if (b.kind === 'nav') nav(game, b.id);
  }

  self = {
    id: 'location', locId,
    enter(game) {
      S.time = 0;
      layout(game);
      if (!S.gate) gateCheck(game);
      persist(game);
    },
    resume(game) { layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      S.time += dt;
      const inp = game.input;
      S.hover = hitButton(S.buttons, inp.mouse);
      if (inp.mouse.clicked && S.hover) click(game, S.hover);
      if (inp.wasPressed('KeyM')) nav(game, 'map');
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
      text(ctx, loc.name, ox + 24, oy + 16, C.h, FONT_L);
      const tier = f ? facTier(game, f) : null;
      text(ctx, `${reg?.name || ''}${f ? ` · ${factionName(f)}: ${t(`tier.${tier}`)}` : ''}`, ox + 24, oy + 50, f ? tierColor(tier) : C['4'], FONT);
      text(ctx, `${t('world.day')} ${sv.day} · ${t('world.credits')} ${sv.hero.credits} · ${t('world.level')} ${sv.hero.level} (${sv.hero.xp} XP)`, ox + BASE_W - 24, oy + 20, C.b, FONT_B, 'right');
      textBlock(ctx, loc.desc || '', ox + 24, oy + 74, BASE_W - 48, C['4'], FONT, LINE, 2);
      // NPC list
      text(ctx, t('loc.people'), ox + 24, oy + 100, C['4'], FONT_B);
      for (let i = 0; i < PAGE; i++) {
        const row = S[`npcRow${i}`];
        if (!row || !S.npcs.includes(row.id) || S.npcs.indexOf(row.id) !== S.page * PAGE + i) continue;
        const npc = NPCS[row.id];
        panel(ctx, ox + 24, row.y, 600, 60, C['1'], C['2']);
        const ids = heroSpriteIds(game.data.RACES[npc.race] ? npc.race : 'human', npc.cls || null);
        drawSprite(ctx, ids, ox + 30, row.y + 6, 3, { frame: idleFrame(S.time * 1000, i * 0.3) });
        const nf = normFaction(npc.faction);
        const tr = sv.rep[nf] != null ? repTier(sv.rep[nf]) : null;
        text(ctx, fit(ctx, `${npc.name}${questsOffered(sv, npc.id).length ? ' !' : ''}`, 220, FONT_B), ox + 86, row.y + 8, questsOffered(sv, npc.id).length ? C.a : C['5'], FONT_B);
        text(ctx, fit(ctx, npc.role || '', 210), ox + 86, row.y + 32, tr ? tierColor(tr) : C['4'], '12px monospace');
      }
      if (!S.npcs.length) text(ctx, t('loc.nobody'), ox + 24, oy + 130, C['3']);
      text(ctx, t('loc.actions'), ox + 648, oy + 100, C['4'], FONT_B);
      for (const b of S.buttons) {
        if (b.kind === 'act') {
          const hv = S.hover === b;
          panel(ctx, b.x, b.y, b.w, b.h, hv && !b.disabled ? C['3'] : C['2'], hv ? C['4'] : C['3']);
          text(ctx, fit(ctx, b.label, b.w - 24, FONT_B), b.x + 12, b.y + 6, b.disabled ? C['3'] : C['5'], FONT_B);
          if (b.sub) text(ctx, fit(ctx, b.sub, b.w - 24, '12px monospace'), b.x + 12, b.y + 28, b.disabled ? C['3'] : C['4'], '12px monospace');
        } else button(ctx, b, S.hover === b);
      }
      // party strip
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
