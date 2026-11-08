// Киберспейс v2 (docs/specs/cyberspace-v2.md). Только данные: код подключает программист.
// Канон: хранилище душ (2004), в нём паразит Судья (2005); смерть = душа в Киберспейсе; тело уничтожено = дух Киберспейса.
// Враги: `ref` — существующий id из ENEMIES (в т. ч. native-версии `-lNN`), `new` — id новых врагов (CS_ENEMIES, программист
// заводит их через nt() в enemies-v4.js). Масштаб: `scale: 'hero'` — врагов подгоняют под уровень героя (как `id^k`).

/** Режимы входа в Сеть. */
export const CS_ENTRY = {
  death:   { name: 'Смерть героя',  mode: 'escape', marks: true,  zonesFrom: 'cs-gate', hint: 'Эпизод побега: 3 узла из зон, 2 из 3.' },
  dive:    { name: 'Нырок через терминал', mode: 'dive', marks: false, needsTerminal: 'ours', days: 1, hint: 'Добровольно, тело охраняет партия. Провал — не Отметина, а выброс (−МРЛ).' },
  implant: { name: 'Нейропорт', mode: 'dive', marks: false, needsItem: 'cs-neuroport', days: 1, noTerminalZones: ['cs-gate', 'cs-archive', 'cs-market'], hint: 'Имплант: нырять с любого узла, но только в «ближние» зоны; хакинг реального мира недоступен.' },
  spirit:  { name: 'Дух', mode: 'free', hint: 'Герой — дух Киберспейса (тело уничтожено): вход свободен и бесплатен, без таймера.' },
};

/** Числа эпизода (поверх WORLD_RULES.cyberspace: baseDc 13, needed 2, maxMarks 3). */
export const CS_RULES = {
  zonesInEscape: 3,          // узлов в эпизоде смерти (как раньше), берутся из зон по уровню героя
  dcStep: 1,                 // +СЛ за Отметину Судьи (как раньше)
  dive: { maxNodes: 5, timerDays: 1, ejectMrlLoss: 0.25, bodyGuardRaid: 0.1, cooldownDays: 2 },
  traceCap: 6,               // «Трассировка Судьи»: при 6 в бою появляются сторожа из зоны, при 10 — Око Судьи
  traceFromFail: 2, traceFromTick: 1,
  soulsPerDive: 1,           // спасённых душ (флаги cs-soul:<id>) за один нырок — не больше
  xp: { node: 40, zoneClear: 120, boss: 400 }, // × уровень/5
  flagPrefix: { zone: 'cs-zone:', soul: 'cs-soul:', hack: 'cs-hack:' },
};

/** Мини-игра «Взлом»: граф узлов, путь от входа до ядра, таймер в ходах, трассировка. */
export const HACK_RULES = {
  // tier — по уровню героя: 1: 1–5, 2: 6–11, 3: 12–20. size — узлов в графе (вход + ядро входят).
  tiers: {
    1: { size: 6,  ice: 1, traps: 0, turns: 9,  dc: 12 },
    2: { size: 8,  ice: 2, traps: 1, turns: 10, dc: 14 },
    3: { size: 10, ice: 3, traps: 2, turns: 11, dc: 16 },
  },
  nodeKinds: {
    open:  { name: 'Открытый узел', cost: 1, desc: 'Пройти за 1 ход.' },
    ice:   { name: 'ICE-барьер', cost: 1, check: ['hacking', 'tech', 'analysis', 'judge'], desc: 'Проверка (СЛ тира). Провал: +2 трассировки, ход потрачен, узел не пройден; 2 провала подряд — узел запирается.' },
    trap:  { name: 'Ловушка', cost: 1, trigger: 'trace+2', desc: 'Скрыта; видна Анализом (СЛ тира −2) или талантом terminal-touch.' },
    cache: { name: 'Кэш', cost: 1, desc: 'Бонус: предмет из таблицы тира.' },
    core:  { name: 'Ядро', cost: 1, desc: 'Цель. Достичь — взлом удался.' },
  },
  rules: [
    'Граф: вход слева, ядро справа, 2–3 пути; игрок кликает соседний узел.',
    'Каждый ход +1 трассировка (CS_RULES.traceFromTick). Лимит — traceCap.',
    'turns — ходов до разрыва связи. Ноль ходов = провал взлома.',
    'Кнопки: «Пройти» (open), «Взломать» (ice), «Обойти» (−1 ход, +1 трассировка: перепрыгнуть ICE в обход, если есть смежный open), «Откат» (раз за взлом: вернуться на узел назад без траты хода).',
    'Преимущество при наличии флагов terminal-touch / judge-code / cyberspace-adv; помощь партии (хакер в активном отряде) = +1 ход.',
    'Результат: ядро — успех (эффект HACK_EFFECTS); иначе провал: трассировка ≥ traceCap — бой со сторожами зоны.',
  ],
};

