// Roguelike «Забег» simulator (docs/specs/roguelike.md §10): a greedy bot plays whole runs, battles are AI vs AI.
// Usage: node tools/sim/run.mjs [--n 200] [--asc 0] [--party t-zabivnoy,t-ranger,t-ecolog] [--seed0 1] [--v]
// Reports winrate, act clear rates, deaths, HP loss per fight type. Target A0: 15–25 % wins.
import * as R from '../../game/src/world/run.js';
import { ACTS, BALANCE } from '../../game/src/data/roguelike.js';
import { GAME_DATA, ITEMS } from '../../game/src/data/index.js';
import { createBattle } from '../../game/src/rules/combat.js';
import { buildEnemy } from '../../game/src/rules/character.js';
import { playTurn } from '../../game/src/rules/ai.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = Number(opt('--n', 200));
const ASC = Number(opt('--asc', 0));
const SEED0 = Number(opt('--seed0', 1));
const PARTY = opt('--party', 't-zabivnoy,t-ranger,t-ecolog').split(',');
const V = args.includes('--v');

/** Headless battle of a node setup; every unit is AI. → { won, units, rounds } */
export function simFight(run, setup, maxRounds = 30) {
  const heroes = R.partyUnits(run);
  let enemies = setup.enemies;
  if (setup.enemyInit) enemies = enemies.map((e, i) => { const u = buildEnemy(e, { data: GAME_DATA, id: `e${i + 1}` }); u.initBonus += setup.enemyInit; return u; });
  const b = createBattle({ map: setup.map, heroes, enemies, data: GAME_DATA, seed: setup.seed, objectives: setup.objectives });
  for (const u of b.units) u.control = 'ai';
  let guard = 0;
  const maxSteps = maxRounds * (b.units.length + 8) * 4;
  while (!b.winner && b.turn && b.round <= maxRounds && guard++ < maxSteps) playTurn(b);
  return { won: b.winner === 'heroes', units: b.units, rounds: b.round };
}

const hpShare = (run) => {
  const al = R.alive(run);
  if (!al.length) return 0;
  return al.reduce((s, m) => { const st = R.memberStats(run, m); return s + st.hp / st.maxHp; }, 0) / al.length;
};

/** Bot: prefers rest/shop when hurt, elites when healthy, fights otherwise. */
function chooseNode(run, nodes) {
  const hp = hpShare(run);
  const score = (n) => {
    const t = n.type;
    if (t === 'boss') return 100;
    if (t === 'rest') return hp < 0.6 ? 50 : 8;
    if (t === 'shop') return run.credits >= 40 ? 30 : 6;
    if (t === 'elite') return hp > 0.75 ? 22 : -10;
    if (t === 'treasure') return 25;
    if (t === 'event') return 14;
    return hp > 0.5 ? 18 : 10;
  };
  return nodes.slice().sort((a, b) => score(b) - score(a))[0];
}

const cardScore = (run, c) => {
  if (c.kind === 'talent') return 30;
  if (c.kind === 'item' || c.kind === 'mod') { const it = ITEMS[c.id]; return (it.cat === 'consumable' ? 12 : 20) + (it.tier || 1) * 4 + (c.rarity === 'epic' ? 6 : 0); }
  if (c.kind === 'credits') return 10 + c.credits / 5;
  return 2;
};
function takeBest(run, offer) {
  if (!offer.cards.length) return R.skipReward(run);
  const best = offer.cards.slice().sort((a, b) => cardScore(run, b) - cardScore(run, a))[0];
  if (cardScore(run, best) < 14 && run.rerolls > 0) { const o2 = R.rerollReward(run, offer); if (o2) return takeBest(run, o2); }
  R.takeReward(run, offer, best);
}

function shop(run, node) {
  const al = R.alive(run);
  for (let pass = 0; pass < 3; pass++) {
    const rows = R.shopStock(run, node).filter((r) => !r.sold && r.price <= run.credits);
    const pick = rows.find((r) => ITEMS[r.id].kind === 'medicine') || rows.find((r) => ITEMS[r.id].cat === 'armor') || rows[0];
    if (!pick) break;
    const m = al[pass % al.length];
    R.buy(run, node, pick.i, m.id);
  }
}

