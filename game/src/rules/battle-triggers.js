// Battle triggers (level-design.md §7.2): data-only scripts of a battle map def — `triggers: [{id, when, do}]`, each
// fires once. Pure rules (Node); coop-safe — they run inside the deterministic engine on the host.
//  when: {event: 'round', round: N}                       — from round N
//        {event: 'enter', rect: [x, y, w, h], team?, min?} — >= min (1) standing units (of `team`) inside the rect
//        {event: 'hp', unit: 'boss' | enemy id, below: 0.5} — such a unit alive at <= below of max HP
//        {event: 'down', team?}                           — a party member (kind 'hero') of `team` is down or dead (not removed)
//  do:   {op: 'collapse', at: [x, y]} — the bridge holding that cell falls (terrain.js collapseBridge: falls, swim out)
//        {op: 'log', text}            — a line in the battle log
//        {op: 'revive', pct}          — the first down / dead party member (kind 'hero') is back with ⌈pct × max HP⌉
//        {op: 'volley', dice, team, radius?, dmgType?} — area damage: the densest cluster of `team` (Chebyshev radius, 1)
// Extra triggers may come from the battle options (createBattle `triggers`, content-wave4.md mq4-eve waves); a trigger's
// `flag` is not read here — the world reads fired triggers after the battle (scenes/world-battle.js).
// Events are only noted while emitted (triggerEvent); ops run at safe points (runTriggers: end of perform, round start).
//   initTriggers(b) · triggerEvent(b, ev) · runTriggers(b, emit)
import { bridgeAt, collapseBridge } from './terrain.js';

const WATCH = new Set(['roundStart', 'move', 'push', 'damage', 'teleport', 'summon', 'geoCollapse']);

/** b.triggers from b.map.triggers + extra (valid ones), null when none. */
export function initTriggers(b, extra = null) {
  const list = [...(b.map && b.map.triggers || []), ...(extra || [])].filter((t) => t && t.when && Array.isArray(t.do));
  b.triggers = list.length ? list.map((t) => ({ ...t, fired: false })) : null;
  b.trigCheck = !!b.triggers;
}

/** Note an event that may satisfy a condition (called from combat.js emit). */
export function triggerEvent(b, ev) {
  if (b.triggers && WATCH.has(ev.type)) b.trigCheck = true;
}

const standing = (u) => u && !u.dead && !u.removed && !u.down && u.x >= 0;
const fallen = (u, team) => u && u.kind === 'hero' && !u.removed && (u.down || u.dead) && (!team || u.team === team);

function holds(b, w) {
  if (w.event === 'round') return b.round >= (w.round || 1);
  if (w.event === 'enter' && Array.isArray(w.rect)) {
    const [x, y, ww, hh] = w.rect;
    let n = 0;
    for (const u of b.units) if (standing(u) && (!w.team || u.team === w.team) && u.x >= x && u.y >= y && u.x < x + ww && u.y < y + hh) n++;
    return n >= (w.min || 1);
  }
  if (w.event === 'down') return b.units.some((u) => fallen(u, w.team));
  if (w.event === 'hp') {
    return b.units.some((u) => standing(u) && (w.unit === 'boss' ? u.boss : String(u.enemyId || '').split('^')[0] === w.unit || u.id === w.unit)
      && u.maxHp > 0 && u.hp <= u.maxHp * (w.below ?? 0.5));
  }
  return false;
}

/** Fire every trigger whose condition holds now (each once). emit — combat.js emit. */
export function runTriggers(b, emit) {
  if (!b.triggers || !b.trigCheck || b.trigBusy || b.winner) return;
  b.trigBusy = true;
  try {
    for (let pass = 0; pass < 4 && b.trigCheck; pass++) {
      b.trigCheck = false;
      for (const tr of b.triggers) {
        if (tr.fired || !holds(b, tr.when)) continue;
        tr.fired = true;
        emit(b, { type: 'trigger', id: tr.id || null });
        for (const op of tr.do) runOp(b, op, emit);
      }
    }
  } finally { b.trigBusy = false; }
}

function runOp(b, op, emit) {
  if (op.op === 'collapse' && Array.isArray(op.at)) {
    const br = bridgeAt(b, op.at[0], op.at[1]);
    if (br) collapseBridge(b, br, null);
  } else if (op.op === 'log' && op.text) emit(b, { type: 'triggerLog', text: String(op.text) });
  else if (op.op === 'revive' && b.trigFx) {
    const u = b.units.find((x) => fallen(x, op.team));
    if (!u) return;
    const hp = Math.max(1, Math.ceil(u.maxHp * (op.pct || 0.25)));
    if (u.dead) { b.trigFx.reviveUnit(b, { id: null }, u); if (!u.dead) u.hp = Math.min(u.maxHp, hp); }
    else b.trigFx.healUnit(b, null, u, hp);
  } else if (op.op === 'volley' && b.trigFx && op.dice) {
    const r = op.radius ?? 1;
    const foes = b.units.filter((u) => standing(u) && (!op.team || u.team === op.team));
    const near = (c, u) => Math.max(Math.abs(c.x - u.x), Math.abs(c.y - u.y)) <= r;
    let best = null, bestN = 0;
    for (const c of foes) { const n = foes.filter((u) => near(c, u)).length; if (n > bestN) { best = c; bestN = n; } }
    if (!best) return;
    const dmg = b.trigFx.rollDice(b.rng, op.dice);
    emit(b, { type: 'triggerLog', text: String(op.text || ''), at: { x: best.x, y: best.y } });
    for (const u of foes.filter((x) => near(best, x))) b.trigFx.dealDamage(b, null, u, dmg, op.dmgType || 'fire');
  }
}
