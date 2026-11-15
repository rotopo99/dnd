// Roguelike mode «Забег» (docs/specs/roguelike.md): run state, act graph by seed, node resolution, rewards 1 of 3,
// run credits, permadeath, ascensions. Pure logic, no DOM (tools/test.mjs and tools/sim/run.mjs import it).
// Determinism: every random draw comes from rngFor(run, part) = createRng(`${seed}:${act}:${part}`), so the same seed and
// the same choices give the same graph, battles, rewards and shops.
import { RUN, ACTS, GRAPH, NODE_TYPES, TEMPLATES, START_KIT, REWARDS, RELICS, EVENT_POOL, EVENT_RULES, ASCENSIONS, BALANCE, META, ENC_SCALE } from '../data/roguelike.js';
import { GAME_DATA, ITEMS } from '../data/index.js';
import { ENEMIES_V3, scaleV3 } from '../data/enemies-v3.js';
import { TALENTS, talentAllowed } from '../data/talents.js';
import { gadgetFor } from '../data/gadgets.js';
import { STARTER_KITS } from '../data/items/shops.js';
import { EVENTS_DENSITY } from '../data/world/density-events.js';
import { BATTLE_OBJECTIVES } from '../data/world/battle-objectives.js';
import { biomeOf } from '../data/combat.js';
import { CARD_SETS } from '../data/cards.js';
import { buildCreature, isAllowed } from '../rules/character.js';
import { createRng } from '../rules/rng.js';
import { makeWorldMap } from './arena.js';
import { vendorStock } from './vendors.js';
import { checkInfo } from './checks.js';
import { rollPack } from './cards.js';

export const RUN_VERSION = 1;
export const SAVE_KEY = 'dnd.run.save';
const D = GAME_DATA;

// ------------------------------------------------------------------ rng, ascension, levels

export const rngFor = (run, part) => createRng(`${run.seed}:${run.act}:${part}`);

/** Random 6-char seed (A–Z, 2–9). */
export function randomSeed(rand = Math.random) {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < (RUN.seed.len || 6); i++) s += abc[Math.floor(rand() * abc.length)];
  return s;
}

/** Cumulative ascension effects for level asc (0–10). */
export function ascFx(asc = 0) {
  const fx = { foeHp: 0, eliteWeight: 1, shopPrice: 1, carryHpMax: 1, foeAtk: 0, foeKb: 0, eliteExtraFoe: 0, rewardChoices: RUN.rewardChoices,
    credits: 1, restHeal: 0, foeFirstTurn: false, bossScale: 1, finalBossPhase: false, noReroll: false };
  for (const a of ASCENSIONS) {
    if (a.lvl < 1 || a.lvl > asc) continue;
    if (a.foeHp) fx.foeHp += a.foeHp;
    if (a.eliteWeight) fx.eliteWeight *= a.eliteWeight;
    if (a.shopPrice) fx.shopPrice *= a.shopPrice;
    if (a.carryHpMax) fx.carryHpMax = Math.min(fx.carryHpMax, a.carryHpMax);
    if (a.foeAtk) fx.foeAtk += a.foeAtk;
    if (a.foeKb) fx.foeKb += a.foeKb;
    if (a.eliteExtraFoe) fx.eliteExtraFoe += a.eliteExtraFoe;
    if (a.rewardChoices) fx.rewardChoices = Math.min(fx.rewardChoices, a.rewardChoices);
    if (a.credits) fx.credits *= a.credits;
    if (a.restHeal) fx.restHeal += a.restHeal;
    if (a.foeFirstTurn) fx.foeFirstTurn = true;
    if (a.bossScale) fx.bossScale *= a.bossScale;
    if (a.finalBossPhase) fx.finalBossPhase = true;
    if (a.noReroll) fx.noReroll = true;
  }
  return fx;
}

/** Party level on a layer of an act: lvl[0] + floor(layer × (lvl[1] − lvl[0]) / (layers − 1)). */
export function levelAt(act, layer) {
  const A = ACTS[act];
  const l = Math.max(0, Math.min(A.layers - 1, layer));
  return A.lvl[0] + Math.floor((l * (A.lvl[1] - A.lvl[0])) / (A.layers - 1));
}
export const runLevel = (run) => levelAt(run.act, Math.max(0, run.layer));

const relicFx = (run, k) => run.relics.reduce((s, id) => s + (RELICS.find((r) => r.id === id)?.fx?.[k] || 0), 0);
export const hasRelic = (run, id) => run.relics.includes(id);

// ------------------------------------------------------------------ graph

const weightedPick = (rng, w) => {
  const ks = Object.keys(w).filter((k) => w[k] > 0);
  let r = rng() * ks.reduce((s, k) => s + w[k], 0);
  for (const k of ks) { r -= w[k]; if (r <= 0) return k; }
  return ks[ks.length - 1];
};

/** Non-crossing monotone links between layers of sizes a and b; out-degree ≤ linksMax, every node ≥1 in and out. */
function linkLayers(rng, a, b) {
  for (let tries = 0; tries < 50; tries++) {
    const di = a - 1, dj = b - 1;
    const k = rng.int(0, Math.min(di, dj));
    const steps = [...Array(k).fill('b'), ...Array(di - k).fill('i'), ...Array(dj - k).fill('j')];
    for (let s = steps.length - 1; s > 0; s--) { const r = Math.floor(rng() * (s + 1)); [steps[s], steps[r]] = [steps[r], steps[s]]; }
    let i = 0, j = 0;
    const edges = [[0, 0]];
    for (const st of steps) { if (st !== 'j') i++; if (st !== 'i') j++; edges.push([i, j]); }
    const out = new Array(a).fill(0);
    for (const [x] of edges) out[x]++;
    if (out.every((n) => n <= GRAPH.linksMax)) return edges;
  }
  return Array.from({ length: Math.max(a, b) }, (_, n) => [Math.min(n, a - 1), Math.min(n, b - 1)]);
}

