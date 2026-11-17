// Контент-волна 1: 8 квестов «по образцам из топа CRPG». Спека: docs/specs/content-wave1.md.
// Схема — как world/quests-npc.js (шапка world/quests.js). NPC — id из density-npcs.js, бои — существующие ENCOUNTERS,
// узлы — реальные id locations.js. Исходы (ключи QUEST_TURNIN/CONSEQUENCES) = id опций и стадий (questOutcome).
// Новые поля для программиста (см. спеку, раздел 5): `timer` (квест на время), `challenge.onFail`-ветки уже есть,
// `accuse` (обвинение в детективе) выражено обычным choice с `requires.flags` — новой логики не нужно.

const talk = (npc, location) => ({ kind: 'talk', npc, location });
const check = (skills, dc, onFail) => ({ kind: 'check', skills, dc, ...(onFail ? { onFail } : {}) });
const battle = (encounter, location) => ({ kind: 'battle', encounter, location });
const item = (id, n = 1) => ({ kind: 'item', item: id, n });
const pay = (credits) => ({ kind: 'pay', credits });
const choice = (options) => ({ kind: 'choice', options });
const all = (goals, min) => ({ kind: 'all', goals, ...(min ? { min } : {}) });
const opt = (id, text, goal, next, extra = {}) => ({ id, text, ...(goal ? { goal } : {}), next, ...extra });
const st = (id, text, goal, next) => ({ id, text, goal, ...(next === 'done' || next === 'failed' ? { end: next } : { next }) });
const Q = (id, name, giver, region, level, summary, stages, rewards, extra = {}) => ({
  id, name, type: 'mixed', key: false, giver, region, level, requires: null, summary, wave1: true, stages, rewards, ...rewards, ...extra,
});

