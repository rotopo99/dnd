// Предыстории героя (выбор на create-build, вместо/вместе со свободным текстом `hero.backstory`). Спека: world-consequences.md, часть 4.
// Влияют на: старт (rep, предметы, кредиты, флаг), диалоги (теги `topics` открывают реплики/расспросы NPC с `needsTopic`), проверки (skills: +N/преимущество в условии).
// Ограничение: не больше 1 предыстории; одна цена — один недостаток (drawback), чтобы не было «бесплатного» выбора.
// start.rep — прибавка через applyRep (с распространением); start.items — id из ITEMS; races: null — любые играбельные.
export const BACKSTORIES = {
  skyRefugee: { id: 'skyRefugee', name: 'Беженец с Небесного базара', races: null,
    desc: 'Платформа упала в 2013-м, ты выбрался. С тех пор не любишь высоту и любишь лифты.',
    start: { rep: { technikums: 10, pirates: 5 }, items: [{ id: 'rations', n: 2 }], credits: 20, flags: ['bs-sky'] },
    skills: [{ skill: 'acrobatics', bonus: 1 }, { skill: 'survival', bonus: 1 }],
    conditional: [{ skill: 'perception', adv: true, when: 'падение, обрыв, платформа, высота' }],
    topics: ['sky-bazaar', 'harmony-old'], drawback: { phobia: 'heights', note: 'фобия высоты' } },
  aiCourier: { id: 'aiCourier', name: 'Бывший курьер АИ Партии', races: ['human', 'skeleton', 'android'],
    desc: 'Носил пакеты между кабинетами и однажды прочитал один. С тех пор ты в бегах, но с хорошими манерами.',
    start: { rep: { aiParty: 5, renegades: 10 }, items: [{ id: 'electrical-tape', n: 1 }], credits: 40, flags: ['bs-courier'] },
    skills: [{ skill: 'persuasion', bonus: 1 }, { skill: 'stealth', bonus: 1 }],
    conditional: [{ skill: 'deception', adv: true, when: 'притвориться чиновником, документы' }],
    topics: ['ai-bureaucracy', 'putin-leaks'], drawback: { rep: { aiParty: -10 }, note: 'у блокпостов АИ СЛ проверки документов +1 (тебя ищут)' } },
  junkOrphan: { id: 'junkOrphan', name: 'Сирота Свалки', races: ['human', 'android', 'mutant-beast', 'mutant-plant'],
    desc: 'Вырос в кучах лома, грелся о сварку. Знаешь цену каждому болту и каждому доброму слову (болт дороже).',
    start: { rep: { scavengers: 10 }, items: [{ id: 'servo-parts', n: 2 }, { id: 'repair-kit', n: 1 }], credits: 0, flags: ['bs-junk'] },
    skills: [{ skill: 'tech', bonus: 1 }, { skill: 'lockpicking', bonus: 1 }],
    conditional: [{ skill: 'analysis', adv: true, when: 'оценить хлам, найти ценное в мусоре' }],
    topics: ['scav-lore', 'junk-prices'], drawback: { trust: 'торговцы Нейтральных и ЖБ дают −5% на продажу хлама: ты слишком хорошо торгуешься' } },
  techStudent: { id: 'techStudent', name: 'Ученик техникума', races: null,
    desc: 'Два курса, три академа, одна самодельная паяльная лампа. Учили без ID, зато учили.',
    start: { rep: { technikums: 15 }, items: [{ id: 'spare-cell', n: 1 }], credits: 30, flags: ['bs-tech'] },
    skills: [{ skill: 'analysis', bonus: 1 }, { skill: 'hacking', bonus: 1 }],
    conditional: [{ skill: 'tech', adv: true, when: 'чинить, разбирать, паять в хабах Гармонии' }],
    topics: ['technikum-gossip', 'vazgen'], drawback: { hit: -1, note: 'нет опыта боя: −1 к атаке, пока не выиграна первая схватка' } },
  warprom: { id: 'warprom', name: 'Дезертир Военпрома', races: ['human', 'skeleton', 'android'],
    desc: 'Служил, не понравилось. Отпускать не собирались, поэтому ты сам отпустил себя.',
    start: { rep: { warprom: -10, renegades: 10, tinBrotherhood: 5 }, items: [{ id: 'bandage', n: 3 }], credits: 25, flags: ['bs-deserter'] },
    skills: [{ skill: 'military', bonus: 2 }, { skill: 'endurance', bonus: 1 }],
    conditional: [{ skill: 'intimidation', adv: true, when: 'перед солдатами и стражей' }],
    topics: ['warprom-barracks', 'kreml-rumors'], drawback: { note: 'у постов Военпрома розыск стартует с 1 (Приметы)', wanted: { warprom: 1 } } },
  wanderingBard: { id: 'wanderingBard', name: 'Бродячий артист', races: null,
    desc: 'Ездил по Пустошам с гитарой, шарманкой и вечным чувством, что тебя сейчас освистают.',
    start: { rep: { neutralVillages: 10, pirates: 5, cringegons: -5 }, items: [{ id: 'calmers', n: 2 }], credits: 15, flags: ['bs-bard'] },
    skills: [{ skill: 'persuasion', bonus: 1 }, { skill: 'deception', bonus: 1 }],
    conditional: [{ skill: 'meditation', adv: true, when: 'успокоить, сыграть, выдержать кринж' }],
    topics: ['bard-songs', 'inn-gossip'], drawback: { note: 'перформанс на публику (привал): раз в день +кредиты, но кринж-фобия цели ×2' } },
};
// «Бывший послушник Судьи» не нужен: дублирует происхождение cult.

