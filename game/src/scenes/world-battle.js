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
import { applyRep, meetFaction } from '../world/reputation.js';
import { encounterEnemies, encounterName, encounterMap, LOCATIONS, QUESTS, FINALE_TERMINALS } from '../world/data.js';
import { MAPS, ENEMIES, ITEMS } from '../data/index.js';
import { rollLoot } from '../world/loot.js';
import { syncItems, consumeBattle, keepQuickLayout, receive, makeInst, canStash, qualityName } from '../world/inventory.js';
import { itemTip, itemStats } from '../ui/items-ui.js';
import { C } from '../ui/draw.js';
import { saveGame } from '../save.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
import { tf } from '../world/state.js';
import { incarnate, exodusZeroFinale } from '../world/exodus.js';
import { markSeen, markKills, markTerm } from '../world/codex.js';
import { battleLoyalty } from '../world/companions.js';
import { romanceDeath, partnerOf } from '../world/romance.js';
import { queueBark } from '../world/barks.js';
import { afterBattle as restAfterBattle } from '../world/rest.js';
import { BATTLE_OBJECTIVES } from '../data/world/battle-objectives.js';
import { COMBAT, biomeOf } from '../data/combat.js';
import { objectiveSummary } from '../rules/objectives.js';
import { passDays } from '../world/exodus.js';
import { locFaction } from '../world/state.js';

const FINALE_ENCOUNTER = R.finale.encounter;
const FINALE_MIN_PARTY = R.finale.minParty; // heroes + finaleMods allies (balance rule)

/** Enemies (+allies) of an encounter id for the current party; the finale is reduced by closed terminals. */
export function encounterSetup(save, encId) {
  let reduce = 0;
  const allies = [];
  // third-exodus.md: after the zero (Judge incarnates) — no terminal reduce, no finaleMods allies, the boss +25% ЗДР
  if (encId === FINALE_ENCOUNTER && exodusZeroFinale(save)) return { enemies: incarnate(encounterEnemies(encId, partySize(save)), ENEMIES), allies };
  if (encId === 'w-cc-finale') {
    reduce = FINALE_TERMINALS.filter((id) => save.terminals[id] && save.terminals[id] !== 'ritual').length;
    for (const m of QUESTS['mq-exodus']?.finaleMods || []) if (m.flag && save.flags[m.flag]) allies.push(...(m.allies || []));
  }
  return { enemies: encounterEnemies(encId, partySize(save), { reduce }), allies };
}

const enemyDef = (e) => ENEMIES[String(typeof e === 'string' ? e : e?.enemy || e?.enemyId || e?.id || '').split('^')[0]];
/** skirmishes.md: id of a battle list element (id string, `{ enemy, hpPct }` wrapper, enemy def). */
const elemId = (e) => (typeof e === 'string' ? e : e?.enemy || e?.id);
/** Units of the beaten sides: every team but the party ('enemies' and the skirmish third side 'rivals'). */
const isFoeTeam = (u) => u.team !== 'heroes';
const isBossDef = (d) => !!d && (d.boss || d.rank === 'boss' || d.rank === 'miniboss');

/**
 * combat-rework §6 (stage 2): objectives spec of a world battle for rules/objectives.js — goal (o.objective > encounter
 * binding > random `chance` from the biome pool; none in boss fights / the finale), chests (COMBAT.chest.count), exits
 * for retreat (no exits in the finale; boss fights — locked until the boss phase).
 */
export function objectiveSpec(save, o, enemies, rng = Math.random) {
  if (o.encounter === FINALE_ENCOUNTER || o.noObjectives) return null;
  const boss = (enemies || []).some((e) => isBossDef(enemyDef(e)));
  const loc = LOCATIONS[o.location || save.location];
  const bind = o.encounter ? BATTLE_OBJECTIVES.bindings[o.encounter] : null;
  let goal = o.objective !== undefined ? o.objective : bind || null;
  if (!goal && !boss && o.objective === undefined && rng() < BATTLE_OBJECTIVES.random.chance) {
    const pool = BATTLE_OBJECTIVES.random.pool[biomeOf({ biome: o.biome, region: loc?.region, faction: o.faction, hazard: o.hazard ?? loc?.hazard })] || BATTLE_OBJECTIVES.random.pool.wasteland;
    goal = pool[Math.floor(rng() * pool.length)];
  }
  let chests = o.chests ?? 0;
  if (o.chests == null) for (const p of COMBAT.chest?.count || []) { if (rng() < p) chests++; else break; }
  return { goal, chests, retreat: !o.noRetreat, exitLock: boss };
}

