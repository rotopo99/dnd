// «Сетевая игра» (multiplayer.md §5, stages 1–2): hero choice, Create (host) / Join (guest) with invite codes,
// lobby (players, ready, kick, turn timer), chat, «Тренировочный бой» (co-op battle, net/coop-battle.js).
// Window hooks for Playwright: window.__net (createOffer, acceptOffer, acceptAnswer, …).
import { t } from '../data/text/index.js';
import { NET } from '../data/net.js';
import { C, FONT, FONT_B, FONT_L, text, textBlock, button, hitButton, clear, panel, fit } from '../ui/draw.js';
import { play } from '../audio/sfx.js';
import { createField, copyText, pasteText } from '../ui/dom-field.js';
import { drawChatBox, placeChatInput, hideChatInput } from '../ui/net-chat.js';
import { createSession } from '../net/session.js';
import { canCompress, currentStun, setStun } from '../net/peer.js';
import { localVersion, normalizeHero, MSG } from '../net/protocol.js';
import { trainingSetup, hostStartBattle, startCoopBattle } from '../net/coop-battle.js';
import { menuScene, randomHero } from './menu.js';
import { createCreateScene } from './create.js';
import { latestSlot, loadGame } from '../save.js';
import { createCoopWorld } from '../net/coop-world.js';
import { startWorld } from './prologue.js';
import { startFromSave } from '../ui/save-ui.js';

const N = {
  view: 'root', // root | host | join | lobby
  hero: null,
  offer: '', answer: '', // codes shown to the player
  err: '', note: '',
  working: false,
  version: null, // tests: version override (reject scenario)
  buttons: [], hover: null,
};
let F = null; // DOM fields (created lazily: the scene module also loads in Node-free browser only)

function fields() {
  if (F) return F;
  F = {
    offer: createField({ multiline: true, readonly: true, id: 'net-offer' }),
    answerIn: createField({ multiline: true, placeholder: 'RSL1.…', id: 'net-answer-in' }),
    hostIn: createField({ multiline: true, placeholder: 'RSL1.…', id: 'net-host-in' }),
    answerOut: createField({ multiline: true, readonly: true, id: 'net-answer-out' }),
    stun: createField({ maxLength: 200, placeholder: t('net.stunNone'), id: 'net-stun' }),
  };
  F.stun.el.addEventListener('change', () => setStun(F.stun.value));
  return F;
}
function hideAll() { if (F) for (const f of Object.values(F)) f.hide(); hideChatInput(); }

// ---------------------------------------------------------------- hero
function loadHero() {
  try { const h = JSON.parse(localStorage.getItem(NET.heroKey) || 'null'); if (h?.race) return h; } catch { /* broken */ }
  return null;
}
function setHero(h) {
  N.hero = normalizeHero(h);
  try { localStorage.setItem(NET.heroKey, JSON.stringify(N.hero)); } catch { /* private mode */ }
}
function heroFromSave(game) {
  const slot = latestSlot();
  const s = slot != null ? loadGame(game.data, slot) : null;
  return s?.hero || null;
}
const heroLine = (game, h) => (h ? `${h.name} — ${game.data.RACES[h.race]?.name || h.race} · ${game.data.CLASSES[h.cls]?.name || h.cls}${h.level > 1 ? ` · ${t('net.lvl')} ${h.level}` : ''}` : t('net.heroNone'));

function errText(e) {
  if (!e) return '';
  const code = e.code || 'failed';
  return t(`net.err.${code}`).replace('{mine}', e.info?.mine || '?').replace('{theirs}', e.info?.theirs || '?').replace('{need}', e.info?.need ? t(`net.need.${e.info.need}`) : '');
}

