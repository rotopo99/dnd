// Appearance data of the hero (look v2): option lists with Russian names, skin tones, colour ramps, outfits, presets,
// migration of the old look (v1) and constraints by gender / race. Pure data, no DOM; palette keys only (docs/STYLE.md).
//   migrateLook(look, race?)   -> full v2 look (same object when it already is full); old v1 gets defaults for the new fields
//   skinRamp(look) / hairRamp(look) / eyeKey(look)   -> palette keys used by the 3D head, the face atlas and the editor
//   randomLook(race, gender, rng, keep?) / PRESETS / OUTFITS / BODY / FACE_SLIDERS / RACE_LOCKS
import { PALETTE_KEYS } from '../assets/sprites.js';

export const DARKER = { c: 'd', a: '8', j: 'k', b: 'a', n: 'o', f: 'g', e: 'c', 4: '3', o: '1', h: 'i', 3: '2', 2: '1', 1: '0', 0: '0', 5: '4', 8: '7', 7: '6', 9: '8', l: 'k', m: 'l', g: '1', i: '1', k: '1', d: '6', p: 'm', 6: '1' };
export const LIGHTER = { c: 'e', a: 'b', j: 'h', n: 'p', f: 'h', e: 'a', 4: '5', 3: '4', 2: '3', 1: '2', 0: '1', 8: '9', 7: '8', 9: 'p', l: 'm', m: 'p', k: 'j', g: 'f', i: 'h', 6: '7', o: 'n', d: 'c' };
export const ramp3 = (k) => [DARKER[k] || '0', k, LIGHTER[k] || k];

// ---------------------------------------------------------------- race kinds
export const KIND = { human: 'human', skeleton: 'skeleton', android: 'android', 'mutant-beast': 'beast', 'mutant-plant': 'plant', tekhonok: 'tekhonok', cringegon: 'cringe', skrilet: 'beast' };
export const kindOf = (race) => KIND[race] || 'human';

// ---------------------------------------------------------------- skin tones: id -> ramp [shadow, base, light]
export const SKINS = [
  { id: 0, name: 'Светлая', r: ['8', '9', 'p'] }, { id: 1, name: 'Загар', r: ['7', '8', '9'] }, { id: 2, name: 'Смуглая', r: ['6', '7', '8'] },
  { id: 3, name: 'Тёмная', r: ['1', '6', '7'] }, { id: 4, name: 'Очень тёмная', r: ['1', '6', '6'] }, { id: 5, name: 'Бледная', r: ['3', 'p', '5'] },
  { id: 6, name: 'Оливковая', r: ['6', '8', 'm'] }, { id: 7, name: 'Румяная', r: ['8', '9', 'a'] },
  { id: 8, name: 'Мутант: зелёная', r: ['k', 'j', 'j'] }, { id: 9, name: 'Мутант: болотная', r: ['k', 'l', 'm'] },
  { id: 10, name: 'Бурый мех', r: ['6', '7', '8'] }, { id: 11, name: 'Рыжий мех', r: ['7', '8', 'e'] }, { id: 12, name: 'Серый мех', r: ['2', '3', '4'] },
  { id: 13, name: 'Синт: металл', r: ['2', '3', '4'] }, { id: 14, name: 'Синт: пластик', r: ['4', '5', '5'] }, { id: 15, name: 'Синт: чёрный металл', r: ['1', '2', '3'] },
  { id: 16, name: 'Кость', r: ['3', '4', '5'] }, { id: 17, name: 'Кринж-розовая', r: ['6', 'p', '5'] },
];
export const RACE_SKINS = {
  human: [0, 1, 2, 3, 4, 5, 6, 7], tekhonok: [0, 1, 2, 3, 5, 6, 7, 13], 'mutant-beast': [10, 11, 12, 2], skrilet: [10, 11, 12],
  'mutant-plant': [8, 9], cringegon: [5, 17, 7], skeleton: [16, 15], android: [13, 14, 15],
};
export const skinsOf = (race) => RACE_SKINS[race] || RACE_SKINS.human;
export const skinRamp = (look) => {
  const list = skinsOf(look?.race), id = list.includes(look?.skin | 0) ? look.skin | 0 : list[0];
  return SKINS.find((s) => s.id === id).r;
};

