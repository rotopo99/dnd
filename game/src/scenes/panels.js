// Party / Reputation / Journal / Codex screens (tabs). createPanelsScene({ tab: 'party'|'stats'|'gear'|'rep'|'journal'|'codex', back, canSwap })
// back — scene to resume on Esc. canSwap — combat talent loadout can be changed (on a node with rest).
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, SKILLS, isCombatTalent, COMBAT_TALENT_LIMIT } from '../data/talents.js';
import { drawPortrait, drawHeroPortrait } from '../assets/sprites.js';
import { heroBuild, wounds } from '../ui/portrait-of.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, LINE, text, textBlock, fit, wrap, panel, button, hitButton, clear } from '../ui/draw.js';
import { FACTION_IDS, factionName, repTier, TIERS, isMet } from '../world/reputation.js';
import { buildHero, buildCompanion, MAX_PARTY, activeCompanions, learnTalent, members } from '../world/state.js';
import { QUESTS, gadgetFor, ITEMS, SKILL_RULES } from '../world/data.js';
import { autoCheck } from '../world/skill-uses.js';
import { stageOf, currentGoalText, turninText } from '../world/quests.js';
import { rollDice } from '../rules/dice.js';
import { tierColor } from './location.js';
import { saveGame } from '../save.js';
import { layoutGear, renderGear, renderGearHover, clickGear, itemChips } from './panel-gear.js';
import { createScroll, updateScroll, beginClip, endClip, drawScrollbar, SCROLLBAR_W } from '../ui/scroll.js';
import { hotspot } from '../ui/tooltip.js';
import { resLineTip, xpLine, talentTip, abilityTip, resTip, termText } from '../ui/tips.js';
import { checkInfo } from '../world/checks.js';
import { STATS, mod } from '../rules/character.js';
import { weaponTypeName, armorTypeName, tierName } from '../ui/items-ui.js';
import { openTalentPick, openAsi, openSheet } from './levelup.js';
import { layoutCodex, clickCodex, updateCodex, renderCodex } from './panel-codex.js';

const BASE_W = 1280, BASE_H = 720;
const TABS = ['party', 'stats', 'gear', 'rep', 'journal', 'codex'];

