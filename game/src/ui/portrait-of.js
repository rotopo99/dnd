// Who is on the portrait: dialogue speakers, battle units, the hero — resolved to portraits v2 (assets/portraits.js).
//   drawHeroPic(ctx, hero, x, y, scale, opts)   hero portrait = animated 3D avatar (ui/hero-avatar.js)
//   heroBuild(h)                         save.hero or a battle unit -> build for drawHeroPortrait
//   speakerSubject(who)                  dialogue `who` -> NPC id | { id, race, faction } | null (narrator, radio)
//   enemySubject(enemyId)                enemy def -> NPC id | { id, race, faction } (by faction / tags)
//   wounds(u)                            { hp, mrl } as 0..1 shares (undefined when unknown)
//   drawUnitPortrait(ctx, u, x, y, scale, opts)   battle unit (hero / companion 'c-<npc>' / enemy), opts as drawPortrait
//   drawSpeaker(ctx, who, x, y, scale, opts, info)  dialogue speaker; info { hero (build), wounds { [npcId|'hero']: {hp, mrl} } }
//   partyWounds(members)                 members() of world/state.js -> wounds map for drawSpeaker
//   crispScale(boxPx, max = 4)           largest integer scale with 48*scale <= boxPx (at least 1)
import { drawPortrait, PORTRAIT_SIZE } from '../assets/sprites.js';
import { drawHeroAvatar } from './hero-avatar.js';
import { NPCS } from '../data/npcs.js';
import { ENEMIES } from '../data/enemies.js';
import { ENEMIES_V3 } from '../data/enemies-v3.js';

// dialogue speaker ids that are not NPC ids
const SPEAKER_ALIAS = { victor: 'victor-sundown', 'party-victor-soul': 'party-victor', 'liza-named': 'liza' };
// story speakers without an NPC card
const SPEAKER_LOOK = {
  acolyte: { id: 'acolyte', race: 'human', faction: 'cult' },
  cultist: { id: 'cultist', race: 'human', faction: 'cult' },
  gunner: { id: 'cultist-gunner', race: 'human', faction: 'cult' },
  skrilet: { id: 'skrilet', race: 'skrilet', faction: 'cult' },
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const share = (v, max) => (v != null && max > 0 ? clamp01(v / max) : undefined);

export const crispScale = (boxPx, max = 4) => Math.max(1, Math.min(max, Math.floor(boxPx / PORTRAIT_SIZE)));

export function heroBuild(h) {
  if (!h) return { race: 'human' };
  // no name: the face hash then depends on race/class only, so it stays the same from creation (name typed later) to the end
  return { race: h.race ?? h.raceId ?? 'human', cls: h.cls ?? h.classId, look: h.look ?? null, avatar: h.avatar ?? null, name: h.name };
}

/** The hero's portrait is always the animated 3D avatar (hero.avatar; none -> default from race/name). opts as drawPortrait + hurtAt. */
export function drawHeroPic(ctx, hero, x, y, scale, opts = {}) {
  drawHeroAvatar(ctx, hero, x, y, (opts.native ? PORTRAIT_SIZE : 32) * scale, opts);
}

export function partyWounds(list) {
  const out = {};
  for (const m of list || []) out[m.key] = wounds(m.unit);
  return out;
}

export function wounds(u) {
  if (!u) return {};
  return { hp: share(u.hp, u.maxHp), mrl: share(u.mrl, u.maxMrl) };
}

export function speakerSubject(who) {
  if (!who) return null;
  const id = SPEAKER_ALIAS[who] ?? who;
  if (NPCS[id]) return id;
  return SPEAKER_LOOK[who] ?? null;
}

const enemyCache = new Map();
export function enemySubject(enemyId) {
  const base = String(enemyId || '').split('^')[0];
  if (enemyCache.has(base)) return enemyCache.get(base);
  let r;
  const npc = NPCS[base] ? base : NPCS[base.replace(/^npc-/, '')] ? base.replace(/^npc-/, '') : null;
  if (npc) r = npc;
  else {
    const def = ENEMIES[base] || ENEMIES_V3[base] || {};
    const tags = def.tags || [];
    let faction = def.faction ?? (/^(cult|acolyte)/.test(base) ? 'cult' : null);
    let race = 'human';
    if (base.includes('skrilet')) race = 'skrilet';
    else if (faction === 'cringegons' || base.includes('cringe')) { race = 'cringegon'; faction = faction || 'cringegons'; }
    else if (tags.includes('digital')) race = 'cyber-spirit';
    else if (tags.includes('mechanical')) race = base.length % 2 ? 'skeleton' : 'android';
    else if (faction === 'mutantsPlant') race = 'mutant-plant';
    else if (faction === 'mutantsBeast' || tags.includes('hybrid')) race = 'mutant-beast';
    r = { id: `foe:${base}`, race, faction: faction || 'none' };
  }
  enemyCache.set(base, r);
  return r;
}

/** Battle unit portrait. opts: emotion, native, flip… hp/mrl default to the unit's own (pass display values to override). */
export function drawUnitPortrait(ctx, u, x, y, scale, opts = {}) {
  const o = { ...wounds(u), ...opts };
  const id = String(u.id || '');
  if (id.startsWith('c-') && NPCS[id.slice(2)]) drawPortrait(ctx, id.slice(2), x, y, scale, o);
  else if (u.kind === 'hero' && !u.enemyId) drawHeroPic(ctx, u, x, y, scale, o);
  else drawPortrait(ctx, enemySubject(u.enemyId || id), x, y, scale, o);
}

/** Dialogue speaker. info: { hero (build for 'hero'), wounds: { [npcId | 'hero']: { hp, mrl } } }. Returns true if drawn. */
export function drawSpeaker(ctx, who, x, y, scale, opts = {}, info = {}) {
  const sub = who === 'hero' ? null : speakerSubject(who);
  const key = who === 'hero' ? 'hero' : typeof sub === 'string' ? sub : null;
  const o = { ...(key && info.wounds?.[key]), ...opts };
  if (who === 'hero') {
    if (!info.hero) return false;
    drawHeroPic(ctx, info.hero, x, y, scale, o);
    return true;
  }
  if (!sub) return false;
  drawPortrait(ctx, sub, x, y, scale, o);
  return true;
}
