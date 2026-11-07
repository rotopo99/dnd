// Battle event -> log line (array of [text, colour] segments) and event -> sound.
// Event list: docs/CODEMAP.md (combat.js). Colours: STYLE.md (ЗДР c, МРЛ n/f, heal j, shield f, proxy a).
import { ITEMS } from '../data/index.js';
import { t } from '../data/text/index.js';
import { C } from './draw.js';
import { play } from '../audio/sfx.js';

const sign = (n) => (n >= 0 ? `+${n}` : `−${-n}`);
const resName = (r) => t(`res.${r}`);
const dmgName = (d) => (d ? t(`dmg.${d}`) : '');

function rollStr(r) {
  if (!r) return '';
  const dice = r.rolls && r.rolls.length > 1 ? `[${r.rolls.join('|')}]` : `[${r.natural}]`;
  return `d20${dice} ${sign(r.bonus ?? r.total - r.natural)} = ${r.total}`;
}

/** Team colour key of a unit for names in the log. */
export function teamColor(u) {
  if (!u) return C['4'];
  if (u.team === 'heroes') return u.kind === 'hero' ? C.h : C.j;
  if (u.team === 'enemies') return C.c;
  return C.a;
}

/**
 * S: { b, name(id) } — battle and display-name lookup.
 * Returns an array of segments or null (event not logged).
 */
const itemName = (id) => ITEMS[id]?.name || id;

