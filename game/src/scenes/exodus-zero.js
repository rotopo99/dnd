// «Третий исход», ноль (docs/specs/third-exodus.md §1 «Ноль»): Судья воплощается. Партию втягивает к Главному узлу,
// финал w-cc-finale без бонусов (world-battle.encounterSetup по флагу exodus-zero). Победа — «Пиррова победа»
// (флаг node-destroyed-late, таймер выключен); поражение — плохой финал, слоты сохранений не удаляются.
import { t } from '../data/text/index.js';
import { EXODUS } from '../data/world/exodus.js';
import { journal, visit } from '../world/state.js';
import { onBattleWon, autoProgress } from '../world/quests.js';
import { saveGame } from '../save.js';
import { startWorldBattle } from './world-battle.js';

const Z = EXODUS.zero;

export function startExodusZero(game) {
  const save = game.save;
  if (!save.flags[Z.flag]) { save.flags[Z.flag] = true; journal(save, t('exodus.zeroTitle')); }
  saveGame(save);
  game.openModal({
    title: t('exodus.zeroTitle'), titleColor: 'n', border: 'n', onCancel: false,
    lines: [{ text: t('exodus.zeroText') }],
    options: [{ label: t('battle.continue'), run: (g) => fight(g) }],
  });
}

function fight(game) {
  const save = game.save;
  visit(save, Z.location);
  game.visit = null;
  startWorldBattle(game, {
    encounter: Z.encounter, location: Z.location, id: 'exodus-zero',
    onWin: (g) => {
      const sv = g.save;
      onBattleWon(sv, Z.encounter, Z.location, g.data); // mq-exodus at 'assault' moves on
      autoProgress(sv, g.data);
      sv.flags[Z.winFlag] = true;
      journal(sv, t('exodus.lateWinTitle'));
      saveGame(sv);
      g.openModal({ title: t('exodus.lateWinTitle'), titleColor: 'a', border: 'a', onCancel: false, lines: [{ text: t('exodus.lateWin') }],
        options: [
          { label: t('battle.continue'), run: (g2) => import('./location.js').then((m) => g2.setScene(m.createLocationScene(Z.location))) },
          { label: t('menu.back'), run: (g2) => import('./menu.js').then((m) => g2.setScene(m.menuScene)) },
        ] });
    },
    onLose: (g) => {
      // the bad ending: the save slots stay (load an earlier one)
      g.save = null;
      import('./menu.js').then((m) => {
        g.setScene(m.menuScene);
        g.openModal({ title: t('exodus.lostTitle'), titleColor: 'n', border: 'n', onCancel: false, lines: [{ text: t('exodus.lost') }],
          options: [{ label: t('menu.back'), run: (g2) => g2.setScene(m.menuScene) }] });
      });
    },
  });
}
