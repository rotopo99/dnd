// UI strings of content wave 1 (docs/specs/content-wave1.md §5): radio «Эфир», finds «Находка», codex «Тайны мира»,
// delayed news, quest timers, the accusation (evidence names). Merged into t() by text/index.js.

export const WAVE1_TEXT = {
  // radio window
  'radio.title': 'Эфир',
  'radio.button': '📻 Эфир',
  'radio.key': 'V',
  'radio.next': 'Следующая новость',
  'radio.off': 'Выключить',
  'radio.silence': 'Тишина в эфире. Шорох, щелчок и чей-то вежливый кашель.',
  'radio.fresh': 'новых: {n}',
  'radio.freshToast': '📻 В эфире новости о вас (V — слушать)',
  'radio.base': 'Радиоузел: сводка дня',
  'radio.tavern': 'Приёмник у стойки',
  'radio.hub': 'Приёмник у торговца',
  'radio.handset': 'Рация',
  // finds
  'find.title': 'Находка',
  'find.take': 'Забрать в кодекс',
  'find.toast': 'Находка: {title}',
  'find.secret': 'Тайна «{name}»: {n}/3',
  'find.solved': 'Тайна «{name}» раскрыта (3/3)',
  'find.kind.diary': 'Дневник', 'find.kind.order': 'Приказ', 'find.kind.graffiti': 'Надпись', 'find.kind.letter': 'Письмо',
  'find.kind.leaflet': 'Листовка', 'find.kind.terminal': 'Запись терминала', 'find.kind.note': 'Записка',
  'find.layer.1': 'Слой 1: знают все', 'find.layer.2': 'Слой 2: знают фракции', 'find.layer.3': 'Слой 3: не знает почти никто',
  // codex «Тайны мира»
  'secrets.progress': 'Раскрыто: {n}/3',
  'secrets.truth': 'Что за этим стоит',
  'secrets.found': 'Найдено',
  'secrets.missing': 'Не найдено записок: {n}',
  'secrets.invented': 'Домысел: в каноне этого нет.',
  'secrets.empty': 'Тайн пока нет. Читай записки, терминалы и стены.',
  // delayed consequences
  'news.toast': 'Пришли новости: {text}',
  'news.journal': 'Пришли новости ({name}): {text}',
  // quest timer
  'timer.left': 'Осталось {n} дн.',
  'timer.expired': 'Время вышло: {name}',
  'timer.enough': 'Хватит: вернуться с тем, что есть',
  // accusation
  'accuse.clues': 'Улики: {list}',
  'accuse.noClues': 'Улик пока нет.',
  'accuse.need': 'Нужны улики: {list}',
  'flag.w1-clue-mold': 'плесень в кружке Паруса',
  'flag.w1-clue-key': 'ключ от кладовки у Якоря',
  'flag.w1-clue-log': 'журнал камбуза',
  'flag.w1-clue-debt': 'долг Паруса за карты',
};