/** All root→boss paths (arrays of nodes). Graph sizes are small (≤ 4 lanes, ≤ 2 links). */
export function graphPaths(g) {
  const byId = nodeIndex(g);
  const out = [];
  const walk = (n, acc) => {
    acc = [...acc, n];
    if (!n.links.length) { out.push(acc); return; }
    for (const id of n.links) walk(byId[id], acc);
  };
  for (const n of g.layers[0]) walk(n, []);
  return out;
}
export const nodeIndex = (g) => Object.fromEntries(g.layers.flat().map((n) => [n.id, n]));

/** Generate the node graph of act `act` (deterministic by seed). */
export function genGraph(seed, act, asc = 0) {
  const A = ACTS[act];
  const rng = createRng(`${seed}:${act}:graph`);
  const fx = ascFx(asc);
  const L = A.layers;
  const mid = Math.floor((L - 1) / 2);
  const layers = [];
  for (let l = 0; l < L; l++) {
    const n = l === L - 1 ? 1 : rng.int(GRAPH.lanes[0], GRAPH.lanes[1]);
    layers.push(Array.from({ length: n }, (_, i) => ({ id: `${act}-${l}-${i}`, act, layer: l, lane: i, y: (i + 0.5) / n, type: null, links: [] })));
  }
  for (let l = 0; l < L - 1; l++) {
    for (const [i, j] of linkLayers(rng, layers[l].length, layers[l + 1].length)) {
      const nd = layers[l][i], id = layers[l + 1][j].id;
      if (!nd.links.includes(id)) nd.links.push(id);
    }
  }
  const weights = { ...GRAPH.weights, elite: GRAPH.weights.elite * fx.eliteWeight };
  const free = (n) => n.layer > 0 && n.layer < L - 2 && n.layer !== mid;
  for (const row of layers) for (const n of row) {
    if (n.layer === 0) n.type = GRAPH.forced.first;
    else if (n.layer === L - 1) n.type = GRAPH.forced.boss;
    else if (n.layer === L - 2) n.type = GRAPH.forced.preBoss;
    else if (n.layer === mid) n.type = 'treasure';
    else {
      const w = { ...weights };
      if (n.layer < GRAPH.eliteMinLayer) w.elite = 0;
      if (n.layer < GRAPH.shopMinLayer) w.shop = 0;
      w.treasure = 0; // the middle layer holds the treasure
      n.type = weightedPick(rng, w);
    }
  }
  // guarantees: every path has ≥1 shop and ≥1 elite (convert a random free fight/event/rest node of a bad path)
  const g = { act, layers };
  for (let guard = 0; guard < 60; guard++) {
    const bad = graphPaths(g).find((p) => !p.some((n) => n.type === 'shop') || !p.some((n) => n.type === 'elite'));
    if (!bad) break;
    const need = bad.some((n) => n.type === 'shop') ? 'elite' : 'shop';
    const minL = need === 'elite' ? GRAPH.eliteMinLayer : GRAPH.shopMinLayer;
    const cand = bad.filter((n) => free(n) && n.layer >= minL && n.type !== 'shop' && n.type !== 'elite');
    const pool = cand.length ? cand : bad.filter((n) => free(n) && n.layer >= minL && n.type !== need);
    if (!pool.length) break;
    pool[Math.floor(rng() * pool.length)].type = need;
  }
  // encounter names are visible on the map: pick them now
  for (const row of layers) for (const n of row) {
    if (n.type === 'fight') n.enc = rng.pick(A.fight);
    else if (n.type === 'elite') n.enc = rng.pick(A.elite);
    else if (n.type === 'boss') n.enc = rng.pick(A.boss);
  }
  return g;
}

/** Validation for tests: links do not cross, degrees, guarantees. → [] or a list of problems. */
export function graphProblems(g) {
  const out = [];
  const L = g.layers.length;
  for (let l = 0; l < L - 1; l++) {
    const next = g.layers[l + 1];
    const edges = [];
    for (const n of g.layers[l]) {
      if (!n.links.length || n.links.length > GRAPH.linksMax) out.push(`links ${n.id}`);
      for (const id of n.links) edges.push([n.lane, next.findIndex((x) => x.id === id)]);
    }
    for (const x of next) if (!g.layers[l].some((n) => n.links.includes(x.id))) out.push(`orphan ${x.id}`);
    for (const [a, b] of edges) for (const [c, d] of edges) if ((a < c && b > d)) out.push(`cross ${l}`);
  }
  for (const p of graphPaths(g)) {
    if (!p.some((n) => n.type === 'shop')) out.push('path without shop');
    if (!p.some((n) => n.type === 'elite')) out.push('path without elite');
    if (p[p.length - 2]?.type !== 'rest') out.push('no rest before boss');
  }
  return [...new Set(out)];
}

// ------------------------------------------------------------------ run and party

export const templateById = (id) => TEMPLATES.find((t) => t.id === id);
const NAMES = ['Гвоздь', 'Сухарь', 'Рация', 'Пломба', 'Кефир', 'Шуруп', 'Ватт', 'Плюшка', 'Тамбур', 'Кнопка', 'Дизель', 'Шпала', 'Фильтр', 'Мазут'];

