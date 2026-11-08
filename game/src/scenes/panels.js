// Party / Reputation / Journal / Codex screens (tabs). createPanelsScene({ tab: 'party'|'stats'|'gear'|'rep'|'journal'|'codex', back, canSwap })
// back — scene to resume on Esc. canSwap — combat talent loadout can be changed (on a node with rest).
import { dropItem } from '../world/inventory.js';
import { newUsesLine } from '../world/skill-uses.js';
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, SKILLS, isCombatTalent, COMBAT_TALENT_LIMIT } from '../data/talents.js';
import { drawPortrait } from '../assets/sprites.js';
import { heroBuild, wounds, drawHeroPic } from '../ui/portrait-of.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, LINE, text, textBlock, fit, wrap, panel, button, hitButton, clear, bar } from '../ui/draw.js';
import { FACTION_IDS, factionName, repTier, TIERS, isMet } from '../world/reputation.js';
import { buildHero, buildCompanion, members, tf, memberPending, toggleActiveTalent, squadInfo, ensureCompanionXp } from '../world/state.js';
import { QUESTS, gadgetFor, ITEMS, SKILL_RULES } from '../world/data.js';
import { autoCheck } from '../world/skill-uses.js';
import { stageOf, currentGoalText, turninText } from '../world/quests.js';
import { rollDice } from '../rules/dice.js';
import { tierColor } from './location.js';
import { saveGame } from '../save.js';
import { layoutGear, renderGear, renderGearHover, clickGear, updateGear, gearBusy, gearMembers } from './panel-gear.js';
import { equipBest, planLines, restoreGear } from '../world/best-gear.js';
import { createScroll, updateScroll, beginClip, endClip, drawScrollbar, SCROLLBAR_W } from '../ui/scroll.js';
import { hotspot } from '../ui/tooltip.js';
import { resLineTip, xpLine, talentTip, abilityTip, resTip, termText } from '../ui/tips.js';
import { checkInfo } from '../world/checks.js';
import { STATS, mod } from '../rules/character.js';
import { weaponTypeName, armorTypeName, tierName } from '../ui/items-ui.js';
import { openSheet, openMemberLevelUp } from './levelup.js';
import { layoutCodex, clickCodex, updateCodex, renderCodex } from './panel-codex.js';
import { loyaltyBand, canChangePath, changePath, canRejoin, rejoin, sendToReserve, idleHomeName } from '../world/companions.js';
import { COMPANIONS } from '../data/companions.js';
import { consequenceLog } from '../world/consequences.js';
import { heatOf, wantedOf, wantedLevel } from '../world/crime.js';
import { openEpilogue } from './epilogue.js';
import { peekRomance, partnerOf, stageFor, nextHint, isRomanceable } from '../world/romance.js';
import { ROMANCE_RULES } from '../data/romance.js';

const BASE_W = 1280, BASE_H = 720;
const TABS = ['party', 'stats', 'gear', 'rep', 'journal', 'codex'];

