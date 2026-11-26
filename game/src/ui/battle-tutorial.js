// Battle tutorial (QA v48 #3) and defeat tips (QA v48 #1). View + light logic, no engine changes.
// Short in-world radio hints from Sandaun: non-blocking, each shown once per `seen` object (the prologue passes one
// object for all retries, so a hint does not repeat after «Ещё раз»).
//   createTutorial(seen)        -> T (S.tut)
//   tutorialEvent(T, S, e)      engine event hook (battle.js handleEvent): ranged shot at the hero -> cover hint
//   tutorialTick(T, S, dt)      picks the next hint on the player's turn
//   drawTutorial(ctx, S)        the hint panel at the bottom of the map, above the help line
//   noteHit(S, e)               remember who / what last hurt the hero (for the defeat tip)
//   defeatTip(S)                -> string | null: «what killed you» + one concrete hint
//   quickLine(it, statuses)     -> one-line «what the item does» for quick slots (medkit: «Лечит 2d4+2 ЗДР…»)
import { C, FONT, FONT_B, LINE, text, wrap, panel } from './draw.js';

const TXT = {
  who: 'Сандаун (по рации):',
  attack: 'Видишь фанатика? Кликни по нему — это атака. Далеко — сначала кликни по полу рядом, подойдёшь.',
  skill: '{key} — твой приём класса: «{name}». Сильнее простого удара, но кончается.',
  cover: 'Стрелок бьёт издалека. Встань так, чтобы между вами был ящик: укрытие даёт +2 КБ.',
  burn: 'Горишь! Жми кнопку «Снять: {name}» — потушишь за {kind} и не будешь терять ЗДР каждый ход.',
  medkit: 'Плохо выглядишь. {key} — {item}: {what}.',
  actAction: 'действие', actBonus: 'бонусное действие',
  killedBy: 'Последний удар: {who}.',
  killedByStatus: 'Добило: {who}.',
  tipBurn: 'Совет: горишь — жми «Снять: Горение», огонь жжёт каждый ход.',
  tipBleed: 'Совет: кровотечение останавливает лечение — аптечка на 1.',
  tipRanged: 'Совет: от стрелка прячься за ящик (+2 КБ) или сделай Рывок и бей его вблизи.',
  tipMelee: 'Совет: встречай фанатиков у ящиков по одному, а при ЗДР ниже половины — аптечка на 1.',
  tipGeneric: 'Совет: укрытие даёт +2 КБ, Рывок — ещё один ход движения, аптечка — на клавише 1.',
  heal: 'Лечит {dice} {res}',
  self: ' (себя или соседа)',
  res: { hp: 'ЗДР', mrl: 'МРЛ', enr: 'ЭНР' },
};
const HOLD = 9; // s a hint stays (or until done)
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (o[k] ?? m));

/** One line: what a battle item does («Лечит 2d4+2 ЗДР (себя или соседа)», else the battle ability's desc). */
export function quickLine(it) {
  if (!it) return '';
  const heal = (it.effects || []).find((e) => e.op === 'heal');
  if (heal) return fill(TXT.heal, { dice: `${heal.dice || ''}${heal.bonus ? `+${heal.bonus}` : ''}`, res: TXT.res[heal.resource || 'hp'] || '' }) + (it.target === 'ally' ? TXT.self : '');
  return it.battle?.desc || it.desc || '';
}

/** Ability that hurts a foe or fields a fighter (damage / weapon strike / drain / summon), not a heal or a self-buff. */
export function isOffensive(a) {
  if (!a || a.action === 'reaction') return false;
  const ops = (a.effects || []).map((e) => e.op);
  if (ops.includes('summon')) return true;
  return a.target !== 'ally' && a.target !== 'self' && ops.some((o) => o === 'damage' || o === 'weapon' || o === 'drain');
}

export function createTutorial(seen = {}) {
  return { seen, cur: null, t: 0, rangedHit: false, attacked: false, turns: 0 };
}

export function tutorialEvent(T, S, e) {
  if (!T) return;
  const b = S.b, A = e.actor && b.byId[e.actor], tgt = e.target && b.byId[e.target];
  if (e.type === 'attack' && A && A.id === S.heroId) { T.attacked = true; if (T.cur?.id === 'attack') T.cur.done = true; }
  if (e.type === 'ability' && A && A.id === S.heroId && (T.cur?.id === 'skill' || T.cur?.id === 'attack')) T.cur.done = true;
  if (e.type === 'attack' && A && A.team === 'enemies' && tgt && tgt.id === S.heroId && (A.weapon?.range || 1) > 1) T.rangedHit = true;
  if (e.type === 'statusEnd' && tgt && tgt.id === S.heroId && T.cur?.id === 'burn') T.cur.done = true;
  if (e.type === 'turnStart' && A && A.id === S.heroId) T.turns++;
}

