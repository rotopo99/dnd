"""Enemy check sheet: NEED_GL=1 run.sh enemycheck.py <id> [clip:frame:view,...] -> tools/out/blender-enemy-<id>.png
(top row: rest front / side / three-quarter, then the clip frames, 3 per row)"""
import sys
from common import *
import enemy, preview
import numpy as np

eid = sys.argv[1]
DEF = dict(wolf='idle:1:three,walk:8:side,run:5:side,bite:14:three,hit:3:three,death:50:three',
           drone='idle:12:three,move:6:side,shoot:3:side,hit:3:three,death:20:three,death:45:three')
poses = (sys.argv[2] if len(sys.argv) > 2 else DEF.get(eid, 'walk:8:three,run:6:side,attack_melee:20:three,attack_shoot:16:three,hit:4:three,death:50:three')).split(',')
r = enemy.build(eid); arm = r['arm']; objs = r['objs']
VIEW = dict(wolf=((0, -0.05, 0.62), 1.9), drone=((0, 0, 0.95), 2.0))
center, height = VIEW.get(eid, ((0, 0, 1.05), 2.4))
sc = bpy.context.scene; size = (300, 360) if eid in VIEW else (300, 520); pth = os.path.join(WORK, 'ec.png'); row = []
def shot(views):
    preview.render_views(objs, pth, views=views, toon=True, engine='EEVEE', size=size, center=center, height=height)
    im = bpy.data.images.load(pth); w, h = im.size; a = np.array(im.pixels[:]).reshape(h, w, 4); bpy.data.images.remove(im); return a
rest = shot(('front', 'side', 'three'))
for q in poses:
    c, fr, view = q.split(':')
    arm.animation_data_create(); arm.animation_data.action = bpy.data.actions[c]; sc.frame_set(int(fr)); bpy.context.view_layer.update()
    row.append(shot((view,)))
while len(row) % 3: row.append(np.zeros_like(row[0]))
sheet = np.concatenate(([rest] + [np.concatenate(row[i:i + 3], axis=1) for i in range(0, len(row), 3)])[::-1], axis=0)
out = os.path.join(OUT, 'blender-enemy-%s.png' % eid)
im = bpy.data.images.new('s', sheet.shape[1], sheet.shape[0], alpha=True); im.pixels = sheet.ravel().tolist()
im.filepath_raw = out; im.file_format = 'PNG'; im.save(); print('wrote', out)
