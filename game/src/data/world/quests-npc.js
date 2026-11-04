// Короткие квесты NPC v4 (около трети новых NPC). Схема — world/quests.js. giver — id из npcs.js (LIST_V4).
// Бои — только существующие id из ENCOUNTERS / ENCOUNTERS_V3. Навыки: тут разные (hacking, medicine, biology, survival, religion,
// military, tech, deception, intimidation, perception, stealth, athletics, analysis, meditation, proxy, persuasion) — мирный путь везде рабочий.
// region — id региона/фракции узла (как region в locations.js).
// Награды: малые 100–200 xp, средние 200–300 (world.md, п. 7).

const talk = (npc, location) => ({ kind: 'talk', npc, location });
const check = (skills, dc, onFail, extra = {}) => ({ kind: 'check', skills, dc, ...(onFail ? { onFail } : {}), ...extra });
const battle = (encounter, location) => ({ kind: 'battle', encounter, location });
const reach = (location) => ({ kind: 'reach', location });
const choice = (options) => ({ kind: 'choice', options });
// Этап: next === 'done' | 'failed' → конец квеста, иначе id следующего этапа.
const st = (id, text, goal, next) => ({ id, text, goal, ...(next === 'done' || next === 'failed' ? { end: next } : { next }) });
const quest = (id, name, type, giver, region, level, summary, stages, rewards, extra = {}) =>
  ({ id, name, type, key: false, giver, region, level, requires: null, summary, stages, rewards, ...extra });

