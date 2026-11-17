// Window «Находка» — a lore note found (docs/lore/BIBLE.md §8, content-wave1.md §6). Logic — world/lore.js.
// openFind(game, onDone?) shows the next queued note (save.pendingFinds): kind + place, the text, the secrets it moves
// («Тайна „X“: 2/3»); the note is in the codex («Записки», «Тайны мира») from that moment. → false when nothing is queued.
// Caller: location.js pump (node entry, quest stages, consequences, check scenes — the triggers only queue).
import { t } from '../data/text/index.js';
import { tf } from '../world/state.js';
import { takeFind } from '../world/lore.js';
import { LOCATIONS } from '../world/data.js';
import { saveGame } from '../save.js';
import { play } from '../audio/sfx.js';

export function openFind(game, onDone = null) {
  const sv = game.save;
  const f = sv && takeFind(sv);
  if (!f) return false;
  const { note, secrets } = f;
  saveGame(sv);
  play('loot');
  game.toast(tf('find.toast', { title: note.title }), 'f');
  const head = [t(`find.kind.${note.kind || 'note'}`), LOCATIONS[note.loc]?.name, note.layer ? t(`find.layer.${note.layer}`) : null].filter(Boolean).join(' · ');
  const lines = [{ text: head, color: '4', gap: true }];
  note.text.forEach((l, i) => lines.push({ text: l, color: '5', gap: i === note.text.length - 1 }));
  for (const s of secrets) lines.push({ text: s.solved ? tf('find.solved', { name: s.title }) : tf('find.secret', { name: s.title, n: s.n }), color: s.solved ? 'j' : 'f' });
  game.openModal({ title: `${t('find.title')}: ${note.title}`, width: 820, border: 'f', titleColor: 'f', find: note.id, lines,
    options: [{ label: t('find.take'), run: (g) => onDone?.(g) }], onCancel: (g) => onDone?.(g) });
  return true;
}
