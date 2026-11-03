import { createInput } from './input.js';
import { titleScene } from './scenes/title.js';

const STEP = 1 / 60;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const game = {
  ctx,
  width: canvas.width,
  height: canvas.height,
  input: createInput(window),
  scene: null,
  setScene(scene) {
    this.scene = scene;
    scene.enter?.(this);
  },
};

game.setScene(titleScene);

let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (acc >= STEP) {
    game.scene.update(game, STEP);
    game.input.endFrame();
    acc -= STEP;
  }
  game.scene.render(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__game = game; // доступ для плейтестов
