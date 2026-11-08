// Квесты мира v1.0. Спека: docs/specs/world.md, п. 5 и 8. NPC — id из game/src/data/npcs.js, бои — id из ENCOUNTERS
// (game/src/data/enemies.js), узлы — locations.js. Тексты короткие, в данных; сценарист может заменить их ключами.
//
// Квест: { id, name, type: 'combat'|'search'|'talk'|'mixed', key, giver (npc id), region, level, requires, summary,
//          stages: [Stage], rewards: Effects }
// Stage: { id, text, goal: Goal, next?: stage id, end?: 'done'|'failed' }
// Goal (закрытый список):
//   { kind: 'reach', location }
//   { kind: 'talk', npc, location? }
//   { kind: 'battle', encounter, location }
//   { kind: 'check', skills: [..], dc, group?, onFail?: stage id }       — одна проверка (бросает выбранный член партии)
//   { kind: 'challenge', skills: [..], dc, successes, failures, onFail }  — испытание навыков
//   { kind: 'item', item, n }                                            — иметь предмет (забирается)
//   { kind: 'pay', credits }
//   { kind: 'terminal', terminal, location }                             — разобраться с терминалом (TERMINAL_ACTIONS)
//   { kind: 'all', goals: [Goal], min? }                                 — все подцели (или min из них) в любом порядке;
//                                                                          у подцели: doneFlag? (засчитана флагом), location?
//   { kind: 'choice', options: [Option] }
// Option: { id, text, requires?, goal?: Goal, effects?: Effects, next }
// Requires: { avgLevel } | { terminalsOff: N } | { visitedRegions: [..] } | { flags: [..] } | { any: [Requires] } | { not: Requires } |
//           { flag } | { notFlag } | { rep: { faction, min: tier } } | { worldFlag } | { alignment } | { item } | { credits }
// Effects: { xp, credits, rep: { faction: delta } (с распространением), deeds: [tag], flags: [flag], items: [{ item, n }],
//            removeItems, talent, talentChoice: [id], recruit: npc id, terminal: { id, state }, text }

import { EXODUS_GATES as G } from './exodus.js';

