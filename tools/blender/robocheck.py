"""Review sheet of a mechanical body: rest front / three-quarter / back + face close-up + clip frames -> tools/out/blender-robo-<kind>-<sex>.png
usage: NEED_GL=1 run.sh robocheck.py skel|synth|android female|male [clip:frame:view,...]"""
import sys
from common import *
import preview
import numpy as np

kind, sex = sys.argv[1:3]
poses = (sys.argv[3] if len(sys.argv) > 3 else 'walk:8:three,attack_melee:14:three,idle_2h:1:three').split(',') if len(sys.argv) > 3 or True else []
if kind == 'android':
    import enemy_android; P, arm, objs, names = enemy_android.build()
else:
    import robo; P, arm, objs, names = robo.build(kind, sex)
print('tris', sum(tri_count(o) for o in objs), 'mats', len(objs[0].data.materials))
sc = bpy.context.scene; size = (300, 520); pth = os.path.join(WORK, 'rc.png'); imgs = []
def shot(views, **kw):
    preview.render_views(objs, pth, views=views, toon=True, engine='EEVEE', size=size, center=(0, 0, 1.0), height=2.1, **kw)
    im = bpy.data.images.load(pth); w, h = im.size; a = np.array(im.pixels[:]).reshape(h, w, 4); bpy.data.images.remove(im); return a
top = shot(('front', 'three', 'back'))
row = []
for q in poses:
    c, fr, view = q.split(':')
    arm.animation_data.action = bpy.data.actions[c]; sc.frame_set(int(fr)); bpy.context.view_layer.update()
    row.append(shot((view,)))
arm.animation_data.action = None
for pb in arm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
bpy.context.view_layer.update()
hz = 1.62 if sex == 'female' else 1.74
preview.render_views(objs, pth, views=('face', 'faceside'), toon=True, engine='EEVEE', size=(450, 520), center=(0, 0, 1.55 if sex == 'female' else 1.7), height=1.0)
im = bpy.data.images.load(pth); w, h = im.size; face = np.array(im.pixels[:]).reshape(h, w, 4)[:, :, :]; bpy.data.images.remove(im)
face = face[:, :min(face.shape[1], 900)]
while len(row) < 3: row.append(np.zeros_like(top[:, :300]))
row = np.concatenate(row[:3], axis=1)
fc = np.zeros_like(top); fc[:face.shape[0], :min(face.shape[1], top.shape[1])] = face[:, :top.shape[1]]
sheet = np.concatenate([fc, row, top], axis=0)
sheet = sheet[::1]
out = os.path.join(OUT, 'blender-robo-%s-%s.png' % (kind, sex[0]))
im = bpy.data.images.new('s', sheet.shape[1], sheet.shape[0], alpha=True); im.pixels = sheet.ravel().tolist()
im.filepath_raw = out; im.file_format = 'PNG'; im.save(); print('wrote', out)