// ---------------------------------------------------------------- colours
export const HAIR_NAMED = [
  { id: 'black', name: 'Чёрный', r: ['0', '1', '2'] }, { id: 'brown', name: 'Каштан', r: ['6', '7', '8'] }, { id: 'ginger', name: 'Рыжий', r: ['7', '8', 'e'] },
  { id: 'blond', name: 'Блонд', r: ['8', 'a', 'b'] }, { id: 'grey', name: 'Седой', r: ['2', '3', '4'] }, { id: 'white', name: 'Белый', r: ['3', '4', '5'] },
  { id: 'green', name: 'Ядовито-зелёный', r: ['k', 'j', 'j'] }, { id: 'pink', name: 'Кринж-розовый', r: ['o', 'n', 'n'] }, { id: 'cyan', name: 'Кибер-циан', r: ['i', 'h', 'h'] },
  { id: 'red', name: 'Алый', r: ['d', 'c', 'e'] }, { id: 'blue', name: 'Синий', r: ['g', 'f', 'h'] }, { id: 'violet', name: 'Фиолетовый', r: ['1', 'o', 'n'] },
];
export const EYE_NAMED = [
  { id: 'brown', name: 'Карие', k: '8' }, { id: 'blue', name: 'Синие', k: 'f' }, { id: 'green', name: 'Зелёные', k: 'j' }, { id: 'grey', name: 'Серые', k: '4' },
  { id: 'amber', name: 'Янтарные', k: 'a' }, { id: 'red', name: 'Красные', k: 'c' }, { id: 'cyan', name: 'Циановые', k: 'h' }, { id: 'violet', name: 'Фиолетовые', k: 'o' },
];
const isKey = (k) => typeof k === 'string' && PALETTE_KEYS.includes(k);
/** 'p:<palette key>' — a custom colour from the whole palette. */
export const customKey = (id) => (typeof id === 'string' && id.startsWith('p:') && isKey(id.slice(2)) ? id.slice(2) : null);
export function hairRamp(look) {
  const id = look?.hairColor, ck = customKey(id);
  let r = ck ? ramp3(ck) : (HAIR_NAMED.find((h) => h.id === id) || HAIR_NAMED[1]).r;
  if (kindOf(look?.race) === 'plant') r = ['k', 'j', 'j'];
  const tip = isKey(look?.hairTip) ? look.hairTip : null;
  return tip ? [r[0], r[1], tip] : r;
}
export const eyeKey = (look) => customKey(look?.eyes) || (EYE_NAMED.find((e) => e.id === look?.eyes) || EYE_NAMED[0]).k;

