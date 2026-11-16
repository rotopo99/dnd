// Numbers of the hand-made map checker (docs/specs/level-design.md §7.1, §7.3). world/handmade-check.js, tools/validate-maps.mjs.
export const LEVEL_RULES = {
  scale: 1.5, // metres per ASCII cell (default; a map may set its own `scale`)
  poiGap: 20, // metres of walking along a path without a point of interest (spec: 15–20, longer is an error)
  poiNear: 2, // a point of interest counts for path cells within this many cells
  minLevels: 3, // distinct heights on a roam map (0 / 0.5 / 1.0 m …)
  minPaths: 3, // ways from the spawn to the goal
  needKinds: ['direct', 'vertical'], // path kinds that must exist (+ flank / hidden)
  pathKinds: ['direct', 'flank', 'vertical', 'hidden'],
  verticalLevel: 2, // a 'vertical' path climbs at least this level
  maxOverlap: 0.7, // two paths share at most this part of their cells (else it is the same way)
  minInteract: 4, // kinds of interactive things (barrel, lever, door, hatch, terminal, trap, water, secret)
  notes: [3, 8], // notes / traces to the codex per roam map
  secrets: [1, 3], // skill-gated caches per roam map
  battles: [1, 2], // embedded battles per roam map
  textMax: 140, // characters of a note / toast / secret text
  maxElevStep: 1, // walkable neighbours differ by ≤ 1 level (higher — a cliff)
  // secrets are hidden until noticed: passive Perception (10 + total) within spotR cells, active «Осмотреться» (Q) rolls
  // within searchR cells; DC — the secret's spot.dc / its Perception check / spotDc
  spotR: 3, searchR: 5, spotDc: 12,
};
