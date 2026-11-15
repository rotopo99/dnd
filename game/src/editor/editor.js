// Hand-made map editor (docs/specs/level-design.md §7.3 B) — game/editor.html, for the team, not for players.
// Paints the three ASCII layers (floor chars / elev digits / objs markers), places JSON objects (note, secret, lever, door,
// hatch, exit), POI, path points and battle foe cells; shows the checker (world/handmade-check.js) live; saves JSON by
// download / clipboard (JS module text for data/maps/handmade/<id>.js). No dependencies, DOM only here.
import { HANDMADE_LIST } from '../data/maps/handmade/index.js';
import { validateHandmade } from '../world/handmade-check.js';
import { ENEMIES, ENCOUNTERS, ITEMS } from '../data/index.js';
import { NPCS } from '../data/npcs.js';
import { LOCATIONS } from '../data/world/locations.js';
import { SKILLS } from '../data/talents.js';
import { PROPS } from '../assets/props.js';
import { C } from '../ui/draw.js';

const REFS = { ENEMIES, ENCOUNTERS, ITEMS, NPCS, LOCATIONS, SKILLS, PROPS };
const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');

// floor chars (rules/grid.js + roam): colour + label
const FLOOR = {
  '.': ['5', 'пол'], '#': ['1', 'стена'], c: ['7', 'ящик ½'], C: ['3', 'бетон'], x: ['4', 'тонкая стена'], f: ['6', 'забор'],
  w: ['g', 'лужа'], W: ['f', 'глубоко'], '~': ['e', 'огонь'], ',': ['4', 'обломки'], b: ['c', 'бочка'], g: ['l', 'газ'],
  '=': ['8', 'настил'], '"': ['k', 'грядки'], D: ['a', 'выход'],
};
const MARK = { '.': 'стереть', S: 'прилавок', s: 'место торговца', B: 'кровать', K: 'ящик', H: 'верстак', T: 'терминал', F: 'костёр', O: 'колодец', n: 'место NPC', '@': 'вход', P: 'старт P', A: 'старт A', E: 'старт E', Q: 'лодка' };
const OBJ = {
  note: { title: 'Записка', text: 'Текст до 140 символов.' },
  secret: { check: { skill: 'perception', dc: 12 }, loot: [{ item: 'bandage', n: 1 }], text: 'Нашлось.' },
  lever: { opens: [], text: 'Рычаг поддался.' },
  door: { name: 'Дверь' },
  hatch: { name: 'Люк', lock: { skill: 'lockpicking', dc: 13 } },
  exit: { to: 'world', label: 'Выход' },
};
const TOOLS = { floor: 'пол', elev: 'высота', mark: 'маркер', obj: 'объект', select: 'выбор', poi: 'POI', path: 'путь', foe: 'враг боя', goal: 'цель' };
const LAYERS = { elev: 'высоты', objs: 'объекты', paths: 'пути', poi: 'POI', battles: 'бои', triggers: 'триггеры' };

const E = { def: null, tool: 'floor', brush: '.', level: 1, mark: 'n', otype: 'note', sel: null, cell: 24, show: Object.fromEntries(Object.keys(LAYERS).map((k) => [k, true])), path: null, undo: [], down: false, hover: null };

// ---------------------------------------------------------------- model
const rows = (k) => E.def.ascii[k];
const W = () => rows('floor')[0].length, H = () => rows('floor').length;
const setAt = (k, x, y, ch) => { const r = rows(k); r[y] = r[y].slice(0, x) + ch + r[y].slice(x + 1); };
const snapshot = () => { E.undo.push(JSON.stringify(E.def)); if (E.undo.length > 60) E.undo.shift(); };

