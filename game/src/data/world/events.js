// Unique events of the tabletop party (Куксиус, Виктор, Лиза, Артём, Репа).
// Human decision (docs/GDD.md, «Ответы человека по миру», п. 2): party members appear ONLY in their own event,
// one each, and are never permanently recruited. Script: docs/story/party-events.md. Texts: text/party-events.js.
//
// docs/specs/world.md has no event schema yet — proposed here (owner of world/* is game-designer; this file — writer):
//
// EVENTS[id] = {
//   id, name: textKey, npc: id from npcs.js (cameo),
//   region: 'harmony' | 'villages' | 'agrozone' | 'corruption'   (world.md, wave v1.0)
//   location: node id from world.md §1,
//   trigger: {
//     when: 'enter' | 'rest' | 'travel',        // entering the node / resting there / travel day in the region
//     level?: [min, max],                       // hero level, inclusive
//     rep?: { faction: tier },                  // minimal tier: 'hostile'|'suspicious'|'neutral'|'friendly'|'ally'
//     flags?: [...], notFlags?: [...],          // save.flags
//     quest?: { id, state: 'active' | 'done' },
//     chance?: 0..1,                            // default 1
//   },
//   once: true,                                 // fires once per game; sets flag `event:<id>`
//   scene: textKey,                             // [{ who, text }]
//   choices: [{
//     id, text: textKey,
//     check?: { skill, dc, group?: bool },      // skill ids — talents.js SKILLS; rules — world.md §5
//     deeds?: [...],                            // companion approval tags, world.md §4
//     success: Outcome, fail?: Outcome,          // no check → success applies
//   }],
// }
// Outcome = { text: textKey, battle?: { enemies: [...], allies?: [...], map?: id }, // battle first, then the rest on win
//             xp?, credits?, items?: [{ item, n }], talent?: id (talents.js), rep?: { faction: Δ },
//             flags?: [...], terminal?: { id, state }, deeds?: [...] }
// Battle lost → normal death rules (Cyberspace). Choice availability is not gated: anyone can try anything.
//
// New unit ids (need stat blocks in enemies.js, like 'npc-gans'; temporary ally for one battle, NOT a recruit):
//   'spirit-victor'    — дух Виктора в Киберспейсе (tags: ['digital']), Забивной ур. 3, Путь Железного Титана (танк), ai: 'melee'.
//                        Канон (ответ автора 2026-11-04): Виктор погиб в истории Куксиуса, живым не встречается.
//   'npc-party-artyom' — человек, Рейнджер ур. 3, Путь Охотника (дальний бой, range 20), ai: 'ranged'

