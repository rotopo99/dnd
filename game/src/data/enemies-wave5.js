// Content wave 5 battles (docs/specs/content-wave5.md §4). Existing enemy types lifted to the quest level (enemies-v4.js
// lift / V / N) — their models stay (scavengers enemy_brute, pirates, cultists, drones, tekhonki). Numbers — balance-tester.
import { lift, V, N } from './enemies-v4.js';
import { ENEMIES_V3 } from './enemies-v3.js';

const enc = (id, name, level, faction, places, enemies, extra = {}) => ({ id, name, level, faction, places, enemies, ...extra });

// w5 variant of an existing type: own id (so rank / hp / damage can differ from the shared lift). hpK scales HP, dmgK scales weapon and
// ability damage dice (fights of 6-9 rounds: less HP, more damage), hit adds to the weapon attack.
const scaleD = (e, k) => { const m = /^(\d+)d(\d+)(.*)$/.exec(e || ''); return m ? `${Math.max(1, Math.round(m[1] * k))}d${m[2]}${m[3]}` : e; };
const W = (base, L, tag, rank, hpK = 1, dmgK = 1, hit = 0) => {
  const id = `w5-${tag}-l${L}`; if (ENEMIES_V3[id]) return id;
  lift(base, L, { id, rank, hpK }); const d = ENEMIES_V3[id];
  if (d.weapon) d.weapon = { ...d.weapon, dice: scaleD(d.weapon.dice, dmgK), hit: (d.weapon.hit || 0) + hit };
  d.abilities = (d.abilities || []).map((a) => ({ ...a, effects: (a.effects || []).map((ef) => (ef.op === 'damage' && ef.dice ? { ...ef, dice: scaleD(ef.dice, dmgK) } : ef)) }));
  return id;
};
// w5 copy of an already built enemy (V / N types): damage dice x dmgK, weapon to-hit +hit, HP x hpK.
const X = (src, tag, dmgK = 1, hit = 0, hpK = 1) => {
  const id = `w5-${tag}`; if (ENEMIES_V3[id]) return id;
  const b = ENEMIES_V3[src]; const d = (ENEMIES_V3[id] = { ...b, id, hp: Math.max(1, Math.round(b.hp * hpK)) });
  if (d.weapon) d.weapon = { ...d.weapon, dice: scaleD(d.weapon.dice, dmgK), hit: (d.weapon.hit || 0) + hit };
  d.abilities = (d.abilities || []).map((a) => ({ ...a, effects: (a.effects || []).map((ef) => (ef.op === 'damage' && ef.dice ? { ...ef, dice: scaleD(ef.dice, dmgK) } : ef)) }));
  return id;
};

const list = [
  // w5-census: three scavenger convoy guards at the Dump (buying the «extra» beasts back)
  enc('enc-w5-census', 'Перепись: конвоиры Свалки', 8, 'scavengers', ['svalka'], [W('scv-gunner', 8, 'gun', 'miniboss', 1.0, 2.6, 2), W('scv-sawman', 8, 'saw', 'miniboss', 1.0, 2.0, 2), W('scv-gunner', 8, 'gun', 'miniboss', 1.0, 2.0, 2)]),
  // w5-crown: four scavengers and a pirate knife-thrower on the false trail
  enc('enc-w5-crown', 'Корона: вежливая война', 9, 'scavengers', ['raytsentr', 'svalka'],
    [W('scv-gunner', 9, 'gun', 'elite', 1.0, 1.7, 1), W('scv-picker', 9, 'pick', 'elite', 1.0, 1.7, 1), W('scv-magnet', 9, 'mag', 'elite', 1.0, 1.7, 1), W('scv-gunner', 9, 'gun', 'elite', 1.0, 1.7, 1), W('pir-knifer', 9, 'knife', 'elite', 1.0, 1.7, 1)]),
  // w5-recruit: cult ambush on the bridge, they call Ivolga by name
  enc('enc-w5-bridge', 'Мост: засада культа', 10, 'cult', ['dodze', 'slavotech'],
    [W('cult-neophyte', 10, 'neo', 'elite', 1.0, 2.6, 2), W('cult-neophyte', 10, 'neo', 'elite', 1.0, 2.0, 2), W('cult-neophyte', 10, 'neo', 'elite', 1.0, 2.0, 2), W('cult-terminalist', 10, 'term', 'miniboss', 1.0, 2.0, 2)]),
  // w5-edict: the cringe storm — slogan drones and the Party agitator
  enc('enc-w5-edict', 'Кринж-шторм на площади', 11, 'aiParty', ['putinlyandiya'], [W('drone', 11, 'drone', 'elite', 1.0, 2.6, 2), W('drone', 11, 'drone', 'elite', 1.0, 2.0, 2), W('drone', 11, 'drone', 'elite', 1.0, 2.0, 2), W('ai-agitator', 11, 'agit', 'miniboss', 1.0, 2.0, 2)]),
  // w5-schedule: relay nodes guarded by tekhonki and scriptlets (optional way of the fieldwork)
  enc('enc-w5-storm', 'Ретранслятор: хор бури', 12, 'tekhonki', ['svoboda'], [X(V('tek', 'cmd', 12), 'tek-cmd-l12', 0.5, 0, 0.85), X(N('tek-proxy-shaman', 12), 'shaman-l12', 0.5, 0, 0.85), W('scriptlet', 12, 'scr4', 'elite', 0.8, 0.7, 0), W('scriptlet', 12, 'scr4', 'elite', 0.8, 0.7, 0)]),
];
export const ENCOUNTERS_WAVE5 = Object.fromEntries(list.map((x) => [x.id, x]));