// ---------------------------------------------------------------- option lists
export const OPT = {
  gender: [{ id: 'm', name: 'Мужской' }, { id: 'f', name: 'Женский' }, { id: 'x', name: 'Не указан' }],
  build: [{ id: 'lean', name: 'Худой' }, { id: 'normal', name: 'Обычный' }, { id: 'sturdy', name: 'Крепкий' }],
  eyeShape: [{ id: 'round', name: 'Круглые' }, { id: 'almond', name: 'Миндалевидные' }, { id: 'narrow', name: 'Узкие' }, { id: 'wide', name: 'Широкие' }, { id: 'droopy', name: 'Грустные' }],
  brows: [{ id: 'soft', name: 'Мягкие' }, { id: 'straight', name: 'Прямые' }, { id: 'arched', name: 'Дугой' }, { id: 'thick', name: 'Густые' }, { id: 'thin', name: 'Тонкие' }],
  mouth: [{ id: 'normal', name: 'Обычный' }, { id: 'full', name: 'Пухлый' }, { id: 'thin', name: 'Тонкий' }, { id: 'wide', name: 'Широкий' }],
  nose: [{ id: 'small', name: 'Маленький' }, { id: 'normal', name: 'Обычный' }, { id: 'strong', name: 'Крупный' }],
  hair: [{ id: 'bald', name: 'Лысый' }, { id: 'crop', name: 'Ёжик' }, { id: 'short', name: 'Короткая' }, { id: 'fringe', name: 'Чёлка' }, { id: 'long', name: 'Длинные' },
    { id: 'tail', name: 'Хвост' }, { id: 'bun', name: 'Пучок' }, { id: 'mohawk', name: 'Ирокез' }, { id: 'spiky', name: 'Колючая' }, { id: 'dreads', name: 'Дреды' }, { id: 'afro', name: 'Кудри' }],
  beard: [{ id: 'none', name: 'Нет' }, { id: 'stubble', name: 'Щетина' }, { id: 'mustache', name: 'Усы' }, { id: 'goatee', name: 'Эспаньолка' }, { id: 'full', name: 'Борода' }],
  acc: [{ id: 'scarEye', name: 'Шрам через глаз' }, { id: 'scarCheek', name: 'Шрам на щеке' }, { id: 'cyberEye', name: 'Кибер-глаз' }, { id: 'plate', name: 'Пластина на виске' },
    { id: 'antenna', name: 'Антенна' }, { id: 'jawImp', name: 'Имплант челюсти' }, { id: 'gasmask', name: 'Противогаз' }, { id: 'respirator', name: 'Респиратор' },
    { id: 'hood', name: 'Капюшон' }, { id: 'helmet', name: 'Каска' }, { id: 'goggles', name: 'Очки-гогглы' }, { id: 'eyepatch', name: 'Повязка на глазу' }, { id: 'bandana', name: 'Бандана' }],
};
export const DETAILS = [
  { id: 'freckles', name: 'Веснушки', c: '7', tip: 'Рассыпь веснушек на щеках и переносице.' },
  { id: 'scar', name: 'Шрам', c: 'd', tip: 'Рубец через щёку и бровь.' },
  { id: 'tattoo', name: 'Татуировка', c: 'h', tip: 'Знаки на скуле и лбу.' },
  { id: 'makeup', name: 'Макияж', c: 'n', tip: 'Тени на веках и цвет губ.' },
];
export const BODY = {
  height: { name: 'Рост', min: -1, max: 1, tip: 'Около ±7 % к росту модели. Не влияет на статы.' },
  bust: { name: 'Грудь', min: -1, max: 1, f: true, tip: 'Размер груди (женский силуэт). Пружинная физика остаётся.' },
  hips: { name: 'Бёдра', min: -1, max: 1, f: true, tip: 'Ширина бёдер и юбки.' },
  shoulders: { name: 'Плечи', min: -1, max: 1, f: false, tip: 'Ширина плеч (мужской и нейтральный силуэт).' },
};
export const FACE_SLIDERS = [
  { id: 'w', name: 'Ширина лица', tip: 'Узкое — широкое.' }, { id: 'c', name: 'Подбородок', tip: 'Острый и выдвинутый — мягкий и короткий.' },
  { id: 'k', name: 'Скулы', tip: 'Плоские — высокие и выступающие.' }, { id: 'j', name: 'Челюсть', tip: 'Нежная — тяжёлая.' },
];
export const BUILD_K = { lean: { w: 0.9, limb: 0.88 }, normal: { w: 1, limb: 1 }, sturdy: { w: 1.1, limb: 1.14 } };

