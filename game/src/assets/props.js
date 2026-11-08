// Battlefield props: 38 objects (cars, barrels, fences, towers, wagons ...). Owner: art-director, docs/STYLE.md.
//
// Each prop is drawn into a pixel map (w*16 x (h*16 + rise) px, palette keys, '.' = transparent), gets the
// automatic 1 px outline (colour 0) and is cached as a canvas padded by 1 px on every side.
//   w, h      footprint in tiles (cells)
//   rise      extra pixels above the footprint (tall sprites overflow upwards)
//   cover     'half' | 'full' | null    (half = -cover bonus, shots pass over; full = blocks line of fire)
//   blocks    blocks movement
//   destructible, hp, debris ('surface id' left on destruction: oil | fire | water | acid | electric | blood | smoke | steam | null)
//   height    levels (1-2) when units can climb / it blocks sight like a platform (optional)
//   biomes    where it fits (used by layouts; '*' = anywhere)
//
// API: PROPS, PROP_IDS, propGrid(id) -> string[], propSprite(id) -> canvas (cached, 1 px pad),
//      drawProp(ctx, id, x, y, scale = 3) -- x, y = top-left of the footprint; sprite is bottom-aligned,
//      validateProps() -> string[]
import { Pic, canvasOfGrid } from './tilesets.js';
import { PALETTE_KEYS } from './sprites.js';

const car = (P, w, body, light, dark) => {
  P.box(1, 7, w - 2, 6, body, light, dark); P.box(w * 0.28 | 0, 2, (w * 0.45) | 0, 6, body, light, dark);
  const cx = (w * 0.28 | 0) + 1, cw = ((w * 0.45) | 0) - 2;
  P.r(cx, 3, (cw / 2 | 0) - 1, 3, 'i'); P.r(cx + (cw / 2 | 0), 3, cw - (cw / 2 | 0), 3, 'i'); P.p(cx, 3, 'h');
  for (const x of [5, w - 6]) { P.e(x, 13, 3, 2, '1'); P.p(x, 13, '4'); }
  P.r(1, 12, w - 2, 1, '1'); P.p(w - 2, 9, 'a'); P.p(1, 9, 'c');
};

