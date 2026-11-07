// Статусы и таблицы «каста без ЭНР». Контракт — docs/specs/core-rules.md.
// Канон: docs/canon/rules/effects.md, extra/status-effects.md, rules/spellcasting.md.
//
// Как читать статус:
//   tick  — операция в начале каждого хода носителя (те же op, что у способностей).
//   mods  — постоянные модификаторы, пока статус висит:
//     kb, hit, dmg, dmgMelee, saves, init, speed — плоские бонусы/штрафы;
//     speedMul — множитель скорости (0 = стоит на месте);
//     initDice — кость к инициативе со знаком ('-1d4');
//     attackAdv / attackDisadv — свои атаки с преимуществом / помехой;
//     attackedAdv / attackedDisadv — атаки ПО носителю;
//     attackedAdvMelee / attackedDisadvRanged — то же, только для ближних / дальних;
//     incomingDmg — +N к урону каждой попавшей по носителю атаки;
//     resist — { dmgType: 'resist' | 'vuln' | 'immune' } поверх расовых;
//     blockCost — нельзя способности с cost > 0; blockWeapon — нельзя op 'weapon';
//     randomTarget — шанс (0..1), что атака уйдёт в случайную цель;
//     forcedTarget: 'source' — обязан атаковать наложившего;
//     noApproachSource — не может заканчивать движение ближе к наложившему;
//     shieldPierce — доля щита, которую игнорируют атаки по носителю;
//     armorKbMul — множитель КБ брони носителя;
//     firstAttackAdv, extraWeaponDice — для скрытности;
//     nextRollDice — кость к следующему броску атаки/спаса (потом статус снимается).
//   skipTurn   — пропуск хода.
//   breakOn    — 'attack' | 'ability': что снимает статус досрочно.
//   endSave    — характеристика спасброска в конце хода носителя (СЛ — та, с которой наложен).
//   endAction  — можно снять действием (например, потушить огонь).
//   endOnHeal  — снимается любым лечением ЗДР.
//   immuneTags — теги существ, на которых статус не действует.
//   cumulative / cap у tick buff — штраф копится каждый ход до cap и снимается вместе со статусом.
//   Этап B (docs/specs/statuses-surfaces.md):
//   tick.scale: 'tier' — урон тика × tier(L) (L — уровень наложившего); tick.ifStatus — тик только при статусе;
//   tick: [op, op] — несколько операций; tick.op 'maxHpLoss' {pct, cap} — радиация (−% макс. ЗДР за ход).
//   mods: saveMods {stat: N}, rangedDisadv, noBonus (нет бонусного действия), noCrit, healMul.
//   tagMul {тег: k} — длительность и урон тика ×k (R 0.5, V 1.5); ключи: тег, 'mutant', 'cls:<класс>', 'phobia:<триггер>'.
//   organicSwap {id, turns} — живым без импланта вместо статуса; withTag {тег: [id, раунды]} — доп. статус.
//   removes [ids] — при наложении снимает; blockedBy {id: true} — не ложится, а снимает этот статус (вода гасит огонь);
//   upgradeTo id — повторное наложение превращает в другой; wetTurns — длительность, если носитель мокрый.
//   vulnMul {dmgType: k}, onDmgStatus {dmgType: [id, раунды]}, onDmgExtra {dmgType: dice} — реакции на урон;
//   breakOnDmg {dmgType: +N} — +N урона и статус снимается; endOnDmg [dmgTypes] — урон снимает статус.
//   endActionKind: 'bonus' — снять бонусным действием; endNeeds: 'water' — только мокрым или у воды;
//   healShortens N — лечение ЗДР сокращает на N раундов; selfDmg {dice, dmgType} — после атаки/способности по себе.
//   icon — ключ палитры значка над юнитом; removal — строка «Снимается: …» для подсказки.

