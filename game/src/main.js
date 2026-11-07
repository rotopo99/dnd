import { createInput } from './input.js';
import { menuScene } from './scenes/menu.js';
import { unlockAudioOnFirstGesture } from './audio/sfx.js';
import { playTrack } from './audio/music.js';
import { exodusMark } from './world/exodus.js';
import { PLAY_DATA as GAME_DATA } from './world/data.js';
import { setSaveErrorHandler } from './save.js';
import { t } from './data/text/index.js';
import { updateModal, renderModal, renderToasts, updateToasts } from './ui/modal.js';
import { renderTips, clearTips } from './ui/tooltip.js';
import { updateBarks, renderBark } from './ui/bark.js';

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
  save: null, // world save (save.js) while in the open world
  modals: [], // modal stack (ui/modal.js); while not empty the scene does not get update()
  toasts: [],
  setScene(scene) {
    this.scene = scene;
    this.modals.length = 0;
    scene.enter?.(this);
    syncMusic(this);
  },
  /** Return to an already entered scene without resetting it. */
  resume(scene) {
    this.scene = scene;
    scene.resume?.(this);
    syncMusic(this);
  },
  openModal(spec) { this.modals.push(spec); },
  closeModal() { this.modals.pop(); },
  /** Toast: identical ones are merged («×N»), at most 3 are kept (oldest dropped). */
  toast(text, color = 'h') {
    const same = this.toasts.find((x) => x.text === text);
    if (same) { same.n = (same.n || 1) + 1; same.t = 0; return; }
    this.toasts.push({ text, color, t: 0, n: 1 });
    if (this.toasts.length > 3) this.toasts.shift();
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

setSaveErrorHandler(() => game.toast(t('save.failed'), 'c'));
/** Background track by scene: boss fights, last Exodus mark → tension. */
function syncMusic(g) {
  try {
    const sc = g.scene, id = sc?.id;
    const tense = g.save && exodusMark(g.save) >= 5;
    let tr = null;
    if (sc === menuScene || id === 'menu') tr = 'menu';
    else if (id === 'worldmap') tr = tense ? 'tension' : 'world';
    else if (id === 'location') tr = tense ? 'tension' : 'town';
    else if (id === 'cyberspace') tr = 'cyberspace';
    else if (id === 'battle') tr = sc.S?.b?.units?.some((u) => u.boss && u.team !== 'heroes') ? 'boss' : 'battle';
    if (tr) playTrack(tr);
  } catch (e) { console.warn('music', e); }
}

game.setScene(menuScene);

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame); // first: an exception in a scene must not freeze the loop
  acc = Math.min(acc + (now - last) / 1000, 0.25);
  last = now;
  while (acc >= STEP) {
    acc -= STEP;
    game.time += STEP;
    try {
      updateToasts(game, STEP);
      updateBarks(game, STEP); // companion barks (companions-scenes.md)
      if (game.modals.length) updateModal(game, STEP);
      else game.scene.update(game, STEP);
    } finally {
      game.input.endFrame();
    }
  }
  game.scene.render(game);
  if (game.modals.length) { clearTips(); renderModal(game); } // scene tooltips are stale under a modal
  renderBark(game);
  renderTips(game);
  renderToasts(game);
}
requestAnimationFrame(frame);

window.__game = game; // доступ для плейтестов