/** Применить как подсказку игроку (текст для окна выбора): имя, плюсы, минус, диалоги. */
export const backstoryHint = (b) => ({ title: b.name, lines: [b.desc, 'Плюс: ' + b.skills.map((s) => `${s.skill} +${s.bonus}`).join(', '), 'Минус: ' + (b.drawback.note || 'есть') ] });

/** Диалоговые «топики», открываемые предысториями: NPC в данных могут ссылаться `needsTopic`. */
export const TOPIC_NOTES = {
  'sky-bazaar': 'Расспросы о падении Небесного базара у выживших пиратов и Люстры; скидка 5% у Барахольщицы Люстры.',
  'harmony-old': 'Старые слухи Гармонии: подсказка к заданию «Сеть терминалов».',
  'ai-bureaucracy': 'С чиновниками АИ: реплика «я из канцелярии», проверка Обмана с преимуществом.',
  'putin-leaks': 'Вопрос о «Путине Марк 2»: открывает слух про кабель связи.',
  'scav-lore': 'Мусорщики говорят как со своим: вход на Свалку без проверки.',
  'junk-prices': 'Подсказка о цене хлама: показывается «честная» цена лома.',
  'technikum-gossip': 'Слухи об изобретениях: скидка на мод у техников (-5%).',
  vazgen: 'Разговор с Вазгеном: дополнительная реплика-подсказка.',
  'warprom-barracks': 'Знаешь пароли казарм: Военпром даёт вход без пошлины.',
  'kreml-rumors': 'Слухи о Кремле: открывает скрытый узел «Коридоры под Кремлём».',
  'bard-songs': 'Спеть в таверне: заработок и слух раз в день.',
  'inn-gossip': 'Трактирщики делятся слухами без платы.',
};

/**
 * Расспросы предысторий у NPC (topics): строка появляется в «Расспросить» у NPC перечисленных фракций (factions) или по id (npcs).
 * Один раз на NPC даёт мелочь (fx: xp / credits / hook — открыть узел на карте). Логика — world/backstory.js backstoryTopics.
 */
export const TOPIC_TALK = {
  'sky-bazaar': { factions: ['pirates'], q: 'Я был на Небесном базаре, когда он падал.', a: 'Ты тоже?! Тогда ты знаешь, почему мы не швартуемся у высоких причалов. Держи — за выживших.', fx: { credits: 15 } },
  'harmony-old': { factions: ['technikums'], q: 'Помнишь, как Гармония жила до терминалов?', a: 'Помню. Тогда сеть была для связи, а не для душ. Ищи узлы, где провода тянутся вниз, а не вверх.', fx: { xp: 30 } },
  'ai-bureaucracy': { factions: ['aiParty'], q: 'Я из канцелярии. Бывшей.', a: 'А-а, коллега… Тогда вот вам неофициально: в архиве талонов есть дыра. Только я вам не говорил.', fx: { xp: 30, hook: 'putinlyandiya' } },
  'putin-leaks': { factions: ['aiParty', 'renegades'], q: 'Что известно о «Путине Марк 2»?', a: 'Кабель связи идёт под Путинляндией. Кто его найдёт — услышит, о чём молчит Партия.', fx: { xp: 40 } },
  'scav-lore': { factions: ['scavengers'], q: 'Я вырос на Свалке. У третьей кучи, где сварка.', a: 'Так ты наш! Чего сразу не сказал. На, это не продаётся — это своим.', fx: { credits: 20 } },
  'junk-prices': { factions: ['scavengers', 'neutralVillages'], q: 'Сколько на самом деле стоит этот лом?', a: 'Вдвое меньше, чем просят, и втрое больше, чем дают. Торгуйся — ты умеешь.', fx: { xp: 20 } },
  'technikum-gossip': { factions: ['technikums', 'tekhonki'], q: 'Что нового изобрели в техникуме?', a: 'Паяльник, который паяет сам. Пока только пальцы. Но идея хорошая.', fx: { xp: 25 } },
  vazgen: { npcs: ['vazgen'], q: 'Вазген, я у вас учился. Два курса.', a: 'Помню! Ты тот, кто сжёг лабораторию дважды. Ладно, слушай: терминалы культа боятся частоты 50 герц. Не спрашивай.', fx: { xp: 40 } },
  'warprom-barracks': { factions: ['warprom'], q: 'Пароль казармы: «Ржавчина спит».', a: '…Отзыв: «Сталь не спит». Проходи, служивый. Я тебя не видел.', fx: { xp: 30 } },
  'kreml-rumors': { factions: ['warprom', 'renegades'], q: 'Под Кремлём правда есть коридоры?', a: 'Есть. Вход — через старые подземелья. Кто туда ходит, возвращается молчаливым.', fx: { xp: 30, hook: 'dungeons-m12' } },
  'bard-songs': { factions: ['neutralVillages', 'pirates', 'cringegons'], q: 'Хотите песню? Я пел по всем Пустошам.', a: 'Только не про маяки! …Ладно, давай. Красиво. На, за песню.', fx: { credits: 15 } },
  'inn-gossip': { factions: ['neutralVillages', 'pirates', 'technikums'], q: 'Что болтают в трактирах?', a: 'Что культ скупает банки. Пустые. Для чего — никто не знает, но цены на банки растут.', fx: { xp: 20 } },
};
