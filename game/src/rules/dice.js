// Dice: parse and roll expressions like '2d6+3', 'd20', '1d8+1d4-1', '5'.
// Parsed expressions are cached; rolling does not allocate (except rollDiceDetail).

const cache = new Map();

/**
 * parseDice('2d6+3') -> { terms: [{ n: 2, sides: 6, sign: 1 }], bonus: 3, text }
 * Numbers are accepted too (flat value).
 */
export function parseDice(expr) {
  if (expr == null || expr === '') return EMPTY;
  if (typeof expr === 'number') return { terms: [], bonus: Math.trunc(expr), text: String(expr) };
  if (typeof expr === 'object') return expr; // already parsed
  let p = cache.get(expr);
  if (p) return p;
  const s = String(expr).replace(/\s+/g, '').toLowerCase();
  const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gy;
  const terms = [];
  let bonus = 0;
  let m;
  let pos = 0;
  while (pos < s.length && (m = re.exec(s))) {
    if (m.index !== pos) break;
    pos = re.lastIndex;
    if (m[3] !== undefined) {
      terms.push({ n: m[2] === '' ? 1 : Number(m[2]), sides: Number(m[3]), sign: m[1] === '-' ? -1 : 1 });
    } else {
      bonus += (m[4] === '-' ? -1 : 1) * Number(m[5]);
    }
  }
  if (pos !== s.length) throw new Error(`Bad dice expression: "${expr}"`);
  p = { terms, bonus, text: s };
  cache.set(expr, p);
  return p;
}
const EMPTY = { terms: [], bonus: 0, text: '0' };

/** Roll a dice expression. crit=true doubles the number of dice (not the flat bonus). */
export function rollDice(rng, expr, crit = false) {
  const p = parseDice(expr);
  let total = p.bonus;
  for (let i = 0; i < p.terms.length; i++) {
    const t = p.terms[i];
    const n = crit ? t.n * 2 : t.n;
    let sum = 0;
    for (let k = 0; k < n; k++) sum += 1 + Math.floor(rng() * t.sides);
    total += t.sign * sum;
  }
  return total;
}

/** Same as rollDice but returns { total, rolls } for the log. */
export function rollDiceDetail(rng, expr, crit = false) {
  const p = parseDice(expr);
  const rolls = [];
  let total = p.bonus;
  for (const t of p.terms) {
    const n = crit ? t.n * 2 : t.n;
    for (let k = 0; k < n; k++) {
      const r = 1 + Math.floor(rng() * t.sides);
      rolls.push(t.sign * r);
      total += t.sign * r;
    }
  }
  return { total, rolls };
}

/** Expected value of an expression (for AI). */
export function avgDice(expr, crit = false) {
  const p = parseDice(expr);
  let total = p.bonus;
  for (const t of p.terms) total += t.sign * (crit ? 2 : 1) * t.n * (t.sides + 1) / 2;
  return total;
}

/** Number of dice in an expression (for "one extra die" effects). */
export function firstDie(expr) {
  const p = parseDice(expr);
  return p.terms.length ? `1d${p.terms[0].sides}` : null;
}

/**
 * d20 roll with advantage / disadvantage. Both present -> they cancel (canon).
 * Returns { natural, rolls: [a] | [a, b], mode: 'normal' | 'adv' | 'dis' }.
 */
export function d20(rng, opts) {
  const adv = !!(opts && opts.adv);
  const dis = !!(opts && opts.dis);
  const a = 1 + Math.floor(rng() * 20);
  if (adv === dis) return { natural: a, rolls: [a], mode: 'normal' };
  const b = 1 + Math.floor(rng() * 20);
  return {
    natural: adv ? Math.max(a, b) : Math.min(a, b),
    rolls: [a, b],
    mode: adv ? 'adv' : 'dis',
  };
}

/** Probability that d20 >= need (need clamped to 2..20 => nat1 misses, nat20 hits). */
export function chanceD20(need, mode = 'normal') {
  const n = Math.min(20, Math.max(2, need));
  const p = (21 - n) / 20;
  if (mode === 'adv') return 1 - (1 - p) * (1 - p);
  if (mode === 'dis') return p * p;
  return p;
}
