// Таблицы лута v3. Спека — docs/specs/items.md («Лут»).
// Предметы world/locations.js ITEMS (servo-parts, rare-parts, soul-shard) тоже используются как лут.
// Таблица: { id, name, rolls, credits: [min, max], quality: { junk, working, masterwork } (веса), entries: [{ item, w, n? }] }
//   rolls — сколько раз тянуть из entries (взвешенно, с возвратом); n — штук за выпадение (по умолчанию 1).
//   Качество применяется только к оружию и броне. Реликты в обычные таблицы не входят — только в `boss-*`.
// Ключи по фракциям совпадают с id из factions.js; по местам — с типом POI / slug из world/canon-map.js.
// Враг: `loot: 'table-id'` — таблица при победе; `gear` — экипировка, падает с шансом GEAR_DROP по качеству.

export const GEAR_DROP = { junk: 0.5, working: 0.3, masterwork: 0.15, relic: 1 };

const Q_LOW = { junk: 6, working: 4, masterwork: 0 };
const Q_MID = { junk: 3, working: 6, masterwork: 1 };
const Q_HIGH = { junk: 1, working: 6, masterwork: 3 };

const t = (id, name, rolls, credits, quality, entries) => ({ id, name, rolls, credits, quality, entries });
const e = (item, w, n = 1) => ({ item, w, n });

