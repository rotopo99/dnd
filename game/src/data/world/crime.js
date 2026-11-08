// Воровство, нападения и розыск. Спека: docs/specs/world-consequences.md, часть 2. Данные без логики.
// Навыки: «Ловкость рук» в каноне нет (rules/stats-skills.md) — карманы = Взлом (lockpicking, ВНМ — тонкая моторика)
// или Скрытность (stealth); решение дизайнера, записано в GDD.
// Розыск — по фракциям: save.wanted[faction] = { heat: 0..5, until: день, bounty: креды }.

export const CRIME_RULES = {
  // Кража: бросок героя (лучший член партии, skillCheck) против СЛ = base + внимательность цели + мод. места
  theft: {
    skills: ['lockpicking', 'stealth'],            // выбор игрока; провал любой — тревога
    baseDc: 10,
    alert: { civilian: 0, trader: 2, guard: 4, key: 3, boss: 5 }, // внимательность по роли NPC
    place: { shop: 2, pocket: 0, crowd: -2, night: -2, camp: 1 },  // «shop» — с прилавка, «crowd» — толпа в хабе
    partyPenalty: 1,                                // +1 к СЛ за каждого спутника сверх второго (шумно)
    armorHeavyDis: true,                            // тяжёлая броня/мех — помеха (stealthDis)
    // Что можно утянуть: стоимость предмета не выше потолка по уровню героя
    capPerLevel: 40, capCredits: { civilian: '1d6*L', trader: '3d6*L', guard: '2d6*L', key: '4d6*L' },
    perDayPerNpc: 1,                                // повторить у того же NPC можно через день
    xp: 15,                                         // за успех (≈ малый квест 1 ур.)
    crit20: 'double',                               // натуральная 20 — двойная добыча
  },
  // Провал: таблица по разнице (СЛ − итог). Тревога = свидетели (NPC узла этой фракции) → розыск
  failure: [
    { gap: [1, 3], id: 'noticed', text: 'Заметили, но не сразу.', fx: { rep: -3, heat: 0 }, ask: 'return|fine' },       // вернуть или штраф
    { gap: [4, 7], id: 'caught', text: 'Схватили за руку.', fx: { rep: -8, heat: 1 }, ask: 'fine|fight|run' },
    { gap: [8, 99], id: 'alarm', text: 'Крик на весь узел.', fx: { rep: -15, heat: 2 }, ask: 'fight|run' },
  ],
  fine: { mult: 3, min: 30, note: 'штраф ×3 стоимости (минимум 30 кр.); нет денег — конфискуют лучшее из рюкзака, героя не трогают' },
  run: { skill: 'acrobatics|athletics|stealth', dc: 13, fail: 'fight', note: 'побег в соседний узел; успех — тот же уровень розыска, без боя' },
  // Тревога поднимает бой со стражей узла: encounter фракции + число бойцов
  alarmFight: { guardCountByHeat: [1, 2, 3, 4, 5, 6], eliteFrom: 4, noLoot: false, canSurrender: true },
};

// Стража и охотники за головами по фракциям (id из ENCOUNTERS). Нет своего — запасной.
export const GUARDS = {
  aiParty: 'v4-ai-patrol', warprom: 'v4-wp-patrol', agrozone: 'v4-agro-patrol', renegades: 'v4-ren-patrol',
  scavengers: 'v4-scv-patrol', mechanids: 'v4-mech-patrol', tekhonki: 'v4-tek-patrol', mutantsPlant: 'v4-mutr-patrol',
  mutantsBeast: 'v4-mutz-patrol', cringegons: 'v4-crg-patrol', cult: 'v4-cult-patrol', pirates: 'v3-pir-raid',
  tinBrotherhood: 'v3-tin-trial', neutralVillages: 'v4-wild-patrol', technikums: 'v4-ai-patrol', predlozhka: 'v4-wild-patrol',
};
export const GUARD_ELITE = { aiParty: 'v4-ai-elite', warprom: 'v4-wp-patrol', cult: 'v4-cyber-guard', cringegons: 'v4-crg-patrol' };
export const GUARD_FALLBACK = 'v4-wild-patrol';

