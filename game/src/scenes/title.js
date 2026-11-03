import { t } from '../data/text/index.js';

let time = 0;

export const titleScene = {
  enter() {
    time = 0;
  },
  update(game, dt) {
    time += dt;
  },
  render({ ctx, width, height }) {
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcd75';
    ctx.font = 'bold 48px monospace';
    ctx.fillText(t('title'), width / 2, height / 2 - 16);
    if (Math.floor(time * 2) % 2 === 0) {
      ctx.fillStyle = '#f4f4f4';
      ctx.font = '16px monospace';
      ctx.fillText(t('subtitle'), width / 2, height / 2 + 32);
    }
  },
};
