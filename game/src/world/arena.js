// Procedural battle map for world battles (until hand-made maps exist): 22x12, border walls, scattered cover,
// optional fire for burning regions. 4 'P' starts on the left, enemy starts 'E' on the right (row-major order).
export function makeWorldMap({ seed = 1, enemies = 4, hazard = null, id = 'world' } = {}) {
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const w = 22, h = 12;
  const g = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.');
    g.push(row);
  }
  // cover clusters in the middle band, keep the start columns free
  const clusters = 6 + Math.floor(rnd() * 4);
  for (let i = 0; i < clusters; i++) {
    const cx = 5 + Math.floor(rnd() * 12), cy = 2 + Math.floor(rnd() * 8);
    const horiz = rnd() < 0.5;
    const len = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < len; k++) {
      const x = cx + (horiz ? k : 0), y = cy + (horiz ? 0 : k);
      if (x > 3 && x < w - 4 && y > 0 && y < h - 1) g[y][x] = rnd() < 0.2 ? '#' : 'c';
    }
  }
  if (hazard === 'fire') {
    for (let i = 0; i < 6; i++) {
      const x = 5 + Math.floor(rnd() * 12), y = 1 + Math.floor(rnd() * 10);
      if (g[y][x] === '.') g[y][x] = '~';
    }
  }
  const ps = [[2, 4], [2, 7], [3, 5], [3, 6]];
  for (const [x, y] of ps) g[y][x] = 'P';
  const es = [];
  for (let y = 2; y <= 9 && es.length < Math.max(4, enemies); y++) for (const x of [w - 3, w - 5]) if (es.length < Math.max(4, enemies)) es.push([x, y + (x === w - 5 ? 1 : 0)]);
  for (const [x, y] of es) if (y > 0 && y < h - 1) g[y][x] = 'E';
  return { id, name: id, grid: g.map((r) => r.join('')), enemies: [], allies: [], win: 'killAll', lose: 'allDown' };
}