function blank(w, h) {
  const fl = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (x && y && x < w - 1 && y < h - 1 ? '.' : '#')).join(''));
  return { id: 'hm-new', loc: '', name: 'Новая карта', type: 'hub', biome: 'ruins-city', scale: 1.5, scenario: { kind: 'ambush', brief: '' },
    ascii: { floor: fl, elev: fl.map((r) => '0'.repeat(r.length)), objs: fl.map((r) => '.'.repeat(r.length)) },
    goal: null, props: [], objects: [], battles: [], triggers: [], paths: [], poi: [], zones: [], npcs: [] };
}
function setDef(d) {
  E.def = JSON.parse(JSON.stringify(d));
  const a = E.def.ascii;
  a.elev ||= a.floor.map((r) => '0'.repeat(r.length));
  a.objs ||= a.floor.map((r) => '.'.repeat(r.length));
  for (const k of ['props', 'objects', 'battles', 'triggers', 'paths', 'poi', 'zones', 'npcs']) E.def[k] ||= [];
  E.sel = null; E.path = E.def.paths[0]?.id || null;
  syncJson(); refreshPaths(); fit(); draw(); validate();
}

// ---------------------------------------------------------------- UI
function buttons(el, map, key, cb) {
  el.innerHTML = '';
  for (const [k, label] of Object.entries(map)) {
    const b = document.createElement('button');
    b.textContent = typeof label === 'string' ? (label.length > 2 && key !== 'tool' && key !== 'layer' ? `${k} ${label}` : label) : k;
    b.title = typeof label === 'string' ? label : k;
    b.onclick = () => cb(k);
    b.dataset.k = k;
    el.appendChild(b);
  }
}
function paintPalette() {
  const pal = $('pal');
  if (E.tool === 'floor') buttons(pal, Object.fromEntries(Object.entries(FLOOR).map(([k, v]) => [k, v[1]])), 'pal', (k) => { E.brush = k; paintPalette(); });
  else if (E.tool === 'elev') buttons(pal, { 0: '0 м', 1: '0.5', 2: '1.0', 3: '1.5', 4: '2.0', 5: '2.5', 6: '3.0' }, 'pal', (k) => { E.level = +k; paintPalette(); });
  else if (E.tool === 'mark') buttons(pal, MARK, 'pal', (k) => { E.mark = k; paintPalette(); });
  else if (E.tool === 'obj') buttons(pal, Object.fromEntries(Object.keys(OBJ).map((k) => [k, k])), 'pal', (k) => { E.otype = k; paintPalette(); });
  else pal.innerHTML = '<small>—</small>';
  const cur = E.tool === 'floor' ? E.brush : E.tool === 'elev' ? String(E.level) : E.tool === 'mark' ? E.mark : E.otype;
  for (const b of pal.querySelectorAll('button')) b.classList.toggle('on', b.dataset.k === cur);
}
function paintTools() {
  buttons($('tools'), TOOLS, 'tool', (k) => { E.tool = k; paintTools(); paintPalette(); });
  for (const b of $('tools').querySelectorAll('button')) b.classList.toggle('on', b.dataset.k === E.tool);
  buttons($('layers'), LAYERS, 'layer', (k) => { E.show[k] = !E.show[k]; paintTools(); draw(); });
  for (const b of $('layers').querySelectorAll('button')) b.classList.toggle('on', E.show[b.dataset.k]);
}
function refreshPaths() {
  const s = $('path');
  s.innerHTML = E.def.paths.map((p) => `<option value="${p.id}" ${p.id === E.path ? 'selected' : ''}>${p.id} (${p.kind}, ${p.pts.length})</option>`).join('');
}
function syncJson() {
  const { ascii, ...rest } = E.def;
  $('json').value = JSON.stringify(rest, null, 1);
}
function fit() {
  const m = cv.parentElement;
  E.cell = Math.max(8, Math.min(32, Math.floor(Math.min((m.clientWidth - 10) / W(), (m.clientHeight - 10) / H()))));
  cv.width = W() * E.cell; cv.height = H() * E.cell;
}

