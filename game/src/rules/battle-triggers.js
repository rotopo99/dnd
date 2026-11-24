// Battle triggers (level-design.md §7.2): data-only scripts of a battle map def — `triggers: [{id, when, do}]`, each
// fires once. Pure rules (Node); coop-safe — they run inside the deterministic engine on the host.
//  when: {event: 'round', round: N}                       — from round N
//        {event: 'enter', rect: [x, y, w, h], team?, min?} — >= min (1) standing units (of `team`) inside the rect
//        {event: 'hp', unit: 'boss' | enemy id, below: 0.5} — such a unit alive at <= below of max HP
//        {event: 'down', team?}                           — a party member (kind 'hero') of `team` is down or dead (not removed)
//        {event: 'gone', tag}                             — units of a trigger tag (spawn / prop) existed and none stands now
//  do:   {op: 'collapse', at: [x, y]} — the bridge holding that cell falls (terrain.js collapseBridge: falls, swim out)
//        {op: 'log', text}            — a line in the battle log
//        {op: 'revive', pct}          — the first down / dead party member (kind 'hero') is back with ⌈pct × max HP⌉
//        {op: 'volley', dice, team, radius?, dmgType?} — area damage: the densest cluster of `team` (Chebyshev radius, 1)
//  balance-finale.md boss phases (`unit` — 'boss' | enemy id, the first standing match):
//        {op: 'log', text, unit?, bark?}                 — + a bark bubble over the unit (event triggerLog {actor, bark, phase})
//        {op: 'spawn', unit: enemyId, count, team?, near?, tag?, onKill?: {dice, resource}} — real units (count for victory)
//             next to `near`; `tag` is read by aura whileAlive / when gone; onKill — the killer gets dice of hp / mrl
//        {op: 'surface', kind, cells, band: [x0, x1], turns?} — `cells` tiles of the middle band of the map width
//        {op: 'aura', id, unit, reduce?, dmgMul?, kbPer?, kbMax?, whileAlive?: tag, whileDown?: team} — combat.js reads it:
//             incoming damage × (1 − reduce), outgoing × dmgMul, KB + kbPer × alive tagged (≤ kbMax)
//        {op: 'unaura', id, unit} · {op: 'shield', unit, value | perLevel, turns?} · {op: 'unshield', unit}
//        {op: 'status', unit, id, turns} · {op: 'ability', unit, id, dcAdd?, usesAdd?, ratio?} (patches a copy)
//        {op: 'cast', unit, ability, team?}            — a free cast at the densest cluster of `team` (heroes)
//        {op: 'prop', unit: enemyId, tag, near?, onBreak: [ops]} — a target object (no turn, not needed for victory);
//             broken (tag gone) — onBreak runs as a new trigger
// Extra triggers may come from the battle options (createBattle `triggers`, content-wave4.md mq4-eve waves); a trigger's
// `flag` is not read here — the world reads fired triggers after the battle (scenes/world-battle.js).
// Events are only noted while emitted (triggerEvent); ops run at safe points (runTriggers: end of perform, round start).
//   initTriggers(b) · triggerEvent(b, ev) · runTriggers(b, emit) · auraDmgMul(b, src, tgt) · auraKb(b, u) · auraOn(b, a) · unitAuras(b, u)
import { bridgeAt, collapseBridge } from './terrain.js';

const WATCH = new Set(['roundStart', 'move', 'push', 'damage', 'teleport', 'summon', 'geoCollapse', 'death', 'down']);

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
  if (w.event === 'hp') return b.units.some((u) => standing(u) && isUnit(u, w.unit) && u.maxHp > 0 && u.hp <= u.maxHp * (w.below ?? 0.5));
  if (w.event === 'gone') return b.units.some((u) => u.trigTag === w.tag) && !tagged(b, w.tag);
  return false;
}

const isUnit = (u, sel) => (sel === 'boss' ? !!u.boss : String(u.enemyId || '').split('^')[0] === sel || u.id === sel);
const unitOf = (b, sel) => b.units.find((u) => standing(u) && isUnit(u, sel || 'boss')) || null;
/** Standing units of a trigger tag. */
export const tagged = (b, tag) => b.units.filter((u) => u.trigTag === tag && standing(u)).length;

