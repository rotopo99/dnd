// Shared trade window: buy (price × reputation tier × cheap-trade) and sell (sell rate × sell-bonus).
// openShop(game, { title, stock: [item id], tier, faction?, onClose(game) })
import { t } from '../data/text/index.js';
import { play } from '../audio/sfx.js';
import { ITEMS } from '../world/data.js';
import { members } from '../world/state.js';
import { worldFlagValues } from '../world/checks.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
import { saveGame } from '../save.js';

export function shopPrices(game, tier, faction) {
  const ms = members(game.save, game.data);
  let buy = R.prices[tier] ?? 1;
  for (const m of ms) for (const w of m.unit.worldFlags || []) {
    if (w.id === 'cheap-trade' && (!w.factions || (faction && w.factions.includes(faction)))) buy *= 1 - (w.value || 0.1);
  }
  const sellBonus = worldFlagValues(ms, 'sell-bonus')[0] || 0;
  return { buy, sell: R.prices.sell * (1 + sellBonus) };
}

export function openShop(game, { title, stock, tier = 'neutral', faction = null, onClose }) {
  const sv = game.save;
  const pr = shopPrices(game, tier, faction);
  game.openModal({
    width: 980,
    onCancel: (g) => onClose?.(g),
    build: () => {
      const buy = stock.filter((id) => ITEMS[id]).map((id) => {
        const it = ITEMS[id];
        const price = Math.max(1, Math.round(it.price * pr.buy));
        return { label: `${t('shop.buy')}: ${it.name} — ${price}`, sub: `${it.desc} (${t('loc.have')} ${sv.hero.items[id] || 0})`, keep: true, disabled: sv.hero.credits < price,
          run: () => { sv.hero.credits -= price; sv.hero.items[id] = (sv.hero.items[id] || 0) + 1; play('buff'); saveGame(sv); } };
      });
      const sell = Object.entries(sv.hero.items).filter(([id, n]) => n > 0 && ITEMS[id]?.price > 0 && !ITEMS[id].key).map(([id, n]) => {
        const price = Math.max(1, Math.floor(ITEMS[id].price * pr.sell));
        return { label: `${t('shop.sell')}: ${ITEMS[id].name} ×${n} — ${price}`, keep: true,
          run: () => { sv.hero.items[id]--; sv.hero.credits += price; play('uiClick'); saveGame(sv); } };
      });
      return {
        title, lines: [{ text: `${t('world.credits')}: ${sv.hero.credits}${pr.buy !== 1 ? ` · ${t('loc.prices')} ×${pr.buy.toFixed(2)}` : ''}`, color: 'b' }],
        options: [...buy, ...sell, { label: t('loc.close'), run: (g) => onClose?.(g) }],
      };
    },
  });
}