const LIST = [
  // ==================================================================== КЛЮЧЕВЫЕ
  {
    id: 'mq-exodus', name: 'Третий исход', type: 'mixed', key: true, giver: 'sera', region: 'corruption', level: 17,
    requires: { flag: 'prologue-done' },
    summary: 'Сеть ритуальных терминалов культа сходится в Коррупция-Сити. Найти Главный узел и закрыть его.',
    finaleMods: [
      { terminalsOff: true, desc: 'Каждый выключенный или перепрошитый терминал убирает врага (ENCOUNTERS["w-cc-finale"].reduce).' },
      { flag: 'beacons-out', allies: ['rebel-gunner'], desc: 'Ополченец Нейтральных селений в финале.' },
      { flag: 'agro-marta', allies: ['rebel-veteran'], desc: 'Минёр Марты в финале.' },
      { flag: 'agro-order', allies: ['cleaner'], desc: 'Чистильщик в финале (Партии культ тоже не нужен).' },
      { flag: 'agro-truce', allies: ['rebel-gunner'], desc: 'Ополченец перемирия в финале.' },
    ],
    stages: [
      { id: 'data', text: 'Сера сняла данные с терминала аколита: главный узел — в Коррупция-Сити.',
        goal: { kind: 'talk', npc: 'sera', location: 'alpha-harmony' }, next: 'go-city' },
      { id: 'go-city', text: 'Добраться до ворот Коррупция-Сити.',
        goal: { kind: 'reach', location: 'cc-gate' }, next: 'get-in' },
      { id: 'get-in', text: 'Пройти ворота.', goal: { kind: 'choice', options: [
        { id: 'citizen', text: 'Показать, что Партия тебе не враг.', requires: { rep: { faction: 'aiParty', min: 'neutral' } }, next: 'find-node' },
        { id: 'forge', text: 'Пройти по поддельному ID.', goal: { kind: 'check', skills: ['deception', 'hacking'], dc: 15, onFail: 'gate-fight' },
          next: 'find-node' },
        { id: 'pay', text: 'Заплатить «пошлину» 100 кредов.', goal: { kind: 'pay', credits: 100 }, next: 'find-node' },
        { id: 'fight', text: 'Прорваться.', goal: { kind: 'battle', encounter: 'w-cc-gate', location: 'cc-gate' },
          effects: { rep: { aiParty: -10 } }, next: 'find-node' },
      ] } },
      { id: 'gate-fight', text: 'Обман раскрыт. Чистильщики поднимают стволы.',
        goal: { kind: 'battle', encounter: 'w-cc-gate', location: 'cc-gate' }, next: 'find-node' },
      // гейт third-exodus.md §2: предупреждение, не стена (флаг риска)
      { id: 'find-node', text: 'Узнать, где Главный узел.',
        requires: { any: [{ avgLevel: G.findNode }, { flag: 'gate-passed-early' }] },
        gate: { text: 'exodus.gateFindNode', vars: { n: G.findNode } }, risk: { flag: 'gate-passed-early', text: 'exodus.gateRisk' },
        goal: { kind: 'choice', options: [
        { id: 'archon', text: 'Расспросить Архонта — «сосуд», который выжил.', goal: { kind: 'talk', npc: 'archon', location: 'cc-dead-streets' },
          effects: { flags: ['cc-node-found'] }, next: 'assault' },
        { id: 'trace', text: 'Вычислить узел по потокам душ.', goal: { kind: 'check', skills: ['analysis', 'judge', 'hacking'], dc: 16 },
          effects: { flags: ['cc-node-found'] }, next: 'assault' },
        { id: 'alik', text: 'Купить сведения у Алика (80 кредов).', goal: { kind: 'pay', credits: 80 },
          effects: { flags: ['cc-node-found'], deeds: ['greed'] }, next: 'assault' },
        { id: 'already', text: 'Ты уже знаешь, где узел.', requires: { flag: 'cc-node-found' }, next: 'assault' },
      ] } },
      // жёсткий гейт: ср. ур. 17 ИЛИ воплощение (exodus-zero) ИЛИ 3 из 5 терминалов закрыто и посещены Военпром и Кринжгоны
      { id: 'assault', text: 'Штурмовать Главный узел. Каждый закрытый терминал облегчит бой.',
        requires: { any: [{ avgLevel: G.assault }, { flag: 'exodus-zero' }, { terminalsOff: G.assaultTerminals, visitedRegions: G.assaultRegions }] },
        gate: { text: 'exodus.gateAssault', vars: { lvl: G.assault, term: G.assaultTerminals } },
        goal: { kind: 'battle', encounter: 'w-cc-finale', location: 'cc-node' }, next: 'close' },
      { id: 'close', text: 'Кибер-Жрец повержен. Что сделать с узлом?', goal: { kind: 'choice', options: [
        { id: 'destroy', text: 'Сломать узел.', goal: { kind: 'check', skills: ['tech', 'athletics', 'military'], dc: 13 },
          effects: { flags: ['node-destroyed'], rep: { cult: -20 }, deeds: ['honor'] }, next: 'report' },
        { id: 'reflash', text: 'Перепрошить узел: души пойдут не к Судье, а домой.', goal: { kind: 'check', skills: ['hacking', 'judge'], dc: 17 },
          effects: { flags: ['node-reflashed'], rep: { cult: -30 }, deeds: ['mercy'], talentChoice: ['judge-eye', 'darkness-resistance'] }, next: 'report' },
      ] } },
      { id: 'report', text: 'Вернуться к Сере.', goal: { kind: 'talk', npc: 'sera', location: 'alpha-harmony' }, end: 'done' },
    ],
    rewards: { xp: 1000, credits: 300, rep: { technikums: 20 }, flags: ['exodus-stopped'] },
  },

  {
    id: 'mq-beacons', name: 'Кринж-маяки', type: 'mixed', key: true, giver: 'elder-ulyana', region: 'villages', level: 2,
    requires: null,
    summary: 'На границе Нейтральных селений горят кринж-маяки. Погасить три маяка и узнать, кто такой «Великий Собиратель».',
    stages: [
      { id: 'ask', text: 'Старейшина Ульяна просит погасить маяки.', goal: { kind: 'talk', npc: 'elder-ulyana', location: 'svyatost' }, next: 'beacons' },
      { id: 'beacons', text: 'Погасить маяки: северный, восточный и болотный (о нём знает пленный Хихик).', goal: { kind: 'all', goals: [
        // Внутри choice подцели «all» onFail указывает id другой опции того же choice (бой вместо проверки).
        // Подцель засчитана, если стоит флаг doneFlag (например, маяк погашен в ивенте Артёма, events.js).
        { kind: 'choice', doneFlag: 'beacon-1-off', location: 'beacon-1', options: [
          { id: 'n-fight', text: 'Разбить северный маяк.', goal: { kind: 'battle', encounter: 'w-villages-beacon', location: 'beacon-1' }, effects: { flags: ['beacon-1-off'] }, next: null },
          { id: 'n-tech', text: 'Выключить северный маяк.', goal: { kind: 'check', skills: ['tech', 'hacking', 'religion'], dc: 14, onFail: 'n-fight' }, effects: { flags: ['beacon-1-off'] }, next: null },
        ] },
        { kind: 'choice', doneFlag: 'beacon-2-off', location: 'beacon-2', options: [
          { id: 'e-fight', text: 'Разбить восточный маяк.', goal: { kind: 'battle', encounter: 'w-villages-beacon', location: 'beacon-2' }, effects: { flags: ['beacon-2-off'] }, next: null },
          { id: 'e-tech', text: 'Выключить восточный маяк.', goal: { kind: 'check', skills: ['tech', 'hacking', 'religion'], dc: 14, onFail: 'e-fight' }, effects: { flags: ['beacon-2-off'] }, next: null },
        ] },
        { kind: 'choice', doneFlag: 'beacon-3-off', location: 'beacon-3', options: [
          { id: 's-fight', text: 'Разбить болотный маяк.', goal: { kind: 'battle', encounter: 'w-villages-beacon', location: 'beacon-3' }, effects: { flags: ['beacon-3-off'] }, next: null },
          { id: 's-tech', text: 'Выключить болотный маяк.', goal: { kind: 'check', skills: ['tech', 'hacking', 'religion'], dc: 16, onFail: 's-fight' }, effects: { flags: ['beacon-3-off'] }, next: null },
        ] },
      ] }, next: 'collector' },
      { id: 'collector', text: 'Кто такой Великий Собиратель? Спросить пленного или смотрителя маяка.', goal: { kind: 'choice', options: [
        { id: 'khikhik', text: 'Поговорить с Хихиком.', goal: { kind: 'talk', npc: 'prisoner-khikhik', location: 'svyatost' },
          effects: { flags: ['beacons-khikhik'], deeds: ['mercy'] }, next: 'report' },
        { id: 'keeper', text: 'Допросить Маячника.', goal: { kind: 'check', skills: ['intimidation', 'deception', 'persuasion'], dc: 14 },
          effects: { flags: ['beacons-keeper'], deeds: ['lie'] }, next: 'report' },
      ] } },
      { id: 'report', text: 'Рассказать совету.', goal: { kind: 'talk', npc: 'elder-ulyana', location: 'svyatost' }, end: 'done' },
    ],
    rewards: { xp: 600, credits: 120, rep: { neutralVillages: 20 }, flags: ['beacons-out', 'collector-known'] },
  },

  {
    id: 'mq-agro-fire', name: 'Агрозона в огне', type: 'mixed', key: true, giver: 'amanda', region: 'agrozone', level: 2,
    requires: { flag: 'prologue-done' },
    summary: 'Пайков на неделю. Пайки идут из горящей Агрозоны. Решить, кто там победит, — и привезти еду.',
    stages: [
      { id: 'ask', text: 'Аманде нужен кто-то «снаружи».', goal: { kind: 'talk', npc: 'amanda', location: 'alpha-harmony' }, next: 'go' },
      { id: 'go', text: 'Добраться до горящих полей.', goal: { kind: 'reach', location: 'battlefields-m11' }, next: 'kolos' },
      { id: 'kolos', text: 'Дед Колос объяснит, кто с кем воюет.', goal: { kind: 'talk', npc: 'grandpa-kolos', location: 'battlefields-m11' }, next: 'choose' },
      { id: 'choose', text: 'Чью сторону принять?', goal: { kind: 'choice', options: [
        { id: 'marta', text: 'За Марту: снести блокпост Чистильщиков.', goal: { kind: 'talk', npc: 'marta', location: 'ruins-m37' },
          effects: { flags: ['agro-marta'] }, next: 'checkpoint' },
        { id: 'order', text: 'За порядок: помочь надзирательнице Норме подавить «Свободу».', goal: { kind: 'talk', npc: 'overseer-norma', location: 'gidroponika' },
          effects: { flags: ['agro-order'] }, next: 'raid' },
        { id: 'truce', text: 'Перемирие: усадить обе стороны за стол.', requires: { notFlag: 'truce-failed' },
          goal: { kind: 'challenge', skills: ['persuasion', 'intimidation', 'military', 'deception'], dc: 16, successes: 5, failures: 3, onFail: 'truce-fail' },
          effects: { flags: ['agro-truce'], deeds: ['mercy'], rep: { neutralVillages: 10, renegades: 5, agrozone: 5 } }, next: 'rations' },
      ] } },
      { id: 'truce-fail', text: 'Переговоры сорвались. Теперь придётся выбирать.', goal: { kind: 'choice', options: [
        { id: 'marta2', text: 'За Марту.', goal: { kind: 'talk', npc: 'marta', location: 'ruins-m37' }, effects: { flags: ['agro-marta', 'truce-failed'] }, next: 'checkpoint' },
        { id: 'order2', text: 'За порядок.', goal: { kind: 'talk', npc: 'overseer-norma', location: 'gidroponika' }, effects: { flags: ['agro-order', 'truce-failed'] }, next: 'raid' },
      ] } },
      { id: 'checkpoint', text: 'Взять блокпост Чистильщиков.', goal: { kind: 'battle', encounter: 'w-agro-checkpoint', location: 'cleaner-checkpoint' },
        next: 'marta-win' },
      { id: 'marta-win', text: 'Блокпост пал.', goal: { kind: 'talk', npc: 'marta', location: 'ruins-m37' }, next: 'rations' },
      { id: 'raid', text: 'Штурмовать бург «Свобода».', goal: { kind: 'battle', encounter: 'w-agro-svoboda-raid', location: 'ruins-m37' },
        next: 'order-win' },
      { id: 'order-win', text: 'Восстание подавлено.', goal: { kind: 'talk', npc: 'overseer-norma', location: 'gidroponika' }, next: 'rations' },
      { id: 'rations', text: 'Привезти пайки Аманде.', goal: { kind: 'talk', npc: 'amanda', location: 'alpha-harmony' }, end: 'done' },
    ],
    // Репутация за выбор стороны начисляется в этапах-«победах» (ниже, rewardsByFlag), чтобы провал боя её не давал.
    rewardsByFlag: {
      'agro-marta': { rep: { renegades: 20 }, deeds: ['free-slaves'] },
      'agro-order': { rep: { agrozone: 20 }, deeds: ['serve-ai'] },
    },
    rewards: { xp: 600, credits: 150, rep: { technikums: 10 }, flags: ['rations-delivered'] },
  },

  // ==================================================================== ХАБ (необязательные)
  {
    id: 'sq-terminals', name: 'Сеть терминалов', type: 'mixed', key: false, giver: 'sera', region: 'harmony', level: 2,
    requires: { flag: 'prologue-done' },
    summary: 'Сера нашла в данных аколита ещё пять ритуальных терминалов. Каждый закрытый — минус враг в финале.',
    stages: [
      { id: 'map', text: 'Сера отмечает терминалы на карте.', goal: { kind: 'talk', npc: 'sera', location: 'alpha-harmony' },
        effects: { flags: ['terminals-marked'] }, next: 'hunt' },
      { id: 'hunt', text: 'Разобраться с терминалами (можно в любом порядке и не все — квест засчитан при трёх).', goal: { kind: 'all', min: 3, goals: [
        { kind: 'terminal', terminal: 'term-villages', location: 'ostanovka' },
        { kind: 'terminal', terminal: 'term-agrozone', location: 'ruins-m38' },
        { kind: 'terminal', terminal: 'cc-terminal-1', location: 'putinlyandiya' },
        { kind: 'terminal', terminal: 'cc-terminal-2', location: 'cc-dead-streets' },
        { kind: 'terminal', terminal: 'cc-terminal-3', location: 'cc-temple' },
      ] }, next: 'report' },
      { id: 'report', text: 'Доложить Сере.', goal: { kind: 'talk', npc: 'sera', location: 'alpha-harmony' }, end: 'done' },
    ],
    rewards: { xp: 400, credits: 100, rep: { technikums: 10 }, talentChoice: ['cyber-dreams', 'spirit-mark'] },
  },
  {
    id: 'sq-sector-d', name: 'Пустой котёл', type: 'mixed', key: false, giver: 'riot-boss', region: 'harmony', level: 1,
    requires: { flag: 'prologue-done' },
    summary: 'Бородач Тушёнкин ведёт сектор D на склад. Остановить бунт — словом, едой или силой.',
    stages: [
      { id: 'meet', text: 'Сектор D кипит.', goal: { kind: 'talk', npc: 'riot-boss', location: 'harmony-sector-d' }, next: 'solve' },
      { id: 'solve', text: 'Как успокоить сектор?', goal: { kind: 'choice', options: [
        { id: 'talk', text: 'Уговорить подождать пайков.', goal: { kind: 'challenge', skills: ['persuasion', 'intimidation', 'medicine', 'endurance'], dc: 13, successes: 3, failures: 2, onFail: 'riot' },
          effects: { deeds: ['help-weak'] }, next: 'done' },
        { id: 'food', text: 'Принести ящик пайков (у боцмана Сухаря).', goal: { kind: 'item', item: 'rations', n: 1 },
          effects: { deeds: ['help-weak'], rep: { technikums: 5 } }, next: 'done' },
        { id: 'force', text: 'Разогнать.', goal: { kind: 'battle', encounter: 'w-harmony-riot', location: 'harmony-sector-d' },
          effects: { deeds: ['cruelty'] }, next: 'done' },
      ] } },
      { id: 'riot', text: 'Не вышло. Толпа идёт на склад.', goal: { kind: 'battle', encounter: 'w-harmony-riot', location: 'harmony-sector-d' }, next: 'done' },
      { id: 'done', text: 'Сектор D затих. Пока.', goal: { kind: 'talk', npc: 'victor-sundown', location: 'alpha-harmony' }, end: 'done' },
    ],
    rewards: { xp: 150, credits: 40, rep: { technikums: 5 } },
  },
  {
    id: 'sq-povestka', name: 'Повестка в суд', type: 'mixed', key: false, giver: 'brother-povestka', region: 'harmony', level: 1,
    requires: { flag: 'prologue-done' },
    summary: 'Брат Повестка вербует голодных в культ. Разоблачить ячейку — или подписать повестку.',
    stages: [
      { id: 'meet', text: 'Вербовщик раздаёт листовки «Суд идёт — и он накормит».', goal: { kind: 'talk', npc: 'brother-povestka', location: 'harmony-sector-d' }, next: 'choose' },
      { id: 'choose', text: 'Что делать с вербовщиком?', goal: { kind: 'choice', options: [
        { id: 'expose', text: 'Выследить ячейку.', goal: { kind: 'check', skills: ['perception', 'deception', 'stealth', 'analysis'], dc: 13, onFail: 'cell' },
          next: 'cell' },
        { id: 'join', text: 'Подписать повестку (злой путь).', requires: { alignment: 'evil' },
          effects: { rep: { cult: 15, technikums: -15 }, deeds: ['cult-deal'], credits: 100 }, next: 'end-dark' },
      ] } },
      { id: 'cell', text: 'Ячейка в трюме. Её надо брать.', goal: { kind: 'battle', encounter: 'w-harmony-cult-cell', location: 'harmony-sector-d' },
        effects: { rep: { technikums: 10 } }, next: 'end-light' },
      { id: 'end-light', text: 'Доложить Сандауну.', goal: { kind: 'talk', npc: 'victor-sundown', location: 'alpha-harmony' }, end: 'done' },
      { id: 'end-dark', text: 'Повестка подписана. Судья запомнил твоё имя.', goal: { kind: 'reach', location: 'mesto-krusheniya-alfa-garmonii' }, end: 'done' },
    ],
    rewards: { xp: 200 },
  },
  {
    id: 'sq-aynura', name: 'Руки для Айнуры', type: 'search', key: false, giver: 'aynura', region: 'harmony', level: 1,
    requires: null,
    summary: 'Айнура потеряла конечности при прошлой эвакуации. Никола соберёт протезы, если найти довоенные сервоприводы.',
    stages: [
      { id: 'ask', text: 'Айнура просит о помощи — спокойно, как андроид.', goal: { kind: 'talk', npc: 'aynura', location: 'alpha-harmony' }, next: 'find' },
      { id: 'find', text: 'Найти сервоприводы (говорят, в довоенном бункере у Нейтральных селений).', goal: { kind: 'item', item: 'servo-parts', n: 1 }, next: 'nikola' },
      { id: 'nikola', text: 'Отнести детали Николе.', goal: { kind: 'talk', npc: 'nikola', location: 'alpha-harmony' }, end: 'done' },
    ],
    rewards: { xp: 200, rep: { technikums: 10 }, deeds: ['help-weak'], talent: 'builtin-scanner' },
  },

  {
    id: 'sq-cult-mines', name: 'Закладки культа', type: 'search', key: false, giver: 'gans', region: 'harmony', level: 1,
    requires: { flag: 'prologue-done' },
    summary: 'Ганс знает три закладки культа на станции и чует четвёртую. Один не успеет.',
    stages: [
      { id: 'ask', text: '«Три точки знаю, четвёртую чую».', goal: { kind: 'talk', npc: 'gans', location: 'harmony-post' }, next: 'search' },
      { id: 'search', text: 'Найти и обезвредить закладки (провал — взрыв: −4 ЗДР всем, закладка всё равно снята).', goal: { kind: 'all', goals: [
        { kind: 'check', skills: ['perception', 'tech'], dc: 12, location: 'harmony-reactor' },
        { kind: 'check', skills: ['perception', 'tech'], dc: 12, location: 'harmony-sector-d' },
        { kind: 'check', skills: ['perception', 'tech'], dc: 12, location: 'harmony-workshop' },
        { kind: 'check', skills: ['perception', 'analysis', 'judge'], dc: 15, location: 'mesto-krusheniya-alfa-garmonii' },
      ] }, next: 'report' },
      { id: 'report', text: 'Доложить Гансу.', goal: { kind: 'talk', npc: 'gans', location: 'harmony-post' }, end: 'done' },
    ],
    rewards: { xp: 200, rep: { technikums: 5 }, deeds: ['mercy'], talentChoice: ['cold-blood', 'bullet-dodge'] },
  },

  // ==================================================================== НЕЙТРАЛЬНЫЕ СЕЛЕНИЯ
  {
    id: 'sq-galina-hatch', name: 'Что в люке', type: 'mixed', key: false, giver: 'galina', region: 'villages', level: 1,
    requires: null,
    summary: 'Под дачей Галины — люк в довоенный бункер. Оттуда скребутся.',
    stages: [
      { id: 'ask', text: 'Галина нехотя признаётся про люк.', goal: { kind: 'talk', npc: 'galina', location: 'dacha-babki' },
        effects: { flags: ['galina-told'] }, next: 'clear' },
      { id: 'clear', text: 'Зачистить бункер.', goal: { kind: 'battle', encounter: 'w-villages-hatch', location: 'bunker-lisa' }, next: 'back' },
      { id: 'back', text: 'Рассказать Галине.', goal: { kind: 'talk', npc: 'galina', location: 'dacha-babki' }, end: 'done' },
    ],
    rewards: { xp: 250, credits: 50, rep: { neutralVillages: 5 }, talentChoice: ['ancestors-blessing', 'tech-archaeologist'] },
  },
  {
    id: 'sq-khikhik', name: 'Пленный Хихик', type: 'talk', key: false, giver: 'innkeeper-pelmen', region: 'villages', level: 1,
    requires: null,
    summary: 'В сарае сидит пленный кринжгон. Селяне хотят его казнить. Он знает про болотный маяк.',
    stages: [
      { id: 'meet', text: 'Пельмень шепчет: завтра Хихика повесят.', goal: { kind: 'talk', npc: 'prisoner-khikhik', location: 'svyatost' }, next: 'decide' },
      { id: 'decide', text: 'Что будет с Хихиком?', goal: { kind: 'choice', options: [
        { id: 'free', text: 'Отпустить: пусть расскажет и уходит.', effects: { flags: ['khikhik-talked', 'khikhik-free'], deeds: ['mercy'], rep: { neutralVillages: -5 } }, next: 'end' },
        { id: 'interrogate', text: 'Выбить сведения.', goal: { kind: 'check', skills: ['intimidation', 'deception'], dc: 13 },
          effects: { flags: ['khikhik-talked'], deeds: ['cruelty'] }, next: 'end' },
        { id: 'plead', text: 'Убедить совет обменять его на сведения.', goal: { kind: 'check', skills: ['persuasion'], dc: 15 },
          effects: { flags: ['khikhik-talked'], deeds: ['honor'], rep: { neutralVillages: 5 } }, next: 'end' },
        { id: 'hang', text: 'Не вмешиваться.', effects: { flags: ['khikhik-dead'] }, next: 'end' },
      ] } },
      { id: 'end', text: 'Судьба Хихика решена.', goal: { kind: 'reach', location: 'svyatost' }, end: 'done' },
    ],
    rewards: { xp: 150 },
  },
  {
    id: 'sq-timokha', name: 'Овцы Тимохи', type: 'search', key: false, giver: 'shepherd-timokha', region: 'villages', level: 1,
    requires: null,
    summary: 'У пастуха Тимохи ползуны угнали стадо к границе. Найдёшь — пойдёт с тобой.',
    stages: [
      { id: 'ask', text: 'Тимоха мрачно чистит ружьё.', goal: { kind: 'talk', npc: 'shepherd-timokha', location: 'svyatost' }, next: 'track' },
      { id: 'track', text: 'Выследить стадо.', goal: { kind: 'check', skills: ['survival', 'perception', 'biology'], dc: 12, onFail: 'nest' }, next: 'nest' },
      { id: 'nest', text: 'Ползуны у стада.', goal: { kind: 'battle', encounter: 'w-road-crawlers', location: 'dozorka-dzhona' }, next: 'back' },
      { id: 'back', text: 'Вернуть овец.', goal: { kind: 'talk', npc: 'shepherd-timokha', location: 'svyatost' }, end: 'done' },
    ],
    rewards: { xp: 150, rep: { neutralVillages: 5 }, recruit: 'shepherd-timokha' },
  },

  // ==================================================================== АГРОЗОНА
  {
    id: 'sq-zarya', name: 'Дезертир', type: 'mixed', key: false, giver: 'zarya', region: 'agrozone', level: 2,
    requires: null,
    summary: 'Заря ушла из Чистильщиков. Её ищет патруль.',
    stages: [
      { id: 'meet', text: 'Заря прячется в сгоревшем амбаре.', goal: { kind: 'talk', npc: 'zarya', location: 'battlefields-m11' }, next: 'decide' },
      { id: 'decide', text: 'Патруль уже близко.', goal: { kind: 'choice', options: [
        { id: 'protect', text: 'Встать за неё.', goal: { kind: 'battle', encounter: 'w-agro-cleaners', location: 'battlefields-m11' },
          effects: { deeds: ['mercy'], rep: { agrozone: -10 }, recruit: 'zarya' }, next: 'end' },
        { id: 'hide', text: 'Спрятать всех.', goal: { kind: 'check', skills: ['stealth', 'acrobatics', 'persuasion'], dc: 14, group: true, onFail: 'fight' },
          effects: { deeds: ['mercy'], recruit: 'zarya' }, next: 'end' },
        { id: 'handover', text: 'Сдать патрулю.', effects: { deeds: ['cruelty', 'serve-ai'], rep: { agrozone: 10 }, credits: 80 }, next: 'end' },
      ] } },
      { id: 'fight', text: 'Патруль заметил.', goal: { kind: 'battle', encounter: 'w-agro-cleaners', location: 'battlefields-m11' },
        effects: { recruit: 'zarya', rep: { agrozone: -10 } }, next: 'end' },
      { id: 'end', text: 'Патруль ушёл — так или иначе.', goal: { kind: 'reach', location: 'battlefields-m11' }, end: 'done' },
    ],
    rewards: { xp: 200 },
  },
  {
    id: 'sq-lyova-chips', name: 'Отмена ID-чипов', type: 'mixed', key: false, giver: 'forger-lyova', region: 'agrozone', level: 2,
    requires: null,
    summary: 'Пропускник Лёва подделывает чипы для беглых. Нужны пустые чипы со склада «Бетона».',
    stages: [
      { id: 'ask', text: 'Лёва: «Без чипа ты имущество. С моим — человек».', goal: { kind: 'talk', npc: 'forger-lyova', location: 'battlefields-m11' }, next: 'steal' },
      { id: 'steal', text: 'Добыть пустые чипы в «Бетоне».', goal: { kind: 'choice', options: [
        { id: 'sneak', text: 'Пробраться на склад.', goal: { kind: 'check', skills: ['stealth', 'lockpicking', 'acrobatics'], dc: 14, group: true, onFail: 'alarm' },
          effects: { items: [{ item: 'blank-chips', n: 1 }] }, next: 'back' },
        { id: 'con', text: 'Выписать их себе по форме.', goal: { kind: 'check', skills: ['deception', 'hacking', 'persuasion'], dc: 15, onFail: 'alarm' },
          effects: { items: [{ item: 'blank-chips', n: 1 }] }, next: 'back' },
      ] } },
      { id: 'alarm', text: 'Тревога на складе!', goal: { kind: 'battle', encounter: 'w-agro-cleaners', location: 'gidroponika' },
        effects: { items: [{ item: 'blank-chips', n: 1 }], rep: { agrozone: -10 } }, next: 'back' },
      { id: 'back', text: 'Отдать чипы Лёве.', goal: { kind: 'item', item: 'blank-chips', n: 1 }, end: 'done' },
    ],
    rewards: { xp: 250, rep: { renegades: 10 }, deeds: ['free-slaves'], talent: 'holo-disguise' },
  },
  {
    id: 'sq-kolos-fields', name: 'Последнее поле', type: 'mixed', key: false, giver: 'grandpa-kolos', region: 'agrozone', level: 2,
    requires: null,
    summary: 'Огонь подбирается к последнему полю. Дед Колос просит вынести банк семян, пока не поздно.',
    stages: [
      { id: 'ask', text: 'Семена — это хлеб на следующий год. Для всех.', goal: { kind: 'talk', npc: 'grandpa-kolos', location: 'battlefields-m11' }, next: 'save' },
      { id: 'save', text: 'Пробиться сквозь огонь.', goal: { kind: 'check', skills: ['athletics', 'survival', 'endurance'], dc: 13, group: true, onFail: 'burned' },
        effects: { items: [{ item: 'seed-bank', n: 1 }] }, next: 'back' },
      { id: 'burned', text: 'Обгорели, но вынесли половину.', goal: { kind: 'reach', location: 'battlefields-m11' },
        effects: { items: [{ item: 'seed-bank', n: 1 }], text: 'Каждый член партии теряет 4 ЗДР.' }, next: 'back' },
      { id: 'back', text: 'Отдать семена Колосу.', goal: { kind: 'item', item: 'seed-bank', n: 1 }, end: 'done' },
    ],
    rewards: { xp: 150, rep: { renegades: 5, agrozone: 5, neutralVillages: 5 }, deeds: ['help-weak'] },
  },

  // ==================================================================== КОРРУПЦИЯ-СИТИ
  {
    id: 'sq-duel', name: 'Ставка на кровь', type: 'combat', key: false, giver: 'duel-master', region: 'corruption', level: 3,
    requires: null,
    summary: 'Распорядитель Сабля ищет свежую кровь для дуэльного клуба.',
    stages: [
      { id: 'sign', text: 'Взнос — 50 кредов, выигрыш — втрое.', goal: { kind: 'pay', credits: 50 }, next: 'fight' },
      { id: 'fight', text: 'Бой в клубе.', goal: { kind: 'battle', encounter: 'w-cc-duel', location: 'cc-duel-club' }, next: 'prize' },
      { id: 'prize', text: 'Забрать выигрыш.', goal: { kind: 'talk', npc: 'duel-master', location: 'cc-duel-club' }, end: 'done' },
    ],
    rewards: { xp: 250, credits: 150, flags: ['duel-champion'] },
  },
  {
    id: 'sq-alik', name: 'Подпольная мойка', type: 'mixed', key: false, giver: 'alik', region: 'corruption', level: 3,
    requires: null,
    summary: 'Алику нужно доставить посылку в Агрозону мимо ворот. Не открывать.',
    stages: [
      { id: 'take', text: 'Взять посылку и узнать про тоннель.', goal: { kind: 'talk', npc: 'alik', location: 'cc-carwash' },
        effects: { items: [{ item: 'alik-package', n: 1 }], flags: ['alik-tunnel'] }, next: 'deliver' },
      { id: 'deliver', text: 'Доставить Лёве в Агрозону.', goal: { kind: 'talk', npc: 'forger-lyova', location: 'battlefields-m11' }, next: 'peek' },
      { id: 'peek', text: 'Посылка тикает. Открыть?', goal: { kind: 'choice', options: [
        { id: 'deliver', text: 'Отдать как есть.', effects: { removeItems: [{ item: 'alik-package', n: 1 }], deeds: ['greed'] }, next: 'paid' },
        { id: 'open', text: 'Открыть.', goal: { kind: 'check', skills: ['lockpicking', 'tech', 'stealth'], dc: 14 },
          effects: { removeItems: [{ item: 'alik-package', n: 1 }], items: [{ item: 'blank-chips', n: 1 }],
            text: 'Внутри пустые ID-чипы. Алик торгует свободой оптом.' }, next: 'paid' },
      ] } },
      { id: 'paid', text: 'Вернуться к Алику за оплатой.', goal: { kind: 'talk', npc: 'alik', location: 'cc-carwash' }, end: 'done' },
    ],
    rewards: { xp: 250, credits: 200, rep: { renegades: 5 } },
  },
  {
    id: 'sq-archon', name: 'Сосуд № 2', type: 'mixed', key: false, giver: 'archon', region: 'corruption', level: 3,
    requires: null,
    summary: 'Архонт — несостоявшийся «сосуд» Судьи. Его память раскидана по Улицам мёртвых. Вернёшь — скажет, где Главный узел.',
    stages: [
      { id: 'meet', text: 'Металлическая маска, провода, тихий голос.', goal: { kind: 'talk', npc: 'archon', location: 'cc-dead-streets' }, next: 'shard' },
      { id: 'shard', text: 'Отбить осколок памяти у душ.', goal: { kind: 'battle', encounter: 'w-cc-dead', location: 'cc-dead-streets' },
        effects: { items: [{ item: 'soul-shard', n: 1 }] }, next: 'return' },
      { id: 'return', text: 'Вернуть осколок.', goal: { kind: 'item', item: 'soul-shard', n: 1 }, end: 'done' },
    ],
    rewards: { xp: 300, flags: ['cc-node-found'], deeds: ['mercy'] },
  },
];

export const QUESTS = Object.fromEntries(LIST.map((q) => [q.id, q]));

/** Опыт за квест по размеру (world.md, п. 7) — ориентир для новых квестов. */
export const QUEST_XP = { small: [100, 200], big: [300, 500], key: [600, 1000] };

/** Закрытый список тегов поступков (world.md, п. 4). */
export const DEED_TAGS = ['help-weak', 'cruelty', 'greed', 'honor', 'lie', 'free-slaves', 'serve-ai', 'cult-deal',
  'kill-surrendered', 'mercy', 'tech-faith', 'anti-mutant'];