export const QUESTS_WAVE1 = [
  // ================= (а) Дилемма дележа: «Шесть фильтров на два села» (ур. 5) =================
  // Зачем здесь Огород: фермер — единственный, кто знает, что ящик нашёл не тот, кому он нужен. Цена у каждого ответа своя.
  Q('w1-filters', 'Шесть фильтров на два села', 'd-ogorod', 'neutralVillages', 5,
    'В ящике на Остановке — шесть фильтров для воды. Аграра и Святость хотят всё, Свалка заявляет «нашли на нашей дороге». Шесть на троих: арифметика сдаётся первой.',
    [
      st('ask', 'Огород упёрся лбом в ящик: «Шесть штук. Я считал три раза, а ещё четыре — для уверенности».', talk('d-ogorod', 'agrara'), 'split'),
      st('split', 'Кому достаются фильтры?', choice([
        opt('villages', 'Отдать селениям: пусть пьют чистое.', talk('d-svechka', 'svyatost'), 'back'),
        opt('scav', 'Отдать Свалке: они нашли, они же и таскали.', talk('d-kuchka', 'svalka'), 'back'),
        opt('half', 'Поделить по справедливости: три и три.', check(['persuasion', 'military', 'analysis'], 14, 'half-brawl'), 'back'),
        opt('fake', 'Подменить часть фильтров «похожими» — и никому не обидно.', check(['deception', 'tech'], 13, 'fake-caught'), 'back'),
        opt('keep', 'Забрать всё. Фильтры любят тихих.', battle('v4-scv-patrol', 'ostanovka'), 'back'),
      ]), 'back'),
      st('half-brawl', 'Обе стороны услышали «справедливо» как «мне меньше». Свалка уже закатывает рукава.', battle('w-road-scavengers', 'ostanovka'), 'back'),
      st('fake-caught', 'Подмена вскрылась на первой же кружке. Придётся возместить ущерб — и цену чужого доверия.', pay(80), 'back'),
      st('back', 'Вернуться к Огороду и объяснить, что получилось.', talk('d-ogorod', 'agrara'), 'done'),
    ],
    { xp: 380, credits: 120, rep: { neutralVillages: 2 } }),

  // ================= (б) Комедийный NPC: «Цирк на гастролях» (ур. 4) =================
  // Зачем здесь Арлекин: он единственный, кто считает, что апокалипсис — это антракт. Легенду можно сломать, можно разделить.
  Q('w1-circus', 'Цирк на гастролях', 'd-arlekin', 'none', 4,
    'Арлекин-Без-Цирка уверяет, что цирк не закрыт, а «на выездных гастролях в соседнем измерении». Зрители — три манекена. Касса — банка из-под тушёнки.',
    [
      st('ask', 'Арлекин сверяется с афишей 2009 года: сегодня «грандиозное возвращение».', talk('d-arlekin', 'circuses-m40'), 'act'),
      st('act', 'Что делать с легендой?', choice([
        opt('truth', 'Показать, что афиша — прошлое, а манекены — манекены.', check(['analysis', 'perception', 'persuasion'], 13, 'encore'), 'back'),
        opt('play', 'Подыграть и дать представление самим.', check(['deception', 'persuasion', 'acrobatics'], 12, 'encore'), 'back'),
        opt('sponsor', 'Купить билеты на весь зал (манекены не торгуются).', pay(30), 'back'),
        opt('scare', 'Намекнуть, что «контролёр манежа» уже в пути.', check(['intimidation', 'deception'], 13, 'encore'), 'back'),
      ]), 'back'),
      st('encore', 'Арлекин решил, что вы — новый номер программы. Придётся отработать выход на бис (билет в труппу — 20 кр.).', pay(20), 'back'),
      st('back', 'Передать Арлекину итог.', talk('d-arlekin', 'circuses-m40'), 'done'),
    ],
    { xp: 240, credits: 50, items: [{ item: 'tushenka', n: 2 }], rep: {} }),

  // ================= (в) Квест на время: «Баржа или семена» (ур. 6) =================
  // Зачем здесь Причал: единственный, кто видит оба конца реки. Таймер 3 дня; успеть обе можно только чистой работой.
  Q('w1-flood', 'Баржа или семена', 'd-prichal', 'neutralVillages', 6,
    'Паводок. На Свободе шлюз зажал баржу с беженцами, на Белбе вода подбирается к складу семян. До Причала — три дня, до Белбы — день пути. Успеть оба можно, если не споткнуться.',
    [
      st('ask', 'Причал показывает карту реки двумя пальцами: «Здесь, и здесь. Один я».', talk('d-prichal', 'svoboda'), 'race'),
      st('race', 'Спасти баржу в Свободе и/или склад семян в Белбе. Хотя бы одно.', all([
        { ...choice([
          opt('barge-tech', 'Баржа: открыть шлюз вручную.', check(['tech', 'athletics'], 13), null),
          opt('barge-talk', 'Баржа: организовать живую цепочку людей.', check(['persuasion', 'military', 'medicine'], 12), null),
        ]), location: 'svoboda', doneFlag: 'w1-barge-saved' },
        { ...check(['survival', 'athletics', 'tech'], 13), location: 'belba', doneFlag: 'w1-seeds-saved' },
      ], 1), 'back'),
      st('back', 'Вернуться к Причалу, пока он не придумал третий поток.', talk('d-prichal', 'svoboda'), 'done'),
    ],
    { xp: 520, credits: 100, rep: { neutralVillages: 4 } },
    { timer: { days: 3, stage: 'race', onExpire: 'late' },
      // outcomeBy: первый набор флагов, что есть → ключ исхода (questOutcome)
      outcomeBy: [{ key: 'both', all: ['w1-barge-saved', 'w1-seeds-saved'] }, { key: 'barge', all: ['w1-barge-saved'] }, { key: 'seeds', all: ['w1-seeds-saved'] }] }),

  // ================= (г) Детектив: «Кто посолил котёл» (ур. 6) =================
  // Зачем здесь Камбуз: его обвиняют, и он единственный, кому нужна правда, а не быстрый приговор. Улики спорят друг с другом.
  Q('w1-cauldron', 'Кто посолил котёл', 'd-kambuz', 'pirates', 6,
    'В общем котле Райцентра — яд. Трое слегли, команда ищет, кого повесить. Первым назван кок: «посуда его — значит, виноват». Кок просит найти виновного до заката.',
    [
      st('ask', 'Камбуз разводит руками: «Я бы такое не сварил. У меня и рецепта нет».', talk('d-kambuz', 'raytsentr'), 'clues'),
      st('clues', 'Собрать улики. Достаточно трёх из четырёх — но не все ведут к одному.', all([
        { ...check(['medicine', 'biology', 'analysis'], 12), doneFlag: 'w1-clue-mold', location: 'raytsentr' },
        { ...check(['perception', 'lockpicking'], 13), doneFlag: 'w1-clue-key', location: 'raytsentr' },
        { ...check(['persuasion', 'deception', 'perception'], 13), doneFlag: 'w1-clue-log', location: 'raytsentr' },
        { ...check(['persuasion', 'intimidation', 'analysis'], 13), doneFlag: 'w1-clue-debt', location: 'pirates-m29' },
      ], 3), 'accuse'),
      st('accuse', 'Назвать виновного перед командой.', choice([
        opt('parus-proof', 'Парус: плесень в его кружке и долг за карты — это он.', null, 'verdict', { requires: { flags: ['w1-clue-mold', 'w1-clue-debt'] } }),
        opt('parus-guess', 'Парус — без улик, на чутье и блеф.', check(['deception', 'persuasion', 'intimidation'], 16, 'wrong'), 'verdict'),
        opt('yakor', 'Якорь: ключ от кладовки был только у него.', null, 'verdict', { requires: { flags: ['w1-clue-key'] } }),
        opt('kambuz', 'Виноват кок. Дело закрыть.', null, 'verdict'),
        opt('duel', 'Разобраться с командой, пока не повесили не того.', battle('v3-pir-raid', 'raytsentr'), 'verdict'),
      ]), 'verdict'),
      st('wrong', 'Блеф не прошёл. Команда решила, что вы тянете время, и стала искать другого виноватого — вас.', battle('w-road-pirates', 'raytsentr'), 'verdict'),
      st('verdict', 'Вернуться к Камбузу за итогом.', talk('d-kambuz', 'raytsentr'), 'done'),
    ],
    { xp: 480, credits: 140, rep: { pirates: 2 } }),

  // ================= (д) Суд/дебаты: «Душа не имущество» (ур. 8) =================
  // Зачем здесь Колобок: бабка приютила скелета и единственная знает, что «имущество» по вечерам вяжет носки. Судит вече, подкупить его может Свалка.
  Q('w1-hearing', 'Душа не имущество', 'd-kolobok', 'neutralVillages', 8,
    'В Перемоге созвано вече: Свалка требует вернуть «беглое имущество» — скелета с блоком памяти, а послушник Судьи заявляет, что бездомные души принадлежат Судье. Нужен адвокат. Из свободных — только вы.',
    [
      st('ask', 'Колобок собирает скелету узелок, как в школу: «Защити его, милок. Вечевой звонит один раз».', talk('d-kolobok', 'kalostok'), 'method'),
      st('method', 'Как выигрывать дело?', choice([
        opt('debate', 'Дебаты: четыре довода до трёх сорванных слов.', { kind: 'challenge', skills: ['persuasion', 'judge', 'religion', 'analysis'], dc: 14, successes: 4, failures: 3, onFail: 'defeat' }, 'back'),
        opt('proof', 'Улика: доказать, что у скелета есть «прописка» в Перемоге.', check(['analysis', 'tech', 'perception'], 15, 'defeat'), 'back'),
        opt('ordeal', 'Суд поединком, как в старину (и как в плохие времена).', battle('v3-scv-skeleton-hunt', 'peremoga'), 'back'),
        opt('bribe', 'Подмазать вече (колокол любит звон).', pay(250), 'back'),
      ]), 'back'),
      st('defeat', 'Вече постановило «передать». Остаётся смириться — или вмешаться до выхода из зала.', choice([
        opt('handover', 'Смириться и передать.', null, 'back'),
        opt('breakout', 'Устроить побег у ворот.', battle('v3-scv-skeleton-hunt', 'peremoga'), 'back'),
      ]), 'back'),
      st('back', 'Рассказать Колобку, чем кончилось вече.', talk('d-kolobok', 'kalostok'), 'done'),
    ],
    { xp: 640, credits: 160, rep: { neutralVillages: 4 } }),

  // ================= (е) Заказчик врёт: «Лекарства для Гармонии» (ур. 7) =================
  // Зачем здесь Флажок: Отступники не врут врагам, только «друзьям, которых берегут». Правда всплывает позже, и это зависит от вас.
  Q('w1-medbox', 'Лекарства для Гармонии', 'd-flazhok', 'renegades', 7,
    'Связная Флажок просит донести ящик с лекарствами до Лопуха в Гармонии. Ящик тяжелее, чем лекарства, и пахнет немножко порохом, немножко листовками.',
    [
      st('ask', 'Флажок протягивает ящик: «Пломбу не ломать. Там дети, температура, горло».', talk('d-flazhok', 'shtabtsentr'), 'carry'),
      st('carry', 'Что делать с ящиком?', choice([
        opt('blind', 'Донести как есть. Пломба — святое.', talk('d-lopukh', 'garmoniya'), 'back'),
        opt('peek', 'Вскрыть тихо и проверить.', check(['lockpicking', 'tech', 'perception'], 13, 'trap'), 'truth'),
      ]), 'back'),
      st('trap', 'Пломба оказалась с сюрпризом: хлопок краски и вонь на три дня. Теперь Лопух точно будет знать, что ящик трогали.', { kind: 'reach', location: 'garmoniya' }, 'truth'),
      st('truth', 'Внутри — самодельные мины и листовки «Агрозоне — свободу!». Никаких лекарств.', choice([
        opt('confront', 'Вернуться к Флажок и потребовать объяснений.', check(['persuasion', 'intimidation'], 14, 'back'), 'back'),
        opt('report', 'Сдать ящик Партии: пусть разбираются.', talk('d-shlagbaum', 'harmony-post'), 'back'),
        opt('sell', 'Продать мины тому, кто больше даст.', talk('d-kuchka', 'svalka'), 'back'),
      ]), 'back'),
      st('back', 'Итог для Флажок.', talk('d-flazhok', 'shtabtsentr'), 'done'),
    ],
    { xp: 560, credits: 120, rep: { renegades: 2 } }),

  // ================= (ж) Элитный охотник: «Костолом» (ур. 8) =================
  // Зачем здесь Труп: могильщик — единственный, кто пересчитывает кости каждое утро и заметил недостачу. Лор и условие: у Костолома слабое место.
  Q('w1-hunter', 'Костолом', 'd-trup', 'none', 8,
    'Кто-то раскапывает старые могилы Некрополя и забирает скелетов «на запчасти». Мусорщик по прозвищу Костолом, охотник на скелетов. Говорят, ему нравятся только те, кто убегает.',
    [
      st('ask', 'Труп шепчет: «Каждое утро — на три кости меньше. Я считаю. Это моя работа».', talk('d-trup', 'necropolises-m47'), 'hunt'),
      st('hunt', 'Как остановить Костолома?', choice([
        opt('fight', 'Выйти на него в лоб.', battle('v4-scv-elite', 'necropolises-m47'), 'back'),
        opt('trap', 'Устроить засаду на кладбищенской тропе.', check(['stealth', 'survival'], 15, 'fight'), 'back', { requires: { item: 'tripwire' } }),
        opt('respect', 'Договориться по-мусорщицки: показать, что вы уважаемые.', check(['persuasion', 'intimidation'], 13, 'fight'), 'back', { requires: { rep: { faction: 'scavengers', min: 'friendly' } } }),
        opt('decoy', 'Подсунуть фальшивую карту «заброшенной братской могилы».', check(['deception', 'analysis'], 14, 'fight'), 'back'),
      ]), 'back'),
      st('fight', 'Засада не удалась, Костолом вышел сам. Разговор будет коротким.', battle('v4-scv-elite', 'necropolises-m47'), 'back'),
      st('back', 'Рассказать Трупу.', talk('d-trup', 'necropolises-m47'), 'done'),
    ],
    { xp: 760, credits: 180, items: [{ item: 'rare-parts', n: 2 }], rep: { scavengers: -2 } }),

  // ================= (з) Ремонт узла: «Остановка без света» (ур. 5) =================
  // Зачем здесь Расписание: он 11 лет ждёт поезд, которого нет. Чинить можно только одну из трёх систем — и от выбора зависит, что станет с узлом.
  Q('w1-station', 'Остановка без света', 'd-rasp', 'neutralVillages', 5,
    'Станция «Остановка» встала: нет света, воды и связи. Запчастей хватит на один из трёх узлов. Расписание клянётся, что поезд будет, но сперва нужно решить, что включать.',
    [
      st('ask', 'Расписание тычет в мертвые лампы: «Поезд придёт, когда загорится что-нибудь одно. Выбирай».', talk('d-rasp', 'ostanovka'), 'pick'),
      st('pick', 'Что чинить?', choice([
        opt('light', 'Свет: генератор и проводка.', check(['tech', 'hacking', 'athletics'], 13, 'brownout'), 'back'),
        opt('water', 'Вода: насос и фильтр (пригодятся фильтры с Остановки).', check(['tech', 'survival', 'medicine'], 12, 'brownout'), 'back'),
        opt('comms', 'Связь: антенна и ретранслятор.', check(['hacking', 'tech', 'analysis'], 14, 'brownout'), 'back'),
        opt('parts', 'Купить запчасти и починить всё чуть-чуть.', pay(150), 'back'),
      ]), 'back'),
      st('brownout', 'Узел дал искру и погас. Что-то всё-таки заработало, но не то, что вы хотели.', item('servo-parts', 1), 'back'),
      st('back', 'Показать Расписанию, что загорелось.', talk('d-rasp', 'ostanovka'), 'done'),
    ],
    { xp: 340, credits: 80, rep: { neutralVillages: 3 } }),
];

export const QUESTS_WAVE1_MAP = Object.fromEntries(QUESTS_WAVE1.map((q) => [q.id, q]));

// Кто какой квест выдаёт (для density-npcs GIVERS / NPC `quest`).
export const WAVE1_GIVERS = {
  'd-ogorod': 'w1-filters', 'd-arlekin': 'w1-circus', 'd-prichal': 'w1-flood', 'd-kambuz': 'w1-cauldron',
  'd-kolobok': 'w1-hearing', 'd-flazhok': 'w1-medbox', 'd-trup': 'w1-hunter', 'd-rasp': 'w1-station',
};
