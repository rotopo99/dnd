// Road / camp encounters (world.md §2, travel.js ENCOUNTER_TABLES): battle (with the ambush check),
// event with a check, trader, rumor, NPC. Shared by the world map (travel days) and field camps (location.js).
// runEncounter(game, e, regionId, backScene, resume) — resume() is called when the encounter is over.
import { t } from '../data/text/index.js';
import { NPCS } from '../data/npcs.js';
import { openCheck, openGroupCheck } from '../ui/checks-ui.js';
import { LOCATIONS, SHOP_STOCK, AMBUSH, encounterName, npcGreeting } from '../world/data.js';
import { repTier, factionName, normFaction } from '../world/reputation.js';
import { members, grant, journal, hasFlagInParty, openHidden } from '../world/state.js';
import { startWorldBattle } from './world-battle.js';
import { openShop } from './shop.js';
import { saveGame } from '../save.js';

const save = (game) => game.save;

export function runEncounter(game, e, reg, back, resume) {
  const sv = save(game);
  const ms = members(sv, game.data);
  const card = (title, ls, then) => game.openModal({ title, lines: ls, onCancel: false, options: [{ label: t('battle.continue'), run: then }] });
  const outcomeOf = (g, r, ok) => {
    if (!r) return resume();
    const fin = (g2) => {
      for (const x of grant(sv, { xp: r.xp, credits: r.credits, rep: r.rep, items: r.items, flag: r.flag, hp: r.hp, mrl: r.mrl }, g2.data)) g2.toast(x.text, x.color);
      saveGame(sv);
      card(ok ? t('check.success') : t('check.fail'), [{ text: r.text || '', color: ok ? 'j' : 'c' }], () => resume());
    };
    if (r.battle) startWorldBattle(g, { encounter: r.battle, onWin: (g2) => { g2.resume(back); fin(g2); } });
    else fin(g);
  };
  if (e.kind === 'battle') {
    const fight = (ambush) => startWorldBattle(game, {
      encounter: e.encounter, title: `${t('map.road')}: ${encounterName(e.encounter)}`, faction: e.faction, ambush,
      onWin: (g) => { g.resume(back); resume(); },
    });
    const go = () => {
      if (hasFlagInParty(sv, game.data, 'no-ambush')) { game.toast(t('map.noAmbush'), 'j'); fight(false); return; }
      openGroupCheck(game, { title: t('map.ambushCheck'), lines: [{ text: t('map.ambushText') }], skill: AMBUSH.skill, dc: AMBUSH.dc, members: ms, memoKey: `ambush:${sv.day}:${reg}`,
        onDone: (g, ok) => { if (!ok) g.toast(t('map.ambush'), 'c'); fight(!ok); } });
    };
    card(t('map.encounterBattle'), [{ text: encounterName(e.encounter), color: 'c' }, ...(e.faction ? [{ text: factionName(e.faction), color: '4' }] : [])], go);
    return;
  }
  if (e.kind === 'event') {
    const c = e.check;
    const opener = c.group ? openGroupCheck : openCheck;
    opener(game, { title: t('map.event'), lines: [{ text: e.text }], skill: c.skill, skills: c.skills, dc: c.dc, members: ms, memoKey: `ev:${e.id}:${sv.day}`,
      onDone: (g, ok) => outcomeOf(g, ok ? e.success : e.fail, ok) });
    return;
  }
  if (e.kind === 'trader') {
    openShop(game, { title: e.friendly ? `${t('map.trader')} (${factionName(e.friendly)})` : t('map.trader'), stock: e.stock || SHOP_STOCK,
      tier: e.friendly ? repTier(sv.rep[e.friendly]) : 'neutral', faction: e.friendly || null, onClose: () => resume() });
    return;
  }
  if (e.kind === 'rumor') {
    const pool = Object.values(LOCATIONS).filter((l) => l.region === reg && !sv.discovered.includes(l.id) && !l.requires);
    const l = pool[Math.floor(Math.random() * pool.length)];
    if (l) { openHidden(sv, l.id); journal(sv, `${t('loc.rumorFound')}: ${l.name}`); saveGame(sv); }
    card(t('map.rumor'), [{ text: l ? `${t('loc.rumorFound')}: ${l.name}` : t('loc.noRumor') }], () => resume());
    return;
  }
  if (e.kind === 'npc') {
    const n = NPCS[e.npc];
    const g0 = npcGreeting(n, repTier(sv.rep[normFaction(n.faction)]));
    card(`${t('map.stranger')}: ${n.name}`, [{ text: n.role || '', color: '4' }, { text: `«${g0.text}»` }], () => resume());
    return;
  }
  resume();
}

