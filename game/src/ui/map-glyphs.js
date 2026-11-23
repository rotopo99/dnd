// Vector map marks (replace emoji/font glyphs on the world map): flat shapes in one colour, ~12px box, centred at cx, cy.
// Used by world-map node marks (consequences) and clash markers. drawMapGlyph(ctx, ch, cx, cy, col, r = 6) -> true if drawn.

const NAMES = { '★': 'star', '⚔': 'swords', '⚓': 'anchor', '⚐': 'flag', '🗝': 'key', '⛔': 'ban', '⚠': 'warn' };

export function hasMapGlyph(ch) { return !!NAMES[ch]; }

const SHAPES = {
  // АИ Партия: five-point star
  star(g, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.42 : r;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d);
    }
    g.closePath(); g.fill();
  },
  // Отступники: spear (diagonal shaft, leaf head) crossed with a blade
  swords(g, r) {
    g.lineWidth = 2; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(-r * 0.8, r * 0.8); g.lineTo(r * 0.55, -r * 0.55); g.stroke();
    g.beginPath(); g.moveTo(r * 0.8, r * 0.8); g.lineTo(-r * 0.55, -r * 0.55); g.stroke();
    g.beginPath(); g.moveTo(r * 0.95, -r * 0.95); g.lineTo(r * 0.35, -r * 0.7); g.lineTo(r * 0.7, -r * 0.35); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-r * 0.95, -r * 0.95); g.lineTo(-r * 0.35, -r * 0.7); g.lineTo(-r * 0.7, -r * 0.35); g.closePath(); g.fill();
    g.fillRect(-r * 0.85, r * 0.45, r * 0.5, 2); g.fillRect(r * 0.35, r * 0.45, r * 0.5, 2);
  },
  // Пираты: anchor
  anchor(g, r) {
    g.lineWidth = 2; g.lineCap = 'butt';
    g.beginPath(); g.arc(0, -r * 0.72, r * 0.2, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, -r * 0.5); g.lineTo(0, r * 0.85); g.stroke();
    g.beginPath(); g.moveTo(-r * 0.4, -r * 0.2); g.lineTo(r * 0.4, -r * 0.2); g.stroke();
    g.beginPath(); g.arc(0, r * 0.1, r * 0.8, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
  },
  // Совет: pennant on a pole (white flag, outlined so it reads on the dark plate)
  flag(g, r) {
    g.fillRect(-r * 0.6, -r, 2, r * 2);
    g.beginPath(); g.moveTo(-r * 0.6 + 2, -r); g.lineTo(r * 0.9, -r * 0.45); g.lineTo(-r * 0.6 + 2, r * 0.1); g.closePath(); g.fill();
  },
  // «никто»: empty pole with a ring, no banner
  none(g, r) {
    g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, r * 0.75, 0, Math.PI * 2); g.stroke();
  },
  // Дверь Лизы: key
  key(g, r) {
    g.lineWidth = 2;
    g.beginPath(); g.arc(-r * 0.45, -r * 0.45, r * 0.4, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-r * 0.2, -r * 0.2); g.lineTo(r * 0.85, r * 0.85); g.stroke();
    g.fillRect(r * 0.3, r * 0.5, 2, r * 0.45 + 1); g.fillRect(r * 0.6, r * 0.75, 2, r * 0.25);
  },
  ban(g, r) {
    g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, r * 0.8, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-r * 0.55, r * 0.55); g.lineTo(r * 0.55, -r * 0.55); g.stroke();
  },
  warn(g, r) {
    g.lineWidth = 2; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(0, -r * 0.85); g.lineTo(r * 0.9, r * 0.75); g.lineTo(-r * 0.9, r * 0.75); g.closePath(); g.stroke();
    g.fillRect(-1, -r * 0.3, 2, r * 0.6); g.fillRect(-1, r * 0.4, 2, 2);
  },
};

/** Draw a mark by name (`star|swords|anchor|flag|none|key|ban|warn`) or by the legacy char. */
export function drawMapGlyph(ctx, ch, cx, cy, col, r = 6) {
  const fn = SHAPES[NAMES[ch] || ch];
  if (!fn) return false;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = col; ctx.strokeStyle = col;
  fn(ctx, r);
  ctx.restore();
  return true;
}
