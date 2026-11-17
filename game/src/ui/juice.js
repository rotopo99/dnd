// Battle juice (docs/research/premium-look.md items 1, 2, 9): hit-stop, camera shake, camera accent of big abilities,
// floating numbers with a «pop». Visual only: the rules, the AI and input never wait for it (co-op determinism) —
// the battle scene feeds events in and scales only its display clock (S.vtime / 2D animation dt) by juiceTick().
// «Снизить движение» — no hit-stop, shake, accent or slow motion (numbers stay, without the scale pop).
//   createJuice()                       -> J (per battle)
//   juiceEvent(J, e, b, reduceMotion)   battle event -> hit-stop / shake / accent
//   juiceTick(J, dt)                    -> display time multiplier (0 during hit-stop, slow motion < 1, else 1)
//   juiceShake(J)                       -> {x, y} px offset (2D; 3D scales by JUICE.m3d · ppm)
//   juiceZoom(J)                        -> {z, x, y} zoom factor + focus cell (x, y) or null
//   damagePop(e, b)                     -> [{text, color, kind}] popups of a damage / heal / shield event
//   drawPop(ctx, p, x, y, reduceMotion) one floating number (p.t — age s, p.kind, p.text, p.color)
import { JUICE } from '../data/juice.js';
import { t } from '../data/text/index.js';
import { C, headFont } from './draw.js';

export function createJuice() {
  return { stop: 0, clock: 0, shake: null, accent: null, slow: 0 };
}

function shake(J, kind) {
  const [amp, dur] = JUICE.shake[kind] || JUICE.shake.small;
  if (J.shake && J.shake.amp * (1 - J.shake.t / J.shake.dur) >= amp) return;
  J.shake = { amp, dur, t: 0, ph: Math.random() * 6.28 };
}
const stop = (J, frames) => { J.stop = Math.max(J.stop, frames / JUICE.fps); };

/** Battle event -> juice. b — the battle (units by id), rm — «Снизить движение». */
export function juiceEvent(J, e, b, rm) {
  if (!J || rm) return;
  const T = e.target ? b.byId[e.target] : null;
  switch (e.type) {
    case 'damage': {
      if (!(e.amount > 0)) break;
      const heavy = T && T.maxHp && e.resource !== 'mrl' && e.amount >= T.maxHp * JUICE.heavyShare;
      if (e.crit) { stop(J, JUICE.hitStop.crit); shake(J, 'crit'); }
      else if (heavy) { stop(J, JUICE.hitStop.heavy); shake(J, 'heavy'); }
      break;
    }
    case 'death': case 'broken': case 'down': stop(J, JUICE.hitStop.kill); shake(J, 'kill'); break;
    case 'objectBreak': case 'chestTrap': shake(J, 'small'); break;
    case 'surfaceCombo': if (e.result === 'explosion' || e.result === 'blaze') shake(J, 'blast'); break;
    case 'geoCollapse': shake(J, 'collapse'); break;
    case 'phase': shake(J, 'phase'); break;
    case 'ability': {
      const A = e.actor ? b.byId[e.actor] : null;
      const ab = A?.abilities?.find?.((a) => a.id === e.ability);
      const big = !!(e.overcast || ab?.area || (e.cost || 0) >= JUICE.accent.bigCost);
      if (!big || !A) break;
      const at = e.tile || (T ? { x: T.x, y: T.y } : { x: A.x, y: A.y });
      J.accent = { t: 0, x: (A.x + at.x) / 2, y: (A.y + at.y) / 2 };
      J.slow = JUICE.accent.slow;
      break;
    }
    default: break;
  }
}

/** Advance the juice clocks by real dt; -> multiplier for the display clock. */
export function juiceTick(J, dt) {
  if (!J) return 1;
  J.clock += dt;
  if (J.shake && (J.shake.t += dt) >= J.shake.dur) J.shake = null;
  if (J.accent) { const A = JUICE.accent; if ((J.accent.t += dt) >= A.in + A.hold + A.out) J.accent = null; }
  if (J.stop > 0) { J.stop -= dt; return 0; }
  if (J.slow > 0) { J.slow -= dt; return JUICE.accent.slowK; }
  return 1;
}

