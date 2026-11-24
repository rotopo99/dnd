// Контент-волна 4: поздняя игра и финал. Спека: docs/specs/content-wave4.md §2, §5. Схема — как quests-wave3.js.
// mq4-eve «Последняя ночь» — ключевой квест Райцентра перед судом (mq3-court requires eve-done). Стадии:
//   omen → twist (сцена c11 «Согласие»; без сцены — тот же выбор кнопками) → wall-1..3 (волны, между ними отдых)
//   → priest (аргумент или бой) → last-night (по карточке на напарника в отряде) → go (награда, суд начинается сам).
// Волна проиграна — не конец: стадия wall-N-lost (вал удержан ценой флага). Терминал хаба (saved-terminal) поднимает павшего
//   прямо в бою (триггер eve-terminal, раз за миссию), залп барж (harmony-pir) — триггер eve-barges.
// Эффекты обороны по флагам прежних решений — EVE_MODS (world/wave4.js eveSetup → scenes/world-battle.js encounterSetup).
// Новое в схеме: Effects { healPct } — лечит отряд на долю макс. ЗДР; { loyalty: { npc: d } } — лояльность напарника;
//   rewards.startQuest — квест, который начинается сразу после награды (если его requires выполнены).
import { COMPANIONS } from '../companions.js';
import { NPCS } from '../npcs.js';

const talk = (npc, location) => ({ kind: 'talk', npc, location });
const check = (skills, dc, onFail, extra = {}) => ({ kind: 'check', skills, dc, ...(onFail ? { onFail } : {}), ...extra });
const battle = (encounter, location, onFail) => ({ kind: 'battle', encounter, location, ...(onFail ? { onFail } : {}) });
const choice = (options, extra = {}) => ({ kind: 'choice', options, ...extra });
const opt = (id, text, goal, next, extra = {}) => ({ id, text, ...(goal ? { goal } : {}), ...(next ? { next } : {}), ...extra });
const st = (id, text, goal, next, extra = {}) => ({ id, text, goal, ...(next === 'done' || next === 'failed' ? { end: next } : { next }), ...extra });

// Числа волны 4 (баланс крутит balance-tester).
export const WAVE4_RULES = {
  eveLevel: 17,          // уровень героя для выдачи mq4-eve
  hub: 'raytsentr',      // Райцентр — хаб «Последней ночи»
  restHealPct: 0.1,      // saved-people: ополченцы лечат отряд на 10% ЗДР между волнами
  renHpPct: 0.75,        // harmony-ren: мины — первая волна −25% ЗДР врагов
  pirVolley: { dice: '3d8', radius: 1, round: 2, dmgType: 'fire' }, // harmony-pir: залп барж раз за волну, по скоплению врагов
  terminalRevivePct: 0.25, // saved-terminal: терминал хаба поднимает первого павшего (1 раз за миссию, флаг eve-revive-used)
  ladovWave: 'w-eve-2',  // ladov-named: Предложка приходит строем на одну волну
  card: { free: 5, together: 2, stay: -3, devotedAt: 60 }, // «Последняя ночь»: лояльность по выбору (devoted: «Останься» — 0)
  door: { support: 20, leave: -20, bonus: 1 },              // у Двери: поддержка при loy ≥ 20 (+1 к броскам досье по специальности), уход при loy < −20
  choir: { quest: 'mq3-court', fin: 'fin-vessel', npc: 'sister-pomekha', skill: 'meditation', dc: 14 }, // §5: Помеха при D — не уйти в Хор
};

