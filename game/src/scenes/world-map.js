// World map v3 (world.md §1–2, контракт UI): canon map image (game/assets/world-map.jpg, 2× of MAP_SPACE 1536×762)
// with nodes at `px`, fog of the unknown, routes styled by kind (road / trail / wild / sea / lake / tunnel / district),
// pan (drag, WASD / arrows) and zoom (wheel, +/− buttons). Travel along known routes: days, sea fare, `route.rolls`
// encounter rolls per hop (d20 ≤ 3 × danger + mod, shown in the map log), ambush, encounters, hidden nodes by Perception.
import { baseOpen, BASE_LOC, modFx as baseFx } from '../world/base.js';
import { t } from '../data/text/index.js';
import { drawSprite, heroSpriteIds, idleFrame, drawMapIcon } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, fit, wrap, panel, button, hitButton, clear, flowButtons, buttonWidth } from '../ui/draw.js';
import { LOCATIONS, REGIONS, ROUTES, ENCOUNTER_MODS, MAP_SPACE, MAP_NODES, FARE, TIER_NAMES, encounterName, resolveLocation, locationLore } from '../world/data.js';
import { checkInfo, checkChance, rollCheck } from '../world/checks.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
import { repTier, factionName, tierAtLeast } from '../world/reputation.js';
import {
  members, visit, routesFrom, otherEnd, isKnownRoute, encounterThreshold, pickEncounter, partyFlagSet, openHidden,
  journal, locFaction, requiresOk, stigmaRep, tf, grant,
} from '../world/state.js';
import { onArrive, questTargets } from '../world/quests.js';
import { runEvent, travelEvents } from './event.js';
import { runEncounter } from './encounter.js';
import { tierColor } from './location.js';
import { createNodeScene } from './roam.js';
import { saveGame } from '../save.js';
import { passDays, exodusHud, travelWarning } from '../world/exodus.js';
import { startExodusZero, openExodusRadio } from './exodus-zero.js';
import { roadUses } from '../world/skill-uses.js';
import { EXODUS_UI } from '../data/text/exodus.js';
import { hotspot } from '../ui/tooltip.js';
import { openPauseMenu } from '../ui/save-ui.js';
import { nodeMark, closedLoc, TONE_COLOR } from '../world/consequences.js';
import { hunterEncounter, hunterBonus } from '../world/crime.js';
import { openRestMenu, canCampAt } from './rest.js';
import { restState, provisionCount } from '../world/rest.js';

const restHud = (sv) => { const st = restState(sv); return tf('rest.hud', { n: st.short, max: st.max, food: provisionCount(sv) }); };

const SMALL_FONT = '12px monospace', SMALL_LINE = 16, CARD_DESC_LINES = 5;

const TRAVEL_DAY_S = 0.55;
const MAP_IMG = new URL('../../assets/world-map.jpg', import.meta.url).href;
const ZOOM_MAX = 4;
const BOTTOM = 178, TOP = 52;
const PAN_KEYS = 600; // screen px / s
/** District nodes are drawn on a ring around their parent (they share its map point). */
const RING = 40;

let IMG = null;
function mapImage() {
  if (!IMG && typeof Image !== 'undefined') { IMG = new Image(); IMG.src = MAP_IMG; }
  return IMG && IMG.complete && IMG.naturalWidth ? IMG : null;
}

/** Night travel: one day less on routes of 2+ days (world.md §2). */
const hopDays = (r, night) => (night && r.days >= 2 ? r.days - 1 : r.days);
/** Days of hop i of a trip: night travel, Endurance forced march (march hop −1, min 1). */
const tripDays = (tr, i) => { const d = hopDays(tr.hops[i].r, tr.night); return tr.march === i ? Math.max(1, d - 1) : d; };

/** Sea / canoe fare (travel.js FARE): pirates friendly −50%, ally — free. */
export function routeFare(save, r) {
  if (!r.fare) return 0;
  const tier = repTier(save.rep.pirates);
  const k = tierAtLeast(tier, 'ally') ? FARE.allyMult : tierAtLeast(tier, 'friendly') ? FARE.friendlyMult : 1;
  return Math.round(r.fare * k);
}

/** Shortest path by days over known routes. Returns [{ r, from, to }] or null. */
export function findRoute(save, from, to, pflags) {
  from = resolveLocation(from); to = resolveLocation(to);
  const dist = { [from]: 0 }, prev = {};
  const open = [from];
  while (open.length) {
    open.sort((a, b) => dist[a] - dist[b]);
    const cur = open.shift();
    if (cur === to) break;
    for (const r of routesFrom(cur)) {
      if (!isKnownRoute(save, r, pflags)) continue;
      const o = otherEnd(r, cur);
      if (closedLoc(save, o)) continue; // world-consequences.md: access.close
      const d = dist[cur] + r.days + 0.01;
      if (dist[o] == null || d < dist[o]) { dist[o] = d; prev[o] = { r, from: cur }; open.push(o); }
    }
  }
  if (dist[to] == null) return null;
  const out = [];
  for (let c = to; c !== from; c = prev[c].from) out.unshift({ r: prev[c].r, from: prev[c].from, to: c });
  return out;
}

const ROUTE_STYLE = {
  road: { dash: [], w: 2.5, color: '5' },
  trail: { dash: [7, 5], w: 2, color: '4' },
  wild: { dash: [2, 5], w: 2, color: '4' },
  sea: { dash: [12, 7], w: 2, color: 'b' },
  canoe: { dash: [12, 7], w: 2, color: 'b' },
  lake: { dash: [12, 7], w: 2, color: 'h' },
  tunnel: { dash: [3, 3], w: 2, color: 'n' },
  district: { dash: [], w: 1, color: '3' },
};
const LABEL_FONT = { capital: 'bold 15px monospace', city: 'bold 13px monospace', town: '13px monospace', village: '12px monospace', hamlet: '11px monospace' };
const LABEL_ZOOM = { capital: 0, city: 0, town: 1.1, village: 1.5, hamlet: 1.9, poi: 2.2 };

