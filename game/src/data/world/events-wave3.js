// Контент-волна 3 (docs/specs/content-wave3.md §2 «Цена»): события хозяина Гармонии после w3-flags.
// Схема — как density-events.js (текст прямо в данных), плюс поля волны 3 (world/wave3.js eventDue / markEvent):
//   trigger.every: N — повторяется не чаще раза в N дней (день — save.w3.events[id]); once: false — повторяемое;
//   trigger.since: qid — первый раз не раньше чем через `every` дней после последствий квеста (save.cq[].day).
// Числа: дни и суммы — здесь (баланс крутит balance-tester).
const line = (who, text) => ({ who, text });
const ch = (id, text, success, extra = {}) => ({ id, text, success, ...extra });
const ev = (id, name, flag, trigger, once, scene, choices) => ({
  id, name, region: 'harmony', location: 'alpha-harmony', trigger: { when: 'enter', flags: [flag], since: 'w3-flags', ...trigger },
  once, wave3: true, scene, choices,
});

export const W3_HUB_EVENTS = {
  racketPay: 60,
};

export const EVENTS_WAVE3 = {
  // Отступники: рейды Военпрома раз в 6 дней (бой ур. 9)
  'w3e-ren-raid': ev('w3e-ren-raid', 'Рейд Военпрома', 'harmony-ren', { every: 6 }, false,
    [line('narrator', 'Сирена на периметре. Военпром проверяет стену Отступников: андроиды идут ровно, как по линейке. Комиссар Хрящ машет вам: «Гости. Встречайте».')],
    [ch('fight', 'Встать на стену.', { text: 'Рейд отбит. Хрящ записывает в журнал: «Стена держит. Пункт второй: не быть стеной».', xp: 140, rep: { renegades: 2 }, battle: { encounter: 'enc-w3-raid-wp' } }),
      ch('mines', 'Развести андроидов на мины Яроша.', { text: 'Мины сработали раньше разведки. Андроиды отходят, сапёры считают.', xp: 90, rep: { renegades: 1 } },
        { check: { skill: 'military', dc: 15 }, fail: { text: 'Андроиды обошли мины по линейке. Придётся по-старому.', battle: { encounter: 'enc-w3-raid-wp' }, xp: 100 } })]),
  // Пираты: раз в 8 дней рэкет (платить 60 кр. или бой)
  'w3e-pir-racket': ev('w3e-pir-racket', 'Сбор на общее дело', 'harmony-pir', { every: 8 }, false,
    [line('narrator', 'Таможенник Дубовый перегораживает трап ведомостью: «Сбор на общее дело. Общее — это наше. Дело — ваше. Шестьдесят кредов».')],
    [ch('pay', 'Заплатить 60 кредов.', { text: 'Дубовый ставит галочку. «Груз принят, счёт — потом». Счёт уже пришёл.', credits: -W3_HUB_EVENTS.racketPay }),
      ch('talk', 'Объяснить, кто поднял их флаг.', { text: 'Дубовый вычёркивает вас из ведомости. Карандашом. До следующего раза.', xp: 60 },
        { check: { skill: 'persuasion', dc: 15 }, fail: { text: 'Дубовый слушает, кивает и берёт шестьдесят. За выслушивание.', credits: -W3_HUB_EVENTS.racketPay } }),
      ch('fight', 'Отказаться. Громко.', { text: 'Сборщики пошлины лежат на палубе. Пираты уважают силу. И записывают её в долг.', xp: 120, rep: { pirates: -3 }, battle: { encounter: 'enc-w3-racket' } })]),
  // Совет: протектора нет — один рейд кринжгонов
  'w3e-council-raid': ev('w3e-council-raid', 'Кринжгоны у трапа', 'harmony-council', { every: 5 }, true,
    [line('narrator', 'У трапа — баян, тамада и плакат «Ваш хлеб — наш праздник». Протектора у Гармонии нет. Сера смотрит на вас поверх графика падения.')],
    [ch('fight', 'Встать у трапа.', { text: 'Праздник отменён. Очередь за хлебом аплодирует. Сера записывает: «Протектор — временно есть».', xp: 160, rep: { neutralVillages: 3 }, battle: { encounter: 'enc-w3-raid-crg' } }),
      ch('cringe', 'Перекринжевать тамаду.', { text: 'Тамада уходит в слезах. Баянист — за ним, из солидарности.', xp: 110, rep: { neutralVillages: 2 } },
        { check: { skill: 'persuasion', dc: 16 }, fail: { text: 'Тамада оценил. И остался. Придётся выпроваживать.', battle: { encounter: 'enc-w3-raid-crg' }, xp: 100 } })]),
};