// ---------------------------------------------------------------- drawing
function draw() {
  const c = E.cell, d = E.def;
  ctx.font = `${Math.max(9, c * 0.5)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let y = 0; y < H(); y++) for (let x = 0; x < W(); x++) {
    const ch = rows('floor')[y][x], e = +rows('elev')[y][x] || 0;
    ctx.fillStyle = C[(FLOOR[ch] || FLOOR['.'])[0]] || '#555';
    ctx.fillRect(x * c, y * c, c, c);
    if (E.show.elev && e && ch !== '#') {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.45, e * 0.08)})`; ctx.fillRect(x * c, y * c, c, c);
      ctx.fillStyle = '#000'; ctx.fillText(String(e), x * c + c / 2, y * c + c / 2);
    }
    if (E.show.elev) for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const n = +rows('elev')[y + dy]?.[x + dx] || 0;
      if (y + dy >= H() || x + dx >= W() || Math.abs(n - e) < 2) continue;
      ctx.fillStyle = '#ff3030'; // a cliff (> 1 level) between the cells
      if (dx) ctx.fillRect((x + 1) * c - 1, y * c, 2, c); else ctx.fillRect(x * c, (y + 1) * c - 1, c, 2);
    }
    if (E.show.objs) {
      const m = rows('objs')[y][x];
      if (m !== '.') { ctx.fillStyle = '#ffe080'; ctx.fillText(m, x * c + c / 2, y * c + c / 2); }
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let x = 0; x <= W(); x++) { ctx.beginPath(); ctx.moveTo(x * c + 0.5, 0); ctx.lineTo(x * c + 0.5, H() * c); ctx.stroke(); }
  for (let y = 0; y <= H(); y++) { ctx.beginPath(); ctx.moveTo(0, y * c + 0.5); ctx.lineTo(W() * c, y * c + 0.5); ctx.stroke(); }
  const ring = (x, y, col, r = 0.38) => { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x * c + c / 2, y * c + c / 2, c * r, 0, Math.PI * 2); ctx.stroke(); };
  const rect = (r, col) => { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([5, 3]); ctx.strokeRect(r[0] * c + 1, r[1] * c + 1, r[2] * c - 2, r[3] * c - 2); ctx.setLineDash([]); };
  if (E.show.triggers) for (const t of d.triggers) if (t.when?.rect) rect(t.when.rect, '#ffb040');
  if (E.show.battles) for (const b of d.battles) { if (b.rect) rect(b.rect, '#ff6060'); for (const f of b.foes || []) ring(f[0], f[1], '#ff4040', 0.3); }
  for (const z of d.zones) if (z.rect) rect(z.rect, '#a050ff');
  if (E.show.objs) for (const o of d.objects) {
    ctx.fillStyle = o === E.sel ? '#ffffff' : { note: '#80d0ff', secret: '#c080ff', lever: '#ffa040', door: '#c08040', hatch: '#a08060', exit: '#60ff90' }[o.type] || '#ccc';
    ctx.fillRect(o.x * c + c * 0.2, o.y * c + c * 0.2, c * 0.6, c * 0.6);
    ctx.fillStyle = '#000'; ctx.fillText(o.type[0].toUpperCase(), o.x * c + c / 2, o.y * c + c / 2);
  }
  if (E.show.poi) for (const p of d.poi) ring(p.at[0], p.at[1], '#40e0e0', 0.45);
  if (d.goal) { ring(d.goal[0], d.goal[1], '#ffff40', 0.48); ring(d.goal[0], d.goal[1], '#ffff40', 0.3); }
  if (E.show.paths) {
    const cols = { direct: '#ffffff', flank: '#60c0ff', vertical: '#ffd040', hidden: '#d070ff' };
    for (const p of d.paths) {
      ctx.strokeStyle = cols[p.kind] || '#aaa'; ctx.lineWidth = p.id === E.path ? 3 : 1.5;
      ctx.beginPath();
      p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * c + c / 2, y * c + c / 2) : ctx.moveTo(x * c + c / 2, y * c + c / 2)));
      ctx.stroke();
    }
  }
  if (E.hover) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(E.hover[0] * c, E.hover[1] * c, c, c); }
}

