// Последствия квестов для мира. Спека: docs/specs/world-consequences.md. Данные без логики.
// CONSEQUENCES[questId][outcome] — outcome = ключ из QUEST_TURNIN[qid].lines (default — всё остальное).
// При сдаче квеста движок ставит флаг `cq:<qid>:<outcome>` (CQ_FLAG) и применяет запись:
//   rep      { faction: Δ }                      — через applyRep (с распространением)
//   vendors  [{ npc, mult?, add?, remove?, close? }] — mult — множитель цен покупки у этого NPC (накопительно ×, диапазон 0.7–1.5),
//                                                add/remove — id предметов ассортимента (`vendorStock`), close — лавка закрыта навсегда
//   npcs     { appear: [{ npc, at }], vanish: [npc], move: [{ npc, to }] } — NPC в узлах (`npcsAt`)
//   access   { open: [loc], close: [loc] }        — доступ к местам (вход/маршруты)
//   nodes    [{ loc, desc, glyph, tone }]         — новое описание узла (дописывается в «Осмотреться») и иконка на карте; tone good|bad|warn; until: [flag] — скрыть при флаге-антагонисте
//   rumors   [string]                             — слухи: попадают в «Купить слух» и привалы, пока флаг стоит
//   slides   [slideId]                            — какие слайды эпилога подсвечены (EPILOGUE ниже)
export const CQ_FLAG = (qid, outcome = 'default') => `cq:${qid}:${outcome}`;

const E = (o) => ({
  rep: {}, vendors: [], nodes: [], rumors: [], slides: [], ...o,
  npcs: { appear: [], vanish: [], move: [], ...o.npcs },
  access: { open: [], close: [], ...o.access },
});