export function formatEvent(S, e) {
  const b = S.b;
  const A = e.actor ? b.byId[e.actor] : null;
  const T = e.target ? b.byId[e.target] : null;
  const a = (u) => [S.name(u ? u.id : null), teamColor(u)];
  const g = (s) => [s, C['4']];
  const w = (s) => [s, C['5']];
  switch (e.type) {
    case 'roundStart': return [[`— ${t('battle.roundN')} ${e.round} —`, C['3']]];
    case 'turnStart': return [g(`${t('battle.turnOf')}: `), a(A)];
    case 'attack': {
      const res = e.crit ? [t('battle.crit'), C.a] : e.hit ? [t('battle.hit'), C['5']] : [t('battle.miss'), C['4']];
      const mode = e.roll && e.roll.mode === 'adv' ? ` (${t('battle.advantage')})` : e.roll && e.roll.mode === 'dis' ? ` (${t('battle.disadvantage')})` : '';
      return [a(A), g(' → '), a(T), g(`: ${rollStr(e.roll)}${mode} ${t('battle.vs')} ${t('res.kb')} ${e.kb} — `), res];
    }
    case 'save': {
      const r = e.roll || {};
      return [a(T), g(`: ${t('battle.save')} ${t(`stat.${e.stat}`)} ${rollStr(r)} ${t('battle.vs')} ${t('battle.dc')} ${e.dc} — `),
        e.success ? [t('battle.saveSuccessShort'), C.j] : [t('battle.saveFailShort'), C.c]];
    }
    case 'damage': {
      const mrl = e.resource === 'mrl';
      const col = mrl ? C.n : e.dmgType === 'proxy' ? C.a : C.c;
      const out = [a(T), g(': '), [`−${e.amount} ${resName(e.resource)}`, col]];
      const notes = [dmgName(e.dmgType)];
      if (e.resist === 'resist') notes.push(t('battle.resisted'));
      if (e.resist === 'vuln') notes.push(t('battle.vulnerable'));
      if (e.resist === 'immune') notes.push(t('battle.immune'));
      if (e.absorbed) notes.push(`${t('battle.shield').toLowerCase()} −${e.absorbed}`);
      if (e.crit) notes.push(t('battle.crit'));
      out.push(g(` (${notes.filter(Boolean).join(', ')})`));
      return out;
    }
    case 'heal': return [a(T), g(': '), [`+${e.amount} ${resName(e.resource)}`, e.resource === 'mrl' ? C.f : C.j]];
    case 'shield': return [a(T), g(': '), [`${t('battle.shield')} ${e.value}`, C.f]];
    case 'shieldBreak': return [a(T), g(': '), [`${t('battle.shield')} ✕`, C.f]];
    case 'status': {
      const d = b.data.statuses[e.id];
      return [a(T), g(': '), [`${d ? d.name : e.id}${e.turns ? ` (${e.turns})` : ''}`, d && d.kind === 'buff' ? C.j : C.a]];
    }
    case 'statusEnd': {
      const d = b.data.statuses[e.id];
      return [a(T), g(`: ${d ? d.name : e.id} — ${t('battle.statusEnd')}`)];
    }
    case 'statusImmune': {
      const d = b.data.statuses[e.id];
      return [a(T), g(`: ${t('battle.immuneTo')} «${d ? d.name : e.id}»`)];
    }
    case 'buff': return [a(T), g(': '), [`${sign(e.value)} ${t(`buff.${e.stat}`)} (${e.turns})`, C.j]];
    case 'nadlom': return [a(T), g(': '), [t('state.strain'), C.n]];
    case 'breakdown': {
      const r = e.roll != null ? ` [d20: ${e.roll}]` : '';
      if (e.result === 'heartbreak') return [a(T), g(': '), [`${t('state.breakdown')}${r} — ${t('state.heartbreak')} (−${e.amount} ${resName('hp')})`, C.n]];
      if (e.result === 'lostControl') return [a(T), g(': '), [`${t('state.breakdown')}${r} — ${t('state.lostControl')}`, C.n]];
      return [a(T), g(': '), [`${t('state.breakdown')}${r}`, C.n]];
    }
    case 'broken': return [a(T), g(': '), [t('battle.broken'), C.n]];
    case 'down': return [a(T), g(': '), [t('state.unconscious'), C.c]];
    case 'death': return [a(T), g(': '), [t('state.dead'), C.c]];
    case 'ability': return [a(A), g(` ${t('battle.uses_')} `), [`«${e.name}»`, C.h], g(e.cost ? ` (−${e.cost} ${t('res.enr')})` : '')];
    case 'dash': return [a(A), g(`: ${t('battle.dashes')}`)];
    case 'disengage': return [a(A), g(`: ${t('battle.disengages')}`)];
    case 'opportunity': return [a(A), g(`: ${t('battle.opportunity')} → `), a(T)];
    case 'reaction': return [a(A), g(`: ${t('battle.reactionEv')}`)];
    case 'hazard': return [a(T), g(': '), e.avoided ? [t('battle.hazardAvoided'), C.j] : [t('battle.hazard'), C.e]];
    case 'push': return e.tiles ? [a(T), g(`: ${t('battle.pushed')} (${e.tiles})`)] : null;
    case 'teleport': return [a(A), g(`: ${t('battle.teleport')}`)];
    case 'summon': return [a(A), g(` ${t('battle.summons')} `), a(T)];
    case 'unsummon': return [a(T), g(`: ${t('battle.unsummon')}`)];
    case 'skipTurn': return [a(A), g(`: ${t('battle.skipTurn')}`)];
    case 'standUp': return [a(A), g(`: ${t('battle.standUp')}`)];
    case 'stabilize': return [a(T), g(`: ${t('battle.stabilize')}`)];
    case 'deathSave': return [a(T), g(`: ${t('battle.deathSave')}`)];
    case 'downTick': return [a(A), g(`: ${t('battle.downTick')} (${e.turns}/3)`)];
    case 'bigHit': return [a(T), g(`: ${t('battle.bigHit')} — `), e.success ? [t('battle.saveSuccessShort'), C.j] : [t('state.stunned'), C.a]];
    case 'mark': return [a(T), g(': '), [t('battle.mark'), C.a]];
    case 'cleanse': return [a(T), g(': '), [t('battle.cleanse'), C.j]];
    case 'overcast': return [a(A), g(': '), [`${t('battle.overcast')} — d20 ${e.roll}${e.row ? `: ${e.row}` : ''}`, C.a]];
    case 'hallucination': return [a(A), g(`: ${t('battle.hallucination')} → `), a(T)];
    case 'lostControlTurn': return [a(A), g(': '), [t('battle.lostControlTurn'), C.n]];
    case 'extraAction': return [a(A), g(`: ${t('battle.extraAction')}`)];
    case 'endStatus': {
      const d = b.data.statuses[e.id];
      return [a(A), g(`: ${t('battle.endStatus')} «${d ? d.name : e.id}»`)];
    }
    // v3: burst fire, items, traps, phobias
    case 'burst': return [a(A), g(': '), [`${t('battle.burst')} ×${e.shots}${e.recoil ? ` (${t('item.recoil')} ${e.recoil})` : ''}`, C.a], g(' → '), a(T)];
    case 'burstEnd': return [a(A), g(': '), [`${t('battle.burstHits')} ${e.hits}/${e.shots}`, e.hits ? C['5'] : C['4']]];
    case 'useItem': return [a(A), g(` ${t('battle.usesItem')} `), [`«${itemName(e.item)}»`, C.h]];
    case 'trapPlaced': return [a(A), g(': '), [`${t('battle.trapPlaced')} «${itemName(e.item)}»`, C.a]];
    case 'trapTriggered': return [a(T), g(': '), [`${t('battle.trapTriggered')} «${itemName(e.item)}»`, C.c]];
    case 'throw': return [a(A), g(` ${t('battle.throws')} `), [`«${itemName(e.item)}»`, C.h], g(' → '), a(T)];
    case 'pickUp': return [a(A), g(`: ${t('battle.pickUp')}`)];
    case 'zone': return [g(`${t('battle.zone')}: ${e.kind || ''}`)];
    case 'overheat': return [a(A), g(': '), [t('battle.overheat'), C.c]];
    case 'withdrawalPending': return [a(T), g(': '), [t('battle.withdrawalSoon'), C.f]];
    case 'phobia': return [a(T), g(': '), [`${t('battle.phobia')} (${t(`phobia.${e.trigger}`)})`, C.n]];
    case 'outOfRange': return [a(A), g(`: ${t('battle.outOfRangeEv')}`)];
    case 'victory': return [w(e.winner === 'heroes' ? t('battle.victory') : t('battle.defeat'))];
    default: return null;
  }
}

