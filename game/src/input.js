// Keyboard + mouse input. Mouse coords are in canvas pixels.
// Per-frame flags (wasPressed, clicked, typed) are cleared by endFrame() after each logic step.
export function createInput(target, canvas) {
  const down = new Set();
  const pressed = new Set();
  const typed = [];
  const mouse = { x: -1, y: -1, clicked: false, rightClicked: false, inside: false };
  target.addEventListener('keydown', (e) => {
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typed.push(e.key);
    if (e.code === 'Space' || e.code === 'Backspace' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  target.addEventListener('keyup', (e) => down.delete(e.code));
  if (canvas) {
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = Math.floor(((e.clientX - r.left) * canvas.width) / r.width);
      mouse.y = Math.floor(((e.clientY - r.top) * canvas.height) / r.height);
      mouse.inside = true;
    };
    canvas.addEventListener('pointermove', pos);
    canvas.addEventListener('pointerleave', () => { mouse.inside = false; mouse.x = -1; mouse.y = -1; });
    canvas.addEventListener('pointerdown', (e) => {
      pos(e);
      if (e.button === 2) mouse.rightClicked = true;
      else mouse.clicked = true;
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
    },
  };
}
