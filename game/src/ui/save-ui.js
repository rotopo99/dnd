// Save / load windows (modals) and the pause menu. Slots: autosave + save.js SLOT_COUNT manual ones.
//   openSaveMenu(game) — write the current game.save into a manual slot
//   openLoadMenu(game, onCancel?) — pick a slot → startFromSave
//   openPauseMenu(game, { canSave, onMenu }) — «Продолжить / Сохранить / Загрузить / В главное меню»
//   startFromSave(game, save) — go to the save's location (or back into an unfinished Cyberspace episode)
import { t } from '../data/text/index.js';
import { LOCATIONS } from '../world/data.js';
import { listSlots, loadGame, saveToSlot, latestSlot, readSave, heroProblem, fixHero, normalizeSave } from '../save.js';
import { CLASS_ORDER } from '../data/index.js';
import { tf } from '../world/state.js';

const slotName = (slot) => (slot === 'auto' ? t('save.auto') : `${t('save.slot')} ${slot}`);

function when(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** «Имя · ур. N · Место · день D · дата время» or «пусто». */
export function slotSummary(x) {
  if (x.empty) return t('save.empty');
  if (x.broken) return t('save.broken');
  const place = x.cyberspace ? t('save.cyberspace') : LOCATIONS[x.location]?.name || x.location || '—';
  return [x.name, `${t('world.level')} ${x.level}`, place, `${t('world.day')} ${x.day}`, x.coop ? `${t('net.coopMark')} +${x.coop}` : '', when(x.savedAt)].filter(Boolean).join(' · ');
}

export function startFromSave(game, save) {
  game.save = save;
  if (save.cyberspace?.pending || (save.cyberspace && !save.cyberspace.nodes && !save.cyberspace.mode)) import('../scenes/cyberspace.js').then((m) => m.startCyberspace(game, save.cyberspace));
  else if (save.cyberspace) import('../scenes/cyberspace.js').then((m) => game.setScene(m.createCyberspaceScene()));
  else import('../scenes/roam.js').then((m) => game.setScene(m.createNodeScene(save.location)));
}

/**
 * Load a slot and start it. A hero with an unknown race / class or a forbidden pair (hand-edited / old save) — a window
 * with the reason and the allowed classes (or races) to pick; the pick repairs the slot and starts the game.
 * Returns false when the slot has nothing loadable.
 */
export function loadSlot(game, slot, onCancel) {
  const save = loadGame(game.data, slot);
  if (save) { startFromSave(game, save); return true; }
  const raw = readSave(slot);
  const data = { ...game.data, CLASS_ORDER };
  const pr = raw && heroProblem(raw, data);
  if (!pr) return false;
  const name = (id, cat) => game.data[cat]?.[id]?.name || String(id ?? '—');
  const vars = { race: name(pr.race, 'RACES'), cls: name(pr.cls, 'CLASSES') };
  game.openModal({
    title: t('save.fixTitle'), width: 640,
    lines: [{ text: pr.options.length ? tf(`save.fix.${pr.bad}`, vars) : t('save.fixNone'), color: 'c' }],
    onCancel: (g) => onCancel?.(g),
    options: [
      ...pr.options.map((id) => ({
        label: name(id, pr.fix === 'cls' ? 'CLASSES' : 'RACES'),
        run: (g) => {
          const fixed = normalizeSave(fixHero(raw, data, { [pr.fix]: id }), data);
          if (!fixed) { g.toast(t('save.broken'), 'c'); return; }
          saveToSlot(fixed, slot);
          startFromSave(g, fixed);
        },
      })),
      { label: t('loc.close'), run: (g) => onCancel?.(g) },
    ],
  });
  return true;
}

/** Load the most recent slot («Продолжить»). Returns false if there is nothing to load. */
export function continueLatest(game) {
  const slot = latestSlot();
  return slot != null && loadSlot(game, slot);
}

export function openLoadMenu(game, onCancel) {
  const slots = listSlots();
  game.openModal({
    title: t('save.loadTitle'), width: 900,
    onCancel: (g) => onCancel?.(g),
    options: [
      ...slots.map((x) => ({
        label: slotName(x.slot), sub: slotSummary(x), disabled: x.empty || x.broken,
        run: (g) => { if (!loadSlot(g, x.slot, onCancel)) g.toast(t('save.broken'), 'c'); },
      })),
      { label: t('loc.close'), run: (g) => onCancel?.(g) },
    ],
  });
}

export function openSaveMenu(game, onDone) {
  const slots = listSlots().filter((x) => x.slot !== 'auto');
  game.openModal({
    title: t('save.saveTitle'), width: 900,
    lines: [{ text: t('save.saveHint'), color: '4' }],
    onCancel: (g) => onDone?.(g),
    options: [
      ...slots.map((x) => ({
        label: `${slotName(x.slot)}${x.empty ? '' : ` — ${t('save.overwrite')}`}`, sub: slotSummary(x),
        run: (g) => {
          if (saveToSlot(g.save, x.slot)) g.toast(`${t('save.saved')}: ${slotName(x.slot)}`, 'j');
          onDone?.(g);
        },
      })),
      { label: t('loc.close'), run: (g) => onDone?.(g) },
    ],
  });
}

/** Pause menu over a world scene. onMenu(game) — leave to the main menu (the scene autosaves first). */
export function openPauseMenu(game, { canSave = true, onMenu } = {}) {
  game.openModal({
    title: t('save.pause'),
    options: [
      { label: t('save.resume'), run: () => {} },
      { label: t('save.save'), disabled: !canSave, reason: t('save.notNow'), run: (g) => openSaveMenu(g, (g2) => openPauseMenu(g2, { canSave, onMenu })) },
      { label: t('save.load'), run: (g) => openLoadMenu(g, (g2) => openPauseMenu(g2, { canSave, onMenu })) },
      { label: t('save.toMenu'), run: (g) => onMenu?.(g) },
    ],
  });
}
