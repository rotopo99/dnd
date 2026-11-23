// Контент-волна 3. Спека: docs/specs/content-wave3.md §1–§3. Схема — как quests-wave2.js (шапка world/quests.js).
// Исходы (ключи QUEST_TURNIN/CONSEQUENCES) = id опций и стадий (questOutcome) или outcomeBy по флагам.
// Новое в схеме волны 3 (движок: world/state.js requiresOk / grant, world/data.js npcPlacement):
//   Requires { ctr: { id, min?, max? } } — счётчик W3_COUNTERS (выводится из флагов, хранить нечего);
//   Requires { rel: { npc, min } }       — отношение ивент-напарника save.cine.rel (шкала ±5, cinematics.md);
//   Effects  { rel: { npc: delta } }      — то же из квеста (Лиза: замок вскрывает она — rel −1);
//   подцель `all` с `toast` — строка при выполнении (метки Лизы «Открыто. Не благодари»).

const talk = (npc, location) => ({ kind: 'talk', npc, location });
const check = (skills, dc, onFail, extra = {}) => ({ kind: 'check', skills, dc, ...(onFail ? { onFail } : {}), ...extra });
const battle = (encounter, location, onFail) => ({ kind: 'battle', encounter, location, ...(onFail ? { onFail } : {}) });
const choice = (options) => ({ kind: 'choice', options });
const all = (goals, min) => ({ kind: 'all', goals, ...(min ? { min } : {}) });
const pay = (credits) => ({ kind: 'pay', credits });
const reach = (location) => ({ kind: 'reach', location });
const opt = (id, text, goal, next, extra = {}) => ({ id, text, ...(goal ? { goal } : {}), ...(next ? { next } : {}), ...extra });
const st = (id, text, goal, next, extra = {}) => ({ id, text, goal, ...(next === 'done' || next === 'failed' ? { end: next } : { next }), ...extra });
const Q = (id, name, giver, region, level, summary, stages, rewards, extra = {}) => ({
  id, name, type: 'mixed', key: false, giver, region, level, requires: null, summary, wave3: true, stages, rewards, ...extra,
});

// Числа волны 3 (баланс крутит balance-tester).
export const WAVE3_RULES = {
  lizaDoorDays: 10,      // «Дверь Лизы»: раз в N дней бесплатное «открыто» у тайника (rel ≥ lizaDoorRel)
  lizaDoorRel: 1,
  lizaGuestRel: 5,       // rel = 5: Лиза — гость на базе
  lizaLevel: 6,          // уровень героя для выдачи w3-liza
};

// Счётчики, выводимые из флагов: value = base + Σ plus − Σ minus, в [min, max]. Требование { ctr: { id, min, max } }.
export const W3_COUNTERS = {
  // «Снабжение» Гармонии (§2): старт 3, +1 за услугу посла, −1 за проваленное событие осады; < 2 — Совета нет
  'harmony-supply': { base: 3, min: 0, max: 5,
    plus: { 'flags-envoy-ai': 1, 'flags-envoy-ren': 1, 'flags-envoy-pir': 1 },
    minus: { 'flags-ev-shelling-lost': 1, 'flags-ev-sabotage-lost': 1 } },
  // Бюджет мощности Диспетчера (§3.3): 5, взлом +1; комнаты стоят 1–2 (Лифт — 2, чтобы всё не умещалось и со взломом)
  'disp-power': { base: 5, min: 0, max: 6,
    plus: { 'disp-hacked': 1 },
    minus: { 'disp-r-lamp': 1, 'disp-r-pacemaker': 2, 'disp-r-shumok': 1, 'disp-r-lift': 2, 'disp-r-laugh': 1 } },
  'disp-rooms': { base: 0, min: 0, max: 5,
    plus: { 'disp-r-lamp': 1, 'disp-r-pacemaker': 1, 'disp-r-shumok': 1, 'disp-r-lift': 1, 'disp-r-laugh': 1 } },
};

const room = (id, text, cost, extra = {}) =>
  opt(`r-${id}`, text, null, 'rooms', { requires: { notFlag: `disp-r-${id}`, ctr: { id: 'disp-power', min: cost }, ...(extra.requires || {}) },
    effects: { flags: [`disp-r-${id}`], ...(extra.effects || {}) } });

