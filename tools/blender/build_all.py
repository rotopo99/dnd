"""Build every model: python build_all.py [--only body|hair|outfit|preset] [--sex male|female]
Output: game/assets/models/*.glb (+ .json meta, face PNGs) and previews tools/out/blender-*.png"""
import sys, argparse, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))) if False else None
from common import *
import rig, anim, hair, clothes, export, face_atlas, preview, head as headmod
from skeleton import MALE, FEMALE

ap = argparse.ArgumentParser(); ap.add_argument('--only', default='all'); ap.add_argument('--sex', default='both'); ap.add_argument('--no-preview', action='store_true')
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
SEXES = ['female', 'male'] if args.sex == 'both' else [args.sex]
STYLES = hair.STYLES; OUTFITS = os.environ.get('OUTFITS', ','.join(clothes.KINDS)).split(',')
PRESETS = [('hero_f_uniform', 'female', 'long', 'uniform', 'silver', 'light'), ('hero_f_field', 'female', 'bob', 'field', 'brown', 'tan'),
           ('hero_m_field', 'male', 'short', 'field', 'black', 'light'), ('hero_m_uniform', 'male', 'short', 'uniform', 'brown', 'tan')]
sx = lambda s: 'f' if s == 'female' else 'm'
t0 = time.time(); log = lambda *a: print('[build %4ds]' % (time.time() - t0), *a, flush=True)


def kb(p): return '%.0f KB' % (os.path.getsize(p) / 1024)


def springs_of(objs):
    out = []
    for o in objs:
        if 'springBones' in o.keys(): out += json.loads(o['springBones'])
    return out


def base_scene(sex, hair_rgb=(0.3, 0.2, 0.17), skin='light', iris=(0.25, 0.62, 0.75)):
    reset()
    P, arm, body, fixed = rig.build_body(sex, skin=skin, hair_rgb=hair_rgb, iris=iris)
    names = anim.author(arm, P)
    return P, arm, body, names


def make_faces():
    """Expression atlases (swap-in textures) + face SDF shadow map next to the models."""
    for sex in ('female', 'male'):
        P = FEMALE if sex == 'female' else MALE
        for expr in ['neutral'] + export.EXPRESSIONS:
            face_atlas.N = 512
            arr = face_atlas.draw_face(sex, expr, 'light', hs=P['hs'])
            face_atlas.make_image('tmp', arr, path=os.path.join(MODELS, 'face_%s_%s.png' % (sx(sex), expr)))
    face_atlas.N = 512
    face_atlas.make_image('sdf', face_atlas.face_sdf(1.0), srgb=False, path=os.path.join(MODELS, 'face_sdf.png'))
    face_atlas.N = 1024


def done_preview(name, objs, views=('front', 'three', 'back'), **kw):
    if args.no_preview: return
    if os.environ.get('QUICK'): views = ('three',)
    preview.render_views(objs, os.path.join(OUT, 'blender-%s.png' % name), views=views, toon=True, engine='EEVEE', size=(380, 640), center=(0, 0, 0.9), height=1.9, **kw)


if args.only in ('all', 'faces'): make_faces(); log('faces done')
for sex in SEXES:
    P = FEMALE if sex == 'female' else MALE
    if args.only in ('all', 'body'):
        P, arm, body, names = base_scene(sex)
        p = os.path.join(MODELS, 'body_%s.glb' % sx(sex)); n = export.glb(p, [arm, body])
        arm['x'] = 0
        export.meta(p, arm, P, sex, ['Body'], names, [], dict(triangles=tri_count(body)))
        log('body', sex, kb(p), 'tris', tri_count(body)); save_blend('base_' + sex)
        done_preview('body-' + sex, [body])
    else:
        if not os.path.exists(os.path.join(WORK, 'base_%s.blend' % sex)):
            P, arm, body, names = base_scene(sex); save_blend('base_' + sex)
    if args.only in ('all', 'hair'):
        for st in STYLES:
            load_blend('base_' + sex); arm = bpy.data.objects['Armature']; body = bpy.data.objects['Body']
            o, sp = hair.build_hair(st, arm, P, hair.HAIR_COLORS['brown'], hair.HAIR_TIPS['brown'])
            p = os.path.join(MODELS, 'hair_%s_%s.glb' % (st, sx(sex))); export.glb(p, [arm, o], animations=False)
            export.meta(p, arm, P, sex, [o.name], [], sp, dict(triangles=tri_count(o)))
            log('hair', st, sex, kb(p), 'tris', tri_count(o))
            if True: done_preview('hair-%s-%s' % (st, sx(sex)), [body, o], views=('front', 'three', 'back'))
    if args.only in ('all', 'outfit'):
        for k in OUTFITS:
            load_blend('base_' + sex); arm = bpy.data.objects['Armature']; body = bpy.data.objects['Body']
            parts, sps = clothes.build_outfit(k, body, arm, P, sex)
            p = os.path.join(MODELS, 'outfit_%s_%s.glb' % (k, sx(sex))); export.glb(p, [arm] + parts, animations=False)
            export.meta(p, arm, P, sex, [o.name for o in parts], [], sps, dict(triangles=sum(tri_count(o) for o in parts)))
            log('outfit', k, sex, kb(p), 'tris', sum(tri_count(o) for o in parts))
            done_preview('outfit-%s-%s' % (k, sx(sex)), [body] + parts)
if args.only in ('all', 'preset'):
    for name, sex, st, k, hc, skin in PRESETS:
        if sex not in SEXES: continue
        P, arm, body, names = base_scene(sex, hair.HAIR_COLORS[hc], skin)
        o, sp = hair.build_hair(st, arm, P, hair.HAIR_COLORS[hc], hair.HAIR_TIPS[hc]); parts, sps = clothes.build_outfit(k, body, arm, P, sex); sp = sp + sps
        p = os.path.join(MODELS, name + '.glb'); objs = [arm, body, o] + parts
        export.glb(p, objs)
        tris = sum(tri_count(x) for x in objs[1:])
        export.meta(p, arm, P, sex, [x.name for x in objs[1:]], names, sp, dict(triangles=tris, hair=st, outfit=k, hair_color=hc, skin=skin))
        log('preset', name, kb(p), 'tris', tris)
        done_preview('preset-' + name, objs[1:])
        # anim contact sheet
        if not args.no_preview and name == 'hero_f_uniform':
            import numpy as np
            sc = bpy.context.scene; imgs = []
            for i, (n, fr) in enumerate([('idle', 1), ('walk', 8), ('run', 6), ('attack_melee', 20), ('attack_shoot', 16), ('cast', 34), ('hit', 4), ('death', 30)]):
                arm.animation_data.action = bpy.data.actions[n]; sc.frame_set(fr); bpy.context.view_layer.update()
                pth = os.path.join(WORK, 'a%d.png' % i)
                preview.render_views(objs[1:], pth, views=('three',), toon=True, engine='EEVEE', size=(300, 420), center=(0, 0, 0.85), height=1.9)
                im = bpy.data.images.load(pth); w, h = im.size; imgs.append(np.array(im.pixels[:]).reshape(h, w, 4)); bpy.data.images.remove(im)
            sheet = np.concatenate([np.concatenate(imgs[:4], axis=1), np.concatenate(imgs[4:], axis=1)], axis=0)
            im = bpy.data.images.new('s', sheet.shape[1], sheet.shape[0], alpha=True); im.pixels = sheet.ravel().tolist()
            im.filepath_raw = os.path.join(OUT, 'blender-anims.png'); im.file_format = 'PNG'; im.save()
log('ALL DONE')
