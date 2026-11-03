// Save game in localStorage (world.md §8). Every access is wrapped in try/catch: private mode / quota / old data
// must never break the game.
export const SAVE_KEY = 'ruslania-save-v1';
export const SAVE_VERSION = 1;

export function hasSave() {
  try {
    return !!globalThis.localStorage?.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

/** Returns the save object or null (missing / corrupted / other version). */
export function loadGame() {
  try {
    const raw = globalThis.localStorage?.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.version === SAVE_VERSION && s.hero ? s : null;
  } catch {
    return null;
  }
}

export function saveGame(save) {
  try {
    globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave() {
  try {
    globalThis.localStorage?.removeItem(SAVE_KEY);
  } catch {
    /* no-op */
  }
}