// ---------------------------------------------------------------- нападение на NPC
export const ATTACK_RULES = {
  confirm: { title: 'Напасть на {name}?', lines: ['Это {role} ({faction}).', 'Бой с ним и теми, кто рядом. Последствия — {heat}.'], cancel: 'Передумать' },
  // Кто вступает в бой: цель + помощники узла (NPC той же фракции с ролью guard) + стража по уровню розыска
  allies: { sameFactionNpcs: true, maxHelpers: 3, guardsFromHeat: 2 }, // стража приходит, если розыск ≥ 2 после первого убийства
  surprise: { skill: 'stealth', dc: 13, init: 5, bonus: 'враги +0 к инициативе; герой +5 к инициативе при успехе («Подлый удар»)' },
  // Что происходит со смертью NPC (по роли). questFlag: quests.js `turninReachable` уже видит `save.npcs[id].dead`
  onDeath: {
    quests: {
      giverActive: 'fail',                  // активные квесты NPC → «провален» (журнал: «Заказчик мёртв»), награда за этап не даётся
      giverNotStarted: 'lock',              // не взятые — недоступны навсегда
      transfer: 'если у квеста есть `heir` (NPC-наследник) — переходит к нему со штрафом −25% награды',
      heirMult: 0.75,                       // множитель награды (XP, кредиты) квеста, перешедшего к наследнику
      keyNpc: 'ключевой NPC (key: true) — нельзя напасть, пока он нужен активному сюжетному квесту: бой невозможен («плот сюжета»), см. protected',
    },
    vendor: { closeAfter: true, dropStock: true, loot: 'половина текущего ассортимента лавки + 2d6×ур. кредов; эксклюзивы (EXCLUSIVES) падают как добыча' },
    companion: 'если жертва — напарник вербуемый: личный квест провален, лояльность остальных −10, враждебность его пары +5',
    mentor: 'наставник (услуга training): его навыки закрыты, подсказки в кодексе остаются',
    rumorDays: 7, bountyOnKill: true,
  },
  // NPC, на которых напасть нельзя (сюжетная защита; кнопка «Напасть» серая с причиной)
  protected: { keyActiveQuest: true, ids: ['sera', 'amanda', 'putin-mark-2', 'judge', 'old-god', 'cringe-chief', 'khan'], reason: '{name} нужен сюжету. Пока нужен.' },
  // Слабые: дети/старики — нападение даёт +2 розыска и −30 МРЛ герою и спутникам с мораль-флагом good
  vulnerableMoraleHit: { mrl: 8, party: 'good', goodAlignmentRep: -10 },
};

