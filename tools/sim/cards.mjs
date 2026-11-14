// Card game balance sim: AI vs AI. Usage: node tools/sim/cards.mjs [games=500] [--parts]
import * as CD from '../../game/src/data/cards.js';
import * as CE from '../../game/src/rules/cards.js';
const DATA = { CARDS: CD.CARDS, CARD_RULES: CD.CARD_RULES, CARD_HEROES: CD.CARD_HEROES };
const N = +process.argv[2] || 500;
const PARTS = process.argv.includes('--parts');
const PA = { aggro: 0.5, risk: 0.5 };
const lcg = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const RAR = { 1: ['common'], 2: ['common'], 3: ['common', 'rare'], 4: ['common', 'rare'], 5: ['common', 'rare', 'epic'] };
function avgDeck(tier, rnd) {
  const pool = CD.CARD_IDS.filter((id) => RAR[tier].includes(CD.CARDS[id].rarity));
  // player swaps 6 random starter cards for 6 random loot cards of the tier's rarity (<= 2 copies)
  const d = [...CD.STARTER_DECK];
  for (let k = 0; k < 6; k++) {
    for (let t = 0; t < 50; t++) {
      const id = pool[Math.floor(rnd() * pool.length)];
      if (d.filter((x) => x === id).length >= 2) continue;
      d.splice(Math.floor(rnd() * d.length), 1, id); break;
    }
  }
  return d;
}
const part = {}; // id -> {in, win}
function run(r, mode) {
  let w = 0, turns = 0; const rnd = lcg(7 + r.tier);
  for (let i = 0; i < N; i++) {
    const deck = mode === 'avg' ? avgDeck(r.tier, rnd) : CD.STARTER_DECK;
    const M = CE.createMatch(DATA, { seed: i + 1, sides: [{ name: 'p', hero: 'h-wanderer', deck, ai: PA, tier: 3 }, { hero: r.hero, deck: r.deck, ai: r.ai, tier: r.tier }] });
    const used = new Set(); // ids of rival cards seen
    const res = CE.autoPlay(M);
    turns += res.turns;
    const win = res.winner === 1; if (win) w++;
    if (PARTS) for (const id of new Set(r.deck)) { const p = part[id] ||= { n: 0, win: 0, base: 0 }; p.n++; if (win) p.win++; }
  }
  return { win: (100 * w) / N, turns: turns / N / 2 };
}
const goal = { 1: [25, 40, 'starter'], 2: [40, 55, 'avg'], 3: [40, 55, 'avg'], 4: [55, 70, 'avg'], 5: [55, 70, 'avg'] };
console.log('npc'.padEnd(17), 'tier', 'vsStarter', 'vsAvg', 'rounds', 'target');
let bad = 0;
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
for (const r of CD.CARD_RIVALS) {
  if (ONLY && r.npc !== ONLY) continue;
  const a = run(r, 'starter'), b = run(r, 'avg');
  const [lo, hi, m] = goal[r.tier]; const v = m === 'starter' ? a.win : b.win;
  const ok = v >= lo && v <= hi; if (!ok) bad++;
  console.log(r.npc.padEnd(17), String(r.tier).padStart(4), a.win.toFixed(1).padStart(9), b.win.toFixed(1).padStart(5), a.turns.toFixed(1).padStart(6), `${lo}-${hi}(${m})`, ok ? 'OK' : 'MISS');
}
console.log('misses', bad);