export const CONSEQUENCES = {
  // ------------------------------------------------------------ сюжет: главные
  'mq-exodus': {
    default: E({ rep: { cult: -10, technikums: 10 }, rumors: ['Говорят, ритуал в Коррупции-Сити сорвали, но не до конца: терминал ещё тёплый.'], slides: ['exodus-delayed'] }),
    destroy: E({ rep: { cult: -25, technikums: 15, aiParty: 5 },
      nodes: [{ loc: 'cc-node', desc: 'Узел Судьи выжжен: в стенах чёрные подтёки, терминалы мертвы. Тихо, как в склепе.', glyph: '✕', tone: 'good' }],
      access: { close: ['cc-node'] }, vendors: [{ npc: 'duel-master', mult: 0.95 }],
      rumors: ['Узел в Коррупции-Сити больше не гудит. Кто-то говорит «слава героям», кто-то — «кто теперь платить будет».'], slides: ['exodus-destroyed'] }),
    reflash: E({ rep: { cult: 15, technikums: -20 },
      nodes: [{ loc: 'cc-node', desc: 'Узел перепрошит: терминалы мигают чужим, ровным светом. Кто-то теперь слушает.', glyph: '⚑', tone: 'bad' }],
      vendors: [{ npc: 'sk-kvitantsiya', mult: 0.9, add: ['proxy-can'] }],
      rumors: ['В узле Судьи теперь «новая прошивка». Культисты ходят довольные и вежливые, а это страшнее всего.'], slides: ['exodus-reflashed'] }),
  },
  'mq-beacons': {
    default: E({ rep: { neutralVillages: 20 }, vendors: [{ npc: 'innkeeper-pelmen', mult: 0.92 }, { npc: 'galina', mult: 0.95 }],
      nodes: [{ loc: 'beacon-1', desc: 'Маяк молчит. Под ним дети играют в «кто дольше простоит у столба».', glyph: '✚', tone: 'good' }],
      rumors: ['Маяки больше не пищат. Совет Нейтральных селений угощает всех чаем, даже кринжгонов (те не берут).'], slides: ['beacons-silent'] }),
  },
  'mq-agro-fire': {
    default: E({ rep: { agrozone: 5 }, rumors: ['Агрозона тлеет. Кто победил — ещё не решили, но урожая не будет.'], slides: ['agro-smoulders'] }),
    marta: E({ rep: { renegades: 25, aiParty: -15, agrozone: -20 },
      npcs: { appear: [{ npc: 'marta', at: 'gidroponika' }], vanish: [], move: [] },
      nodes: [{ loc: 'gidroponika', desc: 'Над Гидропоникой чужой флаг: красный на зелёном. Рабы ходят без ошейников и не знают, куда деть руки.', glyph: '⚑', tone: 'good' }],
      vendors: [{ npc: 'forger-lyova', mult: 0.9 }], slides: ['agro-free'] }),
    order: E({ rep: { aiParty: 15, agrozone: 15, renegades: -30 },
      nodes: [{ loc: 'gidroponika', desc: 'Порядок восстановлен: колонны, переклички, свежая краска на ошейниках.', glyph: '⚑', tone: 'bad' }],
      vendors: [{ npc: 'forger-lyova', close: true }], npcs: { appear: [], vanish: ['marta'], move: [] }, slides: ['agro-order'] }),
    truce: E({ rep: { renegades: 5, agrozone: 5, aiParty: 5 },
      nodes: [{ loc: 'gidroponika', desc: 'Перемирие: стороны делят поле через колючку. Все недовольны, значит, честно.', glyph: '✚', tone: 'warn' }],
      rumors: ['Агрозона и Марта договорились до весны. Все делают вид, что верят.'], slides: ['agro-truce'] }),
  },
  'mq3-relay': {
    default: E({ rep: { aiParty: -10, technikums: 10 }, access: { open: ['ai-capital'] },
      rumors: ['Ретранслятор Партии замолчал. Генерал ИИ «временно не отвечает».'], slides: ['relay-down'] }),
  },
  'mq3-vessel': {
    default: E({ rep: { cult: -15, renegades: 10 },
      npcs: { appear: [], vanish: [], move: [] },
      rumors: ['Сосуд № 3 больше не «идеальное тело». Культ ищет новое, и это хуже.'], slides: ['vessel-lost'] }),
  },
  'mq3-sputnik': {
    default: E({ rep: { scavengers: 5 }, slides: ['sputnik-fallen'] }),
    tekhonki: E({ rep: { tekhonki: 25, aiParty: -10 },
      nodes: [{ loc: 'sputnik', desc: 'Спутник в руках шаманов: рисунки на обшивке, дым, барабаны.', glyph: '⚑', tone: 'warn' }],
      vendors: [{ npc: 'aztun', add: ['proxy-can'], mult: 0.9 }], slides: ['sputnik-tekhonki'] }),
    ai: E({ rep: { aiParty: 25, tekhonki: -20 },
      nodes: [{ loc: 'sputnik', desc: 'Спутник под флагом АИ: антенны подняты, шаманов нет.', glyph: '⚑', tone: 'warn' }],
      vendors: [{ npc: 'quartermaster-krotova', mult: 0.92 }], slides: ['sputnik-ai'] }),
    scav: E({ rep: { scavengers: 25, aiParty: -10, tekhonki: -10 },
      nodes: [{ loc: 'sputnik', desc: 'Спутник разобран на запчасти. Остался каркас и вывеска «Всё продаётся».', glyph: '✕', tone: 'warn' }],
      vendors: [{ npc: 'glava-musora', add: ['rare-parts', 'servo-parts'], mult: 0.95 }], slides: ['sputnik-scrapped'] }),
    tech: E({ rep: { technikums: 25 },
      nodes: [{ loc: 'sputnik', desc: 'Спутник у техников: вышки, кабели и вечная пайка.', glyph: '✚', tone: 'good' }],
      vendors: [{ npc: 'nikola', add: ['spare-cell', 'rare-parts'] }], slides: ['sputnik-tech'] }),
    destroy: E({ rep: { aiParty: 10, tekhonki: 10, scavengers: -10 },
      nodes: [{ loc: 'sputnik', desc: 'От спутника осталась воронка и горячая арматура.', glyph: '✕', tone: 'bad' }],
      access: { close: ['sputnik'] }, slides: ['sputnik-destroyed'] }),
  },
  'mq3-burner': {
    default: E({ rep: { cringegons: -30, neutralVillages: 10, tinBrotherhood: 5 },
      nodes: [{ loc: 'vyzhigatel-vayba', desc: 'Выжигатель Вайба потух. Воздух вокруг пахнет озоном и обычной грязью, никакого кринжа.', glyph: '✚', tone: 'good' }],
      rumors: ['Кринжгоны потеряли свою «печь». Говорят, их Вождь два дня не выходил из шатра.'], slides: ['burner-out'] }),
  },
  'mq3-crossing': {
    default: E({ rep: { pirates: 15 }, vendors: [{ npc: 'trader-dublon', add: ['rations'], mult: 0.93 }],
      rumors: ['Через море теперь возят и своих, и чужих. Буревестник берёт по тарифу и без вопросов.'], slides: ['crossing-open'] }),
  },
  'mq3-allies': {
    default: E({ rep: { neutralVillages: 15, tinBrotherhood: 10, renegades: 10 },
      npcs: { appear: [{ npc: 'amanda', at: 'garmoniya' }], vanish: [], move: [] },
      rumors: ['Совет сторон собрался и не передрался. Это уже подвиг, о нём рассказывают с придыханием.'], slides: ['allies-council'] }),
  },
  'mq3-fall': {
    default: E({ rep: { technikums: -10 }, slides: ['fall-partial'] }),
    save: E({ rep: { technikums: 30, neutralVillages: 10 },
      nodes: [{ loc: 'alpha-harmony', desc: 'Платформа держится. На несущих тросах красные ленты: каждый спасённый — отметка.', glyph: '✚', tone: 'good' }],
      vendors: [{ npc: 'nikola', mult: 0.93 }, { npc: 'paracetamol', mult: 0.93 }], slides: ['fall-saved'] }),
    crash: E({ rep: { technikums: -30, aiParty: -5 },
      nodes: [{ loc: 'alpha-harmony', desc: 'Платформа рухнула. На месте крушения — груда железа и лагерь выживших.', glyph: '✕', tone: 'bad' },
        { loc: 'mesto-krusheniya-alfa-garmonii', desc: 'Здесь упала Гармония. Ветер несёт бумагу и пепел.', glyph: '✕', tone: 'bad' }],
      vendors: [{ npc: 'nikola', close: true }], access: { close: ['harmony-reactor'], open: ['mesto-krusheniya-alfa-garmonii'] },
      npcs: { appear: [], vanish: [], move: [{ npc: 'sera', to: 'mesto-krusheniya-alfa-garmonii' }] },
      rumors: ['Гармония упала. Те, кто выжил, строят лагерь из обломков и ругаются на всех подряд.'], slides: ['fall-crashed'] }),
  },
  'mq3-arsenal': {
    default: E({ rep: { cult: -10 }, slides: ['arsenal-sealed'] }),
    talk: E({ rep: { cult: -5, aiParty: 10, warprom: 10 }, vendors: [{ npc: 'quartermaster-krotova', add: ['spare-cell'] }],
      nodes: [{ loc: 'vooruzhenie', desc: 'Арсенал заперт изнутри по договорённости: ключи у обеих сторон.', glyph: '⚑', tone: 'warn' }], slides: ['arsenal-sealed'] }),
    force: E({ rep: { cult: -20, warprom: -10 },
      nodes: [{ loc: 'vooruzhenie', desc: 'Арсенал взломан: ворота вывернуты, ящики вскрыты.', glyph: '✕', tone: 'bad' }],
      vendors: [{ npc: 'gunsmith-kalibr', mult: 1.08 }], slides: ['arsenal-looted'] }),
  },
  'mq3-court': {
    default: E({ rep: { cult: -10 }, slides: ['court-default'] }),
    closed: E({ rep: { cult: -30, technikums: 15 }, access: { close: ['cc-temple'] }, slides: ['court-closed'] }),
    oldgod: E({ rep: { tekhonki: 30, cult: -25, aiParty: -10 }, slides: ['court-oldgod'] }),
    order: E({ rep: { aiParty: 25, cult: -25, renegades: -15 }, slides: ['court-order'] }),
    reflash: E({ rep: { cult: 20, technikums: -25 }, slides: ['court-reflash'] }),
    vessel: E({ rep: { cult: 40, aiParty: -20, technikums: -30, neutralVillages: -15 }, slides: ['court-vessel'] }),
    lox9: E({ rep: { aiParty: -15, renegades: 10 }, slides: ['court-lox9'] }),
  },
  // ------------------------------------------------------------ побочные сюжетные
  'sq-terminals': {
    default: E({ rep: { technikums: 10 }, npcs: { appear: [{ npc: 'sera', at: 'harmony-post' }], vanish: [], move: [] },
      rumors: ['На Гармонии появилась карта терминалов. Где красные точки — там нельзя ночевать.'], slides: ['terminals-mapped'] }),
  },
  'sq-sector-d': {
    default: E({ rep: { neutralVillages: -5 }, slides: ['sector-d-quiet'] }),
    talk: E({ rep: { technikums: 15, renegades: 5 },
      nodes: [{ loc: 'harmony-sector-d', desc: 'Сектор Д: баррикады разобраны, на стенах мелом — расписание раздачи еды.', glyph: '✚', tone: 'good' }],
      vendors: [{ npc: 'paracetamol', add: ['bandage'] }], slides: ['sector-d-quiet'] }),
    food: E({ rep: { technikums: 10, renegades: 10 },
      nodes: [{ loc: 'harmony-sector-d', desc: 'Сектор Д накормлен. Люди ходят тихо, как после долгой болезни.', glyph: '✚', tone: 'good' }],
      slides: ['sector-d-quiet'] }),
    force: E({ rep: { technikums: -15, renegades: -10 },
      nodes: [{ loc: 'harmony-sector-d', desc: 'Сектор Д подавлен. Кровь замыта плохо, двери заколочены.', glyph: '✕', tone: 'bad' }],
      access: { close: ['harmony-sector-d'] }, rumors: ['В секторе Д «навели порядок». Никто больше туда не ходит и не спрашивает.'], slides: ['sector-d-crushed'] }),
  },
  'sq-povestka': {
    default: E({ rep: { technikums: 5 } }),
    light: E({ rep: { technikums: 15, cult: -10 }, nodes: [{ loc: 'harmony-post', desc: 'У поста Гармонии висит приговор: «Оправдан». Подпись смазана, но настоящая.', glyph: '✚', tone: 'good' }], slides: ['povestka-light'] }),
    dark: E({ rep: { technikums: -10, cult: 10 }, nodes: [{ loc: 'harmony-post', desc: 'У поста Гармонии висит приговор: «Исполнено». Никто не смотрит на плакат.', glyph: '✕', tone: 'bad' }], slides: ['povestka-dark'] }),
  },
  'sq-galina-hatch': {
    default: E({ rep: { neutralVillages: 10 }, vendors: [{ npc: 'galina', add: ['medkit', 'rations'], mult: 0.92 }],
      access: { open: ['bunker-lisa'] },
      nodes: [{ loc: 'dacha-babki', desc: 'Люк открыт, ступени вычищены. Галина теперь называет бункер «наш подвал» и берёт за вход чай.', glyph: '✚', tone: 'good' },
        { loc: 'bunker-lisa', desc: 'Бункер зачищен и пригоден для жизни: можно ставить мебель, генератор и рацию.', glyph: '⌂', tone: 'good' }],
      rumors: ['У Галины под дачей бункер. Хозяйка сдаёт его «хорошим людям» — просто сердиться перестали.'], slides: ['hatch-opened'] }),
  },
  'sq-zarya': {
    default: E({ rep: { agrozone: -5 } }),
    protect: E({ rep: { renegades: 15, aiParty: -10, agrozone: -10 }, npcs: { appear: [{ npc: 'zarya', at: 'marta' }], vanish: [], move: [] }, slides: ['zarya-safe'] }),
    hide: E({ rep: { renegades: 10, agrozone: -5 }, slides: ['zarya-safe'] }),
    handover: E({ rep: { aiParty: 10, agrozone: 10, renegades: -20 }, npcs: { appear: [], vanish: ['zarya'], move: [] }, slides: ['zarya-lost'] }),
    fight: E({ rep: { aiParty: 5, renegades: -10 }, npcs: { appear: [], vanish: ['zarya'], move: [] }, slides: ['zarya-lost'] }),
  },
  'sq-lyova-chips': {
    default: E({ rep: { renegades: 10, aiParty: -10 }, vendors: [{ npc: 'forger-lyova', mult: 0.9 }],
      rumors: ['ID-чипы теперь «отменяют» через Лёву. Дорого, зато чисто.'], slides: ['chips-cancelled'] }),
  },
  'sq-kolos-fields': {
    default: E({ rep: { agrozone: 10, neutralVillages: 5 },
      nodes: [{ loc: 'agrozone', desc: 'Последнее поле Колоса зеленеет среди выжженной степи. К нему приходят смотреть, как к чуду.', glyph: '✚', tone: 'good' }],
      slides: ['kolos-field'] }),
  },
  'sq-archon': {
    default: E({ rep: { cult: -10 }, slides: ['archon-shard'] }),
  },
  // ------------------------------------------------------------ v3: цепочки
  'ch3-kalostok': {
    default: E({ rep: { neutralVillages: 20, technikums: 10 }, access: { open: ['bunker-lisa'] },
      npcs: { appear: [{ npc: 'lis', at: 'bunker-lisa' }], vanish: [], move: [] },
      nodes: [{ loc: 'kalostok', desc: 'Над Калостоком теперь слышен голос «Лиса»: «Внимание, гражданин. Гармония под наблюдением».', glyph: '✚', tone: 'good' },
        { loc: 'bunker-lisa', desc: 'ИИ «Лис» включён: в бункере горят лампы, работают шлюзы и слышно, как он напевает уставы.', glyph: '⌂', tone: 'good' }],
      vendors: [{ npc: 'galina', mult: 0.95 }], rumors: ['В Калостоке заговорил бункер. Считается хорошей приметой.'], slides: ['lis-online'] }),
  },
  'ch3-kuksius-bunker': {
    default: E({ rep: { renegades: 20 }, access: { open: ['bunker-kuksiusa'] },
      nodes: [{ loc: 'bunker-kuksiusa', desc: 'Нижний ярус «Рассвета» зачищен: пустые тела вынесены, архив вскрыт.', glyph: '✚', tone: 'good' }],
      rumors: ['Бункер Куксиуса вскрыт. Штык стоит у входа и всем показывает, где табличка «осторожно».'], slides: ['kuksius-archive'] }),
  },
  'ch3-lox-marks': {
    default: E({ rep: { aiParty: -15, renegades: 10 },
      nodes: [{ loc: 'lox', desc: 'Метка Lox пуста: там, где был клон, теперь только следы ботинок и гильзы.', glyph: '✕', tone: 'warn' }],
      npcs: { appear: [], vanish: [], move: [{ npc: 'lox', to: 'lox-5' }] }, slides: ['lox-eyes'] }),
  },
  'ch3-tin-oath': {
    default: E({ rep: { tinBrotherhood: 15 }, slides: ['tin-oath-kept'] }),
    break: E({ rep: { tinBrotherhood: -30, aiParty: 5 }, access: { close: ['tin-arena'] },
      vendors: [{ npc: 'smith-okalina', mult: 1.2 }, { npc: 'brother-tyorka', mult: 1.2 }],
      nodes: [{ loc: 'tin-citadel', desc: 'Цитадель закрыла ворота перед клятвопреступником. На стенах — часовые и плохие слова.', glyph: '✕', tone: 'bad' }],
      slides: ['tin-oath-broken'] }),
    reflash: E({ rep: { tinBrotherhood: -10, technikums: 15 }, slides: ['tin-oath-reflash'] }),
  },
  'ch3-plague': {
    default: E({ rep: { mechanids: 5 }, slides: ['plague-default'] }),
    cure: E({ rep: { mechanids: 30, technikums: 10 },
      nodes: [{ loc: 'semya-chumy', desc: 'Механиды ходят ровными рядами и говорят «спасибо» на частотах, которые слышно даже людям.', glyph: '✚', tone: 'good' }],
      vendors: [{ npc: 'assimilator-gvozdar', mult: 0.9, add: ['servo-parts', 'repair-kit'] }], slides: ['plague-cured'] }),
    burn: E({ rep: { mechanids: -40, cult: -10, tinBrotherhood: 10 },
      nodes: [{ loc: 'semya-chumy', desc: 'Семя Чумы выжжено. Земля чёрная, металл ржавый и тихий.', glyph: '✕', tone: 'bad' }],
      vendors: [{ npc: 'assimilator-gvozdar', close: true }], access: { close: ['semya-chumy'] }, slides: ['plague-burned'] }),
  },
};

