// DOM text fields over the canvas (invite codes, chat, STUN): real <textarea>/<input> so that copy / paste and
// mobile keyboards work. Keys typed into a field do not reach the game input (stopPropagation).
const FIELD_CSS = 'position:fixed;z-index:5;box-sizing:border-box;background:#14141c;color:#dfe3e8;border:2px solid #3a3f4e;'
  + 'font:14px monospace;padding:6px;resize:none;outline:none;word-break:break-all;';

/**
 * createField({ multiline, readonly, maxLength, placeholder, onEnter, onEscape }) →
 * { el, place(game, rect), hide(), get value, set value, focus(), select(), remove() }. rect — canvas pixels.
 */
export function createField({ multiline = false, readonly = false, maxLength = 0, placeholder = '', onEnter = null, onEscape = null, id = '' } = {}) {
  const el = document.createElement(multiline ? 'textarea' : 'input');
  el.style.cssText = FIELD_CSS + 'display:none;';
  if (id) el.id = id;
  el.spellcheck = false;
  el.autocomplete = 'off';
  if (readonly) el.readOnly = true;
  if (maxLength) el.maxLength = maxLength;
  el.placeholder = placeholder;
  const stop = (e) => {
    e.stopPropagation();
    if (e.type !== 'keydown') return;
    if (e.key === 'Enter' && onEnter && (!multiline || !e.shiftKey)) { e.preventDefault(); onEnter(el.value); }
    else if (e.key === 'Escape' && onEscape) { e.preventDefault(); onEscape(); }
  };
  el.addEventListener('keydown', stop);
  el.addEventListener('keyup', stop);
  el.addEventListener('keypress', stop);
  document.body.appendChild(el);
  return {
    el,
    /** Show over the canvas rect (canvas pixels → CSS pixels of the scaled canvas). */
    place(game, r) {
      const cr = game.canvas.getBoundingClientRect();
      const kx = cr.width / game.canvas.width, ky = cr.height / game.canvas.height;
      Object.assign(el.style, { display: 'block', left: `${cr.left + r.x * kx}px`, top: `${cr.top + r.y * ky}px`, width: `${r.w * kx}px`, height: `${r.h * ky}px`, fontSize: `${Math.max(10, Math.round(14 * ky))}px` });
    },
    hide() { el.style.display = 'none'; if (document.activeElement === el) el.blur(); },
    get shown() { return el.style.display !== 'none'; },
    get value() { return el.value; },
    set value(v) { el.value = v; },
    focus() { el.focus(); },
    select() { el.focus(); el.select(); },
    remove() { el.remove(); },
  };
}

/** Copy text: navigator.clipboard, else select the field + execCommand('copy'). → Promise<boolean>. */
export async function copyText(text, field) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* no permission / insecure context */ }
  try { field?.select(); return document.execCommand('copy'); } catch { return false; }
}

/** Read the clipboard → string or null (no permission: the player pastes into the field by hand). */
export async function pasteText() {
  try { return await navigator.clipboard.readText(); } catch { return null; }
}
