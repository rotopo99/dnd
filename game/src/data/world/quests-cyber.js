// Квесты Киберспейса v2 (docs/specs/cyberspace-v2.md). Схема и хелперы — как world/quests-v3.js.
// location 'cs-*' — id зон из world/cyberspace.js (CS_ZONES). Реальные локации — slug из canon-map.js.
// Канон: смерть = душа в Киберспейсе; тело уничтожено = дух; Виктор мёртв (история Куксиуса) — здесь только эхо, не воскрешение.
// Флаги `cs-soul:*`, `cs-victor-*`, `bodyDestroyed` — см. CS_QUEST_HOOKS и SPIRIT.return. Бои — временные 'enc-cs-*' (CS_ENC_TODO).

const reach = (location) => ({ kind: 'reach', location });
const talk = (npc, location) => ({ kind: 'talk', npc, location });
const fight = (encounter, location) => ({ kind: 'battle', encounter, location });
const check = (skills, dc, onFail) => ({ kind: 'check', skills, dc, ...(onFail ? { onFail } : {}) });
const pay = (credits) => ({ kind: 'pay', credits });
const choice = (...options) => ({ kind: 'choice', options });
const opt = (id, text, goal, effects, next, requires) => ({ id, text, ...(goal ? { goal } : {}), ...(effects ? { effects } : {}), next: next ?? null, ...(requires ? { requires } : {}) });
const st = (id, text, goal, next) => ({ id, text, goal, ...(next === 'done' ? { end: 'done' } : { next }) });
const Q = (id, name, type, region, giver, level, summary, stages, rewards, extra = {}) =>
  ({ id, name, type, key: false, giver, region, level, requires: null, summary, stages, rewards, v3: true, cyber: true, ...extra });

/** Новые NPC для этих квестов (программист заводит в npcs.js через v3(); пока — описание). */
export const NPCS_CYBER_NEW = {
  'cs-nameless': { name: 'Безымянный силуэт', faction: 'cult', race: 'cyber-spirit', location: 'cs-void',
    desc: 'Стёртый дух-посредник в Пустоши. Имя у него удалили вместе с телом, поэтому представляется «Эй, вы». Тихий, виноватый, держит протез «Никола» как чужого ребёнка.' },
  'cs-victor-echo': { name: 'Эхо Виктора', faction: 'none', race: 'cyber-spirit', location: 'cs-gate',
    desc: 'Не Виктор, а его отпечаток: голубая метка «К.», копия манеры, обрывки фраз. Забивной, громкий, путается в том, кто он. Знает это и шутит, чтобы не думать.' },
};

