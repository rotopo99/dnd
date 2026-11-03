// Регионы мира. Спека: docs/specs/world.md, п. 1 и 8. v1.0 — хаб и три дороги из сводки.
// Встречи на дорогах — travel.js (ENCOUNTER_TABLES[region]). Узлы — locations.js.

export const REGIONS = {
  harmony: {
    id: 'harmony', name: 'Альфа-Гармония', wave: '1.0',
    faction: null, minorFaction: 'tekhnikumy',
    danger: 0, levels: [1, 1], hazard: null,
    mapColor: 'teal',
    desc: 'Летающая платформа, зависшая у утёса. 5000+ беженцев; формально правит совет техников, фактически — пираты через поставки.',
    canon: ['lore/history.md', 'lore/timeline.md', 'canon/README.md п. 11'],
  },
  villages: {
    id: 'villages', name: 'Нейтральные селения', wave: '1.0',
    faction: 'neutralVillages', minorFaction: null,
    danger: 1, levels: [1, 2], hazard: 'cringe',
    mapColor: 'green',
    desc: 'Юг западного света, совет старейшин: «все — если не агрессивны». На границе горят кринж-маяки.',
    canon: ['lore/timeline.md', 'lore/faction-stances.md'],
  },
  agrozone: {
    id: 'agrozone', name: 'Агрозона', wave: '1.0',
    faction: 'agrozone', minorFaction: null,
    danger: 2, levels: [2, 3], hazard: 'fire',
    mapColor: 'orange',
    desc: 'Житница АИ Партии в огне: рабы Марты против Чистильщиков, 40% полей сгорело. Бург «Свобода» — у восставших, «Бетон» — у лоялистов.',
    canon: ['lore/timeline.md', 'lore/faction-stances.md', 'GDD: ответы человека по миру, п. 1'],
  },
  corruption: {
    id: 'corruption', name: 'Коррупция-Сити', wave: '1.0',
    faction: 'aiParty', minorFaction: null,
    danger: 3, levels: [3, 5], hazard: null,
    mapColor: 'purple',
    desc: 'Город АИ Партии (бунты подавлены в 2008), где из Киберспейса «материализуются» души. Главный узел сети ритуальных терминалов.',
    canon: ['lore/timeline.md'],
  },
};

/** Регионы следующих волн — только для подписи на карте (закрыты в v1.0). */
export const FUTURE_REGIONS = {
  lagoon: { id: 'lagoon', name: 'Ровная Лагуна', wave: '1.1', faction: 'pirates' },
  'tin-lands': { id: 'tin-lands', name: 'Земли Жестяного братства', wave: '1.1', faction: 'tinBrotherhood' },
  junkyards: { id: 'junkyards', name: 'Свалки Короля', wave: '1.1', faction: 'scavengers' },
  'tekhonki-wastes': { id: 'tekhonki-wastes', name: 'Пустоши прокси-бурь', wave: '1.2', faction: 'tekhonki' },
  'mutant-wilds': { id: 'mutant-wilds', name: 'Мутантские земли', wave: '1.2', faction: 'mutantsBeast' },
  khatab: { id: 'khatab', name: 'Хатаб-Сити', wave: '1.2', faction: 'renegades' },
  warprom: { id: 'warprom', name: 'Военпром', wave: '1.2', faction: 'warprom' },
  mechanids: { id: 'mechanids', name: 'Цеха механидов', wave: '1.2', faction: 'mechanids' },
  'ai-capital': { id: 'ai-capital', name: 'Столица АИ Партии', wave: 'closed', faction: 'aiParty' },
  'cringe-lands': { id: 'cringe-lands', name: 'Земли кринжгонов', wave: 'closed', faction: 'cringegons' },
};
