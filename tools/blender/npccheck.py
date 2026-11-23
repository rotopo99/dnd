"""NPC pose check: NEED_GL=1 run.sh npccheck.py <npc id> [clip:frame:view,...] -> tools/out/blender-npcpose-<id>.png (rest front/side/back + clip frames)"""
import sys
from common import *
import npc, preview
import numpy as np

nid = sys.argv[1]
poses = (sys.argv[2] if len(sys.argv) > 2 else 'walk:8:three,run:6:side,idle_2h:10:three,attack_2h:23:three,sit:10:side,talk:20:front').split(',')
P, arm, objs, names, sp = npc.build(nid)
sc = bpy.context.scene; size = (300, 520); pth = os.path.join(WORK, 'nc.png'); row = []
preview.render_views(objs, pth, views=('front', 'side', 'back'), toon=True, engine='EEVEE', size=size, center=(0, 0, 1.0), height=2.2)
im = bpy.data.images.load(pth); w, h = im.size; rest = np.array(im.pixels[:]).reshape(h, w, 4); bpy.data.images.remove(im)
for q in poses:
    c, fr, view = q.split(':')
    arm.animation_data.action = bpy.data.actions[c]; sc.frame_set(int(fr)); bpy.context.view_layer.update()
    preview.render_views(objs, pth, views=(view,), toon=True, engine='EEVEE', size=size, center=(0, 0, 1.0), height=2.2)
    im = bpy.data.images.load(pth); w, h = im.size; row.append(np.array(im.pixels[:]).reshape(h, w, 4)); bpy.data.images.remove(im)
while len(row) % 3: row.append(np.zeros_like(row[0]))
sheet = np.concatenate(([rest] + [np.concatenate(row[i:i + 3], axis=1) for i in range(0, len(row), 3)])[::-1], axis=0)
out = os.path.join(OUT, 'blender-npcpose-%s.png' % nid)
im = bpy.data.images.new('s', sheet.shape[1], sheet.shape[0], alpha=True); im.pixels = sheet.ravel().tolist()
im.filepath_raw = out; im.file_format = 'PNG'; im.save(); print('wrote', out)
