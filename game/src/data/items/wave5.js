// Content wave 5 reward items (docs/specs/content-wave5.md §4). World-item format (data/world/locations.js ITEMS): passives /
// world checks work while the item is in the hero's inventory. Numbers — balance-tester; icons — the generic world-item ones.
import { WAVE5_TEXT as T } from '../text/wave5.js';

export const ITEMS_WAVE5 = {
  // w5-crown: a splinter of the faulty beacon-crown — it no longer «hums», it soaks the noise up
  'crown-shard': { id: 'crown-shard', name: 'Осколок короны', price: 90,
    passives: [{ id: 'item-crown-shard', name: 'Не жмёт', desc: '−1 к каждому урону по Морали (кринж, психика).', op: { mrlGuard: 1 } }],
    desc: 'Осколок короны Короля свалок. Больше не гудит. Пока в рюкзаке — урон по Морали −1.' },
  // w5-edict: «+1 к кринж-броскам» — the cringe rolls of the quest are deception / persuasion (no separate cringe skill)
  'rhyme-book': { id: 'rhyme-book', name: 'Сборник рифм', price: 40,
    world: [{ check: 'deception', bonus: 1 }],
    desc: `${T['w5.edict.item.rhymebook'] || 'Сборник рифм.'} Пока в рюкзаке — Обман +1.` },
  // w5-schedule: a capacitor of the proxy relay
  'proxy-capacitor': { id: 'proxy-capacitor', name: 'Прокси-конденсатор', price: 0, key: true,
    passives: [{ id: 'item-proxy-capacitor', name: 'Заряд по расписанию', desc: '+1 к максимуму ЭНР.', op: { maxEnr: 1 } }],
    world: [{ check: 'proxy', bonus: 1 }],
    desc: 'Снят с ретранслятора у Свободы. Пока в рюкзаке — ЭНР +1 и Прокси-магия +1.' },
  // w5-recruit: the oath cord of the Tin Brotherhood
  'tin-oath-cord': { id: 'tin-oath-cord', name: 'Шнур клятвы', price: 60,
    world: [{ check: 'persuasion', bonus: 1 }],
    desc: 'Шнур, которым Жестяное братство связывает клятву. Пока в рюкзаке — Убеждение +1.' },
};
