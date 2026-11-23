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
  lizaKeysRel: 3,        // rel ≥ N: +1 тайник Лизы в каждом подземелье и +lizaPickBonus к «Взлому» героя
  lizaPickBonus: 1,
  lizaCache: { kinds: ['dungeon'], loot: [{ credits: 35 }, { item: 'servo-parts', n: 1 }] },
  // w3-flags осада: события на дни +2 и +4 от начала осады, выбор стороны — с дня +6
  siegeDays: { shelling: 2, sabotage: 4, end: 6 },
  nightShiftMul: 0.7,    // w3-vacation: провал petition (ночная смена) — награда −30%
  node4Ally: 'w3-node4-ally', // vac-split: Узел-4 идёт с отрядом на один бой (флаг skirm-escort)
  // хаб после w3-flags (consequences §2 «Цена»/«Карта»): повторяющиеся события — events-wave3.js (trigger.every)
  pirTravelCut: 0.1,     // harmony-pir: торговые маршруты — дорога −10% (дробные дни копятся в save.w3.travelBank)
  pirExitToll: 0.05,     // harmony-pir: пошлина 5% кредитов на выход из Гармонии
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

// w3-flags осада: стадия открывается на день +N от начала осады (вход в siege-1; requiresOk questDays, gate — текст замка)
const siegeAt = (n) => ({ requires: { questDays: { id: 'w3-flags', stage: 'siege-1', min: n } }, gate: { text: 'w3.siegeWait', vars: { n } } });

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
        choice([opt('wait', 'Переждать на трубах до утра. Мокро, но по графику.', null, 'choice', { effects: { hp: -6, flags: ['vac-night'], text: 'Ночная смена: награда за отпуск урежется на 30%.' } })]), 'choice'),
      st('choice', 'Заявление готово. Осталось решить, что с ним делать.', choice([
        opt('formal', 'Оформить отпуск: печать окошка № 7 или любой штамп.', check(['persuasion', 'analysis', 'deception'], 13, null, { easeBy: [{ flag: 'customs-stamp', n: 2 }] }), 'back',
          { effects: { flags: ['vac-formal'], items: [{ item: 'rare-parts', n: 2 }] } }),
        opt('split', 'Расцепить контур: одиннадцать «я» вместо одного «мы».', check(['tech', 'hacking'], 16), 'back',
          { effects: { flags: ['vac-split'], escort: WAVE3_RULES.node4Ally, text: 'Узел-4: «Хочу узнать, что такое „в одиночку“». Он идёт с вами на один бой.' } }),
        opt('resort', 'Отправить смену на курорт в Свободу, к рыбе и воде (120 кр.).', pay(120), 'back', { requires: { credits: 120 }, effects: { flags: ['vac-resort'] } }),
        opt('war', 'Отпуск — это навсегда. Выключить смену.', battle('enc-w3-brigade', 'dungeons-m16'), 'war2', { effects: { flags: ['vac-war'] } }),
      ]), 'back'),
      st('war2', 'Контур собирается заново из того, что осталось. Вторая смена.', battle('enc-w3-brigade-2', 'dungeons-m16'), 'back'),
      st('back', 'Вернуться к Узлу-4.', talk('w3-node4', 'dungeons-m16'), 'done'),
    ],
    { xp: 650, credits: 90, rep: { mechanids: 2 } },
    { rewardCut: [{ flag: 'vac-night', mul: WAVE3_RULES.nightShiftMul }], // ночная смена: награда −30%
      outcomeBy: [{ key: 'war', all: ['vac-war'] }, { key: 'formal', all: ['vac-formal'] }, { key: 'split', all: ['vac-split'] }, { key: 'resort', all: ['vac-resort'] }] }),

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
        battle('enc-w3-sorter', 'dungeons-m13'), 'done', { effects: { items: [{ item: 'recycle-tag', n: 1 }], flags: ['sort-tag'] } }),
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

  // ================= w3-liza «Дверь на двоих» (личный квест ивент-напарницы, бункер №5 «Выправка», ур. 7) =================
  // Лиза не вербуется (канон: партия — в своих ивентах): записка на люке, rel ±5 (save.cine.rel), сцена c9 на стадии door.
  Q('w3-liza', 'Дверь на двоих', 'liza', 'neutralVillages', 7,
    'На люке под дачей — записка почерком Лизы: «Я у отцовской двери. Не торопись. Торопись». Её отец был инженером подземного города.',
    [
      st('ask', 'Лиза сидит на люке и вертит отмычку: «Отец работал в Старой кузне. Там его шкаф. Я сорок лет открываю чужие двери, а свою боюсь».', talk('liza', 'bunker-lisa'), 'decide'),
      st('decide', 'Пойти с Лизой к отцовской двери?', choice([
        opt('help', 'Пойти. Двери на двоих открываются быстрее.', null, 'marks'),
        opt('skip', 'Не сейчас. Не моя дверь.', null, null, { effects: { flags: ['liza-skip'] } }),
      ]), null),
      st('marks', 'Найти метки Лизы на дверях, по которым она шла к кузне. Хватит двух из трёх.', all([
        { ...check(['lockpicking', 'perception'], 12), location: 'bunker-lisa', doneFlag: 'liza-m1', toast: 'Открыто. Не благодари', desc: 'Метка на люке: «Тут жили люди. Свет не выключали»' },
        { ...check(['lockpicking', 'perception', 'tech'], 13), location: 'harmony-workshop', doneFlag: 'liza-m2', toast: 'Открыто. Не благодари', desc: 'Метка на двери мастерской Николы' },
        { ...check(['lockpicking', 'perception', 'stealth'], 14), location: 'dungeons-m12', doneFlag: 'liza-m3', toast: 'Открыто. Не благодари', desc: 'Метка в коридорах под Кремлём' },
      ], 2), 'forge'),
      st('forge', 'Старая кузня. Распрямители всё ещё правят осанку тем, кто зашёл. Спины у них прямые, у гостей — нет.',
        battle('enc-w3-straight', 'dungeons-m17', 'fled'), 'locker', { effects: { flags: ['liza-forge-done'] } }),
      st('fled', 'Пришлось отступить. Лиза вернётся в кузню одна, когда вас не будет рядом.',
        choice([opt('leave', 'Оставить Лизу с её дверью.', null, 'note', { effects: { flags: ['liza-silent'], rel: { liza: 1 } } })]), 'note'),
      st('locker', 'Шкаф отца. Замок старый и упрямый, как инженер, который его ставил.', check(['lockpicking', 'hacking', 'tech'], 15, 'locker-liza'), 'door'),
      st('locker-liza', 'Замок не поддаётся. Лиза отодвигает вас плечом: «Дай. Это моя дверь».',
        choice([opt('step-back', 'Отойти.', null, 'door', { effects: { rel: { liza: -1 } } })]), 'door'),
      st('door', 'Шкаф открыт. Внутри — запись отца. Что делать с ней?', choice([
        opt('truth', 'Показать запись Лизе.', null, 'note', { effects: { flags: ['liza-truth'], rel: { liza: 3 } } }),
        opt('self', 'Дать ей открыть и включить самой.', null, 'note', { effects: { flags: ['liza-self-open'], rel: { liza: 4 } } }),
        opt('lie', 'Спрятать запись: пусть думает, что он запер.', null, 'note', { effects: { flags: ['liza-lie', 'ai-delisting-proof'], rel: { liza: -2 } } }),
        opt('silent', 'Промолчать.', null, 'note', { effects: { flags: ['liza-silent'], rel: { liza: 1 } } }),
      ]), 'note'),
      st('note', 'Вернуться на базу: Лиза обещала оставить записку на двери.', reach('bunker-lisa'), 'done'),
    ].map((s) => (s.id === 'decide' ? { ...s, end: 'done' } : s)),
    { xp: 900, credits: 80, rep: { neutralVillages: 3 } },
    { requires: { flags: ['act1-done'], level: WAVE3_RULES.lizaLevel, any: [{ flag: 'liza-freed' }, { flag: 'liza-met' }, { flag: 'met-liza' }] },
      outcomeBy: [{ key: 'skip', all: ['liza-skip'] }, { key: 'lie', all: ['liza-lie'] }, { key: 'truth', all: ['liza-truth'] },
        { key: 'self', all: ['liza-self-open'] }, { key: 'silent', all: ['liza-silent'] }] }),

  // ================= w3-flags «Три флага над Гармонией» (фракционная война за хаб, ур. 8) =================
  // Снабжение harmony-supply (W3_COUNTERS): 3 + услуги послов − проваленные события осады; Совет — при ≥ 3 и дебатах (c10).
  Q('w3-flags', 'Три флага над Гармонией', 'sera', 'technikums', 8,
    'Три силы требуют ключи от Альфа-Гармонии: Партия, Отступники и пираты. Пять тысяч беженцев ждут, кто будет раздавать хлеб. Сера просит — тише.',
    [
      st('ask', 'Сера по громкой связи: «Три флага просят слова. Я прошу — тише». Потом — вам, без микрофона: «Поговорите с послами. Все врут. По-разному».', talk('sera', 'alpha-harmony'), 'envoys'),
      st('envoys', 'Послы ждут услуги. Каждая выполненная — +1 к снабжению Гармонии.', all([
        { ...battle('enc-w3-clear', 'harmony-post'), doneFlag: 'flags-envoy-ai', desc: 'Посол Партии: «Зачистите подходы к посту № 2. Порядок любит пустые коридоры»' },
        { ...check(['persuasion', 'intimidation', 'religion'], 15), location: 'alpha-harmony', doneFlag: 'flags-envoy-ren', desc: 'Посланница Марты: сказать беженцам правильные слова про стену' },
        { kind: 'choice', location: 'harmony-workshop', doneFlag: 'flags-envoy-pir', desc: 'Агент Буревестника: взнос «на общее дело» или хорошая легенда', options: [
          opt('fee', 'Внести 120 кредов.', { ...pay(120), location: 'harmony-workshop' }, null, { requires: { credits: 120 } }),
          opt('tale', 'Рассказать легенду, которую капитан купит.', { ...check(['deception', 'persuasion'], 16), location: 'harmony-workshop' }),
        ] },
      ]), 'siege-1'),
      st('siege-1', 'Осада. Сектор D под обстрелом: удержать насосы, пока не кончились снаряды. Или терпение.',
        { ...check(['tech', 'military', 'athletics'], 14, 'siege-1-lost'), location: 'harmony-sector-d' }, 'siege-2', siegeAt(WAVE3_RULES.siegeDays.shelling)),
      st('siege-1-lost', 'Насосы сектора D пробиты. Воды меньше, злости больше.',
        choice([opt('accept-1', 'Списать потери и идти дальше.', null, 'siege-2', { effects: { flags: ['flags-ev-shelling-lost'] } })]), 'siege-2'),
      st('siege-2', 'Диверсия на складе: кто-то хочет, чтобы хлеба не досталось никому.', battle('enc-w3-sabotage', 'harmony-sector-d', 'siege-2-lost'), 'side',
        siegeAt(WAVE3_RULES.siegeDays.sabotage)),
      st('siege-2-lost', 'Склад горит. Диверсанты ушли. Хлеба стало меньше на одну неделю.',
        choice([opt('accept-2', 'Тушить, что осталось.', null, 'side', { effects: { flags: ['flags-ev-sabotage-lost'] } })]), 'side'),
      st('side', 'Осада выдохлась. Ключи от Гармонии — на столе у Серы. Чей флаг поднять?', choice([
        opt('ai', 'Партия: порядок, комендантский час, указ № 1.', null, 'back', { requires: { rep: { faction: 'aiParty', min: 'neutral' } }, effects: { flags: ['harmony-ai'] } }),
        opt('ai-lox', 'Партия — и отдать ей Lox в придачу.', null, 'back',
          { requires: { flags: ['truth-harmony-quiet', 'met-lox'], rep: { faction: 'aiParty', min: 'neutral' } }, effects: { flags: ['harmony-ai', 'lox-handed'], deeds: ['cruelty'] } }),
        opt('ren', 'Отступники: стена, ополчение, мины Яроша.', null, 'back', { requires: { rep: { faction: 'renegades', min: 'neutral' } }, effects: { flags: ['harmony-ren'] } }),
        opt('pir', 'Пираты: торг, пошлины, счёт — потом.', null, 'back',
          { requires: { any: [{ rep: { faction: 'pirates', min: 'neutral' } }, { flag: 'customs-closed' }] }, effects: { flags: ['harmony-pir'] } }),
        opt('pir-buy', 'Купить пиратам ключи: 250 кредов.', pay(250), 'back', { requires: { credits: 250 }, effects: { flags: ['harmony-pir'] } }),
        opt('council', 'Совет беженцев: Сера, Парацетамол, Айнура. Вече на палубе.', null, 'debate',
          { requires: { ctr: { id: 'harmony-supply', min: 3 } }, effects: { flags: ['harmony-debate'] } }),
        opt('abstain', 'Не поднимать ничей флаг. Пусть делят сами.', null, 'back', { effects: { flags: ['harmony-abstain'] } }),
      ]), 'back', siegeAt(WAVE3_RULES.siegeDays.end)),
      st('debate', 'Вече: четыре стула из ящиков, три посла, пять тысяч номерков. Переспорить всех.',
        { kind: 'challenge', skills: ['persuasion', 'analysis', 'intimidation'], dc: 17, successes: 4, failures: 3, onFail: 'debate-lost', easeBy: [{ flag: 'truth-harmony-public', n: 2 }] },
        'council-won'),
      st('council-won', 'Вече проголосовало. Рассказать Сере, что ключи теперь у Совета.', talk('sera', 'alpha-harmony'), 'done',
        { effects: { flags: ['harmony-council'] } }),
      st('debate-lost', 'Вече не договорилось. Совета не будет. Выбирайте флаг сами.', choice([
        opt('ai', 'Партия.', null, 'back', { requires: { rep: { faction: 'aiParty', min: 'neutral' } }, effects: { flags: ['harmony-ai'] } }),
        opt('ren', 'Отступники.', null, 'back', { requires: { rep: { faction: 'renegades', min: 'neutral' } }, effects: { flags: ['harmony-ren'] } }),
        opt('pir', 'Пираты.', null, 'back', { requires: { any: [{ rep: { faction: 'pirates', min: 'neutral' } }, { flag: 'customs-closed' }] }, effects: { flags: ['harmony-pir'] } }),
        opt('pir-buy', 'Пираты, за 250 кредов.', pay(250), 'back', { requires: { credits: 250 }, effects: { flags: ['harmony-pir'] } }),
        opt('abstain', 'Никто.', null, 'back', { effects: { flags: ['harmony-abstain'] } }),
      ]), 'back'),
      st('back', 'Рассказать Сере, чей флаг теперь над Гармонией.', talk('sera', 'alpha-harmony'), 'done'),
    ],
    { xp: 1300, credits: 150, rep: { technikums: 3 } },
    { requires: { any: [{ flags: ['act1-done', 'met-lox'] }, { quest: { id: 'w2-harmony-truth', state: 'done' } }], not: { flag: 'harmony-fallen' } },
      outcomeBy: [{ key: 'council', all: ['harmony-council'] }, { key: 'ai', all: ['harmony-ai'] }, { key: 'ren', all: ['harmony-ren'] },
        { key: 'pir', all: ['harmony-pir'] }, { key: 'abstain', all: ['harmony-abstain'] }] }),
];