// ---------------------------------------------------------------- розыск
export const WANTED = {
  max: 5,
  levels: [
    { heat: 0, id: 'clear', name: 'Чисто', fx: {} },
    { heat: 1, id: 'sketch', name: 'Приметы', fx: { priceMult: 1.1 }, text: 'Ваше описание у стражи: торговцы смотрят косо.' },
    { heat: 2, id: 'watch', name: 'Розыск', fx: { priceMult: 1.2, entryCheck: { skill: 'deception|persuasion|stealth', dc: 13, fail: 'fight' } }, text: 'Вход в узлы фракции — проверка. Провал — бой с патрулём.' },
    { heat: 3, id: 'bounty', name: 'Награда', fx: { priceMult: 1.35, guardsAttack: true, hunters: true, services: ['training', 'recruit'] }, text: 'За голову назначена награда. Стража нападает на виду, на дорогах — охотники. Закрыты наставники и найм.' },
    { heat: 4, id: 'hunt', name: 'Охота', fx: { priceMult: 1.5, guardsAttack: true, hunters: true, elite: true, closedNodes: 'tier>=2', services: ['trade', 'training', 'recruit', 'rest'] }, text: 'Элитные патрули, узлы фракции закрыты, торговцы не говорят с вами.' },
    { heat: 5, id: 'death', name: 'Смертный приговор', fx: { guardsAttack: true, hunters: true, elite: true, closedNodes: 'all', services: 'all', bossHunter: true }, text: 'Фракция объявила вас врагом. Напарники из неё уходят.' },
  ],
  // Сколько розыска даёт преступление. Умножается ×0.5 при blame-shift (талант), ×0 если свидетелей нет (проверка Скрытности СЛ 13 после убийства)
  gain: {
    pickpocket: 1, theftShop: 1, theftCaught: 1, alarm: 2, attackCivilian: 2, attackGuard: 1, killCivilian: 3, killTrader: 3,
    killGuard: 2, killKey: 4, killChild: 5, breakIn: 1, forgeryCaught: 1,
  },
  // Распространение на союзников: к соседям по матрице RELATIONS — +1 при heat ≥ 3 у ally/vassal
  spread: { fromHeat: 3, to: ['ally', 'vassal', 'suzerain'], amount: 1 },
  // Остывание: −1 за N дней без новых преступлений (во фракции с heat ≥ 4 — вдвое медленнее)
  decay: { everyDays: 7, slowAbove: 4, slowMult: 2, cannotDecayIf: 'свидетель жив и в узле' },
  // Награда за голову (кредитов): bountyBase × heat × max(1, ур. героя / 2)
  bounty: { base: 40, fromHeat: 3, hunterAmbushChance: 0.35, hunterEncounterBonus: 1 /* к порогу встреч на дороге */ },
  // Как снять
  clear: {
    time: { text: 'Подождать: −1 уровень за 7 дней вне узлов фракции (см. decay).' },
    bribe: { npcRoles: ['official', 'guard-captain', 'fixer'], pricePerHeat: 100, perLevelMult: true,
      checks: { skill: 'persuasion|deception', dc: 12, bonusHeat: 1 }, // СЛ +1 за каждый уровень выше 1
      maxDrop: 2, failFx: 'сумма потеряна, +1 розыск',
      note: 'цена = 100 × heat × ур. героя / 2 (минимум 100); минус 1–2 уровня; нельзя с heat 5; talent clean-hands запрещает' },
    quest: { // амнистия: квест по фракциям; снимает розыск полностью и ставит rep +10 (после выполнения)
      aiParty: { id: 'amnesty-ai', npc: 'archivist-nine', loc: 'putinlyandiya', todo: true, task: 'вернуть украденное + уничтожить 1 «преступный» терминал' },
      warprom: { id: 'amnesty-wp', npc: 'quartermaster-krotova', loc: 'kreml', todo: true, task: 'выполнить заказ интенданта: 3 ремонта оружия или бой с мародёрами' },
      tinBrotherhood: { id: 'amnesty-tin', npc: 'ken', loc: 'zhestoboy', todo: true, task: 'искупить на арене: победа без потери союзника' },
      scavengers: { id: 'amnesty-scv', npc: 'glava-musora', loc: 'svalka', todo: true, task: 'принести редкий лом (rare-parts ×3) в «налог»' },
      pirates: { id: 'amnesty-pir', npc: 'burevestnik', loc: 'raytsentr', todo: true, task: 'проводить груз через море по квесту «Через море»' },
      renegades: { id: 'amnesty-ren', npc: 'marta', loc: 'marta', todo: true, task: 'освободить пленных в рейде Отступников' },
      neutralVillages: { id: 'amnesty-ns', npc: 'elder-ulyana', loc: 'svyatost', todo: true, task: 'труд на сельсовет: 3 дня работы (−3 дня) и компенсация потерпевшему' },
      default: { id: 'amnesty-generic', todo: true, task: 'извиниться перед потерпевшим (Убеждение СЛ 15) и заплатить компенсацию 100 × ур.' },
    },
    forge: { flag: 'forge-pass', talent: 'fake-codes', note: 'Поддельные документы: раз в узел вход под чужим именем без проверки розыска (талант/предмет), не снимает розыск' },
    kill: { note: 'убийство всех свидетелей в узле не снимает розыск — снижает прирост на 1 (хронические, «вырезать» нельзя)' },
  },
};

// ---------------------------------------------------------------- слухи и сообщения (тексты — готовые строки)
export const CRIME_RUMORS = {
  theft: ['Кто-то обчистил торговца в {loc}. Прилавок целый, а кошелёк — нет.', 'В {loc} шепчутся: «у меня тоже пропало». Стража ходит и смотрит на всех подряд.'],
  attack: ['В {loc} напали на {name}. Кто — никто не видел, но описание подозрительно похоже на вас.', 'Говорят, в {loc} {name} больше не торгует. Совсем.'],
  kill: ['{name} мёртв. Стража {faction} ищет убийцу и разговаривает вежливо, пока нет улик.', 'По {faction} ходит листовка с вашим профилем. Рисовал явно не мастер, но узнаваемо.'],
  bounty: ['За голову героя {faction} обещает {bounty} кр. Охотники уже вышли.'],
};
export const CRIME_TOASTS = {
  heat1: 'Розыск {faction}: Приметы', heat2: 'Розыск {faction}: Розыск', heat3: 'Розыск {faction}: НАГРАДА {bounty} кр.',
  heat4: 'Розыск {faction}: ОХОТА', heat5: 'Розыск {faction}: СМЕРТНЫЙ ПРИГОВОР', cleared: 'Розыск {faction} снят',
  stolen: 'Украдено: {item}', caught: 'Схватили за руку!', fine: 'Штраф {n} кр.',
};