/** Party member from a template: class + race (+ path by seed), starter kit (STARTER_KITS) and START_KIT consumables. */
export function makeMember(tplId, { race, name, path, i = 0, seed = 'x' } = {}) {
  const tpl = templateById(tplId);
  if (!tpl) throw new Error(`run: unknown template ${tplId}`);
  const cls = D.CLASSES[tpl.cls];
  const rng = createRng(`${seed}:member:${i}`);
  race = race && tpl.races.includes(race) ? race : tpl.races.find((r) => isAllowed(D.RACES[r], cls)) || tpl.races[0];
  path = path || (cls.paths?.length ? cls.paths[0].id : null);
  const kit = STARTER_KITS[`${tpl.cls}:${path}`] || STARTER_KITS[tpl.cls] || {};
  const items = {};
  for (const id of kit.belt || []) if (ITEMS[id]?.cat === 'consumable') items[id] = (items[id] || 0) + 1;
  for (const [id, n] of START_KIT.consumables) if (ITEMS[id]) items[id] = (items[id] || 0) + n;
  return { id: `m${i}`, tpl: tplId, name: name || NAMES[(rng.int(0, NAMES.length - 1) + i) % NAMES.length], race, cls: tpl.cls, path,
    weapon: ITEMS[kit.weapon] ? kit.weapon : null, armor: ITEMS[kit.armor] ? kit.armor : null, mods: { weapon: [], armor: [] },
    talents: [], items, hpLost: 0, mrlLost: 0, dead: false };
}

/**
 * newRun({ seed, asc, party: [{ tpl, race?, name? }], bonus? }) — bonus from meta.startBonus(): { credits, items, relics, freeTalents, spiritWeapon }.
 */
export function newRun({ seed = randomSeed(), asc = 0, party = [], bonus = {} } = {}) {
  seed = String(seed).toUpperCase();
  const fx = ascFx(asc);
  const members = party.slice(0, RUN.partyMax).map((p, i) => makeMember(p.tpl, { ...p, i, seed }));
  if (members.length < RUN.partyMin) throw new Error('run: empty party');
  const run = {
    v: RUN_VERSION, seed, asc, act: 0, layer: -1, node: null, path: [], party: members, bag: {}, credits: RUN.startCredits + (bonus.credits || 0),
    relics: [...(bonus.relics || [])], rerolls: fx.noReroll ? 0 : RUN.rewardReroll, usedEvents: [], shopRerolls: {}, seq: 0,
    memory: 0, log: [], deaths: [], status: 'map', pending: [], cards: [], graph: null, revived: false, freeTalents: bonus.freeTalents || 0,
  };
  for (const [id, n] of bonus.items || []) giveItem(run, id, n);
  if (bonus.spiritWeapon && ITEMS[bonus.spiritWeapon]) run.bag[bonus.spiritWeapon] = (run.bag[bonus.spiritWeapon] || 0) + 1;
  run.credits += relicFx(run, 'startCredits');
  run.rerolls += fx.noReroll ? 0 : relicFx(run, 'rewardReroll');
  run.graph = genGraph(seed, 0, asc);
  if (run.freeTalents > 0) run.pending.push({ kind: 'talent', free: true });
  return run;
}

export const alive = (run) => run.party.filter((m) => !m.dead);
export const nodeById = (run, id) => nodeIndex(run.graph)[id];

/** Nodes the party can enter now (layer 0 at the start, else links of the current node). */
export function available(run) {
  if (run.status !== 'map') return [];
  if (run.layer < 0 || !run.node) return run.graph.layers[0];
  const cur = nodeById(run, run.node);
  return cur ? cur.links.map((id) => nodeById(run, id)) : [];
}

const equipmentOf = (m) => ({ weapon: m.weapon || undefined, armor: m.armor || undefined,
  inst: { weapon: { mods: m.weapon ? m.mods.weapon : [] }, armor: { mods: m.armor ? m.mods.armor : [] } } });

/** Battle creature of a member on the current run level (relic passives, carried HP/MRL, ascension HP cap). */
export function buildMember(run, m, { id = m.id, level = runLevel(run), carry = true } = {}) {
  const spec = { race: m.race, cls: m.cls, path: m.path, level, name: m.name, data: D, id, talents: m.talents, gadget: gadgetFor(m.cls)?.id,
    equipment: equipmentOf(m), inventory: Object.fromEntries(Object.entries(m.items).filter(([k, n]) => n > 0 && ITEMS[k]?.cat === 'consumable')), asi: 'auto' };
  let u;
  try { u = buildCreature(spec); } catch { u = buildCreature({ ...spec, equipment: undefined, talents: [] }); }
  const hpPct = relicFx(run, 'hpPct'), mrlPct = relicFx(run, 'mrlPct');
  if (hpPct) u.maxHp = Math.round(u.maxHp * (1 + hpPct));
  if (mrlPct && u.maxMrl) u.maxMrl = Math.round(u.maxMrl * (1 + mrlPct));
  const enr = relicFx(run, 'enr'); if (enr) u.maxEnr += enr;
  const sp = relicFx(run, 'speed'); if (sp) u.speed += sp;
  const cr = relicFx(run, 'critRange'); if (cr) u.critRange = (u.critRange || 0) + cr;
  if (hasRelic(run, 'r-old-bayan')) u.initBonus = (u.initBonus || 0) + 3;
  if (hasRelic(run, 'r-cringe-ward')) u.resist = { ...u.resist, cringe: u.resist?.cringe || 'resist' };
  u.hp = u.maxHp; u.mrl = u.maxMrl; u.enr = u.maxEnr;
  if (carry) {
    u.hp = Math.max(1, u.maxHp - (m.hpLost || 0));
    u.mrl = Math.max(u.maxMrl ? 1 : 0, u.maxMrl - (m.mrlLost || 0));
    const cap = ascFx(run.asc).carryHpMax;
    if (cap < 1) u.hp = Math.max(1, Math.min(u.hp, Math.floor(u.maxHp * cap)));
  }
  u.look = null;
  u.runMember = m.id;
  return u;
}

