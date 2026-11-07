// World battle: the party (hero + active companions) vs an encounter. Writes HP/MRL back to the save, gives XP,
// handles «down» heroes after a victory (stand up with 1 HP or 50% with revive-down) and deaths:
// dead companion → Cyberspace state; dead hero / lost battle → Cyberspace episode (scenes/cyberspace.js).
// Battle size and map follow world.md «Контракт UI»: first ceil(n × s / 4) enemies; map — ENCOUNTERS[id].map,
// else battle.map, else LOCATIONS[loc].battleMap, else a generated arena.
import { applyWithdrawal } from '../rules/aftermath.js';
import { t } from '../data/text/index.js';
import { battleXp } from '../rules/progression.js';
import { createBattleScene } from './battle.js';
import { makeWorldMap } from '../world/arena.js';
import { partyUnits, activeCompanions, gainXp, hasFlagInParty, journal, repToasts, partySize, members, grant } from '../world/state.js';
import { SKILL_RULES } from '../world/data.js';
import { autoCheck, canParley, parleyDc, mutantsIn } from '../world/skill-uses.js';
import { openCheck } from '../ui/checks-ui.js';
import { applyRep } from '../world/reputation.js';
import { encounterEnemies, encounterName, encounterMap, LOCATIONS, QUESTS, FINALE_TERMINALS } from '../world/data.js';
import { MAPS } from '../data/index.js';
import { saveGame } from '../save.js';
import { rollDice } from '../rules/dice.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
import { tf } from '../world/state.js';

const FINALE_ENCOUNTER = R.finale.encounter;
const FINALE_MIN_PARTY = R.finale.minParty; // heroes + finaleMods allies (balance rule)

/** Enemies (+allies) of an encounter id for the current party; the finale is reduced by closed terminals. */
export function encounterSetup(save, encId) {
  let reduce = 0;
  const allies = [];
  if (encId === 'w-cc-finale') {
    reduce = FINALE_TERMINALS.filter((id) => save.terminals[id] && save.terminals[id] !== 'ritual').length;
    for (const m of QUESTS['mq-exodus']?.finaleMods || []) if (m.flag && save.flags[m.flag]) allies.push(...(m.allies || []));
  }
  return { enemies: encounterEnemies(encId, partySize(save), { reduce }), allies };
}

/**
 * startWorldBattle(game, { encounter?, enemies?, allies?, map?, location?, title?, faction?, hazard?, ambush?, id?,
 *                          onWin(game), onLose?(game) })
 */
export function startWorldBattle(game, o) {
  const save = game.save;
  const data = game.data;
  const setup = o.encounter ? encounterSetup(save, o.encounter) : { enemies: o.enemies, allies: [] };
  const allies = [...setup.allies, ...(o.allies || [])];
  if (o.encounter === FINALE_ENCOUNTER && partySize(save) + allies.length < FINALE_MIN_PARTY) {
    game.openModal({ title: t('world.finaleLockedTitle'), border: 'a', titleColor: 'a',
      lines: [{ text: t('world.finaleLocked').replace('{n}', partySize(save) + allies.length).replace('{min}', FINALE_MIN_PARTY) }],
      options: [{ label: t('battle.ok'), run: () => {} }] });
    return;
  }
  const loc = LOCATIONS[o.location || save.location];
  // N6 Military: the best member reads the ground — the party gets +1 initiative
  const MIL = SKILL_RULES.preBattle.military;
  const mil = autoCheck(members(save, data), ['military'], MIL.dc);
  if (mil.success) game.toast(`${mil.member.name}: ${t('skillUse.military')}`, 'j');
  const mapId = (o.encounter && encounterMap(o.encounter)) || o.map || loc?.battleMap || null;
  const fixed = mapId && MAPS[mapId];
  const scene = createBattleScene({
    heroes: () => partyUnits(save, data),
    enemies: setup.enemies,
    allies,
    map: fixed ? fixed : (seed) => makeWorldMap({ seed, enemies: setup.enemies.length, hazard: o.hazard ?? loc?.hazard, id: o.id || 'world' }),
    title: o.title || (o.encounter ? encounterName(o.encounter) : loc?.name || ''),
    intro: null, hint: o.ambush ? 'world.ambushHint' : null,
    race: save.hero.race, ambush: !!o.ambush, enemyInit: o.enemyInit || 0, heroInit: mil.success ? MIL.init : 0,
    onWin: (g, S) => { for (const x of writeBack(g, S, true, o)) g.toast(x.text, x.color); afterBattle(g, S, o); },
    onLose: (g, S) => { writeBack(g, S, false, o); saveGame(save); (o.onLose || defaultLose)(g, S); },
    onExit: (g) => (o.onLose || defaultLose)(g),
    // world flag 'retreat': leave a non-boss battle — back to the previous node, no loot
    onRetreat: o.encounter !== FINALE_ENCOUNTER && !o.boss && hasFlagInParty(save, data, 'retreat') ? (g, S) => {
      writeBack(g, S, false, o, { retreat: true });
      if (save.prevLocation && LOCATIONS[save.prevLocation]) save.location = save.prevLocation;
      saveGame(save);
      g.toast(t('battle.retreated'), 'a');
      g.visit = null;
      import('./world-map.js').then((m) => g.setScene(m.createWorldMapScene()));
    } : null,
  });
  game.setScene(scene);
}

