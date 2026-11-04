// World battle: the party (hero + active companions) vs an encounter. Writes HP/MRL back to the save, gives XP,
// handles «down» heroes after a victory (stand up with 1 HP or 50% with revive-down) and deaths:
// dead companion → Cyberspace state; dead hero / lost battle → Cyberspace episode (scenes/cyberspace.js).
import { t } from '../data/text/index.js';
import { createBattleScene } from './battle.js';
import { makeWorldMap } from '../world/arena.js';
import { partyUnits, activeCompanions, gainXp, hasFlagInParty, journal } from '../world/state.js';
import { applyRep } from '../world/reputation.js';
import { repToasts } from '../world/state.js';
import { saveGame } from '../save.js';

/**
 * startWorldBattle(game, { title, enemies, faction?, hazard?, ambush?, onWin(game), onLose?(game) })
 * onLose defaults to the Cyberspace episode.
 */
export function startWorldBattle(game, o) {
  const save = game.save;
  const data = game.data;
  const back = game.scene;
  const scene = createBattleScene({
    heroes: () => partyUnits(save, data),
    enemies: o.enemies,
    map: (seed) => makeWorldMap({ seed, enemies: o.enemies.length, hazard: o.hazard, id: o.id || 'world' }),
    title: o.title, intro: o.intro || null, hint: o.ambush ? 'world.ambushHint' : null,
    race: save.hero.race,
    onWin: (g, S) => { const toasts = writeBack(g, S, true, o); for (const x of toasts) g.toast(x.text, x.color); afterBattle(g, S, o, back); },
    onLose: (g, S) => { writeBack(g, S, false, o); saveGame(save); (o.onLose || defaultLose)(g, S); },
    onExit: (g) => (o.onLose || defaultLose)(g),
  });
  game.setScene(scene);
}

function defaultLose(game) {
  import('./cyberspace.js').then((m) => m.startCyberspace(game, { reason: 'wipe', helped: false }));
}

function afterBattle(game, S, o, back) {
  const save = game.save;
  const hero = S.b.byId.hero;
  saveGame(save);
  if (hero && hero.dead) {
    o.onWin(game); // quest progress etc.; the party then carries the body to a terminal
    import('./cyberspace.js').then((m) => m.startCyberspace(game, { reason: 'hero', helped: true }));
    return;
  }
  void back;
  o.onWin(game);
}

/** Copy results into the save. Returns toasts. */
function writeBack(game, S, won, o) {
  const save = game.save;
  const b = S.b;
  const revive = hasFlagInParty(save, game.data, 'revive-down');
  const out = [];
  const after = (u) => {
    if (u.dead) return { hp: 0, mrl: 0 };
    if (u.down) return { hp: won ? (revive ? Math.ceil(u.maxHp / 2) : 1) : 1, mrl: u.mrl };
    return { hp: u.hp, mrl: u.mrl };
  };
  const hu = b.byId.hero;
  if (hu) {
    const r = after(hu);
    save.hero.hp = r.hp;
    save.hero.mrl = r.mrl;
  }
  for (const p of activeCompanions(save)) {
    const u = b.byId[`c-${p.npc}`];
    if (!u) continue;
    if (u.dead && won) { p.state = 'cyberspace'; p.hp = 0; journal(save, t('world.companionCyber').replace('{name}', u.name)); out.push({ text: t('world.companionCyber').replace('{name}', u.name), color: 'n' }); continue; }
    const r = after(u);
    p.hp = r.hp; p.mrl = r.mrl;
  }
  if (won) {
    let xp = 0, killed = 0;
    for (const u of b.units) if (u.team === 'enemies' && u.kind !== 'summon' && (u.dead || u.removed)) { xp += u.xp || 0; killed++; }
    out.push(...gainXp(save, xp, game.data));
    if (o.faction && killed) out.push(...repToasts(applyRep(save, o.faction, -Math.min(10, 2 * killed))));
    if (o.id) save.battlesDone.push(o.id);
  }
  return out;
}
