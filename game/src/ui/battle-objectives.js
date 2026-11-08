// Battle objectives on screen (combat-rework.md §6, §9; stage 2): markers on the map — exits 'D', hold zone, cargo,
// captive / terminal / chest props, the assassination target — with hover tips, and the objectives panel (bottom-left of
// the map area). State: S.b.objectives (rules/objectives.js). Called by ui/battle-view.js.
import { t } from '../data/text/index.js';
import { C, FONT, FONT_B, text, fit, panel } from './draw.js';
import { hotspot } from './tooltip.js';

const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const tf = (key, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), t(key));

/** Text of the current goal line: «Удержать точку 1/3». */
function goalLine(b, g) {
  const name = t(`obj.${g.id}.name`);
  if (g.state !== 'active') return `${name} — ${t(`obj.state.${g.state}`)}`;
  switch (g.id) {
    case 'rescue': return `${name}: ${Math.min(b.round, g.need)}/${g.need}`;
    case 'terminal': return `${name}: ${g.progress}/${g.need}`;
    case 'hold': return `${name}: ${g.progress}/${g.need}`;
    case 'assassinate': return `${name}: ${b.byId[g.target]?.fleeing ? t('obj.state.warn') : `${Math.min(b.round, g.need)}/${g.need}`}`;
    case 'speed': return `${name}: ${Math.min(b.round, g.need)}/${g.need}`;
    case 'nofire': return `${name}: ${g.cargo.length}`;
    default: return name;
  }
}

function goalTip(b, g) {
  const C2 = b.data.combat?.objectives?.[g.id] || {};
  const rw = g.reward || {};
  const lines = [tf(`obj.${g.id}.goal`, { n: g.need, dc: g.dc ?? '' })];
  const r = [];
  if (rw.xp) r.push(tf('obj.rewardXp', { n: Math.round(rw.xp * 100) }));
  if (rw.loot) r.push(tf('obj.rewardLoot', { n: rw.loot }));
  if (rw.credits) r.push(tf('obj.rewardCredits', { n: Math.round(rw.credits * 100) }));
  if (rw.rep) r.push(tf('obj.rewardRep', { n: rw.rep }));
  if (r.length) lines.push({ text: `${t('obj.reward')}: ${r.join(', ')}`, color: 'j' });
  if (C2.failRep) lines.push({ text: tf('obj.failRep', { n: C2.failRep }), color: 'c' });
  if (g.reason) lines.push({ text: t(`obj.why.${g.reason}`), color: '4' });
  return { title: t(`obj.${g.id}.name`), lines };
}

/** Markers on the map layer (under units). */
export function drawObjectiveMarkers(ctx, S) {
  const b = S.b, L = S.L, O = b.objectives;
  if (!O) return;
  const c = L.cell, k = c / 16;
  const px = (x) => L.mapX + x * c, py = (y) => L.mapY + y * c;
  const pulse = 0.5 + 0.5 * Math.sin(S.time * 4);
  // exits
  for (const e of O.exits) {
    ctx.fillStyle = rgba(O.exitLock ? C.c : C.j, 0.22 + 0.12 * pulse);
    ctx.fillRect(px(e.x), py(e.y), c, c);
    ctx.strokeStyle = O.exitLock ? C.c : C.j; ctx.lineWidth = 2;
    ctx.strokeRect(px(e.x) + 1, py(e.y) + 1, c - 2, c - 2);
    text(ctx, O.exitLock ? '×' : 'D', px(e.x) + c / 2, py(e.y) + c / 2 - 8, O.exitLock ? C.c : C.j, FONT_B, 'center');
  }
  const g = O.goal;
  const active = g && g.state === 'active';
  if (active && g.id === 'hold') {
    ctx.fillStyle = rgba(C.a, 0.16 + 0.08 * pulse);
    for (const z of g.zone) ctx.fillRect(px(z.x), py(z.y), c, c);
    ctx.strokeStyle = C.a; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    for (const z of g.zone) ctx.strokeRect(px(z.x) + 2, py(z.y) + 2, c - 4, c - 4);
    ctx.setLineDash([]);
  }
  if (active && g.id === 'nofire') {
    ctx.strokeStyle = C.e; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    for (const p of g.cargo) ctx.strokeRect(px(p.x) + 1, py(p.y) + 1, c - 2, c - 2);
    ctx.setLineDash([]);
  }
  for (const p of O.props) {
    const x = px(p.x), y = py(p.y);
    if (p.kind === 'captive') {
      ctx.fillStyle = C['8']; ctx.fillRect(x + 6 * k, y + 7 * k, 4 * k, 7 * k); // body
      ctx.fillStyle = C['9']; ctx.fillRect(x + 6 * k, y + 3 * k, 4 * k, 4 * k); // head
      ctx.strokeStyle = C['4']; ctx.lineWidth = Math.max(1, k); // rope
      ctx.beginPath(); ctx.moveTo(x + 5 * k, y + 9 * k); ctx.lineTo(x + 11 * k, y + 11 * k); ctx.moveTo(x + 5 * k, y + 11 * k); ctx.lineTo(x + 11 * k, y + 9 * k); ctx.stroke();
      if (active) { ctx.strokeStyle = rgba(C.j, 0.5 + 0.5 * pulse); ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, c - 2, c - 2); }
    } else if (p.kind === 'terminal') {
      ctx.fillStyle = C['2']; ctx.fillRect(x + 3 * k, y + 2 * k, 10 * k, 12 * k);
      ctx.fillStyle = p.hacked ? C.j : rgba(C.h, 0.6 + 0.4 * pulse); ctx.fillRect(x + 4 * k, y + 3 * k, 8 * k, 5 * k);
      if (active) {
        ctx.fillStyle = C['0']; ctx.fillRect(x + 4 * k, y + 10 * k, 8 * k, 2 * k);
        ctx.fillStyle = C.h; ctx.fillRect(x + 4 * k, y + 10 * k, (8 * k * g.progress) / g.need, 2 * k);
      }
    } else if (p.kind === 'chest') {
      ctx.fillStyle = C['7']; ctx.fillRect(x + 2 * k, y + (p.open ? 7 : 5) * k, 12 * k, (p.open ? 7 : 9) * k);
      ctx.fillStyle = p.open ? C['6'] : C['8']; ctx.fillRect(x + 2 * k, y + (p.open ? 3 : 5) * k, 12 * k, 3 * k);
      if (!p.open) { ctx.fillStyle = C.b; ctx.fillRect(x + 7 * k, y + 8 * k, 2 * k, 3 * k); }
    }
  }
  if (active && g.id === 'assassinate') {
    const u = b.byId[g.target];
    if (u && !u.dead && !u.removed) {
      const d = S.dispOf(u);
      const cx = L.mapX + (d.x + 0.5) * c, cy = L.mapY + (d.y + 0.5) * c, r = c * 0.48;
      ctx.strokeStyle = u.fleeing ? C.c : C.a; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(cx + dx * r * 0.6, cy + dy * r * 0.6); ctx.lineTo(cx + dx * r * 1.15, cy + dy * r * 1.15); }
      ctx.stroke();
    }
  }
  // tips for the hovered cell
  const hc = S.hover?.cell;
  if (!hc) return;
  const at = (list) => list && list.find((p) => p.x === hc.x && p.y === hc.y);
  const tip = (spec) => hotspot(px(hc.x), py(hc.y), c, c, spec);
  const p = at(O.props);
  if (p) {
    if (p.kind === 'captive') tip({ title: t('obj.captive'), lines: [t('obj.captiveHint'), ...(g ? goalTip(b, g).lines : [])] });
    else if (p.kind === 'terminal') tip({ title: t('obj.terminal'), lines: [t('obj.terminalHint'), ...(g ? goalTip(b, g).lines : [])] });
    else tip({ title: t(p.open ? 'obj.chestOpenTitle' : 'obj.chest'), lines: [p.open ? t('obj.chestLoot') : tf('obj.chestHint', { dc: p.dc })] });
  } else if (at(O.exits)) tip({ title: t('obj.exit'), lines: [O.exitLock ? { text: t('obj.exitLocked'), color: 'c' } : t('obj.exitHint')] });
  else if (active && g.id === 'hold' && at(g.zone)) tip(goalTip(b, g));
  else if (active && g.id === 'nofire' && at(g.cargo)) tip({ title: t('obj.cargo'), lines: [t('obj.cargoHint')] });
}

