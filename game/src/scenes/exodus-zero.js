// «Третий исход», ноль (docs/specs/third-exodus.md §1 «Ноль»): Судья воплощается. Партию втягивает к Главному узлу,
// финал w-cc-finale без бонусов (world-battle.encounterSetup по флагу exodus-zero). Победа — «Пиррова победа»
// (флаг node-destroyed-late, таймер выключен); поражение — плохой финал, слоты сохранений не удаляются.
import { t } from '../data/text/index.js';
import { EXODUS } from '../data/world/exodus.js';
import { journal, visit } from '../world/state.js';
import { onBattleWon, autoProgress } from '../world/quests.js';
import { saveGame } from '../save.js';
import { startWorldBattle } from './world-battle.js';
import { openEpilogue } from './epilogue.js';

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
          // world-consequences.md: the epilogue at the Exodus zero (the late win), then the Main node
          { label: t('epi.title'), run: (g2) => openEpilogue(g2, { extra: [{ title: t('exodus.lateWinTitle'), text: t('exodus.lateWin') }],
            onDone: (g3) => import('./location.js').then((m) => g3.setScene(m.createLocationScene(Z.location))) }) },
          { label: t('battle.continue'), run: (g2) => import('./location.js').then((m) => g2.setScene(m.createLocationScene(Z.location))) },
          { label: t('menu.back'), run: (g2) => import('./menu.js').then((m) => g2.setScene(m.menuScene)) },
        ] });
    },
    onLose: (g) => {
      // the bad ending: the save slots stay (load an earlier one); first the epilogue of what the world remembers
      const sv = g.save;
      g.save = null;
      const toMenu = (g2) => import('./menu.js').then((m) => {
        g2.setScene(m.menuScene);
        g2.openModal({ title: t('exodus.lostTitle'), titleColor: 'n', border: 'n', onCancel: false, lines: [{ text: t('exodus.lost') }],
          options: [{ label: t('menu.back'), run: (g3) => g3.setScene(m.menuScene) }] });
      });
      openEpilogue(g, { save: sv, extra: [{ title: t('exodus.lostTitle'), text: t('exodus.lost') }], onDone: toMenu });
    },
  });
}
