// Roguelike «Забег» — run map (docs/specs/roguelike.md «UI»): layers left → right, node glyphs, links, walked path,
// available nodes blink; top bar (seed, act, level, credits, rerolls, relics), party on the right (ЗДР/МРЛ, fallen grey).
// Node handlers: battles (scenes/battle.js createBattleScene, setup from run.fightSetup), events (density events, seeded
// checks), shop (vendorStock), rest, treasure. Autosave between nodes (slot «забег», world/run.js saveRun).
import { t } from '../data/text/index.js';
import { ACTS, NODE_TYPES, RELICS, RUN } from '../data/roguelike.js';
import { C, FONT, FONT_B, FONT_L, text, button, hitButton, clear, panel, bar, fit } from '../ui/draw.js';
import { drawSprite, heroSpriteIds } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { createBattleScene } from './battle.js';
import { openRunReward } from './run-reward.js';
import { createRunEndScene } from './run-end.js';
import * as R from '../world/run.js';

const GLYPH = { fight: '⚔', elite: '☠', event: '?', shop: '$', rest: '♨', treasure: '▣', boss: '♛' };
const COLOR = { fight: '5', elite: 'c', event: 'b', shop: 'a', rest: 'j', treasure: 'h', boss: 'c' };

export function createRunMapScene(run) {
  const S = { run, buttons: [], nodes: [], hover: null, hoverNode: null, time: 0 };

  function layout(game) {
    const W = game.width, H = game.height;
    const g = run.graph;
    const x0 = 70, x1 = W - 390, y0 = 120, y1 = H - 90;
    const L = g.layers.length;
    S.nodes = g.layers.flat().map((n) => ({ n, x: x0 + ((x1 - x0) * n.layer) / (L - 1), y: y0 + (y1 - y0) * n.y, r: n.type === 'boss' ? 26 : 19 }));
    const B = [];
    B.push({ id: 'bag', x: 16, y: H - 60, w: 160, h: 44, label: t('run.bag'), key: 'B' });
    B.push({ id: 'menu', x: 184, y: H - 60, w: 160, h: 44, label: t('run.toMenu'), key: 'Esc' });
    B.push({ id: 'giveup', x: 352, y: H - 60, w: 160, h: 44, label: t('run.giveUp') });
    S.buttons = B;
  }
  const back = (game) => { game.setScene(scene); };

  const scene = {
    id: 'run-map',
    S,
    enter(game) { S.time = 0; layout(game); afterNode(game); },
    resume(game) { layout(game); afterNode(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      S.time += dt;
      const inp = game.input, m = inp.mouse;
      const h = hitButton(S.buttons, m);
      const av = new Set(R.available(run).map((n) => n.id));
      S.hoverNode = S.nodes.find((p) => (m.x - p.x) ** 2 + (m.y - p.y) ** 2 <= (p.r + 4) ** 2) || null;
      const hv = h || (S.hoverNode && av.has(S.hoverNode.n.id) ? S.hoverNode : null);
      if (hv !== S.hover && hv) play('uiHover');
      S.hover = hv;
      let act = null;
      if (m.clicked && h && !h.disabled) act = h.id;
      if (inp.wasPressed('KeyB')) act = 'bag';
      if (inp.wasPressed('Escape')) act = 'menu';
      if (m.clicked && !act && S.hoverNode && av.has(S.hoverNode.n.id)) { play('uiClick'); return visit(game, S.hoverNode.n.id); }
      if (!act) return;
      play('uiClick');
      if (act === 'bag') openBag(game, run);
      else if (act === 'menu') { R.saveRun(run); import('./menu.js').then((mm) => game.setScene(mm.menuScene)); }
      else if (act === 'giveup') game.openModal({ title: t('run.giveUp'), lines: [t('run.giveUpQ')], options: [
        { label: t('run.yes'), run: (g) => { R.endRun(run, 'loss'); finish(g, run); } }, { label: t('run.no') }] });
    },
    render(game) { renderMap(game, S); },
  };

  /** Pending things after a node (free talent of the spirit / kits), autosave. */
  function afterNode(game) {
    if (run.status !== 'map') return finish(game, run);
    const p = run.pending.shift();
    if (p && p.kind === 'talent') return openRunReward(game, run, { offer: R.rewardOffer(run, 'fight', { only: 'talent' }), onDone: (g) => back(g) });
    R.saveRun(run);
  }

  function visit(game, id) {
    const node = R.enterNode(run, id);
    if (!node) return;
    const done = (g) => {
      const r = R.completeNode(run, node);
      if (r === 'act') g.toast(`${t('run.actDone')} ${t('run.act')} ${run.act + 1}: ${ACTS[run.act].name}`, 'j');
      if (r === 'win' || run.status !== 'map') return finish(g, run);
      back(g);
    };
    const t0 = node.type;
    if (t0 === 'fight' || t0 === 'elite' || t0 === 'boss') return runFight(game, run, node, node.enc, (g) => fightRewards(g, run, node, t0, done));
    if (t0 === 'event') return runEventNode(game, run, node, done);
    if (t0 === 'shop') return openRunShop(game, run, node, done);
    if (t0 === 'rest') return openRunRest(game, run, node, done);
    if (t0 === 'treasure') return openTreasureNode(game, run, node, done);
    done(game);
  }
  return scene;
}

// ------------------------------------------------------------------ battles

/** Start the battle of a node; then(game) after a victory (deaths applied). A defeat ends the run. */
export function runFight(game, run, node, encId, then) {
  const setup = R.fightSetup(run, node, encId);
  const units = R.partyUnits(run);
  const scene = createBattleScene({
    heroes: units, enemies: setup.enemies, map: setup.map, seed: setup.seed, objectives: setup.objectives, enemyInit: setup.enemyInit,
    title: `${t('run.title')} · ${NODE_TYPES[node.type]?.name || ''}: ${setup.title}`,
    onWin: (g, S2) => { report(g, R.applyFight(run, node, S2.b.units, true)); R.saveRun(run); if (run.status !== 'map') return finish(g, run); then(g); },
    onLose: (g, S2) => { R.applyFight(run, node, S2.b.units, false); finish(g, run); },
    onExit: () => { import('./menu.js').then((mm) => game.setScene(mm.menuScene)); }, // the slot keeps the run before this node
  });
  game.setScene(scene);
}
function report(game, res) {
  for (const r of res.rescues || []) game.toast(`${r.name}: ${r.ok ? t('run.rescued') : t('run.rescueFail')}`, r.ok ? 'j' : 'c');
  for (const n of res.deaths) game.toast(`${n} ${t('run.deathToast')}`, 'c');
  if (res.revived) game.toast(`${t('run.revived')}: ${res.revived}`, 'j');
}

/** Rewards after a won fight: credits, 1 of 3, elite relic offer, boss relic choice. */
function fightRewards(game, run, node, kind, done) {
  const cr = R.nodeCredits(run, node);
  if (cr) game.toast(`${t('run.creditsGot')}: +${cr}`, 'a');
  const relicStep = (g) => {
    if (kind === 'boss') return openRunReward(g, run, { relics: R.relicOffer(run, NODE_TYPES.boss.relicChoices), onDone: (g2) => done(g2) });
    if (kind === 'elite' && R.eliteRelicRoll(run, node)) {
      const rl = R.relicOffer(run, 1);
      if (rl.length) return openRunReward(g, run, { relics: rl, title: t('run.relicOffer'), onDone: (g2) => done(g2) });
    }
    done(g);
  };
  openRunReward(game, run, { offer: R.rewardOffer(run, kind), onDone: (g) => relicStep(g) });
}

export function finish(game, run) {
  R.clearRun();
  game.setScene(createRunEndScene(run));
}

// ------------------------------------------------------------------ event / shop / rest / treasure

function runEventNode(game, run, node, done) {
  const e = R.eventFor(run, node);
  if (e.kind === 'fight') {
    game.toast(t('run.ambush'), 'c');
    return runFight(game, run, node, e.enc, (g) => openRunReward(g, run, { offer: R.rewardOffer(run, 'fight'), onDone: (g2) => done(g2) }));
  }
  const ev = e.ev;
  game.openModal({
    title: `${t('run.event')}: ${ev.name}`, width: 900, onCancel: false,
    lines: ev.scene.map((l) => ({ text: l.text, color: '5' })),
    options: ev.choices.map((c) => ({
      label: c.text, sub: c.check ? `${t('run.check')}: ${t(`skill.${c.check.skill}`)} · СЛ ${c.check.dc}` : null,
      run: (g) => {
        const r = R.eventChoice(run, node, ev, c);
        const lines = [];
        if (r.check) lines.push({ text: `${t('run.check')}: ${r.check.who} · d20 ${r.check.nat} → ${r.check.total} / СЛ ${r.check.dc}`, color: r.check.ok ? 'j' : 'c' });
        if (r.outcome.text) lines.push({ text: r.outcome.text, color: '5' });
        if (r.credits) lines.push({ text: `${t('run.credits')}: ${r.credits > 0 ? '+' : ''}${r.credits}`, color: 'a' });
        for (const [id, n] of r.items) lines.push({ text: `+ ${g.data.ITEMS[id]?.name || id} ×${n}`, color: 'j' });
        g.openModal({ title: ev.name, width: 900, onCancel: false, lines, options: [{ label: t('run.next'), run: (g2) => {
          if (r.battle) return runFight(g2, run, node, r.battle, (g3) => openRunReward(g3, run, { offer: R.rewardOffer(run, 'fight'), onDone: (g4) => done(g4) }));
          done(g2);
        } }] });
      },
    })),
  });
}

function pickHero(game, run, title, then) {
  const al = R.alive(run);
  if (al.length === 1) return then(game, al[0]);
  game.openModal({ title: title || t('run.pickHero'), lines: [], options: [...al.map((m) => ({ label: m.name, sub: game.data.CLASSES[m.cls]?.name, run: (g) => then(g, m) })), { label: t('run.back') }] });
}

export function openRunShop(game, run, node, done) {
  const D = game.data;
  const spec = () => {
    const rows = R.shopStock(run, node);
    return {
      title: `${t('run.shop')} · ${t('run.credits')}: ${run.credits}`, width: 820, onCancel: (g) => { R.saveRun(run); done(g); },
      lines: [],
      options: [
        ...rows.map((r) => {
          const it = D.ITEMS[r.id];
          return { label: `${it.name} — ${r.price}`, sub: r.sold ? t('run.sold') : run.credits < r.price ? t('run.noMoney') : `${it.cat === 'consumable' ? '' : `T${it.tier || 1} · `}${(it.desc || '').slice(0, 70)}`,
            disabled: r.sold || run.credits < r.price,
            run: (g) => {
              if (it.cat === 'consumable') { R.buy(run, node, r.i, null); return reopen(g); }
              pickHero(g, run, it.name, (g2, m) => { R.buy(run, node, r.i, m.id); reopen(g2); });
            } };
        }),
        { label: `${t('run.shopReroll')} (${NODE_TYPES.shop.reroll})`, disabled: run.credits < NODE_TYPES.shop.reroll, run: (g) => { R.rerollShop(run, node); reopen(g); } },
        { label: t('run.sell'), disabled: !Object.keys(run.bag).length, run: (g) => sellMenu(g) },
        { label: t('run.leave'), run: (g) => { R.saveRun(run); done(g); } },
      ],
    };
  };
  const reopen = (g) => g.openModal(spec());
  const sellMenu = (g) => g.openModal({ title: t('run.sell'), lines: [], onCancel: (g2) => reopen(g2), options: [
    ...Object.entries(run.bag).map(([id, n]) => ({ label: `${D.ITEMS[id]?.name || id} ×${n}`, sub: `+${R.sellPrice(run, id)}`, run: (g2) => { R.sell(run, id); sellMenu(g2); } })),
    { label: t('run.back'), run: (g2) => reopen(g2) }] });
  reopen(game);
}

export function openRunRest(game, run, node, done) {
  const pct = Math.round(R.restHealShare(run) * 100);
  game.openModal({
    title: t('run.rest'), width: 640, onCancel: false, lines: [],
    options: RUN.restOptions.map((o) => ({
      label: t(`run.rest.${o}`), sub: t(`run.rest.${o}Sub`).replace('{n}', pct),
      run: (g) => {
        if (o !== 'train') { R.doRest(run, o); return done(g); }
        pickHero(g, run, t('run.rest.train'), (g2, m) => openRunReward(g2, run, { offer: R.doRest(run, 'train', m.id), onDone: (g3) => done(g3) }));
      },
    })),
  });
}

function openTreasureNode(game, run, node, done) {
  const r = R.openTreasure(run, node);
  const lines = [{ text: t('run.chest'), color: '5' }];
  if (r.trap) lines.push({ text: `${t('run.trap')} (${r.check.who}, d20 ${r.check.nat} → ${r.check.total} / СЛ ${r.check.dc}): ${r.check.ok ? t('run.trapOk') : t('run.trapFail').replace('{n}', r.dmg)}`, color: r.check.ok ? 'j' : 'c' });
  game.openModal({ title: t('run.treasure'), lines, onCancel: false, options: [{ label: t('run.next'),
    run: (g) => openRunReward(g, run, { offer: R.rewardOffer(run, 'treasure'), onDone: (g2) => done(g2) }) }] });
}

/** Shared bag: give gear / consumables to a hero (equip; the old piece goes back to the bag). */
export function openBag(game, run) {
  const D = game.data;
  const ids = Object.keys(run.bag);
  game.openModal({
    title: `${t('run.bag')} · ${t('run.credits')}: ${run.credits}`, width: 760,
    lines: ids.length ? [] : [t('run.bagEmpty')],
    options: [...ids.map((id) => ({ label: `${D.ITEMS[id]?.name || id} ×${run.bag[id]}`, sub: t('run.give'),
      run: (g) => pickHero(g, run, D.ITEMS[id]?.name, (g2, m) => { R.equipFromBag(run, m.id, id); R.saveRun(run); openBag(g2, run); }) })),
    { label: t('run.back') }],
  });
}

// ------------------------------------------------------------------ render

const statCache = new Map();
/** memberStats builds a creature: cache by everything it depends on. */
function statsOf(run, m) {
  const k = [run.seed, m.id, run.act, run.layer, m.hpLost, m.mrlLost, m.weapon, m.armor, m.talents.join(), m.mods.weapon.join(), m.mods.armor.join(), run.relics.join(), run.asc].join('|');
  let s = statCache.get(k);
  if (!s) { if (statCache.size > 64) statCache.clear(); s = R.memberStats(run, m); statCache.set(k, s); }
  return s;
}

function renderMap(game, S) {
  const { ctx, width: W, height: H } = game;
  const run = S.run;
  clear(ctx, W, H);
  const A = ACTS[run.act];
  text(ctx, `${t('run.title')} · ${t('run.act')} ${run.act + 1}/${ACTS.length}: ${A.name}`, 16, 14, C.h, FONT_L);
  text(ctx, `${t('run.seed')} ${run.seed} · ${t('run.asc')} ${run.asc} · ${t('run.level')} ${R.runLevel(run)} · ${t('run.credits')} ${run.credits} · ${t('run.rerolls')} ${run.rerolls}`, 16, 50, C['4'], FONT_B);
  // relics
  let rx = 16;
  for (const id of run.relics) {
    const rl = RELICS.find((x) => x.id === id);
    const w = Math.min(220, ctx.measureText ? 18 + 9 * (rl?.name.length || 4) : 120);
    panel(ctx, rx, 76, w, 24, C['1'], C[rl?.rarity === 'epic' ? 'h' : rl?.rarity === 'rare' ? 'b' : '3']);
    text(ctx, rl?.name || id, rx + 8, 80, C['5'], FONT);
    rx += w + 6;
  }
  const av = new Set(R.available(run).map((n) => n.id));
  const walked = new Set(run.path);
  const pos = Object.fromEntries(S.nodes.map((p) => [p.n.id, p]));
  // links
  for (const p of S.nodes) for (const id of p.n.links) {
    const q = pos[id];
    const lit = walked.has(p.n.id) && walked.has(id);
    ctx.strokeStyle = lit ? C.h : C['3'];
    ctx.lineWidth = lit ? 4 : 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  ctx.lineWidth = 1;
  // current layer band
  const cur = S.nodes.find((p) => p.n.id === run.node);
  if (cur) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(cur.x - 30, 112, 60, H - 196); }
  const blink = (Math.sin(S.time * 6) + 1) / 2;
  for (const p of S.nodes) {
    const n = p.n;
    const isAv = av.has(n.id), isWalk = walked.has(n.id);
    const col = C[COLOR[n.type] || '5'];
    ctx.fillStyle = isWalk ? C['3'] : C['1'];
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = isAv ? (blink > 0.5 ? C.h : col) : isWalk ? C.h : col;
    ctx.lineWidth = isAv ? 3 + blink * 2 : n.id === run.node ? 4 : 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    text(ctx, GLYPH[n.type] || '•', p.x, p.y - (n.type === 'boss' ? 14 : 10), isWalk ? C['4'] : col, n.type === 'boss' ? FONT_L : FONT_B, 'center');
  }
  // hover tip
  const hn = S.hoverNode;
  if (hn) {
    const n = hn.n;
    const shown = av.has(n.id) || walked.has(n.id) || n.type === 'boss';
    const lines = [NODE_TYPES[n.type]?.name || n.type];
    if (n.enc) lines.push(shown ? game.data.ENCOUNTERS[n.enc]?.name || n.enc : t('run.hidden'));
    lines.push(`${t('run.level')} ${R.levelAt(run.act, n.layer)}`);
    const tw = 280, th = 12 + lines.length * 22;
    const tx = Math.min(hn.x + 24, W - tw - 330), ty = Math.max(110, hn.y - th / 2);
    panel(ctx, tx, ty, tw, th, C['1'], C['4']);
    lines.forEach((l, i) => text(ctx, l, tx + 10, ty + 6 + i * 22, i ? C['4'] : C['5'], i ? FONT : FONT_B));
  }
  text(ctx, t('run.pickNode'), 530, H - 48, C['3'], FONT);
  // party
  const px = W - 320;
  text(ctx, t('run.party'), px, 112, C['4'], FONT_B);
  run.party.forEach((m, i) => {
    const y = 138 + i * 112;
    panel(ctx, px, y, 304, 102, m.dead ? C['0'] : C['1'], m.dead ? C['2'] : C['3']);
    if (!m.dead) drawSprite(ctx, heroSpriteIds(m.race, m.cls), px + 8, y + 18, 4, {});
    text(ctx, `${m.name}${m.dead ? ` — ${t('run.dead')}` : ''}`, px + 84, y + 8, m.dead ? C['3'] : C['5'], FONT_B);
    text(ctx, fit(ctx, `${game.data.CLASSES[m.cls]?.name || m.cls} · ${game.data.RACES[m.race]?.name || m.race}`, 214, FONT), px + 84, y + 30, C['3'], FONT);
    if (m.dead) return;
    const st = statsOf(run, m);
    bar(ctx, px + 84, y + 56, 150, 10, st.hp, st.maxHp, 'hp');
    text(ctx, `${st.hp}/${st.maxHp}`, px + 240, y + 52, C['5'], FONT);
    if (st.maxMrl) { bar(ctx, px + 84, y + 76, 150, 10, st.mrl, st.maxMrl, 'mrl'); text(ctx, `${st.mrl}/${st.maxMrl}`, px + 240, y + 72, C['5'], FONT); }
  });
  // legend of node glyphs (QA v48 #6): below the party
  const types = Object.keys(GLYPH);
  const ly = Math.max(138 + run.party.length * 112, H - 140);
  text(ctx, t('run.legend'), px, ly, C['4'], FONT_B);
  types.forEach((k, i) => {
    const lx = px + (i % 3) * 102, lyy = ly + 22 + Math.floor(i / 3) * 20;
    text(ctx, GLYPH[k], lx, lyy, C[COLOR[k] || '5'], FONT_B);
    text(ctx, fit(ctx, NODE_TYPES[k]?.name || k, 82, '13px monospace'), lx + 18, lyy + 2, C['4'], '13px monospace');
  });
  for (const b of S.buttons) button(ctx, b, S.hover === b);
}