export const QUESTS_WAVE3_MAP = Object.fromEntries(QUESTS_WAVE3.map((q) => [q.id, q]));

// NPC, которых волна 3 ставит на узлы по условию (world/data.js npcPlacement; потом consequences npcs.vanish/move).
// when: { all, any, not: [flag], level, quest: { id, state: 'none'|'active'|'any'|'done' }, rel: { npc, min } } — всё AND.
const LIZA_GATE = { all: ['act1-done'], any: ['liza-freed', 'liza-met', 'met-liza'], level: WAVE3_RULES.lizaLevel };
export const W3_NPC_RULES = [
  // Лиза у люка, пока квест предложен (записка) — и до сдачи; потом — гость базы при rel = 5
  { npc: 'liza', at: 'bunker-lisa', when: { ...LIZA_GATE, quest: { id: 'w3-liza', state: 'none' } } },
  { npc: 'liza', at: 'bunker-lisa', when: { quest: { id: 'w3-liza', state: 'active' } } },
  { npc: 'liza', at: 'bunker-lisa', when: { quest: { id: 'w3-liza', state: 'done' }, not: ['liza-skip'], rel: { npc: 'liza', min: WAVE3_RULES.lizaGuestRel } } },
  // w3-flags: послы трёх флагов на Гармонии, пока идёт квест
  { npc: 'w3-envoy-ai', at: 'harmony-post', when: { quest: { id: 'w3-flags', state: 'active' } } },
  { npc: 'w3-envoy-ren', at: 'alpha-harmony', when: { quest: { id: 'w3-flags', state: 'active' } } },
  { npc: 'w3-envoy-pir', at: 'harmony-workshop', when: { quest: { id: 'w3-flags', state: 'active' } } },
];