function iconOf(l, sv, visited, pflags) {
  const st = l.terminal ? sv.terminals[l.terminal.id] : null;
  if (!visited) return st && pflags.has('terminal-scan') ? `terminal-${st}` : 'fog';
  if (st) return `terminal-${st}`;
  if (l.id.startsWith('beacon')) return 'beacon';
  if (l.kind === 'sea') return 'danger';
  return l.kind;
}

export function createWorldMapScene() {
  /** Reputation as the faction sees the party (gear stigma, v3.1). */
  const repOf = (sv, f) => Math.max(-100, Math.min(100, (sv.rep[f] ?? 0) + (S.stigma?.[f] || 0)));
  const S = { time: 0, hover: null, hoverNode: null, travel: null, log: [], buttons: [], cam: null, drag: null };
  let self;
  const save = (game) => game.save;

  // ---------------------------------------------------------------- camera
  const fitZoom = () => Math.min(S.area.w / MAP_SPACE.w, S.area.h / MAP_SPACE.h);
  function clampCam() {
    const c = S.cam;
    c.z = Math.max(fitZoom(), Math.min(ZOOM_MAX, c.z));
    const vw = S.area.w / c.z, vh = S.area.h / c.z;
    c.x = vw >= MAP_SPACE.w ? MAP_SPACE.w / 2 : Math.max(vw / 2, Math.min(MAP_SPACE.w - vw / 2, c.x));
    c.y = vh >= MAP_SPACE.h ? MAP_SPACE.h / 2 : Math.max(vh / 2, Math.min(MAP_SPACE.h - vh / 2, c.y));
  }
  const sx = (x) => S.area.x + S.area.w / 2 + (x - S.cam.x) * S.cam.z;
  const sy = (y) => S.area.y + S.area.h / 2 + (y - S.cam.y) * S.cam.z;
  function zoomAt(f, mx, my) {
    const c = S.cam;
    const wx = c.x + (mx - S.area.x - S.area.w / 2) / c.z, wy = c.y + (my - S.area.y - S.area.h / 2) / c.z;
    c.z *= f;
    clampCam();
    c.x = wx - (mx - S.area.x - S.area.w / 2) / c.z; c.y = wy - (my - S.area.y - S.area.h / 2) / c.z;
    clampCam();
  }
  function centerOn(id) {
    const l = LOCATIONS[resolveLocation(id)];
    if (l?.px) { S.cam.x = l.px.x; S.cam.y = l.px.y; clampCam(); }
  }

  /** Screen position of a node (districts on a ring around the parent). */
  function nodePos(id) {
    const l = LOCATIONS[id];
    if (!l?.parent || !S.ringOf[id]) return { x: sx(l.px.x), y: sy(l.px.y) };
    const p = LOCATIONS[l.parent];
    const { i, n } = S.ringOf[id];
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: sx(p.px.x) + Math.cos(a) * RING, y: sy(p.px.y) + Math.sin(a) * RING };
  }

  /** «На базу»: disabled with a reason while no known route leads there (QA v9 B10). */
  function baseButton(game) {
    const sv = game.save;
    const none = resolveLocation(sv.location) !== resolveLocation(BASE_LOC) && !findRoute(sv, sv.location, BASE_LOC, partyFlagSet(sv, game.data));
    return { id: 'base', label: t('base.toBase'), key: 'H', w: 100, disabled: none, reason: none ? t('base.noRoute') : null,
      tip: none ? { title: t('base.toBase'), lines: [{ text: t('base.noRoute'), color: 'c' }] } : null };
  }

  /** «Привал» (Z): the shared rest window at the current node (scenes/rest.js); grey where a camp is impossible. */
  function restButton(game) {
    const no = !canCampAt(game.save.location);
    return { id: 'rest', label: t('rest.button'), key: 'Z', w: 100, disabled: no, reason: no ? t('rest.notHere') : null };
  }

  function layout(game) {
    const W = game.width, H = game.height;
    S.area = { x: 0, y: TOP, w: W, h: H - TOP - BOTTOM };
    const bw = 124, gap = 8;
    S.buttons = [
      { id: 'zoomOut', label: '−', key: '-', w: 44 }, { id: 'zoomIn', label: '+', key: '+', w: 44 }, { id: 'center', label: t('map.center'), key: 'C', w: 110 },
      { id: 'night', label: `${t('map.night')}: ${S.night ? t('party.on') : t('party.off')}`, key: 'N', selected: S.night },
      { id: 'enter', label: t('map.enter'), key: 'Enter' },
      restButton(game), // rest: «Привал» (Z)
      ...(baseOpen(game.save) ? [baseButton(game)] : []), // world-consequences.md ч.3
      { id: 'party', label: t('panel.party'), key: 'P' },
      { id: 'rep', label: t('panel.rep'), key: 'R' },
      { id: 'journal', label: t('panel.journal'), key: 'J' },
      { id: 'codex', label: t('panel.codex'), key: 'B' },
      { id: 'menu', label: t('loc.toMenu'), key: 'Esc' },
    ];
    // QA v9: widths by text (at least the old ones when there is room), squeezed into one row right-aligned
    const want = S.buttons.map((b) => ({ ...b, minW: b.w || bw }));
    const room = W - 32, total = want.reduce((s, b) => s + b.minW + gap, -gap);
    if (total > room) for (const b of want) b.minW = Math.min(b.minW, Math.max(44, buttonWidth(game.ctx, b.label, FONT_B, b.key)));
    const pos = flowButtons(game.ctx, want, { x: 16, y: H - 56, w: room, h: 44, gap, rows: 1, minW: 44 });
    S.buttons.forEach((b, i) => Object.assign(b, pos[i]));
    S.logW = W - 32;
    S.pflags = partyFlagSet(game.save, game.data);
    S.stigma = stigmaRep(game.save, game.data);
    S.hoverRoute = null;
    // which district rings are shown: around the current node (or its parent)
    const sv = game.save;
    const here = LOCATIONS[sv.location];
    const hub = here?.parent || sv.location;
    S.ringOf = {};
    const kids = MAP_NODES.filter((id) => LOCATIONS[id].parent === hub && sv.discovered.includes(id));
    kids.forEach((id, i) => { S.ringOf[id] = { i, n: kids.length }; });
    S.ringHub = kids.length ? hub : null;
    if (!S.cam) { S.cam = { x: 0, y: 0, z: Math.max(fitZoom(), Math.min(2.2, fitZoom() * 2.4)) }; centerOn(sv.location); } else clampCam();
  }

  function log(segText, color = '4') {
    S.log.push({ text: segText, color });
    if (S.log.length > 5) S.log.shift();
  }
  const bindLog = (game) => { S.log = game.mapLog || (game.mapLog = []); };

  /** Node visible on the map: real (not alias), discovered, requires ok, district only on the current ring. */
  function visibleNodes(sv) {
    return MAP_NODES.filter((id) => {
      const l = LOCATIONS[id];
      if (!sv.discovered.includes(id) || (l.requires && !requiresOk(sv, l.requires))) return false;
      return !l.parent || !!S.ringOf[id];
    });
  }

  // ---------------------------------------------------------------- travel
  function startTravel(game, to, confirmed = false) {
    const sv = save(game);
    if (to === sv.location) return enterLocation(game);
    const hops = findRoute(sv, sv.location, to, S.pflags);
    if (!hops) { game.toast(t('map.noRoute'), 'c'); return; }
    const fare = hops.reduce((s, h) => s + routeFare(sv, h.r), 0);
    if (fare > sv.hero.credits) { game.toast(`${t('map.noFare')}: ${fare} ${t('world.credits')}`, 'c'); return; }
    // third-exodus.md: a long trip at late marks asks first
    const warn = !confirmed && travelWarning(sv, hops.reduce((s, h) => s + hopDays(h.r, !!S.night), 0));
    if (warn) {
      game.openModal({ title: EXODUS_UI.confirmTitle, titleColor: 'c', lines: [{ text: EXODUS_UI.confirm.replace('{n}', warn.n).replace('{m}', warn.m) }],
        options: [{ label: EXODUS_UI.go, run: (g) => startTravel(g, to, true) }, { label: EXODUS_UI.stay, run: () => {} }] });
      return;
    }
    // world-consequences.md ч.5: peaceful road uses (Survival tracking / forage, Endurance forced march)
    const ru = roadUses(members(sv, game.data), hops, !!S.night);
    for (const x of ru.log) log(x.text, x.color);
    S.travel = { hops, i: 0, t: 0, day: 0, roll: 0, night: !!S.night, encMod: ru.encMod, forage: ru.forage, march: ru.marchHop };
    payHop(game);
    play('uiClick');
  }

  function payHop(game) {
    const sv = save(game);
    const hop = S.travel.hops[S.travel.i];
    const fare = routeFare(sv, hop.r);
    if (fare) { sv.hero.credits -= fare; log(`${t('map.fare')}: −${fare} ${t('world.credits')} (${LOCATIONS[hop.to].name})`, 'b'); }
  }

  function stepTravel(game, dt) {
    const tr = S.travel;
    const hop = tr.hops[tr.i];
    const days = tripDays(tr, tr.i);
    const dur = Math.max(0.3, days * TRAVEL_DAY_S);
    tr.t += dt;
    // day counter: one per travelled day; travel events — once per day
    while (tr.day < days && tr.t >= (tr.day + 1) * TRAVEL_DAY_S) {
      tr.day++;
      const ex = passDays(save(game), 1);
      for (const x of ex.out) log(x.text, x.color);
      if (ex.zero && !save(game).cyberspace) { S.paused = true; saveGame(save(game)); startExodusZero(game); return; }
      if (ex.marks?.length) { S.paused = true; openExodusRadio(game, ex.marks, () => { S.paused = false; }); return; }
      const ev = travelEvents(save(game), LOCATIONS[hop.to].region)[0];
      if (ev) { S.paused = true; runEvent(game, ev, (g) => { g.resume(self); S.paused = false; }); return; }
    }
    // encounter rolls: route.rolls per hop, spread along the way (world.md §2.1)
    const rolls = hop.r.rolls || 0;
    while (tr.roll < rolls && tr.t >= ((tr.roll + 1) / (rolls + 1)) * dur) {
      tr.roll++;
      if (rollEncounter(game, hop, tr.roll, rolls)) return;
    }
    if (tr.t >= dur) arriveHop(game);
  }

  function rollEncounter(game, hop, i, n) {
    const sv = save(game);
    const th = encounterThreshold(sv, hop.r, game.data);
    if (!th.need) return false;
    const hb = hunterBonus(sv);
    if (hb) { th.mod += hb; th.need += hb; }
    const em = S.travel?.encMod || 0; // Survival «Следопыт» for this trip
    if (em) { th.mod += em; th.need = Math.max(1, th.need + em); }
    if (S.travel?.night && !S.pflags.has('night-sight')) { th.mod += ENCOUNTER_MODS.night; th.need += ENCOUNTER_MODS.night; }
    const roll = 1 + Math.floor(Math.random() * 20);
    const hit = roll <= th.need;
    const mod = th.mod ? ` ${th.mod > 0 ? '+' : '−'}${Math.abs(th.mod)}` : '';
    log(`${t('world.day')} ${sv.day} · ${t('map.roll')} ${i}/${n}: d20 = ${roll} ${t('map.vs')} ≤ ${th.need} (3×${th.danger}${mod}) — ${hit ? t('map.encounter') : t('map.quiet')}`, hit ? 'c' : '4');
    if (!hit) return false;
    const reg = hop.r.region === 'sea' ? 'sea' : LOCATIONS[hop.to].region;
    // world-consequences.md §2: bounty hunters (wanted ≥ 3) come first
    const e = hunterEncounter(sv) || pickEncounter(sv, reg) || pickEncounter(sv, LOCATIONS[hop.to].region);
    if (!e) return false;
    S.paused = true;
    runEncounter(game, e, LOCATIONS[hop.to].region, self, () => { S.paused = false; });
    return true;
  }

  function arriveHop(game) {
    const sv = save(game);
    const tr = S.travel;
    const hop = tr.hops[tr.i];
    visit(sv, hop.to);
    findHidden(game, hop.to);
    tr.i++; tr.t = 0; tr.day = 0; tr.roll = 0;
    for (const x of onArrive(sv, hop.to, game.data)) game.toast(x.text, x.color);
    saveGame(sv);
    if (tr.i >= tr.hops.length) {
      if (tr.forage) for (const x of grant(sv, { items: [{ item: tr.forage, n: 1 }] }, game.data)) game.toast(x.text, x.color);
      S.travel = null; enterLocation(game); return;
    }
    payHop(game);
  }

  /** Hidden neighbours: party flags reveal them, otherwise the best Perception in the party (passive). */
  function findHidden(game, id) {
    const sv = save(game);
    for (const r of routesFrom(id)) {
      const o = otherEnd(r, id);
      const l = LOCATIONS[o];
      if (!l?.hidden || sv.discovered.includes(o)) continue;
      let ok = l.hidden.flags?.some((f) => S.pflags.has(f));
      if (!ok && l.hidden.check) {
        const dc = l.hidden.check.dc;
        let best = null;
        for (const m of members(sv, game.data)) {
          const info = checkInfo(m, l.hidden.check.skill || R.hiddenSearch.skill, null);
          const c = checkChance(info, dc);
          if (!best || c > best.c) best = { c, m, info };
        }
        const res = rollCheck(best.m, best.info, dc);
        ok = res.success;
        log(`${t('map.hiddenCheck')} (${best.m.name}): d20[${res.rolls.join('|')}] ${best.info.total >= 0 ? '+' : '−'}${Math.abs(best.info.total)} = ${res.total} ${t('map.vs')} ${t('battle.dc')} ${dc} — ${ok ? t('check.success') : t('check.fail')}`, ok ? 'j' : '4');
      }
      if (ok) { openHidden(sv, o); game.toast(`${t('map.hiddenFound')}: ${l.name}`, 'a'); journal(sv, `${t('map.hiddenFound')}: ${l.name}`); }
    }
  }

  function enterLocation(game) {
    game.setScene(createNodeScene(save(game).location));
  }

  function nav(game, id) {
    if (id === 'zoomIn') return zoomAt(1.4, S.area.x + S.area.w / 2, S.area.y + S.area.h / 2);
    if (id === 'zoomOut') return zoomAt(1 / 1.4, S.area.x + S.area.w / 2, S.area.y + S.area.h / 2);
    if (id === 'center') return centerOn(save(game).location);
    if (id === 'night') { S.night = !S.night; layout(game); return; }
    if (id === 'enter') return enterLocation(game);
    if (id === 'rest') return S.travel ? undefined : openRestMenu(game, { back: self, done: (g) => layout(g) });
    if (id === 'base') return S.travel ? undefined : startTravel(game, BASE_LOC);
    if (id === 'toMenu') { saveGame(save(game)); return import('./menu.js').then((m) => game.setScene(m.menuScene)); }
    if (id === 'menu') { if (S.travel) return; saveGame(save(game)); return openPauseMenu(game, { onMenu: (g) => nav(g, 'toMenu') }); }
    if (id === 'enter' && S.travel) return;
    return import('./panels.js').then((m) => game.setScene(m.createPanelsScene({ tab: id, back: self })));
  }

  function nodeAt(sv, mx, my) {
    let best = null, bd = 16 * 16;
    for (const id of visibleNodes(sv)) {
      const p = nodePos(id);
      const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  // ---------------------------------------------------------------- render parts
  function drawBackground(ctx) {
    const { x, y, w, h } = S.area;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = '#1c2230';
    ctx.fillRect(x, y, w, h);
    const img = mapImage();
    const z = S.cam.z;
    const X0 = sx(0), Y0 = sy(0);
    if (img) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, X0, Y0, MAP_SPACE.w * z, MAP_SPACE.h * z);
      // muted to the game palette (STYLE: dark UI), the canon colours still read through
      ctx.fillStyle = 'rgba(16,16,24,0.38)';
      ctx.fillRect(X0, Y0, MAP_SPACE.w * z, MAP_SPACE.h * z);
    }
    ctx.restore();
  }

  /** Fog: dark veil with clear circles around discovered nodes (visited — wider). */
  function drawFog(ctx, sv) {
    const { x, y, w, h } = S.area;
    const fc = S.fogCanvas || (S.fogCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas'));
    if (fc.width !== w || fc.height !== h) { fc.width = w; fc.height = h; }
    const f = fc.getContext('2d');
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, w, h);
    f.fillStyle = 'rgba(12,12,18,0.82)';
    f.fillRect(0, 0, w, h);
    f.globalCompositeOperation = 'destination-out';
    for (const id of sv.discovered) {
      const l = LOCATIONS[id];
      if (!l?.px || l.parent) continue;
      const r = (sv.visited.includes(id) ? 70 : 34) * S.cam.z;
      const cx = sx(l.px.x) - x, cy = sy(l.px.y) - y;
      if (cx < -r || cy < -r || cx > w + r || cy > h + r) continue;
      const g = f.createRadialGradient(cx, cy, r * 0.35, cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = g;
      f.beginPath(); f.arc(cx, cy, r, 0, Math.PI * 2); f.fill();
    }
    ctx.drawImage(fc, x, y);
  }

  function drawRoutes(ctx, sv, pathSet) {
    ctx.save();
    ctx.beginPath(); ctx.rect(S.area.x, S.area.y, S.area.w, S.area.h); ctx.clip();
    const labels = [];
    for (const r of ROUTES) {
      if (!isKnownRoute(sv, r, S.pflags)) continue;
      const la = LOCATIONS[r.from], lb = LOCATIONS[r.to];
      const dA = la.parent || lb.parent;
      if (r.kind === 'district' && !(S.ringOf[r.from] || S.ringOf[r.to])) continue;
      if (dA && r.kind !== 'district' && ((la.parent && !S.ringOf[r.from]) || (lb.parent && !S.ringOf[r.to]))) continue;
      const a = nodePos(r.from), b = nodePos(r.to);
      const st = ROUTE_STYLE[r.kind] || ROUTE_STYLE.trail;
      const onPath = pathSet.has(r);
      const near = r.from === sv.location || r.to === sv.location;
      ctx.setLineDash(st.dash);
      // dark under-stroke so lines read on the light sea
      ctx.strokeStyle = 'rgba(10,10,16,0.75)'; ctx.lineWidth = st.w + 2.5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = onPath ? C.h : near ? C['5'] : C[st.color];
      ctx.globalAlpha = r.hidden ? 0.7 : 1;
      ctx.lineWidth = onPath ? st.w + 1.5 : st.w;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.globalAlpha = 1;
      if (r.days > 0 && (onPath || near || S.cam.z >= 1.6)) labels.push({ r, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
    ctx.setLineDash([]);
    for (const { r, x, y } of labels) {
      const s = `${r.days}${t('map.dayShort')}${r.fare ? ` ${routeFare(sv, r)}¢` : ''}`;
      ctx.font = '12px monospace';
      const w = ctx.measureText(s).width + 8 + r.danger * 7;
      ctx.fillStyle = 'rgba(16,16,24,0.85)';
      ctx.fillRect(x - w / 2, y - 8, w, 16);
      text(ctx, s, x - w / 2 + 4, y - 6, C['5'], '12px monospace');
      for (let k = 0; k < r.danger; k++) { ctx.fillStyle = C.c; ctx.fillRect(x + w / 2 - 4 - (r.danger - k) * 7 + 1, y - 3, 5, 5); }
    }
    ctx.restore();
  }

  function drawNodes(ctx, sv, game) {
    ctx.save();
    ctx.beginPath(); ctx.rect(S.area.x, S.area.y, S.area.w, S.area.h); ctx.clip();
    const z = S.cam.z;
    const scale = z >= 2 ? 2 : 1;
    const half = 8 * scale;
    const ids = visibleNodes(sv);
    // region names over their discovered nodes (big, faint)
    if (z < 2.6) {
      for (const reg of Object.values(REGIONS)) {
        const locs = ids.filter((id) => LOCATIONS[id].region === reg.id && !LOCATIONS[id].parent);
        if (locs.length < 2) continue;
        const cx = locs.reduce((s, id) => s + LOCATIONS[id].px.x, 0) / locs.length;
        const cy = locs.reduce((s, id) => s + LOCATIONS[id].px.y, 0) / locs.length;
        ctx.globalAlpha = 0.55;
        text(ctx, reg.name.toUpperCase(), sx(cx), sy(cy) - 30, C['5'], 'bold 14px monospace', 'center');
        ctx.globalAlpha = 1;
      }
    }
    if (S.ringHub) {
      const p = LOCATIONS[S.ringHub].px;
      ctx.strokeStyle = C['3']; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), RING, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    const placed = [];
    const order = [...ids].sort((a, b) => prio(sv, b) - prio(sv, a));
    // world-consequences.md ч.3: radio L3 — marks of the current quest goals on the map
    const qt = baseOpen(sv) && baseFx(sv, 'radio')?.mapReveal ? questTargets(sv) : null;
    for (const id of [...order].reverse()) {
      const l = LOCATIONS[id];
      const { x, y } = nodePos(id);
      if (x < -20 || y < S.area.y - 20 || x > S.area.x + S.area.w + 20 || y > S.area.y + S.area.h + 20) continue;
      const visited = sv.visited.includes(id);
      const f = locFaction(id);
      const frame = f && sv.rep[f] != null ? tierColor(repTier(repOf(sv, f))) : C['4'];
      ctx.fillStyle = 'rgba(16,16,24,0.85)';
      ctx.fillRect(x - half - 2, y - half - 2, half * 2 + 4, half * 2 + 4);
      ctx.strokeStyle = S.hoverNode === id ? C['5'] : frame;
      ctx.lineWidth = l.tier === 'capital' ? 3 : 2;
      ctx.strokeRect(x - half - 2, y - half - 2, half * 2 + 4, half * 2 + 4);
      drawMapIcon(ctx, iconOf(l, sv, visited, S.pflags), x - half, y - half, scale);
      drawNodeMark(ctx, sv, id, x + half, y - half);
      if (qt?.has(id)) {
        ctx.fillStyle = C.a; ctx.beginPath(); ctx.arc(x - half, y - half, 7, 0, Math.PI * 2); ctx.fill();
        text(ctx, '!', x - half, y - half - 7, C['0'], 'bold 12px monospace', 'center');
      }
    }
    // labels: greedy by priority (current, hover, capitals, cities…), skipped on overlap
    for (const id of order) {
      const l = LOCATIONS[id];
      const kind = l.tier || 'poi';
      const force = id === sv.location || id === S.hoverNode || !!S.ringOf[id];
      if (!force && z < (LABEL_ZOOM[kind] ?? 2)) continue;
      const { x, y } = nodePos(id);
      const font = LABEL_FONT[l.tier] || '12px monospace';
      ctx.font = font;
      const name = fit(ctx, l.name, 180, font);
      const lw = ctx.measureText(name).width;
      const rect = { x: x - lw / 2 - 3, y: y + half + 3, w: lw + 6, h: 16 };
      if (!force && placed.some((r) => r.x < rect.x + rect.w && rect.x < r.x + r.w && r.y < rect.y + rect.h && rect.y < r.y + r.h)) continue;
      placed.push(rect);
      ctx.fillStyle = 'rgba(16,16,24,0.8)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      const col = l.tier === 'capital' ? C.a : sv.visited.includes(id) ? C['5'] : C['4'];
      text(ctx, name, x, rect.y + 2, col, font, 'center');
    }
    ctx.restore();
    // hero marker (or travelling dot)
    let hp = nodePos(sv.location);
    if (S.travel) {
      const hop = S.travel.hops[S.travel.i];
      const a = nodePos(hop.from), b = nodePos(hop.to);
      const k = Math.min(1, S.travel.t / Math.max(0.3, tripDays(S.travel, S.travel.i) * TRAVEL_DAY_S));
      hp = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    drawSprite(ctx, heroSpriteIds(sv.hero.race, sv.hero.cls, sv.hero.look), hp.x - 16, hp.y - 46, 2, { frame: idleFrame(S.time * 1000) });
    drawMapIcon(ctx, 'party', hp.x - 8, hp.y - 62, 1);
    void game;
  }

  /** world-consequences.md: a quest changed the node — its glyph in the tone colour at the icon's corner. */
  function drawNodeMark(ctx, sv, id, x, y) {
    const m = nodeMark(sv, id);
    if (!m?.glyph) return;
    const col = C[TONE_COLOR[m.tone] || 'a'];
    ctx.fillStyle = 'rgba(16,16,24,0.92)';
    ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    text(ctx, m.glyph, x, y - 7, col, 'bold 12px monospace', 'center');
  }

  function prio(sv, id) {
    const l = LOCATIONS[id];
    if (id === sv.location) return 100;
    if (id === S.hoverNode) return 90;
    return { capital: 50, city: 40, town: 30, village: 20, hamlet: 10 }[l.tier] ?? (S.ringOf[id] ? 45 : l.poi === 'author' ? 15 : 5);
  }

  function drawCard(ctx, sv, W, H) {
    const id = S.hoverNode;
    const l = LOCATIONS[id];
    const f = locFaction(id);
    if (S.hoverRoute?.id !== id || S.hoverRoute.from !== sv.location) S.hoverRoute = { id, from: sv.location, hops: findRoute(sv, sv.location, id, S.pflags) };
    const hops = S.hoverRoute.hops;
    const days = hops ? hops.reduce((s, h) => s + hopDays(h.r, S.night), 0) : null;
    const fare = hops ? hops.reduce((s, h) => s + routeFare(sv, h.r), 0) : 0;
    const rolls = hops ? hops.reduce((s, h) => s + (h.r.rolls || 0), 0) : 0;
    const reg = REGIONS[l.region];
    const lines = [
      { text: l.name, color: C.h, font: FONT_B },
      { text: `${reg?.name || ''}${l.tier ? ` · ${TIER_NAMES[l.tier]}${l.pop ? ` (${l.pop})` : ''}` : ''}`, color: C['4'] },
      ...(reg ? [{ text: `${t('map.danger')}: ${'■'.repeat(l.danger ?? reg.danger) || '—'} · ${t('world.level')} ${reg.levels.join('–')}`, color: C.c }] : []),
      ...(f ? [{ text: `${factionName(f)}: ${t(`tier.${repTier(repOf(sv, f))}`)}${S.stigma[f] ? ` (${t('map.stigma')} ${S.stigma[f]})` : ''}`, color: tierColor(repTier(repOf(sv, f))) }] : []),
      { text: hops ? `${t('map.way')}: ${days} ${t('map.days')}, ${hops.length} ${t('map.hops')}, ${t('map.rolls')} ${rolls}${fare ? ` · ${t('map.fare')} ${fare}` : ''}` : t('map.noRoute'), color: hops ? (fare > sv.hero.credits ? C.c : C['5']) : C.c },
      ...(l.terminal && (sv.visited.includes(id) || S.pflags.has('terminal-scan')) ? [{ text: `${t('map.terminal')}: ${t(`term.${sv.terminals[l.terminal.id]}`)}`, color: C.n }] : []),
      ...(S.pflags.has('scout-node') && l.battles?.length ? [{ text: `${t('map.scout')}: ${l.battles.filter((b) => !(b.once && sv.battlesDone.includes(b.id))).map((b) => encounterName(b.encounter)).join(', ') || '—'}`, color: C.c }] : []),
      ...(S.pflags.has('map-memory') && sv.visited.includes(id) && l.caches?.some((c) => !sv.caches.includes(c.id)) ? [{ text: t('map.cacheHere'), color: C.a }] : []),
      ...(l.services.length ? [{ text: l.services.map((s) => t(`svc.${s}`)).join(', '), color: C['4'] }] : []),
    ];
    // v4: the node description (locations-lore.js desc, else locations.js desc), up to CARD_DESC_LINES lines
    const mark = nodeMark(sv, id); // world-consequences.md: the latest change replaces the description
    if (closedLoc(sv, id)) lines.push({ text: tf('cq.closed', { loc: l.name }), color: C.c });
    const desc = mark ? mark.descs.at(-1) : locationLore(id)?.desc || l.desc || '';
    const w = desc ? 440 : 360;
    if (desc) {
      const dl = wrap(ctx, desc, w - 20, SMALL_FONT);
      dl.slice(0, CARD_DESC_LINES).forEach((s, i, a) => lines.push({ text: i === a.length - 1 && dl.length > CARD_DESC_LINES ? `${s.replace(/\s*\S*$/, '')}…` : s, color: mark ? C[TONE_COLOR[mark.tone] || '5'] : C['5'], font: SMALL_FONT, small: true }));
    }
    const h = 16 + lines.reduce((s, ln) => s + (ln.small ? SMALL_LINE : LINE), 0);
    const p = nodePos(id);
    const x = Math.min(W - w - 8, p.x + 24), y = Math.min(H - BOTTOM - h - 4, Math.max(TOP + 4, p.y - 20));
    panel(ctx, x, y, w, h, C['0'], C['3']);
    let ly = y + 8;
    for (const ln of lines) { text(ctx, fit(ctx, ln.text, w - 20, ln.font || FONT), x + 10, ly, ln.color, ln.font || FONT); ly += ln.small ? SMALL_LINE : LINE; }
  }

  function drawLegend(ctx, W) {
    const items = [['road', t('map.kind.road')], ['trail', t('map.kind.trail')], ['wild', t('map.kind.wild')], ['sea', t('map.kind.sea')]];
    let x = W - 16;
    ctx.font = '12px monospace';
    for (let i = items.length - 1; i >= 0; i--) {
      const [k, label] = items[i];
      const st = ROUTE_STYLE[k];
      const lw = ctx.measureText(label).width;
      x -= lw;
      text(ctx, label, x, 32, C['4'], '12px monospace');
      x -= 34;
      ctx.setLineDash(st.dash); ctx.strokeStyle = C[st.color]; ctx.lineWidth = st.w;
      ctx.beginPath(); ctx.moveTo(x, 39); ctx.lineTo(x + 28, 39); ctx.stroke(); ctx.setLineDash([]);
      x -= 16;
    }
  }

  self = {
    id: 'worldmap',
    S,
    enter(game) {
      game.visit = null; bindLog(game); layout(game); mapImage();
      // test hooks (playwright scenarios): travel by id, node screen position
      S.travelTo = (id) => startTravel(game, id);
      S.pos = (id) => nodePos(id);
    },
    resume(game) { layout(game); },
    resize(game) { S.fogCanvas = null; layout(game); },
    update(game, dt) {
      S.time += dt;
      const sv = save(game);
      const inp = game.input;
      const m = inp.mouse;
      // camera: wheel zoom, drag pan, keys — also while travelling
      if (m.wheel && m.inside) zoomAt(m.wheel < 0 ? 1.25 : 1 / 1.25, m.x, m.y);
      const kx = (inp.isDown('ArrowRight') || inp.isDown('KeyD') ? 1 : 0) - (inp.isDown('ArrowLeft') || inp.isDown('KeyA') ? 1 : 0);
      const ky = (inp.isDown('ArrowDown') || inp.isDown('KeyS') ? 1 : 0) - (inp.isDown('ArrowUp') || inp.isDown('KeyW') ? 1 : 0);
      if (kx || ky) { S.cam.x += (kx * PAN_KEYS * dt) / S.cam.z; S.cam.y += (ky * PAN_KEYS * dt) / S.cam.z; clampCam(); }
      if (inp.wasPressed('Equal') || inp.wasPressed('NumpadAdd')) nav(game, 'zoomIn');
      if (inp.wasPressed('Minus') || inp.wasPressed('NumpadSubtract')) nav(game, 'zoomOut');
      if (inp.wasPressed('KeyC')) nav(game, 'center');
      for (const b of S.buttons) if (b.id === 'enter' || b.id === 'menu') b.disabled = !!S.travel;
      const rb = S.buttons.find((b) => b.id === 'rest');
      if (rb) { rb.disabled = !!S.travel || !canCampAt(sv.location); rb.reason = S.travel ? t('rest.travel') : t('rest.notHere'); }
      S.hover = hitButton(S.buttons, m);
      if (m.clicked && !S.hover && m.y >= S.area.y && m.y < S.area.y + S.area.h) S.drag = { x: m.x, y: m.y, cx: S.cam.x, cy: S.cam.y, moved: false };
      if (S.drag && m.down) {
        const dx = m.x - S.drag.x, dy = m.y - S.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) S.drag.moved = true;
        if (S.drag.moved) { S.cam.x = S.drag.cx - dx / S.cam.z; S.cam.y = S.drag.cy - dy / S.cam.z; clampCam(); }
      }
      if (S.travel) {
        if (m.released) S.drag = null;
        // while travelling: zoom / centre / night and the panels work (the trip waits while a panel is open)
        if (m.clicked && S.hover && !S.hover.disabled) { play('uiClick'); S.drag = null; nav(game, S.hover.id); return; }
        if (inp.wasPressed('KeyP')) return nav(game, 'party');
        if (inp.wasPressed('KeyR')) return nav(game, 'rep');
        if (inp.wasPressed('KeyJ')) return nav(game, 'journal');
        if (inp.wasPressed('KeyG')) return nav(game, 'gear');
        if (inp.wasPressed('KeyB')) return nav(game, 'codex');
        if (!S.paused) stepTravel(game, dt);
        return;
      }
      S.hoverNode = !S.hover && m.inside && m.y >= S.area.y && m.y < S.area.y + S.area.h ? nodeAt(sv, m.x, m.y) : null;
      if (m.clicked && S.hover) { S.drag = null; if (S.hover.disabled) { if (S.hover.reason) game.toast(S.hover.reason, 'c'); return; } play('uiClick'); nav(game, S.hover.id); return; }
      // click on a node = pointer released without dragging (a quick click may release within the same step)
      const release = m.released || (S.drag && !m.down);
      if (release && S.drag) {
        const d = S.drag; S.drag = null;
        if (!d.moved) { const id = nodeAt(sv, d.x, d.y); if (id) { startTravel(game, id); return; } }
      }
      if (inp.wasPressed('Enter')) nav(game, 'enter');
      else if (inp.wasPressed('KeyN')) nav(game, 'night');
      else if (inp.wasPressed('KeyZ')) { const b = S.buttons.find((x) => x.id === 'rest'); if (b?.disabled) game.toast(b.reason, 'c'); else nav(game, 'rest'); }
      else if (inp.wasPressed('KeyH') && baseOpen(sv)) { const b = S.buttons.find((x) => x.id === 'base'); if (b?.disabled) game.toast(b.reason, 'c'); else nav(game, 'base'); }
      else if (inp.wasPressed('KeyP')) nav(game, 'party');
      else if (inp.wasPressed('KeyR')) nav(game, 'rep');
      else if (inp.wasPressed('KeyJ')) nav(game, 'journal');
      else if (inp.wasPressed('KeyG')) nav(game, 'gear');
      else if (inp.wasPressed('KeyB')) nav(game, 'codex');
      else if (inp.wasPressed('Escape')) nav(game, 'menu');
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      const sv = save(game);
      clear(ctx, W, H);
      drawBackground(ctx);
      drawFog(ctx, sv);
      let path = null;
      if (S.travel) path = S.travel.hops.slice(S.travel.i);
      else if (S.hoverNode && S.hoverRoute?.id === S.hoverNode) path = S.hoverRoute.hops;
      drawRoutes(ctx, sv, new Set((path || []).map((h) => h.r)));
      drawNodes(ctx, sv, game);
      // top bar
      ctx.fillStyle = C['0']; ctx.fillRect(0, 0, W, TOP);
      text(ctx, t('map.title'), 24, 12, C.h, FONT_L);
      const hudPre = `${t('world.day')} ${sv.day} · ${t('world.credits')} ${sv.hero.credits} · ${t('world.level')} ${sv.hero.level} · `;
      const hudLine = `${hudPre}${restHud(sv)} · ${t('map.here')}: ${LOCATIONS[sv.location].name}`;
      text(ctx, hudLine, 220, 8, C.b, FONT_B);
      ctx.font = FONT_B;
      hotspot(220 + ctx.measureText(hudPre).width, 8, ctx.measureText(restHud(sv)).width, 18, { title: t('rest.title'), lines: [t('rest.hudTip')] });
      // third-exodus.md: «Исход: N дн.» after the prologue; red at ≤ 30%, blinking at ≤ 5%
      const ex = exodusHud(sv);
      if (ex) {
        ctx.font = FONT_B;
        const x = 220 + ctx.measureText(`${hudLine} · `).width;
        if (!ex.blink || Math.floor(S.time * 2) % 2 === 0) text(ctx, `· ${ex.text}`, x - ctx.measureText('· ').width, 8, C[ex.color], FONT_B);
        hotspot(x, 8, ctx.measureText(ex.text).width, 18, { title: t('exodus.hud'), lines: [t('exodus.tip'), ...(sv.exodus.mark ? [{ text: `${t('exodus.mark')} ${sv.exodus.mark}: ${t(`exodus.mark.${sv.exodus.mark}`)}`, color: 'c' }] : [])] });
      }
      drawLegend(ctx, W);
      if (S.hoverNode && !S.travel) drawCard(ctx, sv, W, H);
      // bottom: log + buttons
      ctx.fillStyle = C['0']; ctx.fillRect(0, H - BOTTOM, W, BOTTOM);
      panel(ctx, 16, H - BOTTOM + 6, S.logW, 108, C['1'], C['2']);
      S.log.forEach((l, i) => text(ctx, fit(ctx, l.text, S.logW - 24), 28, H - BOTTOM + 12 + i * LINE, C[l.color] || C['4']));
      if (!S.log.length) text(ctx, fit(ctx, t('map.hint'), S.logW - 24), 28, H - BOTTOM + 12, C['3']);
      for (const b of S.buttons) { button(ctx, b, S.hover === b); if (b.tip) hotspot(b.x, b.y, b.w, b.h, b.tip); }
      // QA v9 B9: the zoom hint sits in the map's bottom-left corner, not under the buttons
      const zh = `${t('map.zoom')} ×${S.cam.z.toFixed(1)} · ${t('map.panHint')}`;
      ctx.font = '12px monospace';
      ctx.fillStyle = 'rgba(20,20,28,0.7)'; ctx.fillRect(12, H - BOTTOM - 22, ctx.measureText(zh).width + 8, 18);
      text(ctx, zh, 16, H - BOTTOM - 19, C['4'], '12px monospace');
    },
  };
  return self;
}