/**
 * startWorldBattle(game, { encounter?, enemies?, allies?, map?, location?, title?, faction?, hazard?, ambush?, id?,
 *                          objective? (id | null — override the binding / random), chests?, noObjectives?, noRetreat?,
 *                          rivals? (skirmishes.md: third side, hostile to all; the party loses when it is down), xpMul?,
 *                          extraLoot? ({ credits, items } added to the loot window), afterLoot?(game, loot, notes, S),
 *                          onWin(game), onLose?(game) })
 */
export function startWorldBattle(game, o) {
  const save = game.save;
  const data = game.data;
  const setup = o.encounter ? encounterSetup(save, o.encounter) : { enemies: o.enemies, allies: [] };
  const allies = [...setup.allies, ...(o.allies || [])];
  // skirmishes.md «благодарность»: a commander of a side we helped walks with the party for one battle
  const escort = save.flags?.['skirm-escort'];
  if (escort && ENEMIES[escort] && o.encounter !== FINALE_ENCOUNTER) { allies.push(escort); delete save.flags['skirm-escort']; game.toast(tf('skirm.escortJoins', { name: ENEMIES[escort].name }), 'j'); }
  const rivals = o.rivals?.length ? o.rivals : null;
  if (o.encounter === FINALE_ENCOUNTER && !exodusZeroFinale(save) && partySize(save) + allies.length < FINALE_MIN_PARTY) {
    game.openModal({ title: t('world.finaleLockedTitle'), border: 'a', titleColor: 'a',
      lines: [{ text: t('world.finaleLocked').replace('{n}', partySize(save) + allies.length).replace('{min}', FINALE_MIN_PARTY) }],
      options: [{ label: t('battle.ok'), run: () => {} }] });
    return;
  }
  syncItems(save); // v7: quick slots / backpack must reflect old-style hero.items edits before units are built
  // a fight introduces the factions involved (reputation screen stops hiding them)
  if (o.faction) meetFaction(save, o.faction);
  const foeIds = [...(setup.enemies || []), ...(rivals || [])].map(elemId);
  for (const id of foeIds) { if (ENEMIES[String(id).split('^')[0]]?.faction) meetFaction(save, ENEMIES[String(id).split('^')[0]].faction); }
  // codex (vendors-bestiary.md): every enemy of the battle is «seen»
  for (const x of markSeen(save, foeIds).slice(0, 3)) game.toast(x.text, x.color);
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
    allies, rivals, partyLose: !!rivals,
    map: fixed && !rivals ? fixed : (seed) => makeWorldMap({ seed, enemies: setup.enemies.length, enemyIds: setup.enemies.map(elemId), ...(rivals ? { sides: 3, rivals: rivals.length } : {}), hazard: o.hazard ?? loc?.hazard, biome: o.biome ?? loc?.biome, region: loc?.region, faction: o.faction, id: o.id || 'world', kind: loc?.kind, ambush: !!o.ambush, day: save.day }),
    title: o.title || (o.encounter ? encounterName(o.encounter) : loc?.name || ''),
    intro: null, hint: o.ambush ? 'world.ambushHint' : null,
    // codex terms: statuses / surfaces applied in this battle (battle events, no battle.js change)
    onEvent: (S, e) => {
      if (e.type === 'status') markTerm(save, 'status', e.id); else if (e.type === 'surfaceCreate') markTerm(save, 'surface', e.kind);
      companionEvent(S, e, save); // companions-scenes.md: barks and revives
    },
    objectives: objectiveSpec(save, o, setup.enemies),
    onRetreatExit: (g, S) => retreatExit(g, S, o),
    race: save.hero.race, ambush: !!o.ambush, tricks: true, enemyInit: o.enemyInit || 0, heroInit: (mil.success ? MIL.init : 0) + (o.heroInit || 0),
    onWin: (g, S) => {
      queueBark('victory');
      for (const x of writeBack(g, S, true, o)) g.toast(x.text, x.color);
      const notes = [];
      const extra = objectiveRewards(g, S, o, notes);
      const loot = battleLoot(g, S, extra.rolls);
      if (extra.credits) loot.credits += Math.max(COMBAT.objectives?.creditsMin ?? 10, Math.round(loot.credits * extra.credits));
      if (o.extraLoot) { loot.credits += o.extraLoot.credits || 0; addItems(loot.items, o.extraLoot.items || []); } // skirmishes.md: the dead of a waited-out fight
      o.afterLoot?.(g, loot, notes, S); // skirmishes.md: reputation, «благодарность»
      loot.notes = notes;
      openLoot(g, loot, () => afterBattle(g, S, o));
    },
    onLose: (g, S) => { writeBack(g, S, false, o); saveGame(save); (o.onLose || defaultLose)(g, S); },
    onExit: (g) => (o.onLose || defaultLose)(g),
    // world flag 'retreat': leave a non-boss battle — back to the previous node, no loot
    onRetreat: o.encounter !== FINALE_ENCOUNTER && !o.boss && hasFlagInParty(save, data, 'retreat') ? (g, S) => {
      writeBack(g, S, false, o, { retreat: true });
      o.onFlee?.(g); // world-consequences.md: an attacked NPC survives the retreat
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

/** Loot of the beaten enemies (world/loot.js). Unique items already owned by the party do not drop again. */
function battleLoot(game, S, extraRolls = 0) {
  const save = game.save;
  const flags = new Set(partyUnits(save, game.data).flatMap((u) => (u.worldFlags || []).map((w) => w.id)));
  const owned = new Set(Object.keys(save.hero.items || {}).filter((id) => save.hero.items[id] > 0));
  const worn = (eq) => Object.values(eq || {}).flat().forEach((id) => id && owned.add(id));
  worn(save.hero.equipment);
  for (const p of activeCompanions(save)) worn(p.equipment);
  const beaten = S.b.units.filter((u) => isFoeTeam(u) && (u.dead || u.removed) && !u.fled); // a fled coward takes its loot along
  const loot = rollLoot(beaten, { ...game.data, ENEMIES }, Math.random, { flags, owned });
  // combat rework §3.2: broken crates rolled «junk» (b.junk) — item from COMBAT.junkItem
  const junk = game.data.COMBAT?.junkItem;
  if (S.b.junk && junk && game.data.ITEMS[junk]) loot.items.push({ id: junk, n: S.b.junk });
  // combat rework §6: objective rewards and opened chests — extra draws from the beaten enemies' tables
  if (extraRolls > 0) {
    const ex = rollLoot(beaten, { ...game.data, ENEMIES }, Math.random, { flags, owned, extraRolls, onlyExtra: true });
    loot.credits += ex.credits;
    addItems(loot.items, ex.items);
  }
  return loot;
}

/** Merge item stacks { id, n, q? } into a loot list. */
export function addItems(list, items) {
  for (const it of items) {
    const same = list.find((x) => x.id === it.id && (x.q || null) === (it.q || null));
    if (same) same.n += it.n; else list.push({ ...it });
  }
  return list;
}

/**
 * combat rework §6: rewards of the optional objective after a win (XP and reputation now; extra loot rolls and the
 * credits share go to the loot) + opened chests. Fills `notes` (lines of the loot window). Returns { rolls, credits }.
 */
function objectiveRewards(game, S, o, notes) {
  const save = game.save;
  const sum = objectiveSummary(S.b);
  const out = { rolls: sum.chestsOpened * (COMBAT.chest?.loot ?? 1), credits: 0 };
  if (sum.chestsOpened) notes.push({ text: `▣ ${t('obj.chests')}: ${sum.chestsOpened}/${sum.chests} — ${tf('obj.rewardLoot', { n: out.rolls })}`, color: 'b' });
  const g = sum.goal;
  if (!g) return out;
  const name = t(`obj.${g.id}.name`);
  // reputation: the binding's faction, else the node's faction unless it is the enemy side, else the villages
  const foe = o.faction || enemyDef(S.b.units.find(isFoeTeam)?.enemyId)?.faction;
  const lf = locFaction(o.location || save.location);
  const fac = g.rep || (lf && lf !== foe ? lf : 'neutralVillages');
  if (g.state === 'done') {
    const rw = g.reward || {}, parts = [];
    if (rw.xp) {
      const xp = Math.round(battleXp(S.b, game.data) * rw.xp);
      if (xp > 0) { for (const x of gainXp(save, xp, game.data)) game.toast(x.text, x.color); parts.push(`+${xp} ${t('res.xp')}`); }
    }
    if (rw.loot) { out.rolls += rw.loot; parts.push(tf('obj.rewardLoot', { n: rw.loot })); }
    if (rw.credits) { out.credits = rw.credits; parts.push(tf('obj.rewardCredits', { n: Math.round(rw.credits * 100) })); }
    if (rw.rep && fac) { for (const x of repToasts(applyRep(save, fac, rw.rep))) game.toast(x.text, x.color); parts.push(tf('obj.rewardRep', { n: rw.rep })); }
    notes.push({ text: `✓ ${name}: ${parts.join(', ') || t('obj.state.done')}`, color: 'j' });
  } else {
    const failRep = COMBAT.objectives?.[g.id]?.failRep;
    if (failRep && fac) for (const x of repToasts(applyRep(save, fac, failRep))) game.toast(x.text, x.color);
    notes.push({ text: `✗ ${name}: ${t('obj.state.fail')}${g.reason ? ` (${t(`obj.why.${g.reason}`)})` : ''}${failRep && fac ? ` · ${tf('obj.failRep', { n: failRep })}` : ''}`, color: 'c' });
  }
  return out;
}

/**
 * combat rework §6.2: the whole party left through exits — XP × retreat.xpMul for the beaten, no loot, the battle stays
 * undone (enemies remain), days pass; back to the previous node (as the old world-flag retreat).
 */
function retreatExit(game, S, o) {
  const save = game.save;
  const RT = COMBAT.retreat || {};
  for (const x of writeBack(game, S, false, o, { retreat: true })) game.toast(x.text, x.color);
  const lines = [];
  const xp = Math.floor(battleXp(S.b, game.data) * (RT.xpMul ?? 0.25));
  if (xp > 0) { for (const x of gainXp(save, xp, game.data)) game.toast(x.text, x.color); lines.push({ text: tf('obj.retreatXp', { n: xp }), color: 'h' }); }
  const ex = passDays(save, RT.days ?? 1);
  for (const x of ex.out || []) game.toast(x.text, x.color);
  lines.push({ text: tf('obj.retreatDays', { n: RT.days ?? 1 }), color: 'a' }, { text: t('obj.retreatStay'), color: '4' });
  o.onFlee?.(game); // world-consequences.md: an attacked NPC survives the retreat
  if (save.prevLocation && LOCATIONS[save.prevLocation]) save.location = save.prevLocation;
  const heroDead = !!S.b.byId.hero?.dead;
  if (heroDead) save.cyberspace = save.cyberspace || { reason: 'hero', helped: true, pending: true };
  saveGame(save);
  game.visit = null;
  game.openModal({ title: t('obj.retreatDone'), border: 'a', titleColor: 'a', lines, onCancel: false,
    options: [{ label: t('battle.ok'), run: (g) => {
      if (heroDead) import('./cyberspace.js').then((m) => m.startCyberspace(g, { reason: 'hero', helped: true }));
      else if (ex.zero && !save.cyberspace) import('./exodus-zero.js').then((m) => m.startExodusZero(g));
      else import('./world-map.js').then((m) => g.setScene(m.createWorldMapScene()));
    } }] });
}

/** Battle results: credits and items, «Забрать всё» puts them into the shared backpack (no weight limit in data). */
export function openLoot(game, loot, then) {
  if (!loot.credits && !loot.items.length && !loot.notes?.length) { then(); return; }
  const take = () => {
    const h = game.save.hero;
    h.credits += loot.credits;
    // v7: instances with quality → hero bag → companions → stash (hub) → «На земле» (gear screen; dropped only by hand)
    let stashed = 0, ground = 0, lost = 0;
    for (const { id, n, q } of loot.items) {
      const r = receive(game.save, makeInst(id, q), n, { stash: canStash(game.save), ground: true }); // B1: one path, view in step
      stashed += r.stash; ground += r.ground; lost += r.left;
    }
    if (loot.credits) game.toast(tf('fx.credits', { n: `+${loot.credits}` }), 'b');
    if (loot.items.length) game.toast(tf('loot.got', { n: loot.items.reduce((s, x) => s + x.n, 0) }), 'j');
    if (stashed) game.toast(tf('inv.lootStash', { n: stashed }), 'a');
    if (ground) game.toast(tf('inv.lootGround', { n: ground }), 'c');
    if (lost) game.toast(tf('inv.lootLost', { n: lost }), 'c');
    then();
  };
  const QC = { junk: 'n', working: 'h', masterwork: 'b', relic: 'f' };
  const lines = [];
  // combat rework §6: objective results / chests — the summary on top of the loot window
  if (loot.notes?.length) lines.push({ text: t('obj.summary'), color: '4' }, ...loot.notes);
  if (loot.credits) lines.push({ text: tf('fx.credits', { n: `+${loot.credits}` }), color: 'b' });
  const label = ({ id, n, q }) => `${ITEMS[id]?.name || id}${q && q !== 'working' ? ` (${qualityName(q)})` : ''}${n > 1 ? ` ×${n}` : ''}`;
  // items — info rows: the full card of the hovered one in the details panel (ui/modal.js `detail`, `inert`)
  const hero = game.save.hero;
  const rows = loot.items.filter((x) => ITEMS[x.id]).map((x) => ({ label: label(x), inert: true, sub: itemStats(ITEMS[x.id]), subColor: C[QC[x.q || ITEMS[x.id].quality]],
    detail: () => itemTip(ITEMS[x.id], { have: hero.items[x.id] || 0, equipped: ITEMS[hero.equipment?.[ITEMS[x.id].slot]], q: x.q }) }));
  game.openModal({ title: t('loot.title'), lines, onCancel: take, width: 640, // Esc also takes everything (the modal is already closed)
    options: [...rows, { label: t('loot.takeAll'), run: take }] });
}

function afterBattle(game, S, o) {
  const save = game.save;
  const hero = S.b.byId.hero;
  saveGame(save);
  o.onWin(game); // quest progress etc.
  if (hero && hero.dead) import('./cyberspace.js').then((m) => m.startCyberspace(game, { reason: 'hero', helped: true }));
}

/** { id: n } spent in battle: (quick + backpack at start) − (at the end). */
function usedItems(u) {
  const out = {};
  const start = {}, end = {};
  for (const src of [u.build?.inventory, u.build?.backpack]) for (const [id, n] of Object.entries(src || {})) start[id] = (start[id] || 0) + n;
  for (const src of [u.inventory, u.backpack]) for (const [id, n] of Object.entries(src || {})) end[id] = (end[id] || 0) + n;
  for (const [id, n] of Object.entries(start)) if (n - (end[id] || 0) > 0) out[id] = n - (end[id] || 0);
  return out;
}

/** Battle events for companions: barks (battle start, crit, ally down) and revives by the hero (loyalty). */
function companionEvent(S, e, save) {
  const isComp = (id) => typeof id === 'string' && id.startsWith('c-');
  if (e.type === 'battleStart') queueBark('battleStart');
  else if (e.type === 'attack' && e.crit && (e.actor === 'hero' || isComp(e.actor))) queueBark('critHit');
  else if (e.type === 'down' && (e.target === 'hero' || isComp(e.target))) {
    queueBark('allyDown');
    const pt = e.target === 'hero' && partnerOf(save);
    if (pt) queueBark('romanceHurt', pt); // romance.md: the partner's cry
  }
  else if (e.type === 'stabilize' && e.actor === 'hero' && isComp(e.target)) (S.revived = S.revived || new Set()).add(e.target.slice(2));
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
    // v3/v7: items used in battle leave the quick slots / bag (unit.inventory + unit.backpack are battle copies)
    consumeBattle(save, 'hero', usedItems(hu));
    keepQuickLayout(save, 'hero', hu.inventory); // «Порыться» during the battle — the new quick-slot layout stays
    // v3.1: opiates used in battle → withdrawal (−МРЛ now, debuff until a full rest)
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
      out.push(...romanceDeath(save, p.npc)); // romance.md: the partner died → farewell scene
      continue;
    }
    const r = after(u);
    p.hp = r.hp; p.mrl = r.mrl;
    consumeBattle(save, p.npc, usedItems(u));
    keepQuickLayout(save, p.npc, u.inventory);
  }
  out.push(...restAfterBattle(save, b.byId, won && !retreat, game.data)); // rest: ENR / «за отдых» persist, breather after a win
  // Cyberspace is decided right here (synchronously): a reload before the next scene still sends the hero there
  if (!retreat && (!won || hu?.dead)) save.cyberspace = save.cyberspace || { reason: won ? 'hero' : 'wipe', helped: !!won, pending: true };
  if (won) {
    out.push(...battleLoyalty(save, b.units, S.revived)); // companions-scenes.md: downed / raised / clean wins
    out.push(...gainXp(save, Math.round(battleXp(b, game.data) * (o.xpMul ?? 1)), game.data)); // skirmishes.md: choice XP multiplier
    const killed = b.units.filter((u) => isFoeTeam(u) && u.kind !== 'summon' && (u.dead || u.removed)).length;
    if (o.faction && killed) out.push(...repToasts(applyRep(save, o.faction, Math.max(R.killRep.maxPerBattle, R.killRep.perKill * killed))));
    if (o.id && !save.battlesDone.includes(o.id)) save.battlesDone.push(o.id);
    // N7 Biology: samples of beaten mutants sell for credits
    const SM = SKILL_RULES.economy.samples;
    const beaten = b.units.filter((u) => isFoeTeam(u) && u.kind !== 'summon' && (u.dead || u.removed)).map((u) => u.enemyId);
    out.push(...markKills(save, beaten.filter(Boolean))); // codex: +1 win per record per battle
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