export const QUESTS_WAVE3 = [
  // ================= w3-vacation «Отпуск для контура» (комедия, бункер №4 «Бригада», ур. 6) =================
  Q('w3-vacation', 'Отпуск для контура', 'w3-node4', 'mechanids', 6,
    'Смена из одиннадцати механидов в Затопленном цеху объединена в один контур. Контур хочет отпуск. Каждый из одиннадцати — свой.',
    [
      st('ask', 'Узел-4 говорит за всех и немного за себя: «Мы хотим отпуск. Я хочу отпуск. Это разные заявления».', talk('w3-node4', 'dungeons-m16'), 'door'),
      st('door', 'Шлюз цеха заклинило в положении «смена». Открыть, не затопив коридор.', check(['tech', 'athletics'], 13, 'door-fight'), 'petition'),
      st('door-fight', 'Шлюз открылся сам. За ним — охрана контура: «Посторонним — в отпуск нельзя».', battle('enc-w3-brigade', 'dungeons-m16'), 'petition'),
      st('petition', 'Контур диктует заявление по форме АИ: одиннадцать голосов, четырнадцать копий. Записать так, чтобы каждый узнал своё.',
        check(['persuasion', 'analysis', 'meditation'], 14, 'night'), 'choice'),
      st('night', 'Заявление не сошлось с формой. Контур включил ночную смену: цех затопляет до утра.',
        choice([opt('wait', 'Переждать на трубах до утра. Мокро, но по графику.', null, 'choice', { effects: { hp: -6, flags: ['vac-night'] } })]), 'choice'),
      st('choice', 'Заявление готово. Осталось решить, что с ним делать.', choice([
        opt('formal', 'Оформить отпуск: печать окошка № 7 или любой штамп.', check(['persuasion', 'analysis', 'deception'], 13, null, { easeBy: [{ flag: 'customs-stamp', n: 2 }] }), 'back',
          { effects: { flags: ['vac-formal'], items: [{ item: 'rare-parts', n: 2 }] } }),
        opt('split', 'Расцепить контур: одиннадцать «я» вместо одного «мы».', check(['tech', 'hacking'], 16), 'back', { effects: { flags: ['vac-split'] } }),
        opt('resort', 'Отправить смену на курорт в Свободу, к рыбе и воде (120 кр.).', pay(120), 'back', { requires: { credits: 120 }, effects: { flags: ['vac-resort'] } }),
        opt('war', 'Отпуск — это навсегда. Выключить смену.', battle('enc-w3-brigade', 'dungeons-m16'), 'war2', { effects: { flags: ['vac-war'] } }),
      ]), 'back'),
      st('war2', 'Контур собирается заново из того, что осталось. Вторая смена.', battle('enc-w3-brigade-2', 'dungeons-m16'), 'back'),
      st('back', 'Вернуться к Узлу-4.', talk('w3-node4', 'dungeons-m16'), 'done'),
    ],
    { xp: 650, credits: 90, rep: { mechanids: 2 } },
    { outcomeBy: [{ key: 'war', all: ['vac-war'] }, { key: 'formal', all: ['vac-formal'] }, { key: 'split', all: ['vac-split'] }, { key: 'resort', all: ['vac-resort'] }] }),

  // ================= w3-sorter «Сортировщик» (тёмный, бункер №9 «Вторсырьё», ур. 7) =================
  Q('w3-sorter', 'Сортировщик', 'w3-sorter', 'scavengers', 7,
    'В Шахте Свалки скелет-сортировщик пятнадцать лет раскладывает людей по ящикам «годен / кости / вторсырьё». Сам он ждёт очереди в ящик «кости».',
    [
      st('ask', 'Сортировщик сверяется с ведомостью: «Номер ящика сорок два. Вам повезло: вы — вторсырьё. Шучу. Ещё не решил».', talk('w3-sorter', 'dungeons-m13'), 'shaft'),
      st('shaft', 'Спуститься по шахте мимо ящиков. В блоках шепчут души: «не туда», «я годен», «я ещё годен».',
        check(['perception', 'survival', 'religion'], 13, 'boxes'), 'decide'),
      st('boxes', 'Конвоиры ящиков не любят, когда читают надписи. Особенно вслух.', battle('enc-w3-boxes', 'dungeons-m13'), 'decide'),
      st('decide', 'Сортировщик не злой. Он добросовестный. Что делать с шахтой?', choice([
        opt('free', 'Пересортировать: «вторсырьё — тоже человек».', check(['persuasion', 'religion', 'meditation'], 16), null,
          { effects: { flags: ['sort-free'], deeds: ['mercy'] } }),
        opt('closed', 'Обрушить лифт. Шахты больше нет. Ящиков — тоже.', check(['tech', 'athletics'], 15), null, { effects: { flags: ['sort-closed'] } }),
        opt('sold', 'Сдать «станок» Королю свалок за 200 кредов.', talk('glava-musora', 'king-dumps'), null,
          { effects: { flags: ['sort-sold'], credits: 200, deeds: ['greed'] } }),
        opt('self', 'Дать отсортировать себя.', null, 'self-fight', { effects: { flags: ['sort-self'] } }),
      ]), null),
      st('self-fight', '«Вам номер ящика... о. Вы ко мне». Ведомость кончилась. Сортировщик переходит к ручной сортировке.',
        battle('enc-w3-sorter', 'dungeons-m13'), 'done', { effects: { items: [{ item: 'servo-parts', n: 1 }], flags: ['sort-tag'] } }),
    ].map((s) => (s.id === 'decide' ? { ...s, end: 'done' } : s)),
    { xp: 750, credits: 60, rep: { scavengers: 1 } },
    { outcomeBy: [{ key: 'self', all: ['sort-self'] }] }),

  // ================= w3-apology «Диспетчер извиняется» (киберспейс, бункер №7 «Диспетчер», ур. 9) =================
  Q('w3-apology', 'Диспетчер извиняется', 'w3-dispatcher', 'tekhonki', 9,
    'В Древнем бункере техоньков модуль-Диспетчер отключает «лишнее» и извиняется за каждое. За сутки он отключил пять вещей. Мощности хватит не на все.',
    [
      st('ask', 'Динамик Диспетчера: «Приношу извинения за ожидание. Приношу извинения за извинения. Войдите в терминал».', talk('w3-dispatcher', 'ruins-m36'), 'terminal'),
      st('terminal', 'Войти в терминал Диспетчера (Киберспейс).', check(['tech', 'hacking', 'proxy'], 14, 'purge'), 'rooms'),
      st('purge', 'Диспетчер счёл отряд лишним: «Приношу извинения». Охранные системы бункера включаются.', battle('enc-w3-purge', 'ruins-m36'), 'rooms'),
      st('rooms', 'Пять комнат «лишнего». Мощности — пять (стоимость — в скобках). Восстановить хотя бы три комнаты, остальное не поместится.', choice([
        room('lamp', 'Лампа: ночник в доме беженцев (1).', 1),
        room('pacemaker', 'Пейсмекер: техонёк Дед Болтик (2).', 2),
        room('shumok', 'Шумок: эфир «Голоса Пустошей» (1).', 1),
        room('lift', 'Лифт: подъём бункера (2).', 2),
        room('laugh', 'Смех по расписанию: динамик под Кремлём (1).', 1, { requires: { not: { flag: 'laugh-off' } } }),
        opt('r-laugh-sob', 'Смех по расписанию: его выключили. Включить обратно (1).', null, 'rooms',
          { requires: { notFlag: 'disp-r-laugh', flag: 'laugh-off', ctr: { id: 'disp-power', min: 1 } }, effects: { flags: ['disp-r-laugh'], mrl: -3 } }),
        opt('hack', 'Взломать бюджет: +1 мощности (один раз).', check(['hacking', 'tech'], 16), 'rooms', { requires: { notFlag: 'disp-hacked' }, effects: { flags: ['disp-hacked'] } }),
        opt('enough', 'Хватит. Выйти к Диспетчеру.', null, 'decide',
          { requires: { any: [{ ctr: { id: 'disp-rooms', min: 3 } }, { ctr: { id: 'disp-power', max: 0 } }] } }),
      ]), 'decide'),
      st('decide', 'Диспетчер ждёт: «Подскажите критерий лишнего. Я больше не уверен».', choice([
        opt('live', 'Научить приоритету «живое».', null, null, { effects: { flags: ['disp-live'] } }),
        opt('off', 'Отключить Диспетчера.', check(['tech', 'hacking'], 17, 'off-fail'), null, { effects: { flags: ['disp-off'] } }),
        opt('silent', 'Промолчать. Пусть извиняется.', null, null, { effects: { flags: ['disp-silent'] } }),
      ]), null),
      st('off-fail', 'Диспетчер извиняется и отключает «лишнее» в отряде. Охрана бункера — тоже с извинениями.',
        battle('enc-w3-purge', 'ruins-m36'), 'done', { effects: { flags: ['disp-silent'] } }),
    ].map((s) => (s.id === 'decide' ? { ...s, end: 'done' } : s)),
    { xp: 1000, credits: 110, rep: { tekhonki: 2 } },
    { outcomeBy: [{ key: 'off', all: ['disp-off'] }, { key: 'live', all: ['disp-live'] }, { key: 'silent', all: ['disp-silent'] }] }),
];

export const QUESTS_WAVE3_MAP = Object.fromEntries(QUESTS_WAVE3.map((q) => [q.id, q]));

// NPC, которых волна 3 ставит на узлы по условию (world/data.js npcPlacement; потом consequences npcs.vanish/move).
// when: { all, any, not: [flag], level, quest: { id, state: 'none'|'active'|'any'|'done' }, rel: { npc, min } } — всё AND.
export const W3_NPC_RULES = [];
