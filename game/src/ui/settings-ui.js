// Settings window (docs/specs/3d.md §3): graphics 3D / 2D / auto, «Снизить эффекты», «Снизить движение», shadows, brightness.
// openSettings(game) — modal (ui/modal.js), values live in gfx/settings.js (localStorage).
import { t } from '../data/text/index.js';
import { GFX } from '../data/gfx.js';
import { gfxPrefs, setGfxPref, gfxMode, gfxBroken } from '../gfx/settings.js';
import { hasWebGL2 } from '../gfx/gl.js';
import { THEME_IDS, themePrefs, setThemePref } from './theme.js';

const MODES = ['auto', '3d', '2d'];
const onOff = (v) => t(v ? 'settings.on' : 'settings.off');

export function openSettings(game) {
  game.openModal({
    title: t('settings.title'),
    width: 560,
    build() {
      const p = gfxPrefs(), B = GFX.brightness;
      const can3d = hasWebGL2() && !gfxBroken();
      const modeLabel = `${t(`settings.mode.${p.mode}`)}${p.mode === 'auto' ? ` (${gfxMode().toUpperCase()})` : ''}`;
      return {
        lines: [t('settings.hint'), ...(can3d ? [] : [{ text: t('settings.no3d'), color: 'c' }])],
        options: [
          { label: `${t('settings.mode')}: ${modeLabel}`, keep: true, disabled: !can3d, run: () => setGfxPref('mode', MODES[(MODES.indexOf(p.mode) + 1) % MODES.length]) },
          { label: `${t('settings.reduceFx')}: ${onOff(p.reduceFx)}`, keep: true, run: () => setGfxPref('reduceFx', !p.reduceFx) },
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
            label: `${t('settings.theme')}: ${themePrefs().mode === 'auto' ? t('settings.theme.auto') : t(`theme.${themePrefs().id}`)}`, keep: true,
            run: () => { // авто → steel → concrete → … → авто
              const tp = themePrefs(), i = tp.mode === 'auto' ? -1 : THEME_IDS.indexOf(tp.id);
              if (i + 1 >= THEME_IDS.length) setThemePref('auto'); else setThemePref('manual', THEME_IDS[i + 1]);
            },
          },
          { label: t('settings.close') },
        ],
      };
    },
  });
}
