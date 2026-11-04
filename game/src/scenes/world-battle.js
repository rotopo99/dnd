// World battle: the party (hero + active companions) vs an encounter. Writes HP/MRL back to the save, gives XP,
// handles «down» heroes after a victory (stand up with 1 HP or 50% with revive-down) and deaths:
// dead companion → Cyberspace state; dead hero / lost battle → Cyberspace episode (scenes/cyberspace.js).
// Battle size and map follow world.md «Контракт UI»: first ceil(n × s / 4) enemies; map — ENCOUNTERS[id].map,
// else battle.map, else LOCATIONS[loc].battleMap, else a generated arena.
import { t } from '../data/text/index.js';
import { battleXp } from '../rules/progression.js';
import { createBattleScene } from './battle.js';
import { makeWorldMap } from '../world/arena.js';
import { partyUnits, activeCompanions, gainXp, hasFlagInParty, journal, repToasts, partySize } from '../world/state.js';
import { applyRep } from '../world/reputation.js';
import { encounterEnemies, encounterName, encounterMap, LOCATIONS, QUESTS, FINALE_TERMINALS } from '../world/data.js';
import { MAPS } from '../data/index.js';
import { saveGame } from '../save.js';

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
  const loc = LOCATIONS[o.location || save.location];
  const mapId = (o.encounter && encounterMap(o.encounter)) || o.map || loc?.battleMap || null;
  const fixed = mapId && MAPS[mapId];
  const scene = createBattleScene({
    heroes: () => partyUnits(save, data),
    enemies: setup.enemies,
    allies,
    map: fixed ? fixed : (seed) => makeWorldMap({ seed, enemies: setup.enemies.length, hazard: o.hazard ?? loc?.hazard, id: o.id || 'world' }),
    title: o.title || (o.encounter ? encounterName(o.encounter) : loc?.name || ''),
    intro: null, hint: o.ambush ? 'world.ambushHint' : null,
    race: save.hero.race, ambush: !!o.ambush,
    onWin: (g, S) => { for (const x of writeBack(g, S, true, o)) g.toast(x.text, x.color); afterBattle(g, S, o); },
    onLose: (g, S) => { writeBack(g, S, false, o); saveGame(save); (o.onLose || defaultLose)(g, S); },
    onExit: (g) => (o.onLose || defaultLose)(g),
  });
  game.setScene(scene);
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
function writeBack(game, S, won, o) {
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
  if (hu) { const r = after(hu); save.hero.hp = r.hp; save.hero.mrl = r.mrl; }
  for (const p of activeCompanions(save)) {
    const u = b.byId[`c-${p.npc}`];
    if (!u) continue;
    if (u.dead && won) {
      p.state = 'cyberspace'; p.hp = 0;
      const msg = t('world.companionCyber').replace('{name}', u.name);
      journal(save, msg);
      out.push({ text: msg, color: 'n' });
      continue;
    }
    const r = after(u);
    p.hp = r.hp; p.mrl = r.mrl;
  }
  if (won) {
    out.push(...gainXp(save, battleXp(b, game.data), game.data));
    const killed = b.units.filter((u) => u.team === 'enemies' && u.kind !== 'summon' && (u.dead || u.removed)).length;
    if (o.faction && killed) out.push(...repToasts(applyRep(save, o.faction, -Math.min(10, 2 * killed))));
    if (o.id) save.battlesDone.push(o.id);
  }
  return out;
}