function show(T, id, msg) {
  T.seen[id] = true;
  T.cur = { id, text: msg, t: 0, done: false };
}

export function tutorialTick(T, S, dt) {
  if (!T) return;
  if (T.cur) {
    T.cur.t += dt;
    if (T.cur.t > HOLD || (T.cur.done && T.cur.t > 1.5)) T.cur = null;
    return;
  }
  if (!S.playerTurn || S.banner || S.result) return;
  const b = S.b, hero = b.byId[S.heroId];
  if (!hero) return;
  const burn = (hero.statuses || []).find((st) => b.data.statuses[st.id]?.endAction && b.data.statuses[st.id]?.tick);
  if (burn && !T.seen.burn) {
    const d = b.data.statuses[burn.id];
    return show(T, 'burn', fill(TXT.burn, { name: d.name, kind: d.endActionKind === 'bonus' ? TXT.actBonus : TXT.actAction }));
  }
  const q = (S.quickBtns || []).find((x) => x.quick && (b.data.items[x.quick]?.effects || []).some((e) => e.op === 'heal' && (e.resource || 'hp') === 'hp'));
  if (q && !T.seen.medkit && hero.hp <= hero.maxHp / 2) {
    const it = b.data.items[q.quick];
    return show(T, 'medkit', fill(TXT.medkit, { key: q.key, item: it.name, what: quickLine(it) }));
  }
  // the skill hint rides with the attack hint on turn 1 and names the first offensive ability (not a heal / buff)
  const skBtn = (S.buttons || []).find((x) => x.a && isOffensive(x.a));
  const skText = skBtn && !T.seen.skill ? fill(TXT.skill, { key: skBtn.key || '', name: skBtn.a.name }) : null;
  if (!T.seen.attack) {
    if (skText) T.seen.skill = true;
    return show(T, 'attack', skText ? `${TXT.attack} ${skText}` : TXT.attack);
  }
  if (T.rangedHit && !T.seen.cover) return show(T, 'cover', TXT.cover);
  if (skText) return show(T, 'skill', skText);
}

export function drawTutorial(ctx, S) {
  const T = S.tut, L = S.L;
  if (!T?.cur || !L || S.result || S.banner) return;
  const w = Math.min(L.area.w - 40, 620), x = L.area.x + Math.floor((L.area.w - w) / 2);
  const lines = wrap(ctx, T.cur.text, w - 24, FONT).slice(0, 4);
  const h = 14 + LINE + lines.length * LINE;
  const y = L.area.y + L.area.h - 30 - h; // above the help line: the top of the map is where the camera frames units
  const k = Math.min(1, T.cur.t * 4, (HOLD - T.cur.t) * 2);
  ctx.save();
  ctx.globalAlpha = Math.max(0, k);
  panel(ctx, x, y, w, h, C['0'], C.h);
  text(ctx, TXT.who, x + 12, y + 6, C.h, FONT_B);
  lines.forEach((s, i) => text(ctx, s, x + 12, y + 6 + LINE + i * LINE, C['5'], FONT));
  ctx.restore();
}

/** battle.js 'damage' / 'tick' events: remember the last thing that hurt the hero. */
export function noteHit(S, e) {
  const b = S.b;
  if (e.type === 'tick') { S.lastTick = { target: e.target, status: e.status }; return; }
  if (e.type !== 'damage') return;
  const tick = !e.actor && S.lastTick?.target === e.target ? S.lastTick.status : null;
  S.lastTick = null;
  if (e.target !== S.heroId || !(e.amount > 0)) return;
  const A = e.actor && b.byId[e.actor];
  S.lastHit = { status: tick, actor: A ? A.id : null, ranged: !!A && (A.weapon?.range || 1) > 1, dmgType: e.dmgType };
}

/** Name of the status whose tick caused this damage event (DoT log line), or null. Call before noteHit. */
export function tickStatusOf(S, e) {
  return e.type === 'damage' && !e.actor && S.lastTick?.target === e.target ? S.lastTick.status : null;
}

export function defeatTip(S) {
  const h = S.lastHit;
  if (!h) return TXT.tipGeneric;
  const b = S.b;
  const st = h.status && b.data.statuses[h.status];
  const who = st ? fill(TXT.killedByStatus, { who: st.name }) : h.actor ? fill(TXT.killedBy, { who: S.name(h.actor) }) : '';
  const tip = h.status === 'burn' || (!h.actor && h.dmgType === 'fire') ? TXT.tipBurn : h.status === 'bleed' ? TXT.tipBleed
    : h.ranged ? TXT.tipRanged : h.actor ? TXT.tipMelee : TXT.tipGeneric;
  return `${who} ${tip}`.trim();
}
