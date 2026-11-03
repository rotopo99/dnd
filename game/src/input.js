// Keyboard + mouse input. Mouse coords are in canvas pixels.
// Per-frame flags (wasPressed, clicked, typed) are cleared by endFrame() after each logic step.
export function createInput(target, canvas) {
  const down = new Set();
  const pressed = new Set();
  const typed = [];
  const mouse = { x: -1, y: -1, clicked: false, rightClicked: false, inside: false };
  const pending = [];
  const hoverPos = { x: -1, y: -1, inside: false };
  const applyClick = (c) => {
    mouse.x = c.x; mouse.y = c.y; mouse.inside = true;
    if (c.right) mouse.rightClicked = true;
    else mouse.clicked = true;
  };
  target.addEventListener('keydown', (e) => {
    if (!down.has(e.code) || e.code === 'Backspace') pressed.add(e.code); // Backspace auto-repeats in text fields
    down.add(e.code);
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typed.push(e.key);
    if (e.code === 'Space' || e.code === 'Backspace' || e.code.startsWith('Arrow')) e.preventDefault();
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
      const c = { x: hoverPos.x, y: hoverPos.y, right: e.button === 2 };
      // fast double clicks within one logic step are queued, one click per step
      if (mouse.clicked || mouse.rightClicked || pending.length) pending.push(c);
      else applyClick(c);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
      if (pending.length) applyClick(pending.shift());
      else Object.assign(mouse, hoverPos);
    },
  };
}
