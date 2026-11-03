// Prologue «Суд над Гармонией» flow: intro -> scene 1 -> battle 1 -> ... -> epilogue. Script: docs/story/prologue.md.
// Between battles the hero rests: every battle builds a fresh creature, so ЗДР/МРЛ/ЭНР are full again.
import { t } from '../data/text/index.js';
import { line } from '../data/text/prologue.js';
import { MAPS } from '../data/index.js';
import { createDialogueScene, toLines } from './dialogue.js';
import { createBattleScene } from './battle.js';
import { menuScene } from './menu.js';

/** Collect dialogue lines for keys (race-aware via line()). */
function lines(race, ...keys) {
  const out = [];
  for (const k of keys) out.push(...toLines(line(k, race)));
  return out;
}

const BARKS = { cultist: 'bark_cultist', 'cultist-gunner': 'bark_gunner', skrilet: 'bark_skrilet', acolyte: 'bark_acolyte', 'npc-gans': 'bark_gans' };

/** Story hooks during battle 2 and 3 (skrilet reveal, acolyte at half HP, Gans down). */
function storyHooks(race) {
  return (S, e) => {
    const b = S.b;
    const T = e.target ? b.byId[e.target] : null;
    const A = e.actor ? b.byId[e.actor] : null;
    const say = (u, key, log) => {
      if (!u) return;
      S.storyBubble(u, key);
      if (log) for (const l of toLines(line(key, race))) S.pushLog([[l.text, '#8d95a8']]);
    };
    if (e.type === 'statusEnd' && e.id === 'invisible' && T?.enemyId === 'skrilet' && !S.flags.reveal) {
      S.flags.reveal = true;
      for (const l of toLines(line('s2_skrilet_reveal', race))) S.pushLog([[l.text, '#8d95a8']]);
    }
    if (e.type === 'attack' && A?.enemyId === 'skrilet' && !S.flags.reveal) {
      S.flags.reveal = true;
      for (const l of toLines(line('s2_skrilet_reveal', race))) S.pushLog([[l.text, '#8d95a8']]);
    }
    if (e.type === 'damage' && T?.enemyId === 'acolyte' && !S.flags.half && T.hp > 0 && T.hp <= T.maxHp / 2) {
      S.flags.half = true;
      say(T, 'acolyte_half', true);
    }
    if (e.type === 'down' && T?.enemyId === 'npc-gans') say(T, 'gans_down', true);
    if (e.type === 'attack' && A?.enemyId === 'acolyte' && T?.enemyId === 'npc-gans' && Math.random() < 0.5) say(A, 'bark_acolyte_gans');
  };
}

export function startPrologue(game, hero) {
  const race = hero.race;
  const H = { race: hero.race, cls: hero.cls };
  const dlg = (title, ls, next) => game.setScene(createDialogueScene({ title, lines: ls, hero: H, onDone: next }));
  const toMenu = (g) => g.setScene(menuScene);
  const battle = (n, next) => {
    const map = MAPS[`prologue-${n}`];
    const scene = createBattleScene({
      hero, map, title: t(`b${n}_name`), intro: map.intro || `b${n}_intro`, hint: `b${n}_hint`, winText: `b${n}_win`,
      defeatLines: toLines(line('lose_hero', race)), barks: BARKS, onEvent: storyHooks(race),
      onWin: (g, S) => next(g, S), onExit: toMenu,
    });
    game.setScene(scene);
  };

  const epilogue = () => dlg(t('ep_title'), lines(race, 'ep_main', 'ep_victor', 'ep_seer', 'ep_radio', 'ep_end'), toMenu);
  const after3 = (g, S) => {
    const gans = S.b.units.find((u) => u.enemyId === 'npc-gans');
    const alive = gans && !gans.dead && !gans.down;
    dlg(
      t('s3_title'),
      lines(race, 's3_after', alive ? 's3_gans_alive' : 's3_gans_dead', alive ? 's3_lox_alive' : 's3_lox_dead'),
      epilogue,
    );
  };
  const scene3 = () => dlg(t('s3_title'), lines(race, 's3_before', 's3_race'), () => battle(3, after3));
  const after2 = () => dlg(t('s2_title'), lines(race, 's2_after', 's2_after_race', 's2_reveal', 's2_reward'), scene3);
  const scene2 = () => dlg(t('s2_title'), lines(race, 's2_before', 's2_race'), () => battle(2, after2));
  const after1 = () => dlg(t('s1_title'), lines(race, 's1_after', 's1_reward'), scene2);
  const scene1 = () => dlg(t('s1_title'), lines(race, 's1_before', 's1_race', 's1_tip'), () => battle(1, after1));
  dlg(t('intro_title'), lines(race, 'intro_radio', 'intro_paper', 'intro_arrival', 'seer_meet', 'seer_race', 'explosion'), scene1);
}