// outfits: armour silhouette + faction trim (units3d factionBody). 'auto' — by the gear in the hands, as in the battle.
export const OUTFITS = [
  { id: 'auto', name: 'По снаряжению', tip: 'Как в игре: силуэт зависит от надетой брони.' },
  { id: 'wanderer', name: 'Странник', armor: 'cloth', tip: 'Пальто с кантом: вольный стрелок, дипломат.' },
  { id: 'scout', name: 'Разведчик', armor: 'light', tip: 'Перевязь, подсумки, мягкие плечи.' },
  { id: 'warden', name: 'Страж', armor: 'medium', tip: 'Нагрудник, наплечники, наручи.' },
  { id: 'bulwark', name: 'Бастион', armor: 'heavy', tip: 'Тяжёлая броня и шлем.' },
  { id: 'cultist', name: 'Балахон Судьи', armor: 'cloth', trim: 'cult', tip: 'Мантия культа. Красный знак на груди.' },
  { id: 'pirate', name: 'Корсар', armor: 'light', trim: 'pirates', tip: 'Красный кушак и пряжка-череп.' },
  { id: 'technician', name: 'Техник', armor: 'light', trim: 'aiParty', tip: 'Нарукавная повязка и значок с циановым огоньком.' },
  { id: 'tin', name: 'Жесть', armor: 'medium', trim: 'tinBrotherhood', tip: 'Ламеллярная юбка и знамя Жестяного братства.' },
  { id: 'renegade', name: 'Отступник', armor: 'light', trim: 'renegades', tip: 'Шарф и патронташ.' },
];
export const outfitOf = (look) => OUTFITS.find((o) => o.id === look?.outfit && o.id !== 'auto') || null;

// what each race cannot change (the body decides)
export const RACE_LOCKS = { skeleton: ['hair', 'hairColor', 'beard', 'brows'], android: ['hair', 'hairColor', 'beard', 'brows'], 'mutant-beast': ['beard'], 'mutant-plant': ['hairColor', 'beard'], cringegon: [] };
export const lockedOf = (race) => RACE_LOCKS[race] || [];

// ---------------------------------------------------------------- defaults / migration
const D2 = () => ({
  height: 0, build: 'normal', bust: 0, hips: 0, shoulders: 0, eyeShape: 'round', brows: 'soft', mouth: 'normal', nose: 'normal',
  freckles: { on: false, c: '7' }, scar: { on: false, c: 'd' }, tattoo: { on: false, c: 'h' }, makeup: { on: false, c: 'n' },
  hairTip: null, fringe: 0.5, outfit: 'auto', accent: null,
});
const cl = (v, a = -1, b = 1) => Math.max(a, Math.min(b, +v || 0));
const oneOf = (list, v, d) => (list.some((o) => o.id === v) ? v : d);
const detail = (d, def) => ({ on: !!d?.on, c: isKey(d?.c) ? d.c : def.c });
const hasAll = (l) => l && l.v === 2 && l.build !== undefined && l.face && l.face.k !== undefined && l.outfit !== undefined && l.freckles && l.accent !== undefined;

/** Any look (old v1, partial v2, null) -> full v2 look. A full v2 object is returned as is. */
export function migrateLook(look, race = 'human') {
  if (hasAll(look)) return look;
  const L = look && typeof look === 'object' ? look : {};
  const d = D2(), r = L.race || race || 'human';
  const out = {
    ...L, v: 2, race: r, gender: oneOf(OPT.gender, L.gender, 'x'),
    skin: skinsOf(r).includes(L.skin | 0) ? L.skin | 0 : skinsOf(r)[Math.min(skinsOf(r).length - 1, L.skin | 0)] ?? skinsOf(r)[0],
    face: { w: cl(L.face?.w), j: cl(L.face?.j), h: cl(L.face?.h), c: cl(L.face?.c), k: cl(L.face?.k) },
    hair: oneOf(OPT.hair, L.hair, 'short'), hairColor: L.hairColor && (customKey(L.hairColor) || HAIR_NAMED.some((h) => h.id === L.hairColor)) ? L.hairColor : 'brown',
    beard: oneOf(OPT.beard, L.beard, 'none'), eyes: L.eyes && (customKey(L.eyes) || EYE_NAMED.some((e) => e.id === L.eyes)) ? L.eyes : 'brown',
    acc: Array.isArray(L.acc) ? [...L.acc] : [], cloth: isKey(L.cloth) ? L.cloth : null,
    height: cl(L.height), build: oneOf(OPT.build, L.build, d.build), bust: cl(L.bust), hips: cl(L.hips), shoulders: cl(L.shoulders),
    eyeShape: oneOf(OPT.eyeShape, L.eyeShape, d.eyeShape), brows: oneOf(OPT.brows, L.brows, d.brows), mouth: oneOf(OPT.mouth, L.mouth, d.mouth), nose: oneOf(OPT.nose, L.nose, d.nose),
    freckles: detail(L.freckles, d.freckles), scar: detail(L.scar, d.scar), tattoo: detail(L.tattoo, d.tattoo), makeup: detail(L.makeup, d.makeup),
    hairTip: isKey(L.hairTip) ? L.hairTip : null, fringe: L.fringe == null ? d.fringe : cl(L.fringe, 0, 1),
    outfit: OUTFITS.some((o) => o.id === L.outfit) ? L.outfit : 'auto', accent: isKey(L.accent) ? L.accent : null,
  };
  return out;
}