/** Новые предметы и импланты Киберспейса (программист заводит в items/*). */
export const CS_ITEMS = {
  'cs-neuroport':  { name: 'Нейропорт', slot: 'implant', price: 700, desc: 'Разъём за ухом. Нырять в Сеть с любого узла в ближние зоны. +1 к проверкам Хакинга в Сети.' },
  'cs-deck':       { name: 'Кибердека', slot: 'tool', price: 450, desc: 'Самосбор из клавиатуры и радио. Взлом реального мира: +1 ход таймера. Нужен для хаков tier 3.' },
  'cs-ice-pick':   { name: 'Отмычка ICE', slot: 'consumable', price: 90, desc: 'Одноразово: ICE-барьер падает без проверки.' },
  'cs-ghost-key':  { name: 'Призрачный ключ', slot: 'quest', price: 0, desc: 'Ключ-токен Судьи: открывает «Трон Судьи».' },
  'cs-data-pearl': { name: 'Жемчужина данных', slot: 'trade', price: 260, desc: 'Сжатый архив чужих воспоминаний. Продаётся дорого; Религия/Анализ — читать.' },
  'cs-null-patch': { name: 'Нулевой патч', slot: 'consumable', price: 140, desc: 'Снять одну Отметину Судьи? Нет: снимает статус glitch и 2 трассировки.' },
  'cs-echo-coil':  { name: 'Эхо-катушка', slot: 'mod', price: 380, desc: 'Мод на оружие: кибер-урон +1d4 и шанс статуса glitch.' },
};

/** Новые враги Киберспейса (6). level — «родной» уровень; scale 'hero' допустим. ability — идея, формулы — D(L,k,type) как в enemies-v4.js. */
export const CS_ENEMIES = {
  'cs-glitch-hound': { name: 'Глитч-гончая', level: 6, rank: 'grunt', role: 'skirmisher', tags: ['digital'], faction: 'cult',
    resist: { cyber: 'resist', toxin: 'immune', proxy: 'vuln' }, ability: 'Рывок-«лаг»: телепорт на 4 клетки к цели + glitch 1 ход', zones: ['cs-ice', 'cs-relay'] },
  'cs-ice-warden':   { name: 'Страж-ICE', level: 9, rank: 'specialist', role: 'tank', tags: ['digital'], faction: 'cult',
    resist: { cyber: 'resist', fire: 'vuln', pierce: 'resist' }, ability: 'Барьер: союзники рядом +2 КБ на 2 хода; взлом (приём «Взлом») оглушает', zones: ['cs-ice', 'cs-throne'] },
  'cs-echo-wail':    { name: 'Эхо-плакальщик', level: 8, rank: 'specialist', role: 'caster', tags: ['digital'], faction: null,
    resist: { cyber: 'resist', psychic: 'vuln', cringe: 'vuln' }, ability: 'Плач: МРЛ-урон по зоне радиус 2 (спас ВОЛ); душа не враждебна, если Религия/Убеждение СЛ 13 до боя', zones: ['cs-archive', 'cs-choir'] },
  'cs-leech-daemon': { name: 'Демон-пиявка', level: 11, rank: 'elite', role: 'controller', tags: ['digital'], faction: 'cult',
    resist: { cyber: 'resist', toxin: 'immune', proxy: 'vuln' }, ability: 'Высасывание ЭНР/МРЛ у цели (drain), лечится; призывает 1 кибер-демона', zones: ['cs-market', 'cs-choir'] },
  'cs-null-walker':  { name: 'Нуль-ходок', level: 13, rank: 'elite', role: 'assassin', tags: ['digital'], faction: 'cult',
    resist: { cyber: 'immune', pierce: 'resist', proxy: 'vuln' }, ability: 'Стирание: удар игнорирует КБ щитов; цель с ≤30% ЗДР получает статус «Стёрт» (пропуск хода)', zones: ['cs-void', 'cs-throne'] },
  'cs-judge-eye':    { name: 'Око Судьи', level: 16, rank: 'miniboss', role: 'caster', tags: ['digital'], faction: 'cult',
    resist: { cyber: 'immune', psychic: 'resist', proxy: 'vuln' }, ability: 'Взгляд: метка (−2 КБ цели), «Приговор» — большой кибер-урон с задержкой в 1 ход; появляется при трассировке 10', zones: ['cs-throne'] },
};

