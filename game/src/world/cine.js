// Cinematic scene runner (docs/specs/cinematics.md): the beat graph without DOM / Three — testable in Node.
// The view (scenes/cinema.js + three/cinema.js or the comic fallback) reads the state R and drains R.out (events).
//   createCine(def, { save, env, prefs: { timer, qte }, rng, resume }) -> R   (starts at def.start or the saved progress)
//   cineTick(R, dt)                 advance timers (nothing while R.paused / R.done)
//   cineAdvance(R)                  click / Space: skip the pause before a line, the rest of a line, a hold / react / check
//   cinePick(R, id)                 choice option id (or 'silence'); false while locked (CINE_RULES.choice.lockMs)
//   cineKey(R, letter)              QTE key press ('E', 'Q'…); cineHold(R, down) — hold QTE state each tick
//   cineSkip(R)                     fast-forward to the end: choices -> silence, QTE -> ok, checks rolled
//   parseShot(s) -> { frame, a, b, move, dur, args }   lineSec(text)   checkDc(R, check)   condOk(R, cond)
//   validateCine(def) -> [error strings] (refs, silence everywhere, reachability, frames / moves / clips / emotions, cast)
//   createCineEnv(save, data) -> env { flag, rel, rep, bond, date, mrlPct, roll, name } (writes through world/*)
// Events in R.out: {k:'beat'} {k:'shot', shot, tr} {k:'line', line} {k:'fx', fx} {k:'toast', text, color}
//   {k:'rem', text} {k:'choice'} {k:'picked', id, silence} {k:'qte', ok} {k:'check', ...} {k:'end', result}.
import { CINE_RULES, SHOT_FRAMES, SHOT_MOVES, CLIPS, EMOS } from '../data/cinematics/index.js';
import { CINE_VIEW, CINE_SKILL_ALIAS } from '../data/cine-play.js';
import { t } from '../data/text/index.js';
import { cineResult } from './quests.js';

