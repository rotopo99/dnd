// Class balance L6-20 vs ENCOUNTERS_V4 (normal fights). Usage: node tools/sim/classes-v4.mjs [--n 40] [--levels 10,15,20] [--size 1|3] [--seed 1] [--only cls]
import { GAME_DATA } from '../../game/src/data/index.js';
import { CLASSES, CLASS_ORDER } from '../../game/src/data/classes/index.js';
import { ENCOUNTERS_V4 } from '../../game/src/data/enemies-v4.js';
import { ENEMIES_V3 } from '../../game/src/data/enemies-v3.js';
import { STARTER_KITS } from '../../game/src/data/items/shops.js';
import { buildCreature, isAllowed } from '../../game/src/rules/character.js';
import { simulateBattle } from '../../game/src/rules/simulate.js';
import { createRng } from '../../game/src/rules/rng.js';
const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = +opt('--n', 40), SEED = +opt('--seed', 1), SIZE = +opt('--size', 1), ONLY = opt('--only', null);
const LEVELS = opt('--levels', '10,15,20').split(',').map(Number);
const races = Object.values(GAME_DATA.RACES).filter((r) => r.playable);
for (const [k, v] of Object.entries(ENEMIES_V3)) if (!GAME_DATA.ENEMIES[k]) GAME_DATA.ENEMIES[k] = v;
const kit = (cid, path) => { const k = STARTER_KITS[`${cid}:${path}`] || STARTER_KITS[cid]; const inv = {}; for (const id of k.belt || []) if (GAME_DATA.ITEMS[id]) inv[id] = (inv[id] || 0) + 1; return { equipment: { weapon: k.weapon, armor: k.armor, offhand: null, mods: [] }, inventory: inv }; };
const normal = (e) => /^v4-.*-(patrol|host)$/.test(e.id);
const out = {};
for (const L of LEVELS) {
  const encs = Object.values(ENCOUNTERS_V4).filter((e) => normal(e) && e.level >= L - 2 && e.level <= L + 0);
  const encsL = encs.length ? encs : Object.values(ENCOUNTERS_V4).filter((e) => normal(e)).sort((a, b) => Math.abs(a.level - L) - Math.abs(b.level - L)).slice(0, 3);
  for (const cid of CLASS_ORDER) { if (ONLY && cid !== ONLY) continue;
    const cls = CLASSES[cid]; let w = 0, t = 0, rounds = 0; const hpFrac = [];
    for (const p of cls.paths) {
      const rng = createRng(SEED * 31 + L);
      for (const enc of encsL) for (let i = 0; i < N; i++) {
        const mk = (pp) => { const ok = races.filter((r) => isAllowed(r, cls)); const k = kit(cid, pp.id); return buildCreature({ race: rng.pick(ok).id, cls: cid, level: L, path: pp.id, data: GAME_DATA, equipment: k.equipment, inventory: k.inventory }); };
        const heroes = [mk(p)]; for (let j = 1; j < SIZE; j++) heroes.push(mk(rng.pick(cls.paths)));
        const k = Math.max(1, Math.ceil(enc.enemies.length * SIZE / 4));
        const r = simulateBattle({ heroes, enemies: enc.enemies.slice(0, k), data: GAME_DATA, seed: rng.int(1, 1e9), maxRounds: 30 });
        t++; rounds += r.rounds; if (r.winner === 'heroes') w++;
      }
    }
    (out[cid] ||= {})[L] = { rate: w / t, rounds: rounds / t };
  }
}
console.log(`size ${SIZE} n/path/enc ${N}`); console.log('class'.padEnd(12) + LEVELS.map((l) => ('L' + l).padStart(12)).join(''));
for (const cid of Object.keys(out)) console.log(cid.padEnd(12) + LEVELS.map((l) => `${(100 * out[cid][l].rate).toFixed(0)}% r${out[cid][l].rounds.toFixed(1)}`.padStart(12)).join(''));
