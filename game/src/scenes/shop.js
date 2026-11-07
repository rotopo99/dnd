// Shared trade window: buy (price × reputation tier × cheap-trade × CHA) and sell (sell rate × sell-bonus × CHA).
// openShop(game, { title, stock: [item id], tier, faction?, key?, onClose(game) })
// v4 (skills.md N1, N7): the best CHA modifier of the party moves prices; once a day per shop — haggling (Persuasion:
// discount) and selling junk at full price (Deception: fail closes the shop for the day); Military in the party shows
// the weapon quality. Per-shop state lives in save.flags `shop:<key>:<day>` = { haggle, junk, closed }.
// vendors-bestiary.md part 1: `vendor: npcId` — the NPC's own shelf (world/vendors.js vendorStock: staples, signature,
// editions, rotation by save.day, rare goods), his markup/greed and what he buys (sell rate, loves ×1.25); without it — the
// old `stock` list. Seen rotation period — save.flags `vstock:<npcId>` (toast «Новый товар» after a change).
import { t } from '../data/text/index.js';
import { priceMult as exodusPrice } from '../world/exodus.js';
import { play } from '../audio/sfx.js';
import { ITEMS, SKILL_RULES } from '../world/data.js';
import { itemStats, soonNote, itemTip } from '../ui/items-ui.js';
import { members } from '../world/state.js';
import { worldFlagValues } from '../world/checks.js';
import { chaTrade, knowsSkill } from '../world/skill-uses.js';
import { openCheck } from '../ui/checks-ui.js';
import { WORLD_RULES as R } from '../data/world/rules.js';
import { saveGame } from '../save.js';
import { C } from '../ui/draw.js';
import { vendorStock, vendorSellRate } from '../world/vendors.js';
import { QUALITY } from '../data/items/mods.js';
import { syncItems, addInst, makeInst, instValue, bagKeys, contOf, holderOf, mutate, isGear } from '../world/inventory.js';

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
  buy *= exodusPrice(game.save); // third-exodus.md: marks 3+ raise prices
  const sellMul = (1 + sellBonus) * cha.sell;
  const sell = st.junk === 'ok' ? T.junk.sellRate : R.prices.sell * sellMul;
  return { buy, sell, sellMul, cha: cha.mod, haggled: st.haggle === 'ok', junk: st.junk === 'ok' };
}