export const STATUSES = {
  stun: {
    id: 'stun', name: 'Оглушение', kind: 'debuff',
    desc: 'Пропускает ход.',
    skipTurn: true,
  },
  bleed: {
    id: 'bleed', name: 'Кровотечение', kind: 'debuff',
    desc: '1d4 урона в начале каждого хода, на клетке остаётся кровь. Останавливается любым лечением.',
    tick: { op: 'damage', dice: '1d4', dmgType: 'slash', scale: 'tier' },
    endOnHeal: true, bleedSurface: true, icon: 'c', removal: 'лечение',
    immuneTags: ['mechanical', 'digital'],
  },
  poison: {
    id: 'poison', name: 'Отравление', kind: 'debuff',
    desc: '−2 к атаке и урону, 1d4 урона ядом в начале каждого хода. Не действует на машины.',
    tick: { op: 'damage', dice: '1d4', dmgType: 'toxin', scale: 'tier' },
    mods: { hit: -2, dmg: -2 }, tagMul: { plant: 0.5, mutant: 0.5 }, icon: 'k',
    immuneTags: ['mechanical', 'digital'],
  },
  burn: {
    id: 'burn', name: 'Горение', kind: 'debuff',
    desc: '1d6 урона огнём в начале каждого хода. Можно потушить действием или водой.',
    tick: { op: 'damage', dice: '1d6', dmgType: 'fire', scale: 'tier' },
    endAction: true, turns: 3, tagMul: { plant: 1.5 }, blockedBy: { wet: true }, removes: ['chilled', 'frozen'], icon: 'e',
    removal: 'действие, вода, статус «Мокрый»',
  },
  fear: {
    id: 'fear', name: 'Страх', kind: 'debuff',
    desc: 'Помеха на атаки, нельзя приближаться к источнику страха. Спасбросок ТВД в конце хода снимает.',
    mods: { attackDisadv: true, noApproachSource: true },
    endSave: 'wil',
  },
  slow: {
    id: 'slow', name: 'Замедление', kind: 'debuff',
    desc: 'Скорость вдвое меньше, −2 к инициативе.',
    mods: { speedMul: 0.5, init: -2 },
  },
  blind: {
    id: 'blind', name: 'Ослепление', kind: 'debuff',
    desc: 'Помеха на атаки, атаки по цели с преимуществом. Причина: дым, вспышка, свет.',
    mods: { attackDisadv: true, attackedAdv: true }, removes: ['choking'],
  },
  root: {
    id: 'root', name: 'Обездвиживание', kind: 'debuff',
    desc: 'Не может двигаться. Спасбросок ТЕЛ в конце хода снимает.',
    mods: { speedMul: 0 },
    endSave: 'con',
  },
  silence: {
    id: 'silence', name: 'Немота', kind: 'debuff',
    desc: 'Не может использовать способности, которые стоят ЭНР.',
    mods: { blockCost: true },
  },
  disarm: {
    id: 'disarm', name: 'Разоружение', kind: 'debuff',
    desc: 'Выронил оружие: нельзя атаковать оружием. Спасбросок ЛВК в конце хода снимает.',
    mods: { blockWeapon: true },
    endSave: 'dex',
  },
  curse: {
    id: 'curse', name: 'Проклятие', kind: 'debuff',
    desc: '−2 к броскам атаки и спасброскам.',
    mods: { hit: -2, saves: -2 },
  },
  prone: {
    id: 'prone', name: 'Лежачий', kind: 'debuff',
    desc: 'Ближние атаки по цели с преимуществом, дальние — с помехой.',
    mods: { attackedAdvMelee: true, attackedDisadvRanged: true },
  },
  invisible: {
    id: 'invisible', name: 'Невидимость', kind: 'buff',
    desc: 'Атаки по цели с помехой. Своя атака снимает невидимость.',
    mods: { attackedDisadv: true },
    breakOn: 'attack',
  },
  stealth: {
    id: 'stealth', name: 'Скрытность', kind: 'buff',
    desc: 'Первая атака — с преимуществом и лишней костью урона. Атака снимает скрытность.',
    mods: { firstAttackAdv: true, extraWeaponDice: 1 },
    breakOn: 'attack',
  },
  cringed: {
    id: 'cringed', name: 'Кринж-эффект', kind: 'debuff',
    desc: 'Испанский стыд: 1d4 кринж-урона по МРЛ в начале хода, −1d4 к инициативе.',
    tick: { op: 'damage', dice: '1d4', dmgType: 'cringe' },
    mods: { initDice: '-1d4' },
  },
  corrosion: {
    id: 'corrosion', name: 'Коррозия', kind: 'debuff',
    desc: 'Броня разъедается: −1 КБ каждый ход, максимум −4. Штраф проходит вместе со статусом.',
    tick: { op: 'buff', stat: 'kb', value: -1, cumulative: true, cap: -4 }, tagMul: { mechanical: 1.5 }, icon: '7',
  },
  hallucination: {
    id: 'hallucination', name: 'Галлюцинации', kind: 'debuff',
    desc: 'С шансом 50% атака уходит в случайную цель (союзника или пустую клетку).',
    mods: { randomTarget: 0.5 },
  },
  dazed: {
    id: 'dazed', name: 'Дизбаланс', kind: 'debuff',
    desc: 'Атаки по цели игнорируют половину её щита, КБ брони вдвое меньше.',
    mods: { shieldPierce: 0.5, armorKbMul: 0.5 },
  },
  regen: {
    id: 'regen', name: 'Регенерация', kind: 'buff',
    desc: 'Восстанавливает 1d4 ЗДР в начале каждого хода.',
    tick: { op: 'heal', dice: '1d4', resource: 'hp' },
  },
  inspired: {
    id: 'inspired', name: 'Вдохновение', kind: 'buff',
    desc: '+1d4 к следующему броску атаки или спасброску.',
    mods: { nextRollDice: '1d4' },
  },
  blessed: {
    id: 'blessed', name: 'Благословение', kind: 'buff',
    desc: '+1 к атаке и урону.',
    mods: { hit: 1, dmg: 1 },
  },
  haste: {
    id: 'haste', name: 'Ускорение', kind: 'buff',
    desc: '+2 к инициативе, +3 к скорости.',
    mods: { init: 2, speed: 3 },
  },
  berserk: {
    id: 'berserk', name: 'Берсерк', kind: 'buff',
    desc: '+2 к урону в ближнем бою, −2 КБ.',
    mods: { dmgMelee: 2, kb: -2 },
  },
  taunt: {
    id: 'taunt', name: 'Провокация', kind: 'debuff',
    desc: 'Обязан атаковать того, кто спровоцировал.',
    mods: { forcedTarget: 'source' },
  },
  marked: {
    id: 'marked', name: 'Метка', kind: 'debuff',
    desc: 'Проклятая метка: каждая попавшая атака по цели наносит +2 урона.',
    mods: { incomingDmg: 2 },
  },
  fortified: {
    id: 'fortified', name: 'Стойка', kind: 'buff',
    desc: 'Сопротивление рубящему, колющему и дробящему урону.',
    mods: { resist: { slash: 'resist', pierce: 'resist', blunt: 'resist' } },
  },

  // ---------------------------------------------------------------- Этап B: новые статусы (спека §3.1)
  wet: {
    id: 'wet', name: 'Мокрый', kind: 'debuff', turns: 3, icon: 'f',
    desc: 'Вода на одежде: молния бьёт сильнее, огонь гаснет, лёд липнет.',
    removes: ['burn', 'oiled', 'scent'], vulnMul: { electric: 1.5 }, onDmgStatus: { electric: ['shocked', 2] },
    endAction: true, endActionKind: 'bonus', removal: '3 раунда, бонусное действие «Вытереться»',
  },
  oiled: {
    id: 'oiled', name: 'В масле', kind: 'debuff', turns: 3, icon: '6',
    desc: 'Масляный след: любое пламя вспыхивает, ноги скользят.',
    mods: { saveMods: { dex: -1 } }, removes: ['wet'], onDmgExtra: { fire: '1d6' }, onDmgStatus: { fire: ['burn', 3] },
    immuneTags: ['digital'], endAction: true, endActionKind: 'bonus', removal: 'вода, 3 раунда, бонусное действие «Стереть»',
  },
  shocked: {
    id: 'shocked', name: 'Шок', kind: 'debuff', turns: 1, wetTurns: 2, icon: 'h',
    desc: 'Судорога: ход без бонусного действия, −2 к атаке.',
    mods: { hit: -2, noBonus: true }, tick: { op: 'damage', dice: '1d4', dmgType: 'electric', scale: 'tier', ifStatus: 'wet' },
    tagMul: { plant: 0.5, proxy: 0.5, mechanical: 1.5 }, immuneTags: ['digital'], removal: 'истекает',
  },
  chilled: {
    id: 'chilled', name: 'Озноб', kind: 'debuff', turns: 2, icon: 'h',
    desc: 'Холод сковывает: скорость ×0.75, −1 к спасброскам ЛВК.',
    mods: { speedMul: 0.75, saveMods: { dex: -1 } }, upgradeTo: 'frozen', removes: ['burn'], endOnDmg: ['fire'],
    tagMul: { beast: 0.5, plant: 1.5 }, immuneTags: ['mechanical'], removal: 'истекает, огонь',
  },
  frozen: {
    id: 'frozen', name: 'Обледенение', kind: 'debuff', turns: 1, wetTurns: 2, icon: '5',
    desc: 'Ледяная корка: не двигается, но хрупок для дробящих ударов.',
    mods: { speedMul: 0, kb: -2 }, breakOnDmg: { blunt: 3 }, endOnDmg: ['fire'], removes: ['burn'],
    tagMul: { plant: 1.5 }, removal: 'истекает, дробящий удар (+3 урона), огонь',
  },
  acid: {
    id: 'acid', name: 'Кислота', kind: 'debuff', turns: 3, icon: 'j',
    desc: 'Едкая слизь: броня и кожа тают, −1 КБ в ход.',
    tick: [{ op: 'damage', dice: '1d4', dmgType: 'toxin', scale: 'tier' }, { op: 'buff', stat: 'kb', value: -1, cumulative: true, cap: -3 }],
    tagMul: { plant: 0.5, mutant: 0.5, mechanical: 1.5 }, withTag: { mechanical: ['corrosion', 3] },
    endAction: true, endNeeds: 'water', healShortens: 1, removal: 'действие «Смыть» (мокрый или у воды), лечение −1 раунд',
  },
  irradiated: {
    id: 'irradiated', name: 'Радиация', kind: 'debuff', turns: null, icon: 'b',
    desc: 'Фон Пустоши: макс. ЗДР снижен, лечение хуже.',
    tick: { op: 'maxHpLoss', pct: 0.05, cap: 0.25 }, mods: { healMul: 0.5 },
    tagMul: { 'race:skeleton': 0.5 }, immuneTags: ['mechanical', 'digital', 'mutant'], removal: 'не истекает; «Чистка кода»',
  },
  panic: {
    id: 'panic', name: 'Кринж-паника', kind: 'debuff', turns: 2, icon: 'n',
    desc: 'Стыд сильнее разума: бежит от источника, не может атаковать.',
    mods: { attackDisadv: true, noApproachSource: true, blockWeapon: true }, endSave: 'wil',
    tick: { op: 'damage', dice: '1d4', dmgType: 'cringe', scale: 'tier' },
    tagMul: { 'cls:reper': 0.5, cringe: 0.5, 'phobia:cringe': 1.5 }, immuneTags: ['mechanical', 'digital'],
    removal: 'спас ТВД в конце хода, лечение МРЛ',
  },
  glitch: {
    id: 'glitch', name: 'Глюк киберспейса', kind: 'debuff', turns: 2, icon: 'h',
    desc: 'Интерфейс шалит: способности иногда не срабатывают.',
    glitch: { failOn: 5, lag: 0.15 }, organicSwap: { id: 'hallucination', turns: 1 },
    tagMul: { digital: 2, mechanical: 2 }, removal: 'истекает, «Чистка кода»',
  },
  overload: {
    id: 'overload', name: 'Прокси-перегрузка', kind: 'debuff', turns: 3, icon: 'a',
    desc: 'Прокси-поле рвёт цепи: каждая способность бьёт по себе.',
    mods: { dmg: 2, noCrit: true }, selfDmg: { dice: '1d4', dmgType: 'proxy' }, immuneTags: ['proxy'],
    removal: 'истекает, «Чистка кода»',
  },
  choking: {
    id: 'choking', name: 'Удушье дымом', kind: 'debuff', turns: 2, icon: '3',
    desc: 'Дым режет глаза и лёгкие: дальние атаки с помехой, кашель.',
    mods: { rangedDisadv: true, speed: -1 }, tagMul: { plant: 0.5 }, immuneTags: ['mechanical', 'digital'],
    endAction: true, endActionKind: 'bonus', removal: 'выйти из дыма + 2 раунда, бонусное действие «Отдышаться»',
  },
  scent: {
    id: 'scent', name: 'Запах крови', kind: 'debuff', turns: 3, icon: 'c',
    desc: 'Кровь манит хищников: звери и кринжгоны атакуют вас охотнее.',
    endOnHeal: true, immuneTags: ['mechanical', 'digital', 'plant'], removal: 'истекает, вода, лечение',
  },
  slick: {
    id: 'slick', name: 'Скольжение', kind: 'debuff', turns: 2, icon: '4',
    desc: 'Под ногами скользко: толчок отбрасывает на +1 клетку, лёгкий шанс упасть.',
    pushPlus: 1, removal: 'истекает',
  },
};