/**
 * N3 (skills.md): a road / node skirmish with people or robots — talks instead of a fight (Persuasion / Intimidation /
 * Deception, DC 12 + danger, max 17). Success: no battle, 50% XP, the battle counts as done (o.id) and o.onWin runs;
 * failure: the battle, enemies +2 initiative. Beasts, undead, cringegons, bosses — straight to the battle.
 * o — as startWorldBattle + danger.
 */
export function startSkirmish(game, o) {
  const save = game.save;
  const P = SKILL_RULES.parley;
  const enemies = o.encounter ? encounterSetup(save, o.encounter).enemies : o.enemies || [];
  if (o.encounter === FINALE_ENCOUNTER || !canParley(enemies, game.data)) return startWorldBattle(game, o);
  const dc = parleyDc(o.danger ?? LOCATIONS[o.location || save.location]?.danger ?? 0);
  game.openModal({
    title: `${t('parley.title')}: ${o.title || encounterName(o.encounter)}`, onCancel: false,
    lines: [{ text: t('parley.text') }, { text: `${P.skills.map((s) => t(`skill.${s}`)).join(' / ')} · ${t('battle.dc')} ${dc}`, color: 'a' }],
    options: [
      { label: t('parley.title'), sub: t('parley.sub'), run: (g) => openCheck(g, { title: t('parley.title'), skills: P.skills, dc, members: members(save, g.data), memoKey: `parley:${o.id || o.encounter}:${save.day}`,
        onDone: (g2, ok) => {
          if (!ok) { g2.toast(t('parley.fail').replace('{n}', P.failInit), 'c'); startWorldBattle(g2, { ...o, enemyInit: (o.enemyInit || 0) + P.failInit }); return; }
          g2.toast(t('parley.ok'), 'j');
          const xp = Math.floor(battleXp(enemies, g2.data) * P.xpShare);
          for (const x of grant(save, { xp }, g2.data)) g2.toast(x.text, x.color);
          if (o.id && !save.battlesDone.includes(o.id)) save.battlesDone.push(o.id);
          saveGame(save);
          o.onWin(g2);
        } }) },
      { label: t('parley.fight'), sub: o.encounter ? encounterName(o.encounter) : '', run: (g) => startWorldBattle(g, o) },
    ],
  });
}

function defaultLose(game) {
  import('./cyberspace.js').then((m) => m.startCyberspace(game, { reason: 'wipe', helped: false }));
}

function afterBattle(game, S, o) {
  const save = game.save;
  const hero = S.b.byId.hero;
  saveGame(save);
  o.onWin(game); // quest progress etc.
  if (hero && hero.dead) import('./cyberspace.js').then((m) => m.startCyberspace(game, { reason: 'hero', helped: true }));
}