/** Units of the living party, ids hero, hero2… (net/coop-battle heroIdOf order). */
export function partyUnits(run) {
  return alive(run).map((m, i) => buildMember(run, m, { id: i ? `hero${i + 1}` : 'hero' }));
}

/** Max HP/MRL of a member at the current level (for UI and healing). */
export function memberStats(run, m) {
  const u = buildMember(run, m, { carry: false });
  return { maxHp: u.maxHp, maxMrl: u.maxMrl, hp: Math.max(0, u.maxHp - m.hpLost), mrl: Math.max(0, u.maxMrl - m.mrlLost), unit: u };
}

/** Heal share k of max HP/MRL to the living party. */
export function healParty(run, k) {
  for (const m of alive(run)) {
    const s = memberStats(run, m);
    m.hpLost = Math.max(0, m.hpLost - Math.round(s.maxHp * k));
    m.mrlLost = Math.max(0, m.mrlLost - Math.round(s.maxMrl * k));
  }
}

/** Give an item: consumables to a member (given or the one with the fewest), gear to the shared bag. */
export function giveItem(run, id, n = 1, memberId = null) {
  if (!ITEMS[id]) return null;
  if (ITEMS[id].cat === 'consumable') {
    const al = alive(run);
    const m = al.find((x) => x.id === memberId) || al.slice().sort((a, b) => count(a.items) - count(b.items))[0];
    if (m) { m.items[id] = (m.items[id] || 0) + n; return m; }
  }
  run.bag[id] = (run.bag[id] || 0) + n;
  return null;
}
const count = (o) => Object.values(o).reduce((s, n) => s + n, 0);

/** Equip a weapon/armor from anywhere (the old one goes to the bag) or put a mod on the member's weapon/armor. */
export function equip(run, memberId, id) {
  const m = run.party.find((x) => x.id === memberId);
  const it = ITEMS[id];
  if (!m || !it) return false;
  if (it.cat === 'weapon' || it.cat === 'armor') {
    const slot = it.cat;
    if (m[slot]) run.bag[m[slot]] = (run.bag[m[slot]] || 0) + 1;
    for (const md of m.mods[slot] || []) run.bag[md] = (run.bag[md] || 0) + 1;
    m[slot] = id; m.mods[slot] = [];
    return true;
  }
  if (it.cat === 'mod') {
    const slot = (it.target || 'weapon') === 'weapon' ? 'weapon' : 'armor';
    if (!m[slot] || m.mods[slot].length >= 2) return false;
    m.mods[slot].push(id);
    return true;
  }
  if (it.cat === 'consumable') { m.items[id] = (m.items[id] || 0) + 1; return true; }
  return false;
}
/** Take one item out of the bag and equip / hand it to a member. */
export function equipFromBag(run, memberId, id) {
  if (!run.bag[id]) return false;
  run.bag[id]--;
  if (!run.bag[id]) delete run.bag[id];
  if (equip(run, memberId, id)) return true;
  run.bag[id] = (run.bag[id] || 0) + 1;
  return false;
}

// ------------------------------------------------------------------ battles

const enemyDef = (id) => D.ENEMIES[id] || ENEMIES_V3[id];
/** Ascension tuning of an enemy def: +HP share, +attack, +KB (a copy; the id stays for sprites/models). */
function tuneEnemy(def, { hp = 0, atk = 0, kb = 0 } = {}) {
  if (!hp && !atk && !kb) return def;
  const out = { ...def, hp: Math.max(1, Math.round(def.hp * (1 + hp))), kb: (def.kb || 0) + kb, stats: { ...def.stats } };
  if (def.mrl) out.mrl = Math.round(def.mrl * (1 + hp));
  if (atk && def.weapon) out.weapon = { ...def.weapon, attack: def.weapon.attack != null ? def.weapon.attack + atk : def.weapon.attack, hit: (def.weapon.hit || 0) + (def.weapon.attack == null ? atk : 0) };
  return out;
}

/** Enemies of a node for the current party: party-size shift, elite extra foe, boss scale, ascension tuning. → defs */
export function nodeEnemies(run, node, encId = node.enc) {
  const enc = D.ENCOUNTERS[encId];
  const fx = ascFx(run.asc);
  let list = enc ? [...enc.enemies] : ['scavenger', 'scavenger'];
  let shift = BALANCE.partySizeFoes[alive(run).length] ?? 0;
  if (node.type === 'elite') shift += fx.eliteExtraFoe;
  if (shift < 0) list = list.slice(0, Math.max(Math.min(2, list.length), list.length + shift));
  else if (shift > 0) { const base = list.length > 1 ? list.slice(1) : list; for (let i = 0; i < shift; i++) list.push(base[i % base.length]); }
  const boss = node.type === 'boss';
  const A = ACTS[run.act];
  // power multiplier (scaleV3): boss — bossScale × ascension; elite — act eliteScale × NODE_TYPES.elite.danger; fight — fightScale
  const p = (boss ? A.bossScale * fx.bossScale : node.type === 'elite' ? (A.eliteScale ?? 1) * (NODE_TYPES.elite.danger ?? 1) : (A.fightScale ?? 1))
    * (ENC_SCALE[encId] ?? 1);
  return list.map((id) => {
    let nid = id;
    if (p !== 1 && enemyDef(id)) nid = scaleV3(id, Math.round(p * 100) / 100);
    let def = enemyDef(nid);
    if (!def) return id;
    const finale = boss && fx.finalBossPhase && run.act === ACTS.length - 1 && (def.boss || def.rank === 'boss');
    def = tuneEnemy(def, { hp: fx.foeHp + (finale ? 0.25 : 0), atk: fx.foeAtk, kb: fx.foeKb });
    return def === D.ENEMIES[nid] ? nid : def;
  });
}