// ---------------------------------------------------------------------------
// Таблицы «каста без ЭНР» (канон: rules/spellcasting.md, бросок 1d10).
// Движок кидает d20 и берёт строку roll = ceil(d20 / 2).
//
// Строка: { roll, name, desc, parts: [ { target, area?, filterTags?, filter?, effects } ], todo?, note? }
//   target — кому применяются effects:
//     'caster'        — сам кастер;
//     'spellTarget'   — цель заклинания, которое вызвало бросок;
//     'casterAllies'  — союзники кастера (без него самого);
//     'casterEnemies' — противники кастера;
//     'all'           — все существа на поле (включая кастера);
//     'randomUnit'    — одно случайное существо на поле.
//   area       — { shape: 'radius', size: N, center: 'caster' | 'spellTarget' }; нет area — всё поле.
//   filterTags — оставить только существ с одним из тегов.
//   filter     — { ranged: true } — только тех, у кого оружие с range > 1.
//   parts: [] — ничего не происходит.
// ---------------------------------------------------------------------------

export const VEIL_TABLE = [
  {
    roll: 1, name: 'Скрилеты-марионетки',
    desc: 'Из завесы вываливается бездушный скрилет и атакует всех подряд.',
    parts: [{ target: 'caster', effects: [{ op: 'summon', unit: 'skrilet', turns: 2, side: 'hostileToAll' }] }],
    todo: 'summon с side: "hostileToAll" — призыв, враждебный всем (сейчас summon всегда союзный). Канон: 1d4 скрилета, в Лайт — 1.',
  },
  {
    roll: 2, name: 'Голоса из ниоткуда',
    desc: 'Случайное существо слышит шёпот Судьи: 1d4 пси-урона по МРЛ, но +1 к атаке на 2 хода.',
    parts: [{ target: 'randomUnit', effects: [
      { op: 'damage', dice: '1d4', dmgType: 'psychic' },
      { op: 'buff', stat: 'hit', value: 1, turns: 2 },
    ] }],
  },
  {
    roll: 3, name: 'Искажение реальности',
    desc: 'Техника в радиусе 20 м сходит с ума: машины и гибриды получают 1d6 электро и дизбаланс на 1 ход.',
    parts: [{ target: 'all', area: { shape: 'radius', size: 13, center: 'caster' }, filterTags: ['mechanical', 'hybrid'], effects: [
      { op: 'damage', dice: '1d6', dmgType: 'electric' },
      { op: 'status', id: 'dazed', turns: 1 },
    ] }],
  },
  {
    roll: 4, name: 'Похищение души',
    desc: 'Цель теряет 1d6 ЗДР, а противники кастера получают +2 СИЛ на 3 хода.',
    parts: [
      { target: 'spellTarget', effects: [{ op: 'damage', dice: '1d6', dmgType: 'cyber' }] },
      { target: 'casterEnemies', effects: [{ op: 'buff', stat: 'str', value: 2, turns: 3 }] },
    ],
    note: 'Канон: «культист получает +2 к силе» — в Лайт бонус получают противники кастера.',
  },
  {
    roll: 5, name: 'Тень Судьи',
    desc: 'Над полем повисает призрачный глаз: противники кастера получают +1 к атаке на 3 хода.',
    parts: [{ target: 'casterEnemies', effects: [{ op: 'buff', stat: 'hit', value: 1, turns: 3 }] }],
  },
  {
    roll: 6, name: 'Обратная связь',
    desc: 'Проклятый код бьёт по кастеру: 1d6 кибер-урона.',
    parts: [{ target: 'caster', effects: [{ op: 'damage', dice: '1d6', dmgType: 'cyber' }] }],
  },
  {
    roll: 7, name: 'Временный разрыв',
    desc: 'Все существа телепортируются на 1–2 клетки в случайную сторону.',
    parts: [{ target: 'all', effects: [{ op: 'move', tiles: 2, mode: 'teleport', random: true }] }],
    todo: 'move сейчас двигает только кастера и в выбранную клетку. Нужен move для любой цели со случайной свободной клеткой (канон 1d4 м → до 2 клеток).',
  },
  {
    roll: 8, name: 'Кибер-чума',
    desc: 'Машины и гибриды в радиусе 4 клеток от цели: 1d4 электро и коррозия на 3 хода.',
    parts: [{ target: 'all', area: { shape: 'radius', size: 4, center: 'spellTarget' }, filterTags: ['mechanical', 'hybrid'], effects: [
      { op: 'damage', dice: '1d4', dmgType: 'electric' },
      { op: 'status', id: 'corrosion', turns: 3 },
    ] }],
    note: 'Канон: вирус 1d4 урона/ход. Отдельного статуса «вирус» нет — заменено разовым уроном и коррозией.',
  },
  {
    roll: 9, name: 'Стабилизация',
    desc: 'Завеса закрывается без последствий.',
    parts: [],
  },
  {
    roll: 10, name: 'Прорыв',
    desc: 'Судья проявляет интерес: цель получает ещё 2d6 кибер-урона, кастер проклят на 2 хода, противники кастера +1 к атаке на 3 хода.',
    parts: [
      { target: 'spellTarget', effects: [{ op: 'damage', dice: '2d6', dmgType: 'cyber' }] },
      { target: 'caster', effects: [{ op: 'status', id: 'curse', turns: 2 }] },
      { target: 'casterEnemies', effects: [{ op: 'buff', stat: 'hit', value: 1, turns: 3 }] },
    ],
    note: 'Канон: «все эффекты удваиваются». Без операции повтора — заменено удвоенным ударом по цели и платой кастера.',
  },
];

