# Suno prompts for game music

Замена процедурной музыки (`game/src/audio/music.js`) готовыми треками. Пока файлов нет, игра играет процедурные треки.

## Как подключить
- Файлы кладём в `game/assets/music/` под именами из таблицы ниже. Путь задан в `MUSIC_FILES` в `music.js` (относительно `game/index.html`).
- Формат: MP3, 44.1 kHz, 160–192 kbps, стерео.
- Трек должен играться по кругу: конец плавно переходит в начало (в коде кроссфейд 1.5 с на стыке). В Suno выбирай «loopable» или делай outro, который тает в тишину, а intro начинается с тихого пэда.
- Все треки инструментальные (Instrumental: on, без вокала). Хоровые тембры допустимы только как «choir, no lyrics» (ooh/aah).

## Общие правила для всех промптов
- Пространство: большой зал, долгий реверб, много тишины между фразами.
- Без голых пил и квадратов, без непрерывного баса ниже 80 Гц, без диссонансных биений.
- Громкость: мастеринг ровный, без пиков, LUFS около −16 до −18.

| Трек | Файл | Длина | Темп | Стиль |
|---|---|---|---|---|
| menu | `menu.mp3` | 2:00 | свободный, ~60 BPM | Rogue Trader |
| world | `world.mp3` | 2:00 | 72 BPM | Quasimorph |
| town | `town.mp3` | 2:00 | 66 BPM | Rogue Trader |
| battle | `battle.mp3` | 2:00 | 96 BPM | Quasimorph |
| boss | `boss.mp3` | 2:00 | 92 BPM | Rogue Trader |
| cyberspace | `cyberspace.mp3` | 2:00 | 120 BPM | digital, Quasimorph-like |
| tension | `tension.mp3` | 1:30 | 60–80 BPM (heartbeat) | minimal |

## Промпты (English, paste into Suno)

### menu.mp3
Instrumental, 2:00, about 60 BPM, dark cathedral ambience in the spirit of Rogue Trader main menu. Slow pipe organ chords in D dorian, soft ghostly choir ooh pads, a rare deep church bell with a long tail, vast reverb hall, long silences between phrases, grim and solemn, sacred decay, no drums or only a distant heartbeat, no bright synth leads, loopable ending.

### world.mp3
Instrumental, 2:00, 72 BPM, bleak wasteland travel theme in the spirit of Quasimorph. Muffled filtered analog synth pads in E phrygian, dry heavy industrial kicks with syncopation and gaps, distant metallic clanks, occasional radio static and crackle, a sense of slow walking through ruins, wide stereo, long rests every few bars, dusty and tense, loopable ending.

### town.mp3
Instrumental, 2:00, 66 BPM, grim gothic city hub in the spirit of Rogue Trader. Warm organ and soft choir in D dorian, a restrained low pulse, a sparse bell now and then, reverberant stone-hall space, quiet passages where only the organ breathes, courtly and melancholic, no harsh sounds, loopable ending.

### battle.mp3
Instrumental, 2:00, 96 BPM, combat theme in the spirit of Quasimorph. Dry tight industrial drums, a heavy punchy kick with pitch drop, metallic hits with a short echo, muffled filtered synth stabs, rhythmic breaks and pauses every 8 to 12 bars, syncopated hits, grim and mechanical, no bright leads, no distorted square or saw leads, loopable ending.

### boss.mp3
Instrumental, 2:00, 92 BPM, boss fight in the spirit of Rogue Trader finale. Massive pipe organ riffs over a minor and tritone-based progression, double-time heavy kicks, an FM-style bell struck every few bars, choir stabs on ooh, huge hall reverb, ominous and epic, short breaths of silence, no beating or clashing close intervals, loopable ending.

### cyberspace.mp3
Instrumental, 2:00, 120 BPM, digital dreamscape in the spirit of Quasimorph cyberspace. Soft sine and triangle arpeggios on a modal scale, glitch bursts and stutters, a low-passed digital hum, light tick percussion, cold and eerie, lots of space, no square-wave lead, loopable ending.

### tension.mp3
Instrumental, 1:30, heartbeat tempo 60 to 80 BPM, the last countdown before the end. Minimal: a fifth-only drone (no beating), a heavy heartbeat thud, soft clock ticks that speed up over time, a distant metallic strike now and then, no melody, claustrophobic, loopable ending.