/** An aura of a unit works now (its whileAlive tag stands / whileDown team has a fallen unit). */
export function auraOn(b, a) {
  if (a.whileAlive && !tagged(b, a.whileAlive)) return false;
  if (a.whileDown && !b.units.some((u) => fallen(u, a.whileDown))) return false;
  return true;
}
/** Active auras of a unit as icon entries { id: 'aura:<id>', aura } (ui/battle-view.js, unit-pin.js). */
export const unitAuras = (b, u) => (u.auras || []).filter((a) => auraOn(b, a)).map((a) => ({ id: `aura:${a.id}`, aura: a.id }));

/** Damage factor of trigger auras (combat.js dealDamage): the target's reduce, the source's dmgMul. */
export function auraDmgMul(b, src, tgt) {
  let k = 1;
  for (const a of tgt.auras || []) if (a.reduce && auraOn(b, a)) k *= 1 - a.reduce;
  if (src && src !== tgt) for (const a of src.auras || []) if (a.dmgMul && auraOn(b, a)) k *= a.dmgMul;
  return k;
}
/** KB of trigger auras (combat.js getKb): kbPer for every standing unit of whileAlive, up to kbMax. */
export function auraKb(b, u) {
  let kb = 0;
  for (const a of u.auras || []) if (a.kbPer) kb += Math.min(a.kbMax ?? 99, a.kbPer * (a.whileAlive ? tagged(b, a.whileAlive) : 1));
  return kb;
}

/** The densest cluster of standing `team` units within Chebyshev radius r → { at, units } | null. */
function cluster(b, team, r) {
  const foes = b.units.filter((u) => standing(u) && !u.prop && (!team || u.team === team));
  const near = (c, u) => Math.max(Math.abs(c.x - u.x), Math.abs(c.y - u.y)) <= r;
  let best = null, bestN = 0;
  for (const c of foes) { const n = foes.filter((u) => near(c, u)).length; if (n > bestN) { best = c; bestN = n; } }
  return best ? { at: best, units: foes.filter((x) => near(best, x)) } : null;
}

/** Cells of the middle band of the map width (columns x0..x1 as shares), passable, spread evenly. */
function bandCells(b, band, n) {
  const { w, h } = b.grid;
  const x0 = Math.floor(w * (band?.[0] ?? 0.35)), x1 = Math.ceil(w * (band?.[1] ?? 0.65));
  const out = [];
  for (let y = 1; y < h - 1; y++) for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x++) if (b.trigFx.passable(b, x, y)) out.push({ x, y });
  return out.length <= n ? out : Array.from({ length: n }, (_, i) => out[Math.floor(((i + 0.5) * out.length) / n)]);
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
  const fx = b.trigFx;
  if (PHASE_OPS[op.op]) { if (fx) PHASE_OPS[op.op](b, op, emit, fx); return; }
  if (op.op === 'collapse' && Array.isArray(op.at)) {
    const br = bridgeAt(b, op.at[0], op.at[1]);
    if (br) collapseBridge(b, br, null);
  } else if (op.op === 'log' && op.text) {
    const u = op.unit ? unitOf(b, op.unit) : null;
    emit(b, { type: 'triggerLog', text: String(op.text), ...(u ? { actor: u.id, phase: true } : {}), ...(op.bark ? { bark: String(op.bark) } : {}) });
  }
  else if (op.op === 'revive' && b.trigFx) {
    const u = b.units.find((x) => fallen(x, op.team));
    if (!u) return;
    const hp = Math.max(1, Math.ceil(u.maxHp * (op.pct || 0.25)));
    if (u.dead) { b.trigFx.reviveUnit(b, { id: null }, u); if (!u.dead) u.hp = Math.min(u.maxHp, hp); }
    else b.trigFx.healUnit(b, null, u, hp);
  } else if (op.op === 'volley' && b.trigFx && op.dice) {
    const c = cluster(b, op.team, op.radius ?? 1);
    if (!c) return;
    const dmg = b.trigFx.rollDice(b.rng, op.dice);
    emit(b, { type: 'triggerLog', text: String(op.text || ''), at: { x: c.at.x, y: c.at.y } });
    for (const u of c.units) b.trigFx.dealDamage(b, null, u, dmg, op.dmgType || 'fire');
  }
}