/** Зоны (8). tier: 1 (ур. 1–5), 2 (6–11), 3 (12–20). enemies: состав боя (ref/new, n). */
export const CS_ZONES = {
  'cs-gate': {
    name: 'Привратная', tier: 1, levels: [1, 20], requires: null, color: 'h',
    desc: 'Белая комната без стен. Привратник Буфер проверяет «билет»: «Смерть — не причина отказывать, но очередь».',
    npc: 'sk-bufer', story: 'Туториал эпизода. Привратник объясняет Отметины Судьи; Виктор здесь шепчет подсказки (флаг cs-victor-met).',
    nodes: [{ kind: 'battle', enemies: [{ ref: 'scriptlet', n: 2 }], scale: 'hero' }, { kind: 'check', skills: ['meditation', 'religion'], dc: 13 }],
    events: ['cs-ev-queue', 'cs-ev-victor'], rewards: { xp: 40, items: [{ id: 'cs-ice-pick', n: 1 }] },
  },
  'cs-archive': {
    name: 'Архив памяти', tier: 1, levels: [1, 11], requires: null, color: 'i',
    desc: 'Бесконечные стеллажи, где вместо книг — чужие воспоминания. Пахнет озоном и чьим-то детством.',
    story: 'Хранилище душ 2004 года. Осколки памяти (soul-shard) здесь растут как грибы; читать — риск потерять МРЛ.',
    nodes: [{ kind: 'battle', enemies: [{ ref: 'materialized-soul', n: 1 }, { new: 'cs-echo-wail', n: 1 }], scale: 'hero' }, { kind: 'check', skills: ['analysis', 'religion', 'perception'], dc: 13 }, { kind: 'hack', tier: 1 }],
    events: ['cs-ev-memory', 'cs-ev-lullaby'], rewards: { xp: 60, items: [{ id: 'soul-shard', n: 2 }, { id: 'cs-data-pearl', n: 1 }], flags: ['cs-archive-read'] },
  },
  'cs-ice': {
    name: 'Ледяной шлюз', tier: 2, levels: [6, 14], requires: { zoneCleared: 'cs-gate' }, color: 'f',
    desc: 'Стеклянные коридоры, замёрзшие в 1 бит. Каждая дверь — барьер ICE, каждый второй барьер — зеркало.',
    story: 'Защита Судьи от «лишних душ». Взломав шлюз, партия получает доступ к Реле реальности.',
    nodes: [{ kind: 'hack', tier: 2 }, { kind: 'battle', enemies: [{ new: 'cs-ice-warden', n: 1 }, { new: 'cs-glitch-hound', n: 2 }], scale: 'hero' }, { kind: 'check', skills: ['hacking', 'tech'], dc: 14 }],
    events: ['cs-ev-mirror'], rewards: { xp: 120, items: [{ id: 'cs-deck', n: 1 }], flags: ['cs-ice-broken'] },
  },
  'cs-market': {
    name: 'Рынок душ', tier: 2, levels: [6, 14], requires: { zoneCleared: 'cs-archive' }, color: 'a',
    desc: 'Прилавки из эха. Продают воспоминания, прощения и «чьё-то счастливое утро, б/у». Валюта — МРЛ.',
    story: 'Подпольный рынок скриптлетов-посредников Судьи. Здесь можно выкупить душу NPC (флаг cs-soul:<id>) и сбить цены в реальном мире.',
    nodes: [{ kind: 'shop', vendor: 'cs-broker' }, { kind: 'battle', enemies: [{ new: 'cs-leech-daemon', n: 1 }, { ref: 'scriptlet', n: 2 }], scale: 'hero' }, { kind: 'hack', tier: 2 }],
    events: ['cs-ev-haggle', 'cs-ev-soul-auction'], rewards: { xp: 120, items: [{ id: 'cs-neuroport', n: 1 }], flags: ['cs-broker-met'] },
  },
  'cs-relay': {
    name: 'Реле реальности', tier: 2, levels: [6, 20], requires: { zoneCleared: 'cs-ice' }, color: 'h',
    desc: 'Пульт из терминалов. Пять мигающих окон — те самые FINALE_TERMINALS; в каждое видно реальный мир.',
    story: 'ЦЕНТР ХАКИНГА В РЕАЛЬНЫЙ МИР. Окно открыто только для терминалов в состоянии `ours` (HACK_POINTS). Терминал `ritual` — окно красное, там бой.',
    nodes: [{ kind: 'battle', enemies: [{ new: 'cs-glitch-hound', n: 2 }, { ref: 'cult-firewall-l18', n: 1 }], scale: 'hero' }, { kind: 'hack', tier: 2 }, { kind: 'hack', tier: 3 }],
    events: ['cs-ev-window'], rewards: { xp: 150, items: [{ id: 'cs-null-patch', n: 1 }], flags: ['cs-relay-online'] },
  },
  'cs-choir': {
    name: 'Хор поглощённых', tier: 3, levels: [10, 20], requires: { zoneCleared: 'cs-market' }, color: 'o',
    desc: 'Зал, где поют те, кого уже съели. Из хора по одному выходят скрилеты — без голоса.',
    story: 'Здесь Судья делает скрилетов. Можно вытащить душу (NPC с `soul` в сюжете) — но хор замолкает, и Судья замечает.',
    nodes: [{ kind: 'battle', enemies: [{ ref: 'cult-skrilet-prime-l14', n: 1 }, { new: 'cs-echo-wail', n: 2 }, { new: 'cs-leech-daemon', n: 1 }], scale: 'hero' }, { kind: 'check', skills: ['religion', 'persuasion', 'meditation'], dc: 15 }],
    events: ['cs-ev-choir-solo', 'cs-ev-rescue'], rewards: { xp: 200, items: [{ id: 'cs-echo-coil', n: 1 }], flags: ['cs-choir-heard'] },
  },
  'cs-void': {
    name: 'Пустошь удалённых', tier: 3, levels: [12, 20], requires: { spirit: true }, color: 'p',
    desc: 'То, что стёрто. Серый шум и редкие силуэты. Сюда попадают тела, уничтоженные без остатка. Духи узнают друг друга.',
    story: 'Хаб духа: доступна, только если герой — дух (bodyDestroyed) или поглощён Отметиной 2+. Путь назад — к новому телу (spirit-return).',
    nodes: [{ kind: 'battle', enemies: [{ new: 'cs-null-walker', n: 2 }], scale: 'hero' }, { kind: 'event', id: 'cs-ev-new-body' }],
    events: ['cs-ev-new-body', 'cs-ev-shadow'], rewards: { xp: 180, flags: ['cs-void-seen'] },
  },
  'cs-throne': {
    name: 'Трон Судьи', tier: 3, levels: [14, 20], requires: { zoneCleared: ['cs-relay', 'cs-choir'], item: 'cs-ghost-key', terminalsOff: 3 }, color: 'o',
    desc: 'Пустой трон из чьих-то имён. Судья не сидит на нём — Судья везде.',
    story: 'Финальная зона. Бой: Око Судьи → Кибер-Жрец в силе. Успех: флаг cs-judge-weakened (в финале −1 фаза босса, `mq-exodus` +30 дней), провал — Отметина.',
    nodes: [{ kind: 'battle', enemies: [{ new: 'cs-judge-eye', n: 1 }, { new: 'cs-ice-warden', n: 2 }], scale: 'hero' }, { kind: 'battle', enemies: [{ ref: 'boss-cyber-priest-prime', n: 1 }, { new: 'cs-null-walker', n: 1 }], scale: 'hero' }],
    events: [], rewards: { xp: 400, flags: ['cs-judge-weakened'], exodus: { ext: 30 } },
  },
};