export function openShop(game, { title, stock, tier = 'neutral', faction = null, key = null, vendor = null, onClose }) {
  const sv = game.save;
  key = key || vendor || title;
  if (vendor && !vendorStock(vendor, sv.day, tier)) vendor = null;
  if (vendor) {
    const per = vendorStock(vendor, sv.day, tier).period, fk = `vstock:${vendor}`;
    if (sv.flags[fk] != null && sv.flags[fk] !== per) game.toast(t('shop.newStock'), 'b');
    sv.flags[fk] = per;
  }
  if (shopState(sv, key).closed) {
    game.openModal({ title, lines: [{ text: t('shop.closed'), color: 'c' }], onCancel: (g) => onClose?.(g), options: [{ label: t('loc.close'), run: (g) => onClose?.(g) }] });
    return;
  }
  const reopen = (g) => openShop(g, { title, stock, tier, faction, key, vendor, onClose });
  syncItems(sv); // v7: the shop buys / sells instances (quality, mods) from the party's backpacks
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
      const tipOf = (id, price, q, mods) => () => itemTip(ITEMS[id], { u: hero, price, have: sv.hero.items[id] || 0, equipped: ITEMS[sv.hero.equipment?.[ITEMS[id].slot]], q, mods });
      const vs = vendor ? vendorStock(vendor, sv.day, tier) : null;
      const rows = vs ? vs.rows : stock.filter((id) => ITEMS[id]).map((id) => ({ id, q: 'working', kind: 'stock', mult: 1 }));
      const MARK = { sig: ['shop.sig', C.b], edition: ['shop.edition', C.b], rare: ['shop.rare', C.a] };
      const buy = rows.filter((r) => ITEMS[r.id]).map((r) => {
        const id = r.id, it = ITEMS[id];
        const price = Math.max(1, Math.round(it.price * r.mult * pr.buy));
        const q = appraise && it.slot === 'weapon' && it.tier ? ` · ${t('shop.quality')} ${it.tier}` : '';
        const qn = r.q !== 'working' ? ` (${QUALITY[r.q]?.name || r.q})` : '';
        const mk = MARK[r.kind];
        if (r.locked) return { label: `${it.name}${qn}`, sub: `${mk ? `${t(mk[0])} · ` : ''}${t(`tier.${r.locked}`)}: ${t('shop.needRep')}`, disabled: true, detail: tipOf(id, price, r.q) };
        return { label: `${t('shop.buy')}: ${it.name}${qn} — ${price}${q}`, sub: `${mk ? `${t(mk[0])} · ` : ''}${it.slot && it.slot !== 'consumable' ? itemStats(it) : it.desc || ''}${soonNote(it) ? ` · ${soonNote(it)}` : ''} (${t('loc.have')} ${sv.hero.items[id] || 0})`,
          subColor: mk ? mk[1] : undefined, keep: true, disabled: sv.hero.credits < price, detail: tipOf(id, price, r.q),
          run: (g) => {
            // v7: an instance of the shelf quality → hero's backpack, then companions; no room — no sale
            const left = mutate(sv, () => addInst(sv, makeInst(id, r.q), 1, { overflow: null }));
            if (left) { g.toast(t('inv.noRoom'), 'c'); return; }
            sv.hero.credits -= price; play('buff'); saveGame(sv);
          } };
      });
      const sellRate = (it) => {
        if (!vs || pr.junk) return pr.sell;
        const r = vendorSellRate(vendor, it);
        return r == null ? null : r * pr.sellMul;
      };
      // v7: sell instances from the party's backpacks (grouped by item + quality + mods); price by quality and mods
      const groups = new Map();
      for (const k of bagKeys(sv)) {
        if (!holderOf(sv, k)) continue;
        for (const e of contOf(sv, { c: 'bag', key: k }).grid) {
          const it = ITEMS[e.item];
          if (!it || !(it.price > 0) || it.key || sellRate(it) == null) continue;
          const gk = `${e.item}|${e.q}|${(e.mods || []).join(',')}`;
          const gr = groups.get(gk) || { id: e.item, q: e.q, mods: e.mods || [], n: 0 };
          gr.n += e.n || 1;
          groups.set(gk, gr);
        }
      }
      const sell = [...groups.values()].map((gr) => {
        const it = ITEMS[gr.id];
        const price = Math.max(1, Math.floor(instValue(gr) * sellRate(it)));
        const qn = isGear(it) && gr.q !== 'working' && QUALITY[gr.q] ? ` (${QUALITY[gr.q].name})` : '';
        return { label: `${t('shop.sell')}: ${it.name}${qn}${gr.mods.length ? ` +${gr.mods.length}` : ''} ×${gr.n} — ${price}`, keep: true, detail: tipOf(gr.id, price, gr.q, gr.mods),
          run: () => {
            const sold = mutate(sv, () => {
              for (const k of bagKeys(sv)) {
                const g = contOf(sv, { c: 'bag', key: k }).grid;
                const i = g.findIndex((e) => e.item === gr.id && e.q === gr.q && (e.mods || []).join(',') === gr.mods.join(','));
                if (i < 0) continue;
                g[i].n = (g[i].n || 1) - 1;
                if (g[i].n <= 0) g.splice(i, 1);
                return true;
              }
              return false;
            });
            if (sold) { sv.hero.credits += price; play('uiClick'); saveGame(sv); }
          } };
      });
      const info = [`${t('world.credits')}: ${sv.hero.credits}`];
      if (pr.buy !== 1) info.push(`${t('loc.prices')} ×${pr.buy.toFixed(2)}`);
      if (pr.cha > 0) info.push(`${t('shop.cha')} +${pr.cha}: −${Math.round(Math.min(T.buyMax, T.buyPerMod * pr.cha) * 100)}% / +${Math.round(Math.min(T.sellMax, T.sellPerMod * pr.cha) * 100)}%`);
      if (pr.haggled) info.push(`${t('shop.haggle')} −${Math.round(T.haggle.discount * 100)}%`);
      const head = [];
      if (vs) {
        head.push({ text: `[${vs.arch.name}] ${vs.vendor.note || ''}`, color: 'a' });
        const g = vs.vendor.greed || 0;
        info.push(`${t('shop.restock').replace('{n}', vs.left)}${g ? ` · ${t(g > 0 ? 'shop.greedy' : 'shop.generous')} ${g > 0 ? '+' : '−'}${Math.round(Math.abs(g) * 100)}%` : ''}`);
      }
      return {
        title, lines: [...head, { text: info.join(' · '), color: 'b' }],
        options: [...social, ...buy, ...sell, { label: t('loc.close'), run: (g) => onClose?.(g) }],
      };
    },
  });
}