const LIST = [
  // ============================================================ НОВОЕ ТЕЛО
  Q('sq-new-body', 'Новое тело, б/у', 'mixed', 'technikums', 'nikola', 12,
    'Тело уничтожено, остался дух. Никола делает протез, но его нужно «примерить» в Пустоши удалённых.',
    [
      st('void', 'Войти в Пустошь удалённых — туда попадают те, кого стёрли без остатка.', reach('cs-void'), 'guard'),
      st('guard', 'Нуль-ходоки охраняют стёртые комнаты. Пройти или пробиться.', choice(
        opt('sneak', 'Идти тихо: стёртым легко притвориться.', check(['stealth', 'meditation'], 15, 'brawl')),
        opt('brawl', 'Пробиться с боем.', fight('enc-cs-null-walkers', 'cs-void')),
      ), 'silhouette'),
      st('silhouette', 'Силуэт с биркой «Никола» держит протез.', talk('cs-nameless', 'cs-void'), 'price'),
      st('price', 'Протез сам себя не оплатит. Чем платить?', choice(
        opt('credits', '400 кредитов, 2 серво-детали, осколок памяти (Никола доплатит скидкой).', pay(400), { items: [{ item: 'soul-shard', n: -1 }] }),
        opt('memory', 'Отдать воспоминание вместо денег: «Первое утро после взрыва».', check(['meditation', 'religion'], 15, 'credits'), { flags: ['memory-sold'] }),
      ), 'fit'),
      st('fit', 'Вернуться к Николе. Он не спросит, что ты видел. Он спросит, как сидит.', talk('nikola', 'alpha-harmony'), 'choose'),
      st('choose', 'Тело готово. Дух может войти в него — или остаться самим собой.', choice(
        opt('body', 'Надеть тело (50% ЗДР/МРЛ). Дух больше не шепчется в проводах.', null, { flags: ['body-restored'] }, 'done-body'),
        opt('spirit', 'Остаться духом. Протез — на полку, «на потом».', null, { flags: ['cs-stay-spirit'] }, 'done-spirit'),
      ), null),
      st('done-body', 'Первый вдох. Пахнет канифолью и стыдом.', talk('nikola', 'alpha-harmony'), 'done'),
      st('done-spirit', 'Никола вешает протез на гвоздь и подписывает: «Ждёт».', talk('nikola', 'alpha-harmony'), 'done'),
    ],
    { xp: 900, rep: { technikums: 10 }, flags: ['cs-void-seen'] },
    { requires: { flag: 'bodyDestroyed' }, clearFlag: 'bodyDestroyed', clearOn: 'body' }),

  // ============================================================ ЭХО ВИКТОРА
  Q('sq-cs-victor', 'Эхо у ворот', 'mixed', 'warprom', 'kr-gilza', 4,
    'Виктор мёртв, это канон. Но у Привратной кто-то голубой машет из очереди и просит передать привет Куксиусу.',
    [
      st('grave', 'Гильза у могилы: «Тут стоит камень, а в Сети, говорят, стоит он сам. Проверь».', talk('kr-gilza', 'kreml'), 'gate'),
      st('gate', 'Дойти до Привратной и найти голубую метку «К.».', reach('cs-gate'), 'echo'),
      st('echo', 'Эхо Виктора: громкое, дырявое, очень похожее.', talk('cs-victor-echo', 'cs-gate'), 'queue'),
      st('queue', 'Скриптлеты растаскивают его по кускам: «лишний дух без талона». Спасти эхо.', choice(
        opt('bluff', 'Объяснить скриптлетам, что у эха есть талон. Он даже настоящий.', check(['deception', 'persuasion'], 12, 'scuffle')),
        opt('scuffle', 'Разогнать скриптлетов.', fight('enc-cs-scriptlets', 'cs-gate')),
      ), 'fate'),
      st('fate', 'Эхо знает, кто оно. Решать — тебе: оно просит остаться или отпустить.', choice(
        opt('ally', 'Взять в союзники: пусть держит ворота (дух-Виктор в боях Сети).', null, { flags: ['cs-victor-freed', 'cs-victor-ally'], deeds: ['loyalty'] }, 'done-ally'),
        opt('rest', 'Отпустить: стереть метку и сказать Куксиусу, что «не болит».', null, { flags: ['cs-victor-freed', 'victor-soul-freed'], deeds: ['mercy'] }, 'done-rest'),
      ), null),
      st('done-ally', 'Эхо салютует кулаком, которого нет.', talk('kr-gilza', 'kreml'), 'done'),
      st('done-rest', 'Метка гаснет. Где-то громко чихает пустота.', talk('kr-gilza', 'kreml'), 'done'),
    ],
    { xp: 450, rep: { warprom: 10 }, flags: ['cs-victor-met'] }),

  // ============================================================ ГОЛОСА ДУШ
  Q('sq-cs-voices', 'Голоса душ', 'mixed', 'technikums', 'sera', 8,
    'В Сети застряли души: на рынке их продают, в хоре они поют без голоса. Сера просит вернуть минимум двух на терминал.',
    [
      st('brief', 'Сера даёт список имён. Пустых строк в нём больше, чем имён.', talk('sera', 'alpha-harmony'), 'market'),
      st('market', 'Рынок душ: лот с знакомым голосом. Выкупить или украсть.', choice(
        opt('buy', 'Выкупить: 3 осколка памяти.', { kind: 'item', item: 'soul-shard', n: 3 }, { flags: ['cs-soul:auction'], items: [{ item: 'soul-shard', n: -3 }] }),
        opt('steal', 'Украсть лот: Брокер не заметит, если не смотреть.', check(['stealth', 'hacking'], 15, 'buy'), { flags: ['cs-soul:auction'] }),
        opt('brawl', 'Устроить скандал: демон-пиявка будет против.', fight('enc-cs-leech', 'cs-market'), { flags: ['cs-soul:auction'] }),
      ), 'choir'),
      st('choir', 'Хор поглощённых: один голос запнулся. Он знакомый. Что делать с остальными?', choice(
        opt('pull', 'Вытащить голос: хор замолчит, Судья заметит.', check(['religion', 'persuasion'], 15, 'quiet'), { flags: ['cs-soul:choir'] }),
        opt('quiet', 'Дождаться паузы и вывести тихо, пока хор поёт.', check(['stealth', 'meditation'], 14, 'pull'), { flags: ['cs-soul:choir', 'cs-choir-quiet'] }),
      ), 'return'),
      st('return', 'Вернуть души на терминал: Сера принимает на связи. Они говорят одновременно.', talk('sera', 'alpha-harmony'), 'done'),
    ],
    { xp: 700, rep: { technikums: 10 }, flags: ['cs-voices-done', 'cs-choir-heard'] }),
];

export const QUESTS_CYBER = Object.fromEntries(LIST.map((q) => [q.id, q]));

/** Временные id боёв — заменить на ENCOUNTERS. */
export const CS_ENC_TODO = {
  'enc-cs-null-walkers': 'нуль-ходоки (cs-null-walker x2), scale hero (ур. 12)',
  'enc-cs-scriptlets': 'скриптлеты у Привратной (scriptlet x2–3), scale hero (ур. 4)',
  'enc-cs-leech': 'демон-пиявка + 2 скриптлета, scale hero (ур. 8)',
};