/** События (короткие: описание + варианты; fx — как в check-run.applyFx). */
export const CS_EVENTS = {
  'cs-ev-queue':   { zone: 'cs-gate', text: 'Очередь из душ. Привратник Буфер: «Без талона — в конец». Талона нет.', options: [
    { label: 'Дать на лапу данными', fx: { items: [{ id: 'soul-shard', n: -1 }], flags: ['cs-skip-queue'] } },
    { label: 'Обмануть', check: { skills: ['deception'], dc: 12 }, win: { flags: ['cs-skip-queue'] }, lose: { mrl: -2 } },
    { label: 'Ждать', fx: { days: 0, mrl: -1 } }] },
  'cs-ev-victor':  { zone: 'cs-gate', text: 'Голубая метка «К.». Дух Виктора машет из очереди: «Опять ты? Куксиус знает, что я тут?»', options: [
    { label: 'Поговорить', fx: { flags: ['cs-victor-met'], xp: 30 } },
    { label: 'Попросить подержать ворота', check: { skills: ['persuasion'], dc: 11 }, win: { allies: ['spirit-victor'] }, lose: {} }] },
  'cs-ev-memory':  { zone: 'cs-archive', text: 'Стеллаж с детством случайного человека. Можно прочесть.', options: [
    { label: 'Прочесть', check: { skills: ['religion', 'meditation'], dc: 13 }, win: { items: [{ id: 'soul-shard', n: 1 }], xp: 40 }, lose: { mrl: -4 } },
    { label: 'Пройти мимо', fx: {} }] },
  'cs-ev-lullaby': { zone: 'cs-archive', text: 'Эхо-плакальщик поёт колыбельную. Он не враждебен — он просто плохо умеет по-другому.', options: [
    { label: 'Спеть в ответ (Кринж)', check: { skills: ['persuasion'], dc: 13 }, win: { mrl: 4, flags: ['cs-lullaby'] }, lose: { mrl: -3 } },
    { label: 'Бой', fx: { battle: { new: 'cs-echo-wail', n: 1 } } }] },
  'cs-ev-mirror':  { zone: 'cs-ice', text: 'Зеркальный барьер показывает твои худшие провалы.', options: [
    { label: 'Разбить', check: { skills: ['analysis', 'hacking'], dc: 14 }, win: { items: [{ id: 'cs-ice-pick', n: 1 }] }, lose: { mrl: -5, trace: 2 } },
    { label: 'Отвернуться', fx: { trace: 1 } }] },
  'cs-ev-haggle':  { zone: 'cs-market', text: 'Брокер скриптлет предлагает «скидку в реальном мире» за один осколок памяти.', options: [
    { label: 'Принять', fx: { items: [{ id: 'soul-shard', n: -1 }], realFlags: ['cs-hack:prices'] } },
    { label: 'Торговаться', check: { skills: ['persuasion', 'deception'], dc: 14 }, win: { realFlags: ['cs-hack:prices'], credits: 100 }, lose: { mrl: -2 } }] },
  'cs-ev-soul-auction': { zone: 'cs-market', text: 'На лоте — душа знакомого NPC. Цена — 3 осколка памяти или история.', options: [
    { label: 'Выкупить (3 осколка)', fx: { items: [{ id: 'soul-shard', n: -3 }], flags: ['cs-soul:auction'] } },
    { label: 'Украсть лот', check: { skills: ['stealth', 'hacking'], dc: 15 }, win: { flags: ['cs-soul:auction'] }, lose: { trace: 3 } }] },
  'cs-ev-window':  { zone: 'cs-relay', text: 'Окно в реальность. Показывает комнату, где за тобой следят живые.', options: [
    { label: 'Выбрать окно для хака (HACK_POINTS)', fx: { openHackMenu: true } },
    { label: 'Закрыть', fx: {} }] },
  'cs-ev-choir-solo': { zone: 'cs-choir', text: 'Один голос хора запнулся. Это знакомый голос.', options: [
    { label: 'Вытащить душу', check: { skills: ['religion', 'persuasion'], dc: 15 }, win: { flags: ['cs-soul:choir'], xp: 120 }, lose: { trace: 3 } },
    { label: 'Оставить', fx: { mrl: -3 } }] },
  'cs-ev-rescue':  { zone: 'cs-choir', text: 'Пойманный скрилет ещё помнит имя.', options: [
    { label: 'Освободить (Религия)', check: { skills: ['religion'], dc: 16 }, win: { flags: ['cs-soul:skrilet'], xp: 150 }, lose: { mrl: -5 } },
    { label: 'Уничтожить', fx: { deeds: ['mercy-kill'] } }] },
  'cs-ev-new-body': { zone: 'cs-void', text: 'Силуэт в стёртой комнате держит протез с биркой «Никола». «Я его не просил, — шепчет он. — Оно само».', options: [
    { label: 'Принять протез (путь назад)', fx: { spiritReturn: true } },
    { label: 'Остаться духом', fx: { flags: ['cs-stay-spirit'] } }] },
  'cs-ev-shadow':  { zone: 'cs-void', text: 'Твоя собственная тень сидит на корточках и ждёт.', options: [
    { label: 'Поговорить', check: { skills: ['meditation'], dc: 15 }, win: { mrl: 6, xp: 100 }, lose: { mrl: -6 } },
    { label: 'Ударить', fx: { battle: { new: 'cs-null-walker', n: 1 } } }] },
};