const LIST = [
  // ---------------------------------------------------------------- Фракции (14)
  t('pirates', 'Пиратская добыча', 2, [10, 40], Q_MID, [
    e('boarding-saber', 3), e('boat-hook', 2), e('makarych', 2), e('kedrach', 1), e('energy-pistol', 1), e('codeine-syrup', 3),
    e('holo-decoy', 2), e('cringe-grenade', 1), e('tushenka', 4, 2), e('medkit', 3), e('party-cell', 1), e('forsazh-stim', 2), e('hollow-mag', 2), e('wet-suit', 1), e('swamp-boots', 1), e('hooked-edge', 1), e('side-pistol', 1)]),
  t('warprom', 'Списанное Военпрома', 2, [15, 45], Q_HIGH, [
    e('bayonet', 3), e('makarych', 3), e('av15', 1), e('sniper-rifle', 1), e('frag-grenade', 3), e('army-medkit', 2),
    e('smoke-grenade', 3), e('plate-rig', 1), e('compensator', 1), e('tishina-syringe', 1), e('adrenaline-stim', 1), e('ap-mag', 1), e('tracer-mag', 2), e('gas-filter', 1), e('reactive-plate', 1), e('riot-shield', 1)]),
  t('aiParty', 'Склад Партии', 2, [20, 50], Q_HIGH, [
    e('shock-baton', 3), e('shock-glove', 2), e('shock-rifle', 1), e('laser-pistol', 1), e('party-cell', 3), e('party-phenazepam', 2),
    e('calmers', 3), e('flashbang', 2), e('portable-barricade', 2), e('concealed-vest', 1), e('megaphone', 1), e('otlichnik-nootrop', 2), e('rubber-mag', 2), e('shock-edge', 1), e('holo-reticle', 1), e('insulator-lining', 1), e('riot-shield', 1)]),
  t('tinBrotherhood', 'Арсенал Братства', 2, [10, 35], Q_HIGH, [
    e('tin-katana', 1), e('tin-warhammer', 1), e('spring-bastard', 2), e('mosin', 2), e('spring-crossbow', 2), e('saw-stars', 3, 3),
    e('nagan-revolver', 2), e('felt-soles', 2), e('foil-lining', 1), e('emp-grenade', 2), e('medkit', 3), e('bandage', 3, 2), e('tower-shield', 1), e('grip-spikes', 1), e('quilted-lining', 2), e('trench-knife', 1)]),
  t('renegades', 'Трофеи Отступников', 2, [5, 30], Q_MID, [
    e('rusty-ak', 2), e('sawed-off', 3), e('rebar-spear', 2), e('molotov', 4, 2), e('grenade', 3), e('tripwire', 2),
    e('smoke-grenade', 2), e('bottle-silencer', 2), e('quilted-jacket', 2), e('medkit', 3), e('bodry-ilyich', 3), e('incendiary-mag', 1), e('oil-mag', 2), e('fire-blanket', 1), e('spiked-plates', 1)]),
  t('mechanids', 'Детали механидов', 2, [10, 35], Q_MID, [
    e('hydro-fist', 1), e('nailgun', 3), e('conveyor-mg', 1), e('repair-kit', 4, 2), e('krona-battery', 3, 2), e('drone-reactor', 1),
    e('shock-mat', 2), e('magnet-anchors', 1), e('scrap-plates', 2), e('folded-drone', 1), e('servo-parts', 2), e('mech-bolt', 2), e('shock-edge', 1), e('acid-coat', 1), e('oiled-edge', 2)]),
  t('cringegons', 'Кринж-трофеи', 2, [5, 30], Q_LOW, [
    e('spoons', 3), e('megaphone', 2), e('battle-bayan', 1), e('electro-balalaika', 1), e('cringe-grenade', 4), e('host-jacket', 1),
    e('valerian', 3, 2), e('calmers', 3), e('anti-cringe-earplugs', 2), e('cringe-amp', 1), e('laser-pointer', 2)]),
  t('scavengers', 'Хлам со свалок', 3, [2, 20], Q_LOW, [
    e('shiv', 4), e('armatura', 3), e('pipe-smg', 2), e('rebar-crossbow', 2), e('wire-bolas', 2), e('tire-vest', 1), e('sign-plate', 1),
    e('scrap-magnet', 1), e('electrical-tape', 3), e('krona-battery', 3), e('analgin', 3), e('tushenka', 3, 2), e('servo-parts', 1), e('weighted-edge', 2), e('tire-patch', 2), e('door-shield', 2), e('sprint-spikes', 1), e('oiled-edge', 2)]),
  t('tekhonki', 'Прокси-кустарщина', 2, [5, 30], Q_MID, [
    e('proxy-sling', 3), e('proxy-wrench', 2), e('blessed-wrench', 2), e('proxy-can', 3), e('wire-mantle', 1), e('proxy-sharpening', 1),
    e('blessed-nut', 3), e('rubber-lining', 1), e('krona-battery', 4, 2), e('repair-kit', 2), e('proxy-lens', 1), e('proxy-resonator', 1), e('faraday-cage', 1), e('thermal-edge', 1)]),
  t('neutralVillages', 'Деревенский сундук', 2, [3, 20], Q_LOW, [
    e('hatchet', 3), e('pitchfork', 3), e('hunting-carbine', 1), e('pump-shotgun', 1), e('ski-bow', 1), e('bear-trap', 2),
    e('bandage', 4, 2), e('valerian', 3), e('pelmeni', 3, 2), e('tushenka', 3, 2), e('medkit', 2), e('wrapped-grip', 3), e('buckler-lid', 2), e('quilted-lining', 2), e('pocket-lining', 2), e('poison-edge', 1)]),
  t('agrozone', 'Кладовая Агрозоны', 2, [3, 25], Q_LOW, [
    e('sickle', 3), e('pitchfork', 3), e('potato-cannon', 2), e('shock-glove', 1), e('hazmat-suit', 1), e('molotov', 3),
    e('antidote', 2), e('calmers', 2), e('tushenka', 3, 2), e('acid-mag', 1), e('acid-edge', 1), e('gas-filter', 1)]),
  t('mutantsPlant', 'Дары корней', 2, [0, 10], Q_MID, [
    e('thorn-bow', 1), e('sickle', 2), e('bark-weave', 1), e('antidote', 4), e('valerian', 4, 2), e('hazmat-suit', 1), e('bandage', 3, 2)]),
  t('cult', 'Реквизит Культа', 2, [10, 40], Q_MID, [
    e('ritual-blade', 3), e('shock-baton', 3), e('cyber-blade', 1), e('cult-robe', 2), e('mesh-cloak', 1), e('black-morphine', 1),
    e('molotov', 2), e('grenade', 2), e('calmers', 2), e('soul-shard', 1)]),
  t('mutantsBeast', 'Логово стаи', 2, [0, 15], Q_LOW, [
    e('heavy-cleaver', 2), e('machete', 3), e('lumber-greataxe', 1), e('ski-bow', 2), e('mutant-hide', 1), e('bear-trap', 3),
    e('bear-blood', 1), e('serrated-edge', 2), e('tushenka', 2, 2), e('mutant-tooth', 3), e('poison-edge', 1), e('quiet-soles', 1)]),

  // ---------------------------------------------------------------- Типы мест (POI канон-карты)
  t('dungeons', 'Довоенный бункер', 3, [20, 60], Q_HIGH, [
    e('makarych', 2), e('kedrach', 1), e('army-medkit', 2), e('party-cell', 2), e('frag-grenade', 2), e('concealed-vest', 1),
    e('ceramic-insert', 1), e('pso-scope', 1), e('folded-drone', 1), e('tushenka', 4, 3), e('rare-parts', 1), e('thermal-scope', 1), e('kevlar-sheet', 1), e('tac-flashlight', 1)]),
  t('lis-vault', 'Хранилище проекта «Лис»', 3, [40, 90], Q_HIGH, [
    e('lis-pack', 1), // v7: рюкзак «Лис» (реликт, уникальный)
    e('lis-3-twin', 2), e('lis-4-sniffer', 2), e('lis-6-core', 1), e('lis-7-chuyo', 1), e('lis-8-hide', 1), e('army-medkit', 3), e('rare-parts', 3), e('servo-parts', 3), e('cryo-nozzle', 1), e('cryo-edge', 1), e('arc-capacitor', 1), e('hover-pads', 1)]),
  t('wolf-pack', 'Трофеи стаи «Волк»', 2, [20, 60], Q_HIGH, [
    e('wolf-fang', 3), e('wolf-link', 2), e('frag-grenade', 2), e('army-medkit', 2), e('smoke-grenade', 2), e('servo-parts', 3), e('rare-parts', 1)]),
  t('ruins', 'Руины', 2, [5, 30], Q_LOW, [
    e('fire-axe', 2), e('samopal-pistol', 2), e('loupe-sight', 2), e('analgin', 3), e('krona-battery', 3), e('servo-parts', 2), e('tushenka', 3, 2)]),
  t('necropolises', 'Некрополь', 2, [10, 40], Q_MID, [
    e('ritual-blade', 2), e('blessed-nut', 3), e('foil-lining', 1), e('calmers', 3), e('valerian', 3), e('soul-shard', 2), e('black-morphine', 1)]),
  t('battlefields', 'Поле битвы', 3, [5, 30], Q_LOW, [
    e('rusty-ak', 2), e('mosin', 2), e('bayonet', 3), e('frag-grenade', 2), e('grenade', 3), e('steel-sheet-plate', 1), e('rusty-plate', 1),
    e('medkit', 2), e('bandage', 3, 2)]),
  t('pirate-waters', 'Пиратский тайник', 2, [30, 80], Q_MID, [
    e('drum-launcher', 1), e('captain-coat', 1), e('laser-pistol', 1), e('energy-pistol', 2), e('codeine-syrup', 3), e('party-cell', 2), e('holo-decoy', 2)]),
  t('brigands', 'Схрон банды', 2, [10, 40], Q_LOW, [
    e('sawed-off', 3), e('pipe-smg', 2), e('rusty-ak', 1), e('brass-knuckles', 3), e('molotov', 3), e('forsazh-stim', 2), e('codeine-syrup', 2), e('medkit', 2)]),
  t('monsters', 'Брюхо чудовища', 2, [0, 30], Q_LOW, [
    e('servo-parts', 2), e('rare-parts', 1), e('bear-blood', 2), e('antidote', 2), e('serrated-edge', 1), e('bandage', 2, 2)]),
  t('cyberspace', 'Обломки Киберспейса', 2, [0, 0], Q_MID, [
    e('soul-shard', 4), e('foil-lining', 1), e('blessed-nut', 2), e('krona-battery', 2), e('calmers', 3)]),

  // ---------------------------------------------------------------- Боссы (реликты — гарантированно, entries с w 0 не тянутся)
  t('boss-great-mech', 'Обломки Великого Меха', 3, [100, 200], Q_HIGH, [e('servo-parts', 3, 2), e('rare-parts', 3, 2), e('drone-reactor', 2), e('scrap-plates', 1)]),
  t('boss-plague-seed', 'Сердце Семени Чумы', 2, [50, 120], Q_HIGH, [e('antidote', 3, 2), e('hazmat-suit', 1), e('rubber-lining', 1), e('repair-kit', 2, 2)]),
  t('boss-vibe-burner', 'Пепел Выжигателя Вайба', 2, [50, 120], Q_HIGH, [e('anti-cringe-earplugs', 3, 2), e('calmers', 3, 2), e('host-jacket', 1), e('electro-balalaika', 1)]),
  t('boss-ice-ring', 'Призовой фонд Ледяного ринга', 2, [100, 250], Q_HIGH, [e('forsazh-stim', 3), e('bear-blood', 2), e('tishina-syringe', 2), e('brass-knuckles', 1)]),
  t('boss-monster', 'Сокровище логова', 3, [60, 150], Q_HIGH, [e('rare-parts', 3), e('servo-parts', 3), e('bear-blood', 2), e('army-medkit', 2)]),
  t('boss-band', 'Общак банды', 3, [80, 160], Q_HIGH, [e('kedrach', 2), e('tishina-smg', 1), e('drum-mag', 1), e('adrenaline-stim', 2), e('codeine-syrup', 3)]),
];