const tf = (k, v = {}) => t(k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** `<frame>:<a>[:<b>][>move[:sec][:x]]` -> parts (null for an empty shot). */
export function parseShot(s) {
  if (!s) return null;
  const [fr, mv] = String(s).split('>');
  const [frame, a = null, b = null] = fr.split(':');
  let move = null, dur = null;
  const args = [];
  if (mv) {
    const p = mv.split(':');
    move = p[0] || null;
    for (const x of p.slice(1)) { if (x !== '' && Number.isFinite(+x)) dur = +x; else args.push(x); }
  }
  return { frame, a: a || null, b: b || null, move, dur, args, src: s };
}

/** Subtitle time of a line: max(minSec, chars / cps). */
export const lineSec = (text, S = CINE_RULES.subtitle) => Math.max(S.minSec, String(text || '').length / S.cps);

const hasFlag = (R, f) => !!R.save?.flags?.[f];

/** Branch / requirement condition: {flag, notFlag, any:[..], all:[..], ctr:{name:min}}; empty -> true. */
export function condOk(R, c) {
  if (!c) return true;
  if (c.flag && !hasFlag(R, c.flag)) return false;
  if (c.notFlag && hasFlag(R, c.notFlag)) return false;
  if (c.any && !c.any.some((f) => hasFlag(R, f))) return false;
  if (c.all && !c.all.every((f) => hasFlag(R, f))) return false;
  if (c.ctr) for (const [k, min] of Object.entries(c.ctr)) if ((R.ctr[k] || 0) < min) return false;
  return true;
}

/** Check DC: base + Σ mod (ctr: value × dc, flag: dc when set); at least 2. */
export function checkDc(R, c) {
  let dc = c.dc;
  for (const m of c.mod || []) {
    if (m.ctr) dc += (R.ctr[m.ctr] || 0) * m.dc;
    else if (m.flag && hasFlag(R, m.flag)) dc += m.dc;
  }
  return Math.max(2, dc);
}

export function createCine(def, o = {}) {
  const R = {
    def, id: def.id, save: o.save || null, env: o.env || nullEnv(o.save), prefs: { timer: 'normal', qte: 'normal', ...(o.prefs || {}) },
    rng: o.rng || Math.random,
    key: null, beat: null, phase: 'init', t: 0, bt: 0, li: -1, line: null, lt: 0, lineDur: 0, wait: 0, timer: 0,
    speaking: null, cast: {}, shot: null, shotN: 0, shotT: 0, tr: 'cut', react: null, choice: null, qte: null, check: null,
    ctr: { ...(def.ctr0 || {}) }, picks: [], visited: [], out: [], grade: null, result: null, done: false, paused: false, steps: 0,
  };
  const ids = Object.keys(def.cast || {});
  ids.forEach((who, i) => { R.cast[who] = { at: [(i - (ids.length - 1) / 2) * 2, 0], face: null, anim: 'idle', emo: 'neutral', set: false }; });
  const prog = o.resume !== false && R.save?.cine?.progress;
  let start = def.start;
  if (prog && prog.id === def.id && def.beats[prog.key]) { start = prog.key; Object.assign(R.ctr, prog.ctr || {}); }
  go(R, start);
  return R;
}

const emit = (R, e) => { R.out.push(e); };

function setShot(R, shot, tr) {
  R.shot = parseShot(shot);
  R.shotN++; R.shotT = 0; R.tr = tr || 'cut';
  emit(R, { k: 'shot', shot: R.shot, tr: R.tr });
}

function go(R, key, depth = 0) {
  const b = R.def.beats[key];
  if (!b || depth > 64) { emit(R, { k: 'error', text: `cine ${R.id}: no beat ${key}` }); return finish(R, { result: 'error' }); }
  R.key = key; R.beat = b; R.bt = 0; R.visited.push(key);
  R.choice = null; R.qte = null; R.check = null; R.react = null; R.line = null; R.speaking = null;
  if (R.save) { R.save.cine ||= {}; R.save.cine.progress = { id: R.id, key, ctr: { ...R.ctr } }; }
  emit(R, { k: 'beat', key });
  if (b.on) apply(R, b.on);
  if (b.branch) {
    const hit = b.branch.find((x) => condOk(R, x.if)) || b.branch[b.branch.length - 1];
    return go(R, hit.next, depth + 1);
  }
  if (b.set) for (const [who, s] of Object.entries(b.set)) {
    const a = (R.cast[who] ||= { at: [0, 0], face: null, anim: 'idle', emo: 'neutral' });
    Object.assign(a, s, { set: true });
  }
  if (b.shot) setShot(R, b.shot, b.tr);
  for (const fx of b.fx || []) runFx(R, fx);
  R.phase = 'lines'; R.li = -1;
  nextLine(R);
}

function runFx(R, fx) {
  if (fx.k === 'grade') R.grade = fx.id === 'off' ? null : { id: fx.id, d: fx.d || 0, t: 0 };
  emit(R, { k: 'fx', fx });
}

function nextLine(R) {
  const ls = R.beat.lines || [];
  R.li++; R.line = null; R.speaking = null;
  if (R.li >= ls.length) return afterLines(R);
  R.wait = ls[R.li].p || 0; R.lt = 0;
  if (R.wait <= 0) startLine(R);
}

function startLine(R) {
  const l = R.beat.lines[R.li];
  R.line = l; R.lt = 0; R.wait = 0; R.lineDur = lineSec(l.t); R.speaking = l.w;
  const a = R.cast[l.w];
  if (a) { if (l.emo) a.emo = l.emo; if (l.anim) a.anim = l.anim; }
  emit(R, { k: 'line', line: l });
}

function afterLines(R) {
  const b = R.beat;
  if (b.react && R.phase !== 'react' && R.phase !== 'hold') {
    R.phase = 'react'; R.react = b.react; R.timer = b.react.sec || 1.2;
    const a = R.cast[b.react.who];
    if (a && b.react.emo) a.emo = b.react.emo;
    if (b.react.shot) setShot(R, b.react.shot, 'cut');
    return;
  }
  if (b.hold && R.phase !== 'hold') { R.phase = 'hold'; R.timer = b.hold; return; }
  resolve(R);
}

function resolve(R) {
  const b = R.beat;
  R.line = null; R.speaking = null;
  if (b.choice) return openChoice(R, b.choice);
  if (b.qte) return openQte(R, b.qte);
  if (b.check) return runCheck(R, b.check);
  if (b.end) return finish(R, b.end);
  if (b.next) return go(R, b.next);
  return finish(R, { result: null });
}

function openChoice(R, C) {
  const CR = CINE_RULES.choice;
  const scale = CR.timerScale[R.prefs.timer] === undefined ? 1 : CR.timerScale[R.prefs.timer];
  const base = clamp(C.sec ?? CR.defaultSec, CR.minSec, CR.maxSec);
  R.choice = { def: C, opts: C.opts.filter((x) => condOk(R, x.req)), t: 0, total: scale == null ? null : base * scale, lock: CR.lockMs / 1000, expired: false, flash: 0 };
  R.phase = 'choice';
  emit(R, { k: 'choice' });
}

function take(R, opt, silence) {
  R.picks.push({ beat: R.key, id: silence ? 'silence' : opt.id });
  emit(R, { k: 'picked', id: silence ? 'silence' : opt.id, silence: !!silence, text: opt.l });
  if (opt.on) apply(R, opt.on);
  if (R.done) return;
  go(R, opt.next);
}

export function cinePick(R, id) {
  const c = R.choice;
  if (R.phase !== 'choice' || !c || R.paused || c.expired || c.t < c.lock) return false;
  if (id === 'silence') { take(R, c.def.silence, true); return true; }
  const opt = c.opts.find((x) => x.id === id);
  if (!opt) return false;
  take(R, opt, false);
  return true;
}

function openQte(R, q) {
  const QR = CINE_RULES.qte, rule = QR[q.kind] || {};
  const easy = R.prefs.qte === 'easy', mul = easy ? QR.assistMul : 1, needMul = easy ? 0.7 : 1;
  const sec = (q.sec ?? rule.sec ?? 3) * mul;
  let need = null;
  if (q.kind === 'hold') need = (q.need ?? rule.need) * needMul;
  if (q.kind === 'mash') need = Math.max(1, Math.ceil((q.need ?? Math.round((rule.rate || 2.5) * (q.sec ?? rule.sec))) * needMul));
  R.qte = { def: q, kind: q.kind, keys: q.keys || ['E'], sec, need, t: 0, prog: 0, n: 0, idx: 0, holding: false, res: null, resT: 0 };
  R.phase = 'qte';
  if (R.prefs.qte === 'skip') qteDone(R, true);
}

function qteDone(R, ok) {
  const q = R.qte;
  if (!q || q.res) return;
  q.res = ok ? 'ok' : 'fail'; q.resT = CINE_VIEW.qteResultSec;
  emit(R, { k: 'qte', ok });
}

function qteBranch(R) {
  const q = R.qte, br = q.res === 'ok' ? q.def.ok : q.def.fail;
  R.picks.push({ beat: R.key, qte: q.res });
  if (br.on) apply(R, br.on);
  if (!R.done) go(R, br.next);
}

export function cineKey(R, k) {
  const q = R.qte;
  if (R.phase !== 'qte' || !q || q.res || R.paused) return;
  k = String(k).toUpperCase();
  if (q.kind === 'tap') { if (q.keys.includes(k)) qteDone(R, true); }
  else if (q.kind === 'mash') { if (q.keys.includes(k) && ++q.n >= q.need) qteDone(R, true); }
  else if (q.kind === 'seq') {
    if (k === q.keys[q.idx]) { if (++q.idx >= q.keys.length) qteDone(R, true); }
    else if (CINE_VIEW.qteKeys.includes(k) || q.keys.includes(k)) qteDone(R, false);
  }
}
export function cineHold(R, down) { if (R.qte) R.qte.holding = !!down; }

function runCheck(R, c) {
  const dc = checkDc(R, c);
  const r = R.env.roll(c.skills, dc, R.rng) || { ok: false, total: 0 };
  R.check = { dc, ok: !!r.ok, total: r.total, skill: r.skill || c.skills[0], natural: r.natural, who: r.who };
  R.phase = 'check'; R.timer = CINE_VIEW.checkSec;
  emit(R, { k: 'check', ...R.check });
}

function finish(R, end) {
  if (R.phase === 'end' || R.done) return;
  if (end.on) apply(R, end.on);
  for (const fx of end.fx || []) runFx(R, fx);
  R.result = end.result ?? null;
  if (R.save) {
    R.save.flags ||= {};
    R.save.flags[`cine-seen:${R.id}`] = true;
    if (R.save.cine) delete R.save.cine.progress;
  }
  // content-wave2.md §1.2: the result moves the quest stage the scene played at (c4 -> mq3-court verdict / fights)
  if (R.save?.quests) for (const x of cineResult(R.save, R.result, R.ctr, R.env?.data)) emit(R, { k: 'toast', text: x.text, color: x.color });
  const fade = (end.fx || []).find((x) => x.k === 'fade');
  R.phase = 'end'; R.timer = fade ? (fade.d || 0) + (fade.after || 0) : CINE_VIEW.endFadeSec;
  R.line = null; R.speaking = null;
  emit(R, { k: 'end', result: R.result });
}

/** Consequences `on`: {flag, ctr, rel, rep, bond, romance, mrlPct, rem}. */
function apply(R, on) {
  const E = R.env, toast = (list) => { for (const x of list || []) emit(R, { k: 'toast', text: x.text, color: x.color }); };
  if (on.flag) for (const [k, v] of Object.entries(on.flag)) E.flag(k, v);
  if (on.ctr) for (const [k, d] of Object.entries(on.ctr)) R.ctr[k] = (R.ctr[k] || 0) + d;
  if (on.rel) for (const [k, d] of Object.entries(on.rel)) toast(E.rel(k, d));
  if (on.rep) for (const [k, d] of Object.entries(on.rep)) if (d) toast(E.rep(k, d));
  if (on.bond) for (const [k, d] of Object.entries(on.bond)) toast(E.bond(k, d));
  if (on.romance) for (const [k, v] of Object.entries(on.romance)) if (v === 'date') toast(E.date(k));
  if (on.mrlPct) toast(E.mrlPct(on.mrlPct));
  if (on.rem) {
    const nm = R.def.cast?.[on.rem.who]?.name || E.name(on.rem.who);
    emit(R, { k: 'rem', who: on.rem.who, text: on.rem.t || tf('cine.remember', { name: nm }) });
  }
}

export function cineTick(R, dt) {
  if (R.done || R.paused) return;
  R.t += dt; R.bt += dt; R.shotT += dt;
  if (R.grade) R.grade.t += dt;
  switch (R.phase) {
    case 'lines':
      if (!R.line) { R.wait -= dt; if (R.wait <= 0) startLine(R); }
      else { R.lt += dt; if (R.lt >= R.lineDur + CINE_RULES.subtitle.gapSec) nextLine(R); }
      break;
    case 'react': R.timer -= dt; if (R.timer <= 0) afterLines(R); break;
    case 'hold': R.timer -= dt; if (R.timer <= 0) resolve(R); break;
    case 'choice': {
      const c = R.choice;
      if (c.expired) { c.flash -= dt; if (c.flash <= 0) take(R, c.def.silence, true); }
      else { c.t += dt; if (c.total != null && c.t >= c.total) { c.expired = true; c.flash = CINE_VIEW.silenceFlashSec; emit(R, { k: 'silence' }); } }
      break;
    }
    case 'qte': {
      const q = R.qte;
      if (q.res) { q.resT -= dt; if (q.resT <= 0) qteBranch(R); break; }
      q.t += dt;
      if (q.kind === 'hold') { q.prog = q.holding ? q.prog + dt : Math.max(0, q.prog - 2 * dt); if (q.prog >= q.need) { qteDone(R, true); break; } }
      if (q.t >= q.sec) qteDone(R, false);
      break;
    }
    case 'check': R.timer -= dt; if (R.timer <= 0) { const c = R.beat.check, br = R.check.ok ? c.ok : c.fail; if (br.on) apply(R, br.on); if (!R.done) go(R, br.next); } break;
    case 'end': R.timer -= dt; if (R.timer <= 0) R.done = true; break;
    default: break;
  }
}

export function cineAdvance(R) {
  if (R.done || R.paused) return;
  if (R.phase === 'lines') { if (!R.line) startLine(R); else nextLine(R); }
  else if (R.phase === 'react' || R.phase === 'hold' || R.phase === 'check') R.timer = 0;
}

/** Fast-forward to the end: default answers (silence), QTE succeeds, checks are rolled. → result. */
export function cineSkip(R) {
  R.paused = false;
  for (let i = 0; i < 5000 && !R.done; i++) {
    if (R.phase === 'choice') take(R, R.choice.def.silence, true);
    else if (R.phase === 'qte') { if (!R.qte.res) qteDone(R, true); R.qte.resT = 0; cineTick(R, 0); }
    else if (R.phase === 'end') R.done = true;
    else { cineAdvance(R); cineTick(R, 0); }
  }
  return R.result;
}

// ------------------------------------------------------------------------------------------------ validation

/** Graph check (acceptance §8.1). → list of errors (empty = ok). */
export function validateCine(def) {
  const err = [], B = def.beats || {}, cast = def.cast || {};
  const ref = (from, k) => { if (!B[k]) err.push(`${def.id}: ${from} -> missing beat "${k}"`); };
  const actor = (from, w) => { if (w !== 'narr' && !cast[w]) err.push(`${def.id}: ${from} unknown actor "${w}"`); };
  const shot = (from, s) => {
    const p = parseShot(s);
    if (!SHOT_FRAMES[p.frame]) err.push(`${def.id}: ${from} frame "${p.frame}"`);
    if (p.move && !SHOT_MOVES[p.move]) err.push(`${def.id}: ${from} move "${p.move}"`);
    for (const w of [p.a, p.b]) if (w) actor(from, w);
  };
  if (!B[def.start]) err.push(`${def.id}: start "${def.start}" missing`);
  const nexts = (b) => {
    const out = [];
    if (b.next) out.push(b.next);
    for (const x of b.branch || []) out.push(x.next);
    if (b.choice) { for (const o of b.choice.opts) out.push(o.next); if (b.choice.silence) out.push(b.choice.silence.next); }
    if (b.qte) out.push(b.qte.ok?.next, b.qte.fail?.next);
    if (b.check) out.push(b.check.ok?.next, b.check.fail?.next);
    return out;
  };
  for (const [k, b] of Object.entries(B)) {
    if (b.shot) shot(k, b.shot);
    if (b.react?.shot) shot(`${k}.react`, b.react.shot);
    for (const l of b.lines || []) { actor(k, l.w); if (l.emo && !EMOS.includes(l.emo)) err.push(`${def.id}: ${k} emo "${l.emo}"`); if (l.anim && !CLIPS.includes(l.anim)) err.push(`${def.id}: ${k} clip "${l.anim}"`); }
    for (const [w, s] of Object.entries(b.set || {})) {
      actor(`${k}.set`, w);
      if (s.anim && !CLIPS.includes(s.anim)) err.push(`${def.id}: ${k} clip "${s.anim}"`);
      if (s.emo && !EMOS.includes(s.emo)) err.push(`${def.id}: ${k} emo "${s.emo}"`);
    }
    if (b.choice) {
      if (!b.choice.silence) err.push(`${def.id}: ${k} choice without silence`);
      // visible options for every combination of the `req` flags: 2–4 (c3: truth-lox5 / lox5-partial exclude each other)
      const reqs = [...new Set(b.choice.opts.filter((x) => x.req?.flag).map((x) => x.req.flag))];
      const combos = reqs.length > 4 ? [null] : Array.from({ length: 2 ** reqs.length }, (_, m) => new Set(reqs.filter((_, i) => m & (1 << i))));
      const excl = { 'truth-lox5': 'lox5-partial', 'lox5-partial': 'truth-lox5' };
      for (const on of combos) {
        if (on && [...on].some((f) => on.has(excl[f]))) continue;
        const n = b.choice.opts.filter((x) => !x.req?.flag || !on || on.has(x.req.flag)).length;
        if (n < 2 || (on && n > 4)) err.push(`${def.id}: ${k} choice shows ${n} options`);
      }
    }
    if (b.qte && (!b.qte.ok || !b.qte.fail)) err.push(`${def.id}: ${k} qte needs ok and fail`);
    if (b.branch && b.branch[b.branch.length - 1].if) err.push(`${def.id}: ${k} branch without a default`);
    const ns = nexts(b);
    if (!ns.length && !b.end) err.push(`${def.id}: ${k} dead end (no next / end)`);
    for (const n of ns) ref(k, n);
  }
  const seen = new Set(), st = [def.start];
  while (st.length) { const k = st.pop(); if (seen.has(k) || !B[k]) continue; seen.add(k); st.push(...nexts(B[k])); }
  for (const k of Object.keys(B)) if (!seen.has(k)) err.push(`${def.id}: beat "${k}" unreachable`);
  return err;
}

// ------------------------------------------------------------------------------------------------ world writes

/** No world (prologue / tests): flags on the save-like object, the rest are no-ops; checks — a plain d20. */
function nullEnv(save) {
  return {
    flag(k, v) { if (!save) return; save.flags ||= {}; if (v === false || v == null) delete save.flags[k]; else save.flags[k] = v; },
    rel(npc, d) { if (save) relWrite(save, npc, d); return []; },
    rep() { return []; }, bond() { return []; }, date() { return []; }, mrlPct() { return []; },
    roll(skills, dc, rng = Math.random) { const n = 1 + Math.floor(rng() * 20); return { ok: n === 20 || (n !== 1 && n >= dc), total: n, natural: n, skill: skills[0] }; },
    name: (w) => w,
  };
}

function relWrite(save, npc, d) {
  const RL = CINE_RULES.rel;
  save.cine ||= {};
  save.cine.rel ||= {};
  save.cine.rel[npc] = clamp((save.cine.rel[npc] || 0) + d, RL.min, RL.max);
}

/**
 * Env over the world save: flags -> save.flags, rel -> save.cine.rel (+ addLoyalty ×2 for a companion), rep -> applyRep,
 * bond -> addBond, romance date -> finishDate, mrlPct -> МРЛ of the party, roll -> best member's best skill (rollCheck).
 * `world` = { applyRep, addLoyalty, partyEntry, addBond, finishDate, members, checkInfo, checkChance, rollCheck, skillName, NPCS }
 * is passed in (scenes/cinema.js) to keep this module free of the heavy world graph.
 */
export function createCineEnv(save, data, world) {
  if (!save?.hero || !world) return nullEnv(save);
  const base = nullEnv(save), W = world;
  return {
    data,
    flag: base.flag,
    rel(npc, d) {
      relWrite(save, npc, d);
      return W.partyEntry(save, npc) ? W.addLoyalty(save, npc, d * CINE_RULES.rel.companionLoyaltyMul) : [];
    },
    rep(f, d) { return W.applyRep(save, f, d).map((x) => ({ text: `${W.factionName(x.faction)} ${x.delta > 0 ? '+' : ''}${x.delta}`, color: x.delta > 0 ? 'j' : 'c' })); },
    bond: (npc, d) => W.addBond(save, npc, d),
    date: (npc) => W.finishDate(save, npc, { sum: 0, flags: [] }),
    mrlPct(pct) {
      for (const m of W.members(save, data)) {
        const e = m.isHero ? save.hero : m.p;
        e.mrl = Math.max(0, m.unit.mrl + Math.round((m.unit.maxMrl * pct) / 100));
      }
      return [];
    },
    roll(skills, dc) {
      let best = null;
      for (const m of W.members(save, data)) for (const s0 of skills) {
        const s = CINE_SKILL_ALIAS[s0] || s0;
        let info = null;
        try { info = W.checkInfo(m, s); } catch { continue; }
        const p = W.checkChance(info, dc);
        if (!best || p > best.p) best = { m, info, p, s };
      }
      if (!best) return base.roll(skills, dc);
      const r = W.rollCheck(best.m, best.info, dc);
      return { ok: r.success, total: r.total, natural: r.natural, skill: W.skillName(best.s), who: best.m.name };
    },
    name: (w) => (w === 'hero' ? save.hero.name : W.NPCS[w]?.name || w),
  };
}