/** Sound for an event (no-op when audio is locked). */
export function eventSound(S, e) {
  const b = S.b;
  switch (e.type) {
    case 'turnStart': {
      const u = b.byId[e.actor];
      if (u && u.kind === 'hero' && u.control !== 'ai') play('turnStart');
      else if (u && u.team === 'enemies' && S.lastTeam !== 'enemies') play('enemyTurn');
      if (u) S.lastTeam = u.team;
      break;
    }
    case 'attack': if (!e.hit) play('miss'); break;
    case 'damage':
      if (e.amount > 0) play(e.crit ? 'crit' : 'hit', { dmgType: e.dmgType });
      else if (e.absorbed) play('shieldBlock');
      break;
    case 'heal': play('heal'); break;
    case 'buff': play('buff'); break;
    case 'shield': play('buff'); break;
    case 'status': {
      const d = b.data.statuses[e.id];
      play(d && d.kind === 'buff' ? 'buff' : 'debuff');
      break;
    }
    case 'nadlom': play('cringe'); break;
    case 'breakdown': play('breakdown'); break;
    case 'down': play('knockout'); break;
    case 'death': play('death'); break;
    case 'broken': play('debuff'); break;
    case 'summon': play('summon'); break;
    case 'overcast': play('overcast'); break;
    case 'trapTriggered': play('hit'); break;
    case 'victory': play(e.winner === 'heroes' ? 'victory' : 'defeat'); break;
    default: break;
  }
}
