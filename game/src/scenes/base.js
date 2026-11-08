// Base scene (world-consequences.md ч.3): Lis bunker panel — 7 module cards × 3 levels (build for credits +
// materials + days), power indicator, customisation, rest (medbay / quarters), stash (panels «gear»),
// workbench quality upgrade, radio rumor, defence battle of a pending raid. Logic — world/base.js.
// createBaseScene(back) — back: the location scene to return to (game.resume) or null (location re-created).
import { t } from '../data/text/index.js';
import { C, FONT, FONT_B, FONT_L, LINE, text, textBlock, fit, panel, button, hitButton, clear } from '../ui/draw.js';
import { play } from '../audio/sfx.js';
import { BASE_MODULES, BASE_CUSTOM, BASE_ATTACKS, BASE_LOCATION } from '../data/world/base.js';
import { QUALITY } from '../data/items/mods.js';
import { NPCS } from '../data/npcs.js';
import {
  baseState, modLevel, modActive, modFx, power, buildInfo, startBuild, buyCustom, hasCustom, baseTick, baseRestPlan,
  defendResult, defenseAllies, defenseKb, MODULE_IDS, lisOnline, orderInfo, placeOrder,
} from '../world/base.js';
import { ITEMS, LORE_RUMORS, LOCATIONS } from '../world/data.js';
import { restParty, activeCompanions, members, journal, MAX_PARTY, squadFree } from '../world/state.js';
import { addLoyalty, baseIdle, rejoin, sendToReserve, canRejoin, squadInfo } from '../world/companions.js';
import { passDays } from '../world/exodus.js';
import { EXODUS } from '../data/world/exodus.js';
import { countAll, addInst, makeInst, syncItems, refreshView, bagKeys, holderOf, bagOf, isGear } from '../world/inventory.js';
import { openCheck } from '../ui/checks-ui.js';
import { saveGame } from '../save.js';
import { openRestMenu } from './rest.js';
import { restState, provisionCount } from '../world/rest.js';

