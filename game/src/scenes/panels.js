// Party / Reputation / Journal screens (tabs). createPanelsScene({ tab: 'party'|'rep'|'journal', back, canSwap })
// back — scene to resume on Esc. canSwap — combat talent loadout can be changed (on a node with rest).
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { TALENTS, isCombatTalent, COMBAT_TALENT_LIMIT, talentsForSlot } from '../data/talents.js';
import { drawSprite, heroSpriteIds, idleFrame, drawPortrait } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, LINE, text, textBlock, fit, panel, button, hitButton, clear, resLine } from '../ui/draw.js';
import { FACTION_IDS, factionName, repTier, TIERS } from '../world/reputation.js';
import { buildHero, buildCompanion, MAX_PARTY, activeCompanions, journal } from '../world/state.js';
import { QUESTS, gadgetFor, ITEMS } from '../world/data.js';
import { stageOf, currentGoalText } from '../world/quests.js';
import { rollDice } from '../rules/dice.js';
import { tierColor } from './location.js';
import { saveGame } from '../save.js';

const BASE_W = 1280, BASE_H = 720;
const TABS = ['party', 'rep', 'journal'];

export function createPanelsScene({ tab = 'party', back, canSwap = false }) {
  const S = { tab, buttons: [], hover: null, time: 0, units: null };
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
    const h = it?.use?.heal;
    if (!u || !h || !(sv.hero.items[item] > 0)) return;
    sv.hero.items[item]--;
    const entry = key === 'hero' ? sv.hero : sv.party.find((p) => p.npc === key);
    const v = rollDice(Math.random, h.dice) + (h.bonus || 0);
    if (h.resource === 'mrl') entry.mrl = Math.min(u.maxMrl, u.mrl + v);
    else entry.hp = Math.min(u.maxHp, u.hp + v);
    game.toast(`${it.name}: +${v} ${t(`res.${h.resource === 'mrl' ? 'mrl' : 'hp'}`)}`, h.resource === 'mrl' ? 'f' : 'j');
    play('heal');
    saveGame(sv);
    rebuild(game);
  }

  function pickTalent(game) {
    const sv = game.save;
    const u = S.units.hero;
    const ctx = { race: sv.hero.race, cls: sv.hero.cls, origin: sv.hero.origin, alignment: sv.hero.alignment, stats: u.stats, level: sv.hero.level, weaponRange: u.weapon?.range || 1, tags: u.tags };
    const pool = ['race', 'job', 'stat'].flatMap((slot) => talentsForSlot(slot, ctx)).filter((x) => !sv.hero.talents.includes(x.id));
    game.openModal({
      title: t('talent.pending'), width: 980,
      lines: [{ text: t('talent.pickLevel'), color: 'a' }],
      options: pool.slice(0, 16).map((x) => ({ label: `${x.name}${isCombatTalent(x) ? ` · ${t('talent.combat')}` : ''}`, sub: x.desc, run: (g) => {
        sv.hero.talents.push(x.id);
        sv.hero.pendingTalents--;
        if (isCombatTalent(x) && sv.hero.activeCombat.length < COMBAT_TALENT_LIMIT(sv.hero.level)) sv.hero.activeCombat.push(x.id);
        journal(sv, `${t('talent.new')}: ${x.name}`);
        g.toast(`${t('talent.new')}: ${x.name}`, 'a');
        saveGame(sv);
        rebuild(g);
      } })),
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
        const add = (o) => { x -= o.w + 4; b.push({ kind: 'm', member: m.key, x, y: y + 56, h: 30, font: FONT, ...o }); };
        if (m.p && m.p.state !== 'cyberspace') {
          const full = activeCompanions(sv).length >= MAX_PARTY;
          add(m.p.state === 'active' ? { act: 'wait', label: t('party.toReserve'), w: 120 } : { act: 'join', label: t('party.toActive'), w: 120, disabled: full, reason: t('party.full') });
        }
        add({ act: 'calmers', label: `${ITEMS.calmers.name} ${sv.hero.items.calmers || 0}`, w: 170, disabled: !(sv.hero.items.calmers > 0) });
        add({ act: 'medkit', label: `${ITEMS.medkit.name} ${sv.hero.items.medkit || 0}`, w: 130, disabled: !(sv.hero.items.medkit > 0) });
      });
      // talents (hero)
      const tl = sv.hero.talents.map((id) => TALENTS[id]).filter(Boolean);
      tl.forEach((x, i) => {
        if (!isCombatTalent(x)) return;
        const on = sv.hero.activeCombat.includes(x.id);
        b.push({ kind: 'talent', id: x.id, label: on ? '■' : '□', x: ox + 690, y: oy + 108 + i * 24 - 2, w: 24, h: 22, font: FONT_B, disabled: !canSwap });
      });
      if (sv.hero.pendingTalents > 0) b.push({ kind: 'pick', label: t('talent.pending'), x: ox + 690, y: oy + BASE_H - 160, w: 280, h: 40, selected: true });
      b.push({ kind: 'ai', label: `${t('party.aiCompanions')}: ${sv.settings.aiCompanions ? t('party.on') : t('party.off')}`, x: ox + 690, y: oy + BASE_H - 110, w: 380, h: 40 });
    }
    S.buttons = b;
  }

  function click(game, b) {
    const sv = game.save;
    if (b.disabled) { if (b.reason) game.toast(b.reason, 'c'); return; }
    play('uiClick');
    if (b.kind === 'tab') { S.tab = b.id; layout(game); return; }
    if (b.kind === 'back') { game.resume(back); return; }
    if (b.kind === 'm') {
      if (b.act === 'medkit' || b.act === 'calmers') return useItem(game, b.act, b.member);
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
      if (isHero) drawSprite(ctx, heroSpriteIds(sv.hero.race, sv.hero.cls), ox + 32, y + 12, 4, { frame: idleFrame(S.time * 1000, i * 0.3) });
      else drawPortrait(ctx, m.key, ox + 32, y + 14, 2);
      const name = isHero ? sv.hero.name : NPCS[m.key].name;
      text(ctx, fit(ctx, name, 220, FONT_B), ox + 104, y + 8, isHero ? C.h : C['5'], FONT_B);
      const cls = game.data.CLASSES[u.classId];
      text(ctx, fit(ctx, `${game.data.RACES[u.raceId]?.name || ''} · ${cls?.name || ''} · ${t('world.level')} ${u.level}`, 240, '12px monospace'), ox + 104, y + 30, C['4'], '12px monospace');
      if (m.p) {
        const st = t(`party.state.${m.p.state}`);
        const ap = m.p.approval;
        text(ctx, `${st} · ${t('party.approval')} ${ap > 0 ? '+' : ''}${ap}`, ox + 104, y + 46, ap <= -50 ? C.c : ap >= 50 ? C.j : C['4'], '12px monospace');
      } else text(ctx, `${t('world.credits')} ${sv.hero.credits} · ${t('party.marks')} ${sv.hero.judgeMarks || 0}/3`, ox + 104, y + 46, C['4'], '12px monospace');
      resLine(ctx, ox + 356, y + 8, 296, 'hp', u.hp, u.maxHp, t('res.hp'));
      resLine(ctx, ox + 356, y + 30, 296, 'mrl', u.mrl, u.maxMrl, t('res.mrl'));
    });
    // hero talents & gadget
    const x = ox + 690, w = BASE_W - 714;
    text(ctx, `${t('party.talents')} · ${t('talent.combat')}: ${sv.hero.activeCombat.length}/${COMBAT_TALENT_LIMIT(sv.hero.level)}${canSwap ? '' : ` (${t('party.swapAtRest')})`}`, x, oy + 80, C['4'], FONT_B);
    sv.hero.talents.forEach((id, i) => {
      const tl = TALENTS[id];
      if (!tl) return;
      const y = oy + 108 + i * 24;
      text(ctx, fit(ctx, `${tl.name} — ${tl.desc}`, w - 40), x + 32, y, isCombatTalent(tl) ? (sv.hero.activeCombat.includes(id) ? C.a : C['3']) : C['5'], FONT);
    });
    const g = gadgetFor(sv.hero.cls);
    let y = oy + 108 + sv.hero.talents.length * 24 + 12;
    if (g) {
      text(ctx, `${t('create.gadget')}: ${g.name}`, x, y, C.h, FONT_B);
      y = textBlock(ctx, g.desc, x, y + 22, w, C['4'], FONT, LINE, 2);
    }
    text(ctx, `${t('party.items')}: ${Object.entries(sv.hero.items).filter(([, n]) => n > 0).map(([k, n]) => `${ITEMS[k]?.name || k} ×${n}`).join(', ') || '—'}`, x, y + 8, C['5'], FONT);
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
      const v = sv.rep[f] || 0;
      const tier = repTier(v);
      text(ctx, factionName(f), ox + 40, y + 6, C['5'], FONT_B);
      ctx.fillStyle = C['0'];
      ctx.fillRect(bx - 1, y + 7, bw + 2, 14);
      ctx.fillStyle = C['1'];
      ctx.fillRect(bx, y + 8, bw, 12);
      const zero = bx + bw / 2;
      const end = bx + ((v + 100) / 200) * bw;
      ctx.fillStyle = tierColor(tier);
      ctx.fillRect(Math.min(zero, end), y + 8, Math.abs(end - zero), 12);
      ctx.fillStyle = C['3'];
      for (const th of [-50, -15, 15, 50]) ctx.fillRect(bx + ((th + 100) / 200) * bw, y + 6, 1, 16);
      text(ctx, `${v > 0 ? '+' : ''}${v}`, bx + bw + 16, y + 6, C['5'], FONT_B);
      text(ctx, t(`tier.${tier}`), bx + bw + 80, y + 6, tierColor(tier), FONT_B);
    });
    text(ctx, TIERS.map((x) => t(`tier.${x}`)).join(' · '), ox + 40, oy + BASE_H - 24, C['3']);
  }

  function renderJournal(game) {
    const { ctx } = game;
    const sv = game.save;
    const ox = S.ox, oy = S.oy;
    let y = oy + 80;
    text(ctx, t('journal.quests'), ox + 24, y, C['4'], FONT_B);
    y += 28;
    const entries = Object.entries(sv.quests);
    if (!entries.length) { text(ctx, t('journal.none'), ox + 24, y, C['3']); y += LINE; }
    for (const [id, st] of entries) {
      const q = QUESTS[id];
      if (!q) continue;
      const col = st.state === 'done' ? C.j : st.state === 'failed' ? C.c : q.key ? C.a : C['5'];
      text(ctx, fit(ctx, `${q.key ? '★ ' : ''}${q.name} — ${t(`journal.${st.state}`)}`, 560, FONT_B), ox + 24, y, col, FONT_B);
      y += LINE + 2;
      const s = stageOf(sv, id);
      if (s) y = textBlock(ctx, currentGoalText(sv, id), ox + 44, y, 540, C['4'], FONT, LINE, 2) + 6;
    }
    text(ctx, t('journal.events'), ox + 640, oy + 80, C['4'], FONT_B);
    const list = sv.journal.slice(-26).reverse();
    list.forEach((e, i) => text(ctx, fit(ctx, `${t('world.day')} ${e.day}: ${e.text}`, 610), ox + 640, oy + 108 + i * LINE, i === 0 ? C['5'] : C['4']));
  }

  self = {
    id: 'panels',
    S,
    enter(game) { rebuild(game); },
    resume(game) { rebuild(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      S.time += dt;
      const inp = game.input;
      S.hover = hitButton(S.buttons, inp.mouse);
      if (inp.mouse.clicked && S.hover) click(game, S.hover);
      if (inp.wasPressed('Escape')) { play('uiClick'); game.resume(back); }
      else if (inp.wasPressed('KeyP')) { S.tab = 'party'; layout(game); }
      else if (inp.wasPressed('KeyR')) { S.tab = 'rep'; layout(game); }
      else if (inp.wasPressed('KeyJ')) { S.tab = 'journal'; layout(game); }
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      clear(ctx, W, H);
      if (S.tab === 'party') renderParty(game);
      else if (S.tab === 'rep') renderRep(game);
      else renderJournal(game);
      for (const b of S.buttons) button(ctx, b, S.hover === b);
    },
  };
  return self;
}