export function juiceShake(J) {
  const s = J?.shake;
  if (!s) return { x: 0, y: 0 };
  const k = s.amp * (1 - s.t / s.dur), [fx, fy] = JUICE.shakeHz;
  return { x: k * Math.sin(J.clock * fx * 6.283 + s.ph), y: k * Math.sin(J.clock * fy * 6.283 + s.ph * 1.7) };
}

const easeOutCubic = (x) => 1 - (1 - x) ** 3;
export function juiceZoom(J) {
  const a = J?.accent;
  if (!a) return null;
  const A = JUICE.accent, t0 = a.t;
  const k = t0 < A.in ? easeOutCubic(t0 / A.in) : t0 < A.in + A.hold ? 1 : 1 - easeOutCubic((t0 - A.in - A.hold) / A.out);
  return { z: 1 + (A.zoom - 1) * k, x: a.x, y: a.y };
}

// ---------------------------------------------------------------- floating numbers
const col = (k) => C[k] || k;
/** Popups of a damage / heal / shield event (battle.js handleEvent). */
export function damagePop(e) {
  const K = JUICE.color;
  if (e.type === 'heal') return [{ text: `+${e.amount}`, color: col(e.resource === 'mrl' ? K.healMrl : K.heal), kind: 'heal' }];
  if (e.type === 'shield') return [{ text: t('battle.shieldGain').replace('{n}', e.value), color: col(K.tmp), kind: 'tmp' }];
  const out = [];
  if (e.amount > 0) {
    const c = e.resource === 'mrl' ? K.mrl : JUICE.dmgColor[e.dmgType] || K.hp;
    out.push({ text: `−${e.amount}`, color: col(c), kind: e.crit ? 'crit' : 'dmg' });
  } else if (!e.absorbed) out.push({ text: t('battle.block'), color: col(K.block), kind: 'text' });
  if (e.absorbed) out.push({ text: e.amount > 0 ? `◊−${e.absorbed}` : `${t('battle.block')} ◊−${e.absorbed}`, color: col(K.tmp), kind: 'tmp' });
  return out;
}

const backOut = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };
/** One floating number at (x, y) = anchor over the unit (centre, top). */
export function drawPop(ctx, p, x, y, rm = false) {
  const P = JUICE.pop, age = p.t;
  if (age < 0) return;
  const num = p.kind === 'dmg' || p.kind === 'crit' || p.kind === 'heal';
  const px = p.kind === 'crit' ? P.critPx : num ? P.px : P.textPx;
  const sc = rm ? 1 : age < P.popT ? P.from + (1 - P.from) * backOut(age / P.popT) : 1;
  const dy = P.drift * easeOutCubic(Math.min(1, age / P.driftT));
  ctx.save();
  ctx.globalAlpha = age > P.life - P.fadeT ? Math.max(0, (P.life - age) / P.fadeT) : 1;
  ctx.translate(Math.round(x), Math.round(y - 6 - dy));
  if (sc !== 1) ctx.scale(sc, sc);
  ctx.font = num ? headFont(px) : `bold ${px}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  if (p.kind === 'crit') { // crit: thick dark outline + a thin bright rim of its colour
    ctx.lineWidth = 6; ctx.strokeStyle = C['0']; ctx.strokeText(p.text, 0, 0);
    ctx.lineWidth = 2; ctx.strokeStyle = C['5']; ctx.strokeText(p.text, 0, 0);
  } else { ctx.lineWidth = 4; ctx.strokeStyle = C['0']; ctx.strokeText(p.text, 0, 0); }
  ctx.fillStyle = p.color;
  ctx.fillText(p.text, 0, 0);
  ctx.restore();
}
