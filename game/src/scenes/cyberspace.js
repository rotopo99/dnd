// Cyberspace v2 (docs/specs/cyberspace-v2.md; v1 — world.md §6). One scene, three modes (save.cyberspace.mode):
//   escape — death: 3 nodes from zones by level (battle / check / hack), 2 of 3; failure — a Judge mark (3rd ends the game,
//            2nd takes the body: spirit). Party help → advantage + spirit ally; an 'ours' terminal here — node 1 passed.
//   dive / free — a sortie (terminal 'ours' / Нейропорт / spirit): the zone hub — zones list, nodes, events, zone NPCs,
//            quest goals of cs-* places, the Relay (real-world hacks), up to CS_RULES.dive.maxNodes nodes; a failed node ejects.
// Logic — world/cyber.js, hack board — scenes/hack.js, spirit — world/spirit.js.
import { t } from '../data/text/index.js';
import { TALENTS } from '../data/talents.js';
import { NPCS } from '../data/npcs.js';
import { CS_ZONES, CS_EVENTS, CS_RULES, CS_ITEMS, HACK_EFFECTS } from '../data/world/cyberspace.js';
import { play } from '../audio/sfx.js';
import { C, FONT, FONT_B, FONT_L, FONT_XL, LINE, text, textBlock, panel, button, hitButton, clear, bar, fit } from '../ui/draw.js';
import { drawHeroAvatar } from '../ui/hero-avatar.js';
import { drawStatusIcon } from '../assets/status-icons.js';
import { hotspot } from '../ui/tooltip.js';
import { openCheck } from '../ui/checks-ui.js';
import { createBattleScene } from './battle.js';
import { openHack } from './hack.js';
import { makeWorldMap } from '../world/arena.js';
import { buildHero, buildCompanion, hasFlagInParty, journal, visit, routesFrom, otherEnd, learnTalent, talentOk, grant, tf } from '../world/state.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { LOCATIONS, DEFAULT_RESPAWN, ENCOUNTERS } from '../world/data.js';
import { saveGame, deleteSave } from '../save.js';
import {
  csState, zoneStatus, zoneNodes, nodeEnemies, passNode, startDive, endDive, nodesLeft, escapeNodes, normalizeEpisode,
  eventDone, optionOk, eventFx, hackWindows, hackBoardTier, applyHackEffect, cyberAdv, zoneCleared,
} from '../world/cyber.js';
import { isSpirit, spiritTrigger, becomeSpirit } from '../world/spirit.js';
import { onArrive, onTalk, onBattleWon, slotsAt, completeSlot, failSlot, chooseOption, availableOptions, goalDc, autoProgress } from '../world/quests.js';
import { questsOffered } from '../world/quests.js';

const CS = WORLD_RULES.cyberspace;
export const MAX_MARKS = CS.maxMarks;
const ZONE_IDS = Object.keys(CS_ZONES);

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

const toNode = (game, to) => import('./roam.js').then((m) => game.setScene(m.createNodeScene(to)));

/** Death / wipe → the escape episode (or, if the body is destroyed, straight to the spirit state). */
export function startCyberspace(game, { reason, helped }) {
  const save = game.save;
  const loc = LOCATIONS[save.location];
  const returnTo = nearestOursTerminal(save);
  const trig = spiritTrigger(save, { reason });
  if (trig) { spiritEnding(game, trig, returnTo); return; }
  const termHere = loc?.terminal && save.terminals[loc.terminal.id] === 'ours';
  const nodes = escapeNodes(save);
  if (termHere) nodes[0].res = 'pass';
  save.cyberspace = { mode: 'escape', entry: 'death', reason, helped: !!helped, terminal: !!termHere, nodes, returnTo };
  saveGame(save);
  journal(save, t('cyber.enter'));
  game.setScene(createCyberspaceScene());
}

