// Content wave 5 battles (docs/specs/content-wave5.md §4). Existing enemy types lifted to the quest level (enemies-v4.js
// lift / V / N) — their models stay (scavengers enemy_brute, pirates, cultists, drones, tekhonki). Numbers — balance-tester.
import { lift, V, N } from './enemies-v4.js';

const enc = (id, name, level, faction, places, enemies, extra = {}) => ({ id, name, level, faction, places, enemies, ...extra });

// w5 variant of an existing type: own id (so ranks / hp can differ from the shared lift), rank + hpK tune the fight
const W = (base, L, tag, rank, hpK = 1) => lift(base, L, { id: `w5-${tag}-l${L}`, rank, hpK });

const list = [
  // w5-census: three scavenger convoy guards at the Dump (buying the «extra» beasts back)
  enc('enc-w5-census', 'Перепись: конвоиры Свалки', 8, 'scavengers', ['svalka'], [W('scv-gunner', 8, 'gun', 'miniboss', 1.5), W('scv-sawman', 8, 'saw', 'miniboss', 1.9), W('scv-gunner', 8, 'gun', 'miniboss', 1.5)]),
  // w5-crown: four scavengers and a pirate knife-thrower on the false trail
  enc('enc-w5-crown', 'Корона: вежливая война', 9, 'scavengers', ['raytsentr', 'svalka'],
    [W('scv-gunner', 9, 'gun', 'elite', 1.5), W('scv-picker', 9, 'pick', 'elite', 1.6), W('scv-magnet', 9, 'mag', 'elite', 1.6), W('scv-gunner', 9, 'gun', 'elite', 1.5), W('pir-knifer', 9, 'knife', 'elite', 1.5)]),
  // w5-recruit: cult ambush on the bridge, they call Ivolga by name
  enc('enc-w5-bridge', 'Мост: засада культа', 10, 'cult', ['dodze', 'slavotech'],
    [W('cult-neophyte', 10, 'neo', 'elite', 1.7), W('cult-neophyte', 10, 'neo', 'elite', 1.7), W('cult-neophyte', 10, 'neo', 'elite', 1.7), W('cult-terminalist', 10, 'term', 'miniboss', 1.3)]),
  // w5-edict: the cringe storm — slogan drones and the Party agitator
  enc('enc-w5-edict', 'Кринж-шторм на площади', 11, 'aiParty', ['putinlyandiya'], [W('drone', 11, 'drone', 'elite', 1.8), W('drone', 11, 'drone', 'elite', 1.8), W('drone', 11, 'drone', 'elite', 1.8), W('ai-agitator', 11, 'agit', 'miniboss', 1.5)]),
  // w5-schedule: relay nodes guarded by tekhonki and scriptlets (optional way of the fieldwork)
  enc('enc-w5-storm', 'Ретранслятор: хор бури', 12, 'tekhonki', ['svoboda'], [V('tek', 'cmd', 12), N('tek-proxy-shaman', 12), W('scriptlet', 12, 'scr', 'elite', 1.4), W('scriptlet', 12, 'scr', 'elite', 1.4)]),
];
export const ENCOUNTERS_WAVE5 = Object.fromEntries(list.map((x) => [x.id, x]));
