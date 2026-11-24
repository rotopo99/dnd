"""Hair review sheet: every style on one sex, head close-ups (front / three / back) -> tools/out/blender-hair-<sex>.png
usage: NEED_GL=1 run.sh haircheck.py [female|male] [style,style,...]"""
import sys
from common import *
import rig, hair, preview
import numpy as np
sex = sys.argv[1] if len(sys.argv) > 1 else 'female'
styles = (sys.argv[2] if len(sys.argv) > 2 else ','.join(hair.STYLES)).split(',')
cols = []
for st in styles:
    reset(); P, arm, body, fixed = rig.build_body(sex)
    o, sp = hair.build_hair(st, arm, P, hair.HAIR_COLORS['brown'], hair.HAIR_TIPS['brown'])
    hz = P['hs'] * 1.62; col = []
    for v in ('front', 'three', 'back'):
        pth = os.path.join(WORK, 'hc.png')
        preview.render_views([body, o], pth, views=(v,), toon=True, size=(220, 260), center=(0, 0.0, hz), height=0.85)
        im = bpy.data.images.load(pth); w, h = im.size; col.append(np.array(im.pixels[:]).reshape(h, w, 4)); bpy.data.images.remove(im)
    cols.append(np.concatenate(col, axis=0))
sheet = np.concatenate(cols, axis=1)
im = bpy.data.images.new('s', sheet.shape[1], sheet.shape[0], alpha=True); im.pixels = sheet.ravel().tolist()
im.filepath_raw = os.path.join(OUT, 'blender-hair-%s.png' % sex); im.file_format = 'PNG'; im.save()
print('hair check done', styles)