// ---------------------------------------------------------------- session
function newSession(game, role) {
  game.net?.close();
  const s = createSession({ role, name: N.hero.name, hero: N.hero, version: N.version || localVersion() });
  game.net = s;
  N.err = ''; N.offer = ''; N.answer = '';
  s.on('error', (e) => { N.err = errText(e); N.working = false; });
  s.on('status', (st) => {
    if (st === 'connected' && !s.host && N.view === 'join') N.view = 'lobby';
    if (st === 'lost' && !s.host) N.err = t('net.hostLeft');
  });
  s.on('joined', (p) => { s.notice(t('net.joined').replace('{name}', p.name)); if (N.view === 'host') { N.view = 'lobby'; N.offer = ''; } play('uiClick'); });
  s.on('left', (p) => s.notice(t('net.left').replace('{name}', p.name)));
  s.on('chat', () => play('uiHover'));
  s.on('msg', (m) => {
    if (s.host || game.coop) return; // stage 3: the co-op world controller handles everything once the party started
    if (m.t === MSG.battleStart) { hideAll(); startCoopBattle(game, s, m.setup, backToLobby); }
    else if (m.t === MSG.snap) { hideAll(); createCoopWorld(game, s, { openMenu: openCoopMenu }).feed(m); }
  });
  return s;
}
const backToLobby = (g) => { N.view = g.net ? 'lobby' : 'root'; g.setScene(netScene); };

async function hostInvite(game) {
  const s = game.net?.host ? game.net : newSession(game, 'host');
  N.view = 'host'; N.offer = ''; N.err = ''; N.working = true;
  if (F) { F.offer.value = ''; F.answerIn.value = ''; }
  if (!canCompress()) N.note = t('net.noCompress');
  try { N.offer = await s.invite(); if (F) F.offer.value = N.offer; } catch (e) { N.err = errText(e); }
  N.working = false;
  return N.offer;
}
async function hostConnect(game, code) {
  N.err = '';
  try { await game.net.acceptAnswer(code ?? F?.answerIn.value); } catch (e) { N.err = errText(e); }
}
async function guestAccept(game, code) {
  const s = game.net && !game.net.host && game.net.status !== 'rejected' ? game.net : newSession(game, 'guest');
  N.view = 'join'; N.err = ''; N.answer = ''; N.working = true;
  try { N.answer = await s.join(code ?? F?.hostIn.value); if (F) F.answerOut.value = N.answer; } catch (e) { N.err = errText(e); }
  N.working = false;
  return N.answer;
}
function leave(game) {
  game.coop?.stop(game);
  game.net?.close();
  game.net = null;
  N.view = 'root'; N.err = ''; N.offer = ''; N.answer = '';
}
function canStart(s) {
  return s.host && s.players.filter((p) => p.connected && p.slot !== 0).every((p) => p.ready);
}
function startTraining(game) {
  const s = game.net;
  if (!s?.host || !canStart(s)) return false;
  hideAll();
  hostStartBattle(game, s, trainingSetup(game, s), backToLobby);
  return true;
}

/**
 * Stage 3: the host starts the co-op party — new (startWorld with the host's hero) or the latest save (its co-op
 * guests are relinked by name). Guests follow on the first snap.
 */
function startCoop(game, fresh) {
  const s = game.net;
  if (!s?.host || !canStart(s) || game.coop) return false;
  let save = null;
  if (!fresh) {
    const slot = latestSlot();
    save = slot != null ? loadGame(game.data, slot) : null;
    if (!save) { N.err = t('net.noSaveHero'); return false; }
  }
  hideAll();
  createCoopWorld(game, s, { openMenu: openCoopMenu });
  if (fresh) startWorld(game, { ...N.hero, talents: Array.isArray(N.hero.talents) ? N.hero.talents : [] });
  else startFromSave(game, save);
  return true;
}
/** F2 in the co-op world: the lobby (host: invite / back), a dropped guest — the join view (new code exchange). */
function openCoopMenu(game) {
  const s = game.net;
  N.err = '';
  if (game.coop && game.scene?.id !== 'net') game.coop.backScene = game.scene;
  if (s && !s.host && s.status !== 'connected') { N.view = 'join'; N.answer = ''; if (F) { F.hostIn.value = ''; F.answerOut.value = ''; } } else N.view = 'lobby';
  game.setScene(netScene);
}
function backToGame(game) {
  if (!game.coop) return;
  hideAll();
  if (!game.coop.backToGame(game)) N.err = t('net.waitHostScene');
}

// ---------------------------------------------------------------- layout
function box(game) {
  const w = Math.min(1180, game.width - 40), h = Math.min(660, game.height - 40);
  return { x: Math.floor((game.width - w) / 2), y: Math.floor((game.height - h) / 2), w, h };
}