const BASE_W = 1280, BASE_H = 720;
const SMALL = '12px monospace';
const tf = (k, v = {}) => t(k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const Q_NEXT = { junk: 'working', working: 'masterwork' };

export function createBaseScene(back = null) {
  const S = { buttons: [], hover: null, focus: null, time: 0 };
  let self, ox = 0, oy = 0;
  const toastAll = (g, list) => { for (const x of list || []) g.toast(x.text, x.color); };
  const persist = (g) => saveGame(g.save);
  const leave = (g) => {
    if (back) { g.resume(back); return; }
    import('./location.js').then((m) => g.setScene(m.createLocationScene(BASE_LOCATION)));
  };
  const cardRect = (i) => ({ x: ox + 16 + (i % 4) * 314, y: oy + 80 + Math.floor(i / 4) * 214, w: 306, h: 206 });

  function status(sv, id) {
    const B = sv.base;
    if (B.queue?.id === id) return { text: t('base.building'), color: 'a' };
    if (!modLevel(sv, id)) return { text: t('base.off'), color: '3' };
    const a = modActive(sv, id);
    return a.ok ? { text: t('base.on'), color: 'j' } : { text: t('base.noPower'), color: 'c' };
  }

  function layout(game) {
    ox = Math.max(0, Math.floor((game.width - BASE_W) / 2));
    oy = Math.max(0, Math.floor((game.height - BASE_H) / 2));
    const sv = game.save;
    baseState(sv);
    const B = [];
    MODULE_IDS.forEach((id, i) => {
      const r = cardRect(i);
      const info = buildInfo(sv, id);
      B.push({ kind: 'card', id, x: r.x, y: r.y, w: r.w, h: r.h - 40, inert: true });
      B.push({ kind: 'build', id, x: r.x + 8, y: r.y + r.h - 36, w: r.w - 16, h: 30, font: FONT,
        label: info.level >= info.max ? t('base.max') : tf('base.build', { n: info.next }),
        disabled: !info.ok, reason: info.why && info.why !== 'max' ? t(`base.why.${info.why}`) : null });
    });
    // customisation (8th cell)
    const cr = cardRect(7);
    BASE_CUSTOM.forEach((c, i) => {
      const owned = hasCustom(sv, c.id);
      const locked = c.needsFlag && !sv.flags[c.needsFlag];
      B.push({ kind: 'custom', id: c.id, x: cr.x + 8, y: cr.y + 30 + i * 28, w: cr.w - 16, h: 25, font: SMALL,
        label: `${c.name} · ${owned ? t('base.owned') : tf('base.cost', { c: c.cost })}`, selected: owned,
        disabled: (owned && !c.fx.choices) || locked || (!owned && sv.hero.credits < c.cost), reason: locked ? t('base.why.lis') : null });
    });
    // actions
    const plan = baseRestPlan(sv);
    const acts = [
      { kind: 'rest', label: t('base.rest'), sub: tf('rest.hud', { n: restState(sv).short, max: restState(sv).max, food: provisionCount(sv) }), key: 'R' },
      { kind: 'stash', label: t('base.stash'), sub: t('base.stashSub'), key: 'I' },
      { kind: 'bench', label: t('base.bench'), sub: modFx(sv, 'workbench')?.qualityUp ? t('base.benchSub') : t('base.repairSub'), disabled: !(modFx(sv, 'workbench')?.qualityUp || modFx(sv, 'workbench')?.repair), reason: modActive(sv, 'workbench').why },
      { kind: 'rumor', label: t('base.radioRumor'), sub: t('base.radioRumorSub'), disabled: !modFx(sv, 'radio')?.rumorPerDay || sv.flags[`base-rumor:${sv.day}`] },
    ];
    const oi = orderInfo(sv);
    acts.push({ kind: 'order', label: t('base.order'), sub: oi ? tf('base.orderSub', { n: oi.left, max: oi.max }) : t('base.orderOff'), disabled: !oi || !oi.left });
    if (sv.base.raid) acts.push({ kind: 'defend', label: t('base.defend'), sub: t('base.defendSub'), selected: true });
    acts.push({ kind: 'idle', label: t('base.idle'), sub: `${baseIdle(sv).length} · ${tf('party.squad', { n: 1 + activeCompanions(sv).length, m: squadInfo(sv).max })}`, key: 'P' });
    acts.push({ kind: 'leave', label: t('base.leave'), sub: LOCATIONS[BASE_LOCATION]?.name || '', key: 'Esc' });
    const gap = 8, aw = Math.min(200, Math.floor((BASE_W - 32 - gap * (acts.length - 1)) / acts.length));
    let x = ox + BASE_W - 16 - acts.length * (aw + gap) + gap;
    for (const a of acts) { B.push({ ...a, x, y: oy + BASE_H - 60, w: aw, h: 48, font: FONT_B }); x += aw + gap; }
    S.buttons = B;
  }

  function click(game, b) {
    const sv = game.save;
    if (b.disabled) { if (b.reason && b.reason !== 'none') game.toast(b.reason, 'c'); play('miss'); return; }
    play('uiClick');
    if (b.kind === 'build') {
      const r = startBuild(sv, b.id);
      if (!r.ok) { game.toast(t(`base.why.${r.why}`), 'c'); return; }
      game.toast(tf('base.built', { name: BASE_MODULES[b.id].name, n: modLevel(sv, b.id) + (r.done ? 0 : 1) }), 'j');
      journal(sv, tf('base.built', { name: BASE_MODULES[b.id].name, n: sv.base.queue?.level || modLevel(sv, b.id) }));
    } else if (b.kind === 'custom') {
      const c = BASE_CUSTOM.find((x) => x.id === b.id);
      if (c.fx.choices) {
        game.openModal({ title: c.name, lines: [c.fx.note || ''], options: c.fx.choices.map((ch) => ({ label: ch, selected: sv.base.custom[c.id] === ch,
          run: (g) => { buyCustom(g.save, c.id, ch); persist(g); layout(g); } })) });
        return;
      }
      const r = buyCustom(sv, b.id);
      if (!r.ok) game.toast(t(`base.why.${r.why}`), 'c');
    } else if (b.kind === 'rest') return rest(game);
    else if (b.kind === 'stash') return import('./panels.js').then((m) => game.setScene(m.createPanelsScene({ tab: 'gear', back: self, canSwap: true })));
    else if (b.kind === 'bench') return bench(game);
    else if (b.kind === 'rumor') return radioRumor(game);
    else if (b.kind === 'order') return openOrder(game);
    else if (b.kind === 'defend') return defend(game);
    else if (b.kind === 'leave') { persist(game); return leave(game); }
    else if (b.kind === 'idle') return idleMenu(game);
    persist(game);
    layout(game);
  }

  /**
   * «Отдыхают на базе» (feedback 2026-11-07): companions out of the squad live in the bunker — talk, take into the
   * squad (free place: squadInfo), leave active ones at the base. Logic — world/companions.js.
   */
  function idleMenu(game) {
    const sv = game.save;
    const idle = baseIdle(sv);
    const act = activeCompanions(sv);
    const name = (p) => NPCS[p.npc]?.name || p.npc;
    const again = (g) => { persist(g); layout(g); idleMenu(g); };
    const options = [];
    for (const p of idle) {
      const r = canRejoin(sv, p);
      options.push({ label: `${name(p)}: ${t('base.take')}`, sub: `${t('world.level')} ${p.level || 1}`, disabled: !r.ok,
        reason: r.why === 'full' ? tf('party.squadFull', { m: squadInfo(sv).max }) : null, run: (g) => { rejoin(g.save, p.npc); again(g); } });
      options.push({ label: `${name(p)}: ${t('base.talk')}`, run: (g) => talk(g, p) });
    }
    for (const p of act) options.push({ label: `${name(p)}: ${t('base.leave')}`, run: (g) => { sendToReserve(g.save, p.npc); again(g); } });
    options.push({ label: t('loc.close'), run: (g) => layout(g) });
    const lines = [{ text: tf('party.squad', { n: 1 + act.length, m: squadInfo(sv).max }), color: 'a' }];
    if (!idle.length) lines.push({ text: t('base.idleNone'), color: '4' });
    game.openModal({ title: t('base.idle'), width: 760, lines, options, onCancel: (g) => layout(g) });
  }

  /** A short talk with a resting companion: their bark / hook in the dialogue scene, back to the base. */
  function talk(game, p) {
    const n = NPCS[p.npc] || {};
    const said = [n.bark, n.hook].filter(Boolean);
    import('./dialogue.js').then((m) => game.setScene(m.createDialogueScene({ title: t('base.idle'), hero: game.save.hero,
      lines: (said.length ? said : ['…']).map((text) => ({ who: p.npc, name: n.name, text })), onDone: (g) => g.resume(self) })));
  }

  /** Rest at the base = a long rest through the shared window (scenes/rest.js, mode 'base': rations from the stash count). */
  function rest(game) {
    openRestMenu(game, { mode: 'base', back: self, afterLong: baseAfterRest, done: (g) => layout(g) });
  }

  /** Base extras after a 1-day rest: medbay (withdrawal, souls, medkits), quarters loyalty, base time. */
  function baseAfterRest(game) {
    const sv = game.save;
    const plan = baseRestPlan(sv);
    const med = modFx(sv, 'medbay');
    if (med?.withdrawalClear) { delete sv.hero.withdrawal; for (const p of sv.party) delete p.withdrawal; }
    if (plan.revive) {
      for (const p of sv.party.filter((x) => x.state === 'cyberspace')) {
        p.state = squadFree(sv) > 0 ? 'active' : 'waiting'; p.hp = null; p.mrl = null;
        game.toast(tf('base.revived', { name: NPCS[p.npc]?.name || p.npc }), 'j');
      }
    }
    if (plan.medkits) { syncItems(sv); addInst(sv, makeInst('medkit'), plan.medkits); refreshView(sv); game.toast(t('base.medkit'), 'j'); }
    for (const l of plan.loyalty) toastAll(game, addLoyalty(sv, l.npc, l.d));
    toastAll(game, baseTick(sv));
    game.toast(t('base.restDone'), 'j');
  }

  /** Workbench L3: junk → working → masterwork, Tech check, once per item instance. */
  function bench(game) {
    const sv = game.save;
    const wf = modFx(sv, 'workbench') || {};
    const fx = wf.qualityUp;
    syncItems(sv);
    const rows = [], junk = [];
    for (const k of bagKeys(sv)) {
      const grid = bagOf(holderOf(sv, k)).grid;
      grid.forEach((e) => {
        if (!isGear(ITEMS[e.item]) || ITEMS[e.item].slot === 'mod') return;
        if (wf.repair && e.q === 'junk') junk.push(e);
        if (fx && Q_NEXT[e.q] && !e.up) rows.push({ e, k });
      });
    }
    // workbench L2: repair junk → working for repairPrice × price, no check
    const repairCost = (e) => Math.max(1, Math.round((ITEMS[e.item].price || 0) * (wf.repairPrice ?? 0.2)));
    const repairs = junk.slice(0, 6).map((e) => ({ label: `${t('base.repair')}: ${ITEMS[e.item].name}`, sub: `${QUALITY.junk.name} → ${QUALITY.working.name} · ${repairCost(e)} ${t('world.credits')}`,
      disabled: sv.hero.credits < repairCost(e),
      run: (g2) => { sv.hero.credits -= repairCost(e); e.q = 'working'; g2.toast(tf('base.repaired', { name: ITEMS[e.item].name }), 'j'); refreshView(sv); persist(g2); layout(g2); } }));
    if (!fx) {
      if (!repairs.length) { game.openModal({ title: t('base.bench'), lines: [t('base.repairNone')], options: [{ label: t('loc.close'), run: () => {} }] }); return; }
      game.openModal({ title: t('base.bench'), width: 820, lines: [t('base.repairSub')], options: [...repairs, { label: t('loc.close'), run: () => {} }] });
      return;
    }
    if (!rows.length && !repairs.length) { game.openModal({ title: t('base.bench'), lines: [t('base.benchNone')], options: [{ label: t('loc.close'), run: () => {} }] }); return; }
    game.openModal({ title: t('base.bench'), width: 820, lines: [`${t('base.benchSub')}: ${t(`skill.${fx.skill}`)} ${t('battle.dc')} ${fx.dc}`],
      options: [...rows.slice(0, repairs.length ? 5 : 9).map(({ e }) => ({ label: ITEMS[e.item].name, sub: `${QUALITY[e.q].name} → ${QUALITY[Q_NEXT[e.q]].name}`,
        run: (g) => openCheck(g, { title: `${t('base.bench')}: ${ITEMS[e.item].name}`, skill: fx.skill, dc: fx.dc, members: members(sv, g.data), cancel: true,
          onDone: (g2, ok) => {
            e.up = true;
            if (ok) { e.q = Q_NEXT[e.q]; g2.toast(tf('base.benchOk', { name: ITEMS[e.item].name }), 'j'); } else g2.toast(tf('base.benchFail', { name: ITEMS[e.item].name }), 'c');
            refreshView(sv); persist(g2); layout(g2);
          } }) })), ...repairs, { label: t('loc.close'), run: () => {} }] });
  }

  /** Radio L2: order goods from a vendor — paid now, delivered in N days (world/base.js orderInfo / placeOrder). */
  function openOrder(game) {
    const sv = game.save;
    const oi = orderInfo(sv);
    if (!oi) return;
    game.openModal({ title: t('base.order'), width: 820, lines: [tf('base.orderText', { n: oi.left, max: oi.max, d: oi.days }), { text: `${t('world.credits')}: ${sv.hero.credits}`, color: 'b' }],
      options: [...oi.stock.map((x) => ({ label: `${ITEMS[x.id].name} — ${x.price}`, disabled: !oi.left || sv.hero.credits < x.price,
        run: (g) => { if (placeOrder(sv, x.id)) g.toast(tf('base.ordered', { item: ITEMS[x.id].name, d: oi.days }), 'j'); persist(g); layout(g); } })),
      { label: t('loc.close'), run: () => {} }] });
  }

  function radioRumor(game) {
    const sv = game.save;
    sv.flags[`base-rumor:${sv.day}`] = true;
    const lr = LORE_RUMORS.length ? LORE_RUMORS[Math.floor(Math.random() * LORE_RUMORS.length)] : null;
    if (!lr) { game.toast(t('base.noRumor'), '4'); layout(game); return; }
    journal(sv, `${t('map.rumor')} (${LOCATIONS[lr.loc]?.name || lr.loc}): ${lr.text}`);
    persist(game);
    layout(game);
    game.openModal({ title: t('base.radioRumor'), lines: [{ text: LOCATIONS[lr.loc]?.name || '', color: 'a' }, { text: `«${lr.text}»` }], options: [{ label: t('battle.continue'), run: () => {} }] });
  }

  function defend(game) {
    const sv = game.save;
    const ev = sv.base.raid.ev;
    const kb = defenseKb(sv); // barricades: the party's KB in this battle (partyUnits reads save.battleBuff)
    if (kb) sv.battleBuff = { kb }; else delete sv.battleBuff;
    import('./world-battle.js').then((m) => m.startWorldBattle(game, {
      encounter: ev.encounter, map: BASE_ATTACKS.defenseMap, location: BASE_LOCATION, allies: defenseAllies(sv), faction: null,
      title: tf('base.defendTitle', { name: ev.name }), id: `base-raid:${sv.day}`,
      onWin: (g) => { delete g.save.battleBuff; toastAll(g, defendResult(g.save, true)); persist(g); g.setScene(createBaseScene(back)); },
      onLose: (g) => { delete g.save.battleBuff; toastAll(g, defendResult(g.save, false)); persist(g); import('./cyberspace.js').then((c) => c.startCyberspace(g, { reason: 'wipe', helped: false })); },
    }));
  }

  // ---------------------------------------------------------------- render
  function drawCard(ctx, sv, id, i) {
    const r = cardRect(i);
    const m = BASE_MODULES[id];
    const lv = modLevel(sv, id);
    const st = status(sv, id);
    const info = buildInfo(sv, id);
    panel(ctx, r.x, r.y, r.w, r.h, C['1'], S.focus === id ? C.h : C['3']);
    text(ctx, `${m.glyph} ${m.name}`, r.x + 10, r.y + 8, C.h, FONT_B);
    text(ctx, tf('base.lvl', { n: lv, max: m.levels.length }), r.x + r.w - 10, r.y + 10, C['5'], FONT, 'right');
    for (let k = 0; k < m.levels.length; k++) { ctx.fillStyle = k < lv ? C.j : C['2']; ctx.fillRect(r.x + 10 + k * 22, r.y + 32, 18, 6); }
    text(ctx, st.text, r.x + 80, r.y + 28, C[st.color], SMALL);
    const cur = lv ? m.levels[lv - 1].fx.note : m.desc;
    textBlock(ctx, cur || '', r.x + 10, r.y + 46, r.w - 20, lv ? C['5'] : C['4'], SMALL, 15, 4);
    if (info.cost) {
      const y = r.y + 112;
      text(ctx, `→ ${tf('base.lvl', { n: info.next, max: info.max })}: ${tf('base.cost', { c: info.cost.credits })} · ${tf('base.days', { n: info.cost.days })} · ⚡${info.power}`, r.x + 10, y, sv.hero.credits >= info.cost.credits ? C.a : C.c, SMALL);
      info.rows.forEach((row, k) => text(ctx, fit(ctx, `${ITEMS[row.id]?.name || row.id} ${row.have}/${row.need}`, r.w - 20, SMALL), r.x + 10, y + 16 + k * 15, row.have >= row.need ? C.j : C.c, SMALL));
    }
  }

  function drawTop(ctx, sv) {
    text(ctx, t('base.title'), ox + 16, oy + 14, C.h, FONT_L);
    text(ctx, `${t('world.day')} ${sv.day} · ${t('world.credits')} ${sv.hero.credits}`, ox + BASE_W - 16, oy + 18, C.b, FONT_B, 'right');
    const p = power(sv);
    const g = modLevel(sv, 'generator');
    const parts = [{ s: tf('base.power', { use: p.use, supply: p.supply }), c: p.ok && p.supply ? 'j' : 'c' }];
    if (g) {
      const fuel = BASE_MODULES.generator.levels[g - 1].fx.fuel;
      parts.push(sv.base.noFuel ? { s: t('base.noFuel'), c: 'c' } : { s: tf('base.fuel', { name: ITEMS[fuel.item]?.name || fuel.item, n: countAll(sv)[fuel.item] || 0 }), c: '4' });
    }
    if (sv.base.queue) parts.push({ s: tf('base.queue', { name: BASE_MODULES[sv.base.queue.id].name, n: sv.base.queue.level, day: sv.base.queue.ready }), c: 'a' });
    if (sv.base.raid) parts.push({ s: tf('base.raid', { name: sv.base.raid.ev.name, day: sv.base.raid.until }), c: 'c' });
    let x = ox + 16;
    ctx.font = FONT_B;
    for (const q of parts) { text(ctx, q.s, x, oy + 52, C[q.c], FONT_B); x += ctx.measureText(q.s).width + 24; }
  }

  function drawInfo(ctx, sv) {
    const x = ox + 16, y = oy + 512, w = BASE_W - 32;
    panel(ctx, x, y, w, 134, C['1'], C['2']);
    const id = S.focus;
    if (id && BASE_MODULES[id]) {
      const m = BASE_MODULES[id];
      text(ctx, `${m.glyph} ${m.name}`, x + 12, y + 8, C.h, FONT_B);
      textBlock(ctx, m.desc, x + 12, y + 30, w - 24, C['5'], FONT, LINE, 2);
      m.levels.forEach((l, k) => text(ctx, fit(ctx, `${k + 1}. ${l.fx.note}`, w - 24, SMALL), x + 12, y + 72 + k * 18, k < modLevel(sv, id) ? C.j : C['4'], SMALL));
      return;
    }
    const lines = [t('base.hint')];
    if (lisOnline(sv)) lines.push(BASE_ATTACKS.lisReaction[Math.floor(S.time / 6) % BASE_ATTACKS.lisReaction.length]);
    const lr = sv.base.lastRaid;
    if (lr) lines.push(tf('base.lastRaid', { text: `${lr.id} · ${lr.result} · ${t('world.day')} ${lr.day}` }));
    lines.forEach((l, k) => text(ctx, fit(ctx, l, w - 24), x + 12, y + 10 + k * LINE, k ? C['4'] : C['5']));
  }

  self = {
    id: 'base',
    S,
    enter(game) { toastAll(game, baseTick(game.save)); persist(game); layout(game); },
    resume(game) { layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      S.time += dt;
      const inp = game.input, m = inp.mouse;
      const h = hitButton(S.buttons, m);
      S.hover = h && !h.inert ? h : null;
      S.focus = h && (h.kind === 'card' || h.kind === 'build') ? h.id : null;
      if (m.clicked && S.hover) return click(game, S.hover);
      if (inp.wasPressed('Escape')) { persist(game); return leave(game); }
      if (inp.wasPressed('KeyR')) return rest(game);
      if (inp.wasPressed('KeyI')) return click(game, S.buttons.find((b) => b.kind === 'stash'));
      if (inp.wasPressed('KeyP')) return idleMenu(game);
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      const sv = game.save;
      clear(ctx, W, H);
      drawTop(ctx, sv);
      MODULE_IDS.forEach((id, i) => drawCard(ctx, sv, id, i));
      const cr = cardRect(7);
      panel(ctx, cr.x, cr.y, cr.w, cr.h, C['1'], C['3']);
      text(ctx, t('base.custom'), cr.x + 10, cr.y + 8, C.h, FONT_B);
      drawInfo(ctx, sv);
      for (const b of S.buttons) if (!b.inert) button(ctx, b, S.hover === b);
    },
  };
  return self;
}
