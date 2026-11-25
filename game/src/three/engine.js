// Three.js backend (docs/specs/threejs-migration.md): renderer, post chain, shared caches. Loaded by main.js with a
// dynamic import (Three.js is a vendor module, game/vendor/three/); until / unless it loads the old gfx/* renderer draws.
// The world canvas #gl3 sits under the Canvas 2D UI (#game) like #gl; it is visible only in frames that drew into it.
//   createThree(canvas, game) -> E { gen, ok(), resize(w, h, cw, ch), use(), endFrame(), drawBattle(game, S, opts),
//                                    dropBattle(V), geometry(key, build), renderer, soft }
// Battle scene: three/battle.js. Numbers: data/gfx.js GFX.three.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GFX } from '../data/gfx.js';
import { softwareGL } from '../gfx/gl.js';
import { markGfxBroken } from '../gfx/settings.js';
import { gfxQuality, qualityPreset, sampleFrame } from '../gfx/quality.js';
import { t } from '../data/text/index.js';
import { drawBattleThree, dropBattleThree } from './battle.js';

// final grade (after tonemap + sRGB): vignette over the map area, biome colour balance, saturation, brightest pixel cap (3d.md §7)
const GradeShader = {
  name: 'GradeShader',
  uniforms: { tDiffuse: { value: null }, uArea: { value: new THREE.Vector4(0, 0, 1, 1) }, uBal: { value: new THREE.Vector3(1, 1, 1) }, uVig: { value: new THREE.Vector2(0.2, 0.55) }, uMax: { value: 0.92 }, uSat: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec4 uArea; uniform vec3 uBal; uniform vec2 uVig; uniform float uMax; uniform float uSat; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec2 q = (vUv - uArea.xy) / uArea.zw * 2.0 - 1.0;
  float v = smoothstep(uVig.y, 1.45, length(q));
  vec3 col = c.rgb * uBal * (1.0 - uVig.x * v);
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uSat); // saturation (PBR light x albedo runs hotter than the old ramps)
  gl_FragColor = vec4(min(col, vec3(uMax)), c.a);
}`,
};

export function createThree(canvas, game) {
  const E = {
    canvas, gen: 0, renderer: null, failed: false, lost: false, used: false, soft: softwareGL(), w: canvas.width, h: canvas.height,
    cw: '', ch: '', scale: 1, geos: new Map(), post: null, clip: '',
    ok() {
      if (E.lost && !E.failed && performance.now() - E.lostAt > GFX.lostTimeout * 1000) { // 3d.md: lost for good -> 2D + toast
        E.failed = true; markGfxBroken(); game.toast(t('gfx.unavailable'), 'c');
      }
      if (E.failed || E.lost) return false;
      if (E.renderer) return true;
      try {
        const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
        r.shadowMap.enabled = true;
        E.lite = E.soft && !/[?&]hq=1/.test(globalThis.location?.search || ''); // software GL: GFX.three.soft
        r.shadowMap.type = THREE.PCFShadowMap; // r18x: PCFSoftShadowMap removed; softness = shadow.radius (GFX.three.shadow)
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.toneMapping = THREE.NeutralToneMapping; // Khronos PBR Neutral: keeps the brand cyan / magenta (premium-look)
        r.toneMappingExposure = GFX.three.exposure;
        E.qLevel = gfxQuality(); E.Q = qualityPreset();
        E.scale = E.pixelScale();
        r.setPixelRatio(E.scale);
        r.setSize(E.w, E.h, false);
        canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); E.lost = true; E.lostAt = performance.now(); });
        canvas.addEventListener('webglcontextrestored', () => { E.lost = false; E.gen++; E.geos.clear(); E.disposePost(); });
        E.renderer = r;
        return true;
      } catch (e) {
        console.warn('three.js', e);
        E.failed = true;
        return false;
      }
    },
    resize(w, h, cw, ch) {
      E.w = w; E.h = h; E.cw = cw; E.ch = ch;
      canvas.style.width = cw; canvas.style.height = ch;
      if (E.renderer) { E.renderer.setSize(w, h, false); E.post?.setSize(w, h); }
      else { canvas.width = w; canvas.height = h; }
    },
    use() { E.used = true; },
    /** Render scale: software GL — GFX.soft.scale; else devicePixelRatio capped by the quality preset (docs/perf.md). */
    pixelScale() { return E.soft ? GFX.soft.scale : Math.min(globalThis.devicePixelRatio || 1, E.Q.dpr, GFX.three.maxDpr); },
    /** Quality level changed (setting / auto tuner): new render scale, post chain rebuilt on the next frame. */
    syncQuality() {
      const lv = gfxQuality();
      if (lv === E.qLevel || !E.renderer) return;
      E.qLevel = lv; E.Q = qualityPreset();
      const sc = E.pixelScale();
      if (sc !== E.scale) { E.scale = sc; E.renderer.setPixelRatio(sc); E.renderer.setSize(E.w, E.h, false); }
      E.disposePost();
    },
    endFrame() {
      sampleFrame(performance.now(), E.used && !E.failed && !!E.renderer);
      if (E.lost) E.ok(); // runs the lost-context timeout
      const show = E.used && !E.failed;
      if (canvas.style.visibility !== (show ? 'visible' : 'hidden')) canvas.style.visibility = show ? 'visible' : 'hidden';
      E.used = false;
    },
    /** World clip to the map area (UI panels around stay clean): CSS clip-path in display px. */
    clipTo(a) {
      const k = (parseFloat(E.cw) || E.w) / E.w;
      const c = `inset(${Math.max(0, a.y * k)}px ${Math.max(0, (E.w - a.x - a.w) * k)}px ${Math.max(0, (E.h - a.y - a.h) * k)}px ${Math.max(0, a.x * k)}px)`;
      if (c !== E.clip) { E.clip = c; canvas.style.clipPath = c; }
    },
    /** Shared geometry cache (templates / props), per context generation. */
    geometry(key, build) {
      let g = E.geos.get(key);
      if (g === undefined) { g = build(); E.geos.set(key, g); }
      return g;
    },
    /** Post chain (EffectComposer): scene -> GTAO -> bloom (HDR, only what exceeds the threshold: emissive) -> tonemap -> grade. */
    composer(scene, camera) {
      const P = E.post;
      if (P && P.scene === scene) { P.render.camera = camera; P.gtao.camera = camera; return P; }
      E.disposePost();
      const T3 = GFX.three, r = E.renderer, size = r.getDrawingBufferSize(new THREE.Vector2());
      const Q = E.Q, rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: E.soft ? 0 : Math.min(T3.msaa, Q.msaa) });
      const comp = new EffectComposer(r, rt);
      comp.setPixelRatio(E.scale);
      comp.setSize(E.w, E.h);
      const render = new RenderPass(scene, camera);
      const gtao = new GTAOPass(scene, camera, E.w, E.h);
      if (Q.gtao > 0 && Q.gtao < 1) { // medium: AO buffers at a share of the resolution (the blend samples it filtered)
        const ss = gtao.setSize.bind(gtao);
        gtao.setSize = (w, h) => ss(Math.max(1, Math.round(w * Q.gtao)), Math.max(1, Math.round(h * Q.gtao)));
      }
      gtao.updateGtaoMaterial(T3.ao);
      gtao.blendIntensity = T3.ao.intensity;
      // transparent overlays, particles, outline hulls and x-ray silhouettes stay out of the AO g-buffer
      const ov = gtao._overrideVisibility.bind(gtao);
      // quality without aoUnits: characters stay out too (the g-buffer pass is a full redraw of the scene)
      const units = !Q.aoUnits;
      gtao._overrideVisibility = function () { ov(); scene.traverse((o) => { if ((o.userData.noAO || (units && o.userData.unit)) && o.visible) { o.visible = false; this._visibilityCache.push(o); } }); };
      const B = T3.bloom, bloom = new UnrealBloomPass(new THREE.Vector2(E.w, E.h), B.strength, B.radius, B.threshold);
      const out = new OutputPass();
      const grade = new ShaderPass(GradeShader);
      bloom.enabled = Q.bloom && !(E.lite && !T3.soft.bloom);
      gtao.enabled = Q.gtao > 0 && !(E.lite && !T3.soft.gtao);
      for (const p of [render, gtao, bloom, out, grade]) comp.addPass(p);
      E.post = { scene, comp, render, gtao, bloom, grade, setSize: (w, h) => comp.setSize(w, h) };
      return E.post;
    },
    disposePost() {
      if (!E.post) return;
      E.post.comp.dispose?.();
      E.post.gtao.dispose?.(); E.post.bloom.dispose?.();
      E.post = null;
    },
    drawBattle(game2, S, opts) { E.use(); E.syncQuality(); drawBattleThree(E, game2, S, opts); },
    dropBattle(V) { dropBattleThree(E, V); },
  };
  return E;
}