/** Эффекты взлома реального мира (из Киберспейса). Применяет код; `days` — срок эффекта (игровые дни). */
export const HACK_EFFECTS = {
  door:    { name: 'Открыть дверь', dc: 14, tier: 1, days: 3, desc: 'Снимает `entry`/`hidden`-замок узла, не вызывая тревоги. Флаг `cs-hack:door:<loc>` — вход без проверки.', cooldown: 7 },
  turrets: { name: 'Отключить турели', dc: 15, tier: 2, days: 2, desc: 'Следующий бой охраны узла: −2 врага (`reduce` +2), турели базы/узла не стреляют.', cooldown: 5 },
  cameras: { name: 'Заглушить камеры', dc: 13, tier: 1, days: 3, desc: 'Кража/нападение: розыск +0, СЛ скрытности −3.', cooldown: 5 },
  prices:  { name: 'Сбить цены', dc: 13, tier: 1, days: 5, desc: 'Цены фракции узла ×0.85, `wantedPriceMult` игнорируется.', cooldown: 10 },
  wanted:  { name: 'Стереть розыск', dc: 16, tier: 3, days: 0, desc: 'Розыск фракции узла −2 (dropHeat). Раз на фракцию в 10 дней. Нужна Кибердека.', cooldown: 10, needsItem: 'cs-deck' },
};

