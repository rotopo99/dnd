// World map (world.md §2): node graph with routes, fog (only discovered nodes), travel along known routes with
// a day counter and encounter rolls (d20 ≤ 3 × danger + mod, shown in the map log), ambush check, encounters
// (battle / event check / trader / rumor / cache), hidden nodes found by Perception on arrival.
import { t } from '../data/text/index.js';
import { drawSprite, heroSpriteIds, idleFrame, drawMapIcon } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, fit, panel, button, hitButton, clear } from '../ui/draw.js';
import { openCheck, openGroupCheck } from '../ui/checks-ui.js';
import { LOCATIONS, REGIONS, FUTURE_REGIONS, ROUTES, ITEMS, SHOP_STOCK, AMBUSH, encounterName, npcGreeting } from '../world/data.js';
import { NPCS } from '../data/npcs.js';
import { repTier, factionName, normFaction } from '../world/reputation.js';
import {
  members, visit, routesFrom, otherEnd, isKnownRoute, encounterThreshold, pickEncounter,
  grant, discover, journal, locFaction, hasFlagInParty, requiresOk,
} from '../world/state.js';
import { onArrive } from '../world/quests.js';
import { startWorldBattle } from './world-battle.js';
import { runEvent, travelEvents } from './event.js';
import { createLocationScene, tierColor } from './location.js';
import { saveGame } from '../save.js';

const TRAVEL_DAY_S = 0.55;

/** Shortest path by days over known routes. Returns [routes] or null. */
function findRoute(save, from, to) {
  const dist = { [from]: 0 }, prev = {};
  const open = [from];
  while (open.length) {
    open.sort((a, b) => dist[a] - dist[b]);
    const cur = open.shift();
    if (cur === to) break;
    for (const r of routesFrom(cur)) {
      if (!isKnownRoute(save, r)) continue;
      const o = otherEnd(r, cur);
      const d = dist[cur] + r.days + 0.01;
      if (dist[o] == null || d < dist[o]) { dist[o] = d; prev[o] = { r, from: cur }; open.push(o); }
    }
  }
  if (dist[to] == null) return null;
  const out = [];
  for (let c = to; c !== from; c = prev[c].from) out.unshift({ r: prev[c].r, from: prev[c].from, to: c });
  return out;
}

