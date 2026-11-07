// «Насыщенность мира», проход 1: 25 мелких заданий (1 действие: принеси / проверка / бой / выбор).
// Схема — как в world/quests-npc.js: quest(id, name, type, giver, region, level, summary, stages, rewards).
// giver — id NPC из density-npcs.js; location — реальный id узла; бои — только существующие id ENCOUNTERS/ENCOUNTERS_V3.
// Награда: xp ≈ (50…150) × уровень/5 (спека п. 3). `exodus: { ext: N }` — +N дней к сроку исхода (у ~1 из 4, потолок 60 — в коде).
// Проверки без onFail: цель повторяется один раз, потом квест закрывается (как в quests.js failSlot).

const talk = (npc, location) => ({ kind: 'talk', npc, location });
const check = (skills, dc) => ({ kind: 'check', skills, dc });
const battle = (encounter, location) => ({ kind: 'battle', encounter, location });
const item = (id, n = 1) => ({ kind: 'item', item: id, n });
const choice = (options) => ({ kind: 'choice', options });
const st = (id, text, goal, next) => ({ id, text, goal, ...(next === 'done' || next === 'failed' ? { end: next } : { next }) });

// Трёхэтапный мини-квест: поговорить → сделать → вернуться.
const mini = (id, name, giver, loc, region, level, summary, askText, doText, goal, backText, rewards, extra = {}) => ({
  id, name, type: 'mixed', key: false, giver, region, level, requires: null, summary, density: true,
  stages: [
    st('ask', askText, talk(giver, loc), 'do'),
    st('do', doText, goal, 'back'),
    st('back', backText, talk(giver, loc), 'done'),
  ],
  rewards, ...rewards, ...extra,
});

