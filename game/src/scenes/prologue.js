// Prologue «Суд над Гармонией» flow: intro -> scene 1 -> battle 1 -> ... -> epilogue. Script: docs/story/prologue.md.
// Between battles the hero rests: every battle builds a fresh creature, so ЗДР/МРЛ/ЭНР are full again.
import { t } from '../data/text/index.js';
import { exodusStart } from '../world/exodus.js';
import { line } from '../data/text/prologue.js';
import { MAPS } from '../data/index.js';
import { createDialogueScene, toLines } from './dialogue.js';
import { wounds } from '../ui/portrait-of.js';
import { createBattleScene } from './battle.js';
import { menuScene } from './menu.js';
import { C } from '../ui/draw.js';
import { newSave, gainXp, journal } from '../world/state.js';
import { LOCATIONS, START_LOCATION } from '../world/data.js';
import { saveGame } from '../save.js';
import { createNodeScene } from './roam.js';

/** Collect dialogue lines for keys (race-aware via line()). */
function lines(race, ...keys) {
  const out = [];
  for (const k of keys) out.push(...toLines(line(k, race)));
  return out;
}

const baseOf = (u) => String(u?.enemyId || '').split('^')[0];
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
      if (log) for (const l of toLines(line(key, race))) S.pushLog([[l.text, C['4']]]);
    };
    if (e.type === 'statusEnd' && e.id === 'invisible' && baseOf(T) === 'skrilet' && !S.flags.reveal) {
      S.flags.reveal = true;
      for (const l of toLines(line('s2_skrilet_reveal', race))) S.pushLog([[l.text, C['4']]]);
    }
    if (e.type === 'attack' && baseOf(A) === 'skrilet' && !S.flags.reveal) {
      S.flags.reveal = true;
      for (const l of toLines(line('s2_skrilet_reveal', race))) S.pushLog([[l.text, C['4']]]);
    }
    if (e.type === 'damage' && baseOf(T) === 'acolyte' && !S.flags.half && T.hp > 0 && T.hp <= T.maxHp / 2) {
      S.flags.half = true;
      say(T, 'acolyte_half', true);
    }
    if (e.type === 'down' && baseOf(T) === 'npc-gans') say(T, 'gans_down', true);
    if (e.type === 'attack' && baseOf(A) === 'acolyte' && baseOf(T) === 'npc-gans' && Math.random() < 0.5) say(A, 'bark_acolyte_gans');
  };
}

export function startPrologue(game, hero) {
  const flags = {};
  const race = hero.race;
  const H = { race: hero.race, cls: hero.cls, look: hero.look || null, avatar: hero.avatar || null, name: hero.name };
  const dlg = (title, ls, next, wounds = null) => game.setScene(createDialogueScene({ title, lines: ls, hero: H, wounds, onDone: next }));
  // portraits v2: hp/mrl of the hero and allies right after a battle ('npc-gans' -> speaker 'gans')
  const hurtAfter = (S) => Object.fromEntries(S.b.units.filter((u) => u.team !== 'enemies').map((u) => [u.kind === 'hero' && !u.enemyId ? 'hero' : String(baseOf(u)).replace(/^npc-/, ''), wounds(u)]));
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

  const epilogue = () => dlg(t('ep_title'), lines(race, 'ep_main', 'ep_victor', 'ep_seer', 'ep_radio', 'ep_end'), (g) => startWorld(g, hero, flags));
  const after3 = (g, S) => {
    const gans = S.b.units.find((u) => baseOf(u) === 'npc-gans');
    const alive = gans && !gans.dead && !gans.down;
    flags.gansAlive = !!alive;
    dlg(
      t('s3_title'),
      lines(race, 's3_after', alive ? 's3_gans_alive' : 's3_gans_dead', alive ? 's3_lox_alive' : 's3_lox_dead'),
      epilogue,
      hurtAfter(S),
    );
  };
  const scene3 = () => dlg(t('s3_title'), lines(race, 's3_before', 's3_race'), () => battle(3, after3));
  const after2 = (g, S) => dlg(t('s2_title'), lines(race, 's2_after', 's2_after_race', 's2_reveal', 's2_reward'), scene3, hurtAfter(S));
  const scene2 = () => dlg(t('s2_title'), lines(race, 's2_before', 's2_race'), () => battle(2, after2));
  const after1 = (g, S) => dlg(t('s1_title'), lines(race, 's1_after', 's1_reward'), scene2, hurtAfter(S));
  const scene1 = () => dlg(t('s1_title'), lines(race, 's1_before', 's1_race', 's1_tip'), () => battle(1, after1));
  dlg(t('intro_title'), lines(race, 'intro_radio', 'intro_paper', 'intro_arrival', 'seer_meet', 'seer_race', 'explosion'), scene1);
}

/** After the epilogue: a new world save (start reputation includes the prologue result), 350 XP → level 2. */
export function startWorld(game, hero, flags = {}) {
  const save = newSave(hero);
  save.flags['prologue-done'] = true;
  exodusStart(save); // third-exodus.md: the Exodus timer starts with the prologue
  if (flags.gansAlive) save.flags['gans-alive'] = true;
  game.save = save;
  for (const x of gainXp(save, 350, game.data)) game.toast(x.text, x.color);
  journal(save, `${t('world.arrived')}: ${LOCATIONS[START_LOCATION].name}`);
  saveGame(save);
  game.setScene(createNodeScene(START_LOCATION));
}
