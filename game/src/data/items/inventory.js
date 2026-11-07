// Инвентарь-сетка v7 (docs/specs/inventory-mods.md §1–§2, §3.1, §3.2): размеры предметов, карманы, рюкзаки, схрон,
// разгрузка (быстрые слоты), слоты модов по типу/качеству. Логика — game/src/world/inventory.js.

export const INVENTORY = {
  pockets: [6, 4], // без рюкзака
  stash: [10, 12], // общий схрон (только в хабах/лагерях/бункерах)
  ground: [10, 6], // «На земле» — не влезшая добыча, пока открыт экран снаряжения
  stashKinds: ['hub', 'town', 'camp', 'bunker'], // LOCATIONS[].kind, где есть схрон; плюс любой узел с услугой rest
  // разгрузка: без брони/ткань — 2, лёгкая/средняя — 4, тяжёлая/мех — 3; поле `quick` у брони (жилет) переопределяет
  quick: { base: 2, byArmor: { cloth: 2, light: 4, medium: 4, heavy: 3, mech: 3 }, max: 6 },
  quickCats: ['consumable'], // + патроны (`kind: 'ammo'`), гранаты и ловушки — это consumable
  stackDefault: { consumable: 3, misc: 10 }, // нет поля `stack`: расходники 3, детали/еда/квестовое 10, снаряжение 1
  // слоты модов по группе оружия / броне (§3.1); у уникальных предметов — их собственный `slots`
  modSlots: {
    ranged: ['optic', 'muzzle', 'mag', 'grip'],
    melee: ['edge', 'grip'],
    special: ['optic', 'core', 'grip'],
    armor: ['plate', 'lining', 'sole'],
  },
  // сколько модов вмещает предмет по качеству; реликт — длина его `slots`; тяжёлая броня и мех +1
  modCount: { junk: 1, working: 2, masterwork: 3 },
  heavyExtraMod: ['heavy', 'mech'],
  modBreakChance: 0.25, // провал установки мода с `req`: шанс сломать мод
  // размеры [w, h] по типу оружия (§1)
  weaponSize: {
    knife: [1, 2], fist: [1, 2], throw: [1, 2],
    pistol: [2, 1], smg: [2, 1],
    sabre: [1, 3], sword: [1, 3], katana: [1, 3], axe: [1, 3], hammer: [1, 3], cyberblade: [1, 3],
    polearm: [1, 4], twoHanded: [1, 4], bastard: [1, 4],
    rifle: [4, 1], auto: [4, 1], crossbow: [4, 1], bow: [4, 1], energy: [4, 1], plasma: [4, 1], laser: [4, 1], bolter: [3, 1],
    melta: [4, 2], launcher: [4, 2], mg: [4, 2],
    proxy: [2, 2], cringe: [2, 1],
  },
  armorSize: { cloth: [2, 2], light: [2, 3], medium: [3, 3], heavy: [3, 4], mech: [4, 5] },
  modSize: { low: [1, 1], high: [1, 2], highTier: 4 },
  kindSize: { trap: [2, 1] }, // расходник по `kind`; остальное 1×1
};

// Рюкзаки (слот снаряжения «Рюкзак») и жилет-разгрузка (броня-ткань с quick: 4).
const pack = (o) => ({ cat: 'pack', slot: 'pack', price: 0, tier: 1, factions: [], desc: '', ...o });
const LIST = [
  pack({ id: 'avoska', name: 'Авоська', grid: [6, 5], size: [2, 2], tier: 1, price: 20, factions: ['neutralVillages', 'scavengers'],
    desc: 'Сетка 6×5. Сквозь дырки видно, что у тебя кончились пайки.' }),
  pack({ id: 'army-duffel', name: 'Армейский вещмешок', grid: [7, 6], size: [2, 3], tier: 2, price: 90, factions: ['warprom', 'renegades'],
    desc: 'Сетка 7×6. Брезент, лямки, инвентарный номер.' }),
  pack({ id: 'tourist-frame', name: 'Туристический станковый рюкзак', grid: [8, 7], size: [3, 3], tier: 3, price: 220, factions: ['scavengers', 'neutralVillages'],
    desc: 'Сетка 8×7. Довоенный, с рамой: влезает пол-лавки.' }),
  pack({ id: 'lis-pack', name: 'Тактический рюкзак «Лис»', grid: [9, 8], quick: 1, size: [2, 3], tier: 5, price: 0, quality: 'relic', unique: true,
    desc: 'Сетка 9×8 и +1 быстрый слот. Рыжие стропы проекта «Лис». В продаже не бывает.' }),
  { id: 'rig-vest', name: 'Жилет-разгрузка', cat: 'armor', slot: 'armor', type: 'cloth', atype: 'cloth', kb: 0, quick: 4, size: [2, 2],
    stealthDis: false, resist: {}, req: {}, speed: 0, noise: 0, grants: [], passives: [], slots: ['lining'], quality: 'working',
    tier: 1, price: 40, factions: ['warprom', 'scavengers', 'renegades'], desc: '4 быстрых слота без брони. Карманы на всём, даже на карманах.' },
];

export const PACKS = Object.fromEntries(LIST.map((it) => [it.id, it]));
