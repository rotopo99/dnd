import { createInput } from './input.js';
import { menuScene } from './scenes/menu.js';
import { unlockAudioOnFirstGesture } from './audio/sfx.js';
import { GAME_DATA } from './data/index.js';

// Minimal logical size: the UI is laid out for >= 1280x720. Bigger windows get a bigger canvas
// at 1:1 pixels (pixel-perfect); smaller ones are downscaled by CSS as a fallback.
const MIN_W = 1280;
const MIN_H = 720;
const STEP = 1 / 60;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = {
  ctx,
  canvas,
  width: canvas.width,
  height: canvas.height,
  input: createInput(window, canvas),
  data: GAME_DATA,
  hero: null, // { race, cls, path, name } — chosen in character creation
  scene: null,
  time: 0,
  setScene(scene) {
    this.scene = scene;
    scene.enter?.(this);
  },
};

function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(MIN_W, vw);
  const h = Math.max(MIN_H, vh);
  canvas.width = w;
  canvas.height = h;
  const k = Math.min(vw / w, vh / h, 1);
  canvas.style.width = `${Math.floor(w * k)}px`;
  canvas.style.height = `${Math.floor(h * k)}px`;
  ctx.imageSmoothingEnabled = false;
  game.width = w;
  game.height = h;
  game.scene?.resize?.(game);
}
window.addEventListener('resize', resize);
resize();
unlockAudioOnFirstGesture(window);

game.setScene(menuScene);

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame); // first: an exception in a scene must not freeze the loop
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (acc >= STEP) {
    game.time += STEP;
    game.scene.update(game, STEP);
    game.input.endFrame();
    acc -= STEP;
  }
  game.scene.render(game);
}
requestAnimationFrame(frame);

window.__game = game; // доступ для плейтестов
