// Per-card strength: random legal 20-card decks (all sets) vs each other; win rate with card in deck minus 50%. Usage: node tools/sim/cards-solo.mjs [games=6000]
import * as CD from '../../game/src/data/cards.js';
import * as CE from '../../game/src/rules/cards.js';
const DATA = { CARDS: CD.CARDS, CARD_RULES: CD.CARD_RULES, CARD_HEROES: CD.CARD_HEROES };
const N = +process.argv[2] || 6000;
let s = 12345; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const pool = CD.CARD_IDS;
const rd = () => { const d = []; while (d.length < 20) { const id = pool[Math.floor(rnd() * pool.length)]; const mx = CD.CARDS[id].rarity === 'legendary' ? 1 : 2; if (d.filter((x) => x === id).length < mx) d.push(id); } return d; };
const st = {}; const P = { aggro: 0.5, risk: 0.5 };
for (let i = 0; i < N; i++) {
  const a = rd(), b = rd();
  const M = CE.createMatch(DATA, { seed: i + 1, sides: [{ hero: 'h-wanderer', deck: a, ai: P, tier: 3 }, { hero: 'h-wanderer', deck: b, ai: P, tier: 3 }] });
  const w = CE.autoPlay(M).winner; if (w === null) continue;
  [[a, w === 0], [b, w === 1]].forEach(([d, win]) => { for (const id of new Set(d)) { const t = st[id] ||= { n: 0, w: 0 }; t.n++; if (win) t.w++; } });
}
const rows = Object.entries(st).map(([id, t]) => ({ id, rar: CD.CARDS[id].rarity, cost: CD.CARDS[id].cost, n: t.n, wr: (100 * t.w) / t.n })).sort((x, y) => y.wr - x.wr);
const show = (r) => console.log(r.id.padEnd(16), r.rar.padEnd(9), 'c' + r.cost, 'n=' + r.n, r.wr.toFixed(1) + '%');
console.log('TOP 10'); rows.slice(0, 10).forEach(show); console.log('BOTTOM 5'); rows.slice(-5).forEach(show);