const D = {
  lada(P) { car(P, 32, '7', '8', '6'); P.r(12, 9, 5, 2, '6'); P.r(22, 8, 3, 2, '4'); P.r(4, 8, 3, 1, '6'); P.l(2, 12, 9, 12, '6'); },
  moskvich(P) { car(P, 32, 'g', 'f', '1'); P.r(15, 8, 4, 3, '6'); P.r(24, 10, 4, 2, '7'); P.r(3, 9, 3, 2, '7'); },
  bus(P) {
    P.box(1, 3, 46, 10, '8', 'a', '6'); P.r(1, 7, 46, 2, '5'); P.r(1, 10, 46, 1, '6');
    for (let x = 3; x < 44; x += 6) { P.r(x, 4, 4, 3, 'i'); P.p(x, 4, 'h'); }
    P.r(40, 4, 6, 7, 'i'); P.p(40, 4, 'h'); P.r(5, 9, 4, 2, '6');
    for (const x of [8, 38]) { P.e(x, 14, 3, 2, '1'); P.p(x, 14, '4'); }
    P.r(1, 13, 46, 1, '1'); P.p(46, 11, 'a');
  },
  kamaz(P) {
    P.box(1, 3, 16, 11, '7', '8', '6'); P.box(3, 4, 8, 5, '7', '8', '6'); P.r(4, 5, 6, 3, 'i'); P.p(4, 5, 'h');
    P.box(17, 8, 14, 6, '3', '4', '2'); P.r(1, 9, 3, 2, 'a'); P.r(1, 12, 30, 1, '1');
    for (const x of [6, 25]) { P.e(x, 14, 3, 2, '1'); P.p(x, 14, '4'); }
    P.r(7, 1, 2, 3, '2'); P.p(7, 0, '4'); P.r(12, 6, 3, 2, '6');
  },
  barrel(P) { P.box(4, 3, 8, 12, '7', '8', '6'); P.r(4, 6, 8, 1, '6'); P.r(4, 11, 8, 1, '6'); P.r(5, 8, 6, 2, 'a'); P.r(5, 8, 6, 1, 'c'); P.r(4, 3, 8, 1, '4'); },
  'barrel-toxic'(P) { P.box(4, 3, 8, 12, 'k', 'j', '1'); P.r(4, 6, 8, 1, '1'); P.r(4, 11, 8, 1, '1'); P.r(6, 8, 4, 2, 'b'); P.p(7, 8, '0'); P.p(8, 9, '0'); P.r(4, 3, 8, 1, '4'); },
  crate(P) { P.box(2, 4, 12, 11, '8', 'a', '6'); P.l(3, 5, 12, 13, '6'); P.l(12, 5, 3, 13, '6'); P.r(2, 4, 12, 1, 'a'); },
  'crate-stack'(P) { P.box(1, 8, 8, 7, '8', 'a', '6'); P.box(8, 9, 7, 6, '7', '8', '6'); P.box(3, 2, 8, 7, '8', 'a', '6'); P.l(4, 3, 9, 7, '6'); P.l(9, 3, 4, 7, '6'); P.r(2, 11, 4, 1, '6'); },
  fence(P) { for (const x of [1, 7, 14]) P.r(x, 3, 1, 12, '3'); P.r(0, 3, 16, 1, '4'); P.r(0, 14, 16, 1, '2'); for (let y = 5; y < 14; y += 2) for (let x = 2; x < 14; x += 2) { P.p(x + (y % 4 ? 1 : 0), y, '4'); } P.p(7, 2, '4'); },
  'concrete-block'(P) { P.box(1, 3, 14, 12, '3', '4', '2'); P.r(1, 3, 14, 3, '4'); P.l(8, 8, 6, 14, '2'); P.r(11, 8, 2, 1, 'a'); P.r(11, 10, 2, 1, 'a'); },
  sandbags(P) { for (let k = 0; k < 2; k++) for (let i = 0; i < 3 - k; i++) { const x = 1 + i * 5 + k * 2; P.e(x + 2, 12 - k * 4, 3, 2, 'm'); P.e(x + 1, 11 - k * 4, 2, 1, '9'); P.l(x, 12 - k * 4, x + 4, 12 - k * 4, '6'); } },
  tower(P) {
    P.box(1, 0, 14, 8, '8', 'a', '6'); P.r(1, 0, 14, 2, '7'); P.r(3, 3, 10, 3, 'i'); P.p(3, 3, 'h'); P.r(0, 8, 16, 2, '3');
    for (const x of [2, 12]) P.r(x, 10, 2, 22, '3'); P.l(3, 10, 12, 31, '2'); P.l(12, 10, 3, 31, '2'); P.r(2, 20, 12, 1, '2'); P.r(0, 30, 16, 2, '2'); P.p(14, 0, 'c');
  },
  wagon(P) {
    P.box(1, 3, 46, 11, '7', '8', '6'); for (let x = 4; x < 46; x += 4) P.r(x, 4, 1, 9, '6'); P.r(1, 8, 46, 1, '6');
    P.r(17, 5, 14, 7, '1'); P.r(18, 5, 6, 7, '3'); P.r(1, 14, 46, 1, '1');
    for (const x of [6, 12, 35, 41]) { P.e(x, 14, 2, 2, '1'); P.p(x, 14, '4'); }
  },
  container(P) { P.box(1, 3, 30, 12, 'f', '5', 'g'); for (let x = 3; x < 30; x += 2) P.r(x, 5, 1, 9, 'g'); P.r(1, 3, 30, 1, '4'); P.r(1, 14, 30, 1, '1'); },
  'container-red'(P) { P.box(1, 3, 30, 12, 'c', '5', 'd'); for (let x = 3; x < 30; x += 2) P.r(x, 5, 1, 9, 'd'); P.r(1, 3, 30, 1, '4'); P.r(1, 14, 30, 1, '1'); P.r(12, 7, 8, 3, '5'); P.r(13, 8, 6, 1, 'c'); },
  transformer(P) { P.box(2, 4, 12, 11, '2', '3', '1'); P.r(2, 4, 12, 2, 'a'); for (const x of [4, 8, 11]) { P.r(x, 1, 2, 3, '5'); P.p(x, 0, '4'); } P.r(4, 8, 8, 4, '1'); P.l(7, 8, 9, 11, 'b'); P.l(9, 11, 6, 11, 'b'); },
  garages(P) { P.box(1, 3, 30, 12, '3', '4', '2'); for (const x of [3, 18]) { P.box(x, 6, 11, 9, '7', '8', '6'); for (let y = 8; y < 14; y += 2) P.r(x + 1, y, 9, 1, '6'); } P.r(1, 3, 30, 2, '2'); P.p(16, 10, '4'); },
  campfire(P) { P.e(8, 13, 5, 2, '1'); for (const [x, y] of [[4, 13], [7, 14], [10, 13], [12, 14]]) P.r(x, y, 2, 2, '3'); P.l(5, 13, 11, 11, '6'); P.l(11, 13, 5, 11, '6'); P.e(8, 9, 3, 4, 'e'); P.e(8, 10, 2, 3, 'a'); P.e(8, 11, 1, 2, 'b'); P.p(8, 4, 'e'); P.p(6, 7, 'e'); },
  tent(P) { P.r(1, 14, 30, 1, '1'); for (let y = 2; y < 14; y++) { const hw = 1 + ((y - 2) * 15 / 12) | 0; P.r(16 - hw, y, hw * 2, 1, y % 5 === 0 ? 'm' : 'l'); P.p(16 - hw, y, '9'); P.p(15 + hw, y, '6'); } P.r(14, 8, 4, 6, '1'); P.r(15, 9, 2, 5, '0'); P.p(16, 1, '4'); },
  'monument-stump'(P) { P.box(2, 11, 12, 4, '3', '4', '2'); P.box(4, 5, 8, 7, '4', '5', '3'); P.r(4, 5, 8, 2, '3'); P.l(6, 5, 8, 2, '3'); P.l(8, 2, 10, 5, '3'); P.r(6, 8, 4, 1, '2'); P.r(7, 9, 2, 1, '2'); P.p(11, 4, 'c'); },
  kiosk(P) { P.box(1, 4, 14, 11, 'g', 'f', '1'); P.r(1, 4, 14, 2, 'c'); P.r(1, 4, 14, 1, '5'); P.r(3, 7, 10, 4, 'i'); P.r(3, 7, 10, 1, 'h'); P.r(2, 11, 12, 1, '8'); P.r(12, 13, 2, 1, 'a'); },
  heatpipe(P) { P.r(0, 5, 32, 7, '3'); P.r(0, 5, 32, 1, '5'); P.r(0, 11, 32, 1, '2'); for (let x = 3; x < 32; x += 8) { P.r(x, 5, 3, 7, '5'); P.r(x + 2, 5, 1, 7, '4'); } P.r(0, 12, 32, 3, '1'); for (const x of [4, 20]) P.r(x, 12, 2, 3, '7'); P.r(14, 8, 3, 3, '7'); },
  buoy(P) { P.e(8, 11, 5, 4, 'c'); P.e(8, 12, 4, 2, '5'); P.r(4, 9, 8, 1, '5'); P.r(7, 2, 2, 7, '3'); P.e(8, 2, 2, 1, 'a'); P.p(8, 1, 'b'); P.r(3, 14, 10, 1, 'g'); },
  bollard(P) { P.box(5, 8, 6, 6, '3', '4', '2'); P.e(8, 8, 4, 2, '4'); P.r(5, 13, 6, 2, '2'); P.r(6, 10, 4, 1, 'a'); },
  server(P) { P.box(2, 1, 12, 14, '2', '3', '1'); for (let y = 3; y < 13; y += 3) { P.r(3, y, 10, 2, '1'); P.p(4, y, 'h'); P.p(5, y, y % 2 ? 'j' : 'c'); P.r(8, y, 4, 1, '3'); } P.p(12, 3, 'b'); },
  'glitch-cube'(P) { P.box(3, 4, 10, 10, 'o', 'n', '1'); P.r(5, 6, 6, 1, 'h'); P.r(5, 9, 4, 1, 'n'); P.r(9, 11, 3, 1, 'h'); P.p(2, 3, 'h'); P.p(13, 3, 'n'); P.p(14, 12, 'h'); P.r(1, 8, 2, 1, 'n'); P.r(13, 7, 3, 1, 'h'); },
  'tire-pile'(P) { for (const [x, y] of [[3, 11], [9, 11], [6, 7]]) { P.e(x + 2, y + 1, 3, 2, '1'); P.e(x + 2, y + 1, 1, 1, '3'); P.p(x, y, '3'); } P.r(2, 14, 12, 1, '0'); },
  'dead-tree'(P) { P.r(7, 4, 3, 11, '6'); P.r(7, 4, 1, 11, '7'); P.l(8, 6, 3, 1, '6').l(9, 8, 14, 3, '6').l(8, 4, 8, 0, '6').l(3, 1, 2, 3, '6').l(14, 3, 15, 5, '6'); P.r(5, 14, 7, 1, '1'); },
  lamp(P) { P.r(7, 3, 2, 12, '3'); P.r(7, 3, 1, 12, '4'); P.r(7, 2, 6, 2, '3'); P.r(11, 4, 3, 2, 'a'); P.r(5, 14, 6, 1, '2'); P.p(12, 6, 'b'); },
  bench(P) { P.r(2, 8, 12, 2, '8'); P.r(2, 8, 12, 1, 'a'); P.r(2, 5, 12, 2, '7'); P.r(3, 10, 2, 5, '3'); P.r(11, 10, 2, 5, '3'); P.r(2, 14, 12, 1, '1'); },
  slab(P) { P.l(2, 14, 12, 3, '4'); P.l(3, 14, 13, 3, '4'); P.l(4, 14, 14, 3, '3'); P.r(1, 14, 14, 1, '2'); P.r(5, 12, 2, 2, '7'); P.l(2, 14, 12, 4, '2'); P.p(12, 4, '7'); P.p(13, 3, '7'); },
  generator(P) { P.box(1, 5, 14, 10, 'l', 'm', '1'); P.r(3, 7, 5, 4, '1'); P.r(4, 8, 3, 2, 'a'); P.r(9, 7, 4, 2, '3'); P.r(10, 2, 3, 3, '3'); P.p(11, 1, '4'); P.p(12, 12, 'c'); P.r(2, 14, 12, 1, '0'); },
  dumpster(P) { P.box(1, 5, 14, 10, 'k', 'j', '1'); P.r(1, 4, 14, 2, '2'); P.r(1, 4, 14, 1, '3'); P.r(3, 8, 10, 1, '1'); P.r(3, 11, 10, 1, '1'); P.p(3, 14, '1'); P.p(12, 14, '1'); P.p(6, 3, '7'); P.p(9, 3, 'm'); },
  'ice-block'(P) { P.r(3, 3, 10, 12, '4'); P.r(1, 7, 14, 8, '4'); P.r(4, 4, 4, 5, 'h'); P.r(4, 4, 4, 1, '5'); P.l(10, 5, 12, 13, '3'); P.r(1, 14, 14, 1, '3'); P.p(11, 8, '5'); },
  antenna(P) { P.r(7, 4, 2, 28, '3'); P.r(7, 4, 1, 28, '4'); for (let y = 8; y < 30; y += 6) { P.r(3, y, 10, 1, '4'); } P.l(2, 31, 7, 12, '2'); P.l(13, 31, 8, 12, '2'); P.e(8, 3, 2, 2, 'c'); P.p(8, 2, 'a'); P.r(2, 30, 12, 2, '2'); },
  rowboat(P) { P.l(1, 8, 4, 13, '7'); P.r(3, 12, 26, 2, '7'); P.r(3, 12, 26, 1, '8'); P.l(31, 8, 28, 13, '7'); P.r(0, 8, 32, 1, '8'); P.r(2, 9, 28, 3, '6'); P.r(14, 9, 1, 3, '8'); P.r(2, 14, 28, 1, '1'); },
  'hologram-pillar'(P) { P.box(5, 11, 6, 4, '1', 'i', '0'); P.r(6, 12, 4, 1, 'h'); P.r(6, 2, 4, 9, 'i'); P.r(7, 3, 2, 7, 'h'); P.r(6, 5, 4, 1, 'n'); P.p(8, 1, '5'); },
  'data-pylon'(P) { P.box(4, 2, 8, 13, '0', 'o', '1'); P.r(5, 3, 6, 1, 'h'); P.r(5, 7, 6, 1, 'n'); P.r(5, 11, 6, 1, 'h'); P.r(7, 3, 2, 10, 'i'); P.p(8, 5, '5'); },
  'pallet-stack'(P) { for (let k = 0; k < 3; k++) { const y = 3 + k * 4; P.box(2, y, 12, 3, '8', 'a', '6'); P.r(4, y, 1, 3, '6'); P.r(8, y, 1, 3, '6'); P.r(11, y, 1, 3, '6'); } P.r(2, 14, 12, 1, '1'); P.r(3, 3, 3, 1, 'm'); },
  trench(P) { P.r(0, 6, 32, 9, '6'); P.r(0, 6, 32, 2, '7'); P.r(0, 8, 32, 1, '1'); P.r(0, 14, 32, 1, '0'); for (let x = 2; x < 32; x += 6) { P.r(x, 9, 2, 5, '1'); P.p(x, 9, '3'); } P.r(0, 4, 32, 2, 'm'); for (let x = 1; x < 31; x += 5) P.p(x, 4, '9'); },
  bridge(P) { P.r(0, 3, 48, 2, '3'); P.r(0, 4, 48, 1, '2'); for (let x = 0; x < 48; x += 8) P.r(x, 5, 1, 4, '3'); P.r(0, 9, 48, 3, '7'); P.r(0, 9, 48, 1, '8'); for (let x = 2; x < 48; x += 4) P.r(x, 9, 1, 3, '6'); P.r(0, 12, 48, 2, '1'); P.p(0, 2, 'a'); P.p(47, 2, 'a'); },
};