export function createPanelsScene({ tab = 'party', back, canSwap = false, gearKey = 'hero' }) {
  const S = { tab, buttons: [], hover: null, time: 0, units: null, gearKey, statKey: gearKey, jq: createScroll(), je: createScroll(), sc: createScroll() };
  let self;

  function rebuild(game) {
    const sv = game.save;
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
    sv.hero.items[item]--;
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

  function pickTalent(game) {
    const sv = game.save;
    openTalentPick(game, (g, id) => {
      sv.hero.pendingTalents--;
      for (const m of learnTalent(sv, id, g.data, { force: true })) g.toast(m.text, m.color);
      saveGame(sv);
      rebuild(g);
    });
  }

  function layout(game) {
    const sv = game.save;
    const ox = Math.max(0, Math.floor((game.width - BASE_W) / 2)), oy = Math.max(0, Math.floor((game.height - BASE_H) / 2));
    S.ox = ox; S.oy = oy;
    const b = [];
    TABS.forEach((id, i) => b.push({ kind: 'tab', id, label: t(`panel.${id}`), x: ox + 24 + i * 170, y: oy + 16, w: 160, h: 40, selected: S.tab === id }));
    b.push({ kind: 'back', label: t('panel.back'), key: 'Esc', x: ox + BASE_W - 164, y: oy + 16, w: 140, h: 40 });
    if (S.tab === 'party') {
      const list = [{ key: 'hero' }, ...sv.party.filter((p) => p.state !== 'left').map((p) => ({ key: p.npc, p }))];
      S.list = list.slice(0, 6);
      S.list.forEach((m, i) => {
        const y = oy + 76 + i * 96;
        let x = ox + 24 + 640 - 8;
        const add = (o) => { x -= o.w + 4; b.push({ kind: 'm', member: m.key, x, y: y + 60, h: 28, font: FONT, ...o }); };
        if (m.p && m.p.state !== 'cyberspace') {
          const full = activeCompanions(sv).length >= MAX_PARTY;
          add(m.p.state === 'active' ? { act: 'wait', label: t('party.toReserve'), w: 110 } : { act: 'join', label: t('party.toActive'), w: 110, disabled: full, reason: t('party.full') });
        }
        add({ act: 'calmers', label: `${ITEMS.calmers.name} ${sv.hero.items.calmers || 0}`, w: 150, disabled: !(sv.hero.items.calmers > 0) });
        add({ act: 'medkit', label: `${ITEMS.medkit.name} ${sv.hero.items.medkit || 0}`, w: 116, disabled: !(sv.hero.items.medkit > 0) });
        if (!m.p || m.p.state !== 'cyberspace') add({ act: 'gear', label: t('panel.gear'), w: 120 });
        add({ act: 'sheet', label: t('lvl.sheet'), w: 70 });
      });
      // talents (hero)
      const tl = sv.hero.talents.map((id) => TALENTS[id]).filter(Boolean);
      tl.forEach((x, i) => {
        if (!isCombatTalent(x)) return;
        const on = sv.hero.activeCombat.includes(x.id);
        b.push({ kind: 'talent', id: x.id, label: on ? '■' : '□', x: ox + 690, y: oy + 108 + i * 24 - 2, w: 24, h: 22, font: FONT_B, disabled: !canSwap });
      });
      if (sv.hero.pendingTalents > 0) b.push({ kind: 'pick', label: t('talent.pending'), x: ox + 690, y: oy + BASE_H - 160, w: 280, h: 40, selected: true });
      if ((sv.hero.pendingAsi || []).length) b.push({ kind: 'asi', label: t('lvl.asiPending'), x: ox + 980, y: oy + BASE_H - 160, w: 276, h: 40, selected: true });
      b.push({ kind: 'ai', label: `${t('party.aiCompanions')}: ${sv.settings.aiCompanions ? t('party.on') : t('party.off')}`, x: ox + 690, y: oy + BASE_H - 110, w: 380, h: 40 });
    }
    if (S.tab === 'gear') layoutGear(game, S, b);
    if (S.tab === 'codex') layoutCodex(game, S, b);
    if (S.tab === 'stats') {
      const ms = statMembers(sv);
      if (!ms.some((m) => m.key === S.statKey)) S.statKey = 'hero';
      ms.forEach((m, i) => b.push({ kind: 'statMember', id: m.key, label: m.name, x: ox + 24 + i * 152, y: oy + 64, w: 146, h: 28, font: FONT, selected: m.key === S.statKey }));
    }
    S.buttons = b;
  }

  function click(game, b) {
    const sv = game.save;
    if (b.disabled) { if (b.reason) game.toast(b.reason, 'c'); return; }
    play('uiClick');
    if (b.kind === 'tab') { S.tab = b.id; layout(game); return; }
    if (b.kind === 'statMember') { S.statKey = b.id; S.sc.off = 0; layout(game); return; }
    if (b.kind === 'back') { game.resume(back); return; }
    if (clickCodex(game, S, b)) { layout(game); return; }
    if (clickGear(game, S, b, (g) => rebuild(g))) { rebuild(game); return; }
    if (b.kind === 'm') {
      if (b.act === 'medkit' || b.act === 'calmers') return useItem(game, b.act, b.member);
      if (b.act === 'gear') { S.tab = 'gear'; S.gearKey = b.member; layout(game); return; }
      if (b.act === 'sheet') return openSheet(game, S.units[b.member], b.member === 'hero' ? sv.hero.name : NPCS[b.member].name, b.member === 'hero' ? sv.hero.xp : null);
      const p = sv.party.find((x) => x.npc === b.member);
      if (b.act === 'wait') p.state = 'waiting';
      if (b.act === 'join') p.state = 'active';
    }
    if (b.kind === 'talent') {
      const a = sv.hero.activeCombat;
      const i = a.indexOf(b.id);
      if (i >= 0) a.splice(i, 1);
      else if (a.length < COMBAT_TALENT_LIMIT(sv.hero.level)) a.push(b.id);
      else game.toast(t('talent.limit'), 'c');
    }
    if (b.kind === 'pick') return pickTalent(game);
    if (b.kind === 'asi') return openAsi(game, Math.min(...sv.hero.pendingAsi), (g) => rebuild(g), () => {});
    if (b.kind === 'ai') sv.settings.aiCompanions = !sv.settings.aiCompanions;
    saveGame(sv);
    rebuild(game);
  }

  // ---------------------------------------------------------------- render
  function renderParty(game) {
    const { ctx } = game;
    const sv = game.save;
    const ox = S.ox, oy = S.oy;
    S.list.forEach((m, i) => {
      const y = oy + 76 + i * 96;
      const u = S.units[m.key];
      if (!u) return;
      const isHero = m.key === 'hero';
      panel(ctx, ox + 24, y, 640, 92, C['1'], isHero ? C.h : C['2']);
      // portraits v2 (native 48 px): live wounds; companions show their mood by approval
      const po = { native: true, ...wounds(u), emotion: m.p ? (m.p.approval >= 50 ? 'happy' : m.p.approval <= -50 ? 'angry' : 'neutral') : 'neutral' };
      panel(ctx, ox + 34, y + 6, 52, 52, C['0'], C['2']);
      if (isHero) drawHeroPortrait(ctx, heroBuild(sv.hero), ox + 36, y + 8, 1, po);
      else drawPortrait(ctx, m.key, ox + 36, y + 8, 1, po);
      const name = isHero ? sv.hero.name : NPCS[m.key].name;
      text(ctx, fit(ctx, name, 220, FONT_B), ox + 104, y + 8, isHero ? C.h : C['5'], FONT_B);
      const cls = game.data.CLASSES[u.classId];
      text(ctx, fit(ctx, `${game.data.RACES[u.raceId]?.name || ''} · ${cls?.name || ''} · ${t('world.level')} ${u.level}`, 240, '12px monospace'), ox + 104, y + 28, C['4'], '12px monospace');
      if (m.p) {
        const st = t(`party.state.${m.p.state}`);
        const ap = m.p.approval;
        text(ctx, `${st} · ${t('party.approval')} ${ap > 0 ? '+' : ''}${ap}`, ox + 104, y + 44, ap <= -50 ? C.c : ap >= 50 ? C.j : C['4'], '12px monospace');
      } else text(ctx, `${t('world.credits')} ${sv.hero.credits} · ${t('party.marks')} ${sv.hero.judgeMarks || 0}/3`, ox + 104, y + 44, C['4'], '12px monospace');
      resLineTip(ctx, ox + 356, y + 8, 296, 'hp', u.hp, u.maxHp, t('res.hp'));
      resLineTip(ctx, ox + 356, y + 30, 296, 'mrl', u.mrl, u.maxMrl, t('res.mrl'));
      if (isHero) xpLine(ctx, ox + 356, y + 47, 296, sv.hero.xp, sv.hero.level, { small: true, h: 6 });
    });
    // hero talents & gadget
    const x = ox + 690, w = BASE_W - 714;
    text(ctx, `${t('party.talents')} · ${t('talent.combat')}: ${sv.hero.activeCombat.length}/${COMBAT_TALENT_LIMIT(sv.hero.level)}${canSwap ? '' : ` (${t('party.swapAtRest')})`}`, x, oy + 80, C['4'], FONT_B);
    sv.hero.talents.forEach((id, i) => {
      const tl = TALENTS[id];
      if (!tl) return;
      const y = oy + 108 + i * 24;
      text(ctx, fit(ctx, `${tl.name} — ${tl.desc}`, w - 40), x + 32, y, isCombatTalent(tl) ? (sv.hero.activeCombat.includes(id) ? C.a : C['3']) : C['5'], FONT);
      hotspot(x + 32, y, w - 40, 20, talentTip(id));
    });
    const g = gadgetFor(sv.hero.cls);
    let y = oy + 108 + sv.hero.talents.length * 24 + 12;
    if (g) {
      text(ctx, fit(ctx, `${t('create.gadget')}: ${g.name}`, w, FONT_B), x, y, C.h, FONT_B);
      y = textBlock(ctx, g.desc, x, y + 22, w, C['4'], FONT, LINE, 2);
    }
    itemChips(ctx, `${t('party.items')}:`, Object.entries(sv.hero.items).filter(([, n]) => n > 0), x, y + 8, w, { u: S.units.hero });
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
    if (!entries.length) rows.push({ text: t('journal.none'), color: C['3'], font: FONT, x: 0 });
    for (const [id, st] of entries) {
      const q = QUESTS[id];
      const col = st.turnin && st.state === 'done' ? C.a : st.state === 'done' ? C.j : st.state === 'failed' ? C.c : q.key ? C.a : C['5'];
      for (const l of wrap(ctx, `${q.key ? '★ ' : ''}${q.name} — ${t(st.turnin && st.state === 'done' ? 'journal.turnin' : `journal.${st.state}`)}`, w, FONT_B)) rows.push({ text: l, color: col, font: FONT_B, x: 0 });
      if (st.turnin && st.state === 'done') for (const l of wrap(ctx, turninText(sv, id), w - 20, FONT)) rows.push({ text: l, color: C['4'], font: FONT, x: 20 });
      if (stageOf(sv, id) && st.state === 'active') for (const l of wrap(ctx, currentGoalText(sv, id), w - 20, FONT)) rows.push({ text: l, color: C['4'], font: FONT, x: 20 });
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
    for (const id of tl) rows.push({ text: fit(ctx, `${TALENTS[id].name} — ${TALENTS[id].desc || ''}`, w - 8), color: (u.activeTalents || []).includes(id) || !isCombatTalent(TALENTS[id]) ? C['5'] : C['3'], font: FONT, x: 8, tip: talentTip(id) });
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
    const key = S.statKey;
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
    if (isHero) y = xpLine(ctx, x, y, W1, sv.hero.xp, sv.hero.level) + 6;
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
      hotspot(x, y, 384, 20, { title: SKILLS[sk].name, lines: [{ text: t(`stats.kind.${info.kind}`), color: 'a' }, parts.join(' · '), info.mode !== 'normal' ? t(`stats.mode.${info.mode}`) : ''] });
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
      } else if (S.tab === 'stats') {
        const u = S.units[S.statKey] || S.units.hero;
        if (u) used = updateScroll(S.sc, scView(), rowsH(statsRight(game, u)) + 8, inp.mouse);
      }
      if (inp.mouse.clicked && S.hover && !used) click(game, S.hover);
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
      for (const b of S.buttons) button(ctx, b, S.hover === b);
      if (S.tab === 'gear') renderGearHover(game, S);
    },
  };
  return self;
}