/**
 * Objectives panel: main goal, optional goal with progress / state, chests, retreat. A column left of the map when the
 * margin is wide enough, else one strip right above the map (1280×720: the map fills the area).
 */
export function drawObjectivePanel(ctx, S) {
  const b = S.b, L = S.L, O = b.objectives;
  if (!O || S.result) return;
  const g = O.goal;
  const rows = [{ s: `• ${t('obj.main')}`, col: C['5'] }];
  if (g) rows.push({ s: `${g.state === 'done' ? '✓' : g.state === 'fail' ? '✗' : '★'} ${goalLine(b, g)}`, col: g.state === 'done' ? C.j : g.state === 'fail' ? C.c : C.a, goal: true });
  if (O.chests) rows.push({ s: `▣ ${t('obj.chests')}: ${O.chestsOpened}/${O.chests}`, col: C.b });
  if (O.exits.length) rows.push({ s: `⇦ ${O.exitLock ? t('obj.exitLocked') : t('obj.retreatLine')}`, col: O.exitLock ? C['4'] : C.j });
  if (rows.length < 2) return;
  const margin = L.mapX - L.area.x - 16;
  ctx.font = FONT;
  if (margin >= 236) {
    const w = Math.min(340, margin);
    const h = 30 + rows.length * 20;
    const x = L.area.x + 8, y = L.mapY;
    panel(ctx, x, y, w, h, rgba(C['0'], 0.85), C['3']);
    text(ctx, t('obj.panel'), x + 8, y + 6, C['4'], FONT_B);
    rows.forEach((r, i) => {
      text(ctx, fit(ctx, r.s, w - 16), x + 8, y + 28 + i * 20, r.col, FONT);
      if (r.goal) hotspot(x, y + 26 + i * 20, w, 20, () => goalTip(b, g));
    });
    return;
  }
  // strip above the map: «Цели боя: ★ … · ▣ … · ⇦ …» (the main goal is implied)
  const list = rows.slice(1);
  const h = 24, y = Math.max(L.area.y + 2, L.mapY - h - 4), x = L.mapX, w = L.map.w;
  panel(ctx, x, y, w, h, rgba(C['0'], 0.85), C['3']);
  let cx = x + 8;
  text(ctx, `${t('obj.panel')}:`, cx, y + 3, C['4'], FONT_B);
  ctx.font = FONT_B; cx += ctx.measureText(`${t('obj.panel')}:`).width + 10;
  ctx.font = FONT;
  const room = (x + w - 8 - cx - (list.length - 1) * 20) / list.length;
  for (const r of list) {
    const s2 = fit(ctx, r.s, Math.max(60, r.goal ? room * 1.4 : room * 0.8));
    const sw = ctx.measureText(s2).width;
    text(ctx, s2, cx, y + 4, r.col, FONT);
    if (r.goal) hotspot(cx, y, sw, h, () => goalTip(b, g));
    cx += sw + 20;
  }
}
