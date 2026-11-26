// Content wave 5 battles (docs/specs/content-wave5.md §4). Existing enemy types lifted to the quest level (enemies-v4.js
// lift / V / N) — their models stay (scavengers enemy_brute, pirates, cultists, drones, tekhonki). Numbers — balance-tester.
import { lift, V, N } from './enemies-v4.js';

const enc = (id, name, level, faction, places, enemies, extra = {}) => ({ id, name, level, faction, places, enemies, ...extra });

const list = [
  // w5-census: three scavenger convoy guards at the Dump (buying the «extra» beasts back)
  enc('enc-w5-census', 'Перепись: конвоиры Свалки', 8, 'scavengers', ['svalka'], [V('scv', 'vet', 8), lift('scv-sawman', 8), V('scv', 'vet', 8)]),
  // w5-crown: four scavengers and a pirate knife-thrower on the false trail
  enc('enc-w5-crown', 'Корона: вежливая война', 9, 'scavengers', ['raytsentr', 'svalka'],
    [V('scv', 'vet', 9), lift('scv-picker', 9), lift('scv-magnet', 9), V('scv', 'elite', 9), lift('pir-knifer', 9)]),
  // w5-recruit: cult ambush on the bridge, they call Ivolga by name
  enc('enc-w5-bridge', 'Мост: засада культа', 10, 'cult', ['dodze', 'slavotech'],
    [lift('cult-neophyte', 10), lift('cult-neophyte', 10), lift('cult-neophyte', 10), lift('cult-terminalist', 10)]),
  // w5-edict: the cringe storm — slogan drones and the Party agitator
  enc('enc-w5-edict', 'Кринж-шторм на площади', 11, 'aiParty', ['putinlyandiya'], [lift('drone', 11), lift('drone', 11), lift('drone', 11), lift('ai-agitator', 11)]),
  // w5-schedule: relay nodes guarded by tekhonki and scriptlets (optional way of the fieldwork)
  enc('enc-w5-storm', 'Ретранслятор: хор бури', 12, 'tekhonki', ['svoboda'], [V('tek', 'vet', 12), N('tek-proxy-shaman', 12), lift('scriptlet', 12), lift('scriptlet', 12)]),
];
export const ENCOUNTERS_WAVE5 = Object.fromEntries(list.map((x) => [x.id, x]));