/**
 * Battle setup of a node: { seed, enemies, map, objectives, enemyInit, title, biome, enc }. Arena by an act biome,
 * random objective (BATTLE_OBJECTIVES.random) outside boss fights.
 */
export function fightSetup(run, node, encId = node.enc) {
  const rng = rngFor(run, `battle:${node.id}:${encId}`);
  const A = ACTS[run.act];
  const biome = rng.pick(A.biomes);
  const seed = rng.int(1, 1e9);
  const enemies = nodeEnemies(run, node, encId);
  const ids = enemies.map((e) => (typeof e === 'string' ? e : e.id));
  const map = makeWorldMap({ seed, enemies: enemies.length, enemyIds: ids, biome, id: `run-${node.id}` });
  let objectives = null;
  if (node.type !== 'boss' && rng() < BATTLE_OBJECTIVES.random.chance) {
    const pool = BATTLE_OBJECTIVES.random.pool[biomeOf({ biome })] || BATTLE_OBJECTIVES.random.pool.wasteland;
    objectives = { goal: rng.pick(pool), chests: 0, retreat: false, exitLock: false };
  }
  const fx = ascFx(run.asc);
  return { seed, enemies, map, objectives, enemyInit: fx.foeFirstTurn ? 5 : 0, biome, enc: encId,
    title: D.ENCOUNTERS[encId]?.name || encId, kind: node.type };
}

/**
 * Write a finished battle back to the run. units — battle units (b.units); won — party victory.
 * Downed and not stabilised by the end = dead (permadeath); r-reboot-chip saves the first one. → { deaths: [name], revived }
 */
export function applyFight(run, node, units, won) {
  const out = { deaths: [], revived: null };
  for (const m of alive(run)) {
    const u = units.find((x) => x.runMember === m.id);
    if (!u) continue;
    let gone = !won || u.dead || u.down || u.removed;
    if (won && u.down && !u.dead && !u.removed) { // canon «при смерти»: the standing allies try to save him after the fight
      const savers = units.filter((x) => x.runMember && !x.dead && !x.down && !x.removed).map((x) => x.runMember);
      const chk = savers.length ? runCheck(run, `rescue:${node.id}:${m.id}`, RUN.rescue.skill, RUN.rescue.dc, savers) : null;
      (out.rescues = out.rescues || []).push({ name: m.name, ok: !!chk?.ok, check: chk });
      if (chk?.ok) { gone = false; u.hp = 1; u.down = false; }
    }
    if (gone && won && !run.revived && hasRelic(run, 'r-reboot-chip')) {
      run.revived = true; out.revived = m.name;
      m.hpLost = u.maxHp - 1; m.mrlLost = Math.max(0, u.maxMrl - Math.max(1, u.mrl));
    } else if (gone) {
      killMember(run, m);
      out.deaths.push(m.name);
      continue;
    } else {
      m.hpLost = Math.max(0, u.maxHp - u.hp);
      m.mrlLost = Math.max(0, u.maxMrl - u.mrl);
    }
    const inv = { ...(u.inventory || {}) };
    for (const [k, n] of Object.entries(u.backpack || {})) inv[k] = (inv[k] || 0) + n;
    for (const k of Object.keys(m.items)) if (ITEMS[k]?.cat === 'consumable') m.items[k] = inv[k] || 0;
    for (const k of Object.keys(m.items)) if (!m.items[k]) delete m.items[k];
  }
  if (!alive(run).length) endRun(run, 'loss');
  return out;
}

/** Permadeath: the member leaves the run, his gear goes to the shared bag. */
export function killMember(run, m) {
  if (m.dead) return;
  m.dead = true;
  const weapon = m.weapon;
  for (const id of [m.weapon, m.armor, ...m.mods.weapon, ...m.mods.armor]) if (id) run.bag[id] = (run.bag[id] || 0) + 1;
  for (const [id, n] of Object.entries(m.items)) if (n > 0) run.bag[id] = (run.bag[id] || 0) + n;
  m.weapon = null; m.armor = null; m.mods = { weapon: [], armor: [] }; m.items = {};
  run.deaths.push({ name: m.name, cls: m.cls, race: m.race, tpl: m.tpl, act: run.act, layer: run.layer, weapon });
  run.log.push({ k: 'death', name: m.name, act: run.act, layer: run.layer });
}

// ------------------------------------------------------------------ rewards

const rarityOf = (rng, kind) => weightedPick(rng, REWARDS.rarity[kind] || REWARDS.rarity.fight);
const tierRange = (rar, cap) => (rar === 'common' ? [1, Math.max(1, cap - 1)] : rar === 'rare' ? [Math.max(1, cap - 1), cap] : [cap, cap + 1]);
function pickItem(rng, ids, rar, cap) {
  const [lo, hi] = tierRange(rar, cap);
  let pool = ids.filter((id) => ITEMS[id] && (ITEMS[id].tier || 1) >= lo && (ITEMS[id].tier || 1) <= hi);
  if (!pool.length) pool = ids.filter((id) => ITEMS[id] && (ITEMS[id].tier || 1) <= cap + 1);
  return pool.length ? rng.pick(pool) : null;
}