export const PROXY_STORM_TABLE = [
  {
    roll: 1, name: 'Техно-откат',
    desc: 'Всё высокотехнологичное оружие теряет заряд: стрелки разоружены на 1 ход.',
    parts: [{ target: 'all', filter: { ranged: true }, effects: [{ op: 'status', id: 'disarm', turns: 1 }] }],
  },
  {
    roll: 2, name: 'Оживление механизмов',
    desc: 'Хлам на поле оживает: появляется дрон, враждебный всем, на 3 хода.',
    parts: [{ target: 'caster', effects: [{ op: 'summon', unit: 'drone', turns: 3, side: 'hostileToAll' }] }],
    todo: 'summon с side: "hostileToAll" (как в VEIL_TABLE[0]).',
  },
  {
    roll: 3, name: 'Прокси-шок',
    desc: 'Живые получают +2 к атаке, машины −2, на 3 хода.',
    parts: [
      { target: 'all', filterTags: ['organic'], effects: [{ op: 'buff', stat: 'hit', value: 2, turns: 3 }] },
      { target: 'all', filterTags: ['mechanical'], effects: [{ op: 'buff', stat: 'hit', value: -2, turns: 3 }] },
    ],
  },
  {
    roll: 4, name: 'Голос Старого бога',
    desc: 'Кастер слышит команду: +3 к урону на 2 хода.',
    parts: [{ target: 'caster', effects: [{ op: 'buff', stat: 'dmg', value: 3, turns: 2 }] }],
    note: 'Канон: +1d6 к следующему заклинанию. Операции «к следующему касту» нет — заменено +3 урона (среднее 1d6) на 2 хода.',
  },
  {
    roll: 5, name: 'Зона отчуждения',
    desc: 'В радиусе 7 клеток от кастера технологии глохнут: немота на 2 хода всем, включая кастера.',
    parts: [{ target: 'all', area: { shape: 'radius', size: 7, center: 'caster' }, effects: [{ op: 'status', id: 'silence', turns: 2 }] }],
  },
  {
    roll: 6, name: 'Ржавчина',
    desc: 'Металл теряет прочность: все получают −1 к урону и −1 КБ на 3 хода.',
    parts: [{ target: 'all', effects: [
      { op: 'buff', stat: 'dmg', value: -1, turns: 3 },
      { op: 'buff', stat: 'kb', value: -1, turns: 3 },
    ] }],
  },
  {
    roll: 7, name: 'Благословение',
    desc: 'Оружие кастера получает +2 к урону до конца боя.',
    parts: [{ target: 'caster', effects: [{ op: 'buff', stat: 'dmg', value: 2, turns: 99 }] }],
  },
  {
    roll: 8, name: 'Каменный век',
    desc: 'Вся электроника отключается: машины оглушены на 1 ход.',
    parts: [{ target: 'all', filterTags: ['mechanical'], effects: [{ op: 'status', id: 'stun', turns: 1 }] }],
  },
  {
    roll: 9, name: 'Чистое небо',
    desc: 'Буря рассеивается без последствий.',
    parts: [],
  },
  {
    roll: 10, name: 'Пробуждение',
    desc: 'Где-то в мире активируется древний артефакт. В бою ничего не происходит.',
    parts: [],
    note: 'Канон: квестовый хук. Сюжетный флаг artifactAwakened — вне рамок v1.',
  },
];