/** Applies gender / race constraints in place (editor): bust / hips only for women, shoulders for the rest, locked races. */
export function constrainLook(L) {
  const g = L.gender;
  if (g !== 'f') { L.bust = 0; L.hips = 0; } else L.shoulders = 0;
  if (g === 'f' && ['crop', 'mohawk'].includes(L.hair)) L.hair = 'long';
  if (g !== 'm') L.beard = 'none';
  const sk = skinsOf(L.race);
  if (!sk.includes(L.skin)) L.skin = sk[0];
  const kind = kindOf(L.race);
  if (kind === 'skeleton' || kind === 'android') { L.hair = 'bald'; L.beard = 'none'; if (kind === 'skeleton') L.eyes = 'red'; else if (!L.eyes.startsWith('p:')) L.eyes = 'cyan'; }
  if (kind === 'plant') L.beard = 'none';
  if (kind === 'beast') L.beard = 'none';
  return L;
}

/** A random look for a race / gender. rng — () => 0..1. keep — fields of `old` that stay (outfit colours, gender ...). */
export function randomLook(race, gender, rng, keep = {}) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const d = D2(), g = gender === 'x' && rng() < 0.0 ? 'm' : gender;
  const L = { ...d, v: 2, race, gender: g, skin: pick(skinsOf(race)), face: { w: +(rng() * 1.4 - 0.7).toFixed(2), j: +(rng() * 1.4 - 0.7).toFixed(2), h: +(rng() * 0.8 - 0.4).toFixed(2), c: +(rng() * 1.4 - 0.7).toFixed(2), k: +(rng() * 1.4 - 0.7).toFixed(2) },
    hair: pick(OPT.hair.filter((h) => h.id !== 'bald' || rng() < 0.1)).id, hairColor: pick(HAIR_NAMED.slice(0, rng() < 0.25 ? 12 : 6)).id, eyes: pick(EYE_NAMED.slice(0, rng() < 0.2 ? 8 : 5)).id,
    beard: g === 'm' && rng() < 0.4 ? pick(OPT.beard).id : 'none', acc: [], cloth: null, height: +(rng() * 1.2 - 0.6).toFixed(2), build: pick(OPT.build).id,
    bust: g === 'f' ? +(rng() * 1.2 - 0.6).toFixed(2) : 0, hips: g === 'f' ? +(rng() * 1.2 - 0.6).toFixed(2) : 0, shoulders: g === 'f' ? 0 : +(rng() * 1.2 - 0.6).toFixed(2),
    eyeShape: pick(OPT.eyeShape).id, brows: pick(OPT.brows).id, mouth: pick(OPT.mouth).id, nose: pick(OPT.nose).id, fringe: +rng().toFixed(2) };
  if (rng() < 0.3) L.hairTip = pick(['h', 'n', 'a', 'o', 'e']);
  if (rng() < 0.25) L.freckles = { on: true, c: '7' };
  if (rng() < 0.15) L.scar = { on: true, c: 'd' };
  if (rng() < 0.1) L.tattoo = { on: true, c: pick(['h', 'n', 'o']) };
  if (g === 'f' && rng() < 0.4) L.makeup = { on: true, c: pick(['n', 'c', 'o', 'h']) };
  return constrainLook({ ...L, ...keep, face: { ...L.face }, race, gender: keep.gender || g });
}