function layout(game) {
  const B = box(game);
  const bt = [];
  const s = game.net;
  const x0 = B.x + 32;
  if (N.view === 'root') {
    const y = B.y + 120;
    bt.push({ id: 'heroSave', label: t('net.heroSave'), x: x0, y: y + 34, w: 220, h: 40 });
    bt.push({ id: 'heroCreate', label: t('net.heroCreate'), x: x0 + 232, y: y + 34, w: 220, h: 40 });
    bt.push({ id: 'heroRandom', label: t('net.heroRandom'), x: x0 + 464, y: y + 34, w: 180, h: 40 });
    const by = B.y + B.h - 200;
    bt.push({ id: 'host', label: t('net.host'), sub: t('net.hostSub'), key: 'H', x: x0, y: by, w: 300, h: 60, disabled: !N.hero });
    bt.push({ id: 'join', label: t('net.join'), sub: t('net.joinSub'), key: 'J', x: x0 + 320, y: by, w: 300, h: 60, disabled: !N.hero });
    bt.push({ id: 'back', label: t('net.back'), key: 'Esc', x: x0, y: B.y + B.h - 64, w: 200, h: 44 });
  } else if (N.view === 'host') {
    bt.push({ id: 'copyOffer', label: t('net.copy'), x: B.x + B.w - 232, y: B.y + 92, w: 200, h: 40, disabled: !N.offer });
    bt.push({ id: 'pasteAnswer', label: t('net.paste'), x: B.x + B.w - 232, y: B.y + 300, w: 200, h: 40 });
    bt.push({ id: 'connect', label: t('net.connect'), x: B.x + B.w - 232, y: B.y + 348, w: 200, h: 40, selected: true, disabled: !N.offer });
    bt.push({ id: s?.guests() ? 'lobby' : 'cancel', label: s?.guests() ? t('net.lobby') : t('net.back'), key: 'Esc', x: x0, y: B.y + B.h - 64, w: 200, h: 44 });
  } else if (N.view === 'join') {
    bt.push({ id: 'pasteHost', label: t('net.paste'), x: B.x + B.w - 232, y: B.y + 92, w: 200, h: 40 });
    bt.push({ id: 'accept', label: t('net.accept'), x: B.x + B.w - 232, y: B.y + 140, w: 200, h: 40, selected: true, disabled: N.working });
    bt.push({ id: 'copyAnswer', label: t('net.copy'), x: B.x + B.w - 232, y: B.y + 300, w: 200, h: 40, disabled: !N.answer });
    bt.push({ id: 'cancel', label: t('net.back'), key: 'Esc', x: x0, y: B.y + B.h - 64, w: 200, h: 44 });
  } else if (N.view === 'lobby' && s) {
    const by = B.y + B.h - 64;
    if (s.host) {
      if (game.coop) bt.push({ id: 'backGame', label: t('net.backGame'), x: x0, y: by - 8, w: 280, h: 52, selected: true });
      else {
        bt.push({ id: 'training', label: t('net.training'), sub: t('net.trainingSub'), x: x0, y: by - 8, w: 280, h: 52, selected: canStart(s), disabled: !canStart(s) });
        bt.push({ id: 'coopNew', label: t('net.coopNew'), sub: t('net.coopNewSub'), x: x0, y: by - 72, w: 280, h: 52, selected: canStart(s), disabled: !canStart(s) });
        bt.push({ id: 'coopLoad', label: t('net.coopLoad'), sub: t('net.coopLoadSub'), x: x0 + 292, y: by - 72, w: 250, h: 52, disabled: !canStart(s) || latestSlot() == null });
      }
      bt.push({ id: 'invite', label: t('net.addPlayer'), x: x0 + 292, y: by, w: 220, h: 44, disabled: s.players.filter((p) => p.connected).length >= NET.maxPlayers });
      const tm = s.settings.turnTimer;
      bt.push({ id: 'timer', label: `${t('net.timer')}: ${tm ? `${tm} ${t('net.sec')}` : t('net.timerOff')}`, x: x0 + 524, y: by, w: 240, h: 44 });
      s.players.forEach((p, i) => { if (p.slot !== 0) bt.push({ id: `kick:${p.slot}`, label: t('net.kick'), x: B.x + 560 - 118, y: B.y + 96 + i * 64 + 10, w: 104, h: 32, font: 'bold 13px monospace' }); });
    } else {
      const me = s.me();
      bt.push({ id: 'ready', label: me?.ready ? t('net.ready') : t('net.notReady'), key: 'R', x: x0, y: by, w: 220, h: 44, selected: !!me?.ready, disabled: s.status !== 'connected' });
      if (game.coop) bt.push({ id: 'backGame', label: t('net.backGame'), x: x0 + 232, y: by, w: 240, h: 44, selected: true, disabled: s.status !== 'connected' });
    }
    bt.push({ id: 'leave', label: t('net.leave'), x: B.x + B.w - 232, y: by, w: 200, h: 44 });
  }
  N.buttons = bt;
}