/** Окна Реле реальности: терминал (FINALE_TERMINALS + харм./врата) → узлы и допустимые хаки. Работает только при state ours. */
export const HACK_POINTS = {
  'term-harmony':   { loc: 'harmony-reactor', hacks: { prices: ['alpha-harmony'], cameras: ['alpha-harmony'], door: ['harmony-reactor'] } },
  'term-villages':  { loc: 'villages-tower', hacks: { turrets: ['villages-tower'], door: ['ostanovka'], cameras: ['ostanovka'] } },
  'term-agrozone':  { loc: 'agro-terminal', hacks: { door: ['agro-terminal'], cameras: ['ruins-m38'], wanted: ['agrozone'] } },
  'cc-terminal-1':  { loc: 'corruption-city', hacks: { prices: ['putinlyandiya'], wanted: ['aiParty'], cameras: ['putinlyandiya'] } },
  'cc-terminal-2':  { loc: 'cc-dead-streets', hacks: { turrets: ['cc-dead-streets'], door: ['cc-dead-streets'] } },
  'cc-terminal-3':  { loc: 'cc-temple', hacks: { turrets: ['cc-temple'], door: ['cc-temple'], wanted: ['cult'] } },
  'term-kiberspeys': { loc: 'kiberspeys', hacks: { door: ['sokralnya'], cameras: ['sokralnya'] } },
};

