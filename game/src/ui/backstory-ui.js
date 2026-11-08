// Backstory picker (world-consequences.md ч.4): a modal with «Без предыстории» + the race's backstories,
// details panel on the right (backstoryTip: pluses, topics, the drawback). Used by create-build and create-talents.
import { t } from '../data/text/index.js';
import { backstoryList, backstoryOf, backstoryTip } from '../world/backstory.js';

/** Button label for the current pick. */
export const backstoryLabel = (id) => t('bg.button').replace('{name}', backstoryOf(id)?.name || t('bg.none'));

/** openBackstoryPick(game, { race, current, onPick(game, id|null) }) */
export function openBackstoryPick(game, { race, current, onPick }) {
  const opts = [{ label: t('bg.none'), sub: t('bg.noneSub'), selected: !current, run: (g) => onPick(g, null),
    detail: { title: t('bg.none'), lines: [t('bg.pickHint')] } }];
  for (const b of backstoryList(race)) {
    opts.push({ label: `${b.id === current ? '● ' : ''}${b.name}`, sub: b.skills.map((s) => `+${s.bonus}`).join(' / ') + ` · ${b.drawback?.note || b.drawback?.trust || ''}`,
      run: (g) => onPick(g, b.id), detail: backstoryTip(b) });
  }
  game.openModal({ title: t('bg.title'), lines: [t('bg.pickHint')], width: 1000, options: opts });
}