async function act(game, id) {
  const s = game.net;
  play('uiClick');
  switch (id) {
    case 'heroSave': { const h = heroFromSave(game); if (h) setHero(h); else N.err = t('net.noSaveHero'); break; }
    case 'heroRandom': setHero({ ...randomHero(game.data), name: N.hero?.name || t('create.defaultName') }); break;
    case 'heroCreate':
      hideAll();
      game.setScene(createCreateScene({ onDone: (g, full) => { setHero(full); N.view = 'root'; g.setScene(netScene); }, onBack: (g) => g.setScene(netScene) }));
      return;
    case 'host': hostInvite(game); break;
    case 'join': N.view = 'join'; N.err = ''; N.answer = ''; if (F) { F.hostIn.value = ''; F.answerOut.value = ''; } break;
    case 'back': hideAll(); game.setScene(menuScene); return;
    case 'copyOffer': game.toast(t((await copyText(N.offer, F.offer)) ? 'net.copied' : 'net.copyFail'), 'h'); break;
    case 'copyAnswer': game.toast(t((await copyText(N.answer, F.answerOut)) ? 'net.copied' : 'net.copyFail'), 'h'); break;
    case 'pasteAnswer': case 'pasteHost': {
      const v = await pasteText();
      const f = id === 'pasteAnswer' ? F.answerIn : F.hostIn;
      if (v) f.value = v.trim(); else { game.toast(t('net.pasteFail'), 'a'); f.focus(); }
      break;
    }
    case 'connect': hostConnect(game); break;
    case 'accept': guestAccept(game); break;
    case 'lobby': N.view = 'lobby'; break;
    case 'cancel': leave(game); break;
    case 'leave': leave(game); break;
    case 'invite': hostInvite(game); break;
    case 'timer': s.setSettings({ turnTimer: s.settings.turnTimer ? 0 : NET.turnTimer }); break;
    case 'ready': s.setReady(!s.me()?.ready); break;
    case 'training': startTraining(game); return;
    case 'coopNew': startCoop(game, true); return;
    case 'coopLoad': startCoop(game, false); return;
    case 'backGame': backToGame(game); return;
    default:
      if (id.startsWith('kick:')) s.kick(Number(id.slice(5)));
  }
  layout(game);
}

// ---------------------------------------------------------------- render
function statusText(s) {
  if (!s) return { s: t('net.st.idle'), c: C['4'] };
  const c = s.status === 'connected' ? C.j : s.status === 'lost' || s.status === 'rejected' ? C.c : C.a;
  return { s: t(`net.st.${s.status}`), c };
}

function codeBlock(game, B, y, label, field, code, readonly) {
  const { ctx } = game;
  text(ctx, label, B.x + 32, y, C['5'], FONT_B);
  if (readonly && code) text(ctx, `${code.length} ${t('net.chars')}`, B.x + B.w - 252, y, code.length > NET.codeTarget ? C.a : C['4'], FONT, 'right');
  field.place(game, { x: B.x + 32, y: y + 26, w: B.w - 290, h: 120 });
  if (!readonly) field.el.readOnly = false;
}

