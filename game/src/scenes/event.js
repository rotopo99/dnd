// Unique events (data/world/events.js; schema in its header): trigger on a node (enter / rest), scene dialogue,
// choices with optional checks, outcome (battle first, then rewards). Fires once per game (flag `event:<id>`).
import { t } from '../data/text/index.js';
import { EVENTS, storyText, speakerName, sameLocation } from '../world/data.js';
import { repTier, tierAtLeast, normFaction } from '../world/reputation.js';
import { members, grant, journal, deed } from '../world/state.js';
import { openCheck, openGroupCheck } from '../ui/checks-ui.js';
import { createDialogueScene } from './dialogue.js';
import { startWorldBattle } from './world-battle.js';
import { saveGame } from '../save.js';
import { exodusExtend } from '../world/exodus.js';

function triggerOk(save, ev, when) {
  const tr = ev.trigger || {};
  if ((tr.when || 'enter') !== when) return false;
  if (ev.once !== false && save.flags[`event:${ev.id}`]) return false;
  if (tr.level && (save.hero.level < tr.level[0] || save.hero.level > tr.level[1])) return false;
  if (tr.rep) for (const [f, tier] of Object.entries(tr.rep)) if (!tierAtLeast(repTier(save.rep[normFaction(f)]), tier)) return false;
  if (tr.flags && !tr.flags.every((f) => save.flags[f])) return false;
  if (tr.notFlags && tr.notFlags.some((f) => save.flags[f])) return false;
  if (tr.quest && save.quests[tr.quest.id]?.state !== tr.quest.state) return false;
  return true;
}

/** Events that fire now on a location for 'enter' | 'rest' | 'travel'. Chance is rolled here. */
export function eventsFor(save, locId, when) {
  return Object.values(EVENTS).filter((ev) => sameLocation(ev.location, locId) && triggerOk(save, ev, when) && Math.random() < (ev.trigger?.chance ?? 1));
}

/** 'travel' events of a region (a travel day there). */
export function travelEvents(save, region) {
  return Object.values(EVENTS).filter((ev) => ev.region === region && triggerOk(save, ev, 'travel') && Math.random() < (ev.trigger?.chance ?? 1));
}

const lines = (key) => {
  const v = storyText(key);
  const arr = typeof v === 'string' ? [{ who: 'narrator', text: v }] : v;
  return arr.map((l) => ({ ...l, name: speakerName(l.who) }));
};

/** Run an event; then(game) is called at the end (also after a won battle). */
export function runEvent(game, ev, then) {
  const save = game.save;
  save.flags[`event:${ev.id}`] = true;
  journal(save, `${t('event.title')}: ${storyText(ev.name)}`);
  saveGame(save);
  const hero = { race: save.hero.race, cls: save.hero.cls, look: save.hero.look || null, avatar: save.hero.avatar || null, name: save.hero.name };
  const back = game.scene;
  game.setScene(createDialogueScene({
    title: storyText(ev.name), lines: lines(ev.scene), hero, wounds: true,
    onDone: (g) => { g.resume(back); choose(g); },
  }));

  function choose(g) {
    g.openModal({
      title: storyText(ev.name), width: 960, onCancel: false,
      lines: [{ text: t('event.choose'), color: 'a' }],
      options: ev.choices.map((c) => ({
        label: storyText(c.text),
        sub: c.check ? `${t(`skill.${c.check.skill}`)} · ${t('battle.dc')} ${c.check.dc}${c.check.group ? ` · ${t('check.group')}` : ''}` : null,
        run: (g2) => pick(g2, c),
      })),
    });
  }

  function pick(g, c) {
    for (const d of c.deeds || []) for (const x of deed(save, d, false)) g.toast(x.text, x.color);
    if (!c.check) return outcome(g, c.success);
    const opener = c.check.group ? openGroupCheck : openCheck;
    opener(g, { title: storyText(ev.name), skill: c.check.skill, dc: c.check.dc, members: members(save, g.data), memoKey: `event:${ev.id}:${c.id}`,
      onDone: (g2, ok) => outcome(g2, ok ? c.success : c.fail || c.success) });
  }

  function outcome(g, o) {
    const rest = (g2) => {
      for (const x of grant(save, o, g2.data)) g2.toast(x.text, x.color);
      // third-exodus.md: «Exodus +N days» bonus, once per event
      if (o.exodus?.ext) for (const x of exodusExtend(save, `ev:${ev.id}`, o.exodus.ext)) g2.toast(x.text, x.color);
      saveGame(save);
      if (o.text) {
        const ls = lines(o.text);
        g2.setScene(createDialogueScene({ title: storyText(ev.name), lines: ls, hero, wounds: true, onDone: (g3) => then(g3) }));
      } else then(g2);
    };
    if (o.battle) {
      // battle: { enemies } (party events) | { encounter } (density events: an id from ENCOUNTERS)
      startWorldBattle(g, { encounter: o.battle.encounter, enemies: o.battle.enemies, allies: o.battle.allies || [], map: o.battle.map, title: storyText(ev.name), onWin: rest });
    } else rest(g);
  }
}
