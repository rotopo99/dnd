// Emotion of a dialogue line for portraits v2 (assets/portraits.js EMOTIONS).
// lineEmotion(line) — line.emo if valid, else detectEmotion(line.text). Simple text rules, first match wins:
//   cringe theme -> 'cringe'; '?!' / '!?' -> 'surprised'; laughter / «ха» -> 'happy'; fear -> 'scared';
//   threats or '!' -> 'angry'; '…' / '...' or sorrow -> 'sad'; otherwise 'neutral'.
import { EMOTIONS } from '../assets/portraits.js';

const RULES = [
  ['cringe', /кринж|кринг|стыдн|неловк|позор|испанск/i],
  ['surprised', /\?!|!\?/],
  ['happy', /(^|[^а-яё])(ха|хе|хи)([-\s,]*(ха|хе|хи))*([^а-яё]|$)|ахах|хаха|хех|смеш|смеё|смея|хохоч|(^|[^а-яё])лол([^а-яё]|$)|\bxd\b/i],
  ['scared', /помогите|спасите|боюсь|страшн|мамочк|бежим|не надо/i],
  ['angry', /убь|убью|убит|сдохн|порв|придуш|заткн|пристрел|раздав|урою|сожг|смерть вам|умрёшь|умрешь|!/i],
  ['sad', /…|\.\.\.|жаль|увы|грустн|печал|плач|погиб|умер|прости|скорб|одинок/i],
];

/** Emotion id by the text of a line. */
export function detectEmotion(text) {
  const s = String(text || '');
  for (const [emo, re] of RULES) if (re.test(s)) return emo;
  return 'neutral';
}

/** Emotion of a dialogue line: explicit `emo` field wins. */
export function lineEmotion(line) {
  if (line && EMOTIONS.includes(line.emo)) return line.emo;
  return detectEmotion(line?.text);
}
