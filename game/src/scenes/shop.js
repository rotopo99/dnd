// Shared trade window: buy (price × reputation tier × cheap-trade × CHA) and sell (sell rate × sell-bonus × CHA).
// openShop(game, { title, stock: [item id], tier, faction?, key?, onClose(game) })
// v4 (skills.md N1, N7): the best CHA modifier of the party moves prices; once a day per shop — haggling (Persuasion:
// discount) and selling junk at full price (Deception: fail closes the shop for the day); Military in the party shows
// the weapon quality. Per-shop state lives in save.flags `shop:<key>:<day>` = { haggle, junk, closed }.
import { t } from '../data/text/index.js';
import { play } from '../audio/sfx.js';
import { ITEMS, SKILL_RULES } from '../world/data.js';
import { itemStats, soonNote, itemTip } from '../ui/items-ui.js';
import { members } from '../world/state.js';
import { worldFlagValues } from '../world/checks.js';
import { chaTrade, knowsSkill } from '../world/skill-uses.js';
import { openCheck } from '../ui/checks-ui.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
import { saveGame } from '../save.js';

const T = SKILL_RULES.trade;
const shopKey = (sv, key) => `shop:${key}:${sv.day}`;
export const shopState = (sv, key) => (sv.flags[shopKey(sv, key)] && typeof sv.flags[shopKey(sv, key)] === 'object' ? sv.flags[shopKey(sv, key)] : {});
const setShopState = (sv, key, patch) => { sv.flags[shopKey(sv, key)] = { ...shopState(sv, key), ...patch }; };

export function shopPrices(game, tier, faction, key = null) {
  const ms = members(game.save, game.data);
  let buy = R.prices[tier] ?? 1;
  for (const m of ms) for (const w of m.unit.worldFlags || []) {
    if (w.id === 'cheap-trade' && (!w.factions || (faction && w.factions.includes(faction)))) buy *= 1 - (w.value || 0.1);
  }
  const sellBonus = worldFlagValues(ms, 'sell-bonus')[0] || 0;
  const cha = chaTrade(ms);
  const st = key ? shopState(game.save, key) : {};
  buy *= cha.buy * (st.haggle === 'ok' ? 1 - T.haggle.discount : 1);
  const sell = st.junk === 'ok' ? T.junk.sellRate : R.prices.sell * (1 + sellBonus) * cha.sell;
  return { buy, sell, cha: cha.mod, haggled: st.haggle === 'ok', junk: st.junk === 'ok' };
}

export function openShop(game, { title, stock, tier = 'neutral', faction = null, key = null, onClose }) {
  const sv = game.save;
  key = key || title;
  if (shopState(sv, key).closed) {
    game.openModal({ title, lines: [{ text: t('shop.closed'), color: 'c' }], onCancel: (g) => onClose?.(g), options: [{ label: t('loc.close'), run: (g) => onClose?.(g) }] });
    return;
  }
  const reopen = (g) => openShop(g, { title, stock, tier, faction, key, onClose });
  game.openModal({
    width: 980,
    onCancel: (g) => onClose?.(g),
    build: () => {
      const pr = shopPrices(game, tier, faction, key);
      const ms = members(sv, game.data);
      const appraise = knowsSkill(ms, T.appraise.skill);
      const st = shopState(sv, key);
      const social = [];
      social.push({ label: `${t('shop.haggle')}: ${t(`skill.${T.haggle.skill}`)} ${t('battle.dc')} ${T.haggle.dc}`, sub: st.haggle ? t('shop.done') : `−${Math.round(T.haggle.discount * 100)}%`, disabled: !!st.haggle,
        run: (g) => openCheck(g, { title: t('shop.haggle'), skill: T.haggle.skill, dc: T.haggle.dc, members: ms, memoKey: `${shopKey(sv, key)}:haggle`,
          onDone: (g2, ok) => { setShopState(sv, key, { haggle: ok ? 'ok' : 'fail' }); g2.toast(t(ok ? 'shop.haggleOk' : 'shop.haggleFail'), ok ? 'j' : 'c'); saveGame(sv); reopen(g2); } }) });
      social.push({ label: `${t('shop.junk')}: ${t(`skill.${T.junk.skill}`)} ${t('battle.dc')} ${T.junk.dc}`, sub: st.junk ? t('shop.done') : `×${T.junk.sellRate}`, disabled: !!st.junk,
        run: (g) => openCheck(g, { title: t('shop.junk'), skill: T.junk.skill, dc: T.junk.dc, members: ms, memoKey: `${shopKey(sv, key)}:junk`,
          onDone: (g2, ok) => {
            setShopState(sv, key, ok ? { junk: 'ok' } : { junk: 'fail', closed: true });
            g2.toast(t(ok ? 'shop.junkOk' : 'shop.junkFail'), ok ? 'j' : 'c'); saveGame(sv);
            if (ok) reopen(g2); else onClose?.(g2);
          } }) });
      const hero = ms[0]?.unit;
      const tipOf = (id, price) => () => itemTip(ITEMS[id], { u: hero, price, have: sv.hero.items[id] || 0, equipped: ITEMS[sv.hero.equipment?.[ITEMS[id].slot]] });
      const buy = stock.filter((id) => ITEMS[id]).map((id) => {
        const it = ITEMS[id];
        const price = Math.max(1, Math.round(it.price * pr.buy));
        const q = appraise && it.slot === 'weapon' && it.tier ? ` · ${t('shop.quality')} ${it.tier}` : '';
        return { label: `${t('shop.buy')}: ${it.name} — ${price}${q}`, sub: `${it.slot && it.slot !== 'consumable' ? itemStats(it) : it.desc || ''}${soonNote(it) ? ` · ${soonNote(it)}` : ''} (${t('loc.have')} ${sv.hero.items[id] || 0})`, keep: true, disabled: sv.hero.credits < price, tip: tipOf(id, price),
          run: () => { sv.hero.credits -= price; sv.hero.items[id] = (sv.hero.items[id] || 0) + 1; play('buff'); saveGame(sv); } };
      });
      const sell = Object.entries(sv.hero.items).filter(([id, n]) => n > 0 && ITEMS[id]?.price > 0 && !ITEMS[id].key).map(([id, n]) => {
        const price = Math.max(1, Math.floor(ITEMS[id].price * pr.sell));
        return { label: `${t('shop.sell')}: ${ITEMS[id].name} ×${n} — ${price}`, keep: true, tip: tipOf(id, price),
          run: () => { sv.hero.items[id]--; sv.hero.credits += price; play('uiClick'); saveGame(sv); } };
      });
      const info = [`${t('world.credits')}: ${sv.hero.credits}`];
      if (pr.buy !== 1) info.push(`${t('loc.prices')} ×${pr.buy.toFixed(2)}`);
      if (pr.cha > 0) info.push(`${t('shop.cha')} +${pr.cha}: −${Math.round(Math.min(T.buyMax, T.buyPerMod * pr.cha) * 100)}% / +${Math.round(Math.min(T.sellMax, T.sellPerMod * pr.cha) * 100)}%`);
      if (pr.haggled) info.push(`${t('shop.haggle')} −${Math.round(T.haggle.discount * 100)}%`);
      return {
        title, lines: [{ text: info.join(' · '), color: 'b' }],
        options: [...social, ...buy, ...sell, { label: t('loc.close'), run: (g) => onClose?.(g) }],
      };
    },
  });
}
