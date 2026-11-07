// Регионы мира v3 = территории 14 фракций канон-карты + дикие земли + анклав Альфа-Гармонии.
// Спека: docs/specs/world.md, п. 1. id региона = id фракции из factions.js (кроме harmony и wilds).
// continent: 'west' (Западный свет) | 'east' (Восточный свет) | 'north' (Ледяной остров) — канон: «западный / восточный свет»
// (lore/faction-stances.md). Свет связаны пиратским перешейком на севере (Великий тракт) и морем.
// danger 0–5 — опасность узлов региона по умолчанию; levels — [мин, макс] уровни героя (= уровни врагов региона) по шкале v4 «Мир 6–20»
// (docs/specs/levels-20.md): хаб и ближние земли 1–4, второй круг 5–9, дальние столицы 10–16 (Акт II), Путинляндия и Сокральня 15–20 (Акт III);
// act 1–3 — акт кампании. Бои региона: ENCOUNTER_TABLES (travel.js) и battles узлов (battles-v4.js), все с полем level у боя (enemies-v4.js).

const R = (o) => ({ hazard: null, minorFaction: null, wave: '3', canon: ['docs/canon/map/MAP.md'], ...o });

export const REGIONS = {
  harmony: R({ id: 'harmony', name: 'Альфа-Гармония', faction: null, minorFaction: 'technikums', continent: 'east',
    danger: 0, levels: [1, 2], act: 1, mapColor: 'teal',
    desc: 'Летающая платформа, зависшая над утёсом на южном мысу пиратских земель. Формально — совет техников, фактически — пираты.' }),
  neutralVillages: R({ id: 'neutralVillages', name: 'Нейтральные селения', faction: 'neutralVillages', continent: 'west',
    danger: 1, levels: [1, 3], act: 1, hazard: 'cringe', mapColor: 'green',
    desc: 'Юг западного света: «все — если не агрессивны». На восточной границе высадились кринж-маяки.' }),
  tinBrotherhood: R({ id: 'tinBrotherhood', name: 'Жестяное братство', faction: 'tinBrotherhood', continent: 'west',
    danger: 1, levels: [2, 4], act: 1, mapColor: 'mauve',
    desc: 'Сердце западного света: Славотеч, Арена, Жестяное озеро. Честь, дисциплина, аналоговые технологии.' }),
  mutantsBeast: R({ id: 'mutantsBeast', name: 'Мутанты-Ж', faction: 'mutantsBeast', continent: 'west',
    danger: 2, levels: [4, 6], act: 1, mapColor: 'brown',
    desc: 'Чащи и болота к югу от братства, плюс анклав Шерянка за морем. Живут в свой кайф, чужих не любят.' }),
  scavengers: R({ id: 'scavengers', name: 'Мусорщики', faction: 'scavengers', continent: 'west',
    danger: 2, levels: [4, 7], act: 1, mapColor: 'rust',
    desc: 'Свалки на западном конце перешейка. Вассалы пиратов; скелетов считают добычей.' }),
  tekhonki: R({ id: 'tekhonki', name: 'Техоньки', faction: 'tekhonki', continent: 'west',
    danger: 3, levels: [6, 9], act: 1, hazard: 'proxyStorm', mapColor: 'black',
    desc: 'Запад западного света: Завод, Станок, Смотрельце. Прокси-бури и Старый бог.' }),
  mechanids: R({ id: 'mechanids', name: 'Механиды', faction: 'mechanids', continent: 'west',
    danger: 4, levels: [7, 9], act: 1, hazard: 'proxyStorm', mapColor: 'olive',
    desc: 'Северо-запад: Бетонка и цеха коллективного разума, Семя чумы металла. Органика — угроза.' }),
  pirates: R({ id: 'pirates', name: 'Пираты', faction: 'pirates', continent: 'east',
    danger: 2, levels: [2, 4], act: 1, mapColor: 'slate',
    desc: 'Северный перешеек между светами и моря вокруг. «Любое перемещение — с их ведома, на земле и в море».' }),
  agrozone: R({ id: 'agrozone', name: 'Агрозона', faction: 'agrozone', continent: 'east',
    danger: 2, levels: [5, 8], act: 1, hazard: 'fire', mapColor: 'orange',
    desc: 'Житница АИ Партии в огне: Гидропоника лоялистов, лагерь восставших Марты, горящие поля.' }),
  mutantsPlant: R({ id: 'mutantsPlant', name: 'Мутанты-Р', faction: 'mutantsPlant', continent: 'east',
    danger: 2, levels: [5, 8], act: 1, mapColor: 'moss',
    desc: 'Портовая Гармония и священная роща на западном берегу восточного света. Граница с ксенофобной АИ.' }),
  cult: R({ id: 'cult', name: 'Культ Судьи', faction: 'cult', continent: 'east',
    danger: 4, levels: [16, 20], act: 3, mapColor: 'violet',
    desc: 'Сокральня, склад «Вооружение» и разлом в Киберспейс. Отсюда начинается «Третий исход».' }),
  renegades: R({ id: 'renegades', name: 'Отступники', faction: 'renegades', continent: 'east',
    danger: 3, levels: [10, 12], act: 2, mapColor: 'darkgreen',
    desc: 'Руины запада восточного света: Штабцентр, таверна «Марта», бункер Куксиуса, обломки Небесного базара.' }),
  aiParty: R({ id: 'aiParty', name: 'АИ Партия', faction: 'aiParty', continent: 'east',
    danger: 4, levels: [15, 19], act: 3, mapColor: 'gray',
    desc: 'Путинляндия на 20 000 душ: внешнее кольцо — Коррупция-Сити, внутренний город закрыт для простых смертных.' }),
  warprom: R({ id: 'warprom', name: 'Военпром', faction: 'warprom', continent: 'east',
    danger: 5, levels: [11, 14], act: 2, mapColor: 'red',
    desc: 'Кремль и его коридоры: плацдарм андроидов. Нет места предателям и слабым.' }),
  cringegons: R({ id: 'cringegons', name: 'Кринжгоны', faction: 'cringegons', continent: 'east',
    danger: 5, levels: [12, 16], act: 2, hazard: 'cringe', mapColor: 'ash',
    desc: 'Северо-восток: Пепельное Горнило, Выжигатель Вайба. Внутри — База Предложки, забытое войско.' }),
  wilds: R({ id: 'wilds', name: 'Дикие земли', faction: null, continent: 'north',
    danger: 3, levels: [10, 13], act: 2, mapColor: 'white',
    desc: 'Ничьи земли: ледники севера, Ледяной остров с рингом и некрополем, пролив чудищ.' }),
};

/** Старые id регионов v1.0 → новые (для квестов и сохранений). */
export const REGION_ALIASES = { villages: 'neutralVillages', corruption: 'aiParty' };
for (const [old, id] of Object.entries(REGION_ALIASES)) REGIONS[old] = { ...REGIONS[id], id: old, aliasOf: id, alias: true };

/** Регионы следующих волн — в v3 все регионы открыты. Оставлено для совместимости. */
export const FUTURE_REGIONS = {};