/** Talent context of a member for talentAllowed. */
export function talentCtxOf(run, m) {
  const u = buildMember(run, m, { carry: false });
  return { race: m.race, cls: m.cls, stats: u.stats, level: runLevel(run), weaponRange: u.weapon?.range ?? 1, tags: [] };
}
export function talentOptions(run, m) {
  const ctx = talentCtxOf(run, m);
  return REWARDS.talents.filter((id) => TALENTS[id] && !m.talents.includes(id) && talentAllowed(TALENTS[id], ctx));
}

/** The member a reward is offered for (rotates over the living party). */
export const rewardFocus = (run) => { const al = alive(run); return al[run.seq % Math.max(1, al.length)]; };

/**
 * Offer of a reward: { node, kind (fight|elite|boss|treasure|train), hero, cards: [{kind, id, rarity, n, credits}] }.
 * opt.only — a single kind (train → 'talent'); opt.hero — member id.
 */
export function rewardOffer(run, nodeKind = 'fight', opt = {}) {
  const roll = opt.roll ?? 0;
  const rng = rngFor(run, `reward:${run.seq}:${roll}:${opt.only || ''}`);
  const hero = run.party.find((m) => m.id === opt.hero) || rewardFocus(run);
  const fx = ascFx(run.asc);
  const n = opt.only ? 3 : fx.rewardChoices;
  const rarKind = nodeKind === 'treasure' ? 'elite' : nodeKind === 'boss' ? 'boss' : nodeKind === 'elite' ? 'elite' : 'fight';
  const cap = ACTS[run.act].tier + (nodeKind === 'boss' ? 1 : 0);
  const talents = hero ? talentOptions(run, hero) : [];
  const cards = [];
  const used = new Set();
  for (let guard = 0; cards.length < n && guard < 40; guard++) {
    const kind = opt.only || weightedPick(rng, { ...REWARDS.kinds, talent: talents.length ? REWARDS.kinds.talent : 0 });
    const rarity = rarityOf(rng, rarKind);
    let c = null;
    if (kind === 'talent') { const left = talents.filter((x) => !used.has(x)); if (left.length) c = { kind, id: rng.pick(left), rarity }; }
    else if (kind === 'item') {
      const r = rng();
      const src = r < 0.5 ? REWARDS.consumables : r < 0.75 ? REWARDS.weapons : REWARDS.armor;
      const id = pickItem(rng, src, rarity, cap);
      if (id) c = { kind, id, rarity, n: ITEMS[id].cat === 'consumable' ? (rarity === 'common' ? 1 : 2) : 1 };
    } else if (kind === 'mod') { const id = pickItem(rng, REWARDS.mods, rarity, cap); if (id) c = { kind, id, rarity }; }
    else if (kind === 'card') c = { kind, id: 'pack', rarity, cards: rollPack(rng, [rng.pick(Object.keys(CARD_SETS))]) };
    else if (kind === 'credits') {
      const [a, b] = NODE_TYPES[nodeKind]?.credits || NODE_TYPES.fight.credits;
      c = { kind, id: 'credits', rarity, credits: Math.round(rng.int(a, b) * fx.credits) };
    }
    if (!c || used.has(c.kind + ':' + c.id)) continue;
    used.add(c.kind + ':' + c.id); used.add(c.id);
    cards.push(c);
  }
  return { kind: nodeKind, hero: hero?.id || null, cards, only: opt.only || null, roll };
}

/** Take a reward card (for the offer's hero). → true */
export function takeReward(run, offer, card, memberId = offer.hero) {
  const m = run.party.find((x) => x.id === memberId && !x.dead) || alive(run)[0];
  if (card.kind === 'talent' && m && !m.talents.includes(card.id)) m.talents.push(card.id);
  else if (card.kind === 'item' || card.kind === 'mod') {
    const it = ITEMS[card.id];
    if (it.cat === 'consumable') giveItem(run, card.id, card.n || 1, m?.id);
    else if (!m || !equip(run, m.id, card.id)) run.bag[card.id] = (run.bag[card.id] || 0) + 1;
  } else if (card.kind === 'card') run.cards.push(...card.cards);
  else if (card.kind === 'credits') run.credits += card.credits;
  run.log.push({ k: 'reward', kind: card.kind, id: card.id, hero: m?.name });
  run.seq++;
  return true;
}
export const skipReward = (run) => { run.seq++; };
/** Reroll an offer (consumes a run reroll). → new offer | null */
export function rerollReward(run, offer) {
  if (run.rerolls <= 0) return null;
  run.rerolls--;
  return rewardOffer(run, offer.kind, { only: offer.only, hero: offer.hero, roll: (offer.roll || 0) + 1 });
}

/** Relic pool: RELICS minus owned, minus meta-locked ones (META relicPool unlocks). */
export function relicPool(run, unlocked = []) {
  const locked = new Set(META.unlocks.filter((u) => u.kind === 'relicPool' && !unlocked.includes(u.id)).map((u) => u.ref));
  return RELICS.filter((r) => !run.relics.includes(r.id) && !locked.has(r.id));
}
export function relicOffer(run, n = 3, unlocked = run.metaUnlocks || []) {
  const rng = rngFor(run, `relic:${run.seq}:${run.layer}`);
  const pool = relicPool(run, unlocked).slice();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  return out;
}
export function takeRelic(run, id) {
  if (!id || run.relics.includes(id)) return;
  run.relics.push(id);
  const r = RELICS.find((x) => x.id === id);
  if (r?.fx?.rewardReroll && !ascFx(run.asc).noReroll) run.rerolls += r.fx.rewardReroll;
  if (r?.fx?.startCredits) run.credits += r.fx.startCredits;
  run.log.push({ k: 'relic', id });
}