export const EVENTS = {
  'ev-kuksius': {
    id: 'ev-kuksius', name: 'ev.kuksius.title', npc: 'kuksius',
    region: 'corruption', location: 'cc-dead-streets',
    trigger: { when: 'enter', level: [3, 5], quest: { id: 'mq-exodus', state: 'active' } },
    once: true,
    scene: 'ev.kuksius.scene',
    choices: [
      {
        id: 'cover', text: 'ev.kuksius.c.cover', deeds: ['honor'],
        success: {
          text: 'ev.kuksius.r.cover',
          battle: { enemies: ['cultist-5', 'cultist', 'cultist', 'cultist-gunner'] },
          xp: 400, talent: 'tech-archaeologist', items: [{ item: 'dawn-schematic', n: 1 }],
          terminal: { id: 'cc-terminal-2', state: 'ours' }, rep: { cult: -10, technikums: 5 },
          flags: ['kuksius-helped'],
        },
      },
      {
        id: 'hack', text: 'ev.kuksius.c.hack', check: { skill: 'hacking', dc: 15 }, deeds: ['honor'],
        success: {
          text: 'ev.kuksius.r.hack.ok',
          xp: 450, talent: 'tech-archaeologist', terminal: { id: 'cc-terminal-2', state: 'ours' },
          flags: ['kuksius-helped', 'kuksius-mark'],
        },
        fail: {
          text: 'ev.kuksius.r.hack.fail',
          battle: { enemies: ['cultist-5', 'cultist-gunner-5', 'cultist', 'cultist'] },
          xp: 400, terminal: { id: 'cc-terminal-2', state: 'dead' }, flags: ['kuksius-helped'],
        },
      },
      {
        id: 'betray', text: 'ev.kuksius.c.betray', deeds: ['cult-deal', 'lie'],
        success: {
          text: 'ev.kuksius.r.betray',
          credits: 60, rep: { cult: 10, technikums: -10 }, flags: ['kuksius-betrayed'],
        },
      },
    ],
  },

  // Viktor died in Kuksius's story (canon answer 2026-11-04). Event at his grave near Kreml; his soul is in Cyberspace.
  'ev-victor': {
    id: 'ev-victor', name: 'ev.victor.title', npc: 'party-victor',
    region: 'warprom', location: 'mogila-viktora',
    trigger: { when: 'enter', level: [3, 5] },
    once: true,
    scene: 'ev.victor.scene',
    choices: [
      {
        id: 'free', text: 'ev.victor.c.free', deeds: ['honor', 'help-weak'],
        success: {
          text: 'ev.victor.r.free',
          battle: { encounter: 'w-cyberspace', allies: ['spirit-victor'] },
          xp: 400, talent: 'old-school', rep: { cult: -10 }, flags: ['victor-soul-freed'],
        },
      },
      {
        id: 'release', text: 'ev.victor.c.release', check: { skill: 'meditation', dc: 15 }, deeds: ['mercy'],
        success: {
          text: 'ev.victor.r.release',
          xp: 400, talent: 'ancestors-blessing', flags: ['victor-soul-freed'],
        },
        fail: {
          text: 'ev.victor.r.release.fail',
          battle: { encounter: 'w-cyberspace', allies: ['spirit-victor'] },
          xp: 400, flags: ['victor-soul-freed'],
        },
      },
      {
        id: 'shard', text: 'ev.victor.c.shard', deeds: ['greed'],
        success: { text: 'ev.victor.r.shard', items: [{ item: 'terminal-shard', n: 1 }], flags: ['victor-soul-left'] },
      },
    ],
  },

  'ev-liza': {
    id: 'ev-liza', name: 'ev.liza.title', npc: 'liza',
    region: 'villages', location: 'dacha-hatch',
    trigger: { when: 'enter', level: [1, 5] },
    once: true,
    scene: 'ev.liza.scene',
    choices: [
      {
        id: 'pick', text: 'ev.liza.c.pick', check: { skill: 'lockpicking', dc: 14 }, deeds: ['help-weak'],
        success: {
          text: 'ev.liza.r.open',
          xp: 150, talent: 'lock-no-barrier', rep: { neutralVillages: 5 }, flags: ['liza-freed'],
        },
        fail: {
          text: 'ev.liza.r.fail',
          battle: { enemies: ['crawler', 'crawler'], map: 'hatch-1' },
          xp: 150, rep: { neutralVillages: 5 }, flags: ['liza-freed'],
        },
      },
      {
        id: 'guide', text: 'ev.liza.c.guide', check: { skill: 'tech', dc: 12 }, deeds: ['help-weak'],
        success: {
          text: 'ev.liza.r.open',
          xp: 150, talent: 'lock-no-barrier', rep: { neutralVillages: 5 }, flags: ['liza-freed', 'hidden-routes'],
        },
        fail: {
          text: 'ev.liza.r.fail',
          battle: { enemies: ['crawler', 'crawler'], map: 'hatch-1' },
          xp: 150, flags: ['liza-freed'],
        },
      },
      {
        id: 'loot', text: 'ev.liza.c.loot', deeds: ['greed', 'lie'],
        success: {
          text: 'ev.liza.r.loot',
          credits: 80, items: [{ item: 'lockpick-set', n: 1 }], rep: { neutralVillages: -5 }, flags: ['liza-abandoned'],
        },
      },
    ],
  },

  'ev-artyom': {
    id: 'ev-artyom', name: 'ev.artyom.title', npc: 'artyom',
    region: 'villages', location: 'beacon-2',
    trigger: { when: 'enter', level: [2, 5], quest: { id: 'mq-beacons', state: 'active' }, notFlags: ['beacon-2-off'] },
    once: true,
    scene: 'ev.artyom.scene',
    choices: [
      {
        id: 'bait', text: 'ev.artyom.c.bait', deeds: ['honor'],
        success: {
          text: 'ev.artyom.r.bait',
          battle: { enemies: ['cringe-jester', 'cringe-jester', 'cringe-jester'], allies: ['npc-party-artyom'] },
          xp: 300, talent: 'any-gun-shot', rep: { neutralVillages: 10 }, flags: ['beacon-2-off', 'artyom-helped'],
        },
      },
      {
        id: 'beacon', text: 'ev.artyom.c.beacon', check: { skill: 'tech', dc: 14 },
        success: {
          text: 'ev.artyom.r.beacon.ok',
          xp: 300, items: [{ item: 'artyom-scope', n: 1 }], rep: { neutralVillages: 10 },
          flags: ['beacon-2-off', 'artyom-helped'],
        },
        fail: {
          text: 'ev.artyom.r.beacon.fail',
          battle: { enemies: ['cringe-jester', 'cringe-jester', 'cringe-jester'], allies: ['npc-party-artyom'] },
          xp: 300, rep: { neutralVillages: 10 }, flags: ['beacon-2-off', 'artyom-helped'],
        },
      },
      {
        id: 'talk', text: 'ev.artyom.c.talk',
        success: {
          text: 'ev.artyom.r.talk',
          xp: 100, flags: ['party-rumors', 'artyom-helped'],   // party-rumors: Seer's tent gives hints to the other 4 events
        },
      },
    ],
  },

  'ev-repa': {
    id: 'ev-repa', name: 'ev.repa.title', npc: 'repa',
    region: 'harmony', location: 'harmony-workshop',
    trigger: { when: 'enter', level: [2, 5], flags: ['prologue-done'], rep: { technikums: 'friendly' } },
    once: true,
    scene: 'ev.repa.scene',
    choices: [
      {
        id: 'pay', text: 'ev.repa.c.pay', deeds: ['help-weak'],
        success: {
          text: 'ev.repa.r.restore',
          credits: -100, xp: 200, talent: 'knee-repair', flags: ['repa-memory', 'repa-signal-hook'],
        },
      },
      {
        id: 'copy', text: 'ev.repa.c.copy', check: { skill: 'tech', dc: 16 }, deeds: ['help-weak'],
        success: {
          text: 'ev.repa.r.restore',
          xp: 300, talent: 'knee-repair', rep: { technikums: 5 }, flags: ['repa-memory', 'repa-signal-hook', 'nikola-protez-mind'],
        },
        fail: {
          text: 'ev.repa.r.copy.fail',
          xp: 100, rep: { technikums: -5 }, flags: ['repa-block-lost'],
        },
      },
      {
        id: 'nikola', text: 'ev.repa.c.nikola', deeds: ['greed'],
        success: {
          text: 'ev.repa.r.nikola',
          xp: 100, rep: { technikums: 10 }, flags: ['nikola-protez-mind', 'repa-block-lost'],
        },
      },
    ],
  },
};