// id: [name, w, h, rise, cover, blocks, destructible, hp, debris, height, biomes]
const M = (name, w, h, rise, cover, blocks, destructible, hp, debris, height, biomes) =>
  ({ name, w, h, rise, cover, blocks, destructible, hp, debris, ...(height ? { height } : {}), biomes });
const ANY = ['*'];
export const PROPS = {
  lada: M('Ржавая «Лада»', 2, 1, 0, 'half', true, true, 24, 'oil', 0, ['ruins-city', 'wasteland', 'swamp', 'snow', 'port']),
  moskvich: M('Битый «Москвич»', 2, 1, 0, 'half', true, true, 24, 'oil', 0, ['ruins-city', 'wasteland', 'snow']),
  bus: M('Ржавый автобус', 3, 1, 0, 'full', true, false, 0, null, 1, ['ruins-city', 'wasteland', 'snow']),
  kamaz: M('Кабина КамАЗа', 2, 1, 0, 'full', true, true, 36, 'oil', 1, ['wasteland', 'factory', 'port', 'snow']),
  barrel: M('Бочка', 1, 1, 0, 'half', true, true, 6, 'oil', 0, ['wasteland', 'factory', 'port', 'ruins-city', 'swamp']),
  'barrel-toxic': M('Бочка с отходами', 1, 1, 0, 'half', true, true, 6, 'acid', 0, ['mutant-forest', 'swamp', 'factory', 'wasteland']),
  crate: M('Ящик', 1, 1, 0, 'half', true, true, 8, null, 0, ANY),
  'crate-stack': M('Штабель ящиков', 1, 1, 0, 'full', true, true, 14, null, 0, ['port', 'factory', 'bunker-interior', 'ruins-city']),
  fence: M('Забор-сетка', 1, 1, 0, null, true, true, 6, null, 0, ['wasteland', 'ruins-city', 'factory', 'port', 'snow']),
  'concrete-block': M('Бетонный блок', 1, 1, 0, 'full', true, false, 0, null, 0, ['ruins-city', 'wasteland', 'factory', 'snow', 'port']),
  sandbags: M('Мешки с песком', 1, 1, 0, 'half', true, true, 10, null, 0, ['wasteland', 'ruins-city', 'snow', 'swamp', 'port']),
  tower: M('Вышка', 1, 1, 16, 'full', true, false, 0, null, 2, ['wasteland', 'snow', 'port', 'factory', 'mutant-forest']),
  wagon: M('Вагон', 3, 1, 0, 'full', true, false, 0, null, 1, ['wasteland', 'factory', 'snow', 'ruins-city']),
  container: M('Контейнер (синий)', 2, 1, 0, 'full', true, false, 0, null, 1, ['port', 'factory', 'wasteland']),
  'container-red': M('Контейнер (красный)', 2, 1, 0, 'full', true, false, 0, null, 1, ['port', 'factory', 'wasteland']),
  transformer: M('Трансформаторная будка', 1, 1, 0, 'full', true, true, 14, 'electric', 0, ['ruins-city', 'wasteland', 'factory', 'snow']),
  garages: M('Гаражи', 2, 1, 0, 'full', true, false, 0, null, 1, ['ruins-city', 'wasteland', 'snow']),
  campfire: M('Костёр', 1, 1, 0, null, false, false, 0, 'fire', 0, ['wasteland', 'swamp', 'snow', 'mutant-forest', 'ruins-city']),
  tent: M('Палатка', 2, 1, 0, 'half', true, true, 12, null, 0, ['wasteland', 'snow', 'swamp', 'mutant-forest', 'ruins-city']),
  'monument-stump': M('Памятник-обрубок', 1, 1, 0, 'full', true, false, 0, null, 0, ['ruins-city', 'wasteland', 'snow']),
  kiosk: M('Ларёк', 1, 1, 0, 'full', true, true, 10, null, 0, ['ruins-city', 'wasteland', 'port']),
  heatpipe: M('Теплотрасса', 2, 1, 0, 'half', true, true, 16, 'steam', 0, ['ruins-city', 'snow', 'factory', 'wasteland']),
  buoy: M('Буй', 1, 1, 0, 'half', true, true, 6, 'water', 0, ['port', 'swamp']),
  bollard: M('Кнехт', 1, 1, 0, 'half', true, false, 0, null, 0, ['port']),
  server: M('Сервер-стойка', 1, 1, 0, 'full', true, true, 12, 'electric', 0, ['bunker-interior', 'cyberspace', 'factory']),
  'glitch-cube': M('Неоновый глитч-куб', 1, 1, 0, 'full', true, true, 10, 'electric', 0, ['cyberspace']),
  'tire-pile': M('Покрышки', 1, 1, 0, 'half', true, true, 8, 'smoke', 0, ['wasteland', 'ruins-city', 'factory', 'port', 'swamp']),
  'dead-tree': M('Мёртвое дерево', 1, 1, 0, null, true, false, 0, null, 0, ['swamp', 'wasteland', 'snow', 'mutant-forest']),
  lamp: M('Фонарный столб', 1, 1, 0, null, true, true, 6, 'electric', 0, ['ruins-city', 'port', 'snow']),
  bench: M('Скамейка', 1, 1, 0, 'half', true, true, 6, null, 0, ['ruins-city', 'snow', 'port']),
  slab: M('Привалённая плита', 1, 1, 0, 'half', true, false, 0, null, 0, ['ruins-city', 'wasteland', 'snow', 'factory']),
  generator: M('Генератор', 1, 1, 0, 'half', true, true, 12, 'fire', 0, ['wasteland', 'factory', 'snow', 'mutant-forest']),
  dumpster: M('Мусорный бак', 1, 1, 0, 'half', true, true, 10, null, 0, ['ruins-city', 'port', 'wasteland']),
  'ice-block': M('Ледяная глыба', 1, 1, 0, 'full', true, true, 12, 'water', 0, ['snow']),
  antenna: M('Мачта связи', 1, 1, 16, null, true, true, 12, 'electric', 2, ['wasteland', 'snow', 'cyberspace', 'ruins-city']),
  rowboat: M('Лодка на берегу', 2, 1, 0, 'half', true, true, 12, null, 0, ['port', 'swamp']),
  'hologram-pillar': M('Голо-колонна', 1, 1, 0, 'half', true, true, 8, 'electric', 0, ['cyberspace', 'bunker-interior']),
  'data-pylon': M('Дата-пилон', 1, 1, 0, 'full', true, false, 0, null, 0, ['cyberspace']),
  'pallet-stack': M('Поддоны', 1, 1, 0, 'half', true, true, 8, null, 0, ['factory', 'port']),
  trench: M('Траншея', 2, 1, 0, 'half', false, false, 0, null, 0, ['wasteland', 'snow', 'swamp', 'mutant-forest']),
  bridge: M('Мост (настил с перилами)', 3, 1, 0, null, false, false, 0, null, 0, ['*']),
};
// 'trench' = standing in it gives half cover (units move through it); 'bridge' = walkable deck.
export const PROP_IDS = Object.keys(PROPS);