function renderLobby(game, B, s) {
  const { ctx } = game;
  const lx = B.x + 32, lw = 528;
  text(ctx, t('net.players'), lx, B.y + 66, C['4'], FONT_B);
  s.players.forEach((p, i) => {
    const y = B.y + 96 + i * 64;
    panel(ctx, lx, y, lw, 56, C['2'], p.slot === s.slot ? C[p.color] : C['3']);
    ctx.fillStyle = C[p.color] || C.h;
    ctx.fillRect(lx + 2, y + 2, 8, 52);
    const tags = [p.slot === 0 ? t('net.hostMark') : '', p.slot === s.slot ? t('net.you') : ''].filter(Boolean).join(', ');
    text(ctx, fit(ctx, `${p.name}${tags ? ` (${tags})` : ''}`, 300, FONT_B), lx + 20, y + 8, p.connected ? C[p.color] : C['3'], FONT_B);
    const h = p.hero;
    const hl = h ? `${game.data.RACES[h.race]?.name || '?'} · ${game.data.CLASSES[h.cls]?.name || '?'} · ${t('net.lvl')} ${h.level || 1}` : t('net.heroNone');
    text(ctx, fit(ctx, hl, 300, FONT), lx + 20, y + 30, C['4'], FONT);
    const right = s.host && p.slot !== 0 ? lx + lw - 128 : lx + lw - 12;
    const st = !p.connected ? t('net.st.lost') : p.slot === 0 ? t('net.hostMark') : p.ready ? t('net.ready') : t('net.notReady');
    text(ctx, st, right, y + 8, !p.connected ? C.c : p.ready || p.slot === 0 ? C.j : C.a, FONT, 'right');
    if (p.slot !== s.slot || !s.host) text(ctx, `${p.slot === s.slot && !s.host ? s.me()?.ping ?? 0 : p.ping || 0} ${t('net.ms')}`, right, y + 30, C['4'], FONT, 'right');
  });
  for (let i = s.players.length; i < NET.maxPlayers; i++) {
    const y = B.y + 96 + i * 64;
    panel(ctx, lx, y, lw, 56, C['1'], C['2']);
    text(ctx, `${t('net.slot')} ${i + 1}`, lx + 20, y + 18, C['3'], FONT);
  }
  if (s.host) text(ctx, t(game.coop ? 'net.coopOn' : 'net.coopHint'), lx, B.y + 96 + 4 * 64 + 8, C['3'], FONT);
  const cr = { x: B.x + 584, y: B.y + 60, w: B.w - 616, h: B.h - 150 };
  drawChatBox(ctx, s, cr, { inputH: 44 });
  placeChatInput(game, s, { x: cr.x + 8, y: cr.y + cr.h - 42, w: cr.w - 16, h: 34 });
}

function render(game) {
  const { ctx, width: W, height: H } = game;
  clear(ctx, W, H);
  const B = box(game);
  panel(ctx, B.x, B.y, B.w, B.h, C['1'], C['3']);
  const s = game.net;
  const title = N.view === 'lobby' ? `${t('net.lobby')}` : N.view === 'host' ? `${t('net.title')}: ${t('net.host')}` : N.view === 'join' ? `${t('net.title')}: ${t('net.join')}` : t('net.title');
  text(ctx, title, B.x + 32, B.y + 20, C.h, FONT_L);
  const stt = statusText(s);
  if (s) text(ctx, stt.s, B.x + B.w - 32, B.y + 26, stt.c, FONT_B, 'right');
  const f = fields();
  const shown = new Set();
  if (N.view === 'root') {
    text(ctx, t('net.hero'), B.x + 32, B.y + 90, C['4'], FONT_B);
    text(ctx, fit(ctx, heroLine(game, N.hero), B.w - 64, FONT_B), B.x + 32, B.y + 120, N.hero ? C['5'] : C.a, FONT_B);
    const sy = B.y + 230;
    text(ctx, t('net.stun'), B.x + 32, sy, C['4'], FONT_B);
    if (!f.stun.shown) f.stun.value = currentStun();
    f.stun.place(game, { x: B.x + 32, y: sy + 24, w: 420, h: 32 });
    shown.add(f.stun);
    textBlock(ctx, t('net.stunHint'), B.x + 470, sy + 24, B.w - 510, C['4'], FONT, 20, 2);
    textBlock(ctx, t('net.stunWhat'), B.x + 32, sy + 72, B.w - 64, C['3'], FONT, 20, 2);
  } else if (N.view === 'host') {
    codeBlock(game, B, B.y + 66, t('net.yourCode'), f.offer, N.offer, true); shown.add(f.offer);
    f.offer.el.placeholder = N.working && !N.offer ? t('net.making') : '';
    codeBlock(game, B, B.y + 274, t('net.answerIn'), f.answerIn, '', false); shown.add(f.answerIn);
    textBlock(ctx, t('net.stunHint'), B.x + 32, B.y + 440, B.w - 64, C['4'], FONT, 20, 2);
  } else if (N.view === 'join') {
    codeBlock(game, B, B.y + 66, t('net.hostIn'), f.hostIn, '', false); shown.add(f.hostIn);
    if (N.answer || N.working) {
      codeBlock(game, B, B.y + 274, t('net.yourAnswer'), f.answerOut, N.answer, true); shown.add(f.answerOut);
      if (N.answer && s?.status !== 'connected') text(ctx, t('net.waitHost'), B.x + 32, B.y + 440, C.a, FONT);
    }
  } else if (N.view === 'lobby' && s) renderLobby(game, B, s);
  if (N.view !== 'lobby') hideChatInput();
  for (const fl of Object.values(f)) if (!shown.has(fl)) fl.hide();
  if (N.err) textBlock(ctx, N.err, B.x + 32, B.y + B.h - 140, B.w - 64, C.c, FONT, 20, 3);
  else if (N.note) text(ctx, N.note, B.x + 32, B.y + B.h - 120, C.a, FONT);
  for (const b of N.buttons) button(ctx, b, N.hover === b);
}