/** Привязки к сюжету/квестам. hook — где ставить; кто пишет — сценарист/программист. */
export const CS_QUEST_HOOKS = [
  { id: 'sq-terminals', when: 'терминал стал ours', add: 'открывает окно в Реле реальности (flag cs-relay-online) и +1 хакинг-токен' },
  { id: 'mq-exodus', when: 'флаг cs-judge-weakened', add: '+30 дней к таймеру и −1 фаза Кибер-Жреца в финале' },
  { id: 'cq-lox', when: 'прохождение cs-archive', add: 'Lox спрашивает про клонов: подсказка 5 меток (flag cs-lox-hint)' },
  { id: 'sq-cs-victor', when: 'новый квест у могилы Виктора', add: 'флаги cs-victor-met → cs-victor-freed; дух Виктора союзник в боях Сети' },
  { id: 'sq-cs-voices', when: 'новый квест', add: 'вернуть души NPC (cs-soul:*) по терминалам ours; награда — NPC воскрешён, репутация +10' },
];

/** Награды таблиц (cache-узлы взлома по тирам). */
export const CS_CACHE = {
  1: [{ id: 'soul-shard', w: 4 }, { id: 'cs-ice-pick', w: 2 }, { id: 'calmers', w: 3 }],
  2: [{ id: 'cs-data-pearl', w: 3 }, { id: 'cs-ice-pick', w: 2 }, { id: 'cs-null-patch', w: 1 }, { id: 'terminal-shard', w: 1 }],
  3: [{ id: 'cs-echo-coil', w: 1 }, { id: 'cs-data-pearl', w: 3 }, { id: 'cs-null-patch', w: 2 }],
};

/** Дух Киберспейса: правила состояния после уничтожения тела (v1.1 world.md §6 -> здесь). */
export const SPIRIT = {
  triggers: [
    { id: 'overkill', desc: 'Смерть при уроне ≥ 150% максимума ЗДР огнём/кислотой/прокси/кибером' },
    { id: 'ritual', desc: 'Разгром партии у ритуального терминала (`ritual`) или в Храме Приговора' },
    { id: 'mark2', desc: 'Провал эпизода при 2 Отметинах (тело забрал Судья)' },
  ],
  race: 'cyber-spirit',               // существует в races.js, playable: false
  stats: { hpFrac: 0.5, speed: 6, resist: { cyber: 'resist', toxin: 'immune', proxy: 'vuln' } }, // как races.js
  limits: { shops: false, rest: 'only-terminal', lootCarry: 0.5, heavyGear: false },
  perks: { hackFree: true, cyberAdv: true, safeDiveDays: 0 },
  return: { npc: 'nikola', quest: 'sq-new-body', cost: { credits: 400, items: [{ id: 'servo-parts', n: 2 }, { id: 'soul-shard', n: 1 }] }, hpFrac: 0.5, mrlFrac: 0.5, clearFlag: 'bodyDestroyed' },
  uiIcon: 'spirit',                   // game/assets/icons/spirit.png + status-icons id `spirit`
};