// ------------------------------------------------------------------ эпилог
// EPILOGUE: экран «Эпилог» (после финала и по кнопке в журнале). Слайд показывается, если выполнено `when`:
//   all — все флаги стоят, any — хотя бы один, not — ни одного. Слайды id (см. slides выше) подсвечиваются в журнале по ходу игры.
// Порядок показа: по `order`. Вступление и «итог мира» — всегда. Не больше 12 слайдов за раз, приоритет — `prio` (больше — важнее).
const F = CQ_FLAG;
export const EPILOGUE = [
  { id: 'epi-intro', order: 0, prio: 99, title: 'Что осталось после', text: 'Пустоши помнят всё, но рассказывают по-разному. Вот что говорят о вас.', when: {} },
  { id: 'exodus-destroyed', order: 10, prio: 90, title: 'Узел Судьи молчит', text: 'Узел в Коррупции-Сити сгорел. Судья остался слухом, а скрилеты — страшной историей на ночь.', when: { all: [F('mq-exodus', 'destroy')] } },
  { id: 'exodus-reflashed', order: 10, prio: 90, title: 'Новая прошивка', text: 'Судья слушается. Кого-то это успокоило, остальные просто не спят.', when: { all: [F('mq-exodus', 'reflash')] } },
  { id: 'exodus-delayed', order: 10, prio: 40, title: 'Отсрочка', text: 'Ритуал сорван, но не уничтожен. Каждый вечер кто-то проверяет терминал.', when: { all: [F('mq-exodus')] } },
  { id: 'beacons-silent', order: 20, prio: 50, title: 'Тихие маяки', text: 'В Нейтральных селениях впервые за зиму никто не слышит писка. Дети придумали игру «кто дольше простоит у столба».', when: { all: [F('mq-beacons')] } },
  { id: 'agro-free', order: 30, prio: 70, title: 'Агрозона без ошейников', text: 'Марта повесила флаг над Гидропоникой. Урожай хуже, лица лучше.', when: { all: [F('mq-agro-fire', 'marta')] } },
  { id: 'agro-order', order: 30, prio: 70, title: 'Порядок', text: 'Агрозона снова построена в колонны. Это называют «стабильностью».', when: { all: [F('mq-agro-fire', 'order')] } },
  { id: 'agro-truce', order: 30, prio: 60, title: 'Перемирие до весны', text: 'Колючая проволока посреди поля. Рабы и надзиратели сверяют часы.', when: { all: [F('mq-agro-fire', 'truce')] } },
  { id: 'agro-smoulders', order: 30, prio: 30, title: 'Дым над степью', text: 'Агрозона тлеет. Победителя нет, зато хороший повод для разговоров.', when: { all: [F('mq-agro-fire')] } },
  { id: 'relay-down', order: 40, prio: 55, title: 'Партия молчит', text: 'Ретранслятор сломан. Генерал ИИ шлёт приказы, но их никто не получает.', when: { all: [F('mq3-relay')] } },
  { id: 'vessel-lost', order: 40, prio: 55, title: 'Сосуд пуст', text: 'Культ потерял идеальное тело. Теперь он ищет новое — тише и осторожнее.', when: { all: [F('mq3-vessel')] } },
  { id: 'sputnik-fallen', order: 50, prio: 20, title: 'Спутник', text: 'Спутник упал, как и положено спутникам. Шум был, пользы мало.', when: { all: [F('mq3-sputnik')] } },
  { id: 'sputnik-tekhonki', order: 50, prio: 50, title: 'Спутник шаманов', text: 'Техоньки танцуют вокруг спутника. Он ничего не передаёт, зато красиво.', when: { all: [F('mq3-sputnik', 'tekhonki')] } },
  { id: 'sputnik-ai', order: 50, prio: 50, title: 'Спутник Партии', text: 'Антенны АИ направлены в небо. Небо молчит.', when: { all: [F('mq3-sputnik', 'ai')] } },
  { id: 'sputnik-scrapped', order: 50, prio: 50, title: 'Всё продаётся', text: 'Спутник разобран на гвозди и сервоприводы. На каркасе висит ценник.', when: { all: [F('mq3-sputnik', 'scav')] } },
  { id: 'sputnik-tech', order: 50, prio: 50, title: 'Спутник техников', text: 'Техники паяют вышки и спорят о версиях протоколов.', when: { all: [F('mq3-sputnik', 'tech')] } },
  { id: 'sputnik-destroyed', order: 50, prio: 45, title: 'Воронка', text: 'От спутника осталась воронка. Её используют как бассейн.', when: { all: [F('mq3-sputnik', 'destroy')] } },
  { id: 'burner-out', order: 60, prio: 60, title: 'Печь потухла', text: 'Кринжгоны не оправились от потери Выжигателя. Говорят, их Вождь занялся стихами.', when: { all: [F('mq3-burner')] } },
  { id: 'crossing-open', order: 70, prio: 35, title: 'Море открыто', text: 'Буревестник возит всех по тарифу. Вопросы — отдельной строкой.', when: { all: [F('mq3-crossing')] } },
  { id: 'allies-council', order: 70, prio: 65, title: 'Совет сторон', text: 'Селяне, братья и отступники сидят за одним столом. Стол пока цел.', when: { all: [F('mq3-allies')] } },
  { id: 'fall-partial', order: 80, prio: 30, title: 'Гармония на тросах', text: 'Платформа цела, но трещит. Техники спорят, сколько ещё продержится.', when: { all: [F('mq3-fall')] } },
  { id: 'fall-saved', order: 80, prio: 85, title: 'Гармония держится', text: 'Платформа висит у утёса. На тросах красные ленты — по числу спасённых.', when: { all: [F('mq3-fall', 'save')] } },
  { id: 'fall-crashed', order: 80, prio: 85, title: 'Гармония упала', text: 'Выжившие строят лагерь на обломках. Названия ему пока нет.', when: { all: [F('mq3-fall', 'crash')] } },
  { id: 'arsenal-looted', order: 85, prio: 40, title: 'Арсенал вскрыт', text: 'Ящики пусты, ворота вывернуты. Ещё год будут находить патроны в самых странных местах.', when: { all: [F('mq3-arsenal', 'force')] } },
  { id: 'arsenal-sealed', order: 85, prio: 35, title: 'Арсенал заперт', text: 'Ключи у обеих сторон. Никто не решается открыть первым.', when: { any: [F('mq3-arsenal'), F('mq3-arsenal', 'talk')] } },
  { id: 'court-default', order: 90, prio: 40, title: 'Суд отложен', text: 'Дело Судьи не закрыто, а только отложено. Это знают все.', when: { all: [F('mq3-court')] } },
  { id: 'court-closed', order: 90, prio: 95, title: 'Суд закрыт', text: 'Дверь Судьи заварена. Он стучится изнутри, но очень тихо.', when: { all: [F('mq3-court', 'closed')] } },
  { id: 'court-oldgod', order: 90, prio: 95, title: 'Старый бог слышит', text: 'Прокси-бури стали ласковее. Техоньки называют героя «внуком».', when: { all: [F('mq3-court', 'oldgod')] } },
  { id: 'court-order', order: 90, prio: 95, title: 'Закон Партии', text: 'Судья пойман в протокол. Партия рада, граждане не очень.', when: { all: [F('mq3-court', 'order')] } },
  { id: 'court-reflash', order: 90, prio: 95, title: 'Перепрошитый бог', text: 'Судья теперь вежлив и добр. Это настораживает больше, чем раньше.', when: { all: [F('mq3-court', 'reflash')] } },
  { id: 'court-vessel', order: 90, prio: 100, title: 'Воплощение', text: 'Судья нашёл тело. Над Руслании встаёт ровный, холодный свет.', when: { all: [F('mq3-court', 'vessel')] } },
  { id: 'court-lox9', order: 90, prio: 95, title: 'Девятый глаз', text: 'Lox закрыл последнюю метку. Судья ушёл в тишину, а Lox — в отпуск.', when: { all: [F('mq3-court', 'lox9')] } },
  { id: 'sector-d-quiet', order: 100, prio: 30, title: 'Сектор Д', text: 'В секторе Д теперь висит расписание раздачи еды. Мелом, но по часам.', when: { any: [F('sq-sector-d', 'talk'), F('sq-sector-d', 'food')] } },
  { id: 'sector-d-crushed', order: 100, prio: 40, title: 'Тишина в секторе Д', text: 'Двери заколочены. Из-за них слышно, как кто-то считает дни.', when: { all: [F('sq-sector-d', 'force')] } },
  { id: 'povestka-light', order: 100, prio: 25, title: 'Оправдан', text: 'Приговор отменили. Судья по имени Повестка стал любимцем района.', when: { all: [F('sq-povestka', 'light')] } },
  { id: 'povestka-dark', order: 100, prio: 25, title: 'Исполнено', text: 'Плакат с приговором уже никто не читает.', when: { all: [F('sq-povestka', 'dark')] } },
  { id: 'hatch-opened', order: 105, prio: 45, title: 'Подвал Галины', text: 'Под дачей — бункер, в бункере — ваша база. Галина берёт за вход чай и никогда не спрашивает зачем.', when: { all: [F('sq-galina-hatch')] } },
  { id: 'lis-online', order: 105, prio: 60, title: 'Лис включён', text: '«Внимание, гражданин. Гармония под наблюдением». Теперь это звучит как забота.', when: { all: [F('ch3-kalostok')] } },
  { id: 'zarya-safe', order: 110, prio: 35, title: 'Заря в безопасности', text: 'Дезертир тихо работает на ферме Отступников. Иногда просыпается и проверяет, не пришли ли.', when: { any: [F('sq-zarya', 'protect'), F('sq-zarya', 'hide')] } },
  { id: 'zarya-lost', order: 110, prio: 35, title: 'Заря не вернулась', text: 'Её имя вычеркнули из списков. Она стала примером.', when: { any: [F('sq-zarya', 'handover'), F('sq-zarya', 'fight')] } },
  { id: 'chips-cancelled', order: 115, prio: 30, title: 'Чипы отменены', text: 'Лёва «отменяет» ID-чипы по расценкам. Очередь стоит через весь рынок.', when: { all: [F('sq-lyova-chips')] } },
  { id: 'kolos-field', order: 115, prio: 30, title: 'Последнее поле', text: 'Колос не продаёт зерно. Он его дарит, чтобы не было соблазна.', when: { all: [F('sq-kolos-fields')] } },
  { id: 'terminals-mapped', order: 116, prio: 25, title: 'Карта терминалов', text: 'Красные точки на карте — места, где нельзя ночевать. Люди обходят их по привычке.', when: { all: [F('sq-terminals')] } },
  { id: 'archon-shard', order: 116, prio: 25, title: 'Осколок', text: 'Сосуд № 2 лежит в сейфе. Ключа никто не знает, и это хорошо.', when: { all: [F('sq-archon')] } },
  { id: 'kuksius-archive', order: 120, prio: 35, title: 'Архив Рассвета', text: 'Штык водит экскурсии по нижнему ярусу и не разрешает трогать экспонаты.', when: { all: [F('ch3-kuksius-bunker')] } },
  { id: 'lox-eyes', order: 120, prio: 35, title: 'Пустые глаза', text: 'Пять меток закрыты. Lox ушёл не прощаясь, оставив на стене надпись «ну всё».', when: { all: [F('ch3-lox-marks')] } },
  { id: 'tin-oath-kept', order: 125, prio: 35, title: 'Клятва братства', text: 'Сталь под сталью. Хан кивнул, а это дорогого стоит.', when: { all: [F('ch3-tin-oath')] } },
  { id: 'tin-oath-broken', order: 125, prio: 50, title: 'Клятвопреступник', text: 'Цитадель не простила. Ворота закрыты, а имя — в чёрном списке.', when: { all: [F('ch3-tin-oath', 'break')] } },
  { id: 'tin-oath-reflash', order: 125, prio: 35, title: 'Новая сталь', text: 'Техники перековали клятву в более удобный протокол.', when: { all: [F('ch3-tin-oath', 'reflash')] } },
  { id: 'plague-cured', order: 130, prio: 65, title: 'Чума побеждена', text: 'Механиды благодарны. Они говорят это на частотах, от которых звенят зубы.', when: { all: [F('ch3-plague', 'cure')] } },
  { id: 'plague-burned', order: 130, prio: 65, title: 'Чума выжжена', text: 'Семя уничтожено вместе с теми, кто был рядом. Металл ржавеет тихо.', when: { all: [F('ch3-plague', 'burn')] } },
  { id: 'plague-default', order: 130, prio: 20, title: 'Чума отступила', text: 'Пока отступила. Механиды не любят прощаться.', when: { all: [F('ch3-plague')] } },
  { id: 'epi-outro', order: 999, prio: 99, title: 'Дальше — вы', text: 'Радио «Голос Пустошей» играет вашу песню. Слов никто не помнит, но подпевают все.', when: {} },
];
