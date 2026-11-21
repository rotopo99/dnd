"""Pose check sheet for one preset: rest (front/side/back) + clip frames -> tools/out/blender-pose-<preset>.png
usage: NEED_GL=1 run.sh posecheck.py <sex> <hair> <outfit> [clip:frame:view,...]   (view: front|side|back|three)"""
import sys
from common import *
import rig, anim, hair, clothes, preview
import numpy as np

sex, st, kind = sys.argv[1:4]
poses = (sys.argv[4] if len(sys.argv) > 4 else 'walk:8:three,run:6:side,hit:4:three,talk:20:three,shrug:14:front,sit:10:side').split(',')
reset(); P, arm, body, fixed = rig.build_body(sex)
anim.author(arm, P)
o, sp = hair.build_hair(st, arm, P, hair.HAIR_COLORS['brown'], hair.HAIR_TIPS['brown'])
parts, sps = clothes.build_outfit(kind, body, arm, P, sex)
objs = [body, o] + parts
sc = bpy.context.scene; imgs = []; size = (300, 520)
pth = os.path.join(WORK, 'pc.png')
preview.render_views(objs, pth, views=('front', 'side', 'back'), toon=True, engine='EEVEE', size=size, center=(0, 0, 1.0), height=2.1)
im = bpy.data.images.load(pth); w, h = im.size; imgs.append(np.array(im.pixels[:]).reshape(h, w, 4)); bpy.data.images.remove(im)
row = []
for q in poses:
    c, fr, view = q.split(':')
    arm.animation_data.action = bpy.data.actions[c]; sc.frame_set(int(fr)); bpy.context.view_layer.update()
    preview.render_views(objs, pth, views=(view,), toon=True, engine='EEVEE', size=size, center=(0, 0, 1.0), height=2.1)
    im = bpy.data.images.load(pth); w, h = im.size; row.append(np.array(im.pixels[:]).reshape(h, w, 4)); bpy.data.images.remove(im)
while len(row) % 3: row.append(np.zeros_like(row[0]))
rows = [imgs[0]] + [np.concatenate(row[i:i + 3], axis=1) for i in range(0, len(row), 3)]
sheet = np.concatenate(rows[::-1], axis=0)
out = os.path.join(OUT, 'blender-pose-%s-%s-%s.png' % (sex[0], st, kind))
im = bpy.data.images.new('s', sheet.shape[1], sheet.shape[0], alpha=True); im.pixels = sheet.ravel().tolist()
im.filepath_raw = out; im.file_format = 'PNG'; im.save()
print('wrote', out)