const LIST = [
  // ==================================================================== АИ Партия
  quest('q-talon', 'Талон на самого себя', 'talk', 'pl-talon', 'aiParty', 2,
    'Контролёр Талон потерял карточку учёта и юридически перестал существовать. Вернуть ему бумажную жизнь.',
    [
      st('ask', 'Талон мнёт воротник: без карточки его не пустят даже в собственную очередь.', talk('pl-talon', 'putinlyandiya'), 'restore'),
      st('restore', 'Восстановить запись в реестре.', choice([
        { id: 'hack', text: 'Вписать его в реестр через терминал.', goal: check(['hacking'], 14, 'bribe'), next: 'back' },
        { id: 'bluff', text: 'Убедить клерка, что Талон — это опечатка в самом клерке.', goal: check(['deception', 'persuasion'], 13, 'bribe'), next: 'back' },
        { id: 'bribe', text: 'Заплатить за «срочное рассмотрение».', goal: { kind: 'pay', credits: 40 }, effects: { deeds: ['greed'] }, next: 'back' },
      ]), 'back'),
      st('back', 'Вернуть Талону карточку.', talk('pl-talon', 'putinlyandiya'), 'done'),
    ],
    { xp: 150, credits: 40, rep: { aiParty: 5 }, deeds: ['help-weak'] }),

  quest('q-pauza', 'Тихий час', 'mixed', 'pl-pauza', 'aiParty', 2,
    'Дети в саду Паузы видят призраков отцов и разговаривают с ними. Пауза боится, что учёт найдёт и детей, и призраков.',
    [
      st('ask', 'Пауза просит разобраться, пока не пришла проверка.', talk('pl-pauza', 'putinlyandiya'), 'listen'),
      st('listen', 'Понять, кто именно приходит к детям.', check(['perception', 'analysis', 'religion'], 12, 'ghost'), 'ghost'),
      st('ghost', 'Призрак отца ждёт у забора.', choice([
        { id: 'talk', text: 'Поговорить: он просто хочет попрощаться.', goal: check(['persuasion', 'religion', 'medicine'], 13, 'fight'), effects: { deeds: ['mercy'] }, next: 'back' },
        { id: 'fight', text: 'Прогнать силой.', goal: battle('w-cc-dead', 'putinlyandiya'), effects: { deeds: ['cruelty'] }, next: 'back' },
      ]), 'back'),
      st('back', 'Сообщить Паузе.', talk('pl-pauza', 'putinlyandiya'), 'done'),
    ],
    { xp: 180, credits: 30, rep: { aiParty: 3 } }),

  // ==================================================================== Военпром
  quest('q-vedomost', 'Двенадцать вычеркнутых', 'mixed', 'kr-vedomost', 'warprom', 3,
    'Писарь Ведомость просит вычеркнуть двенадцать фамилий из списка утилизации до утренней сверки.',
    [
      st('ask', 'Ведомость показывает список — фамилии без вины.', talk('kr-vedomost', 'kreml'), 'archive'),
      st('archive', 'Добраться до оригинала списка в канцелярии.', choice([
        { id: 'hack', text: 'Подправить файл через терминал.', goal: check(['hacking'], 15, 'caught'), next: 'back' },
        { id: 'sneak', text: 'Подменить бумагу в архиве.', goal: check(['stealth'], 14, 'caught'), next: 'back' },
        { id: 'bluff', text: 'Сыграть проверяющего.', goal: check(['deception', 'military'], 14, 'caught'), next: 'back' },
      ]), 'back'),
      st('caught', 'Заметили. Патруль на выходе.', battle('v3-wp-patrol', 'kreml'), 'back'),
      st('back', 'Передать Ведомости, что дело сделано.', talk('kr-vedomost', 'kreml'), 'done'),
    ],
    { xp: 250, rep: { warprom: -5 }, deeds: ['help-weak', 'free-slaves'] }),

  // ==================================================================== Пираты
  quest('q-tuz', 'Меченая колода', 'mixed', 'rc-tuz', 'pirates', 2,
    'Туза обыграли шулерской колодой. Узнать, кто подсунул карты, и вернуть ему репутацию — желательно без трупов.',
    [
      st('ask', 'Туз сдаёт колоду: все карты немного кривые.', talk('rc-tuz', 'raytsentr'), 'find'),
      st('find', 'Вычислить подменившего.', choice([
        { id: 'watch', text: 'Сыграть и понаблюдать за руками.', goal: check(['perception', 'analysis'], 13, 'brawl'), next: 'back' },
        { id: 'cheat', text: 'Обыграть шулера его же методом.', goal: check(['deception'], 14, 'brawl'), next: 'back' },
        { id: 'scare', text: 'Припугнуть крупье.', goal: check(['intimidation'], 13, 'brawl'), next: 'back' },
      ]), 'back'),
      st('brawl', 'Шулер зовёт друзей.', battle('v3-pir-dock', 'raytsentr'), 'back'),
      st('back', 'Вернуться к Тузу.', talk('rc-tuz', 'raytsentr'), 'done'),
    ],
    { xp: 160, credits: 120, rep: { pirates: 5 } }),

  quest('q-yod', 'Ржавая лихорадка', 'mixed', 'rc-yod', 'pirates', 2,
    'Команда флагмана слегла: кожа в красных пятнах, суставы скрипят. Йоду нужен диагноз и две аптечки.',
    [
      st('ask', 'Йод разводит руками: «Я лечу, но не понимаю чем».', talk('rc-yod', 'raytsentr'), 'diagnose'),
      st('diagnose', 'Поставить диагноз.', check(['medicine', 'biology'], 13, 'quarantine'), 'treat'),
      st('quarantine', 'Больные в панике. Нужно вывести их из каюты без драки.', check(['persuasion', 'intimidation'], 12), 'treat'),
      st('treat', 'Принести лекарства.', { kind: 'item', item: 'medkit', n: 2 }, 'back'),
      st('back', 'Передать Йоду.', talk('rc-yod', 'raytsentr'), 'done'),
    ],
    { xp: 160, credits: 50, rep: { pirates: 5 }, deeds: ['help-weak'] }),

  quest('q-dub', 'Дубовая гарантия', 'talk', 'rc-dub', 'pirates', 1,
    'Отец Дуб просит доказать, что его амулеты работают. Или хотя бы что они не вредят.',
    [
      st('ask', 'Дуб гордо кладёт амулет на ладонь.', talk('rc-dub', 'raytsentr'), 'test'),
      st('test', 'Проверить.', choice([
        { id: 'pray', text: 'Осмотреть по канону: чистая ли древесина.', goal: check(['religion', 'analysis'], 12), effects: { deeds: ['honor'] }, next: 'back' },
        { id: 'sell', text: 'Заверить, что работает. Он заплатит за тишину.', goal: check(['deception', 'persuasion'], 12), effects: { deeds: ['lie', 'greed'], credits: 40 }, next: 'back' },
      ]), 'back'),
      st('back', 'Сообщить результат.', talk('rc-dub', 'raytsentr'), 'done'),
    ],
    { xp: 120, credits: 30 }),

  // ==================================================================== Жестяное братство
  quest('q-zaklepka', 'Гайка с ноги Меха', 'mixed', 'zh-zaklepka', 'tinBrotherhood', 2,
    'Вдова просит достать с ноги Великого Меха гайку мужа. Мех не любит, когда на него лезут.',
    [
      st('ask', 'Заклёпка указывает на ногу гиганта.', talk('zh-zaklepka', 'zhestoboy'), 'go'),
      st('go', 'Дойти до Меха.', reach('velikiy-mekh'), 'climb'),
      st('climb', 'Достать гайку.', choice([
        { id: 'climb', text: 'Залезть по ржавым скобам.', goal: check(['athletics'], 14, 'watch'), next: 'back' },
        { id: 'wait', text: 'Дождаться, пока Мех переставит ногу.', goal: check(['survival', 'perception'], 13, 'watch'), next: 'back' },
      ]), 'back'),
      st('watch', 'Мех шевельнулся. Дозорный оттаскивает тебя и ворчит.', check(['persuasion', 'endurance'], 11), 'back'),
      st('back', 'Вернуть гайку вдове.', talk('zh-zaklepka', 'zhestoboy'), 'done'),
    ],
    { xp: 170, rep: { tinBrotherhood: 8 }, deeds: ['mercy'] }),

  quest('q-vesomy', 'Честь клинка', 'talk', 'sl-vesomy', 'tinBrotherhood', 2,
    'Два кузнеца спорят, чей клинок честнее. Вынести приговор до заката.',
    [
      st('ask', 'Весомый приглашает быть заседателем.', talk('sl-vesomy', 'slavotech'), 'hear'),
      st('hear', 'Выслушать обоих и осмотреть клинки.', check(['analysis', 'perception'], 13), 'verdict'),
      st('verdict', 'Вынести решение.', choice([
        { id: 'honor', text: 'Решить по кодексу.', goal: check(['military', 'persuasion'], 13), effects: { deeds: ['honor'], rep: { tinBrotherhood: 6 } }, next: 'back' },
        { id: 'duel', text: 'Предложить дуэль на тренировочных клинках.', goal: battle('v3-tin-trial', 'slavotech'), effects: { deeds: ['honor'] }, next: 'back' },
      ]), 'back'),
      st('back', 'Передать приговор Весомому.', talk('sl-vesomy', 'slavotech'), 'done'),
    ],
    { xp: 160, rep: { tinBrotherhood: 4 } }),

  quest('q-mayatnik', 'Четыре циферблата', 'search', 'nc-mayatnik', 'tinBrotherhood', 2,
    'Часы на башне показывают разное время; стража сменяется вразнобой. Выяснить, поломка это или чей-то умысел.',
    [
      st('ask', 'Маятник тикает шёпотом: «Что-то не так со временем».', talk('nc-mayatnik', 'noch'), 'inspect'),
      st('inspect', 'Осмотреть механизм.', check(['tech', 'analysis'], 13), 'truth'),
      st('truth', 'Разгадка: циферблаты разведены нарочно, по приказу совета. Что делать?', choice([
        { id: 'keep', text: 'Оставить как есть: так дронам труднее.', effects: { deeds: ['honor'] }, next: 'back' },
        { id: 'fix', text: 'Синхронизировать и предупредить совет.', goal: check(['tech', 'persuasion'], 14), effects: { deeds: ['help-weak'] }, next: 'back' },
      ]), 'back'),
      st('back', 'Рассказать Маятнику.', talk('nc-mayatnik', 'noch'), 'done'),
    ],
    { xp: 150, credits: 40, rep: { tinBrotherhood: 5 } }),

  quest('q-bambuk', 'Красивый проигрыш', 'combat', 'dd-bambuk', 'tinBrotherhood', 2,
    'Бамбук просит стать соперником на испытании: она никогда не проигрывала и не знает, как себя вести.',
    [
      st('ask', 'Бамбук кланяется: «Проиграйте мне достойно. Или выиграйте достойнее».', talk('dd-bambuk', 'dodze'), 'duel'),
      st('duel', 'Выбрать способ испытания.', choice([
        { id: 'fight', text: 'Выйти на круг.', goal: battle('v3-tin-trial', 'dodze'), effects: { rep: { tinBrotherhood: 5 } }, next: 'back' },
        { id: 'breath', text: 'Предложить состязание в дыхании и тишине.', goal: check(['meditation', 'endurance'], 13), effects: { deeds: ['honor'] }, next: 'back' },
      ]), 'back'),
      st('back', 'Поклониться Бамбук.', talk('dd-bambuk', 'dodze'), 'done'),
    ],
    { xp: 170, rep: { tinBrotherhood: 3 } }),

  // ==================================================================== Механиды
  quest('q-zanoza', 'Узел без согласия', 'mixed', 'bt-zanoza', 'mechanids', 3,
    'Узел Заноза начал думать отдельно. Коллектив требует вернуть его в сеть, сам он просит оставить в покое.',
    [
      st('ask', 'Заноза шепчет «я» и вздрагивает.', talk('bt-zanoza', 'betonka'), 'choose'),
      st('choose', 'Решить его судьбу.', choice([
        { id: 'free', text: 'Помочь отключиться от сети.', goal: check(['hacking', 'tech'], 15, 'fight'), effects: { deeds: ['mercy'], rep: { mechanids: -5 } }, next: 'back' },
        { id: 'talk', text: 'Уговорить коллектив отпустить его.', goal: check(['persuasion', 'analysis'], 14, 'fight'), effects: { deeds: ['mercy'] }, next: 'back' },
        { id: 'return', text: 'Вернуть в сеть.', effects: { deeds: ['cruelty'], rep: { mechanids: 8 } }, next: 'back' },
      ]), 'back'),
      st('fight', 'Узлы окружают: коллектив против.', battle('v3-mech-shop', 'betonka'), 'back'),
      st('back', 'Доложить Занозе.', talk('bt-zanoza', 'betonka'), 'done'),
    ],
    { xp: 260, credits: 40 }),

  // ==================================================================== Мусорщики
  quest('q-shurup', 'Бочка с секретом', 'mixed', 'sv-shurup', 'scavengers', 2,
    'Шуруп прячется в бочке на Свалке. Вывести скелета к воротам под носом у охотников.',
    [
      st('ask', 'Бочка шепчет: «Прости, мне нужна помощь».', talk('sv-shurup', 'svalka'), 'slip'),
      st('slip', 'Провести мимо охотников.', choice([
        { id: 'sneak', text: 'Прокатить бочку незаметно.', goal: check(['stealth'], 14, 'hunt', { group: true }), next: 'back' },
        { id: 'bluff', text: 'Выдать за «груз Короля».', goal: check(['deception', 'intimidation'], 14, 'hunt'), next: 'back' },
      ]), 'back'),
      st('hunt', 'Охотники учуяли железо.', battle('v3-scv-skeleton-hunt', 'svalka'), 'back'),
      st('back', 'Дойти до ворот и попрощаться.', talk('sv-shurup', 'svalka'), 'done'),
    ],
    { xp: 180, rep: { scavengers: -3 }, deeds: ['help-weak'] }),

  quest('q-pomoyka', 'Что в котле', 'search', 'sv-pomoyka', 'scavengers', 1,
    'Полстоловой лежит с резью в животе. Найти, что попало в котёл, и кто туда это положил.',
    [
      st('ask', 'Помойка мнёт колпак: «Я не виноват. Наверное».', talk('sv-pomoyka', 'svalka'), 'sample'),
      st('sample', 'Определить причину.', choice([
        { id: 'bio', text: 'Осмотреть котёл и опознать яд.', goal: check(['biology', 'medicine'], 12), next: 'culprit' },
        { id: 'survive', text: 'Проследить, откуда привозят продукты.', goal: check(['survival', 'perception'], 12), next: 'culprit' },
      ]), 'culprit'),
      st('culprit', 'Виновник найден. Как поступить?', choice([
        { id: 'scare', text: 'Припугнуть и заставить признаться.', goal: check(['intimidation'], 12), effects: { deeds: ['cruelty'] }, next: 'back' },
        { id: 'quiet', text: 'Решить мирно: пусть возместит.', goal: check(['persuasion'], 12), effects: { deeds: ['mercy'] }, next: 'back' },
      ]), 'back'),
      st('back', 'Вернуться к Помойке.', talk('sv-pomoyka', 'svalka'), 'done'),
    ],
    { xp: 120, credits: 30 }),

  // ==================================================================== Техоньки
  quest('q-tumbler', 'Рубильник отвечает', 'mixed', 'zv-tumbler', 'tekhonki', 2,
    'В Часовне рубильников один щёлкает сам. Тумблер боится, что это ответ — на вопрос, который он однажды задал.',
    [
      st('ask', 'Тумблер показывает рубильник: тот щёлкает прямо сейчас.', talk('zv-tumbler', 'zavod'), 'inspect'),
      st('inspect', 'Выяснить, что внутри.', choice([
        { id: 'tech', text: 'Разобрать рубильник.', goal: check(['tech'], 13, 'shrine'), next: 'back' },
        { id: 'proxy', text: 'Прислушаться к прокси-эху.', goal: check(['proxy', 'religion'], 13, 'shrine'), next: 'back' },
      ]), 'back'),
      st('shrine', 'Святилище откликается — и не добром.', battle('v3-tek-shrine', 'zavod'), 'back'),
      st('back', 'Сообщить Тумблеру.', talk('zv-tumbler', 'zavod'), 'done'),
    ],
    { xp: 170, rep: { tekhonki: 5 }, deeds: ['tech-faith'] }),

  quest('q-gul', 'Три мачты', 'search', 'zv-gul', 'tekhonki', 3,
    'Метеоролог Гул просит откалибровать три мачты на Гремящих холмах до того, как прокси-буря найдёт город.',
    [
      st('ask', 'Гул водит пальцем в воздухе: «Ждёт она».', talk('zv-gul', 'zavod'), 'go'),
      st('go', 'Дойти до холмов.', reach('hill-monsters-m20'), 'calibrate'),
      st('calibrate', 'Откалибровать мачты.', check(['tech', 'proxy', 'survival'], 14, 'storm'), 'back'),
      st('storm', 'Буря застала раньше срока.', battle('v3-tek-storm', 'hill-monsters-m20'), 'back'),
      st('back', 'Вернуться к Гулу.', talk('zv-gul', 'zavod'), 'done'),
    ],
    { xp: 260, credits: 50, rep: { tekhonki: 6 } }),

  quest('q-ogarok', 'Пистолет, который стреляет сам', 'mixed', 'stn-ogarok', 'tekhonki', 3,
    'Освящённый пистолет палит в пустоту и сеет панику. Найти причину и обезвредить.',
    [
      st('ask', 'Огарок держит пистолет двумя руками, сквозь рукавицу дым.', talk('stn-ogarok', 'stanok'), 'study'),
      st('study', 'Изучить ствол.', choice([
        { id: 'religion', text: 'Спросить у Старого бога напрямую.', goal: check(['religion', 'proxy'], 14, 'fight'), next: 'back' },
        { id: 'tech', text: 'Вскрыть замок и вынуть «душу».', goal: check(['tech', 'hacking'], 14, 'fight'), next: 'back' },
      ]), 'back'),
      st('fight', 'Пистолет высвободил то, что в нём сидит.', battle('v3-tek-shrine', 'stanok'), 'back'),
      st('back', 'Вернуть Огарку.', talk('stn-ogarok', 'stanok'), 'done'),
    ],
    { xp: 250, credits: 60, rep: { tekhonki: 5 } }),

  quest('q-machta', 'Накренившаяся антенна', 'mixed', 'sm-machta', 'tekhonki', 3,
    'Главная антенна Смотрельца накренилась. Помочь Мачте выпрямить её, не уронив город в тишину.',
    [
      st('ask', 'Мачта кивает вверх: «Вон она, красавица».', talk('sm-machta', 'smotreltse'), 'climb'),
      st('climb', 'Подняться и закрепить.', choice([
        { id: 'athletics', text: 'Залезть и подпереть руками.', goal: check(['athletics'], 14, 'storm'), next: 'back' },
        { id: 'tech', text: 'Выправить растяжками снизу.', goal: check(['tech'], 14, 'storm'), next: 'back' },
      ]), 'back'),
      st('storm', 'Старый бог «помогает» и поднимает бурю.', battle('v3-tek-storm', 'smotreltse'), 'back'),
      st('back', 'Рассказать Мачте.', talk('sm-machta', 'smotreltse'), 'done'),
    ],
    { xp: 250, rep: { tekhonki: 5 } }),

  // ==================================================================== Агрозона
  quest('q-kapelnitsa', 'Башня номер семь', 'search', 'gp-kapelnitsa', 'agrozone', 2,
    'В башне №7 болеют и люди, и урожай. Найти источник до инспекции.',
    [
      st('ask', 'Капельница показывает пожелтевшие листья.', talk('gp-kapelnitsa', 'gidroponika'), 'investigate'),
      st('investigate', 'Найти источник.', choice([
        { id: 'med', text: 'Взять пробы у больных.', goal: check(['medicine', 'biology'], 13), next: 'decide' },
        { id: 'hack', text: 'Вскрыть журнал лаборатории.', goal: check(['hacking'], 14), next: 'decide' },
      ]), 'decide'),
      st('decide', 'Это утечка Химеры. Что делать?', choice([
        { id: 'quiet', text: 'Скрыть от надзирателей и тихо вылечить.', goal: check(['medicine', 'deception'], 14), effects: { deeds: ['help-weak', 'lie'] }, next: 'back' },
        { id: 'report', text: 'Доложить Норме.', effects: { deeds: ['serve-ai'], rep: { agrozone: 8 } }, next: 'back' },
      ]), 'back'),
      st('back', 'Вернуться к Капельнице.', talk('gp-kapelnitsa', 'gidroponika'), 'done'),
    ],
    { xp: 180, credits: 40 }),

  quest('q-shepot', 'Номер без чипа', 'mixed', 'gp-shepot', 'agrozone', 3,
    'Шёпот просит снять ID-чип одному из рабов, пока того не нашли по сигналу.',
    [
      st('ask', 'Шёпот называет номер: 5812.', talk('gp-shepot', 'gidroponika'), 'remove'),
      st('remove', 'Снять чип.', choice([
        { id: 'hack', text: 'Заглушить сигнал и вскрыть.', goal: check(['hacking'], 15, 'fight'), next: 'back' },
        { id: 'surgery', text: 'Вырезать, как хирург.', goal: check(['medicine'], 15, 'fight'), next: 'back' },
        { id: 'bluff', text: 'Подделать пропуск на вынос.', goal: check(['deception'], 14, 'fight'), next: 'back' },
      ]), 'back'),
      st('fight', 'Надзиратели заметили шум.', battle('v3-agro-field', 'gidroponika'), 'back'),
      st('back', 'Вернуться к Шёпоту.', talk('gp-shepot', 'gidroponika'), 'done'),
    ],
    { xp: 270, rep: { agrozone: -5, renegades: 8 }, deeds: ['free-slaves'] }),

  // ==================================================================== Культ
  quest('q-nedoimka', 'Долг на двух страницах', 'talk', 'sk-nedoimka', 'cult', 2,
    'Нотариат требует душу Недоимки в счёт долга. Найти способ расплатиться без передачи.',
    [
      st('ask', 'Недоимка протягивает две страницы дрожащими руками.', talk('sk-nedoimka', 'sokralnya'), 'solve'),
      st('solve', 'Погасить долг.', choice([
        { id: 'law', text: 'Найти лазейку в договоре.', goal: check(['religion', 'analysis'], 14), next: 'back' },
        { id: 'talk', text: 'Уговорить нотариуса на рассрочку.', goal: check(['persuasion', 'deception'], 13), next: 'back' },
        { id: 'pay', text: 'Заплатить 100 кредов.', goal: { kind: 'pay', credits: 100 }, effects: { deeds: ['help-weak'] }, next: 'back' },
      ]), 'back'),
      st('back', 'Вернуться к Недоимке.', talk('sk-nedoimka', 'sokralnya'), 'done'),
    ],
    { xp: 160, rep: { cult: -3 } }),

  // ==================================================================== Нейтральные селения
  quest('q-buzina', 'Слёзка для звонаря', 'search', 'sy-buzina', 'neutralVillages', 1,
    'Звонарь Динь болен, а нужной травы «слёзки» у Бузины нет. Найти её в окрестностях.',
    [
      st('ask', 'Бузина смотрит в окно: «Слёзка растёт, где тень, но не сыро».', talk('sy-buzina', 'svyatost'), 'find'),
      st('find', 'Найти траву.', choice([
        { id: 'survive', text: 'Пойти по следам и приметам.', goal: check(['survival', 'perception'], 12), next: 'prepare' },
        { id: 'bio', text: 'Определить по описанию в справочнике.', goal: check(['biology'], 12), next: 'prepare' },
      ]), 'prepare'),
      st('prepare', 'Приготовить настой.', check(['medicine', 'biology'], 12), 'back'),
      st('back', 'Передать Бузине.', talk('sy-buzina', 'svyatost'), 'done'),
    ],
    { xp: 120, credits: 25, rep: { neutralVillages: 4 } }),

  // ==================================================================== Отступники
  quest('q-shnur', 'Мины и свои', 'mixed', 'sht-shnur', 'renegades', 2,
    'Шнур просит переставить мины на подступах так, чтобы свои не подрывались.',
    [
      st('ask', 'Шнур чертит карту палкой.', talk('sht-shnur', 'shtabtsentr'), 'rearrange'),
      st('rearrange', 'Переставить мины.', choice([
        { id: 'mil', text: 'Действовать по военному порядку.', goal: check(['military'], 14, 'ambush'), next: 'back' },
        { id: 'tech', text: 'Обезвредить электронику.', goal: check(['tech', 'hacking'], 13, 'ambush'), next: 'back' },
      ]), 'back'),
      st('ambush', 'Мина щёлкнула — на звук идут партизаны.', battle('v3-ren-ambush', 'shtabtsentr'), 'back'),
      st('back', 'Вернуться к Шнур.', talk('sht-shnur', 'shtabtsentr'), 'done'),
    ],
    { xp: 170, credits: 40, rep: { renegades: 5 } }),

  // ==================================================================== Кринжгоны / Предложка / мутанты
  quest('q-murashka', 'Мне не смешно', 'mixed', 'pg-murashka', 'cringegons', 3,
    'Стажёр Мурашка хочет сбежать из Горнила в Надежду. Помочь тайком вывести её из лагеря.',
    [
      st('ask', 'Мурашка прячет в рукаве листок со стихами.', talk('pg-murashka', 'pepelnoe-gornilo'), 'escape'),
      st('escape', 'Вывести стажёра.', choice([
        { id: 'talk', text: 'Убедить конферансье отпустить «по обмену».', goal: check(['persuasion', 'deception'], 14, 'wedding'), next: 'back' },
        { id: 'sneak', text: 'Провести задами.', goal: check(['stealth'], 14, 'wedding'), next: 'back' },
      ]), 'back'),
      st('wedding', 'Заметили: «свадьба» бросает всех в погоню.', battle('v3-crg-wedding', 'pepelnoe-gornilo'), 'back'),
      st('back', 'Передать Мурашку в Надежду.', reach('nadezhda'), 'done'),
    ],
    { xp: 260, deeds: ['mercy'], rep: { cringegons: -3 } }),

  quest('q-hvost', 'След хищника', 'search', 'vn-hvost', 'mutantsBeast', 2,
    'Ловчий Хвост идёт по следу хищника, охотящегося на своих. След странно знакомый.',
    [
      st('ask', 'Хвост показывает отпечаток лапы и качает головой.', talk('vn-hvost', 'vonyuchka'), 'track'),
      st('track', 'Выследить.', check(['survival', 'perception'], 13, 'pack'), 'truth'),
      st('pack', 'Стая вышла навстречу.', battle('v3-mutz-pack', 'vonyuchka'), 'truth'),
      st('truth', 'След ведёт к Хвосту: он сам проходил здесь в чужих сапогах.', choice([
        { id: 'tell', text: 'Рассказать ему правду.', goal: check(['persuasion', 'analysis'], 12), effects: { deeds: ['honor'] }, next: 'back' },
        { id: 'hide', text: 'Промолчать и закрыть дело.', effects: { deeds: ['lie'] }, next: 'back' },
      ]), 'back'),
      st('back', 'Вернуться к Хвосту.', talk('vn-hvost', 'vonyuchka'), 'done'),
    ],
    { xp: 180, credits: 30, rep: { mutantsBeast: 4 } }),

  quest('q-zakladka', 'Книги на растопку', 'mixed', 'bp-zakladka', 'predlozhka', 3,
    'Мародёры вывозят книги с обломков Небесного базара на растопку. Закладка просит спасти что можно.',
    [
      st('ask', 'Закладка прижимает к груди потрёпанный том.', talk('bp-zakladka', 'baza-predlozhki'), 'go'),
      st('go', 'Добраться до обломков.', reach('krushenie-nebesnogo-bazara'), 'salvage'),
      st('salvage', 'Вынести книги.', choice([
        { id: 'talk', text: 'Выкупить у мародёров по цене растопки.', goal: check(['persuasion', 'analysis'], 13, 'fight'), next: 'back' },
        { id: 'bluff', text: 'Убедить, что книги проклятые.', goal: check(['deception', 'religion'], 13, 'fight'), next: 'back' },
      ]), 'back'),
      st('fight', 'Мародёры не слушают.', battle('w-road-pirates', 'krushenie-nebesnogo-bazara'), 'back'),
      st('back', 'Передать книги Закладке.', talk('bp-zakladka', 'baza-predlozhki'), 'done'),
    ],
    { xp: 260, rep: { predlozhka: 8 } }),

  // ==================================================================== Бродячие
  quest('q-parol', 'Обращение экскаватора', 'talk', 'w-parol', 'tekhonki', 3,
    'Миссионер Пароль идёт на Гремящие холмы обращать оживлённый прокси-бурей экскаватор. Помочь довести проповедь.',
    [
      st('ask', 'Пароль перелистывает листовки с кодами.', talk('w-parol', 'hill-monsters-m20'), 'preach'),
      st('preach', 'Встретиться с экскаватором.', choice([
        { id: 'convert', text: 'Прочитать ему проповедь.', goal: check(['religion', 'proxy', 'persuasion'], 14, 'fight'), effects: { deeds: ['tech-faith'] }, next: 'back' },
        { id: 'tech', text: 'Выключить его по-хорошему.', goal: check(['tech', 'hacking'], 14, 'fight'), next: 'back' },
      ]), 'back'),
      st('fight', 'Экскаватор не оценил.', battle('w-road-crawlers', 'hill-monsters-m20'), 'back'),
      st('back', 'Вернуться к Паролю.', talk('w-parol', 'hill-monsters-m20'), 'done'),
    ],
    { xp: 240, credits: 40, rep: { tekhonki: 5 } }),

  quest('q-order', 'Заказ, которого не было', 'talk', 'w-order', 'none', 2,
    'Охотник Ордер ищет «Дезертира», о котором его никто не просил. Выяснить, кто его подставил.',
    [
      st('ask', 'Ордер раскладывает бумаги: подписи нет.', talk('w-order', 'brigands-m26'), 'investigate'),
      st('investigate', 'Найти заказчика.', choice([
        { id: 'analysis', text: 'Сличить подписи и почерки.', goal: check(['analysis', 'perception'], 13), next: 'back' },
        { id: 'intimidate', text: 'Выбить из посредника.', goal: check(['intimidation'], 13), effects: { deeds: ['cruelty'] }, next: 'back' },
      ]), 'back'),
      st('back', 'Передать Ордеру.', talk('w-order', 'brigands-m26'), 'done'),
    ],
    { xp: 150, credits: 70 }),

  quest('q-kvazi', 'Образец из шахты', 'search', 'w-kvazi', 'none', 3,
    'Профессор Квазиморф просит добыть образец фауны из шахты проводников. Желательно живой, но не против и мёртвый.',
    [
      st('ask', 'Профессор вручает банку с дырочками.', talk('w-kvazi', 'libraries-m39'), 'go'),
      st('go', 'Спуститься в шахту.', reach('caves-m46'), 'sample'),
      st('sample', 'Взять образец.', choice([
        { id: 'bio', text: 'Подманить и поймать аккуратно.', goal: check(['biology', 'survival'], 14, 'fight'), next: 'back' },
        { id: 'fight', text: 'Добыть силой.', goal: battle('v3-fauna-mine', 'caves-m46'), next: 'back' },
      ]), 'back'),
      st('fight', 'Образец оказался злее, чем ожидалось.', battle('v3-fauna-mine', 'caves-m46'), 'back'),
      st('back', 'Передать профессору.', talk('w-kvazi', 'libraries-m39'), 'done'),
    ],
    { xp: 260, credits: 60 }),

  quest('q-kontuziya', 'Похоронить своих', 'mixed', 'w-kontuziya', 'none', 3,
    'Лейтенант Контузия каждую ночь командует отрядом, которого нет. Помочь ему похоронить своих.',
    [
      st('ask', 'Контузия смотрит сквозь тебя, но кивает.', talk('w-kontuziya', 'battlefields-m9'), 'calm'),
      st('calm', 'Успокоить и вывести из ночного кошмара.', choice([
        { id: 'med', text: 'Дать лекарство и поговорить.', goal: check(['medicine', 'persuasion'], 14, 'wake'), effects: { deeds: ['mercy'] }, next: 'bury' },
        { id: 'mil', text: 'Отдать честь как офицеру.', goal: check(['military'], 13, 'wake'), effects: { deeds: ['honor'] }, next: 'bury' },
      ]), 'bury'),
      st('wake', 'Он принимает тебя за врага.', battle('v3-wp-walker', 'battlefields-m9'), 'bury'),
      st('bury', 'Похоронить погибших.', reach('battlefields-m9'), 'back'),
      st('back', 'Попрощаться с Контузией.', talk('w-kontuziya', 'battlefields-m9'), 'done'),
    ],
    { xp: 280, rep: { warprom: 3 } }),
];

export const QUESTS_NPC = Object.fromEntries(LIST.map((q) => [q.id, q]));