// ------------------------------------------------------------------ node flow

/** Enter a node (does not complete it). → node */
export function enterNode(run, id) {
  const node = available(run).find((n) => n.id === id);
  if (!node) return null;
  run.layer = node.layer; run.node = node.id;
  run.path.push(node.id);
  run.log.push({ k: 'node', id: node.id, type: node.type, act: run.act });
  return node;
}

/** Elite bonus: a relic offer with NODE_TYPES.elite.relicChance (deterministic by node). */
export const eliteRelicRoll = (run, node) => rngFor(run, `relicChance:${node.id}`)() < (NODE_TYPES.elite.relicChance ?? 0);

/** Node income in credits (fight/elite/boss), ascension multiplier. */
export function nodeCredits(run, node) {
  const r = REWARDS.credits[node.type];
  if (!r) return 0;
  const n = Math.round(rngFor(run, `credits:${node.id}`).int(r[0], r[1]) * ascFx(run.asc).credits);
  run.credits += n;
  return n;
}

/** Complete a node: memory points; boss → act end (full heal, next graph) or victory. → 'map' | 'act' | 'win' */
export function completeNode(run, node) {
  run.memory += META.memoryPerNode[node.type] || 0;
  if (node.type !== 'boss') return 'map';
  run.memory += META.memoryPerAct;
  if (run.act >= ACTS.length - 1) { endRun(run, 'win'); return 'win'; }
  run.act++; run.layer = -1; run.node = null;
  run.graph = genGraph(run.seed, run.act, run.asc);
  healParty(run, RUN.bossHeal);
  run.log.push({ k: 'act', act: run.act });
  return 'act';
}

export function endRun(run, result) {
  if (run.status === 'win' || run.status === 'loss') return;
  run.status = result;
  if (result === 'win') run.memory += META.memoryOnVictory;
  run.log.push({ k: 'end', result });
}

/** Memory earned by the run (nodes + acts + victory + dead heroes as spirits) × relic multiplier. */
export function runMemory(run) {
  const deaths = run.deaths.length * META.deathBonusPerHero;
  const mul = 1 + RELICS.filter((r) => run.relics.includes(r.id) && r.fx.memoryMul).reduce((s, r) => s + r.fx.memoryMul - 1, 0);
  return { base: run.memory, deaths, mul, total: Math.round((run.memory + deaths) * mul) };
}

// ------------------------------------------------------------------ rest, events, treasure, shop

export function restHealShare(run) {
  return Math.max(0, RUN.restHeal + ascFx(run.asc).restHeal + relicFx(run, 'restHeal'));
}
/** Rest option: 'heal' (share of HP/MRL), 'remove-status' (MRL fully), 'train' (→ pending talent offer for memberId). */
export function doRest(run, opt, memberId = null) {
  if (opt === 'heal') healParty(run, restHealShare(run));
  else if (opt === 'remove-status') for (const m of alive(run)) m.mrlLost = 0;
  else if (opt === 'train') return rewardOffer(run, 'fight', { only: 'talent', hero: memberId });
  run.log.push({ k: 'rest', opt });
  return null;
}

/** What an event node holds: { kind: 'fight', enc } (20 %) or { kind: 'event', ev }. */
export function eventFor(run, node) {
  const rng = rngFor(run, `event:${node.id}`);
  if (rng() < NODE_TYPES.event.fightChance) return { kind: 'fight', enc: rng.pick(ACTS[run.act].fight) };
  const pool = EVENT_POOL.filter((id) => EVENTS_DENSITY[id] && !(EVENT_RULES.noRepeatInRun && run.usedEvents.includes(id)));
  const id = pool.length ? rng.pick(pool) : rng.pick(EVENT_POOL);
  return { kind: 'event', ev: EVENTS_DENSITY[id] };
}

/** Best living member for a skill (by check total). → { m, info } */
export function bestFor(run, skills, only = null) {
  let best = null;
  for (const m of alive(run)) {
    if (only && !only.includes(m.id)) continue;
    const unit = buildMember(run, m, { carry: false });
    for (const sk of [].concat(skills)) {
      const info = checkInfo({ unit, name: m.name }, sk);
      const score = info.total + (info.mode === 'adv' ? 4 : info.mode === 'dis' ? -4 : 0);
      if (!best || score > best.score) best = { m, info, score, skill: sk };
    }
  }
  return best;
}
/** Deterministic d20 check of the best member. → { ok, nat, total, dc, who, skill } */
export function runCheck(run, part, skills, dc, only = null) {
  const b = bestFor(run, skills, only);
  const rng = rngFor(run, `check:${part}`);
  const r1 = rng.int(1, 20), r2 = rng.int(1, 20);
  const nat = b?.info.mode === 'adv' ? Math.max(r1, r2) : b?.info.mode === 'dis' ? Math.min(r1, r2) : r1;
  const total = nat + (b?.info.total || 0);
  return { ok: nat === 20 || (nat !== 1 && total >= dc), nat, total, dc, who: b?.m.name || '', skill: b?.skill || [].concat(skills)[0] };
}

