// Content wave 4 helpers (docs/specs/content-wave4.md §2, §5). Pure (no DOM).
//   eveMods(save, encId)       §2 the Raytsentr defence by earlier choices: EVE_MODS rows that apply to this wave
//   eveSetup(save, encId, enemies)  → { enemies (hpPct-wrapped), allies, buffs, notes, triggers } (scenes/world-battle.js encounterSetup;
//                              triggers — rules/battle-triggers.js: volleys, hub terminal revive). balance-finale.md §1: WAVE4_RULES.allyCap —
//                              ≤ units allied units and ≤ volleys volley triggers a wave (bottom EVE_MODS rows first); the rest — a toast only
//   bossPhases(save, enemies)  balance-finale.md §2: phase triggers of the bosses in the list (BOSS_PHASES of data/enemies-v4.js)
//   smallParty(size, encId, enemies, ENEMIES, flagAllies)  §3: → { enemies (bosses hpPct), allies } for a party of ≤ smallParty.size
//   doorFarewell(save)         §5 at the Door (mq3-court door stage): loy ≥ 20 — support line, loy < −20 — the companion leaves
//   doorBonus(save, skills)    §5 a supporting companion (door-support-<id>, still active) whose class specialty is among the
//                              skills: → { n (R.door.bonus, not stacked), npc, skill } | null; quests.goalDc / cine.checkDc: DC − n
//   eveWave(encId)             QA v44: EVE_WAVE_SETUP row of a wave battle | null
//   eveTerrain(def, encId)     → a copy of the battle map def with the wave's terrain (fire patches / breached cover / night)
//   eveTerrainMap(map, encId)  same over startWorldBattle's map (def or seed => def); other battles — unchanged
//   eveWaveIntro(save, qid, sid, rng)  → lines before the wave battle of stage wall-N (EVE_WAVE_FLAVOR + terrain) | null
//   eveInterlude(save, qid, sid)       → lines of the lull rest-N (EVE_INTERLUDES: radio, a companion bark, the wall) | []
//   finaleChoir(save, qid, rng) §5 ending D: sister-pomekha in the party rolls meditation DC 14 — stays or leaves into the Choir
import { EVE_MODS, EVE_WAVES, WAVE4_RULES as R, FINALE_BARKS, FINALE_BARK_DEFAULT, EVE_WAVE_FLAVOR, EVE_INTERLUDES } from '../data/world/quests-wave4.js';
import { EVE_WAVE_SETUP, EVE_TERRAIN_RULES as ET } from '../data/world/eve-waves.js';
import { COMPANIONS } from '../data/companions.js';
import { NPCS } from '../data/npcs.js';
import { SPECIALIZATIONS } from '../data/skills.js';
import { GAME_DATA } from '../data/index.js';
import { BOSS_PHASES } from '../data/enemies-v4.js';
import { skillCheck } from '../rules/skills.js';
import { memberUnit } from './state.js';

const f = (save, k) => !!save?.flags?.[k];

export function eveMods(save, encId) {
  if (!EVE_WAVES.includes(encId)) return [];
  const not = (m) => [].concat(m.notFlag || []).some((k) => f(save, k));
  return EVE_MODS.filter((m) => f(save, m.flag) && !not(m) && (!m.waves || m.waves.includes(encId)));
}

const baseOf = (e) => (typeof e === 'string' ? e : e?.enemy || e?.id);
export function eveSetup(save, encId, enemies = []) {
  const mods = eveMods(save, encId);
  if (!mods.length) return { enemies, allies: [], buffs: [], notes: [], triggers: [] };
  const k = mods.reduce((a, m) => a * (m.hpPct || 1), 1);
  const out = k === 1 ? enemies : enemies.map((e) => ({ ...(typeof e === 'object' ? e : {}), enemy: baseOf(e), hpPct: Math.round((e?.hpPct || 1) * k * 100) / 100 }));
  // allyCap: units / volleys taken from the bottom rows of EVE_MODS up; a capped flag keeps its toast only
  const cap = R.allyCap || { units: 99, volleys: 99 };
  let units = cap.units, volleys = cap.volleys;
  const allies = [], triggers = [];
  for (const m of [...mods].reverse()) {
    if (m.allies?.length && units > 0) { const a = m.allies.slice(0, units); units -= a.length; allies.unshift(...a); }
    for (const tr of m.triggers || []) {
      const volley = tr.do.some((op) => op.op === 'volley');
      if (volley && volleys <= 0) continue;
      if (volley) volleys--;
      triggers.unshift(tr);
    }
  }
  return { enemies: out, allies, buffs: mods.map((m) => m.buff).filter(Boolean), notes: mods.map((m) => m.text), triggers };
}

