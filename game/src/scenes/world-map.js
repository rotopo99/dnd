// World map v3 (world.md §1–2, контракт UI): canon map image (game/assets/world-map.jpg, 2× of MAP_SPACE 1536×762)
// with nodes at `px`, fog of the unknown, routes styled by kind (road / trail / wild / sea / lake / tunnel / district),
// pan (drag, WASD / arrows) and zoom (wheel, +/− buttons). Travel along known routes: days, sea fare, `route.rolls`
// encounter rolls per hop (d20 ≤ 3 × danger + mod, shown in the map log), ambush, encounters, hidden nodes by Perception.
import { openRadio } from './radio.js';
import { baseOpen, BASE_LOC, modFx as baseFx } from '../world/base.js';
import { t } from '../data/text/index.js';
import { drawSprite, heroSpriteIds, idleFrame, drawMapIcon } from '../assets/sprites.js';
import { play, stopAmbience } from '../audio/sfx.js';
import { drawMapGlyph } from '../ui/map-glyphs.js';
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
import { harmonyExitToll, travelCut } from '../world/wave3.js';
import { hotspot } from '../ui/tooltip.js';
import { openPauseMenu } from '../ui/save-ui.js';
import { nodeMark, closedLoc, TONE_COLOR, nodeServices } from '../world/consequences.js';
import { hunterEncounter, hunterBonus } from '../world/crime.js';
import { openRestMenu, canCampAt } from './rest.js';
import { restState, provisionCount } from '../world/rest.js';
import { clashAt, clashOnRoute, roadClash, clashName, daysLeft, clashWhere } from '../world/clashes.js';
import { SPAWN as CLASH_SPAWN } from '../data/world/skirmishes.js';
import { openClash, clashLines } from './clash.js';
import { transitOptions, isTransitHub } from '../world/transit.js';

const restHud = (sv) => { const st = restState(sv); return tf('rest.hud', { n: st.short, max: st.max, food: provisionCount(sv) }); };

const SMALL_FONT = '12px monospace', SMALL_LINE = 16, CARD_DESC_LINES = 5;

const ROAD_CLASH = new Set(['road', 'trail', 'wild']); // skirmishes.md: «впереди бой» only on land roads
const TRAVEL_DAY_S = 0.22; // was 0.55: travel felt too long (human feedback 2026-11-08)
const MAP_IMG = new URL('../../assets/world-map.jpg', import.meta.url).href;
const ZOOM_MAX = 4;
const BOTTOM = 178, TOP = 52;
const PAN_KEYS = 600; // screen px / s
/** District nodes are drawn on a ring around their parent (they share its map point). */
const RING = 40;
const QUEST_FUZZ = 70; // QA v49 #15: radius / jitter (map px) of an undiscovered quest goal's approximate mark

let IMG = null;
function mapImage() {
  if (!IMG && typeof Image !== 'undefined') { IMG = new Image(); IMG.src = MAP_IMG; }
  return IMG && IMG.complete && IMG.naturalWidth ? IMG : null;
}

/** Night travel: one day less on routes of 2+ days (world.md §2). */
const hopDays = (r, night) => (night && r.days >= 2 ? r.days - 1 : r.days);
/** Days of hop i of a trip: night travel, Endurance forced march (march hop −1, min 1). */
/**
 * Fast travel (data/world/transit.js): the carrier's window — rides to open hubs, instant, fewer days, no encounters.
 * Opened from the world map («Транспорт», T) and from the carrier on a hub's free map. o.before(g) — leave the node first.
 */
