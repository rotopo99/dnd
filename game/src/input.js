// Keyboard + mouse input. Mouse coords are in canvas pixels.
// Per-frame flags (wasPressed, clicked, typed) are cleared by endFrame() after each logic step.
// Right click fires on release and only if the pointer moved < dragMin px (a right drag pans the 3D camera).
import { GFX } from './data/gfx.js';

export function createInput(target, canvas) {
  const down = new Set();
  const pressed = new Set();
  const typed = [];
  const mouse = { x: -1, y: -1, clicked: false, rightClicked: false, inside: false, down: false, released: false, wheel: 0, middle: false, right: false };
  const pending = [];
  const hoverPos = { x: -1, y: -1, inside: false };
  let rightAt = null; // right button press: becomes a click on release unless dragged
  const applyClick = (c) => {
    mouse.x = c.x; mouse.y = c.y; mouse.inside = true;
    if (c.right) mouse.rightClicked = true;
    else mouse.clicked = true;
  };
  // fast double clicks within one logic step are queued, one click per step
  const queueClick = (c) => { if (mouse.clicked || mouse.rightClicked || pending.length) pending.push(c); else applyClick(c); };
  target.addEventListener('keydown', (e) => {
    if (!down.has(e.code) || e.code === 'Backspace') pressed.add(e.code); // Backspace auto-repeats in text fields
    down.add(e.code);
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typed.push(e.key);
    if (e.code === 'Space' || e.code === 'Backspace' || e.code.startsWith('Arrow') || e.code.startsWith('Alt')) e.preventDefault(); // Alt: roam cones, no browser menu
  });
  target.addEventListener('keyup', (e) => down.delete(e.code));
  if (canvas) {
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      hoverPos.x = Math.floor(((e.clientX - r.left) * canvas.width) / r.width);
      hoverPos.y = Math.floor(((e.clientY - r.top) * canvas.height) / r.height);
      hoverPos.inside = true;
      // while a click waits for its logic step, keep the click position
      if (!mouse.clicked && !mouse.rightClicked) Object.assign(mouse, hoverPos);
    };
    canvas.addEventListener('pointermove', pos);
    canvas.addEventListener('pointerleave', () => {
      Object.assign(hoverPos, { x: -1, y: -1, inside: false });
      if (!mouse.clicked && !mouse.rightClicked) Object.assign(mouse, hoverPos);
    });
    canvas.addEventListener('pointerdown', (e) => {
      pos(e);
      if (e.button === 2) { rightAt = { x: hoverPos.x, y: hoverPos.y, cx: e.clientX, cy: e.clientY }; return; } // click on release
      if (e.button !== 0) return; // middle — camera drag only, never a click
      queueClick({ x: hoverPos.x, y: hoverPos.y, right: false });
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // held button (drag / pan) and wheel (zoom): read by scenes that need them, cleared per step
    canvas.addEventListener('pointerdown', (e) => { if (e.button === 0) mouse.down = true; if (e.button === 1) mouse.middle = true; if (e.button === 2) mouse.right = true; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); }); // middle drag pans the 3D camera, no autoscroll
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0 && mouse.down) { mouse.down = false; mouse.released = true; }
      if (e.button === 1) mouse.middle = false;
      if (e.button === 2) {
        mouse.right = false;
        if (rightAt && Math.hypot(e.clientX - rightAt.cx, e.clientY - rightAt.cy) < GFX.camera.dragMin) queueClick({ x: rightAt.x, y: rightAt.y, right: true });
        rightAt = null;
      }
    });
    window.addEventListener('blur', () => { mouse.middle = false; mouse.right = false; rightAt = null; });
    canvas.addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  }
  return {
    mouse,
    isDown: (code) => down.has(code),
    wasPressed: (code) => pressed.has(code),
    /** Characters typed during this step (for text fields). */
    typed: () => typed,
    endFrame: () => {
      pressed.clear();
      typed.length = 0;
      mouse.clicked = false;
      mouse.rightClicked = false;
      mouse.released = false;
      mouse.wheel = 0;
      if (pending.length) applyClick(pending.shift());
      else Object.assign(mouse, hoverPos);
    },
  };
}
