// «Дух Киберспейса» (docs/specs/cyberspace-v2.md §7, data SPIRIT): the body is destroyed — the hero lives on as a spirit.
// save.hero.spirit = true + flag bodyDestroyed; buildHero swaps the race to SPIRIT.race and halves max HP (state.js).
// Way back: quest sq-new-body (clearFlag bodyDestroyed, clearOn 'body') → restoreBody.
import { SPIRIT } from '../data/world/cyberspace.js';
import { LOCATIONS } from '../data/world/locations.js';
import { t } from '../data/text/index.js';
import { buildHero, journal } from './state.js';

export const isSpirit = (save) => !!save?.hero?.spirit;

/**
 * Which trigger destroys the body now (null — the body is fine): 'ritual' — a wipe at a ritual terminal / Temple;
 * 'mark2' — the escape failed and the hero got the 2nd Judge mark.
 */
export function spiritTrigger(save, { reason, marksReached = 0 } = {}) {
  if (isSpirit(save)) return null;
  const loc = LOCATIONS[save.location];
  if (reason === 'wipe' && ((loc?.terminal && save.terminals?.[loc.terminal.id] === 'ritual') || save.location === 'cc-temple')) return 'ritual';
  if (marksReached === 2) return 'mark2';
  return null;
}

/** The body is gone: the hero becomes a spirit. → toasts. */
export function becomeSpirit(save, trigger) {
  save.hero.spirit = true;
  save.flags.bodyDestroyed = true;
  save.flags[`spirit:${trigger}`] = true;
  save.hero.hp = null; save.hero.mrl = null;
  journal(save, t('spirit.journal'));
  return [{ text: t('spirit.toast'), color: 'h' }];
}

/** sq-new-body: the hero steps into the new body (SPIRIT.return: 50% ЗДР/МРЛ, flag cleared). → toasts. */
export function restoreBody(save, data) {
  const back = SPIRIT.return;
  save.hero.spirit = false;
  delete save.flags[back.clearFlag];
  save.hero.hp = null; save.hero.mrl = null;
  const u = buildHero(save, data);
  save.hero.hp = Math.max(1, Math.ceil(u.maxHp * back.hpFrac));
  save.hero.mrl = Math.max(1, Math.ceil(u.maxMrl * back.mrlFrac));
  journal(save, t('spirit.restored'));
  return [{ text: t('spirit.restored'), color: 'j' }];
}

/** Spirit limits (SPIRIT.limits): rest only at an 'ours' terminal. → null (ok) or the reason text. */
export function spiritRestBlock(save, locId) {
  if (!isSpirit(save) || SPIRIT.limits.rest !== 'only-terminal') return null;
  const loc = LOCATIONS[locId];
  return loc?.terminal && save.terminals?.[loc.terminal.id] === 'ours' ? null : t('spirit.noRest');
}
