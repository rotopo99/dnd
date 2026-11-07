// Save / load windows (modals) and the pause menu. Slots: autosave + save.js SLOT_COUNT manual ones.
//   openSaveMenu(game) — write the current game.save into a manual slot
//   openLoadMenu(game, onCancel?) — pick a slot → startFromSave
//   openPauseMenu(game, { canSave, onMenu }) — «Продолжить / Сохранить / Загрузить / В главное меню»
//   startFromSave(game, save) — go to the save's location (or back into an unfinished Cyberspace episode)
import { t } from '../data/text/index.js';
import { LOCATIONS } from '../world/data.js';
import { listSlots, loadGame, saveToSlot, latestSlot } from '../save.js';

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
  return [x.name, `${t('world.level')} ${x.level}`, place, `${t('world.day')} ${x.day}`, when(x.savedAt)].filter(Boolean).join(' · ');
}

export function startFromSave(game, save) {
  game.save = save;
  if (save.cyberspace?.pending || (save.cyberspace && !save.cyberspace.nodes)) import('../scenes/cyberspace.js').then((m) => m.startCyberspace(game, save.cyberspace));
  else if (save.cyberspace) import('../scenes/cyberspace.js').then((m) => game.setScene(m.createCyberspaceScene()));
  else import('../scenes/location.js').then((m) => game.setScene(m.createLocationScene(save.location)));
}

/** Load the most recent slot («Продолжить»). Returns false if there is nothing to load. */
export function continueLatest(game) {
  const slot = latestSlot();
  const save = slot != null ? loadGame(game.data, slot) : null;
  if (!save) return false;
  startFromSave(game, save);
  return true;
}

export function openLoadMenu(game, onCancel) {
  const slots = listSlots();
  game.openModal({
    title: t('save.loadTitle'), width: 900,
    onCancel: (g) => onCancel?.(g),
    options: [
      ...slots.map((x) => ({
        label: slotName(x.slot), sub: slotSummary(x), disabled: x.empty || x.broken,
        run: (g) => {
          const save = loadGame(g.data, x.slot);
          if (!save) { g.toast(t('save.broken'), 'c'); return; }
          startFromSave(g, save);
        },
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
