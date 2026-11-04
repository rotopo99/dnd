// Cyberspace episode (world.md §6): the hero's soul must pass 2 of 3 nodes (battle or check, DC 13 + Judge marks).
// Party help (hero died but the battle was won) or 'cyberspace-adv' — checks with advantage and a spirit ally in battles;
// an 'ours' terminal at the current location — the first node counts as passed.
// Success: back to the nearest 'ours' terminal with 50% ЗДР/МРЛ. Failure: a Judge mark; the 3rd mark ends the game.
import { t } from '../data/text/index.js';
import { TALENTS } from '../data/talents.js';
import { drawSprite, heroSpriteIds, idleFrame } from '../assets/sprites.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, FONT_XL, LINE, text, textBlock, panel, button, hitButton, clear } from '../ui/draw.js';
import { openCheck } from '../ui/checks-ui.js';
import { createBattleScene } from './battle.js';
import { makeWorldMap } from '../world/arena.js';
import { buildHero, buildCompanion, hasFlagInParty, journal, visit, routesFrom, otherEnd, learnTalent, talentOk } from '../world/state.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { LOCATIONS, DEFAULT_RESPAWN, encounterEnemies } from '../world/data.js';
import { saveGame, deleteSave } from '../save.js';

const CS = WORLD_RULES.cyberspace;
const SKILLS = CS.skills;
export const MAX_MARKS = CS.maxMarks;

/** Nearest location with an 'ours' terminal (BFS over routes), default — Harmony Reactor. */
export function nearestOursTerminal(save) {
  const ours = new Set(Object.values(LOCATIONS).filter((l) => l.terminal && save.terminals[l.terminal.id] === 'ours').map((l) => l.id));
  const seen = new Set([save.location]);
  const q = [save.location];
  while (q.length) {
    const id = q.shift();
    if (ours.has(id)) return id;
    for (const r of routesFrom(id)) { const o = otherEnd(r, id); if (!seen.has(o)) { seen.add(o); q.push(o); } }
  }
  return DEFAULT_RESPAWN;
}

export function startCyberspace(game, { reason, helped }) {
  const save = game.save;
  const loc = LOCATIONS[save.location];
  const termHere = loc?.terminal && save.terminals[loc.terminal.id] === 'ours';
  save.cyberspace = { reason, helped: !!helped, terminal: !!termHere, nodes: [termHere ? 'pass' : null, null, null], returnTo: nearestOursTerminal(save) };
  saveGame(save);
  journal(save, t('cyber.enter'));
  game.setScene(createCyberspaceScene());
}

