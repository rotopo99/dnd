// Co-op multiplayer numbers (docs/specs/multiplayer.md, «Правила: числа для balance-tester»).
export const NET = {
  maxPlayers: 4, // host + 3 guests
  stun: 'stun:stun.l.google.com:19302', // default ICE server (settings: can be changed / cleared)
  stunKey: 'ruslania-net-stun', // localStorage: custom STUN ('' — none, LAN only)
  heroKey: 'ruslania-net-hero', // localStorage: the hero this player brings to co-op
  nameKey: 'ruslania-net-name',
  iceWait: 5, // s: wait for iceGatheringState=complete (all candidates in one code, no trickle)
  connectTimeout: 20, // s: channel not open after the code exchange → error
  helloTimeout: 10, // s: channel open but no welcome / reject
  pingEvery: 2, // s
  chunk: 60000, // chars per DataChannel frame (message limit 64 KB → chunk {id,i,of,data})
  chatMax: 200, // chars per line
  chatLines: 50, // kept in the lobby window
  chatPeek: 3, // lines shown in battle / world
  chatFade: 8, // s a line stays visible in battle / world
  turnTimer: 60, // s for a player's turn, then the host skips it (0 — no timer)
  codeTarget: 1500, // chars — target length of an invite code
  hashKeep: 400, // host keeps the last N turn hashes to compare with guests
  colors: ['h', 'a', 'j', 'n'], // player colour by slot (STYLE palette keys)
  // enemy scaling for N heroes (multiplayer.md §«Масштаб врагов»): +extraPerHero enemies per hero above the first,
  // taken cyclically from the encounter list. Final formula — balance-tester.
  extraPerHero: 1,
  // stages 3–4: co-op world
  slotKeep: 600, // s: a dropped player's slot and hero are kept for a rejoin (10 min)
  posEvery: 0.1, // s: move / pos rate on the free node map (10 Hz)
  deltaEvery: 1, // s: host checks the world for changes (delta with the guest's mirror save)
  posSlack: 2, // cells: extra distance allowed between two moves (lag) above the run speed
  posLerp: 12, // 1/s: interpolation of other players' figures
};