export const LOOT_TABLES = Object.fromEntries(LIST.map((x) => [x.id, x]));

// Гарантированные реликты боссов (выдаются в дополнение к таблице): enemyId → itemId.
export const BOSS_RELICS = {
  'boss-great-mech': 'great-mech-fist',
  'boss-ice-champion': 'ice-ring-gloves',
  'boss-plague-seed': 'plague-seed-jar',
  'boss-vibe-burner': 'vibe-burner-core',
  'boss-sputnik-guardian': 'sputnik-laser',
  'boss-tin-renegade': 'anvil-katana',
  'cult-judge-hand': 'judge-gavel',
};

// Реликты-амулеты (слот trinket; пассивки работают, пока в инвентаре — как ITEMS.passives в world/locations.js).
export const TRINKETS = {
  'plague-seed-jar': { id: 'plague-seed-jar', name: 'Семя Чумы в свинцовой банке', cat: 'trinket', quality: 'relic', unique: true, price: 0,
    passives: [{ id: 'item-plague-jar', name: 'Привитый чумой', desc: 'Сопротивление яду, иммунитет к отравлению.', op: { resist: { toxin: 'resist' } } },
      { id: 'item-plague-jar-2', name: 'Привитый чумой', desc: '', op: { immuneStatus: ['poison'] } }],
    desc: 'Чума металла, запаянная в свинец. Механиды хотят её уничтожить, Культ — вернуть.' },
  'vibe-burner-core': { id: 'vibe-burner-core', name: 'Сердечник Выжигателя Вайба', cat: 'trinket', quality: 'relic', unique: true, price: 0,
    passives: [{ id: 'item-vibe-core', name: 'Вайб выжжен', desc: 'Сопротивление кринжу, иммунитет к кринж-эффекту.', op: { resist: { cringe: 'resist' } } },
      { id: 'item-vibe-core-2', name: 'Вайб выжжен', desc: '', op: { immuneStatus: ['cringed'] } }],
    desc: 'Тому, кто его носит, уже ничего не стыдно. Совсем ничего.' },
  'harmony-core': { id: 'harmony-core', name: 'Сердце Альфа-Гармонии', cat: 'trinket', quality: 'relic', unique: true, price: 0,
    passives: [{ id: 'item-harmony-core', name: 'Парящий заряд', desc: '1d2 ЭНР в начале каждого хода.', op: { regen: { dice: '1d2', resource: 'enr', every: 'turn' } } }],
    desc: 'Осколок движка платформы, что зависла у утёса. Всё ещё пытается лететь.' },
  'lox-badge': { id: 'lox-badge', name: 'Жетон агента Lox', cat: 'trinket', quality: 'relic', unique: true, price: 0,
    passives: [{ id: 'item-lox-badge', name: 'Агент под прикрытием', desc: 'Преимущество на Скрытность.', op: { advantage: ['stealth'] } }],
    desc: 'Номер стёрт. Клоны Lox узнают его и стреляют первыми.' },
  'cup-crown': { id: 'cup-crown', name: 'Корона из кубков', cat: 'trinket', quality: 'relic', unique: true, price: 0,
    passives: [{ id: 'item-cup-crown', name: 'Король на час', desc: '+2 ХАР.', op: { statBonus: { cha: 2 } } }],
    desc: 'Украденная корона Короля свалок. Кто носит — тот и король. Мусорщики так считают. Король — нет.', stigma: { scavengers: -20 } },
};
