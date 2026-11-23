"""Two-handed clip check: body (+ hair / outfit) with a game-like rifle or staff on the rightHand bone (anim.GRIP2H) -> contact sheet
tools/out/blender-2h-<sex>-<weapon>.png
usage: NEED_GL=1 run.sh weaponcheck.py <sex> <rifle|staff> [hair] [outfit] [clip:frame:view,...]"""
import sys
from common import *
import rig, anim, hair, clothes, preview
import numpy as np

a = sys.argv[1:]; sex, wpn = a[0], a[1]; st = a[2] if len(a) > 2 else 'short'; kind = a[3] if len(a) > 3 else 'field'
DEF = {'rifle': 'idle_2h:15:three,walk_2h:8:three,run_2h:6:three,aim_2h:1:front,aim_2h:1:side,shoot_2h:3:three',
       'staff': 'idle_2h:15:three,attack_2h:1:side,attack_2h:11:side,attack_2h:17:three,attack_2h:23:side,attack_2h:29:front'}
poses = (a[4] if len(a) > 4 else DEF[wpn]).split(',')
reset(); P, arm, body, fixed = rig.build_body(sex)
anim.author(arm, P)
objs = [body]
if st != '-': o, sp = hair.build_hair(st, arm, P, hair.HAIR_COLORS['brown'], hair.HAIR_TIPS['brown']); objs.append(o)
if kind != '-': parts, sps = clothes.build_outfit(kind, body, arm, P, sex); objs += parts


def weapon(arm, kind):
    """game three/weapons.js geometry (x1.2) in the weapon frame -> rightHand bone space via GRIP2H"""
    bm = bmesh.new(); S = 1.2
    def box(w, h, d, x, y, z, rx=0.0):
        r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r['verts']:
            p = Vector((v.co.x * w, v.co.y * h, v.co.z * d)); p = Matrix.Rotation(rx, 3, 'X') @ p; v.co = (p + Vector((x, y, z))) * S
    def cyl(r_, y0, y1, axis='Y', y=0.0):
        res = bmesh.ops.create_cone(bm, cap_ends=True, radius1=r_, radius2=r_, depth=y1 - y0, segments=8)
        for v in res['verts']:
            c = v.co.copy()
            v.co = (Vector((c.x, c.z + (y0 + y1) / 2, c.y)) if axis == 'Y' else Vector((c.x, c.y + y, c.z + (y0 + y1) / 2))) * S
    if kind == 'rifle':
        box(0.032, 0.1, 0.045, 0, 0, -0.005, -0.25); box(0.05, 0.085, 0.5, 0, 0.075, 0.12); box(0.032, 0.13, 0.05, 0, 0.0, 0.2, 0.15)
        box(0.042, 0.1, 0.26, 0, 0.045, -0.24, 0.12); cyl(0.015, 0.36, 0.66, 'Z', 0.09)
    else:
        cyl(0.022, -0.6, 0.86); cyl(0.03, 0.82, 0.88); box(0.09, 0.13, 0.09, 0, 0.97, 0)
    B = Matrix(anim.GRIP2H['basis']).transposed(); t = Vector(anim.GRIP2H['pos'])
    for v in bm.verts: v.co = t + B @ v.co
    me = bpy.data.meshes.new('Wpn'); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('Wpn', me); link(o)
    o.data.materials.append(mat_toon('WpnM', srgb('#d0603a')))
    o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = 'rightHand'; o.matrix_parent_inverse = Matrix()
    o.location = (0, -arm.data.bones['rightHand'].length, 0)
    return o


objs.append(weapon(arm, wpn))
sc = bpy.context.scene; size = (300, 480); pth = os.path.join(WORK, 'wc.png'); row = []
for q in poses:
    c, fr, view = q.split(':')
    arm.animation_data.action = bpy.data.actions[c]; sc.frame_set(int(fr)); bpy.context.view_layer.update()
    preview.render_views(objs, pth, views=(view,), toon=True, engine='EEVEE', size=size, center=(0, 0, 1.05), height=2.2)
    im = bpy.data.images.load(pth); w, h = im.size; row.append(np.array(im.pixels[:]).reshape(h, w, 4)); bpy.data.images.remove(im)
while len(row) % 3: row.append(np.zeros_like(row[0]))
sheet = np.concatenate([np.concatenate(row[i:i + 3], axis=1) for i in range(0, len(row), 3)][::-1], axis=0)
out = os.path.join(OUT, 'blender-2h-%s-%s.png' % (sex[0], wpn))
im = bpy.data.images.new('s', sheet.shape[1], sheet.shape[0], alpha=True); im.pixels = sheet.ravel().tolist()
im.filepath_raw = out; im.file_format = 'PNG'; im.save(); print('wrote', out)
