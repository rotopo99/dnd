// Co-op chat UI (multiplayer.md §5): lobby window (last lines), battle / world peek (last 3 lines fading in 8 s),
// input field (DOM, Enter — send, Esc — close).
import { NET } from '../data/net.js';
import { t } from '../data/text/index.js';
import { C, FONT, LINE, text, panel, fit } from './draw.js';
import { createField } from './dom-field.js';

const lineText = (l) => (l.slot >= 0 && l.name ? `${l.name}: ${l.text}` : `· ${l.text}`);

/** Chat window: rect {x, y, w, h}; the newest lines at the bottom. */
export function drawChatBox(ctx, session, r, { title = t('net.chat'), inputH = 0 } = {}) {
  panel(ctx, r.x, r.y, r.w, r.h, C['1'], C['3']);
  text(ctx, title, r.x + 10, r.y + 8, C['4'], 'bold 14px monospace');
  const rows = Math.max(1, Math.floor((r.h - 34 - inputH) / LINE));
  const lines = session.chat.slice(-rows);
  let y = r.y + r.h - inputH - 8 - lines.length * LINE;
  for (const l of lines) {
    text(ctx, fit(ctx, lineText(l), r.w - 20, FONT), r.x + 10, y, C[l.color] || C['5'], FONT);
    y += LINE;
  }
}

/** Battle / world: last NET.chatPeek lines younger than NET.chatFade s; anchor — bottom-left {x, y, w}. */
export function drawChatPeek(ctx, session, a, { hint = '' } = {}) {
  const now = Date.now();
  const lines = session.chat.slice(-NET.chatPeek).filter((l) => now - l.at < NET.chatFade * 1000);
  let y = a.y - LINE;
  if (hint) { text(ctx, hint, a.x, y, C['3'], '12px monospace'); y -= LINE; }
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    const age = (now - l.at) / 1000;
    ctx.globalAlpha = age > NET.chatFade - 1 ? Math.max(0, NET.chatFade - age) : 1;
    const s = fit(ctx, lineText(l), a.w - 12, FONT);
    ctx.font = FONT;
    const w = ctx.measureText(s).width + 12;
    ctx.fillStyle = 'rgba(20,20,28,0.8)';
    ctx.fillRect(a.x, y - 2, w, LINE);
    text(ctx, s, a.x + 6, y, C[l.color] || C['5'], FONT);
    ctx.globalAlpha = 1;
    y -= LINE;
  }
}

let chatField = null;
/** One shared chat input: open over the bottom-left of the screen (battle / world), Enter — send and close. */
export function openChatInput(game, session, rect = null, focus = true) {
  if (!chatField) {
    chatField = createField({ maxLength: NET.chatMax, placeholder: t('net.chatHint'), id: 'net-chat',
      onEnter: (v) => { chatField.session?.chatSend(v); chatField.value = ''; if (!chatField.sticky) chatField.hide(); },
      onEscape: () => { chatField.value = ''; if (!chatField.sticky) chatField.hide(); else chatField.el.blur(); } });
  }
  chatField.session = session;
  chatField.sticky = false;
  chatField.place(game, rect || { x: 12, y: game.height - 80, w: 420, h: 34 });
  if (focus) chatField.focus();
  return chatField;
}

/** Lobby: the chat input stays visible inside the window (sticky); null rect — hide. */
export function placeChatInput(game, session, rect) {
  if (!rect) { chatField?.hide(); return null; }
  const f = openChatInput(game, session, rect, false);
  f.sticky = true;
  return f;
}
export function hideChatInput() { chatField?.hide(); }