export function propGrid(id) {
  const p = PROPS[id];
  if (!p) throw new Error(`Unknown prop: ${id}`);
  const P = new Pic(p.w * 16, p.h * 16 + p.rise);
  const shift = new Pic(P.w, P.h + 0);
  D[id](shift);
  // sprites are authored top-aligned within (rise + 16 rows); tall ones already include rise rows
  P.stamp(shift);
  return P.padded(1).outline('0').rows();
}

const cache = new Map();
export function propSprite(id) {
  let c = cache.get(id);
  if (!c) { c = canvasOfGrid(propGrid(id)); cache.set(id, c); }
  return c;
}

export function drawProp(ctx, id, x, y, scale = 3) {
  const p = PROPS[id], cv = propSprite(id);
  const prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, x - scale, y - (p.rise + 1) * scale, cv.width * scale, cv.height * scale);
  ctx.imageSmoothingEnabled = prev;
}

export function validateProps() {
  const errs = [];
  for (const id of PROP_IDS) {
    try {
      const g = propGrid(id), p = PROPS[id];
      if (g.length !== p.h * 16 + p.rise + 2) errs.push(`${id}: height`);
      for (const r of g) for (const ch of r) if (ch !== '.' && PALETTE_KEYS.indexOf(ch) < 0) errs.push(`${id}: bad char ${ch}`);
      if (!['half', 'full', null].includes(p.cover)) errs.push(`${id}: cover`);
    } catch (e) { errs.push(`${id}: ${e.message}`); }
  }
  return errs;
}