// ---------------------------------------------------------------- scene
export const netScene = {
  id: 'net',
  enter(game) {
    if (!N.hero) N.hero = loadHero() || normalizeHero(heroFromSave(game)) || normalizeHero({ ...randomHero(game.data), name: t('create.defaultName') });
    if (!game.net && N.view !== 'root') N.view = 'root';
    installHooks(game);
    layout(game);
  },
  resize(game) { layout(game); },
  update(game) {
    layout(game);
    const inp = game.input, m = inp.mouse;
    const h = hitButton(N.buttons, m);
    if (h !== N.hover && h && !h.disabled) play('uiHover');
    N.hover = h;
    let id = m.clicked && h && !h.disabled ? h.id : null;
    if (!id) {
      if (N.view === 'root' && inp.wasPressed('KeyH') && N.hero) id = 'host';
      else if (N.view === 'root' && inp.wasPressed('KeyJ') && N.hero) id = 'join';
      else if (N.view === 'lobby' && inp.wasPressed('KeyR') && game.net && !game.net.host) id = 'ready';
      else if (inp.wasPressed('Escape')) id = N.view === 'root' ? 'back' : N.view === 'lobby' ? (game.coop ? 'backGame' : null) : game.net?.guests?.() && N.view === 'host' ? 'lobby' : 'cancel';
      else if (inp.wasPressed('Enter') && N.view === 'lobby') document.getElementById('net-chat')?.focus();
    }
    if (id) act(game, id);
  },
  render,
};

export function openNetMenu(game) {
  if (!game.net) N.view = 'root';
  game.setScene(netScene);
}

/** Playwright hooks (multiplayer.md §8). */
function installHooks(game) {
  window.__net = {
    view: () => N.view,
    error: () => N.err,
    session: () => game.net,
    setStun: (v) => setStun(v),
    setVersion: (gameVer) => { N.version = { ...localVersion(), gameVer }; },
    setHero: (h) => setHero(h),
    createOffer: () => hostInvite(game),
    acceptOffer: (code) => { if (F) F.hostIn.value = code; return guestAccept(game, code); },
    acceptAnswer: (code) => { if (F) F.answerIn.value = code; return hostConnect(game, code); },
    toLobby: () => { N.view = 'lobby'; },
    chat: (txt) => game.net?.chatSend(txt),
    ready: (on = true) => game.net?.setReady(on),
    startTraining: () => startTraining(game),
    startCoop: (fresh = true) => startCoop(game, fresh),
    coop: () => game.coop?.info() || null,
    coopMenu: () => openCoopMenu(game),
    backGame: () => backToGame(game),
    leave: () => leave(game),
    /** Damage the local battle state (desync test): the next hash differs → fullState from the host. */
    corrupt: () => { const b = game.scene?.S?.b; const u = b?.units.find((x) => x.team === 'enemies' && !x.dead); if (u) u.hp = Math.max(1, u.hp - 1); return !!u; },
    battle: () => {
      const sc = game.scene;
      if (sc?.id !== 'battle' || !sc.coop) return null;
      const b = sc.S.b;
      return { seq: sc.coop.seq, desyncs: sc.coop.desyncs, resyncs: sc.coop.resyncs, winner: b.winner, round: b.round, result: sc.S.result, cur: b.turn?.unitId || null, mineTurn: !!sc.S.playerTurn, pending: !!sc.S.pending, inbox: sc.coop.inbox.length };
    },
  };
}