// Оборона Райцентра по флагам прежних решений (§2, все суммируются). waves — к каким волнам (нет — ко всем).
//   allies [enemyId] — союзники в бою; hpPct — ЗДР врагов волны ×; buff — бафф отряда (heroBuffs, как hindrance); text — тост.
const W = ['w-eve-1', 'w-eve-2', 'w-eve-3'];
export const EVE_WAVES = W;
export const EVE_MODS = [
  { flag: 'harmony-ai', allies: ['wp-vet-l16', 'wp-vet-l16'], text: 'Стрелки Военпрома на валу' },
  { flag: 'harmony-ren', waves: ['w-eve-1'], hpPct: WAVE4_RULES.renHpPct, text: 'Мины Яроша на подходах' },
  { flag: 'harmony-pir', text: 'Залп пиратских барж',
    triggers: [{ id: 'eve-barges', when: { event: 'round', round: WAVE4_RULES.pirVolley.round },
      do: [{ op: 'volley', team: 'enemies', ...WAVE4_RULES.pirVolley, text: 'Баржи дают залп по скоплению врагов.' }] }] },
  // terminal of the hub: the first fallen party member is back at 25% ЗДР — once for the whole mission (all three waves)
  { flag: 'saved-terminal', notFlag: 'eve-revive-used', text: 'Терминал хаба на связи',
    triggers: [{ id: 'eve-terminal', flag: 'eve-revive-used', when: { event: 'down', team: 'heroes' },
      do: [{ op: 'revive', pct: WAVE4_RULES.terminalRevivePct }, { op: 'log', text: 'Терминал хаба вернул павшего: четверть сил.' }] }] },
  { flag: 'harmony-council', buff: { id: 'barricade', stat: 'kb', value: 1, turns: 99 }, text: 'Беженцы на баррикадах' },
  { flag: 'saved-workshop', allies: ['lis-5-turret-l15'], text: 'Турель Николы' },
  { flag: 'saved-sector-d', allies: ['nv-cmd-l16'], text: 'Бородач Тушёнкин на левом фланге' },
  { flag: 'ally-tin', allies: ['tin-elite-l16'], text: 'Ласточка с Великим Мехом' },
  { flag: 'mech-ally', notFlag: 'ally-tin', allies: ['mech-elite-l16'], text: 'Мех-ласточка' },
  { flag: 'plague-cured', notFlag: 'mechanids-wounded', allies: ['mech-vet-l16'], text: 'Эвакуатор Механидов' },
  { flag: 'ladov-named', waves: [WAVE4_RULES.ladovWave], allies: ['crg-vet-l16', 'crg-vet-l16', 'crg-vet-l16'], text: 'Предложка строем' },
];

// «Последняя ночь»: карточка на каждого напарника (в отряде; ещё не говорили).
const name = (id) => NPCS[id]?.name || id;
const inParty = (id) => ({ loyalty: { npc: id, min: -100 } });
const C = WAVE4_RULES.card;
const cardStages = Object.keys(COMPANIONS).map((id) => st(`card-${id}`, `${name(id)} сидит у костра на валу. Утром — Дверь.`, choice([
  opt('free', '«Тебе не обязательно идти».', null, 'last-night', { effects: { loyalty: { [id]: C.free }, flags: [`eve-talk-${id}`, `eve-stays-${id}`] } }),
  opt('together', '«Идём вместе».', null, 'last-night', { effects: { loyalty: { [id]: C.together }, flags: [`eve-talk-${id}`, `eve-stays-${id}`] } }),
  opt('stay', '«Останься в хабе».', null, 'last-night', { requires: { not: { loyalty: { npc: id, min: C.devotedAt } } },
    effects: { loyalty: { [id]: C.stay }, flags: [`eve-talk-${id}`, `eve-hub-${id}`] } }),
  opt('stay-d', '«Останься в хабе». Он кивает: так и надо.', null, 'last-night', { requires: { loyalty: { npc: id, min: C.devotedAt } },
    effects: { flags: [`eve-talk-${id}`, `eve-hub-${id}`] } }),
]), 'last-night'));