export const QUESTS_DENSITY = [
  // ================= Хаб и ближний круг (ур. 1–3) =================
  mini('dq-antenna', 'Антенна набекрень', 'd-gudok', 'alpha-harmony', 'technikums', 1,
    'Радисту Гудку нужна ровная антенна: эфир шумит, а диктор пропадает на самом интересном.',
    'Гудок тычет пальцем вверх: антенна смотрит не туда.', 'Выправить антенну.',
    check(['tech', 'athletics', 'acrobatics'], 11), 'Сообщить, что диктор снова слышен.',
    { xp: 60, credits: 25, rep: { technikums: 3 } }),
  mini('dq-kotelok', 'Что бросить в котёл', 'd-kotelok', 'harmony-sector-d', 'technikums', 1,
    'Котелок просит два пайка тушёнки, чтобы варить на весь сектор. Камни в суп уже не берут.',
    'Котелок ударяет половником в ржавую стенку: пусто.', 'Принести две тушёнки.',
    item('tushenka', 2), 'Отдать тушёнку Котелку.',
    { xp: 55, items: [{ item: 'bandage', n: 2 }], rep: { technikums: 4 }, deeds: ['help-weak'] }),
  mini('dq-gorshok', 'Горшок с тем самым фикусом', 'd-lopukh', 'garmoniya', 'mutantsPlant', 2,
    'У Лопуха пропал горшок с любимым фикусом. Скорее всего, фикус ушёл сам.',
    'Лопух вздыхает: фикус был ему как родной.', 'Найти, куда делся фикус.',
    check(['perception', 'biology', 'survival'], 12), 'Вернуть фикус Лопуху.',
    { xp: 75, credits: 30, items: [{ item: 'medkit', n: 1 }], rep: { mutantsPlant: 4 } }),
  mini('dq-kapli', 'Вода уходит налево', 'd-kapel', 'gidroponika', 'agrozone', 2,
    'Кто-то отводит воду с южной линии. Капель считает, что это личное оскорбление.',
    'Капель раскладывает чертежи поливных линий.', 'Найти, кто ворует воду.',
    choice([
      { id: 'watch', text: 'Устроить засаду у вентиля.', goal: check(['perception', 'stealth'], 12), next: 'back' },
      { id: 'audit', text: 'Сверить журнал расхода.', goal: check(['analysis', 'tech'], 13), next: 'back' },
      { id: 'sting', text: 'Подкараулить вора и поговорить кулаками.', goal: battle('w-agro-rebels', 'gidroponika'), next: 'back' },
    ]), 'Отчитаться Капелю.',
    { xp: 85, credits: 40, rep: { agrozone: 4 } }),
  mini('dq-myaso', 'Кто таскает мясо', 'd-kost', 'vonyuchka', 'mutantsBeast', 2,
    'Из кладовки стаи пропадает мясо. Кость клянётся, что это не стая, и впервые не врёт.',
    'Кость сопит: запах чужой, но знакомый.', 'Выследить вора.',
    choice([
      { id: 'track', text: 'Пойти по следу.', goal: check(['survival', 'perception'], 12), next: 'back' },
      { id: 'bait', text: 'Выложить приманку.', goal: check(['stealth', 'deception'], 13), next: 'back' },
    ]), 'Сообщить Кости, кто вор.',
    { xp: 80, credits: 25, items: [{ item: 'tushenka', n: 2 }], rep: { mutantsBeast: 4 } }),
  mini('dq-kolodets', 'Колодец раздора', 'd-svechka', 'svyatost', 'neutralVillages', 2,
    'Совет Святости ссорится из-за колодца: восточные не дают воду западным. Свечка просит договориться.',
    'Свечка потирает виски: «Только не убивайте никого. Пока».', 'Помирить стороны.',
    choice([
      { id: 'talk', text: 'Собрать обе стороны и договориться.', goal: check(['persuasion', 'analysis'], 13), next: 'back' },
      { id: 'scare', text: 'Припугнуть самых горластых.', goal: check(['intimidation'], 12), next: 'back' },
      { id: 'pay', text: 'Оплатить ремонт насоса из своих.', goal: { kind: 'pay', credits: 50 }, next: 'back' },
    ]), 'Передать Свечке, что колодец общий.',
    { xp: 90, credits: 50, rep: { neutralVillages: 6 }, deeds: ['help-weak'] }, { exodus: { ext: 2 } }),
  mini('dq-vorony', 'Вороны-разведчики', 'd-ogorod', 'agrara', 'neutralVillages', 3,
    'Огород уверен, что вороны на его поле — шпионы. Огород не шутит и не ошибается.',
    'Огород показывает объеденные грядки и приземлённую ворону в маске из ведра.', 'Разобраться с воронами.',
    choice([
      { id: 'hunt', text: 'Отогнать стаю.', goal: battle('v3-fauna-rats', 'agrara'), next: 'back' },
      { id: 'scare', text: 'Выставить чучело получше.', goal: check(['survival', 'deception'], 12), next: 'back' },
    ]), 'Показать Огороду чистое поле.',
    { xp: 95, credits: 45, items: [{ item: 'rations', n: 1 }], rep: { neutralVillages: 4 } }),
  mini('dq-kolokol', 'Треснувший колокол', 'd-vechevoy', 'peremoga', 'neutralVillages', 2,
    'Колокол Перемоги треснул. Вечевой без него — как без голоса.',
    'Вечевой гладит бронзу и шмыгает носом.', 'Заварить трещину в колоколе.',
    check(['tech', 'athletics'], 13), 'Позвонить в колокол вместе с Вечевым.',
    { xp: 70, credits: 30, rep: { neutralVillages: 4 } }),

  // ================= Второй круг (ур. 3–6) =================
  mini('dq-koren', 'Корешки с болотца', 'd-listva', 'lesyanka', 'mutantsBeast', 3,
    'Матери Листве нужны корешки с болотца. Там кто-то сидит и ворчит.',
    'Листва хмурится: «Сходи, деточка, я стара для таких прогулок».', 'Достать корешки.',
    choice([
      { id: 'sneak', text: 'Пробраться тихо.', goal: check(['stealth', 'survival'], 13), next: 'back' },
      { id: 'fight', text: 'Выгнать болотного жителя.', goal: battle('v3-mutz-pack', 'lesyanka'), next: 'back' },
    ]), 'Принести корешки Листве.',
    { xp: 100, credits: 30, items: [{ item: 'antidote', n: 1 }], rep: { mutantsBeast: 5 } }),
  mini('dq-lom', 'Выход со Свалки', 'd-lom', 'svalka', 'scavengers', 4,
    'Скелет Лом хочет уйти со Свалки так, чтобы охотники на скелетов не заметили.',
    'Лом шепчет: «Если меня найдут — я не я».', 'Провести Лома к воротам.',
    choice([
      { id: 'sneak', text: 'Проскользнуть мимо дозоров.', goal: check(['stealth', 'acrobatics'], 14), next: 'back' },
      { id: 'bribe', text: 'Откупиться от стражи.', goal: { kind: 'pay', credits: 60 }, effects: { deeds: ['greed'] }, next: 'back' },
      { id: 'fight', text: 'Прорваться с боем.', goal: battle('v3-scv-skeleton-hunt', 'svalka'), next: 'back' },
    ]), 'Попрощаться с Ломом у ворот.',
    { xp: 120, credits: 20, rep: { scavengers: -3 }, deeds: ['help-weak'] }, { exodus: { ext: 2 } }),
  mini('dq-shesterni', 'Подменённые шестерёнки', 'd-ryzhik', 'stanok', 'tekhonki', 4,
    'Кто-то подменил шестерёнки в станке Рыжика: теперь он выдаёт гвозди, похожие на запятые.',
    'Рыжик разводит руками, искры летят во все стороны.', 'Выяснить, кто подменил детали.',
    check(['analysis', 'tech', 'proxy'], 14), 'Рассказать Рыжику, что нашли.',
    { xp: 110, credits: 40, items: [{ item: 'servo-parts', n: 1 }], rep: { tekhonki: 5 } }),
  mini('dq-talisman', 'Талисман старого бога', 'd-iskra', 'zavod', 'tekhonki', 4,
    'Искра потеряла талисман, который ей подарил старый бог. Без него она боится грозы.',
    'Искра шмыгает носом и бодрится: «Я не плачу, это дым».', 'Найти талисман.',
    check(['perception', 'proxy', 'survival'], 13), 'Вернуть талисман Искре.',
    { xp: 105, credits: 30, rep: { tekhonki: 5 }, deeds: ['help-weak'] }),
  mini('dq-plata', 'Диагностическая плата', 'd-gaika', 'betonka', 'mechanids', 4,
    'У Гайки сгорела диагностическая плата. Пока её нет, механиды чинят друг друга наугад.',
    'Гайка измеряет что-то вокруг себя и мрачнеет.', 'Принести редкие детали.',
    item('rare-parts', 1), 'Отдать детали Гайке.',
    { xp: 115, credits: 60, rep: { mechanids: 5 } }),
  mini('dq-karta', 'Карта несуществующего берега', 'd-parus', 'raytsentr', 'pirates', 3,
    'В порт пришла карта, на которой нарисован берег, которого нет. Парус хочет понять, шутка это или приглашение.',
    'Парус разворачивает карту: чернила ещё свежие.', 'Определить, откуда карта.',
    check(['analysis', 'perception', 'persuasion'], 13), 'Рассказать Парусу.',
    { xp: 95, credits: 70, rep: { pirates: 4 } }, { exodus: { ext: 2 } }),
  mini('dq-ucheniza', 'Ученица, ушедшая в монастырь', 'd-tatami', 'dodze', 'tinBrotherhood', 4,
    'Одна из учениц Татами ушла в монастырь и пропала. Сэнсэй просит вернуть хотя бы весточку.',
    'Татами молча смотрит в сторону пустого коврика.', 'Найти ученицу.',
    check(['persuasion', 'survival', 'religion'], 13), 'Рассказать Татами, что ученица жива.',
    { xp: 105, credits: 40, rep: { tinBrotherhood: 5 } }),
  mini('dq-kassa', 'Касса сбежавшего букмекера', 'd-gong', 'velikaya-arena', 'tinBrotherhood', 5,
    'Букмекер с Великой Арены сбежал с кассой. Гонг хочет вернуть деньги или хотя бы объяснения.',
    'Гонг стучит себя по лбу, звон идёт долгий.', 'Догнать букмекера.',
    choice([
      { id: 'talk', text: 'Найти и убедить вернуть деньги.', goal: check(['persuasion', 'intimidation'], 14), next: 'back' },
      { id: 'fight', text: 'Выбить из него кассу.', goal: battle('v3-tin-arena', 'velikaya-arena'), next: 'back' },
    ]), 'Передать кассу Гонгу.',
    { xp: 120, credits: 80, rep: { tinBrotherhood: 4 } }),
  mini('dq-shtamp', 'Штамп до ЭВК', 'd-konsul', 'selyshko', 'tinBrotherhood', 3,
    'У младшего консула пропал штамп ещё до ЭВК. Он клянётся, что без него государство не стоит.',
    'Печать вздыхает: «Без штампа я — просто человек».', 'Найти штамп в старых архивах.',
    check(['analysis', 'perception', 'persuasion'], 13), 'Вернуть Печати штамп.',
    { xp: 85, credits: 45, rep: { tinBrotherhood: 3 } }),
  mini('dq-klyuch-kazny', 'Ключ от казны', 'd-dublon', 'pirates-m30', 'pirates', 3,
    'Казначей Дублон потерял ключ от казны. Подозревает чайку. Чайка отрицает.',
    'Дублон считает себя виноватым и чайку тоже.', 'Найти ключ.',
    check(['perception', 'survival', 'lockpicking'], 12), 'Вернуть ключ Дублону.',
    { xp: 80, credits: 65, rep: { pirates: 4 } }),

  // ================= Дальние (ур. 6–9) =================
  mini('dq-yavka', 'Молчащая явка', 'd-flazhok', 'shtabtsentr', 'renegades', 6,
    'Одна из явок Отступников замолчала. Флажок просит проверить, не провал ли это.',
    'Флажок понижает голос: «Это не слежка. Это хуже».', 'Проверить явку.',
    choice([
      { id: 'quiet', text: 'Прокрасться и проверить тихо.', goal: check(['stealth', 'perception'], 14), next: 'back' },
      { id: 'hack', text: 'Взломать канал связи.', goal: check(['hacking'], 14), next: 'back' },
      { id: 'fight', text: 'Войти с шумом и выяснить силой.', goal: battle('v3-ren-ambush', 'shtabtsentr'), next: 'back' },
    ]), 'Доложить Флажку.',
    { xp: 150, credits: 90, rep: { renegades: 6 } }, { exodus: { ext: 2 } }),
  mini('dq-zhetony', 'Жетон рядового Шнурка', 'd-ryadovoy', 'kreml', 'warprom', 6,
    'Рядовой Шнурок потерял жетон. Без жетона — трибунал, а у Шнурка и без трибунала жизнь тяжёлая.',
    'Шнурок молча протягивает развязанный шнурок как доказательство.', 'Найти жетон на плацу.',
    check(['perception', 'military'], 14), 'Вернуть жетон Шнурку.',
    { xp: 140, credits: 60, rep: { warprom: 4 }, deeds: ['help-weak'] }),
  mini('dq-stranitsa', 'Одна страница', 'd-zakladka', 'baza-predlozhki', 'predlozhka', 7,
    'Из архива Предложки пропала одна страница. Закладка уверен, что именно та, что нужна всем.',
    'Закладка прикладывает палец к губам и показывает пустое место на полке.', 'Найти страницу.',
    check(['analysis', 'perception', 'persuasion'], 15), 'Вернуть страницу Закладке.',
    { xp: 170, credits: 50, rep: { predlozhka: 6 } }, { exodus: { ext: 2 } }),
  mini('dq-podval', 'Подвал в руинах', 'd-sluh', 'ruins-m35', 'none', 5,
    'Сталкер Слух нашёл ход в подвал, но один не пойдёт. Предлагает долю.',
    'Слух чешет затылок: «Там что-то дышит».', 'Спуститься в подвал.',
    choice([
      { id: 'sneak', text: 'Спуститься тихо.', goal: check(['stealth', 'perception'], 14), next: 'back' },
      { id: 'fight', text: 'Спуститься с шумом.', goal: battle('w-road-crawlers', 'ruins-m35'), next: 'back' },
    ]), 'Поделить добычу со Слухом.',
    { xp: 130, credits: 100, items: [{ item: 'rare-parts', n: 1 }], rep: {} }),
  mini('dq-tom', 'Недостающий том', 'd-evrika', 'libraries-m39', 'predlozhka', 5,
    'В собрании сочинений недостаёт одного тома. Эврика просит найти его, пока книги не обиделись окончательно.',
    'Эврика гладит пустой корешок и шепчет утешения.', 'Найти недостающий том.',
    check(['analysis', 'perception', 'survival'], 13), 'Поставить том на место.',
    { xp: 125, credits: 45, rep: { predlozhka: 5 } }),
  mini('dq-zapiska', 'Записка за алтарём', 'd-poslushnik', 'sokralnya', 'cult', 8,
    'Послушник Огарок нашёл за алтарём записку, которая ему не понравилась. Просит помочь решить, что с ней делать.',
    'Огарок сжимает записку так, что она уже почти не читается.', 'Решить судьбу записки.',
    choice([
      { id: 'read', text: 'Прочитать и разобраться.', goal: check(['religion', 'analysis'], 15), next: 'back' },
      { id: 'burn', text: 'Сжечь не читая.', goal: check(['deception'], 12), effects: { deeds: ['cult-deal'] }, next: 'back' },
    ]), 'Рассказать Огарку.',
    { xp: 180, credits: 40, rep: { cult: -4 } }),
];

// ---------------------------------------------------------------------------------------------
// КАК ПОДКЛЮЧАТЬ (для программиста):
//   1. world/data.js: `QUESTS` = v1.0 + QUESTS_V3 + QUESTS_NPC — добавить `...QUESTS_DENSITY` (формат — массив, как LIST в quests-npc.js,
//      либо преобразовать в объект по id так же, как там).
//   2. Привязка NPC: у NPC в density-npcs.js уже есть поле `quest` (id квеста). `isNpcQuest` → true.
//   3. Награды: `items: [{ item, n }]` — как в events.js; если квесты читают другой формат (`rewards.items`), нужен адаптер.
//      Поле `exodus: { ext }` — продление срока исхода (спека п. 1), выдаётся один раз (флаг `exo-ext:<id>`).
//   4. `rewards` продублирован на верхний уровень (xp/credits/…) — как в quests-npc.js, где награда лежит в `extra`.
//   5. Бои: v3-fauna-rats, v3-mutz-pack, v3-scv-skeleton-hunt, v3-tin-arena, v3-ren-ambush, w-agro-rebels, w-road-crawlers.
// ---------------------------------------------------------------------------------------------