/** Copy results into the save. Returns toasts. */
function writeBack(game, S, won, o, { retreat = false } = {}) {
  const save = game.save;
  const b = S.b;
  const revive = hasFlagInParty(save, game.data, 'revive-down');
  const out = [];
  const after = (u) => {
    if (u.dead) return { hp: 0, mrl: 0 };
    if (u.down) return { hp: won && revive ? Math.ceil(u.maxHp / 2) : 1, mrl: u.mrl };
    return { hp: u.hp, mrl: u.mrl };
  };
  const hu = b.byId.hero;
  if (hu) {
    const r = after(hu); save.hero.hp = r.hp; save.hero.mrl = r.mrl;
    // v3: items used in battle leave the backpack (unit.inventory is the battle copy)
    for (const [id, n0] of Object.entries(hu.build?.inventory || {})) {
      const used = n0 - (hu.inventory?.[id] || 0);
      if (used > 0) save.hero.items[id] = Math.max(0, (save.hero.items[id] || 0) - used);
    }    // v3.1: opiates used in battle → withdrawal (−МРЛ now, debuff until a full rest)
    if (!hu.dead) {
      const w = applyWithdrawal(save.hero, hu, Math.random);
      if (w?.loss) out.push({ text: `${t('world.withdrawal')}: −${w.loss} ${t('res.mrl')}`, color: 'f' });
    }
  }
  for (const p of activeCompanions(save)) {
    const u = b.byId[`c-${p.npc}`];
    if (!u) continue;
    if (u.dead) {
      p.state = 'cyberspace'; p.hp = 0;
      const msg = t('world.companionCyber').replace('{name}', u.name);
      journal(save, msg);
      out.push({ text: msg, color: 'n' });
      continue;
    }
    const r = after(u);
    p.hp = r.hp; p.mrl = r.mrl;
  }
  // Cyberspace is decided right here (synchronously): a reload before the next scene still sends the hero there
  if (!retreat && (!won || hu?.dead)) save.cyberspace = save.cyberspace || { reason: won ? 'hero' : 'wipe', helped: !!won, pending: true };
  if (won) {
    out.push(...gainXp(save, battleXp(b, game.data), game.data));
    // scrap-loot (mechanical enemies) / battle-loot: an extra loot roll each
    const ms = partyUnits(save, game.data);
    const flags = new Set(ms.flatMap((u) => (u.worldFlags || []).map((w) => w.id)));
    const mech = b.units.some((u) => u.team === 'enemies' && (u.tags || []).includes('mechanical'));
    const rolls = (flags.has('battle-loot') ? 1 : 0) + (flags.has('scrap-loot') && mech ? 1 : 0);
    if (rolls) {
      let c = 0;
      for (let i = 0; i < rolls; i++) c += rollDice(Math.random, R.loot.dice) * R.loot.mult;
      save.hero.credits += c;
      out.push({ text: tf('fx.credits', { n: `+${c}` }), color: 'b' });
    }
    const killed = b.units.filter((u) => u.team === 'enemies' && u.kind !== 'summon' && (u.dead || u.removed)).length;
    if (o.faction && killed) out.push(...repToasts(applyRep(save, o.faction, Math.max(R.killRep.maxPerBattle, R.killRep.perKill * killed))));
    if (o.id && !save.battlesDone.includes(o.id)) save.battlesDone.push(o.id);
    // N7 Biology: samples of beaten mutants sell for credits
    const SM = SKILL_RULES.economy.samples;
    const beaten = b.units.filter((u) => u.team === 'enemies' && u.kind !== 'summon' && (u.dead || u.removed)).map((u) => u.enemyId);
    if (mutantsIn(beaten, game.data)) {
      const r = autoCheck(members(save, game.data), [SM.skill], SM.dc);
      if (r.success) {
        const c = SM.credits[0] + Math.floor(Math.random() * (SM.credits[1] - SM.credits[0] + 1));
        save.hero.credits += c;
        out.push({ text: `${r.member.name}: ${t('skillUse.samples')} +${c}`, color: 'b' });
      }
    }
  }
  return out;
}