// balance-finale.md: boss phase ops (all through b.trigFx — combat.js functions, no import cycle)
const withUnit = (f) => (b, op, emit, fx) => { const u = unitOf(b, op.unit); if (u) f(b, op, emit, fx, u); };
const patchAbility = (u, id, f) => { u.abilities = u.abilities.map((a) => (a.id === id ? f(a) : a)); };
const PHASE_OPS = {
  spawn(b, op, emit, fx) {
    const near = unitOf(b, op.near || 'boss') || b.units.find((u) => standing(u) && u.team === (op.team || 'enemies'));
    if (!near) return;
    for (let i = 0; i < (op.count ?? 1); i++) {
      const s = fx.spawnUnit(b, near, op.unit, op.team || 'enemies');
      if (!s) break;
      if (op.tag) s.trigTag = op.tag;
      if (op.onKill) s.onKill = op.onKill;
    }
  },
  prop(b, op, emit, fx) {
    const near = unitOf(b, op.near || 'boss');
    if (!near) return;
    const s = fx.spawnUnit(b, near, op.unit, op.team || 'enemies', { prop: true });
    if (!s) return;
    s.prop = true; s.trigTag = op.tag || op.unit;
    if (op.onBreak?.length) b.triggers.push({ id: `${s.trigTag}-break`, when: { event: 'gone', tag: s.trigTag }, do: op.onBreak, fired: false });
  },
  surface(b, op, emit, fx) {
    const cells = bandCells(b, op.band, op.cells ?? 8);
    if (cells.length) fx.createSurface(b, op.kind || 'fire', cells, null, { turns: op.turns ?? 99 });
  },
  aura: withUnit((b, op, emit, fx, u) => {
    const { op: _, unit, ...a } = op;
    u.auras = [...(u.auras || []).filter((x) => x.id !== a.id), a];
    emit(b, { type: 'aura', target: u.id, id: a.id, on: true });
  }),
  unaura: withUnit((b, op, emit, fx, u) => {
    if (!(u.auras || []).some((x) => x.id === op.id)) return;
    u.auras = u.auras.filter((x) => x.id !== op.id);
    emit(b, { type: 'aura', target: u.id, id: op.id, on: false });
  }),
  shield: withUnit((b, op, emit, fx, u) => fx.addShield(b, u, u, op.value ?? Math.round((u.level || 1) * (op.perLevel || 1)), op.turns ?? null)),
  unshield: withUnit((b, op, emit, fx, u) => { if (u.shield) { u.shield = null; emit(b, { type: 'shieldBreak', target: u.id }); } }),
  status: withUnit((b, op, emit, fx, u) => fx.applyStatus(b, u, op.id, op.turns ?? 1, null)),
  ability: withUnit((b, op, emit, fx, u) => patchAbility(u, op.id, (a) => ({
    ...a,
    ...(op.dcAdd ? { dc: fx.getDc(b, u, a) + op.dcAdd } : {}),
    ...(op.usesAdd && a.usesPerBattle != null ? { usesPerBattle: a.usesPerBattle + op.usesAdd } : {}),
    ...(op.ratio != null ? { effects: (a.effects || []).map((e) => (e.op === 'drain' ? { ...e, ratio: op.ratio } : e)) } : {}),
  }))),
  cast: withUnit((b, op, emit, fx, u) => {
    const a = (u.abilities || []).find((x) => x.id === op.ability);
    if (!a) return;
    const c = cluster(b, op.team || 'heroes', a.area?.size ?? 1);
    if (c) fx.castFree(b, u, a, a.target === 'tile' || a.area ? { x: c.at.x, y: c.at.y } : { unit: c.at.id });
  }),
};