export function transitRides(game) {
  const sv = game.save;
  const pf = partyFlagSet(sv, game.data);
  return transitOptions(sv, sv.location, (a, b) => findRoute(sv, a, b, pf), (r) => routeFare(sv, r));
}
export function openTransit(game, o = {}) {
  const sv = game.save;
  if (!isTransitHub(LOCATIONS[resolveLocation(sv.location)])) { game.toast(t('transit.notHub'), 'c'); return; }
  const rides = transitRides(game);
  const kindName = (k) => t(`transit.kind.${k}`);
  game.openModal({
    title: t('transit.title'), lines: [{ text: rides.length ? t('transit.lines') : t('transit.none'), color: rides.length ? '5' : 'c' }],
    options: [...rides.map((x) => {
      const poor = x.cost > sv.hero.credits;
      return { label: x.name, sub: tf('transit.sub', { kind: kindName(x.kind), days: x.days, full: x.full, cost: x.cost }), disabled: poor, reason: poor ? t('transit.noMoney') : null,
        run: (g) => rideTo(g, x, o) };
    }), { label: t('loc.close'), run: () => {} }],
  });
}
function rideTo(game, x, o) {
  const sv = game.save;
  o.before?.(game);
  sv.hero.credits -= x.cost;
  const ex = passDays(sv, x.days);
  for (const e of ex.out) game.toast(e.text, e.color);
  visit(sv, x.to);
  for (const e of onArrive(sv, x.to, game.data)) game.toast(e.text, e.color);
  game.toast(tf('transit.arrive', { kind: t(`transit.kind.${x.kind}`), name: x.name, days: x.days }), 'j');
  journal(sv, tf('transit.arrive', { kind: t(`transit.kind.${x.kind}`), name: x.name, days: x.days }));
  game.visit = null;
  sv.roam = null;
  saveGame(sv);
  play('uiClick');
  if (ex.zero && !sv.cyberspace) { startExodusZero(game); return; }
  const go = (g) => g.setScene(createNodeScene(sv.location));
  if (ex.marks?.length) openExodusRadio(game, ex.marks, go); else go(game);
}