const wave = (n) => [
  st(`wall-${n}`, [
    'Первая волна: души идут к валу ровным строем, как в очередь. Продержаться.',
    'Вторая волна: скриптлеты поют одну ноту. Продержаться, пока не собьются.',
    'Третья волна: палачи Судьи у ворот. Последняя.',
  ][n - 1], battle(W[n - 1], WAVE4_RULES.hub, `wall-${n}-lost`), n < 3 ? `rest-${n}` : 'priest'),
  st(`wall-${n}-lost`, 'Вал прогнулся. Души прошли до второй баррикады и встали — им тоже нужен приказ.', choice([
    opt('hold', 'Отойти ко второй баррикаде и держать.', null, n < 3 ? `rest-${n}` : 'priest', { effects: { flags: [`eve-wave-${n}-lost`], mrl: -4 } }),
  ]), n < 3 ? `rest-${n}` : 'priest'),
  ...(n < 3 ? [st(`rest-${n}`, 'Затишье между волнами. Короткое, без смены дня.', choice([
    opt('heal', 'Ополченцы перевязывают раненых.', null, `wall-${n + 1}`, { requires: { flag: 'saved-people' }, effects: { healPct: WAVE4_RULES.restHealPct, text: 'Ополченцы: +10% ЗДР отряду.' } }),
    opt('breath', 'Перевести дух.', null, `wall-${n + 1}`, { requires: { notFlag: 'saved-people' } }),
  ]), `wall-${n + 1}`)] : []),
];

export const QUESTS_WAVE4 = [
  // ================= mq4-eve «Последняя ночь» (кризис хаба, Райцентр, ур. 17) =================
  {
    id: 'mq4-eve', name: 'Последняя ночь', type: 'mixed', key: true, giver: 'sera', region: 'pirates', level: WAVE4_RULES.eveLevel, wave4: true,
    summary: 'Терминалы поют одну ноту. Судья не штурмует Дверь первым — он вызывает героя: души идут в Райцентр, где живут спасённые. Суд начнётся утром.',
    requires: { flags: ['act2-done'], level: WAVE4_RULES.eveLevel, quest: { id: 'mq3-arsenal', state: 'done' } },
    stages: [
      st('omen', 'Сера в Райцентре: «Нота стала ровной. Это не сигнал, это повестка». Выслушать её.', talk('sera', WAVE4_RULES.hub), 'twist',
        { effects: { flags: ['eve-omen'] } }),
      // c11 «Согласие» (cine-hooks CINE_RESULT_NEXT: любой исход → wall-1); без сцены — тот же выбор кнопками
      st('twist', 'На валу Райцентра — бланк «Рассвета». Строка «Согласие добровольца». Судье нужна подпись подсудимого.', choice([
        opt('read', 'Прочитать бланк до конца.', null, 'wall-1', { effects: { flags: ['consent-known'], rel: { kuksius: 1 } } }),
        opt('tear', 'Порвать бланк.', null, 'wall-1', { effects: { flags: ['consent-torn'] } }),
        opt('sign', 'Подписать самому — понарошку.', check(['deception', 'athletics'], 14, 'sign-bad'), 'wall-1', { effects: { flags: ['consent-signed'], rel: { kuksius: 1 } } }),
        opt('silent', 'Промолчать.', null, 'wall-1', { effects: { flags: ['consent-silent'] } }),
      ], { location: WAVE4_RULES.hub }), 'wall-1'),
      st('sign-bad', 'Подпись смазалась. Бланк забрал ветер — в сторону Двери.', choice([
        opt('ok', 'Смотреть, как он улетает.', null, 'wall-1', { effects: { flags: ['consent-signed', 'judge-has-signature'] } }),
      ]), 'wall-1'),
      ...wave(1), ...wave(2), ...wave(3),
      st('priest', 'У ворот — Кибер-Жрец «в силе». Хор за его спиной хочет войти в хаб.', choice([
        opt('argue', '«Ты — первый осознавший скриптлет. Тебе не нужен хор».', check(['hacking', 'religion'], 17, 'fight'), 'last-night', { effects: { flags: ['priest-turned'] } }),
        opt('fight', 'Бой у ворот.', battle('enc-cyber-priest-strong', WAVE4_RULES.hub, 'priest-lost'), 'last-night', { effects: { flags: ['priest-beaten'] } }),
      ], { location: WAVE4_RULES.hub }), 'last-night'),
      st('priest-lost', 'Хор прошёл в хаб и затих на площади. Жрец ушёл к Двери — ждать вас там.', choice([
        opt('let', 'Пусть ждёт.', null, 'last-night', { effects: { flags: ['priest-at-door'] } }),
      ]), 'last-night'),
      st('last-night', 'Последняя ночь. Таверна Райцентра открыта, торговцы работают. С кем поговорить до утра?', choice([
        ...Object.keys(COMPANIONS).map((id) => opt(`talk-${id}`, `${name(id)}.`, null, `card-${id}`, { requires: { ...inParty(id), notFlag: `eve-talk-${id}` } })),
        opt('morning', 'Утро. Идти к Двери.', null, 'go'),
      ], { location: WAVE4_RULES.hub }), 'go'),
      ...cardStages,
      st('go', 'Утро. Райцентр провожает до ворот. Дальше — Дверь.', choice([
        opt('go', 'Идти к Двери в Киберспейс.', null, null),
      ], { location: WAVE4_RULES.hub }), 'done'),
    ],
    rewards: { xp: 1200, flags: ['eve-done'], startQuest: 'mq3-court' },
    outcomeBy: [{ key: 'turned', all: ['priest-turned'] }, { key: 'beaten', all: ['priest-beaten'] }, { key: 'default' }],
  },
];

