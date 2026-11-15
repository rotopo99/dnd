// Roguelike «Забег» — start screen (docs/specs/roguelike.md §1, §6, §7): fast party of 1–4 from TEMPLATES (one click),
// race toggle, seed (random or typed), ascension (≤ meta.ascMax), «Память киберспейса» unlocks, continue the saved run.
import { t } from '../data/text/index.js';
import { RUN, META, RELICS } from '../data/roguelike.js';
import { C, FONT, FONT_B, FONT_L, text, button, hitButton, clear, panel } from '../ui/draw.js';
import { drawSprite, heroSpriteIds, idleFrame } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { newRun, randomSeed, loadRun, clearRun, saveRun } from '../world/run.js';
import { loadMeta, templatesFor, shopUnlocks, buyBlock, buyUnlock, owns, startBonus, consumeSpirit, unlockedRelics } from '../world/meta.js';

export function createRunStartScene(back) {
  const S = { party: [], seed: randomSeed(), asc: 0, typing: false, meta: null, buttons: [], hover: null, time: 0, saved: null };

  function layout(game) {
    const W = game.width;
    const B = [];
    const tpls = templatesFor(S.meta);
    const colW = 250, x0 = 32;
    tpls.forEach((tp, i) => {
      const cls = game.data.CLASSES[tp.cls];
      B.push({ id: 'tpl', tpl: tp, x: x0 + (i % 2) * (colW + 8), y: 110 + Math.floor(i / 2) * 60, w: colW, h: 52,
        label: cls?.name || tp.cls, sub: tp.open ? tp.role : `${t('run.locked')} · ${t('run.cost')} ${META.unlocks.find((u) => u.id === tp.unlock)?.cost ?? '—'}`,
        disabled: !tp.open || S.party.length >= RUN.partyMax });
    });
    const px = x0 + 2 * (colW + 8) + 24;
    S.party.forEach((p, i) => {
      const y = 110 + i * 116;
      B.push({ id: 'race', i, x: px + 96, y: y + 48, w: 150, h: 34, label: `${t('run.race')}: ${game.data.RACES[p.race]?.name || p.race}`, disabled: p.races.length < 2 });
      B.push({ id: 'remove', i, x: px + 254, y: y + 48, w: 90, h: 34, label: t('run.remove') });
    });
    const rx = W - 300;
    B.push({ id: 'seed', x: rx, y: 110, w: 268, h: 44, label: `${t('run.seed')}: ${S.seed}${S.typing && Math.floor(S.time * 2) % 2 ? '_' : ''}`, sub: t('run.seedHint'), selected: S.typing });
    B.push({ id: 'seedRnd', x: rx, y: 160, w: 268, h: 34, label: t('run.seedRandom') });
    B.push({ id: 'ascDown', x: rx, y: 216, w: 44, h: 40, label: '−', disabled: S.asc <= 0 });
    B.push({ id: 'ascUp', x: rx + 224, y: 216, w: 44, h: 40, label: '+', disabled: S.asc >= S.meta.ascMax });
    B.push({ id: 'unlocks', x: rx, y: 300, w: 268, h: 44, label: t('run.unlocks'), key: 'U' });
    if (S.saved) B.push({ id: 'continue', x: rx, y: game.height - 200, w: 268, h: 48, label: t('run.continue'), key: 'C', selected: true });
    B.push({ id: 'start', x: rx, y: game.height - 140, w: 268, h: 52, label: t('run.start'), disabled: !S.party.length, selected: !S.saved && S.party.length > 0 });
    B.push({ id: 'back', x: rx, y: game.height - 76, w: 268, h: 40, label: t('run.back') });
    S.buttons = B;
  }

  function addHero(game, tp) {
    if (S.party.length >= RUN.partyMax) return;
    S.party.push({ tpl: tp.id, races: tp.races, race: tp.races[0], cls: tp.cls });
  }

  function start(game) {
    const meta = S.meta;
    const bonus = startBonus(meta);
    const run = newRun({ seed: S.seed, asc: S.asc, party: S.party.map((p) => ({ tpl: p.tpl, race: p.race })), bonus });
    run.metaUnlocks = unlockedRelics(meta);
    consumeSpirit(meta);
    clearRun();
    saveRun(run);
    openMap(game, run);
  }
  const openMap = (game, run) => import('./run-map.js').then((m) => game.setScene(m.createRunMapScene(run)));

  function openUnlocks(game) {
    game.openModal({
      title: `${t('run.unlocks')} · ${t('run.memory')}: ${S.meta.memory}`, width: 820,
      build: () => ({
        title: `${t('run.unlocks')} · ${t('run.memory')}: ${S.meta.memory}`, width: 820,
        lines: S.meta.spirit ? [{ text: `${t('run.spirit')}: ${S.meta.spirit.name} — ${t('run.spiritHint')}`, color: 'j' }] : [],
        options: [...shopUnlocks().map((u) => {
          const why = buyBlock(S.meta, u.id);
          return { label: unlockLabel(game, u), sub: owns(S.meta, u.id) ? t('run.owned') : `${t('run.cost')} ${u.cost}`, disabled: !!why, keep: true,
            run: () => { if (buyUnlock(S.meta, u.id)) { play('uiClick'); layout(game); } } };
        }), { label: t('run.back'), run: () => layout(game) }],
      }),
    });
  }

  return {
    id: 'run-start',
    S,
    enter(game) { S.meta = loadMeta(); S.asc = Math.min(S.asc, S.meta.ascMax); S.saved = loadRun(); layout(game); },
    resume(game) { S.meta = loadMeta(); layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      S.time += dt;
      const inp = game.input;
      if (S.typing) {
        for (const ch of inp.typed()) if (/[a-z0-9]/i.test(ch) && S.seed.length < 12) S.seed += ch.toUpperCase();
        if (inp.wasPressed('Backspace')) S.seed = S.seed.slice(0, -1);
        if (inp.wasPressed('Enter') || inp.wasPressed('Escape')) { S.typing = false; if (!S.seed) S.seed = randomSeed(); }
      }
      layout(game);
      const m = inp.mouse;
      const h = hitButton(S.buttons, m);
      if (h !== S.hover && h && !h.disabled) play('uiHover');
      S.hover = h;
      let act = m.clicked && h && !h.disabled ? h : null;
      if (!S.typing) {
        if (inp.wasPressed('Escape')) act = { id: 'back' };
        if (inp.wasPressed('KeyU')) act = { id: 'unlocks' };
        if (inp.wasPressed('KeyC') && S.saved) act = { id: 'continue' };
        if (inp.wasPressed('Enter') && S.party.length) act = { id: 'start' };
        for (let i = 1; i <= 4; i++) if (inp.wasPressed(`Digit${i}`)) { const tp = templatesFor(S.meta).filter((x) => x.open)[i - 1]; if (tp) act = { id: 'tpl', tpl: tp }; }
      }
      if (!act) return;
      if (m.clicked && S.typing && act.id !== 'seed') { S.typing = false; if (!S.seed) S.seed = randomSeed(); }
      play('uiClick');
      if (act.id === 'tpl') addHero(game, act.tpl);
      else if (act.id === 'race') { const p = S.party[act.i]; p.race = p.races[(p.races.indexOf(p.race) + 1) % p.races.length]; }
      else if (act.id === 'remove') S.party.splice(act.i, 1);
      else if (act.id === 'seed') S.typing = !S.typing;
      else if (act.id === 'seedRnd') S.seed = randomSeed();
      else if (act.id === 'ascDown') S.asc = Math.max(0, S.asc - 1);
      else if (act.id === 'ascUp') S.asc = Math.min(S.meta.ascMax, S.asc + 1);
      else if (act.id === 'unlocks') openUnlocks(game);
      else if (act.id === 'continue') openMap(game, S.saved);
      else if (act.id === 'start') {
        if (!S.party.length) return;
        if (S.saved) game.openModal({ title: t('run.start'), lines: [t('run.newRunWarn')], options: [{ label: t('run.yes'), run: (g) => start(g) }, { label: t('run.no') }] });
        else start(game);
      } else if (act.id === 'back') { if (back) back(game); else import('./menu.js').then((mm) => game.setScene(mm.menuScene)); }
      layout(game);
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      clear(ctx, W, H);
      text(ctx, t('run.title'), 32, 24, C.h, FONT_L);
      text(ctx, `${t('run.memory')}: ${S.meta.memory}`, 32, 60, C.j, FONT_B);
      text(ctx, t('run.templates'), 32, 88, C['4'], FONT);
      const px = 32 + 2 * 258 + 24;
      text(ctx, `${t('run.party')} ${S.party.length}/${RUN.partyMax}`, px, 88, C['4'], FONT);
      if (!S.party.length) text(ctx, t('run.partyEmpty'), px, 120, C['3'], FONT);
      if (S.party.length === 1) text(ctx, t('run.solo'), px, 110 + 116, C.a, FONT);
      S.party.forEach((p, i) => {
        const y = 110 + i * 116;
        panel(ctx, px, y, 360, 104, C['1'], C['3']);
        drawSprite(ctx, heroSpriteIds(p.race, p.cls), px + 12, y + 16, 4, { frame: idleFrame(S.time * 1000, i * 0.3) });
        text(ctx, `${game.data.CLASSES[p.cls]?.name || p.cls}`, px + 96, y + 12, C['5'], FONT_B);
      });
      const rx = W - 300;
      text(ctx, `${t('run.asc')}: ${S.asc}`, rx + 134, 226, C['5'], FONT_B, 'center');
      for (const b of S.buttons) button(ctx, b, S.hover === b);
    },
  };
}

function unlockLabel(game, u) {
  const D = game.data;
  if (u.kind === 'template') { const cls = u.ref.replace(/^t-/, ''); return `${t('run.unlocks')}: ${D.CLASSES[cls]?.name || cls}`; }
  if (u.kind === 'race') return `${t('run.race')}: ${D.RACES[u.ref]?.name || u.ref}`;
  if (u.kind === 'relicPool') return `${t('run.kind.relic')}: ${RELICS.find((r) => r.id === u.ref)?.name || u.ref}`;
  if (u.kind === 'startKit') {
    const parts = [];
    for (const [id, n] of u.add || []) parts.push(`${D.ITEMS[id]?.name || id} ×${n}`);
    if (u.credits) parts.push(`+${u.credits} ${t('run.credits')}`);
    if (u.extraTalentChoice) parts.push(`+${u.extraTalentChoice} ${t('run.kind.talent')}`);
    return parts.join(', ');
  }
  return u.id;
}