// ---------------------------------------------------------------- editing
const objAt = (x, y) => E.def.objects.find((o) => o.x === x && o.y === y);
function nextId(type) {
  const base = `${E.def.id.replace(/^hm-/, '')}-${type}`;
  let i = 1;
  while (E.def.objects.some((o) => o.id === `${base}${i}`)) i++;
  return `${base}${i}`;
}
function apply(x, y, right, drag) {
  const d = E.def;
  if (x < 0 || y < 0 || x >= W() || y >= H()) return;
  if (right) { // eyedropper / delete
    const o = objAt(x, y);
    if (E.tool === 'obj' || E.tool === 'select') { if (o) { snapshot(); d.objects.splice(d.objects.indexOf(o), 1); E.sel = null; } }
    else if (E.tool === 'floor') E.brush = rows('floor')[y][x];
    else if (E.tool === 'elev') E.level = +rows('elev')[y][x] || 0;
    else if (E.tool === 'mark') E.mark = rows('objs')[y][x];
    else if (E.tool === 'poi') d.poi = d.poi.filter((p) => p.at[0] !== x || p.at[1] !== y);
    else if (E.tool === 'foe') for (const b of d.battles) b.foes = (b.foes || []).filter((f) => f[0] !== x || f[1] !== y);
    else if (E.tool === 'path') { const p = d.paths.find((q) => q.id === E.path); if (p) p.pts.pop(); }
    paintPalette(); refreshPaths(); syncJson(); draw(); return;
  }
  if (!drag) snapshot();
  switch (E.tool) {
    case 'floor': setAt('floor', x, y, E.brush); break;
    case 'elev': setAt('elev', x, y, String(E.level)); break;
    case 'mark': setAt('objs', x, y, E.mark); break;
    case 'obj': if (!drag && !objAt(x, y)) { E.sel = { id: nextId(E.otype), type: E.otype, x, y, ...JSON.parse(JSON.stringify(OBJ[E.otype])) }; d.objects.push(E.sel); } break;
    case 'select': if (!drag) E.sel = objAt(x, y) || null; break;
    case 'poi': if (!drag && !d.poi.some((p) => p.at[0] === x && p.at[1] === y)) d.poi.push({ at: [x, y], kind: 'view' }); break;
    case 'goal': d.goal = [x, y]; break;
    case 'foe': if (!drag) { if (!d.battles.length) d.battles.push({ id: 'battle1', kind: 'ambush', encounter: '', title: '', foes: [] }); d.battles[d.battles.length - 1].foes.push([x, y]); } break;
    case 'path': if (!drag) { let p = d.paths.find((q) => q.id === E.path); if (!p) { p = { id: 'p-direct', kind: 'direct', pts: [] }; d.paths.push(p); E.path = p.id; } p.pts.push([x, y]); refreshPaths(); } break;
    default:
  }
  $('obj').value = E.sel ? JSON.stringify(E.sel, null, 1) : '';
  syncJson(); draw();
}
function cellOf(ev) { const r = cv.getBoundingClientRect(); return [Math.floor((ev.clientX - r.left) / E.cell), Math.floor((ev.clientY - r.top) / E.cell)]; }
cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
cv.addEventListener('mousedown', (ev) => { E.down = ev.button === 0; apply(...cellOf(ev), ev.button === 2, false); });
cv.addEventListener('mousemove', (ev) => {
  const [x, y] = cellOf(ev);
  if (E.hover?.[0] !== x || E.hover?.[1] !== y) { E.hover = [x, y]; if (E.down && ['floor', 'elev', 'mark'].includes(E.tool)) apply(x, y, false, true); else draw(); }
});
window.addEventListener('mouseup', () => { if (E.down) { E.down = false; validate(); } });
cv.addEventListener('wheel', (ev) => { ev.preventDefault(); E.cell = Math.max(8, Math.min(48, E.cell + (ev.deltaY < 0 ? 2 : -2))); cv.width = W() * E.cell; cv.height = H() * E.cell; draw(); });
window.addEventListener('keydown', (ev) => {
  if (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT') return;
  if ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyZ' && E.undo.length) { E.def = JSON.parse(E.undo.pop()); E.sel = null; syncJson(); draw(); validate(); }
});

// ---------------------------------------------------------------- checker, save
function validate() {
  const r = validateHandmade(E.def, REFS);
  const esc = (s) => String(s).replace(/</g, '&lt;');
  $('status').innerHTML = `${r.errors.length ? `<span class="err">${r.errors.length} ошибок</span>` : '<span class="ok">ok</span>'}\n`
    + r.errors.map((e) => `<span class="err">• ${esc(e)}</span>`).join('\n') + (r.errors.length ? '\n' : '')
    + r.warnings.map((e) => `<span class="warn">• ${esc(e)}</span>`).join('\n') + `\n<small>${esc(JSON.stringify(r.stats))}</small>`;
  return r;
}
const jsonText = () => JSON.stringify(E.def, null, 1);
const moduleText = () => `// Hand-made map: ${E.def.name}. Format — world/handmade.js (level-design.md §7.2); edit — game/editor.html.\nexport default ${jsonText()};\n`;
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const copy = (text) => navigator.clipboard?.writeText(text).then(() => ($('status').textContent = 'Скопировано'), () => ($('status').textContent = 'Буфер недоступен: используйте «Скачать»'));

$('pick').innerHTML = HANDMADE_LIST.map((d) => `<option value="${d.id}">${d.id}</option>`).join('');
$('load').onclick = () => setDef(HANDMADE_LIST.find((d) => d.id === $('pick').value));
$('new').onclick = () => setDef(blank(+$('nw').value || 40, +$('nh').value || 30));
$('file').onchange = async (ev) => {
  const f = ev.target.files[0];
  if (!f) return;
  const txt = await f.text();
  try { setDef(JSON.parse(txt.replace(/^[\s\S]*?export default\s*/, '').replace(/;\s*$/, ''))); } catch (e) { $('status').textContent = `Не JSON: ${e.message}`; }
};
$('export').onclick = () => download(`${E.def.id}.json`, jsonText());
$('copy').onclick = () => copy(jsonText());
$('copyjs').onclick = () => copy(moduleText());
$('validate').onclick = () => validate();
$('jsonApply').onclick = () => {
  try { snapshot(); Object.assign(E.def, JSON.parse($('json').value)); E.sel = null; refreshPaths(); draw(); validate(); } catch (e) { $('status').textContent = `JSON: ${e.message}`; }
};
$('objApply').onclick = () => {
  if (!E.sel) return;
  try { snapshot(); const o = JSON.parse($('obj').value); const i = E.def.objects.indexOf(E.sel); E.def.objects[i] = o; E.sel = o; syncJson(); draw(); validate(); } catch (e) { $('status').textContent = `JSON: ${e.message}`; }
};
$('objDel').onclick = () => { if (!E.sel) return; snapshot(); E.def.objects.splice(E.def.objects.indexOf(E.sel), 1); E.sel = null; $('obj').value = ''; syncJson(); draw(); validate(); };
$('path').onchange = () => { E.path = $('path').value; draw(); };
$('pathNew').onclick = () => {
  const kinds = ['direct', 'flank', 'vertical', 'hidden'];
  const kind = kinds.find((k) => !E.def.paths.some((p) => p.kind === k)) || 'flank';
  const p = { id: `p-${kind}${E.def.paths.some((q) => q.id === `p-${kind}`) ? E.def.paths.length : ''}`, kind, pts: E.def.goal ? [] : [] };
  E.def.paths.push(p); E.path = p.id; E.tool = 'path'; paintTools(); paintPalette(); refreshPaths(); syncJson(); draw();
};
$('pathClear').onclick = () => { const p = E.def.paths.find((q) => q.id === E.path); if (p) { snapshot(); p.pts = []; refreshPaths(); syncJson(); draw(); } };
window.addEventListener('resize', () => { fit(); draw(); });

paintTools(); paintPalette();
setDef(HANDMADE_LIST[0]);
window.__editor = { E, setDef, validate, apply, moduleText };
