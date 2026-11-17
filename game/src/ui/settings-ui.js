// Settings window (docs/specs/3d.md §3): graphics 3D / 2D / auto, «Снизить эффекты», «Снизить движение», shadows, brightness, objects highlight.
// openSettings(game) — modal (ui/modal.js), values live in gfx/settings.js (localStorage).
import { t } from '../data/text/index.js';
import { GFX } from '../data/gfx.js';
import { gfxPrefs, setGfxPref, gfxMode, gfxBroken, gfxEngine } from '../gfx/settings.js';
import { hasWebGL2 } from '../gfx/gl.js';
import { ROAM } from '../data/world/roam.js';
import { THEME_IDS, themePrefs, setThemePref } from './theme.js';
import { setVolume, getVolume, setBusVolume, getBusVolume } from '../audio/sfx.js';
import { setMusicVolume } from '../audio/music.js';

const MODES = ['auto', '3d', '2d'];
const onOff = (v) => t(v ? 'settings.on' : 'settings.off');

// Громкость: шаг 25% по кругу. Подписи — пока строками (нет ключей в data/text).
const VOLUME_ROWS = [
  ['master', 'Общая громкость'],
  ['music', 'Музыка'],
  ['sfx', 'Звуки'],
  ['ui', 'Интерфейс'],
  ['voice', 'Голоса'],
  ['amb', 'Окружение'],
];
const VOLUME_LEVELS = [0, 0.25, 0.5, 0.75, 1];
function nextVolume(v) {
  const i = VOLUME_LEVELS.findIndex((l) => Math.abs(l - v) < 0.13);
  return VOLUME_LEVELS[(i + 1) % VOLUME_LEVELS.length];
}
function volumeOf(key) {
  return key === 'master' ? getVolume() : getBusVolume(key);
}
function setVolumeOf(key, v) {
  if (key === 'master') setVolume(v);
  else if (key === 'music') setMusicVolume(v);
  else setBusVolume(key, v);
}

export function openSettings(game) {
  game.openModal({
    title: t('settings.title'),
    width: 560,
    build() {
      const p = gfxPrefs(), B = GFX.brightness;
      const can3d = hasWebGL2() && !gfxBroken();
      const modeLabel = `${t(`settings.mode.${p.mode}`)}${p.mode === 'auto' ? ` (${gfxMode().toUpperCase()})` : ''}`;
      return {
        lines: [...(can3d && gfxMode() === '3d' ? [t('settings.hint')] : []), ...(can3d ? [] : [{ text: t('settings.no3d'), color: 'c' }])], // camera keys: 3D only
        options: [
          { label: `${t('settings.mode')}: ${modeLabel}`, keep: true, disabled: !can3d, run: () => setGfxPref('mode', MODES[(MODES.indexOf(p.mode) + 1) % MODES.length]) },
          { label: `${t('settings.engine')}: ${t(`settings.engine.${gfxEngine()}`)}${gfxEngine() === 'three' && !game.gfx?.three ? ` (${t('settings.engineNA')})` : ''}`, keep: true, disabled: !can3d, run: () => setGfxPref('engine', gfxEngine() === 'three' ? 'old' : 'three') },
          { label: `${t('settings.reduceFx')}: ${onOff(p.reduceFx)}`, keep: true, run: () => setGfxPref('reduceFx', !p.reduceFx) },
          { label: `${t('settings.physics')}: ${t(`settings.physics.${p.physics || 'normal'}`)}`, keep: true, run: () => { const L = ['off', 'low', 'normal']; setGfxPref('physics', L[(L.indexOf(p.physics || 'normal') + 1) % 3]); } },
          { label: `${t('settings.reduceMotion')}: ${onOff(p.reduceMotion)}`, keep: true, run: () => setGfxPref('reduceMotion', !p.reduceMotion) },
          {
            label: `${t('settings.shadows')}: ${t(`settings.shadows.${p.shadows || 'high'}`)}${p.reduceFx ? ` (${t('settings.shadowsFx')})` : ''}`, keep: true,
            run: () => { const L = GFX.shadow.levels; setGfxPref('shadows', L[(L.indexOf(p.shadows || 'high') + 1) % L.length]); },
          },
          {
            label: `${t('settings.brightness')}: ${Math.round((p.brightness || 1) * 100)}%`, keep: true,
            run: () => { let v = Math.round(((p.brightness || 1) + B.step) * 10) / 10; if (v > B.max + 1e-6) v = B.min; setGfxPref('brightness', v); },
          },
          {
            label: `${t('settings.highlight')}: ${t(`settings.highlight.${p.highlight || 'always'}`)}`, keep: true,
            run: () => { const M = ROAM.highlight.modes; setGfxPref('highlight', M[(M.indexOf(p.highlight || M[0]) + 1) % M.length]); },
          },
          {
            label: `${t('settings.cones')}: ${t(`settings.cones.${p.cones === 'always' ? 'always' : 'stealth'}`)}`, keep: true,
            run: () => setGfxPref('cones', p.cones === 'always' ? 'stealth' : 'always'),
          },
          { label: `${t('settings.walls')}: ${t(`settings.walls.${p.walls || 'cut'}`)}`, keep: true, run: () => { const L = ['cut', 'fade', 'off']; setGfxPref('walls', L[(L.indexOf(p.walls || 'cut') + 1) % 3]); } },
          { label: `${t('settings.xray')}: ${t(`settings.xray.${p.xray === 'toggle' ? 'toggle' : 'hold'}`)}`, keep: true, run: () => setGfxPref('xray', p.xray === 'toggle' ? 'hold' : 'toggle') },
          { label: `${t('settings.metric')}: ${t(`settings.metric.${p.metric === 'off' ? 'off' : 'on'}`)}`, keep: true, run: () => setGfxPref('metric', p.metric === 'off' ? 'on' : 'off') },
          {
            label: `${t('settings.theme')}: ${themePrefs().mode === 'auto' ? t('settings.theme.auto') : t(`theme.${themePrefs().id}`)}`, keep: true,
            run: () => { // авто → steel → concrete → … → авто
              const tp = themePrefs(), i = tp.mode === 'auto' ? -1 : THEME_IDS.indexOf(tp.id);
              if (i + 1 >= THEME_IDS.length) setThemePref('auto'); else setThemePref('manual', THEME_IDS[i + 1]);
            },
          },
          ...VOLUME_ROWS.map(([key, name]) => {
            const v = volumeOf(key);
            return { label: `${name}: ${Math.round(v * 100)}%`, keep: true, run: () => setVolumeOf(key, nextVolume(v)) };
          }),
          { label: t('settings.close') },
        ],
      };
    },
  });
}