export function createWorldMapScene() {
  const S = { time: 0, hover: null, hoverNode: null, travel: null, log: [], buttons: [] };
  let self;
  const save = (game) => game.save;

  function layout(game) {
    const W = game.width, H = game.height;
    S.area = { x: 60, y: 96, w: W - 120, h: H - 96 - 170 };
    S.sx = S.area.w / 1000;
    S.sy = S.area.h / 700;
    S.buttons = [
      { id: 'enter', label: t('map.enter'), key: 'Enter' },
      { id: 'party', label: t('panel.party'), key: 'P' },
      { id: 'rep', label: t('panel.rep'), key: 'R' },
      { id: 'journal', label: t('panel.journal'), key: 'J' },
      { id: 'menu', label: t('loc.toMenu'), key: 'Esc' },
    ];
    S.buttons.forEach((b, i) => Object.assign(b, { x: W - 40 - (5 - i) * 140, y: H - 64, w: 132, h: 44 }));
  }
  const px = (p) => S.area.x + p.x * S.sx;
  const py = (p) => S.area.y + p.y * S.sy;

  function log(segText, color = '4') {
    S.log.push({ text: segText, color });
    if (S.log.length > 5) S.log.shift();
  }
  const bindLog = (game) => { S.log = game.mapLog || (game.mapLog = []); };

  // ---------------------------------------------------------------- travel
  function startTravel(game, to) {
    const sv = save(game);
    if (to === sv.location) return enterLocation(game);
    const hops = findRoute(sv, sv.location, to);
    if (!hops) { game.toast(t('map.noRoute'), 'c'); return; }
    S.travel = { hops, i: 0, t: 0, day: 0 };
    play('uiClick');
  }

  function stepTravel(game, dt) {
    const tr = S.travel;
    const hop = tr.hops[tr.i];
    const dur = Math.max(0.25, hop.r.days * TRAVEL_DAY_S);
    tr.t += dt;
    // every day on the road: day counter + encounter roll
    while (tr.day < hop.r.days && tr.t >= (tr.day + 1) * TRAVEL_DAY_S) {
      tr.day++;
      save(game).day++;
      const ev = travelEvents(save(game), LOCATIONS[hop.to].region)[0];
      if (ev) { S.paused = true; runEvent(game, ev, (g) => { g.resume(self); S.paused = false; }); return; }
      if (rollEncounter(game, hop)) return;
    }
    if (!hop.r.days && !tr.checked0) { tr.checked0 = true; if (rollEncounter(game, hop)) return; }
    if (tr.t >= dur) arriveHop(game);
  }

  function rollEncounter(game, hop) {
    const sv = save(game);
    const th = encounterThreshold(sv, hop.r, game.data);
    if (!th.need) return false;
    const roll = 1 + Math.floor(Math.random() * 20);
    const hit = roll <= th.need;
    log(`${t('world.day')} ${sv.day}: d20 = ${roll} ${t('map.vs')} ≤ ${th.need} (3×${th.danger}${th.mod ? ` ${th.mod > 0 ? '+' : '−'}${Math.abs(th.mod)}` : ''}) — ${hit ? t('map.encounter') : t('map.quiet')}`, hit ? 'c' : '4');
    if (!hit) return false;
    const reg = LOCATIONS[hop.to].region;
    const e = pickEncounter(sv, reg);
    if (!e) return false;
    S.paused = true;
    handleEncounter(game, e, reg, () => { S.paused = false; });
    return true;
  }

  function handleEncounter(game, e, reg, resume) {
    const sv = save(game);
    const ms = members(sv, game.data);
    const card = (title, ls, then) => game.openModal({ title, lines: ls, onCancel: false, options: [{ label: t('battle.continue'), run: then }] });
    const outcomeOf = (g, r, ok) => {
      if (!r) return resume();
      const fin = (g2) => {
        for (const x of grant(sv, { xp: r.xp, credits: r.credits, rep: r.rep, items: r.items, flag: r.flag, hp: r.hp, mrl: r.mrl }, g2.data)) g2.toast(x.text, x.color);
        saveGame(sv);
        card(ok ? t('check.success') : t('check.fail'), [{ text: r.text || '', color: ok ? 'j' : 'c' }], () => resume());
      };
      if (r.battle) startWorldBattle(g, { encounter: r.battle, onWin: (g2) => { g2.resume(self); fin(g2); } });
      else fin(g);
    };
    if (e.kind === 'battle') {
      const fight = (ambush) => startWorldBattle(game, {
        encounter: e.encounter, title: `${t('map.road')}: ${encounterName(e.encounter)}`, faction: e.faction, ambush,
        onWin: (g) => { g.resume(self); resume(); },
      });
      const go = () => {
        if (hasFlagInParty(sv, game.data, 'no-ambush')) { game.toast(t('map.noAmbush'), 'j'); fight(false); return; }
        openGroupCheck(game, { title: t('map.ambushCheck'), lines: [{ text: t('map.ambushText') }], skill: AMBUSH.skill, dc: AMBUSH.dc, members: ms,
          onDone: (g, ok) => { if (!ok) g.toast(t('map.ambush'), 'c'); fight(!ok); } });
      };
      card(t('map.encounterBattle'), [{ text: encounterName(e.encounter), color: 'c' }, ...(e.faction ? [{ text: factionName(e.faction), color: '4' }] : [])], go);
      return;
    }
    if (e.kind === 'event') {
      const c = e.check;
      const opener = c.group ? openGroupCheck : openCheck;
      opener(game, { title: t('map.event'), lines: [{ text: e.text }], skill: c.skill, skills: c.skills, dc: c.dc, members: ms,
        onDone: (g, ok) => outcomeOf(g, ok ? e.success : e.fail, ok) });
      return;
    }
    if (e.kind === 'trader') {
      const stock = e.stock || SHOP_STOCK;
      game.openModal({
        width: 900,
        build: () => ({
          title: e.friendly ? `${t('map.trader')} (${factionName(e.friendly)})` : t('map.trader'), lines: [{ text: `${t('world.credits')}: ${sv.hero.credits}`, color: 'b' }],
          options: [...stock.filter((id) => ITEMS[id]).map((id) => ({ label: `${ITEMS[id].name} — ${ITEMS[id].price}`, sub: ITEMS[id].desc, keep: true, disabled: sv.hero.credits < ITEMS[id].price,
            run: () => { sv.hero.credits -= ITEMS[id].price; sv.hero.items[id] = (sv.hero.items[id] || 0) + 1; play('buff'); } })),
          { label: t('loc.close'), run: () => resume() }],
        }),
        onCancel: () => resume(),
      });
      return;
    }
    if (e.kind === 'rumor') {
      const pool = Object.values(LOCATIONS).filter((l) => l.region === reg && !sv.discovered.includes(l.id) && !l.requires);
      const l = pool[Math.floor(Math.random() * pool.length)];
      if (l) { discover(sv, l.id); journal(sv, `${t('loc.rumorFound')}: ${l.name}`); }
      card(t('map.rumor'), [{ text: l ? `${t('loc.rumorFound')}: ${l.name}` : t('loc.noRumor') }], () => resume());
      return;
    }
    if (e.kind === 'npc') {
      const n = NPCS[e.npc];
      const g0 = npcGreeting(n, repTier(sv.rep[normFaction(n.faction)]));
      card(`${t('map.stranger')}: ${n.name}`, [{ text: n.role || '', color: '4' }, { text: `«${g0.text}»` }], () => resume());
      return;
    }
    resume();
  }

  function arriveHop(game) {
    const sv = save(game);
    const tr = S.travel;
    const hop = tr.hops[tr.i];
    visit(sv, hop.to);
    findHidden(game, hop.to);
    tr.i++; tr.t = 0; tr.day = 0; tr.checked0 = false;
    for (const x of onArrive(sv, hop.to, game.data)) game.toast(x.text, x.color);
    saveGame(sv);
    if (tr.i >= tr.hops.length) { S.travel = null; enterLocation(game); }
  }

  /** Hidden neighbours: party flags reveal them, otherwise the best Perception in the party (passive). */
  function findHidden(game, id) {
    const sv = save(game);
    for (const r of routesFrom(id)) {
      const o = otherEnd(r, id);
      const l = LOCATIONS[o];
      if (!l?.hidden || sv.discovered.includes(o)) continue;
      const byFlag = l.hidden.flags?.some((f) => hasFlagInParty(sv, game.data, f));
      let ok = byFlag;
      if (!ok && l.hidden.check) {
        const best = Math.max(...members(sv, game.data).map((m) => Math.floor(((m.unit.stats.per ?? 10) - 10) / 2)));
        const roll = 1 + Math.floor(Math.random() * 20);
        ok = roll + best >= l.hidden.check.dc;
        log(`${t('map.hiddenCheck')}: d20 = ${roll} ${best >= 0 ? '+' : '−'}${Math.abs(best)} ${t('map.vs')} ${t('battle.dc')} ${l.hidden.check.dc} — ${ok ? t('check.success') : t('check.fail')}`, ok ? 'j' : '4');
      }
      if (ok) { discover(sv, o); game.toast(`${t('map.hiddenFound')}: ${l.name}`, 'a'); journal(sv, `${t('map.hiddenFound')}: ${l.name}`); }
    }
  }

  function enterLocation(game) {
    game.setScene(createLocationScene(save(game).location));
  }

  function nav(game, id) {
    if (id === 'enter') return enterLocation(game);
    if (id === 'menu') { saveGame(save(game)); return import('./menu.js').then((m) => game.setScene(m.menuScene)); }
    return import('./panels.js').then((m) => game.setScene(m.createPanelsScene({ tab: id, back: self })));
  }

  self = {
    id: 'worldmap',
    S,
    enter(game) { bindLog(game); layout(game); },
    resume(game) { layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      S.time += dt;
      const sv = save(game);
      if (S.travel) { if (!S.paused) stepTravel(game, dt); return; }
      const inp = game.input;
      const m = inp.mouse;
      S.hover = hitButton(S.buttons, m);
      S.hoverNode = null;
      if (!S.hover && m.inside) {
        for (const id of sv.discovered) {
          const l = LOCATIONS[id];
          if (l && Math.hypot(px(l.pos) - m.x, py(l.pos) - m.y) < 20) { S.hoverNode = id; break; }
        }
      }
      if (m.clicked) {
        if (S.hover) { play('uiClick'); nav(game, S.hover.id); return; }
        if (S.hoverNode) startTravel(game, S.hoverNode);
      }
      if (inp.wasPressed('Enter')) nav(game, 'enter');
      else if (inp.wasPressed('KeyP')) nav(game, 'party');
      else if (inp.wasPressed('KeyR')) nav(game, 'rep');
      else if (inp.wasPressed('KeyJ')) nav(game, 'journal');
      else if (inp.wasPressed('Escape')) nav(game, 'menu');
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      const sv = save(game);
      clear(ctx, W, H);
      text(ctx, t('map.title'), 40, 16, C.h, FONT_L);
      text(ctx, `${t('world.day')} ${sv.day} · ${t('world.credits')} ${sv.hero.credits} · ${t('world.level')} ${sv.hero.level}`, W - 40, 22, C.b, FONT_B, 'right');
      // region labels
      for (const reg of Object.values(REGIONS)) {
        const locs = Object.values(LOCATIONS).filter((l) => l.region === reg.id && sv.discovered.includes(l.id));
        if (!locs.length) continue;
        const cx = locs.reduce((s, l) => s + l.pos.x, 0) / locs.length, top = Math.min(...locs.map((l) => l.pos.y));
        ctx.font = FONT_B;
        drawMapIcon(ctx, `region-${reg.id}`, px({ x: cx }) - 8 - ctx.measureText(reg.name).width / 2 - 14, py({ y: top }) - 50, 1);
        text(ctx, reg.name, px({ x: cx }), py({ y: top }) - 48, C['3'], FONT_B, 'center');
      }
      // routes
      ctx.lineWidth = 2;
      for (const r of ROUTES) {
        if (!isKnownRoute(sv, r)) continue;
        const a = LOCATIONS[r.from].pos, b = LOCATIONS[r.to].pos;
        const near = r.from === sv.location || r.to === sv.location;
        ctx.strokeStyle = near ? C['4'] : C['2'];
        ctx.setLineDash(r.hidden ? [4, 4] : []);
        ctx.beginPath(); ctx.moveTo(px(a), py(a)); ctx.lineTo(px(b), py(b)); ctx.stroke();
        if (r.days > 0) {
          const mx = (px(a) + px(b)) / 2, my = (py(a) + py(b)) / 2;
          text(ctx, `${r.days}${t('map.dayShort')}`, mx, my - 18, C['4'], '12px monospace', 'center');
          for (let k = 0; k < r.danger; k++) { ctx.fillStyle = C.c; ctx.fillRect(mx - r.danger * 4 + k * 8, my - 4, 6, 6); }
        }
      }
      ctx.setLineDash([]);
      // nodes (current location first so its label wins)
      const labels = S.labels || (S.labels = []);
      labels.length = 0;
      for (const d of sv.discovered) { const l = LOCATIONS[d]; if (l) labels.push({ x: px(l.pos) - 19, y: py(l.pos) - 19, w: 38, h: 38 }); }
      for (const id of [sv.location, ...sv.discovered.filter((d) => d !== sv.location)]) {
        const l = LOCATIONS[id];
        if (!l || (l.requires && !requiresOk(sv, l.requires))) continue;
        const x = px(l.pos), y = py(l.pos);
        const visited = sv.visited.includes(id);
        const f = locFaction(id);
        const frame = f && sv.rep[f] != null ? tierColor(repTier(sv.rep[f])) : C['4'];
        const st = l.terminal ? sv.terminals[l.terminal.id] : null;
        const iconId = !visited ? 'fog' : st ? `terminal-${st}` : id.startsWith('beacon') ? 'beacon' : id.startsWith('burg') ? 'burg' : l.kind;
        ctx.strokeStyle = S.hoverNode === id ? C['5'] : frame;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 18, y - 18, 36, 36);
        drawMapIcon(ctx, iconId, x - 16, y - 16, 2);
        if (st && !visited) drawMapIcon(ctx, `terminal-${st}`, x - 8, y - 8, 1);
        // labels: greedy placement, skipped when they would overlap (the hover card shows the name anyway)
        ctx.font = '12px monospace';
        const name = fit(ctx, l.name, 150, '12px monospace');
        const lw = ctx.measureText(name).width;
        const rect = { x: x - lw / 2 - 2, y: y + 20, w: lw + 4, h: 14 };
        const force = id === sv.location || id === S.hoverNode;
        if (force || !labels.some((r) => r.x < rect.x + rect.w && rect.x < r.x + r.w && r.y < rect.y + rect.h && rect.y < r.y + r.h)) {
          labels.push(rect);
          text(ctx, name, x, y + 21, visited ? C['5'] : C['3'], '12px monospace', 'center');
        }
      }
      // hero marker (or travelling dot)
      let hp = LOCATIONS[sv.location].pos;
      if (S.travel) {
        const hop = S.travel.hops[S.travel.i];
        const a = LOCATIONS[hop.from].pos, b = LOCATIONS[hop.to].pos;
        const k = Math.min(1, S.travel.t / Math.max(0.25, hop.r.days * TRAVEL_DAY_S));
        hp = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      drawMapIcon(ctx, 'party', px(hp) - 8, py(hp) - 44, 1);
      drawSprite(ctx, heroSpriteIds(sv.hero.race, sv.hero.cls), px(hp) - 16, py(hp) - 50, 2, { frame: idleFrame(S.time * 1000) });
      // hover card
      if (S.hoverNode) {
        const l = LOCATIONS[S.hoverNode];
        const f = locFaction(S.hoverNode);
        const hops = findRoute(sv, sv.location, S.hoverNode);
        const days = hops ? hops.reduce((s, h) => s + h.r.days, 0) : null;
        const lines = [
          { text: l.name, color: C.h, font: FONT_B },
          { text: REGIONS[l.region]?.name || '', color: C['4'] },
          ...(f ? [{ text: `${factionName(f)}: ${t(`tier.${repTier(sv.rep[f])}`)}`, color: tierColor(repTier(sv.rep[f])) }] : []),
          { text: hops ? `${t('map.way')}: ${days} ${t('map.days')}, ${hops.length} ${t('map.hops')}` : t('map.noRoute'), color: hops ? C['5'] : C.c },
          ...(l.terminal ? [{ text: `${t('map.terminal')}: ${t(`term.${sv.terminals[l.terminal.id]}`)}`, color: C.n }] : []),
          ...(l.services.length ? [{ text: l.services.map((s) => t(`svc.${s}`)).join(', '), color: C['4'] }] : []),
        ];
        const w = 300, h = 16 + lines.length * LINE;
        const x = Math.min(W - w - 8, px(l.pos) + 20), y = Math.min(H - h - 160, Math.max(8, py(l.pos) - 20));
        panel(ctx, x, y, w, h, C['0'], C['3']);
        lines.forEach((ln, i) => text(ctx, fit(ctx, ln.text, w - 20, ln.font || FONT), x + 10, y + 8 + i * LINE, ln.color, ln.font || FONT));
      }
      // log
      panel(ctx, 40, H - 140, W - 80 - 5 * 140 - 16, 120, C['1'], C['2']);
      S.log.forEach((l, i) => text(ctx, fit(ctx, l.text, W - 80 - 5 * 140 - 40), 52, H - 132 + i * LINE, C[l.color] || C['4']));
      if (!S.log.length) text(ctx, t('map.hint'), 52, H - 132, C['3']);
      for (const b of S.buttons) button(ctx, b, S.hover === b);
      text(ctx, `${t('map.here')}: ${LOCATIONS[sv.location].name}`, W - 40, H - 92, C['4'], FONT, 'right');
    },
  };
  return self;
}