/** The body is gone: the hero wakes as a spirit at the nearest 'ours' terminal. */
function spiritEnding(game, trigger, to) {
  const save = game.save;
  const toasts = becomeSpirit(save, trigger);
  save.cyberspace = null;
  visit(save, to);
  saveGame(save);
  game.openModal({ title: t('spirit.title'), titleColor: 'h', border: 'h', onCancel: false, lines: [{ text: t('spirit.text') }, ...toasts.map((x) => ({ text: x.text, color: x.color }))],
    options: [{ label: t('battle.continue'), run: (g) => toNode(g, to) }] });
}

/** Voluntary entry from a node (location action): 'dive' | 'implant' | 'spirit'. */
export function enterNet(game, entry) {
  const toasts = startDive(game.save, entry);
  saveGame(game.save);
  game.setScene(createCyberspaceScene());
  for (const x of toasts) game.toast(x.text, x.color);
}

export function createCyberspaceScene() {
  let time = 0;
  let buttons = [];
  let hover = null;
  let self = null;
  let zone = null; // selected zone (dive)
  let last = null; // game (for the S getter of playtests)

  const st = (game) => normalizeEpisode(game.save.cyberspace);
  const toastAll = (g, list) => { for (const x of list || []) g.toast(x.text, x.color); };
  const passed = (c) => c.nodes.filter((n) => n.res === 'pass').length;
  const failed = (c) => c.nodes.filter((n) => n.res === 'fail').length;
  const current = (c) => c.nodes.findIndex((n) => !n.res);
  const marks = (game) => game.save.hero.judgeMarks || 0;
  const adv = (game) => {
    const c = st(game);
    if (c.helped) return t('cyber.helpAdv');
    if (hasFlagInParty(game.save, game.data, 'cyberspace-adv')) return t('flag.cyberspace-adv');
    if (cyberAdv(game.save)) return t('spirit.title');
    return null;
  };
  const hackAdv = (game) => adv(game) || (['terminal-touch', 'judge-code'].find((f) => hasFlagInParty(game.save, game.data, f)) ? t('hack.title') : null);

  function spiritUnit(game) {
    let u;
    try { u = buildHero(game.save, game.data, { race: 'cyber-spirit' }); } catch { u = buildHero(game.save, game.data); }
    if (st(game).mode === 'escape') u.hp = Math.max(1, Math.ceil(u.maxHp / 2));
    return u;
  }
  const spiritMember = (game) => ({ key: 'hero', isHero: true, name: game.save.hero.name, unit: spiritUnit(game), items: game.save.hero.items });

  // ---------------------------------------------------------------- shared runners
  function runBattle(game, enemies, title, onWin, onLose) {
    const c = st(game);
    const allies = [...(c.helped ? ['spirit'] : []), ...(game.save.flags['cs-victor-ally'] ? ['spirit-victor'] : []), ...(c.allies || [])];
    const n = enemies.length;
    game.setScene(createBattleScene({
      heroes: (g) => [spiritUnit(g)], allies: [...new Set(allies)], enemies,
      map: (seed) => makeWorldMap({ seed, enemies: n, enemyIds: enemies, biome: 'cyberspace', id: 'cyberspace' }), title: title || t('cyber.title'), race: game.save.hero.race,
      onWin: (g) => { g.resume(self); onWin(g); },
      onLose: (g) => { g.resume(self); onLose(g); },
      onExit: (g) => { g.resume(self); onLose(g); },
    }));
  }
  function runCheck(game, skills, dc, title, onDone) {
    openCheck(game, { title: title || t('cyber.title'), skills, dc, members: [spiritMember(game)], extraAdv: adv(game), onDone: (g, ok) => { g.resume(self); onDone(g, ok); } });
  }
  function runHack(game, tier, title, onDone, dc = null) {
    const sv = game.save;
    const c = st(game);
    openHack(game, { tier, title, member: spiritMember(game), adv: hackAdv(game), dc,
      turnsBonus: sv.hero.items?.['cs-deck'] > 0 ? 1 : 0,
      trapsVisible: hasFlagInParty(sv, game.data, 'terminal-touch'), back: self,
      onDone: (g, r) => {
        if (r.loot.length) toastAll(g, grant(sv, { items: r.loot.map((id) => ({ item: id, n: 1 })) }, g.data));
        if (r.battle) {
          g.toast(t('cyb.guards'), 'n');
          const z = zone || c.nodes?.[current(c)]?.zone || 'cs-gate';
          const bn = CS_ZONES[z].nodes.find((x) => x.kind === 'battle') || CS_ZONES['cs-gate'].nodes[0];
          runBattle(g, nodeEnemies(sv, z, bn.enemies), t('cyb.guards'), (g2) => onDone(g2, true), (g2) => onDone(g2, false)); // fought through the guards
          return;
        }
        onDone(g, r.ok);
      } });
  }

  // ---------------------------------------------------------------- escape
  function escapeAct(game) {
    const c = st(game);
    const i = current(c);
    const node = c.nodes[i];
    const def = CS_ZONES[node.zone].nodes[node.i] || { kind: node.kind };
    const resolve = (g, ok) => { c.nodes[i].res = ok ? 'pass' : 'fail'; play(ok ? 'buff' : 'debuff'); saveGame(g.save); layout(g); };
    const title = `${t('cyber.title')}: ${CS_ZONES[node.zone].name}`;
    if (node.kind === 'battle') runBattle(game, nodeEnemies(game.save, node.zone, def.enemies), title, (g) => resolve(g, true), (g) => resolve(g, false));
    else if (node.kind === 'hack') runHack(game, def.tier || 1, title, resolve);
    else runCheck(game, def.skills || CS.skills, Math.max(def.dc || CS.baseDc, CS.baseDc) + marks(game), title, resolve);
  }

  function finishEscape(game) {
    const save = game.save;
    const c = st(game);
    const ok = passed(c) >= CS.needed;
    const lines = [];
    if (!ok) {
      save.hero.judgeMarks = marks(game) + 1;
      lines.push({ text: t('cyber.mark').replace('{n}', save.hero.judgeMarks), color: 'n' });
      if (save.hero.judgeMarks >= MAX_MARKS) {
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
    const half = (entry, u) => { entry.hp = Math.max(1, Math.ceil(u.maxHp * CS.returnFrac)); entry.mrl = Math.max(1, Math.ceil(u.maxMrl * CS.returnFrac)); };
    if (c.reason === 'wipe') for (const p of save.party) if (p.state === 'active' && p.hp !== 0) { p.hp = null; p.mrl = null; const u = buildCompanion(save, p, game.data); if (u) half(p, u); }
    const to = c.returnTo;
    // cyberspace-v2.md §7: the 2nd mark — the Judge keeps the body, the hero comes back as a spirit
    if (!ok && spiritTrigger(save, { marksReached: save.hero.judgeMarks })) lines.push(...becomeSpirit(save, 'mark2').map((x) => ({ text: x.text, color: x.color })));
    save.hero.hp = null; save.hero.mrl = null;
    half(save.hero, buildHero(save, game.data));
    save.cyberspace = null;
    visit(save, to);
    journal(save, ok ? t('cyber.escaped') : t('cyber.failed'));
    saveGame(save);
    game.openModal({
      title: ok ? t('cyber.escapedTitle') : t('cyber.failedTitle'), titleColor: ok ? 'j' : 'n', border: ok ? 'j' : 'n', onCancel: false, lines,
      options: [{ label: t('battle.continue'), run: (g) => toNode(g, to) }],
    });
  }

  // ---------------------------------------------------------------- dive: nodes, events, NPCs, quests, relay
  function surface(game, ejected) {
    const save = game.save;
    const to = st(game).returnTo || save.location;
    const toasts = endDive(save, game.data, { ejected });
    saveGame(save);
    game.openModal({ title: ejected ? t('cyb.ejected') : t('cyb.surfaced'), border: ejected ? 'n' : 'h', onCancel: false,
      lines: toasts.map((x) => ({ text: x.text, color: x.color })), options: [{ label: t('battle.continue'), run: (g) => toNode(g, to) }] });
  }

  /** After trace grows: at the cap — zone guards; at 10 — the Eye of the Judge. Lose → eject. */
  function traceCheck(game, then) {
    const c = st(game);
    if ((c.trace || 0) < CS_RULES.traceCap) return then(game);
    const eye = c.trace >= 10;
    const z = zone || 'cs-gate';
    const bn = CS_ZONES[z].nodes.find((x) => x.kind === 'battle') || CS_ZONES['cs-gate'].nodes[0];
    const enemies = eye ? nodeEnemies(game.save, 'cs-throne', [{ new: 'cs-judge-eye', n: 1 }]) : nodeEnemies(game.save, z, bn.enemies);
    game.toast(eye ? t('cyb.eye') : t('cyb.guards'), 'n');
    c.trace = 0;
    runBattle(game, enemies, eye ? t('cyb.eye') : t('cyb.guards'), (g) => then(g), (g) => surface(g, true));
  }

  function nodeDone(game, zid, i, ok) {
    const c = st(game);
    c.nodesDone = (c.nodesDone || 0) + 1;
    if (!ok) { play('debuff'); surface(game, true); return; }
    play('buff');
    toastAll(game, passNode(game.save, zid, i, game.data));
    saveGame(game.save);
    traceCheck(game, (g) => layout(g));
  }

  function nodeAct(game, zid, n) {
    const title = `${CS_ZONES[zid].name}: ${t(`cyb.kind.${n.kind}`)}`;
    if (n.kind === 'battle') runBattle(game, nodeEnemies(game.save, zid, n.enemies), title, (g) => nodeDone(g, zid, n.i, true), (g) => nodeDone(g, zid, n.i, false));
    else if (n.kind === 'check') runCheck(game, n.skills, n.dc, title, (g, ok) => nodeDone(g, zid, n.i, ok));
    else if (n.kind === 'hack') runHack(game, n.tier || 1, title, (g, ok) => nodeDone(g, zid, n.i, ok));
    else if (n.kind === 'shop') openBroker(game, () => nodeDone(game, zid, n.i, true));
    else if (n.kind === 'event') openEvent(game, n.id, (g) => nodeDone(g, zid, n.i, true));
  }

  function openBroker(game, done) {
    const sv = game.save;
    const goods = Object.entries(CS_ITEMS).filter(([, it]) => it.price > 0);
    game.openModal({ title: t('cyb.shopTitle'), lines: [{ text: t('cyb.shopIntro') }, { text: `${t('world.credits')}: ${sv.hero.credits}`, color: 'b' }],
      onCancel: (g) => done(g),
      options: [...goods.map(([id, it]) => ({ label: `${it.name} — ${it.price}`, sub: it.desc, disabled: sv.hero.credits < it.price, keep: true,
        run: (g) => { sv.hero.credits -= it.price; toastAll(g, grant(sv, { items: [{ item: id, n: 1 }] }, g.data)); play('buff'); } })),
      { label: t('loc.close'), run: (g) => done(g) }] });
  }

  function openEvent(game, evId, after) {
    const sv = game.save;
    const ev = CS_EVENTS[evId];
    const finish = (g, res) => {
      toastAll(g, res.toasts);
      csState(sv).events[evId] = true;
      saveGame(sv);
      const next = (g2) => { if (res.hackMenu) openRelay(g2); after?.(g2); layout(g2); };
      if (res.battle) { const z = ev.zone; runBattle(g, nodeEnemies(sv, z, [res.battle]), ev.text.slice(0, 30), (g2) => traceCheck(g2, next), (g2) => surface(g2, true)); return; }
      traceCheck(g, next);
    };
    game.openModal({ title: CS_ZONES[ev.zone].name, lines: [{ text: ev.text }], width: 900,
      options: ev.options.map((o) => {
        const okk = optionOk(sv, o);
        const sub = o.check ? `${o.check.skills.map((s) => t(`skill.${s}`)).join(' / ')} · ${t('battle.dc')} ${o.check.dc}` : null;
        return { label: o.label, sub: okk.ok ? sub : okk.why, disabled: !okk.ok,
          run: (g) => (o.check ? runCheck(g, o.check.skills, o.check.dc, o.label, (g2, ok) => finish(g2, eventFx(sv, ok ? o.win : o.lose, g2.data)))
            : finish(g, eventFx(sv, o.fx, g.data))) };
      }) });
  }

  function openRelay(game) {
    const sv = game.save;
    const opts = [];
    const lines = [{ text: t('cyb.relayIntro') }];
    for (const w of hackWindows(sv)) {
      if (w.state === 'ours') for (const hk of w.hacks) {
        const E = HACK_EFFECTS[hk.eff];
        opts.push({ label: `${E.name}: ${hk.targetName}`, sub: hk.why || `${w.name} · ${t('battle.dc')} ${E.dc} · ${tf('cyb.tier', { n: hackBoardTier(sv, hk.eff) })}`, disabled: !hk.ok,
          tip: { title: E.name, lines: [E.desc] },
          run: (g) => runHack(g, hackBoardTier(sv, hk.eff), `${E.name}: ${hk.targetName}`, (g2, ok) => { if (ok) toastAll(g2, applyHackEffect(sv, hk.eff, hk.target)); saveGame(sv); layout(g2); }, E.dc) });
      } else if (w.state === 'ritual') {
        const bn = CS_ZONES['cs-relay'].nodes[0];
        opts.push({ label: `${w.name}: ${t('cyb.win.ritual')}`, run: (g) => runBattle(g, nodeEnemies(sv, 'cs-relay', bn.enemies), w.name, (g2) => layout(g2), (g2) => surface(g2, true)) });
      } else lines.push({ text: `${w.name}: ${t(w.state === 'dead' ? 'cyb.win.dead' : 'cyb.win.other')}`, color: '3' });
    }
    opts.push({ label: t('loc.close'), run: (g) => layout(g) });
    game.openModal({ title: t('cyb.relayTitle'), lines, width: 960, options: opts });
  }

  function talkTo(game, npcId) {
    const sv = game.save;
    const n = NPCS[npcId];
    const toasts = onTalk(sv, npcId, game.data);
    const offer = questsOffered(sv, npcId);
    saveGame(sv);
    game.openModal({ title: n?.name || npcId, lines: [{ text: `«${n?.bark || '…'}»` }, ...toasts.map((x) => ({ text: x.text, color: x.color }))],
      options: [{ label: t('loc.close'), run: (g) => layout(g) }] });
    void offer;
  }

  function slotButton(game, s) {
    const sv = game.save;
    const goal = s.goal;
    const done = (g, list) => { toastAll(g, list); toastAll(g, autoProgress(sv, g.data)); saveGame(sv); layout(g); };
    const name = s.qid ? (s.stage?.text || '') : '';
    if (s.locked) return null;
    if (s.kind === 'choice') return { label: `${t('loc.decide')}: ${s.stage.text}`, run: (g) => g.openModal({ title: name, lines: [{ text: s.stage.text }],
      options: [...availableOptions(sv, s).map((o) => ({ label: o.text, run: (g2) => done(g2, chooseOption(sv, s, o.id, g2.data)) })), { label: t('loc.questLater'), run: () => {} }] }) };
    if (goal.kind === 'battle') return { label: `${t('loc.fight')}: ${ENCOUNTERS[goal.encounter]?.name || goal.encounter}`,
      run: (g) => runBattle(g, ENCOUNTERS[goal.encounter]?.enemies || ['scriptlet'], ENCOUNTERS[goal.encounter]?.name, (g2) => done(g2, onBattleWon(sv, goal.encounter, zone, g2.data)), (g2) => surface(g2, true)) };
    if (goal.kind === 'check') return { label: `${t('loc.solve')}: ${s.option?.text || s.stage.text}`,
      run: (g) => runCheck(g, goal.skills, goalDc(sv, goal), s.stage.text, (g2, ok) => done(g2, ok ? completeSlot(sv, s, g2.data) : failSlot(sv, s, g2.data))) };
    if (goal.kind === 'pay') return { label: `${t('loc.pay')} ${goal.credits}`, disabled: sv.hero.credits < goal.credits, run: (g) => { sv.hero.credits -= goal.credits; done(g, completeSlot(sv, s, g.data)); } };
    return null;
  }

  function selectZone(game, zid) {
    zone = zid;
    const sv = game.save;
    if (zoneStatus(sv, zid, st(game).entry).ok) { toastAll(game, onArrive(sv, zid, game.data)); saveGame(sv); }
    layout(game);
  }

  // ---------------------------------------------------------------- layout
  const enemyLine = (game, zid, list) => list.map((e) => `${game.data.ENEMIES[nodeEnemies(game.save, zid, [e])[0]]?.name || e.new || e.ref} ×${e.n}`).join(', ');
  function layout(game) {
    const c = st(game);
    if (!c) return;
    const W = game.width, H = game.height;
    buttons = [];
    if (c.mode === 'escape') {
      const i = current(c);
      if (i < 0 || passed(c) >= CS.needed || failed(c) >= 2) { buttons.push({ id: 'finish', label: t('battle.continue'), x: W / 2 - 120, y: H - 120, w: 240, h: 48 }); return; }
      const n = c.nodes[i];
      buttons.push({ id: 'node', label: tf('cyb.zoneNode', { zone: CS_ZONES[n.zone].name, kind: t(`cyb.kind.${n.kind}`) }),
        sub: n.kind === 'check' ? `${t('battle.dc')} ${Math.max(CS_ZONES[n.zone].nodes[n.i]?.dc || CS.baseDc, CS.baseDc) + marks(game)}` : n.kind === 'battle' ? t('cyber.fightSub') : tf('cyb.tier', { n: CS_ZONES[n.zone].nodes[n.i]?.tier || 1 }),
        x: W / 2 - 200, y: H - 130, w: 400, h: 56 });
      return;
    }
    const sv = game.save;
    if (!zone || !CS_ZONES[zone]) zone = ZONE_IDS.find((z) => zoneStatus(sv, z, c.entry).ok) || 'cs-gate';
    ZONE_IDS.forEach((zid, k) => {
      const z = CS_ZONES[zid];
      const s = zoneStatus(sv, zid, c.entry);
      const nodes = zoneNodes(sv, zid);
      const sub = zoneCleared(sv, zid) ? `✓ ${t('cyb.cleared')}` : s.ok ? `${tf('cyb.tier', { n: z.tier })} · ${nodes.filter((x) => x.done).length}/${nodes.length}` : `🔒 ${s.why}`;
      buttons.push({ id: `zone:${zid}`, label: z.name, sub, x: 24, y: 104 + k * 62, w: 300, h: 56, selected: zid === zone, subColor: s.ok ? null : C['3'] });
    });
    buttons.push({ id: 'surface', label: t('cyb.surface'), x: 24, y: H - 72, w: 300, h: 48 });
    // zone actions
    const z = CS_ZONES[zone];
    const s = zoneStatus(sv, zone, c.entry);
    const acts = [];
    if (s.ok) {
      const left = nodesLeft(c);
      for (const n of zoneNodes(sv, zone)) {
        const sub = n.done ? t('cyb.nodeDone') : left <= 0 ? t('cyb.why.budget') : n.kind === 'check' ? `${n.skills.map((x) => t(`skill.${x}`)).join(' / ')} · ${t('battle.dc')} ${n.dc}`
          : n.kind === 'battle' ? enemyLine(game, zone, n.enemies) : n.kind === 'hack' ? tf('cyb.tier', { n: n.tier }) : '';
        acts.push({ id: `node:${n.i}`, label: `${n.done ? '✓ ' : ''}${t(`cyb.kind.${n.kind}`)}`, sub, disabled: n.done || left <= 0 });
      }
      for (const evId of z.events) if (!eventDone(sv, evId) && !z.nodes.some((n) => n.kind === 'event' && n.id === evId)) acts.push({ id: `event:${evId}`, label: t('cyb.kind.event'), sub: CS_EVENTS[evId].text, tip: { title: t('cyb.kind.event'), lines: [CS_EVENTS[evId].text] } });
      const npcs = new Set([...(z.npc && NPCS[z.npc] ? [z.npc] : []), ...Object.values(NPCS).filter((n) => n.location === zone).map((n) => n.id)]);
      for (const id of npcs) acts.push({ id: `talk:${id}`, label: `${t('cyb.talk')}: ${NPCS[id].name}`, sub: NPCS[id].role || '' });
      slotsAt(sv, zone).forEach((sl, k) => { const b = slotButton(game, sl); if (b) acts.push({ id: `slot:${k}`, slot: sl, ...b, sub: b.sub || sl.qid }); });
      if (zone === 'cs-relay' && c.entry !== 'implant') acts.push({ id: 'relay', label: t('cyb.relay'), sub: t('cyb.relaySub') });
      if ((sv.hero.items?.['cs-null-patch'] || 0) > 0 && (c.trace || 0) > 0) acts.push({ id: 'patch', label: t('cyb.patch'), sub: CS_ITEMS['cs-null-patch'].name });
    }
    const ax = 348, aw = Math.floor((W - ax - 24 - 16) / 2);
    acts.forEach((a, k) => buttons.push({ ...a, kind: 'act', x: ax + (k % 2) * (aw + 16), y: 330 + Math.floor(k / 2) * 60, w: aw, h: 52 }));
  }

  function act(game, b) {
    const c = st(game);
    const sv = game.save;
    const id = b.id;
    if (id === 'finish') return finishEscape(game);
    if (id === 'node' && c.mode === 'escape') return escapeAct(game);
    if (id === 'surface') return surface(game, false);
    if (id.startsWith('zone:')) return selectZone(game, id.slice(5));
    if (id.startsWith('node:')) return nodeAct(game, zone, zoneNodes(sv, zone)[+id.slice(5)]);
    if (id.startsWith('event:')) return openEvent(game, id.slice(6), null);
    if (id.startsWith('talk:')) return talkTo(game, id.slice(5));
    if (id.startsWith('slot:')) return b.run?.(game);
    if (id === 'relay') return openRelay(game);
    if (id === 'patch') {
      import('../world/inventory.js').then((m) => { m.dropItem(sv, 'cs-null-patch', 1); c.trace = Math.max(0, (c.trace || 0) - 2); saveGame(sv); layout(game); });
    }
  }

  // ---------------------------------------------------------------- render
  function drawSoul(game, x, y, box) {
    const h = game.save.hero;
    drawHeroAvatar(game.ctx, h, x, y, box, { spirit: true, time });
    if (isSpirit(game.save)) {
      panel(game.ctx, x + box / 2 - 40, y - 14, 80, 24, C.i, C.h);
      text(game.ctx, t('cyb.spiritPlate'), x + box / 2, y - 11, C.h, FONT_B, 'center');
      drawStatusIcon(game.ctx, 'spirit', x + box - 20, y + 4, 16);
      hotspot(x, y, box, box, { title: t('spirit.title'), glyph: { icon: 'spirit' }, lines: [t('spirit.tip')] });
    }
  }

  function renderEscape(game, c) {
    const { ctx, width: W } = game;
    text(ctx, t('cyber.title'), W / 2, 40, C.h, FONT_XL, 'center');
    text(ctx, `${t('cyber.progress')}: ${passed(c)}/${CS.needed} · ${t('cyber.marks')}: ${marks(game)}/${MAX_MARKS}`, W / 2, 104, C.n, FONT_B, 'center');
    const cw = 280, gap = 40;
    const x0 = Math.floor((W - 3 * cw - 2 * gap) / 2);
    const cur = current(c);
    c.nodes.forEach((n, i) => {
      const x = x0 + i * (cw + gap), y = 160;
      const col = n.res === 'pass' ? C.j : n.res === 'fail' ? C.c : i === cur ? C.h : C['3'];
      panel(ctx, x, y, cw, 210, C['0'], col);
      text(ctx, `${t('cyber.node')} ${i + 1}: ${t(`cyb.kind.${n.kind}`)}`, x + cw / 2, y + 12, col, FONT_L, 'center');
      text(ctx, fit(ctx, CS_ZONES[n.zone]?.name || '', cw - 16, FONT_B), x + cw / 2, y + 44, C[CS_ZONES[n.zone]?.color || 'h'], FONT_B, 'center');
      text(ctx, n.res === 'pass' ? t('cyber.passed') : n.res === 'fail' ? t('cyber.nodeFailed') : i === cur ? t('cyber.here') : '…', x + cw / 2, y + 176, col, FONT_B, 'center');
      if (i === cur) drawSoul(game, x + cw / 2 - 48, y + 72, 96);
    });
    let y = 400;
    if (c.helped) y = textBlock(ctx, t('cyber.helped'), W / 2 - 400, y, 800, C.j, FONT, LINE, 2);
    if (c.terminal) y = textBlock(ctx, t('cyber.terminalHelp'), W / 2 - 400, y, 800, C.h, FONT, LINE, 2);
  }

  function renderHub(game, c) {
    const { ctx, width: W } = game;
    const sv = game.save;
    text(ctx, `${t('cyb.hubTitle')} · ${t(`cyb.mode.${c.mode}`)}`, 24, 20, C.h, FONT_XL);
    const hud = `${c.mode === 'free' ? '' : `${tf('cyb.nodesLeft', { n: nodesLeft(c) })} · `}${t('cyber.marks')}: ${marks(game)}/${MAX_MARKS}`;
    text(ctx, hud, W - 24, 24, C.n, FONT_B, 'right');
    text(ctx, `${t('cyb.trace')} ${c.trace || 0}/${CS_RULES.traceCap}`, W - 136, 52, C.n, FONT, 'right');
    bar(ctx, W - 124, 58, 100, 8, Math.min(c.trace || 0, CS_RULES.traceCap), CS_RULES.traceCap, 'mrl');
    const z = CS_ZONES[zone];
    if (!z) return;
    const s = zoneStatus(sv, zone, c.entry);
    const px = 348, pw = W - px - 24;
    panel(ctx, px, 100, pw, 216, C['0'], C[z.color] || C.h);
    text(ctx, z.name, px + 16, 112, C[z.color] || C.h, FONT_L);
    text(ctx, `${tf('cyb.tier', { n: z.tier })} · ${tf('cyb.levels', { a: z.levels[0], b: z.levels[1] })}${zoneCleared(sv, zone) ? ` · ✓ ${t('cyb.cleared')}` : ''}`, px + 16, 146, C['4'], FONT);
    let y = textBlock(ctx, z.desc, px + 16, 172, pw - 200, C['5'], FONT, LINE, 3);
    if (!s.ok) textBlock(ctx, `🔒 ${s.why}`, px + 16, y + 6, pw - 200, C.c, FONT_B, LINE, 2);
    else textBlock(ctx, z.story, px + 16, y + 6, pw - 200, C['4'], FONT, LINE, 3);
    drawSoul(game, px + pw - 164, 128, 148);
  }

  self = {
    id: 'cyberspace',
    get S() { return { buttons, zone, mode: last?.save?.cyberspace?.mode }; },
    enter(game) { time = 0; last = game; layout(game); },
    resume(game) { layout(game); },
    resize(game) { layout(game); },
    update(game, dt) {
      time += dt;
      if (!game.save?.cyberspace) return;
      const m = game.input.mouse;
      hover = hitButton(buttons, m);
      if (m.clicked && hover && !hover.disabled) { play('uiClick'); act(game, hover); }
      else if (game.input.wasPressed('Enter') && buttons.length === 1) act(game, buttons[0]);
    },
    render(game) {
      const { ctx, width: W, height: H } = game;
      clear(ctx, W, H);
      if (!game.save?.cyberspace) return;
      const c = st(game);
      ctx.fillStyle = C.i;
      for (let y = (Math.floor(time * 20) % 6); y < H; y += 6) ctx.fillRect(0, y, W, 1);
      if (c.mode === 'escape') renderEscape(game, c); else renderHub(game, c);
      for (const b of buttons) button(ctx, b, hover === b);
    },
  };
  return self;
}