export function createPanelsScene({ tab = 'party', back, canSwap = false, gearKey = 'hero', sel }) {
  // S.sel — the selected party member, shared by «Партия», «Характеристики», «Снаряжение» (S.statKey / S.gearKey mirror it)
  const key0 = sel || gearKey;
  const S = { tab, buttons: [], hover: null, time: 0, units: null, sel: key0, gearKey: key0, statKey: key0,
    jq: createScroll(), je: createScroll(), sc: createScroll(), pl: createScroll(), pr: createScroll() };
  let self;

  /** Members in selection order (hero, then companions not left) — cards, 1–9 and ←/→. */
  const selMembers = (sv) => [{ key: 'hero', name: sv.hero.name }, ...sv.party.filter((p) => p.state !== 'left').map((p) => ({ key: p.npc, name: NPCS[p.npc]?.name || p.npc, p }))];

  function select(game, key) {
    if (!selMembers(game.save).some((m) => m.key === key)) key = 'hero';
    if (S.sel !== key) { S.sc.off = 0; S.pr.off = 0; if (S.inv) S.inv.sel = null; }
    S.sel = S.statKey = S.gearKey = key;
    layout(game);
  }

  function rebuild(game) {
    const sv = game.save;
    for (const p of sv.party) ensureCompanionXp(sv, p, game.data); // old saves: defaults + unspent level-ups
    S.units = { hero: buildHero(sv, game.data) };
    for (const p of sv.party) if (p.state !== 'left') S.units[p.npc] = buildCompanion(sv, p, game.data);
    layout(game);
  }

  function useItem(game, item, key) {
    const sv = game.save;
    const it = ITEMS[item];
    const u = S.units[key];
    const h = it?.use?.heal || it?.field?.heal;
    if (!u || !h || !(sv.hero.items[item] > 0)) return;
    dropItem(sv, item, 1);
    const entry = key === 'hero' ? sv.hero : sv.party.find((p) => p.npc === key);
    let v = rollDice(Math.random, h.dice) + (h.bonus || 0);
    // N7 Medicine: a healing item heals 50% more on a check by the best medic of the party
    if (h.resource !== 'mrl') {
      const M = SKILL_RULES.economy.medkit;
      const r = autoCheck(members(sv, game.data), [M.skill], M.dc);
      if (r.success) { v = Math.round(v * M.mult); game.toast(`${r.member.name}: ${t('skillUse.medkit')}`, 'j'); }
    }
    if (h.resource === 'mrl') entry.mrl = Math.min(u.maxMrl, u.mrl + v);
    else entry.hp = Math.min(u.maxHp, u.hp + v);
    game.toast(`${it.name}: +${v} ${t(`res.${h.resource === 'mrl' ? 'mrl' : 'hp'}`)}`, h.resource === 'mrl' ? 'f' : 'j');
    play('heal');
    saveGame(sv);
    rebuild(game);
  }

  function bestGear(game, all) {
    const sv = game.save;
    const keys = all ? gearMembers(sv).map((m) => m.key) : [S.gearKey || 'hero'];
    const r = equipBest(sv, keys, game.data);
    rebuild(game);
    const lines = planLines(sv, r.plans);
    if (!r.done || !lines.length) { restoreGear(sv, r.snap); rebuild(game); game.toast(t('gear.bestNone'), '4'); return; }
    saveGame(sv);
    game.openModal({ title: t('gear.bestTitle'), width: 820, lines: lines.slice(0, 24),
      options: [{ label: t('gear.bestOk'), run: (g) => { saveGame(g.save); rebuild(g); } },
        { label: t('gear.bestUndo'), run: (g) => { restoreGear(g.save, r.snap); saveGame(g.save); rebuild(g); } }],
      onCancel: (g) => rebuild(g) });
  }

  function layout(game) {
    const sv = game.save;
    const ox = Math.max(0, Math.floor((game.width - BASE_W) / 2)), oy = Math.max(0, Math.floor((game.height - BASE_H) / 2));
    S.ox = ox; S.oy = oy;
    const b = [];
    TABS.forEach((id, i) => b.push({ kind: 'tab', id, label: t(`panel.${id}`), x: ox + 24 + i * 170, y: oy + 16, w: 160, h: 40, selected: S.tab === id }));
    b.push({ kind: 'back', label: t('panel.back'), key: 'Esc', x: ox + BASE_W - 164, y: oy + 16, w: 140, h: 40 });
    if (S.tab === 'party') layoutParty(game, b);
    if (S.tab === 'gear') {
      layoutGear(game, S, b);
      // feedback 2026-11-07: «Одеть лучшее» (selected member) / «всем» — world/best-gear.js, result window with undo
      b.push({ kind: 'best', label: t('gear.best'), x: ox + 24, y: oy + 452, w: 146, h: 30, font: FONT });
      b.push({ kind: 'bestAll', label: t('gear.bestAll'), x: ox + 176, y: oy + 452, w: 148, h: 30, font: FONT });
    }
    if (S.tab === 'codex') layoutCodex(game, S, b);
    if (S.tab === 'journal') b.push({ kind: 'epilogue', label: t('journal.epilogue'), x: ox + BASE_W - 184, y: oy + 70, w: 160, h: 32, font: FONT }); // world-consequences.md
    if (S.tab === 'stats') {
      const ms = statMembers(sv);
      if (!ms.some((m) => m.key === S.sel)) S.sel = S.statKey = S.gearKey = 'hero';
      ms.forEach((m, i) => b.push({ kind: 'statMember', id: m.key, label: `${memberPending(sv, m.key).any ? '▲ ' : ''}${m.name}`, key: i < 9 ? String(i + 1) : undefined,
        x: ox + 24 + i * 152, y: oy + 64, w: 146, h: 28, font: FONT, selected: m.key === S.sel }));
    }
    S.buttons = b;
  }

  function click(game, b) {
    const sv = game.save;
    if (b.disabled) { if (b.reason) game.toast(b.reason, 'c'); return; }
    play('uiClick');
    if (b.kind === 'tab') { S.tab = b.id; layout(game); return; }
    if (b.kind === 'statMember' || b.kind === 'card') { select(game, b.id); return; }
    if (b.kind === 'back') { game.resume(back); return; }
    if (b.kind === 'epilogue') { openEpilogue(game, { onDone: (g) => g.resume(self) }); return; }
    if (clickCodex(game, S, b)) { layout(game); return; }
    if (b.kind === 'best' || b.kind === 'bestAll') return bestGear(game, b.kind === 'bestAll');
    if (clickGear(game, S, b, (g) => rebuild(g))) { if (b.kind === 'gearMember') S.sel = S.statKey = S.gearKey; rebuild(game); return; }
    if (b.kind === 'm') {
      if (b.act === 'medkit' || b.act === 'calmers') return useItem(game, b.act, b.member);
      if (b.act === 'gear') { S.tab = 'gear'; select(game, b.member); return; }
      if (b.act === 'sheet') return openSheet(game, S.units[b.member], b.member === 'hero' ? sv.hero.name : NPCS[b.member].name, b.member === 'hero' ? sv.hero.xp : sv.party.find((x) => x.npc === b.member)?.xp ?? null);
      if (b.act === 'path') { for (const x of changePath(sv, b.member, game.data)) game.toast(x.text, x.color); saveGame(sv); rebuild(game); return; }
      if (b.act === 'levelup') { select(game, b.member); return openMemberLevelUp(game, b.member, (g) => { saveGame(g.save); rebuild(g); }); }
      if (b.act === 'wait') sendToReserve(sv, b.member);
      if (b.act === 'join') rejoin(sv, b.member, game.data);
    }
    if (b.kind === 'talent') {
      const r = toggleActiveTalent(sv, S.sel, b.id, game.data);
      if (r === 'limit') game.toast(t('talent.limit'), 'c');
    }
    if (b.kind === 'ai') sv.settings.aiCompanions = !sv.settings.aiCompanions;
    saveGame(sv);
    rebuild(game);
  }

  // ---------------------------------------------------------------- party tab: cards (left, scrolled) + selected member (right, scrolled)
  const CARD_H = 96;
  const plView = () => ({ x: S.ox + 24, y: S.oy + 96, w: 652, h: BASE_H - 96 - 12 });
  const prView = () => ({ x: S.ox + 690, y: S.oy + 70, w: BASE_W - 714, h: BASE_H - 70 - 122 });
  const inView = (r, y, h) => y >= r.y && y + h <= r.y + r.h;

  /** Rows of the right column for the selected member: { h, kind, ... } (layout and render share them). */
  function rightRows(game) {
    const sv = game.save;
    const key = S.sel;
    const u = S.units[key];
    if (!u) return [];
    const e = key === 'hero' ? sv.hero : sv.party.find((p) => p.npc === key);
    const rows = [];
    const cls = game.data.CLASSES[u.classId];
    const path = cls?.paths?.find((x) => x.id === u.path);
    rows.push({ kind: 'title', h: 24, text: key === 'hero' ? sv.hero.name : NPCS[key]?.name || key, color: key === 'hero' ? C.h : C['5'] });
    rows.push({ kind: 'text', h: LINE, text: [game.data.RACES[u.raceId]?.name, cls?.name, `${t('world.level')} ${u.level}`].filter(Boolean).join(' · '), color: C['4'] });
    if (path) rows.push({ kind: 'text', h: LINE, text: `${t('comp.path')}: ${path.name}`, color: C['4'], tip: path.desc ? { title: path.name, lines: [path.desc] } : null });
    rows.push({ kind: 'xp', h: 22, xp: e?.xp ?? 0, level: e?.level || u.level });
    for (let i = 0; i < STATS.length; i += 3) rows.push({ kind: 'text', h: LINE, text: STATS.slice(i, i + 3).map((k) => `${t(`stat.${k}`)} ${u.stats?.[k] ?? 10} (${sgn(mod(u.stats?.[k] ?? 10))})`).join('   '), color: C['5'] });
    const pend = memberPending(sv, key);
    if (pend.any) rows.push({ kind: 'text', h: LINE, text: `▲ ${pendingText(pend)}`, color: C.a });
    rows.push({ kind: 'gap', h: 6 });
    // romance.md: «Близость» — bar, stage, what is next
    const re = key !== 'hero' && isRomanceable(key) ? peekRomance(sv, key) : null;
    if (re) {
      rows.push({ kind: 'bond', h: 22, bond: re.bond, text: `${partnerOf(sv) === key ? '♥ ' : ''}${t('rom.bond')}: ${re.bond}/${ROMANCE_RULES.max} · ${stageFor(re).name}` });
      rows.push({ kind: 'text', h: LINE, text: nextHint(sv, key), color: C['4'], font: '12px monospace' });
      rows.push({ kind: 'gap', h: 6 });
    }
    // talents: active combat / «в рюкзаке» / world
    const ids = (e?.talents || []).filter((id) => TALENTS[id]);
    const active = (u.activeTalents || []).filter((id) => ids.includes(id) || TALENTS[id]);
    const lim = COMBAT_TALENT_LIMIT(u.level);
    const combat = ids.filter((id) => isCombatTalent(TALENTS[id]));
    const on = combat.filter((id) => active.includes(id));
    const off = combat.filter((id) => !active.includes(id));
    const world = ids.filter((id) => !isCombatTalent(TALENTS[id]));
    rows.push({ kind: 'head', h: 22, text: `${tf('comp.talActive', { n: on.length, m: lim })}${canSwap ? '' : ` (${t('party.swapAtRest')})`}` });
    if (!on.length) rows.push({ kind: 'text', h: LINE, text: '—', color: C['3'] });
    for (const id of on) rows.push({ kind: 'talent', h: 24, id, on: true });
    if (off.length) {
      rows.push({ kind: 'head', h: 22, text: t('comp.talPack') });
      for (const id of off) rows.push({ kind: 'talent', h: 24, id, on: false });
    }
    if (world.length) {
      rows.push({ kind: 'head', h: 22, text: t('comp.talWorld') });
      for (const id of world) rows.push({ kind: 'talent', h: 22, id, world: true });
    }
    if (key === 'hero') {
      const g = gadgetFor(sv.hero.cls);
      if (g) { rows.push({ kind: 'gap', h: 6 }); rows.push({ kind: 'text', h: LINE, text: `${t('create.gadget')}: ${g.name}`, color: C.h, font: FONT_B, tip: { title: g.name, lines: [g.desc || ''] } }); }
    }
    rows.push({ kind: 'gap', h: 6 });
    rows.push({ kind: 'head', h: 22, text: t('stats.abilities') });
    for (const a of u.abilities || []) rows.push({ kind: 'text', h: LINE, text: `${a.name}${a.cost ? ` · ${a.cost} ${t('battle.cost')}` : ''}`, color: C['5'], tip: abilityTip(a) });
    return rows;
  }
  const pendingText = (pend) => [pend.asi.length ? tf('comp.pendAsi', { n: pend.asi.join(', ') }) : '', pend.talents ? tf('comp.pendTalents', { n: pend.talents }) : ''].filter(Boolean).join(' · ');
  const rowsHeight = (rows) => rows.reduce((a, r) => a + r.h, 0);

  function layoutParty(game, b) {
    const sv = game.save;
    const ox = S.ox, oy = S.oy;
    const list = selMembers(sv);
    if (!list.some((m) => m.key === S.sel)) S.sel = S.statKey = S.gearKey = 'hero';
    S.list = list;
    const pv = plView();
    S.pl.max = Math.max(0, list.length * CARD_H - pv.h);
    S.pl.off = Math.max(0, Math.min(S.pl.off, S.pl.max));
    const free = squadInfo(sv, game.data);
    list.forEach((m, i) => {
      const y = pv.y + i * CARD_H - S.pl.off;
      if (y + CARD_H <= pv.y || y >= pv.y + pv.h) return;
      // the whole card selects (pushed first: the card's own buttons win the hit test)
      b.push({ kind: 'card', id: m.key, hidden: true, x: pv.x, y: Math.max(pv.y, y), w: 640, h: Math.min(y + CARD_H - 4, pv.y + pv.h) - Math.max(pv.y, y) });
      const row = [];
      let x = pv.x + 640 - 8;
      const add = (o) => { x -= o.w + 4; row.push({ kind: 'm', member: m.key, x, y: y + 60, h: 28, font: FONT, ...o }); };
      if (m.p && m.p.state === 'active') add({ act: 'wait', label: t('party.toReserve'), w: 110 });
      else if (m.p && m.p.state === 'waiting') {
        const r = canRejoin(sv, m.p, game.data);
        add({ act: 'join', label: t('party.toActive'), w: 110, disabled: !r.ok, reason: r.why === 'full' ? tf('party.squadFull', { m: free.max }) : r.why === 'away' ? tf('party.idleAt', { place: idleHomeName(sv, m.p) }) : null });
      }
      const pend = memberPending(sv, m.key);
      if (pend.any) add({ act: 'levelup', label: `▲ ${t('comp.levelUp')}`, w: 190, selected: true, tipText: pendingText(pend) });
      if (!m.p || m.p.state !== 'cyberspace') add({ act: 'gear', label: t('panel.gear'), w: 120 });
      add({ act: 'sheet', label: t('lvl.sheet'), w: 70 });
      // companions-scenes.md: path change after the personal quest (once, from level 5)
      if (m.p && canChangePath(sv, m.key, game.data)) {
        const alt = COMPANIONS[m.key].altPath;
        const name = game.data.CLASSES[NPCS[m.key].cls]?.paths.find((q) => q.id === alt)?.name || alt;
        row.push({ kind: 'm', member: m.key, act: 'path', label: tf('comp.changePath', { path: name }), x: ox + 356, y: y + 4, w: 296, h: 22, font: '12px monospace', selected: true });
      }
      for (const q of row) if (inView(pv, q.y, q.h)) b.push(q);
    });
    // right column: talent toggles of the selected member (scrolled)
    const rv = prView();
    const rows = rightRows(game);
    S.pr.max = Math.max(0, rowsHeight(rows) + 8 - rv.h);
    S.pr.off = Math.max(0, Math.min(S.pr.off, S.pr.max));
    let y = rv.y - S.pr.off;
    for (const r of rows) {
      if (r.kind === 'talent' && !r.world && inView(rv, y, 22)) b.push({ kind: 'talent', id: r.id, label: r.on ? '■' : '□', x: rv.x, y: y - 2, w: 24, h: 22, font: FONT_B, disabled: !canSwap, reason: t('party.swapAtRest') });
      y += r.h;
    }
    // fixed buttons under the right column: level-up / heal the selected member / AI
    const bx = rv.x, by = oy + BASE_H - 112;
    const pend = memberPending(sv, S.sel);
    const sm = list.find((m) => m.key === S.sel);
    const name = sm?.name || '';
    b.push({ kind: 'm', member: S.sel, act: 'levelup', label: `▲ ${t('comp.levelUp')}`, x: bx, y: by, w: 200, h: 40, selected: pend.any, disabled: !pend.any, reason: null, tipText: pend.any ? pendingText(pend) : null });
    const cyber = sm?.p?.state === 'cyberspace';
    b.push({ kind: 'm', member: S.sel, act: 'medkit', label: `${ITEMS.medkit.name} ${sv.hero.items.medkit || 0}`, x: bx + 206, y: by, w: 160, h: 40, font: FONT, disabled: cyber || !(sv.hero.items.medkit > 0), tipText: tf('comp.useOn', { name }) });
    b.push({ kind: 'm', member: S.sel, act: 'calmers', label: `${ITEMS.calmers.name} ${sv.hero.items.calmers || 0}`, x: bx + 372, y: by, w: rv.w - 372, h: 40, font: FONT, disabled: cyber || !(sv.hero.items.calmers > 0), tipText: tf('comp.useOn', { name }) });
    b.push({ kind: 'ai', label: `${t('party.aiCompanions')}: ${sv.settings.aiCompanions ? t('party.on') : t('party.off')}`, x: bx, y: by + 48, w: 380, h: 40 });
  }

  function renderParty(game) {
    const { ctx } = game;
    const sv = game.save;
    const ox = S.ox, oy = S.oy;
    const sq = squadInfo(sv, game.data);
    const n = 1 + sv.party.filter((p) => p.state === 'active').length;
    termText(ctx, tf('party.squad', { n, m: sq.max }), ox + 24, oy + 70, n >= sq.max ? C.a : C['5'], FONT_B, { title: tf('party.squad', { n, m: sq.max }), lines: [tf('party.squadTip', { base: sq.base, cha: sq.cha, lead: sq.lead })] });
    text(ctx, fit(ctx, t('comp.selectHint'), 460, '12px monospace'), ox + 676, oy + 74, C['3'], '12px monospace', 'right');
    const pv = plView();
    beginClip(ctx, pv);
    S.list.forEach((m, i) => {
      const y = pv.y + i * CARD_H - S.pl.off;
      if (y + CARD_H <= pv.y || y >= pv.y + pv.h) return;
      const u = S.units[m.key];
      if (!u) return;
      const isHero = m.key === 'hero';
      const on = m.key === S.sel;
      panel(ctx, ox + 24, y, 640, 92, on ? C['2'] : C['1'], on ? C.a : isHero ? C.h : C['2']);
      if (on) { ctx.strokeStyle = C.a; ctx.lineWidth = 2; ctx.strokeRect(ox + 25, y + 1, 638, 90); ctx.lineWidth = 1; }
      // portraits v2 (native 48 px): live wounds; companions show their mood by approval
      const po = { native: true, ...wounds(u), emotion: m.p ? (m.p.approval >= 50 ? 'happy' : m.p.approval <= -50 ? 'angry' : 'neutral') : 'neutral' };
      panel(ctx, ox + 34, y + 6, 52, 52, C['0'], on ? C.a : C['2']);
      if (isHero) drawHeroPic(ctx, heroBuild(sv.hero), ox + 36, y + 8, 1, po);
      else drawPortrait(ctx, m.key, ox + 36, y + 8, 1, po);
      if (i < 9) { ctx.fillStyle = C['0']; ctx.fillRect(ox + 28, y + 2, 14, 16); text(ctx, String(i + 1), ox + 35, y + 3, on ? C.a : C['4'], '12px monospace', 'center'); }
      const name = isHero ? sv.hero.name : NPCS[m.key].name;
      text(ctx, fit(ctx, name, 220, FONT_B), ox + 104, y + 8, isHero ? C.h : C['5'], FONT_B);
      const cls = game.data.CLASSES[u.classId];
      text(ctx, fit(ctx, `${game.data.RACES[u.raceId]?.name || ''} · ${cls?.name || ''} · ${t('world.level')} ${u.level}`, 240, '12px monospace'), ox + 104, y + 28, C['4'], '12px monospace');
      if (m.p) {
        const st = m.p.state === 'waiting' && idleHomeName(sv, m.p) ? tf('party.idleAt', { place: idleHomeName(sv, m.p) }) : t(`party.state.${m.p.state}`);
        const ap = m.p.approval;
        // companions-scenes.md: loyalty band (COMPANION_RULES.loyalty.bands)
        text(ctx, fit(ctx, `${st} · ${t('comp.loyalty')}: ${loyaltyBand(ap).name} ${ap > 0 ? '+' : ''}${ap}`, 240, '12px monospace'), ox + 104, y + 44, ap <= -50 ? C.c : ap >= 50 ? C.j : C['4'], '12px monospace');
        // romance.md: ♥ partner, ♡ interest (bond ≥ 15), a thin bond bar under the loyalty line
        const re = peekRomance(sv, m.key);
        if (re && (re.bond > 0 || re.dates.length)) {
          const heart = partnerOf(sv) === m.key ? '♥' : re.bond >= ROMANCE_RULES.stages[1].min && !re.broken && !re.lost ? '♡' : '';
          ctx.font = FONT_B;
          if (heart) text(ctx, heart, ox + 104 + Math.min(220, ctx.measureText(name).width) + 8, y + 8, C.f, FONT_B);
          bar(ctx, ox + 104, y + 58, 120, 3, re.bond, ROMANCE_RULES.max, 'mrl');
        }
      } else text(ctx, `${t('world.credits')} ${sv.hero.credits} · ${t('party.marks')} ${sv.hero.judgeMarks || 0}/3`, ox + 104, y + 44, C['4'], '12px monospace');
      resLineTip(ctx, ox + 356, y + 8, 296, 'hp', u.hp, u.maxHp, t('res.hp'));
      resLineTip(ctx, ox + 356, y + 30, 296, 'mrl', u.mrl, u.maxMrl, t('res.mrl'));
      const xe = isHero ? sv.hero : m.p;
      if (Number.isFinite(xe?.xp)) xpLine(ctx, ox + 356, y + 47, 296, xe.xp, xe.level || u.level, { small: true, h: 6 });
    });
    endClip(ctx);
    drawScrollbar(ctx, S.pl, pv);
    // right: the selected member
    const rv = prView();
    panel(ctx, rv.x - 6, rv.y - 4, rv.w + 6, rv.h + 8, C['1'], C['2']);
    beginClip(ctx, rv);
    let y = rv.y - S.pr.off;
    const w = rv.w - SCROLLBAR_W - 8;
    for (const r of rightRows(game)) {
      const vis = y + r.h > rv.y && y < rv.y + rv.h;
      if (vis) {
        if (r.kind === 'title') text(ctx, fit(ctx, r.text, w, FONT_B), rv.x, y, r.color, FONT_B);
        else if (r.kind === 'head') text(ctx, fit(ctx, r.text, w, FONT_B), rv.x, y + 2, C['4'], FONT_B);
        else if (r.kind === 'text') { text(ctx, fit(ctx, r.text, w, r.font || FONT), rv.x, y, r.color, r.font || FONT); if (r.tip && inView(rv, y, r.h)) hotspot(rv.x, y, w, r.h, r.tip); }
        else if (r.kind === 'xp') { if (inView(rv, y, r.h)) xpLine(ctx, rv.x, y, w, r.xp, r.level); }
        else if (r.kind === 'bond') { text(ctx, fit(ctx, r.text, w - 170, FONT), rv.x, y, C.f, FONT); bar(ctx, rv.x + w - 160, y + 6, 160, 6, r.bond, ROMANCE_RULES.max, 'mrl'); }
        else if (r.kind === 'talent') {
          const tl = TALENTS[r.id];
          const tx = r.world ? rv.x + 8 : rv.x + 32;
          text(ctx, fit(ctx, `${tl.name} — ${tl.desc || ''}`, w - (tx - rv.x)), tx, y, r.world ? C['5'] : r.on ? C.a : C['3'], FONT);
          if (inView(rv, y, r.h)) hotspot(tx, y, w - (tx - rv.x), 20, talentTip(r.id));
        }
      }
      y += r.h;
    }
    endClip(ctx);
    drawScrollbar(ctx, S.pr, rv);
    for (const b of S.buttons) if (b.tipText && !b.hidden) hotspot(b.x, b.y, b.w, b.h, { title: b.label, lines: [b.tipText] });
  }

  function renderRep(game) {
    const { ctx } = game;
    const sv = game.save;
    const ox = S.ox, oy = S.oy;
    const bx = ox + 300, bw = 700;
    // thresholds header
    for (const v of [-50, -15, 15, 50]) text(ctx, String(v), bx + ((v + 100) / 200) * bw, oy + 70, C['3'], '12px monospace', 'center');
    FACTION_IDS.forEach((f, i) => {
      const y = oy + 88 + i * 35;
      const met = isMet(sv, f);
      ctx.fillStyle = C['0'];
      ctx.fillRect(bx - 1, y + 7, bw + 2, 14);
      ctx.fillStyle = C['1'];
      ctx.fillRect(bx, y + 8, bw, 12);
      if (!met) {
        // not met yet: silhouette and «???» (reputation.js isMet — node visit, talk or battle)
        ctx.fillStyle = C['3'];
        ctx.beginPath(); ctx.arc(ox + 30, y + 9, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(ox + 23, y + 15, 14, 10);
        text(ctx, t('rep.unknown'), ox + 48, y + 6, C['3'], FONT_B);
        text(ctx, '???', bx + bw + 16, y + 6, C['3'], FONT_B);
        hotspot(ox + 20, y, bx - ox - 30, 30, { title: t('rep.unknown'), lines: [t('rep.unknownTip')] });
        return;
      }
      const v = sv.rep[f] || 0;
      const tier = repTier(v);
      text(ctx, fit(ctx, factionName(f), bx - ox - 56, FONT_B), ox + 48, y + 6, C['5'], FONT_B);
      const zero = bx + bw / 2;
      const end = bx + ((v + 100) / 200) * bw;
      ctx.fillStyle = tierColor(tier);
      ctx.fillRect(Math.min(zero, end), y + 8, Math.abs(end - zero), 12);
      ctx.fillStyle = C['3'];
      for (const th of [-50, -15, 15, 50]) ctx.fillRect(bx + ((th + 100) / 200) * bw, y + 6, 1, 16);
      text(ctx, `${v > 0 ? '+' : ''}${v}`, bx + bw + 16, y + 6, C['5'], FONT_B);
      text(ctx, t(`tier.${tier}`), bx + bw + 80, y + 6, tierColor(tier), FONT_B);
      // world-consequences.md §2: wanted level of the faction (stars) with the bounty in the tip
      const heat = heatOf(sv, f);
      if (heat) {
        const lv = wantedLevel(heat), w = wantedOf(sv, f);
        text(ctx, '★'.repeat(heat) + '☆'.repeat(5 - heat), bx + bw + 196, y + 6, heat >= 3 ? C.c : C.a, FONT_B);
        hotspot(bx + bw + 192, y, 70, 28, { title: `${t('wanted.label')}: ${lv.name}`, lines: [lv.text || '', ...(w.bounty ? [tf('wanted.bounty', { n: w.bounty })] : [])] });
      }
    });
    legend(ctx, ox + 40, oy + BASE_H - 24);
  }

  /** Tier legend in the tier colours (reputation and journal tabs). */
  function legend(ctx, x, y) {
    ctx.font = FONT;
    for (const tier of TIERS) {
      const s = t(`tier.${tier}`);
      ctx.fillStyle = tierColor(tier);
      ctx.fillRect(x, y + 4, 10, 10);
      text(ctx, s, x + 14, y, tierColor(tier), FONT);
      x += 14 + ctx.measureText(s).width + 24;
    }
  }

  // journal: two scrolled columns (wheel + slider), long text wraps
  const jqView = () => ({ x: S.ox + 24, y: S.oy + 108, w: 596, h: BASE_H - 108 - 40 });
  const jeView = () => ({ x: S.ox + 640, y: S.oy + 108, w: 616, h: BASE_H - 108 - 40 });
  function journalRows(game) {
    const { ctx } = game;
    const sv = game.save;
    const w = jqView().w - SCROLLBAR_W - 12;
    const rows = [];
    const entries = Object.entries(sv.quests).filter(([id]) => QUESTS[id]);
    // active first, then done / failed
    const order = { active: 0, done: 1, failed: 2 };
    const rank = (st) => (st.turnin ? 0 : order[st.state] ?? 0); // waiting for a turn-in — with the active ones
    entries.sort((a, b) => rank(a[1]) - rank(b[1]));
    if (!entries.length && !consequenceLog(sv).length) rows.push({ text: t('journal.none'), color: C['3'], font: FONT, x: 0 });
    for (const [id, st] of entries) {
      const q = QUESTS[id];
      const col = st.turnin && st.state === 'done' ? C.a : st.state === 'done' ? C.j : st.state === 'failed' ? C.c : q.key ? C.a : C['5'];
      for (const l of wrap(ctx, `${q.key ? '★ ' : ''}${q.name} — ${t(st.turnin && st.state === 'done' ? 'journal.turnin' : `journal.${st.state}`)}`, w, FONT_B)) rows.push({ text: l, color: col, font: FONT_B, x: 0 });
      if (st.turnin && st.state === 'done') for (const l of wrap(ctx, turninText(sv, id), w - 20, FONT)) rows.push({ text: l, color: C['4'], font: FONT, x: 20 });
      if (stageOf(sv, id) && st.state === 'active') for (const l of wrap(ctx, currentGoalText(sv, id), w - 20, FONT)) rows.push({ text: l, color: C['4'], font: FONT, x: 20 });
      rows.push({ gap: true });
    }
    // world-consequences.md: «Последствия» — what the finished quests changed in the world, newest first
    const log = consequenceLog(sv);
    if (log.length) rows.push({ text: t('journal.consequences'), color: C.h, font: FONT_B, x: 0 });
    for (const c of log) {
      for (const l of wrap(ctx, `${t('world.day')} ${c.day}: ${c.name}`, w, FONT_B)) rows.push({ text: l, color: C['5'], font: FONT_B, x: 0 });
      for (const ln of c.lines) for (const l of wrap(ctx, `· ${ln}`, w - 20, FONT)) rows.push({ text: l, color: C['4'], font: FONT, x: 20 });
      rows.push({ gap: true });
    }
    const ew = jeView().w - SCROLLBAR_W - 12;
    const ev = [];
    sv.journal.slice().reverse().forEach((e, i) => {
      for (const l of wrap(ctx, `${t('world.day')} ${e.day}: ${e.text}`, ew, FONT)) ev.push({ text: l, color: i === 0 ? C['5'] : C['4'], font: FONT, x: 0 });
    });
    return { rows, ev };
  }
  const rowsH = (rows) => rows.reduce((a, r) => a + (r.gap ? 8 : LINE), 0);
  function drawRows(ctx, rows, r, sc) {
    beginClip(ctx, r);
    let y = r.y + 4 - sc.off;
    for (const row of rows) {
      if (row.gap) { y += 8; continue; }
      if (y > r.y - LINE && y < r.y + r.h) text(ctx, row.text, r.x + 4 + row.x, y, row.color, row.font);
      y += LINE;
    }
    endClip(ctx);
    drawScrollbar(ctx, sc, r);
  }

  function renderJournal(game) {
    const { ctx } = game;
    const ox = S.ox, oy = S.oy;
    const { rows, ev } = journalRows(game);
    text(ctx, t('journal.quests'), ox + 24, oy + 80, C['4'], FONT_B);
    text(ctx, t('journal.events'), ox + 640, oy + 80, C['4'], FONT_B);
    const q = jqView(), e = jeView();
    panel(ctx, q.x, q.y, q.w, q.h, C['1'], C['2']);
    panel(ctx, e.x, e.y, e.w, e.h, C['1'], C['2']);
    drawRows(ctx, rows, q, S.jq);
    drawRows(ctx, ev, e, S.je);
    legend(ctx, ox + 24, oy + BASE_H - 24);
  }

  // ---------------------------------------------------------------- characteristics of every party member
  const statMembers = (sv) => [{ key: 'hero', name: sv.hero.name }, ...sv.party.filter((p) => p.state !== 'left').map((p) => ({ key: p.npc, name: NPCS[p.npc]?.name || p.npc }))];
  const scView = () => ({ x: S.ox + 852, y: S.oy + 104, w: 404, h: BASE_H - 104 - 16 });
  const sgn = (v) => (v >= 0 ? `+${v}` : `−${-v}`);

  function statsRight(game, u) {
    const { ctx } = game;
    const w = scView().w - SCROLLBAR_W - 16;
    const rows = [];
    const head = (k) => rows.push({ text: t(k), color: C['4'], font: FONT_B, x: 0 });
    head('stats.talents');
    const tl = (u.talents || []).filter((id) => TALENTS[id]);
    if (!tl.length) rows.push({ text: '—', color: C['3'], font: FONT, x: 0 });
    // active combat ■ / «в рюкзаке» □ / world (no mark)
    const act = (id) => (u.activeTalents || []).includes(id);
    const order = [...tl.filter((id) => isCombatTalent(TALENTS[id]) && act(id)), ...tl.filter((id) => isCombatTalent(TALENTS[id]) && !act(id)), ...tl.filter((id) => !isCombatTalent(TALENTS[id]))];
    for (const id of order) {
      const c = isCombatTalent(TALENTS[id]);
      rows.push({ text: fit(ctx, `${c ? (act(id) ? '■ ' : '□ ') : ''}${TALENTS[id].name} — ${TALENTS[id].desc || ''}`, w - 8), color: c ? (act(id) ? C.a : C['3']) : C['5'], font: FONT, x: 8, tip: talentTip(id) });
    }
    rows.push({ gap: true });
    head('stats.passives');
    const ps = (u.passives || []).filter((p) => p.name);
    if (!ps.length) rows.push({ text: '—', color: C['3'], font: FONT, x: 0 });
    for (const p of ps) rows.push({ text: fit(ctx, `${p.name} — ${p.desc || ''}`, w - 8), color: C.j, font: FONT, x: 8, tip: { title: p.name, lines: [p.desc || ''] } });
    rows.push({ gap: true });
    head('stats.abilities');
    for (const a of u.abilities || []) rows.push({ text: fit(ctx, `${a.name}${a.cost ? ` · ${a.cost} ${t('battle.cost')}` : ''} — ${a.desc || ''}`, w - 8), color: C['5'], font: FONT, x: 8, tip: abilityTip(a) });
    return rows;
  }

  function renderStats(game) {
    const { ctx } = game;
    const sv = game.save;
    const ox = S.ox, oy = S.oy;
    const key = S.sel;
    const u = S.units[key] || S.units.hero;
    if (!u) return;
    const isHero = key === 'hero';
    // left: identity, stats, resources, proficiencies
    let x = ox + 24, y = oy + 104;
    const W1 = 400;
    const cls = game.data.CLASSES[u.classId];
    const path = cls?.paths?.find((p) => p.id === u.path);
    text(ctx, fit(ctx, isHero ? sv.hero.name : NPCS[key]?.name || key, W1, FONT_B), x, y, isHero ? C.h : C['5'], FONT_B); y += 22;
    text(ctx, fit(ctx, [game.data.RACES[u.raceId]?.name, cls?.name, path?.name, `${t('world.level')} ${u.level}`].filter(Boolean).join(' · '), W1, FONT), x, y, C['4'], FONT); y += 24;
    const xe = isHero ? sv.hero : sv.party.find((p) => p.npc === key);
    if (Number.isFinite(xe?.xp)) y = xpLine(ctx, x, y, W1, xe.xp, xe.level || u.level) + 6;
    const pend = memberPending(sv, key);
    if (pend.any) { text(ctx, fit(ctx, `▲ ${pendingText(pend)}`, W1, FONT), x, y, C.a, FONT); y += 22; }
    text(ctx, t('stats.stats'), x, y, C['4'], FONT_B); y += 24;
    STATS.forEach((k, i) => {
      const v = u.stats?.[k] ?? 10;
      const cx = x + (i % 2) * 200, cy = y + Math.floor(i / 2) * 22;
      text(ctx, `${t(`stat.${k}`)} ${v}`, cx, cy, C['5'], FONT_B);
      text(ctx, `(${sgn(mod(v))})`, cx + 90, cy, C['4'], FONT);
      hotspot(cx, cy, 180, 20, { title: t(`stat.${k}.full`) !== `stat.${k}.full` ? t(`stat.${k}.full`) : t(`stat.${k}`), lines: [`${t('stats.modifier')} ${sgn(mod(v))}`] });
    });
    y += Math.ceil(STATS.length / 2) * 22 + 8;
    resLineTip(ctx, x, y, W1, 'hp', u.hp, u.maxHp, t('res.hp')); y += 22;
    resLineTip(ctx, x, y, W1, 'mrl', u.mrl, u.maxMrl, t('res.mrl')); y += 22;
    if (u.maxEnr > 0) { resLineTip(ctx, x, y, W1, 'enr', u.maxEnr, u.maxEnr, t('res.enr')); y += 22; }
    let cx = x;
    cx += termText(ctx, `${t('res.kb')} ${u.kb}`, cx, y, C['5'], FONT_B, resTip('kb')) + 16;
    cx += termText(ctx, `${t('create.speed')} ${u.speed}`, cx, y, C['5'], FONT_B, null) + 16;
    termText(ctx, `${t('stats.profBonus')} ${sgn(u.prof || 2)}`, cx, y, C['5'], FONT_B, { title: t('stats.profBonus'), lines: [t('tip.prof')] });
    y += 28;
    text(ctx, t('stats.prof'), x, y, C['4'], FONT_B); y += 22;
    const pr = u.proficiencies || {};
    const by = (o, min) => Object.entries(o || {}).filter(([, v]) => v >= min);
    const w4 = by(pr.weaponTypes, 4).map(([k]) => weaponTypeName(k));
    const w3 = by(pr.weaponTypes, 3).filter(([, v]) => v === 3).map(([k]) => weaponTypeName(k));
    const ar = by(pr.armor, 3).map(([k, v]) => `${armorTypeName(k)}${v >= 4 ? ' ★' : ''}`);
    const dt = by(pr.dmgTypes, 2).map(([k, v]) => `${t(`dmg.${k}`)} ${v}`);
    const lines = [
      [`${t('stats.mastery')}: ${w4.join(', ') || '—'}`, C.a],
      [`${t('stats.weapons')}: ${w3.join(', ') || '—'}`, C['5']],
      [`${t('stats.armor')}: ${ar.join(', ') || '—'}`, C['5']],
      [`${t('stats.dmgTypes')}: ${dt.join(', ') || '—'}`, C['5']],
    ];
    for (const [l, col] of lines) y = textBlock(ctx, l, x, y, W1, col, FONT, LINE, 3) + 2;
    hotspot(x, y - 4 * LINE, W1, 4 * LINE, { title: t('stats.prof'), lines: [1, 2, 3, 4].map((n) => `${n}: ${tierName(n)}`) });
    // middle: skills with bonuses
    x = ox + 444; y = oy + 104;
    text(ctx, t('stats.skills'), x, y, C['4'], FONT_B);
    text(ctx, t('stats.skillLegend'), x + 380, y + 2, C['3'], '12px monospace', 'right');
    y += 24;
    for (const sk of Object.keys(SKILLS)) {
      const info = checkInfo({ unit: u }, sk);
      const mark = info.kind === 'spec' ? '★' : info.kind === 'related' ? '•' : ' ';
      const col = info.kind === 'spec' ? C.a : info.kind === 'related' ? C['5'] : C['4'];
      text(ctx, mark, x, y, col, FONT_B);
      text(ctx, fit(ctx, `${SKILLS[sk].name} (${t(`stat.${info.stat}`)})`, 250), x + 18, y, col, FONT);
      text(ctx, `${sgn(info.total)}${info.mode === 'adv' ? ' ▲' : info.mode === 'dis' ? ' ▼' : ''}`, x + 380, y, info.mode === 'adv' ? C.j : info.mode === 'dis' ? C.c : C['5'], FONT_B, 'right');
      const parts = [`${t(`stat.${info.stat}`)} ${sgn(info.statMod)}`];
      if (info.prof) parts.push(`${t('stats.profBonus')} ${sgn(info.prof)}`);
      for (const n of info.notes) if (n.bonus) parts.push(`${n.text === 'base' ? t('stats.baseSkill') : n.text === 'extra' ? t('stats.extraSkill') : n.text} ${sgn(n.bonus)}`);
      // world-consequences.md ч.5: second-pass uses of the skill — «Теперь работает: …» (✦ on the row)
      const nu = newUsesLine(sk);
      if (nu) text(ctx, '✦', x + 352, y, C.h, '12px monospace', 'right');
      hotspot(x, y, 384, 20, { title: SKILLS[sk].name, lines: [{ text: t(`stats.kind.${info.kind}`), color: 'a' }, parts.join(' · '), info.mode !== 'normal' ? t(`stats.mode.${info.mode}`) : '',
        ...(nu ? [{ text: `${t('stats.newUses')}: ${nu}`, color: 'j' }] : [])] });
      y += 21;
    }
    // right: talents, passives, abilities (scrolled)
    const r = scView();
    drawScrollList(ctx, statsRight(game, u), r, S.sc);
  }

  function drawScrollList(ctx, rows, r, sc) {
    beginClip(ctx, r);
    let y = r.y - sc.off;
    for (const row of rows) {
      if (row.gap) { y += 8; continue; }
      if (y > r.y - LINE && y < r.y + r.h) {
        text(ctx, row.text, r.x + row.x, y, row.color, row.font);
        if (row.tip && y >= r.y && y + LINE <= r.y + r.h) hotspot(r.x + row.x, y, r.w - SCROLLBAR_W - 8 - row.x, LINE, row.tip);
      }
      y += LINE;
    }
    endClip(ctx);
    drawScrollbar(ctx, sc, r);
  }

  /** Scroll the card list so that the selected card is visible. */
  function revealCard() {
    const i = (S.list || []).findIndex((m) => m.key === S.sel);
    if (i < 0) return;
    const h = plView().h;
    if (i * CARD_H < S.pl.off) S.pl.off = i * CARD_H;
    else if ((i + 1) * CARD_H > S.pl.off + h) S.pl.off = (i + 1) * CARD_H - h;
  }

  self = {
    id: 'panels',
    S,
    enter(game) { rebuild(game); },
    resume(game) { rebuild(game); },
    resize(game) { layout(game); },
    toastAnchor(game) { return { x: S.ox + 344, y: S.oy + BASE_H - 80, dir: -1 }; },
    update(game, dt) {
      S.time += dt;
      const inp = game.input;
      S.hover = hitButton(S.buttons, inp.mouse);
      let used = false;
      if (S.tab === 'journal') {
        const { rows, ev } = journalRows(game);
        used = updateScroll(S.jq, jqView(), rowsH(rows) + 8, inp.mouse) || updateScroll(S.je, jeView(), rowsH(ev) + 8, inp.mouse);
      } else if (S.tab === 'codex') {
        used = updateCodex(game, S);
      } else if (S.tab === 'gear') {
        used = updateGear(game, S, rebuild);
      } else if (S.tab === 'stats') {
        const u = S.units[S.sel] || S.units.hero;
        if (u) used = updateScroll(S.sc, scView(), rowsH(statsRight(game, u)) + 8, inp.mouse);
      } else if (S.tab === 'party') {
        const o1 = S.pl.off, o2 = S.pr.off;
        used = updateScroll(S.pl, plView(), (S.list || []).length * CARD_H, inp.mouse) || updateScroll(S.pr, prView(), rowsHeight(rightRows(game)) + 8, inp.mouse);
        if (o1 !== S.pl.off || o2 !== S.pr.off) { layout(game); S.hover = hitButton(S.buttons, inp.mouse); }
      }
      if (inp.mouse.clicked && S.hover && !used) click(game, S.hover);
      if (S.tab === 'gear' && (gearBusy(S) || used) && (inp.wasPressed('Escape') || inp.wasPressed('KeyR'))) return; // carrying an item
      // member selection: ←/→ and 1–9 on the party / characteristics / gear tabs
      if (['party', 'stats', 'gear'].includes(S.tab) && !(S.tab === 'gear' && gearBusy(S))) {
        const ms = selMembers(game.save);
        const i = ms.findIndex((m) => m.key === S.sel);
        let k = null;
        if (inp.wasPressed('ArrowLeft')) k = ms[(i - 1 + ms.length) % ms.length].key;
        else if (inp.wasPressed('ArrowRight')) k = ms[(i + 1) % ms.length].key;
        else for (let d = 1; d <= Math.min(9, ms.length); d++) if (inp.wasPressed(`Digit${d}`)) k = ms[d - 1].key;
        if (k && k !== S.sel) { play('uiClick'); select(game, k); if (S.tab === 'party') { revealCard(); layout(game); } }
      }
      if (inp.wasPressed('Escape')) { play('uiClick'); game.resume(back); }
      else if (inp.wasPressed('KeyP')) { S.tab = 'party'; layout(game); }
      else if (inp.wasPressed('KeyG')) { S.tab = 'gear'; layout(game); }
      else if (inp.wasPressed('KeyC')) { S.tab = 'stats'; layout(game); }
      else if (inp.wasPressed('KeyR')) { S.tab = 'rep'; layout(game); }
      else if (inp.wasPressed('KeyJ')) { S.tab = 'journal'; layout(game); }
      else if (inp.wasPressed('KeyB')) { S.tab = 'codex'; layout(game); }
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      clear(ctx, W, H);
      if (S.tab === 'party') renderParty(game);
      else if (S.tab === 'gear') renderGear(game, S);
      else if (S.tab === 'stats') renderStats(game);
      else if (S.tab === 'rep') renderRep(game);
      else if (S.tab === 'codex') renderCodex(game, S);
      else renderJournal(game);
      for (const b of S.buttons) if (!b.hidden) button(ctx, b, S.hover === b);
      if (S.tab === 'gear') renderGearHover(game, S);
    },
  };
  return self;
}
