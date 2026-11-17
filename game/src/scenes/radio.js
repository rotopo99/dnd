// Window «Эфир» — radio «Голос Пустошей» (content-wave1.md §1). Logic — world/radio.js; this is the modal only.
// openRadio(game, { source: 'handset'|'radio-room'|'tavern'|'hub', n, onDone }) — n news at once (base: 3), a jingle line
// (its `track` goes to sfx.play — silent until the sound designer adds it), handset: «Следующая новость» while the queue
// has news (≤ WORLD_RULES.wave1.radioMaxPerOpen per open). Callers: location.js (V / button, node entry, rest), base.js,
// roam.js / world-map.js (V), panels.js (journal button).
import { t } from '../data/text/index.js';
import { tf } from '../world/state.js';
import { radioPick, radioQueue, RADIO_INFO } from '../world/radio.js';
import { WORLD_RULES } from '../data/world/rules.js';
import { saveGame } from '../save.js';
import { play } from '../audio/sfx.js';

const TONE = { news: '5', gossip: '5', warn: 'c', ad: 'b', dedication: 'a' };
const SRC = { handset: 'radio.handset', 'radio-room': 'radio.base', tavern: 'radio.tavern', hub: 'radio.hub' };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Open the «Эфир» window. → the picked news ids (tests). */
export function openRadio(game, { source = 'handset', n = 1, onDone = null, shown = 0 } = {}) {
  const sv = game.save;
  if (!sv) return [];
  const got = radioPick(sv, { n });
  const { station, dj } = RADIO_INFO;
  const lines = [{ text: `${station.name} · ${station.freq}`, color: '4' }, { text: t(SRC[source] || SRC.handset), color: '3', gap: true }];
  if (!shown) lines.push({ text: `${dj.name}: «${pick(dj.signature)}»`, color: 'a', gap: true });
  for (const g of got) {
    if (g.jingle) { lines.push({ text: g.jingle.text, color: 'f', gap: true }); play(g.jingle.track); }
    g.text.forEach((l, i) => lines.push({ text: l, color: TONE[g.news.tone] || '5', gap: i === g.text.length - 1 }));
  }
  if (!got.length) lines.push({ text: t('radio.silence'), color: '3', gap: true });
  const total = shown + got.length;
  const more = source === 'handset' && got.length && total < WORLD_RULES.wave1.radioMaxPerOpen && radioQueue(sv).length > 0;
  if (!more) lines.push({ text: `${dj.name}: «${pick(dj.signoff)}»`, color: '4' });
  saveGame(sv);
  play('open');
  game.openModal({
    title: `${t('radio.button')} — ${station.name}`, width: 860, border: 'a', titleColor: 'a', radio: true, lines,
    options: [
      ...(more ? [{ label: t('radio.next'), run: (g) => openRadio(g, { source, n: 1, onDone, shown: total }) }] : []),
      { label: t('radio.off'), run: (g) => onDone?.(g) },
    ],
    onCancel: (g) => onDone?.(g),
  });
  return got.map((g) => g.news.id);
}

/** Badge text of fresh news (or ''). */
export const radioBadge = (n) => (n > 0 ? ` ● ${tf('radio.fresh', { n })}` : '');