/** balance-finale.md §2: phase triggers of every boss of the list (once per boss id). c8: noFlag — no phases, tornFlag — `torn`. */
export function bossPhases(save, enemies = []) {
  const out = [];
  for (const id of new Set(enemies.map((e) => String(baseOf(e) || '').split('^')[0]))) {
    const P = BOSS_PHASES[id];
    if (!P || (P.noFlag && f(save, P.noFlag))) continue;
    out.push(...P.phases({ torn: !!(P.tornFlag && f(save, P.tornFlag)) }));
  }
  return out;
}

/** balance-finale.md §3: a party of ≤ smallParty.size in the late fights — allies (2 for a duo) and bosses at bossHpPct.
 *  The finale (flagAllies — finaleMods allies already there) gets no extra ally. ENEMIES — enemy defs (boss flag). */
export function smallParty(size, encId, enemies = [], ENEMIES = {}, flagAllies = 0) {
  const S = R.smallParty;
  if (!S || size > S.size || !S.enc.includes(encId)) return { enemies, allies: [] };
  const n = encId === 'w-cc-finale' && flagAllies > 0 ? 0 : S.countBySize?.[size] ?? S.count;
  const out = enemies.map((e) => {
    const id = baseOf(e);
    if (!ENEMIES[String(id).split('^')[0]]?.boss && !ENEMIES[id]?.boss) return e;
    return { ...(typeof e === 'object' ? e : {}), enemy: id, hpPct: Math.round((e?.hpPct || 1) * S.bossHpPct * 100) / 100 };
  });
  return { enemies: out, allies: Array(n).fill(S.ally) };
}

/** §5: companions at the Door. Mutates the party (a cold companion leaves). → [{ npc, kind: 'support'|'leave', line }]. */
export function doorFarewell(save) {
  const out = [];
  for (const p of save?.party || []) {
    if (!['active', 'waiting'].includes(p.state) || !COMPANIONS[p.npc]) continue;
    const loy = p.approval || 0;
    if (loy < R.door.leave) {
      p.state = 'left';
      save.flags[`door-left-${p.npc}`] = true;
      out.push({ npc: p.npc, kind: 'leave', line: COMPANIONS[p.npc].leave?.line || '' });
    } else if (loy >= R.door.support && p.state === 'active') {
      save.flags[`door-support-${p.npc}`] = true;
      out.push({ npc: p.npc, kind: 'support', line: FINALE_BARKS[p.npc] || FINALE_BARK_DEFAULT });
    }
  }
  return out;
}
export const npcName = (id) => NPCS[id]?.name || id;

const activeParty = (save, npc) => (save?.party || []).find((p) => p.npc === npc && p.state === 'active');

/** §5: +1 to the court («dossier») rolls of a supporting companion's class specialty — as DC −n, once (not per companion). */
export function doorBonus(save, skills = []) {
  for (const p of save?.party || []) {
    if (p.state !== 'active' || !save.flags?.[`door-support-${p.npc}`]) continue;
    const skill = (SPECIALIZATIONS[NPCS[p.npc]?.cls]?.spec || []).find((x) => skills.includes(x));
    if (skill) return { n: R.door.bonus, npc: p.npc, skill };
  }
  return null;
}

/** §5 ending D: Сестра Помеха — meditation DC 14 not to go into the Choir. Once (flag choir-rolled). → { ok, line } | null. */
export function finaleChoir(save, qid, rng = Math.random) {
  const C = R.choir;
  if (qid !== C.quest || !f(save, C.fin) || f(save, 'choir-rolled')) return null;
  const p = activeParty(save, C.npc);
  if (!p) return null;
  save.flags['choir-rolled'] = true;
  const u = memberUnit(save, C.npc);
  const ok = !!u && skillCheck(u, C.skill, C.dc, { rng, data: GAME_DATA }).success;
  if (ok) save.flags['pomekha-stayed'] = true;
  else { p.state = 'left'; save.flags['pomekha-choir'] = true; }
  return { ok, line: ok ? 'w4.choirStay' : 'w4.choirLeave' };
}