export function simRun(seed, asc = ASC, party = PARTY) {
  const run = R.newRun({ seed: `S${seed}`, asc, party: party.map((tpl) => ({ tpl })) });
  const st = { fights: { fight: [], elite: [], boss: [] }, actsCleared: 0, nodes: 0 };
  for (const p of run.pending.splice(0)) if (p.kind === 'talent') takeBest(run, R.rewardOffer(run, 'fight', { only: 'talent' }));
  const fight = (node, encId, kind) => {
    const before = hpShare(run);
    const setup = R.fightSetup(run, node, encId);
    const res = simFight(run, setup);
    R.applyFight(run, node, res.units, res.won);
    if (res.won) st.fights[kind]?.push(before - hpShare(run));
    return res.won;
  };
  for (let guard = 0; guard < 200 && run.status === 'map'; guard++) {
    const nodes = R.available(run);
    if (!nodes.length) break;
    const node = R.enterNode(run, chooseNode(run, nodes).id);
    st.nodes++;
    const t = node.type;
    if (t === 'fight' || t === 'elite' || t === 'boss') {
      if (!fight(node, node.enc, t)) break;
      R.nodeCredits(run, node);
      takeBest(run, R.rewardOffer(run, t));
      if (t === 'elite' && R.eliteRelicRoll(run, node)) R.takeRelic(run, R.relicOffer(run, 1)[0]);
      if (t === 'boss') R.takeRelic(run, R.relicOffer(run, 3)[0]);
    } else if (t === 'event') {
      const e = R.eventFor(run, node);
      if (e.kind === 'fight') { if (!fight(node, e.enc, 'fight')) break; takeBest(run, R.rewardOffer(run, 'fight')); }
      else {
        const ch = e.ev.choices.find((c) => !c.check) || e.ev.choices[0];
        const r = R.eventChoice(run, node, e.ev, ch);
        if (r.battle && !fight(node, r.battle, 'fight')) break;
      }
    } else if (t === 'rest') {
      if (hpShare(run) < 0.85) R.doRest(run, 'heal');
      else takeBest(run, R.doRest(run, 'train', R.alive(run)[0].id));
    } else if (t === 'shop') shop(run, node);
    else if (t === 'treasure') { R.openTreasure(run, node); takeBest(run, R.rewardOffer(run, 'treasure')); }
    if (run.status !== 'map') break;
    const r = R.completeNode(run, node);
    if (r === 'act' || r === 'win') st.actsCleared++;
  }
  return { run, st };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  let wins = 0; const acts = [0, 0, 0]; let deaths = 0; let mem = 0;
  const loss = { fight: [], elite: [], boss: [] };
  const deathAt = {};
  for (let i = 0; i < N; i++) {
    const { run, st } = simRun(SEED0 + i);
    if (run.status === 'win') wins++;
    for (let a = 0; a < st.actsCleared; a++) acts[a]++;
    deaths += run.deaths.length;
    for (const d of run.deaths) { const k = `a${d.act + 1}`; deathAt[k] = (deathAt[k] || 0) + 1; }
    mem += R.runMemory(run).total;
    for (const k in loss) loss[k].push(...st.fights[k]);
    if (V) console.log(`#${i} ${run.status} act ${run.act + 1} layer ${run.layer} deaths ${run.deaths.length} relics ${run.relics.length} cr ${run.credits}`);
  }
  const pc = (x) => `${(100 * x).toFixed(1)}%`;
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  console.log(`runs ${N}, asc ${ASC}, party ${PARTY.join('+')}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`winrate ${pc(wins / N)} (target A0 ${BALANCE.winrate.a0.map(pc).join('–')})`);
  console.log(`act clear: ${ACTS.map((a, i) => `${a.id} ${pc(acts[i] / N)}`).join(', ')} (target ${Object.values(BALANCE.actClearRate).map(pc).join(', ')})`);
  console.log(`HP loss per hero (won fights): fight ${pc(avg(loss.fight))}, elite ${pc(avg(loss.elite))}, boss ${pc(avg(loss.boss))}`);
  console.log(`deaths/run ${(deaths / N).toFixed(2)} by act ${JSON.stringify(deathAt)}, memory/run ${(mem / N).toFixed(1)}`);
}