export function createCyberspaceScene() {
  let time = 0;
  let buttons = [];
  let hover = null;
  let self = null;

  const st = (game) => game.save.cyberspace;
  const passed = (c) => c.nodes.filter((n) => n === 'pass').length;
  const failed = (c) => c.nodes.filter((n) => n === 'fail').length;
  const current = (c) => c.nodes.findIndex((n) => n === null);
  const adv = (game) => (st(game).helped || hasFlagInParty(game.save, game.data, 'cyberspace-adv') ? t('cyber.helpAdv') : null);
  const dc = (game) => CS.baseDc + (game.save.hero.judgeMarks || 0);

  function spiritMember(game) {
    return { key: 'hero', isHero: true, name: game.save.hero.name, unit: spiritUnit(game), items: game.save.hero.items };
  }

  function spiritUnit(game) {
    let u;
    try { u = buildHero(game.save, game.data, { race: 'cyber-spirit' }); } catch { u = buildHero(game.save, game.data); }
    u.hp = Math.max(1, Math.ceil(u.maxHp / 2));
    return u;
  }

  function layout(game) {
    const c = st(game);
    const W = game.width, H = game.height;
    const i = current(c);
    buttons = [];
    if (i < 0 || passed(c) >= 2 || failed(c) >= 2) {
      buttons.push({ id: 'finish', label: t('battle.continue'), x: W / 2 - 120, y: H - 120, w: 240, h: 48 });
      return;
    }
    buttons.push({ id: 'fight', label: t('cyber.fight'), sub: t('cyber.fightSub'), x: W / 2 - 250, y: H - 130, w: 240, h: 56 });
    buttons.push({ id: 'check', label: t('cyber.check'), sub: `${t('battle.dc')} ${dc(game)}`, x: W / 2 + 10, y: H - 130, w: 240, h: 56 });
  }

  function resolve(game, ok) {
    const c = st(game);
    c.nodes[current(c)] = ok ? 'pass' : 'fail';
    play(ok ? 'buff' : 'debuff');
    saveGame(game.save);
    layout(game);
  }

  function act(game, id) {
    const c = st(game);
    if (id === 'finish') return finish(game);
    if (id === 'check') {
      game.openModal({
        title: t('cyber.check'), lines: [{ text: t('cyber.checkPick'), color: 'a' }],
        options: SKILLS.map((sk) => ({ label: t(`cyber.skill.${sk}`), run: (g) => openCheck(g, {
          title: t('cyber.title'), skill: sk, dc: dc(g), members: [spiritMember(g)], extraAdv: adv(g),
          onDone: (g2, ok) => { g2.resume(self); resolve(g2, ok); },
        }) })),
      });
      return;
    }
    // battle with skrilets / scriptlets
    const enemies = encounterEnemies('w-cyberspace', 1 + (game.save.hero.judgeMarks || 0));
    const n = enemies.length;
    const scene = createBattleScene({
      heroes: (g) => [spiritUnit(g)], allies: c.helped ? ['spirit'] : [], enemies,
      map: (seed) => makeWorldMap({ seed, enemies: n, id: 'cyberspace' }), title: t('cyber.title'), race: game.save.hero.race,
      onWin: (g) => { g.resume(self); resolve(g, true); },
      onLose: (g) => { g.resume(self); resolve(g, false); },
      onExit: (g) => { g.resume(self); resolve(g, false); },
    });
    game.setScene(scene);
  }

  function finish(game) {
    const save = game.save;
    const c = st(game);
    const ok = passed(c) >= CS.needed;
    const lines = [];
    if (!ok) {
      save.hero.judgeMarks = (save.hero.judgeMarks || 0) + 1;
      lines.push({ text: t('cyber.mark').replace('{n}', save.hero.judgeMarks), color: 'n' });
      if (save.hero.judgeMarks >= MAX_MARKS) {
        // the end: the save is deleted; the modal is shown over the menu (this scene must not render without a save)
        deleteSave();
        game.save = null;
        import('./menu.js').then((m) => {
          game.setScene(m.menuScene);
          game.openModal({ title: t('cyber.absorbedTitle'), titleColor: 'n', border: 'n', onCancel: false, lines: [{ text: t('cyber.absorbed') }],
            options: [{ label: t('menu.back'), run: (g) => g.setScene(m.menuScene) }] });
        });
        return;
      }
    } else lines.push({ text: t('cyber.escaped'), color: 'j' });
    if (c.reason === 'wipe') {
      const lost = Math.floor(save.hero.credits * CS.robFrac);
      save.hero.credits -= lost;
      if (lost) lines.push({ text: t('cyber.robbed').replace('{n}', lost), color: 'c' });
    }
    // unique talent: d20 1–5, once per game
    const roll = 1 + Math.floor(Math.random() * 20);
    if (roll <= CS.uniqueMax && !save.hero.uniqueTalent) {
      const pool = Object.values(TALENTS).filter((x) => x.slot === 'unique' && !save.hero.talents.includes(x.id) && talentOk(save, x.id, game.data));
      if (pool.length) {
        const tl = pool[Math.floor(Math.random() * pool.length)];
        learnTalent(save, tl.id, game.data);
        save.hero.uniqueTalent = true;
        lines.push({ text: `${t('cyber.unique')} (d20 = ${roll}): ${tl.name}`, color: 'a' });
      }
    }
    // back with 50% ЗДР/МРЛ
    const half = (entry, u) => { entry.hp = Math.max(1, Math.ceil(u.maxHp * CS.returnFrac)); entry.mrl = Math.max(1, Math.ceil(u.maxMrl * CS.returnFrac)); };
    save.hero.hp = null; save.hero.mrl = null;
    half(save.hero, buildHero(save, game.data));
    // after a wipe the living companions come back with 50% too; the dead stay in Cyberspace (revive on an 'ours' terminal)
    if (c.reason === 'wipe') for (const p of save.party) if (p.state === 'active' && p.hp !== 0) { p.hp = null; p.mrl = null; const u = buildCompanion(save, p, game.data); if (u) half(p, u); }
    const to = c.returnTo;
    save.cyberspace = null;
    visit(save, to);
    journal(save, ok ? t('cyber.escaped') : t('cyber.failed'));
    saveGame(save);
    game.openModal({
      title: ok ? t('cyber.escapedTitle') : t('cyber.failedTitle'), titleColor: ok ? 'j' : 'n', border: ok ? 'j' : 'n', onCancel: false, lines,
      options: [{ label: t('battle.continue'), run: (g) => import('./location.js').then((m) => g.setScene(m.createLocationScene(to))) }],
    });
  }

  self = {
    id: 'cyberspace',
    get S() { return { buttons }; },
    enter(game) { time = 0; layout(game); },
    resume(game) { layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      time += dt;
      if (!game.save?.cyberspace) return;
      const m = game.input.mouse;
      hover = hitButton(buttons, m);
      if (m.clicked && hover) { play('uiClick'); act(game, hover.id); }
      else if (game.input.wasPressed('Enter') && buttons.length === 1) act(game, buttons[0].id);
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      if (!game.save?.cyberspace) { clear(ctx, W, H); return; }
      const c = st(game);
      clear(ctx, W, H);
      // scanlines: cyberspace look (dark teal / cyan / cult purple)
      ctx.fillStyle = C.i;
      for (let y = (Math.floor(time * 20) % 6); y < H; y += 6) ctx.fillRect(0, y, W, 1);
      if (!c) return;
      text(ctx, t('cyber.title'), W / 2, 40, C.h, FONT_XL, 'center');
      text(ctx, `${t('cyber.progress')}: ${passed(c)}/${CS.needed} · ${t('cyber.marks')}: ${game.save.hero.judgeMarks || 0}/${MAX_MARKS}`, W / 2, 104, C.n, FONT_B, 'center');
      const cw = 280, gap = 40;
      const x0 = Math.floor((W - 3 * cw - 2 * gap) / 2);
      const cur = current(c);
      c.nodes.forEach((n, i) => {
        const x = x0 + i * (cw + gap), y = 160;
        const col = n === 'pass' ? C.j : n === 'fail' ? C.c : i === cur ? C.h : C['3'];
        panel(ctx, x, y, cw, 200, C['0'], col);
        text(ctx, `${t('cyber.node')} ${i + 1}`, x + cw / 2, y + 16, col, FONT_L, 'center');
        text(ctx, n === 'pass' ? t('cyber.passed') : n === 'fail' ? t('cyber.nodeFailed') : i === cur ? t('cyber.here') : '…', x + cw / 2, y + 160, col, FONT_B, 'center');
        if (i === cur) drawSprite(ctx, heroSpriteIds(game.save.hero.race, game.save.hero.cls), x + cw / 2 - 48, y + 50, 6, { frame: idleFrame(time * 1000), alpha: 0.7, tint: 'h' });
      });
      let y = 390;
      if (c.helped) y = textBlock(ctx, t('cyber.helped'), W / 2 - 400, y, 800, C.j, FONT, LINE, 2);
      if (c.terminal) y = textBlock(ctx, t('cyber.terminalHelp'), W / 2 - 400, y, 800, C.h, FONT, LINE, 2);
      void y;
      for (const b of buttons) button(ctx, b, hover === b);
    },
  };
  return self;
}