// ---------------------------------------------------------------- QA v44: the three waves differ (data/world/eve-waves.js)
export const eveWave = (encId) => EVE_WAVE_SETUP[encId] || null;

/** Map def copy with the wave's terrain. Fire / breach go to the middle band of the width, away from the start cells. */
export function eveTerrain(def, encId) {
  const W = eveWave(encId);
  if (!def || !W?.terrain || !Array.isArray(def.grid)) return def;
  const T = W.terrain;
  const rows = def.grid.map((r) => r.split(''));
  const h = rows.length, w = rows[0]?.length || 0;
  const starts = [...Object.values(def.starts || {}).flat().map((p) => (Array.isArray(p) ? p : [p.x, p.y]))];
  rows.forEach((r, y) => r.forEach((ch, x) => { if ('PEAFB'.includes(ch)) starts.push([x, y]); }));
  const nearStart = (x, y) => starts.some(([sx, sy]) => Math.max(Math.abs(sx - x), Math.abs(sy - y)) <= ET.startClear);
  const x0 = Math.floor(w * ET.band[0]), x1 = Math.ceil(w * ET.band[1]);
  const band = (pred) => {
    const out = [];
    for (let y = 1; y < h - 1; y++) for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x++) if (pred(rows[y][x]) && !nearStart(x, y)) out.push([x, y]);
    return out;
  };
  const spread = (cells, n) => (cells.length <= n ? cells : Array.from({ length: n }, (_, i) => cells[Math.floor(((i + 0.5) * cells.length) / n)]));
  const out = { ...def };
  if (T.fire) out.surfaces = [...(def.surfaces || []), ...spread(band((c) => c === '.'), T.fire.cells).map(([x, y]) => ({ kind: 'fire', x, y }))];
  if (T.breach) {
    for (const [x, y] of spread(band((c) => c === 'c' || c === '#'), T.breach.cells)) rows[y][x] = '.';
    out.grid = rows.map((r) => r.join(''));
  }
  if (T.dark) out.tod = 'night';
  out.eveTerrain = Object.keys(T);
  return out;
}

/** startWorldBattle: the map option (def or seed => def) with the wave terrain. */
export function eveTerrainMap(map, encId) {
  if (!eveWave(encId) || !map) return map;
  return typeof map === 'function' ? (seed) => eveTerrain(map(seed), encId) : eveTerrain(map, encId);
}

const W_STAGE = /^wall-(\d)$/, R_STAGE = /^rest-(\d)$/;
const activeCompanions = (save) => (save?.party || []).filter((p) => p.state === 'active' && COMPANIONS[p.npc]).map((p) => p.npc);

/** Lines before the wave battle of `wall-N` (mq4-eve): name + intro, one cringe line, the terrain / goal of the wave. */
export function eveWaveIntro(save, qid, sid, rng = Math.random) {
  const m = qid === 'mq4-eve' && W_STAGE.exec(sid || '');
  if (!m) return null;
  const n = Number(m[1]), F = EVE_WAVE_FLAVOR?.[n], encId = EVE_WAVES[n - 1], W = eveWave(encId);
  const lines = [];
  if (F?.intro) lines.push({ text: F.intro });
  if (F?.cringe?.length) lines.push({ text: F.cringe[Math.floor(rng() * F.cringe.length) % F.cringe.length], color: 'n' });
  for (const k of Object.keys(W?.terrain || {})) lines.push({ key: `w4.terrain.${k}`, color: 'a' });
  return { n, name: F?.name || null, encId, lines };
}

/** Lines of the lull `rest-N` (mq4-eve): Шумок on the radio, a companion of the party, the wall. */
export function eveInterlude(save, qid, sid) {
  const m = qid === 'mq4-eve' && R_STAGE.exec(sid || '');
  const I = m && EVE_INTERLUDES?.[Number(m[1])];
  if (!I) return [];
  const out = [];
  if (I.radio) out.push({ text: I.radio, color: 'f' });
  const party = activeCompanions(save);
  const own = party.find((id) => I.bark?.[id]);
  if (own) out.push({ text: I.bark[own], color: 'j' });
  else if (I.barkAny && party.length) out.push({ text: `${npcName(party[0])}: ${I.barkAny}`, color: 'j' });
  if (I.wall) out.push({ text: I.wall, color: '5' });
  return out;
}