/** Resolve an event choice. → { check?, outcome, credits, items: [[id,n]], battle?: encId } */
export function eventChoice(run, node, ev, choice) {
  if (!run.usedEvents.includes(ev.id)) run.usedEvents.push(ev.id);
  let o = choice.success, check = null;
  if (choice.check) {
    check = runCheck(run, `${node.id}:${choice.id}`, choice.check.skill, choice.check.dc);
    if (!check.ok) o = choice.fail || choice.success;
  }
  const credits = Math.round(Math.max(0, o.credits || 0) * EVENT_RULES.creditsMul);
  run.credits = Math.max(0, run.credits + (o.credits < 0 ? o.credits : credits));
  const items = [];
  for (const it of o.items || []) if (ITEMS[it.item]) { giveItem(run, it.item, it.n || 1); items.push([it.item, it.n || 1]); }
  const battle = o.battle?.encounter && D.ENCOUNTERS[o.battle.encounter] ? o.battle.encounter : null;
  run.log.push({ k: 'event', id: ev.id, choice: choice.id, ok: check ? check.ok : true });
  return { check, outcome: o, credits: o.credits < 0 ? o.credits : credits, items, battle };
}

/** Open a treasure: maybe a trap (skill check), damage on failure. → { trap, check?, dmg } */
export function openTreasure(run, node) {
  const T = NODE_TYPES.treasure;
  const rng = rngFor(run, `treasure:${node.id}`);
  if (rng() >= T.trapChance) return { trap: false, dmg: 0 };
  const dc = rng.int(T.trapDc[0], T.trapDc[1]);
  const check = runCheck(run, `trap:${node.id}`, T.skills, dc);
  let dmg = 0;
  if (!check.ok) for (const m of alive(run)) {
    const s = memberStats(run, m);
    const d = Math.round(s.maxHp * 0.15);
    m.hpLost = Math.min(s.maxHp - 1, m.hpLost + d); dmg = Math.max(dmg, d);
  }
  return { trap: true, check, dmg };
}

/** Shop shelf of a node: rows [{ id, price, sold }] from vendorStock of a seeded vendor (+ a second one to fill 7–9). */
export function shopStock(run, node) {
  const S = NODE_TYPES.shop;
  const roll = run.shopRerolls[node.id] || 0;
  const rng = rngFor(run, `shop:${node.id}:${roll}`);
  const n = rng.int(S.stock[0], S.stock[1]);
  const cap = ACTS[run.act].tier + 1;
  const mul = (RUN.shopPriceMul ?? 1) * ascFx(run.asc).shopPrice;
  const rows = [];
  const vendors = S.vendors.slice();
  for (let v = 0; v < 3 && rows.length < n && vendors.length; v++) {
    const npc = vendors.splice(Math.floor(rng() * vendors.length), 1)[0];
    const vs = vendorStock(npc, rng.int(1, 60), 'neutral');
    for (const r of vs?.rows || []) {
      const it = ITEMS[r.id];
      if (rows.length >= n || r.locked || !it || !(it.price > 0) || (it.tier || 1) > cap || rows.some((x) => x.id === r.id)) continue;
      if (!['weapon', 'armor', 'mod', 'consumable'].includes(it.cat)) continue;
      rows.push({ id: r.id, price: Math.max(1, Math.ceil(it.price * r.mult * mul)), vendor: npc });
    }
  }
  const bought = run.shopBought?.[`${node.id}:${roll}`] || [];
  return rows.map((r, i) => ({ ...r, i, sold: bought.includes(i) }));
}
export const sellPrice = (run, id) => Math.max(1, Math.floor((ITEMS[id]?.price || 0) * (RUN.shopPriceMul ?? 1) * 0.5));
/** Buy row i for a member (gear is equipped on him, consumables go to him). → true | reason */
export function buy(run, node, i, memberId) {
  const rows = shopStock(run, node);
  const r = rows[i];
  if (!r || r.sold) return 'sold';
  if (run.credits < r.price) return 'money';
  run.credits -= r.price;
  const key = `${node.id}:${run.shopRerolls[node.id] || 0}`;
  run.shopBought = run.shopBought || {};
  (run.shopBought[key] = run.shopBought[key] || []).push(i);
  const it = ITEMS[r.id];
  if (it.cat === 'consumable') giveItem(run, r.id, 1, memberId);
  else if (!equip(run, memberId, r.id)) run.bag[r.id] = (run.bag[r.id] || 0) + 1;
  run.log.push({ k: 'buy', id: r.id, price: r.price });
  return true;
}
export function sell(run, id) {
  if (!run.bag[id]) return false;
  run.bag[id]--; if (!run.bag[id]) delete run.bag[id];
  run.credits += sellPrice(run, id);
  return true;
}
export function rerollShop(run, node) {
  const free = RELICS.some((r) => run.relics.includes(r.id) && r.fx.rerollCostFree);
  const cost = free ? 0 : NODE_TYPES.shop.reroll;
  if (run.credits < cost) return false;
  run.credits -= cost;
  run.shopRerolls[node.id] = (run.shopRerolls[node.id] || 0) + 1;
  return true;
}

// ------------------------------------------------------------------ save slot «забег» (localStorage, try/catch)

const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };
export function saveRun(run) {
  try { const s = store(); if (s) s.setItem(SAVE_KEY, JSON.stringify(run)); return true; } catch { return false; }
}
export function loadRun() {
  try {
    const raw = store()?.getItem(SAVE_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw);
    return run && run.v === RUN_VERSION && run.status === 'map' && run.graph ? run : null;
  } catch { return null; }
}
export function clearRun() { try { store()?.removeItem(SAVE_KEY); } catch { /* storage off */ } }
export const hasRunSave = () => !!loadRun();