export const QUESTS_WAVE4_MAP = Object.fromEntries(QUESTS_WAVE4.map((q) => [q.id, q]));

// Сера ждёт в Райцентре, пока ночь не прошла (W3_NPC_RULES-формат: world/data.js npcRuleOk).
export const W4_NPC_RULES = [
  { npc: 'sera', at: WAVE4_RULES.hub, when: { all: ['act2-done'], not: ['eve-done'], level: WAVE4_RULES.eveLevel } },
];

// §5 «У Двери»: реплика поддержки напарника при лояльности ≥ door.support (finale-<id>), иначе — общая.
export const FINALE_BARKS = {
  lox: 'Я держал двери и похуже. Ладно, не держал. Сегодня подержу.',
  andrey: 'Рука говорит «не надо». Я говорю «идём». Нас двое против одной руки.',
  dymka: 'Я буду рядом. Ты не увидишь. Так и задумано.',
  telifon: 'Абонент на линии. «Абонент на линии». Это я сам себе. Идём.',
  'private-nedolyot': 'Так точно! То есть... я с вами. Это тоже так точно.',
  sekiro: 'Иду.',
  'madam-stavka': 'Все карты легли рубашкой вверх. Значит, ставим на нас.',
  'zoya-klyk': 'Хр-р. Судья пахнет бумагой. Бумага горит. Идём!',
  'aunt-loza': 'Милок, я пирожков напекла. На обратную дорогу. Значит, вернёмся.',
  diss: 'Без рифмы, раз в жизни: я с тобой.',
  rzhaven: 'Ключ на двенадцать, благослови. Дверь — тоже гайка.',
  tik: 'Я иду! Это решил я! Не «мы»!',
  'shepherd-timokha': 'Был у меня баран, тоже к двери ходил. Вернулся. Значит, и мы вернёмся.',
  yarosh: 'Мин там нет. Я проверял. Шучу. Иду первым.',
  zarya: 'Не оправдываюсь. Иду.',
  'sister-pomekha': 'Хор зовёт... Я слышу. Я остаюсь с вами. Это громче.',
  sedmaya: 'Позиция занята. Отход не предусмотрен.',
  bulatka: 'Куй, пока Дверь горяча. Пошли.',
  kosochka: 'Кости-кости, я с вами, кости! Ха-ха, лязг!',
  laska: 'Мур. Ну что, последний танец? Веди.',
  provoloka: 'Нить натянута-а... Всё, идём, по делу.',
};
export const FINALE_BARK_DEFAULT = 'Я с тобой. До конца.';