const baseTripDays = (tr, i) => { const d = hopDays(tr.hops[i].r, tr.night); return tr.march === i ? Math.max(1, d - 1) : d; };
// content-wave3 §2: pirate Harmony trade routes cut days (tr.cut[i], fixed once per hop in payHop)
const tripDays = (tr, i) => Math.max(1, baseTripDays(tr, i) - (tr.cut?.[i] || 0));

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

  /** «Транспорт» (T): the carrier of a hub; grey elsewhere / with no rides. */
  function transitButton(game) {
    const hub = isTransitHub(LOCATIONS[resolveLocation(game.save.location)]);
    const n = hub ? transitRides(game).length : 0;
    return { id: 'transit', label: t('map.transit'), key: 'T', w: 110, disabled: !n, none: !n, reason: hub ? t('transit.none') : t('transit.notHub') };
  }

  function layout(game) {
    const W = game.width, H = game.height;
    if (S.night == null) S.night = !!game.mapNight; // M1: N toggles the same night flag on the node map
    S.area = { x: 0, y: TOP, w: W, h: H - TOP - BOTTOM };
    const bw = 124, gap = 8;
    S.buttons = [
      { id: 'zoomOut', label: '−', key: '-', w: 44 }, { id: 'zoomIn', label: '+', key: '+', w: 44 }, { id: 'center', label: t('map.center'), key: 'C', w: 110 },
      { id: 'night', label: `${t('map.night')}: ${S.night ? t('party.on') : t('party.off')}`, key: 'N', selected: S.night },
      { id: 'enter', label: t('map.enter'), key: 'Enter' },
      restButton(game), // rest: «Привал» (Z)
      transitButton(game), // fast travel between hubs (T)
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
  /** QA v49 #14: travel starts after the confirm window (destination, days, cost, danger, money left); confirmed — skip it (test hook). */
  function startTravel(game, to, confirmed = false) {
    const sv = save(game);
    if (to === sv.location) return enterLocation(game);
    const hops = findRoute(sv, sv.location, to, S.pflags);
    if (!hops) { game.toast(t('map.noRoute'), 'c'); return; }
    const fare = hops.reduce((s, h) => s + routeFare(sv, h.r), 0);
    if (!confirmed) { confirmTravel(game, to, hops, fare); return; }
    if (fare > sv.hero.credits) { game.toast(`${t('map.noFare')}: ${fare} ${t('world.credits')}`, 'c'); return; }
    // world-consequences.md ч.5: peaceful road uses (Survival tracking / forage, Endurance forced march)
    const ru = roadUses(members(sv, game.data), hops, !!S.night);
    for (const x of ru.log) log(x.text, x.color);
    // content-wave3 §2: pirate Harmony — 5% toll on the way out of the hub
    const toll = harmonyExitToll(sv, sv.location, to);
    if (toll > 0) { sv.hero.credits -= toll; log(tf('w3.exitToll', { n: toll }), 'b'); }
    S.travel = { hops, i: 0, t: 0, day: 0, roll: 0, night: !!S.night, encMod: ru.encMod, forage: ru.forage, march: ru.marchHop, cut: {} };
    payHop(game);
    play('uiClick');
  }

  function confirmTravel(game, to, hops, fare) {
    const sv = save(game);
    // a free zero-day hop (districts of a city) needs no confirm
    if (!fare && hops.every((h) => !hopDays(h.r, !!S.night) && !(h.r.rolls && encounterThreshold(sv, h.r, game.data).need))) { startTravel(game, to, true); return; }
    const days = hops.reduce((s, h) => s + hopDays(h.r, !!S.night), 0);
    const toll = harmonyExitToll(sv, sv.location, to);
    const cost = fare + Math.max(0, toll);
    const left = sv.hero.credits - cost;
    const danger = Math.max(0, ...hops.map((h) => encounterThreshold(sv, h.r, game.data).danger || 0));
    const rolls = hops.reduce((s, h) => s + (h.r.rolls || 0), 0);
    const lv = [...new Set(hops.map((h) => REGIONS[LOCATIONS[h.to].region]?.levels).filter(Boolean).flat())];
    const lines = [
      { text: `${t('map.way')}: ${days} ${t('map.days')}, ${hops.length} ${t('map.hops')}`, color: '5' },
      { text: `${t('map.danger')}: ${'■'.repeat(danger) || '—'} · ${t('map.rolls')} ${rolls}${lv.length ? ` · ${t('world.level')} ${Math.min(...lv)}–${Math.max(...lv)}` : ''}`, color: danger ? 'c' : '4' },
      { text: cost ? tf('map.tripCost', { n: cost, have: sv.hero.credits }) : t('map.tripFree'), color: cost > sv.hero.credits ? 'c' : 'b' },
    ];
    if (cost > sv.hero.credits) lines.push({ text: t('map.tripCantPay'), color: 'c' });
    else if (cost && left <= 0) lines.push({ text: t('map.tripBroke'), color: 'c' });
    // third-exodus.md: a long trip at late marks warns
    const warn = travelWarning(sv, days);
    if (warn) lines.push({ text: EXODUS_UI.confirm.replace('{n}', warn.n).replace('{m}', warn.m), color: 'c' });
    const ok = cost <= sv.hero.credits;
    game.openModal({ title: tf('map.tripTitle', { to: LOCATIONS[to].name }), titleColor: warn ? 'c' : undefined, lines,
      options: [...(ok ? [{ label: t('map.tripGo'), run: (g) => startTravel(g, to, true) }] : []), { label: t('map.tripStay'), run: () => {} }] });
  }

  function payHop(game) {
    const sv = save(game);
    const hop = S.travel.hops[S.travel.i];
    const base = baseTripDays(S.travel, S.travel.i);
    const cut = base - travelCut(sv, base);
    if (cut > 0) { S.travel.cut[S.travel.i] = cut; log(tf('w3.travelCut', { n: cut }), 'j'); }
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
      if (ex.out.some((x) => x.clash)) play('enemyTurn'); // skirmishes.md: «Слышны выстрелы»
      if (ex.zero && !save(game).cyberspace) { S.paused = true; saveGame(save(game)); startExodusZero(game); return; }
      if (ex.marks?.length) { S.paused = true; openExodusRadio(game, ex.marks, () => { S.paused = false; }); return; }
      const ev = travelEvents(save(game), LOCATIONS[hop.to].region)[0];
      if (ev) { S.paused = true; runEvent(game, ev, (g) => { g.resume(self); S.paused = false; }); return; }
    }
    // skirmishes.md: a marker on this route — the party runs into the fight half way
    if (!tr.clashSeen && tr.t >= dur / 2) {
      tr.clashSeen = true;
      const c = clashOnRoute(save(game), hop.r.from, hop.r.to);
      if (c) { S.paused = true; openClash(game, c, { back: self, done: () => { S.paused = false; } }); return; }
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
    const hunter = hunterEncounter(sv);
    const e = hunter || pickEncounter(sv, reg) || pickEncounter(sv, LOCATIONS[hop.to].region);
    if (!e) return false;
    S.paused = true;
    // skirmishes.md: «Впереди бой» — a road battle becomes a one-off skirmish (no marker)
    if (!hunter && e.kind === 'battle' && !e.exodus && ROAD_CLASH.has(hop.r.kind) && Math.random() < CLASH_SPAWN.roadChance) {
      const c = roadClash(sv, LOCATIONS[hop.to].region);
      if (c) { openClash(game, c, { back: self, done: () => { S.paused = false; } }); return true; }
    }
    runEncounter(game, e, LOCATIONS[hop.to].region, self, () => { S.paused = false; });
    return true;
  }

  function arriveHop(game) {
    const sv = save(game);
    const tr = S.travel;
    const hop = tr.hops[tr.i];
    visit(sv, hop.to);
    findHidden(game, hop.to);
    tr.i++; tr.t = 0; tr.day = 0; tr.roll = 0; tr.clashSeen = false;
    for (const x of onArrive(sv, hop.to, game.data)) game.toast(x.text, x.color);
    saveGame(sv);
    if (tr.i >= tr.hops.length) {
      if (tr.forage) for (const x of grant(sv, { items: [{ item: tr.forage, n: 1 }] }, game.data)) game.toast(x.text, x.color);
      S.travel = null;
      // skirmishes.md: a fight at the node we came to — choose before entering (or leave it be)
      const c = clashAt(sv, hop.to);
      if (c) { openClash(game, c, { back: self, cancel: true, done: (g) => enterLocation(g) }); return; }
      enterLocation(game); return;
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
    if (id === 'night') { S.night = !S.night; game.mapNight = S.night; layout(game); return; }
    if (id === 'transit') return S.travel ? undefined : openTransit(game);
    if (id === 'skip') { S.skip = true; return; }
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

  /** Quest goal marks: shown — visible node ids with a goal; hidden — top-level nodes of goals not on the map yet. */
  function questMarks(sv, ids) {
    const vis = new Set(ids), shown = new Set(), hidden = new Set();
    for (const id of questTargets(sv)) {
      if (!LOCATIONS[id]) continue;
      if (vis.has(id)) { shown.add(id); continue; }
      const top = LOCATIONS[id].parent || id;
      if (vis.has(top)) shown.add(top); else if (LOCATIONS[top]?.px) hidden.add(top);
    }
    return { shown, hidden };
  }

  /** Undiscovered quest goals: an approximate circle (exact with radio L3 «mapReveal»), an edge arrow when off screen. */
  function drawHiddenTargets(ctx, sv, hidden) {
    if (!hidden.size) return;
    const exact = baseOpen(sv) && baseFx(sv, 'radio')?.mapReveal;
    const A = S.area;
    for (const id of hidden) {
      const l = LOCATIONS[id];
      let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
      const j = exact ? 0 : QUEST_FUZZ;
      const cx = sx(l.px.x + ((h & 0xff) / 255 - 0.5) * j), cy = sy(l.px.y + (((h >> 8) & 0xff) / 255 - 0.5) * j);
      const r = Math.max(14, (exact ? 10 : QUEST_FUZZ) * S.cam.z);
      const inside = cx > A.x && cy > A.y && cx < A.x + A.w && cy < A.y + A.h;
      if (inside) {
        ctx.strokeStyle = C.a; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(S.time * 3);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
        text(ctx, '?', cx, cy - 8, C.a, 'bold 16px monospace', 'center');
        const s = exact ? `${t('map.questGoal')}: ${l.name}` : t('map.questSomewhere');
        ctx.font = '12px monospace';
        const w = ctx.measureText(s).width + 8;
        ctx.fillStyle = 'rgba(16,16,24,0.8)'; ctx.fillRect(cx - w / 2, cy + 12, w, 16);
        text(ctx, s, cx, cy + 14, C.a, '12px monospace', 'center');
        continue;
      }
      // off screen: an arrow at the edge towards the goal
      const mx = A.x + A.w / 2, my = A.y + A.h / 2, dx = cx - mx, dy = cy - my;
      const k = Math.min((A.w / 2 - 24) / Math.abs(dx || 1e-6), (A.h / 2 - 24) / Math.abs(dy || 1e-6));
      const ex = mx + dx * k, ey = my + dy * k, ang = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
      ctx.fillStyle = C.a; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
      text(ctx, '?', ex - Math.cos(ang) * 16, ey - Math.sin(ang) * 16 - 7, C.a, 'bold 13px monospace', 'center');
    }
  }

  /** Node labels: priority order, candidates below / above / right / left; skipped on overlap (forced — below anyway). */
        // leader-line candidates: diagonals and a second ring further out
        { x: x + half + 4, y: y + half + 3, lead: 1 }, { x: x - half - 4 - w, y: y + half + 3, lead: 1 },
        { x: x + half + 4, y: y - half - 3 - h, lead: 1 }, { x: x - half - 4 - w, y: y - half - 3 - h, lead: 1 },
        { x: x - w / 2, y: y + half + 3 + h + 6, lead: 1 }, { x: x - w / 2, y: y - half - 3 - 2 * h - 6, lead: 1 },
        { x: x + half + 12, y: y + half + 3 + h / 2, lead: 1 }, { x: x - half - 12 - w, y: y + half + 3 + h / 2, lead: 1 },
  function layoutLabels(ctx, sv, order, half, z, boxes) {
      const over = (r) => [...placed, ...boxes.filter((b) => b !== own && !(b.x === own.x && b.y === own.y))].reduce((a, q) => a + (hit(q, r) ? Math.min(q.x + q.w, r.x + r.w) - Math.max(q.x, r.x) : 0), 0);
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const out = [], placed = [];
    for (const id of order) {
      const l = LOCATIONS[id];
      const kind = l.tier || 'poi';
      const force = id === sv.location || id === S.hoverNode || !!S.ringOf[id];
      if (!force && z < (LABEL_ZOOM[kind] ?? 2)) continue;
      const { x, y } = nodePos(id);
      const font = LABEL_FONT[l.tier] || '12px monospace';
      ctx.font = font;
      const h = 16, own = { x: x - half - 2, y: y - half - 2, w: half * 2 + 4, h: half * 2 + 4 };
      let name, rect;
      for (const maxW of [180, 96]) { // crowded: retry with a shorter (ellipsis) name before forcing an overlap
      name = fit(ctx, l.name, maxW, font);
      const w = ctx.measureText(name).width + 6;
      const cands = [
        { x: x - w / 2, y: y + half + 3 }, { x: x - w / 2, y: y - half - 3 - h },
        { x: x + half + 5, y: y - h / 2 }, { x: x - half - 5 - w, y: y - h / 2 },
      ].map((c) => ({ ...c, w, h }));
      const free = (r) => !placed.some((q) => hit(q, r)) && !boxes.some((b) => b !== own && !(b.x === own.x && b.y === own.y) && hit(b, r));
      rect = cands.find(free) || (maxW === 96 && force ? cands.reduce((m, c) => (over(c) < over(m) ? c : m), cands[0]) : null);
      if (rect) break;
      }
      if (!rect) continue;
      placed.push(rect);
      out.push({ rect, name, lead: rect.lead ? { x, y } : null, font, col: l.tier === 'capital' ? C.a : sv.visited.includes(id) ? C['5'] : C['4'] });
    }
    return out;
  }

  /** Region names over their discovered nodes (big, faint): centroid, nudged up/down to miss labels and nodes, else skipped. */
  function drawRegionNames(ctx, ids, taken) {
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    ctx.font = 'bold 14px monospace';
    for (const reg of Object.values(REGIONS)) {
      const locs = ids.filter((id) => LOCATIONS[id].region === reg.id && !LOCATIONS[id].parent);
      if (locs.length < 2) continue;
      const cx = sx(locs.reduce((s, id) => s + LOCATIONS[id].px.x, 0) / locs.length);
      const cy = sy(locs.reduce((s, id) => s + LOCATIONS[id].px.y, 0) / locs.length);
      const name = reg.name.toUpperCase(), w = ctx.measureText(name).width + 4;
      const r = [-30, -50, 30, -70, 50].map((dy) => ({ x: cx - w / 2, y: cy + dy, w, h: 16 })).find((c) => !taken.some((q) => hit(q, c)));
      if (!r) continue;
      taken.push(r);
      ctx.globalAlpha = 0.55;
      text(ctx, name, cx, r.y, C['5'], 'bold 14px monospace', 'center');
      ctx.globalAlpha = 1;
    }
  }

  function drawNodes(ctx, sv, game) {
    ctx.save();
    ctx.beginPath(); ctx.rect(S.area.x, S.area.y, S.area.w, S.area.h); ctx.clip();
    const z = S.cam.z;
    const scale = z >= 2 ? 2 : 1;
    const half = 8 * scale;
    const ids = visibleNodes(sv);
    if (S.ringHub) {
      const p = LOCATIONS[S.ringHub].px;
      ctx.strokeStyle = C['3']; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), RING, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    const order = [...ids].sort((a, b) => prio(sv, b) - prio(sv, a));
    // QA v49 #15: active quest goals are marked (a district goal — on its city unless the ring is open)
    const { shown: qt, hidden: qHidden } = questMarks(sv, ids);
    // QA v49 #19: label layout first — node boxes block labels; region names go around them
    const boxes = ids.map((id) => { const { x, y } = nodePos(id); return { x: x - half - 2, y: y - half - 2, w: half * 2 + 4, h: half * 2 + 4 }; });
    const hp0 = nodePos(sv.location); // the hero marker stands over its node: labels keep clear of it
    const labels = layoutLabels(ctx, sv, order, half, z, [...boxes, { x: hp0.x - 12, y: hp0.y - half - 24, w: 24, h: 24 }]);
    if (z < 2.6) drawRegionNames(ctx, ids, [...boxes, ...labels.map((L) => L.rect)]);
    for (const id of [...order].reverse()) {
      if (L.lead) { // leader line from the node to the displaced label
        const r = L.rect, ex = Math.max(r.x, Math.min(L.lead.x, r.x + r.w)), ey = Math.max(r.y, Math.min(L.lead.y, r.y + r.h));
        ctx.strokeStyle = C['3']; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L.lead.x, L.lead.y); ctx.lineTo(ex, ey); ctx.stroke();
      }
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
    for (const L of labels) {
      ctx.fillStyle = 'rgba(16,16,24,0.8)';
      ctx.fillRect(L.rect.x, L.rect.y, L.rect.w, L.rect.h);
      text(ctx, L.name, L.rect.x + L.rect.w / 2, L.rect.y + 2, L.col, L.font, 'center');
    }
    drawHiddenTargets(ctx, sv, qHidden);
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
    if (!drawMapGlyph(ctx, m.glyph, x, y, col, 5.5)) text(ctx, m.glyph, x, y - 7, col, 'bold 12px monospace', 'center');
  }

  function prio(sv, id) {
    const l = LOCATIONS[id];
    if (id === sv.location) return 100;
    if (id === S.hoverNode) return 90;
    return { capital: 50, city: 40, town: 30, village: 20, hamlet: 10 }[l.tier] ?? (S.ringOf[id] ? 45 : l.poi === 'author' ? 15 : 5);
  }

  /** skirmishes.md: screen position of a visible clash marker (node: offset up-right; route: the middle) or null. */
  function clashPos(sv, c) {
    if (c.loc) {
      if (!sv.discovered.includes(c.loc)) return null;
      const p = nodePos(c.loc);
      return { x: p.x + 14, y: p.y - 14 };
    }
    if (!c.route || !c.route.every((id) => sv.discovered.includes(id))) return null;
    const a = nodePos(c.route[0]), b = nodePos(c.route[1]);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  function clashAtMouse(sv, mx, my) {
    for (const c of sv.clashes || []) {
      const p = clashPos(sv, c);
      if (p && (p.x - mx) ** 2 + (p.y - my) ** 2 <= 12 * 12) return c;
    }
    return null;
  }
  function drawClashes(ctx, sv) {
    ctx.save();
    ctx.beginPath(); ctx.rect(S.area.x, S.area.y, S.area.w, S.area.h); ctx.clip();
    for (const c of sv.clashes || []) {
      const p = clashPos(sv, c);
      if (!p) continue;
      const blink = daysLeft(sv, c) <= 1 && Math.floor(S.time * 3) % 2 === 0;
      ctx.fillStyle = 'rgba(16,16,24,0.92)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = blink ? C['5'] : C.c; ctx.lineWidth = S.hoverClash === c ? 3 : 2; ctx.stroke();
      drawMapGlyph(ctx, 'swords', p.x, p.y, blink ? C['5'] : C.c, 6.5);
    }
    ctx.restore();
  }
  function drawClashCard(ctx, sv, W, H) {
    const c = S.hoverClash;
    const p = clashPos(sv, c);
    if (!p) return;
    const here = c.loc === sv.location || c.route?.includes(sv.location);
    const lines = [
      { text: clashName(c), color: C.c, font: FONT_B },
      ...clashLines(sv, c).map((l) => ({ text: l.text, color: C[l.color] || C['5'] })),
      { text: c.loc ? tf('skirm.atNode', { loc: clashWhere(c) }) : tf('skirm.onRoute', { a: LOCATIONS[c.route[0]].name, b: LOCATIONS[c.route[1]].name }), color: C['4'] },
      { text: here ? t('skirm.clickHere') : t('skirm.clickGo'), color: here ? C.j : C['3'] },
    ];
    const w = 460, h = 16 + lines.length * LINE;
    const x = Math.min(W - w - 8, p.x + 20), y = Math.min(H - BOTTOM - h - 4, Math.max(TOP + 4, p.y - 20));
    panel(ctx, x, y, w, h, C['0'], C.c);
    let ly = y + 8;
    for (const ln of lines) { text(ctx, fit(ctx, ln.text, w - 20, ln.font || FONT), x + 10, ly, ln.color, ln.font || FONT); ly += LINE; }
  }
  /** Click on a marker: here — the choice window; elsewhere — travel there (route: to its nearer end). */
  function clickClash(game, c) {
    const sv = save(game);
    if (c.loc === sv.location || c.route?.includes(sv.location)) { openClash(game, c, { back: self, cancel: true, done: (g) => layout(g) }); return; }
    startTravel(game, c.loc || c.route[0]);
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
      ...(questMarks(sv, [id]).shown.has(id) ? [{ text: t('map.questGoal'), color: C.a }] : []),
      ...(nodeServices(sv, l.id).length ? [{ text: nodeServices(sv, l.id).map((s) => t(`svc.${s}`)).join(', '), color: C['4'] }] : []),
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
      stopAmbience(2); // the world map has music only (ambience — battles, free map, cyberspace)
      // test hooks (playwright scenarios): travel by id, node screen position
      S.travelTo = (id) => startTravel(game, id, true);
      S.pos = (id) => nodePos(id);
      S.clashPos = (id) => { const c = (save(game).clashes || []).find((x) => x.id === id); return c ? clashPos(save(game), c) : null; };
      S.openClash = (id) => { const c = (save(game).clashes || []).find((x) => x.id === id); if (c) clickClash(game, c); };
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
      for (const b of S.buttons) if (b.id === 'enter' || b.id === 'menu' || b.id === 'transit') b.disabled = !!S.travel || !!b.none;
      const sk = S.buttons.find((b) => b.id === 'enter');
      if (sk) Object.assign(sk, S.travel ? { id2: 'skip', label: t('map.skip'), key: 'Space', disabled: !!S.skip } : { id2: null, label: t('map.enter'), key: 'Enter' });
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
        if (m.clicked && S.hover && !S.hover.disabled) { play('uiClick'); S.drag = null; nav(game, S.hover.id2 || S.hover.id); return; }
        // «Пропустить путь»: Space / double click — walk to the arrival without the animation (encounter rolls stay)
        if (m.clicked && !S.hover) { if (S.lastTravelClick && S.time - S.lastTravelClick < 0.35) S.skip = true; S.lastTravelClick = S.time; }
        if (inp.wasPressed('Space')) S.skip = true;
        if (inp.wasPressed('KeyP')) return nav(game, 'party');
        if (inp.wasPressed('KeyR')) return nav(game, 'rep');
        if (inp.wasPressed('KeyJ')) return nav(game, 'journal');
        if (inp.wasPressed('KeyG')) return nav(game, 'gear');
        if (inp.wasPressed('KeyB')) return nav(game, 'codex');
        if (!S.paused) {
          if (S.skip) { for (let k = 0; k < 4000 && S.travel && !S.paused && game.scene === self && !game.modals.length; k++) stepTravel(game, 0.05); }
          else stepTravel(game, dt);
        }
        if (!S.travel) S.skip = false;
        return;
      }
      const inMap = !S.hover && m.inside && m.y >= S.area.y && m.y < S.area.y + S.area.h;
      S.hoverClash = inMap ? clashAtMouse(sv, m.x, m.y) : null;
      S.hoverNode = inMap && !S.hoverClash ? nodeAt(sv, m.x, m.y) : null;
      if (m.clicked && S.hover) { S.drag = null; if (S.hover.disabled) { if (S.hover.reason) game.toast(S.hover.reason, 'c'); return; } play('uiClick'); nav(game, S.hover.id); return; }
      // click on a node = pointer released without dragging (a quick click may release within the same step)
      const release = m.released || (S.drag && !m.down);
      if (release && S.drag) {
        const d = S.drag; S.drag = null;
        if (!d.moved) {
          const c = clashAtMouse(sv, d.x, d.y);
          if (c) { clickClash(game, c); return; }
          const id = nodeAt(sv, d.x, d.y); if (id) { startTravel(game, id); return; }
        }
      }
      if (inp.wasPressed('Enter')) nav(game, 'enter');
      else if (inp.wasPressed('KeyN')) nav(game, 'night');
      else if (inp.wasPressed('KeyT')) { const b = S.buttons.find((x) => x.id === 'transit'); if (b?.disabled) game.toast(b.reason, 'c'); else nav(game, 'transit'); }
      else if (inp.wasPressed('KeyZ')) { const b = S.buttons.find((x) => x.id === 'rest'); if (b?.disabled) game.toast(b.reason, 'c'); else nav(game, 'rest'); }
      else if (inp.wasPressed('KeyH') && baseOpen(sv)) { const b = S.buttons.find((x) => x.id === 'base'); if (b?.disabled) game.toast(b.reason, 'c'); else nav(game, 'base'); }
      else if (inp.wasPressed('KeyP')) nav(game, 'party');
      else if (inp.wasPressed('KeyR')) nav(game, 'rep');
      else if (inp.wasPressed('KeyJ')) nav(game, 'journal');
      else if (inp.wasPressed('KeyG')) nav(game, 'gear');
      else if (inp.wasPressed('KeyB')) nav(game, 'codex');
      else if (inp.wasPressed('KeyV')) openRadio(game, { source: 'handset', onDone: (g) => layout(g) }); // content-wave1.md: «Эфир»
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
      drawClashes(ctx, sv);
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
      else if (S.hoverClash && !S.travel) drawClashCard(ctx, sv, W, H);
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