// ---------------------------------------------------------------- presets (6 ready looks; race / class stay)
export const PRESETS = [
  { id: 'veteran', name: 'Ветеран пустошей', tip: 'Седой, со шрамом и щетиной. Пальто стража, оливковый цвет.', set: { gender: 'm', skin: 1, hair: 'crop', hairColor: 'grey', beard: 'stubble', eyes: 'grey', brows: 'thick', nose: 'strong', mouth: 'thin', eyeShape: 'narrow', build: 'sturdy', height: 0.2, shoulders: 0.5, scar: { on: true, c: 'd' }, outfit: 'warden', cloth: 'l', accent: 'a', face: { w: 0.3, j: 0.6, h: 0, c: 0.3, k: 0.2 } } },
  { id: 'cyberfox', name: 'Кибер-лисица', tip: 'Розовый хвост с циановыми кончиками, циановый макияж, техник.', set: { gender: 'f', skin: 0, hair: 'tail', hairColor: 'pink', hairTip: 'h', eyes: 'cyan', brows: 'thin', nose: 'small', mouth: 'full', eyeShape: 'almond', build: 'lean', height: -0.1, bust: 0.1, hips: 0.2, makeup: { on: true, c: 'h' }, outfit: 'technician', cloth: 'g', accent: 'h', face: { w: -0.3, j: -0.4, h: 0, c: 0.5, k: 0.1 } } },
  { id: 'marauder', name: 'Мародёр', tip: 'Ирокез, эспаньолка, шрам и татуировка. Красный кушак корсара.', set: { gender: 'm', skin: 2, hair: 'mohawk', hairColor: 'red', beard: 'goatee', eyes: 'amber', brows: 'straight', nose: 'normal', mouth: 'wide', eyeShape: 'droopy', build: 'sturdy', shoulders: 0.3, scar: { on: true, c: 'd' }, tattoo: { on: true, c: 'n' }, outfit: 'pirate', cloth: 'c', accent: 'a', face: { w: 0.1, j: 0.4, h: 0, c: 0, k: 0.3 } } },
  { id: 'priestess', name: 'Жрица Судьи', tip: 'Длинные чёрные волосы с фиолетовыми кончиками, бледная кожа.', set: { gender: 'f', skin: 5, hair: 'long', hairColor: 'black', hairTip: 'o', eyes: 'violet', brows: 'arched', nose: 'small', mouth: 'thin', eyeShape: 'narrow', build: 'lean', height: 0.1, bust: -0.2, hips: 0, makeup: { on: true, c: 'o' }, outfit: 'cultist', cloth: 'o', accent: 'h', face: { w: -0.4, j: -0.2, h: 0.2, c: 0.4, k: 0.4 } } },
  { id: 'nerd', name: 'Техномант-ботан', tip: 'Колючая причёска, веснушки, гогглы. Свободная куртка разведчика.', set: { gender: 'x', skin: 0, hair: 'spiky', hairColor: 'ginger', eyes: 'green', brows: 'soft', nose: 'normal', mouth: 'normal', eyeShape: 'wide', build: 'lean', height: -0.2, shoulders: -0.3, freckles: { on: true, c: '7' }, acc: ['goggles'], outfit: 'scout', cloth: 'f', accent: 'b', face: { w: 0.2, j: -0.3, h: 0.1, c: -0.2, k: -0.1 } } },
  { id: 'tracker', name: 'Следопытка', tip: 'Рыжий пучок, веснушки, загар. Куртка разведчика цвета хвои.', set: { gender: 'f', skin: 7, hair: 'bun', hairColor: 'ginger', eyes: 'green', brows: 'arched', nose: 'small', mouth: 'normal', eyeShape: 'round', build: 'normal', height: 0, bust: 0, hips: 0.3, freckles: { on: true, c: '7' }, outfit: 'scout', cloth: 'k', accent: 'a', face: { w: 0, j: 0, h: 0, c: 0.1, k: 0.5 } } },
];
export function applyPreset(old, preset) {
  const L = migrateLook({ ...old, ...preset.set, face: { ...preset.set.face }, acc: [...(preset.set.acc || [])] }, old.race);
  const kind = kindOf(L.race);
  if (kind !== 'human' && kind !== 'tekhonok') L.skin = skinsOf(L.race)[0];
  return constrainLook({ ...L, v: 2, race: old.race });
}
