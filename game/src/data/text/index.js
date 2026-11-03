import { PROLOGUE } from './prologue.js';

const ru = {
  title: 'DnD',
  subtitle: 'Студия агентов готова. Концепт — скоро.',

  // ---------- battle UI ----------
  'battle.move': 'Движение',
  'battle.attack': 'Атака',
  'battle.ability': 'Способность',
  'battle.dash': 'Рывок',
  'battle.disengage': 'Отход',
  'battle.endTurn': 'Конец хода',
  'battle.yourTurn': 'Твой ход',
  'battle.enemyTurn': 'Ход врага',
  'battle.allyTurn': 'Ход союзника',
  'battle.round': 'Раунд',
  'battle.initiative': 'Инициатива',
  'battle.action': 'Действие',
  'battle.bonus': 'Бонусное',
  'battle.reaction': 'Реакция',
  'battle.hit': 'Попадание',
  'battle.miss': 'Промах',
  'battle.crit': 'Крит!',
  'battle.cover': 'Укрытие',
  'battle.advantage': 'Преимущество',
  'battle.disadvantage': 'Помеха',
  'battle.save': 'Спасбросок',
  'battle.saveOk': 'Спасбросок удался',
  'battle.saveFail': 'Спасбросок провален',
  'battle.noEnr': 'Не хватает ЭНР',
  'battle.outOfRange': 'Далеко',
  'battle.noLine': 'Нет линии огня',
  'battle.victory': 'Победа',
  'battle.defeat': 'Поражение',
  'battle.retry': 'Ещё раз',
  'battle.continue': 'Дальше',
  'battle.skip': 'Пропустить',

  // ---------- resources ----------
  'res.hp': 'ЗДР',
  'res.mrl': 'МРЛ',
  'res.enr': 'ЭНР',
  'res.kb': 'КБ',
  'res.hp.full': 'Здоровье',
  'res.mrl.full': 'Мораль',
  'res.enr.full': 'Энергия',
  'res.kb.full': 'Класс брони',

  // ---------- states ----------
  'state.unconscious': 'Без сознания',
  'state.dead': 'Мёртв',
  'state.stunned': 'Оглушение',
  'state.strain': 'Надлом',
  'state.breakdown': 'Срыв',
  'state.heartbreak': 'Разрыв сердца',
  'state.lostControl': 'Потеря контроля',
};

// Fallback to story texts (prologue keys) so map `intro` keys resolve via t().
// Note: dialogue keys return arrays of { who, text }.
export const t = (key) => ru[key] ?? PROLOGUE[key] ?? key;
