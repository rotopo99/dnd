"""Assemble the base body: skin mesh + hands + head -> one mesh, armature, automatic weights, shape keys, materials."""
from common import *
from skeleton import *
from bodymesh import build_skin
from head import build_head, add_expressions, HH
import face_atlas

SKIN_RGB = {'light': '#ffd9c2', 'tan': '#edbd99', 'dark': '#9e6e54'}


def bones_of(arm): return [b.name for b in arm.data.bones]


def auto_weights(mesh, arm):
    mode('OBJECT')
    for o in bpy.context.scene.objects: o.select_set(False)
    mesh.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')


def nearest_bone_fallback(mesh, arm):
    """Vertices that got no weight: nearest bone segment."""
    names = bones_of(arm)
    segs = [(arm.data.bones[n].head_local, arm.data.bones[n].tail_local, n) for n in names]
    def d(p, a, b):
        ab = b - a; t = max(0, min(1, (p - a).dot(ab) / max(1e-9, ab.length_squared))); return (p - (a + ab * t)).length
    fixed = 0
    for v in mesh.data.vertices:
        if not any(g.weight > 1e-4 for g in v.groups):
            best = min(segs, key=lambda s: d(v.co, s[0], s[1])); mesh.vertex_groups[best[2]].add([v.index], 1.0, 'REPLACE'); fixed += 1
    return fixed


def limit_and_normalize(mesh, maxinf=4):
    bpy.context.view_layer.objects.active = mesh
    mode('OBJECT', mesh)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=maxinf)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)


def body_shapekeys(o, P, sex):
    hs = P['hs']
    if not o.data.shape_keys: o.shape_key_add(name='Basis')
    base = [v.co.copy() for v in o.data.vertices]; nrm = [v.normal.copy() for v in o.data.vertices]
    g = lambda d, s: math.exp(-d * d / (2 * s * s))
    def key(name, fn, lo=0.0, hi=1.0):
        k = o.shape_key_add(name=name, from_mix=False); k.slider_min, k.slider_max = lo, hi
        for i, co in enumerate(base):
            d = fn(co, nrm[i])
            if d is not None: k.data[i].co = co + d
        return k
    def bust(co, n):
        if co.y > -0.02: return None
        r = Vector((0, 0, 0))
        for sx in (1, -1):
            c = Vector((sx * 0.078 * (hs ** 0.5), -0.06, 1.305 * hs)); dv = co - c
            w = g(dv.length, 0.052 * hs)
            r += w * (Vector((sx * 0.20, -1, 0.10)).normalized() * 0.032 * hs / 0.935 + Vector((0, 0, -0.004))) * (1.0 if abs(co.x) < 0.13 else 0)
        return r if r.length > 0 else None
    key('bust', bust, -0.5, 1.0)
    def hips(co, n):
        if co.z > 1.1 * hs or co.z < 0.45 * hs or abs(co.x) > 0.3: return None
        w = g(co.z - 0.90 * hs, 0.11 * hs)
        return Vector((co.x * 0.12 * w, co.y * 0.10 * w + (-0.008 * w if co.y > 0 else 0.0), 0))
    key('hips', hips, -0.5, 1.0)
    def shoulders(co, n):
        if co.z < 1.28 * hs or co.z > 1.55 * hs: return None
        w = g(co.z - 1.42 * hs, 0.06 * hs) * (1 if abs(co.x) < 0.40 else 0)
        return Vector((co.x * 0.09 * w if abs(co.x) < 0.24 else math.copysign(0.09 * 0.24 * w, co.x), 0, 0))
    key('shoulders', shoulders, -0.5, 1.0)
    def build(co, n):
        if co.z > 1.5 * hs: return None
        w = 0.55 + 0.45 * g(co.z - 1.05 * hs, 0.16 * hs)
        belly = max(0, -n.y) * g(co.z - 1.08 * hs, 0.07 * hs) * 0.016 if abs(co.x) < 0.16 else 0
        return n * 0.011 * w + Vector((0, -belly, 0))
    key('build', build, -1.0, 1.0)
    def legs_long(co, n):
        z0 = 0.92 * hs
        return Vector((0, 0, (co.z - z0) * 0.07 if co.z < z0 else 0.07 * (0.0)) ) if co.z < z0 else Vector((0, 0, 0.0))
    # proportion: legs longer (feet stay put, body above hips rises)
    def prop(co, n):
        z0 = 0.92 * hs
        return Vector((0, 0, 0.065 * z0 * (1 if co.z >= z0 else (co.z / z0))))
    key('legs_long', prop, -1.0, 1.0)
    key('height', lambda co, n: Vector((0, 0, co.z * 0.06)), -1.0, 1.0)


def build_body(sex='female', skin='light', hair_rgb=(0.3, 0.2, 0.17), iris=(0.25, 0.62, 0.75), mat_prefix=''):
    P = FEMALE if sex == 'female' else MALE
    arm = build_armature(P, 'Armature')
    body = build_skin(P, 2, 'body'); hands = build_skin(P, 1, 'hands'); head = build_head(P, sex)
    mats = bpy.data.materials
    skin_mat = mat_toon(mat_prefix + 'Skin', srgb(SKIN_RGB[skin]))
    # face atlas
    arr = face_atlas.draw_face(sex, 'neutral', skin, iris=iris, brow=hair_rgb, hs=P['hs'])
    img = face_atlas.make_image(mat_prefix + 'FaceAtlas', arr)
    face_mat = mat_toon(mat_prefix + 'Face', (1, 1, 1), tex=img)
    body.data.materials.append(skin_mat); hands.data.materials.append(skin_mat); head.data.materials.append(face_mat)
    for o in (body, hands):
        for p in o.data.polygons: p.material_index = 0
    # weights for body / hands (automatic), head rigid
    for o in (body, hands):
        auto_weights(o, arm)
    for n in bones_of(arm): head.vertex_groups.new(name=n)
    head.vertex_groups['head'].add(list(range(len(head.data.vertices))), 1.0, 'REPLACE')
    head.parent = arm; md = head.modifiers.new('Armature', 'ARMATURE'); md.object = arm
    nb, nh, nhd = len(body.data.vertices), len(hands.data.vertices), len(head.data.vertices)
    for o in (body, hands, head): o.select_set(False)
    mode('OBJECT')
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in (body, hands, head): o.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body.name = 'Body'; body.data.name = 'Body'
    body.data.uv_layers.active = body.data.uv_layers[0]; body.data.uv_layers[0].active_render = True
    fixed = nearest_bone_fallback(body, arm)
    limit_and_normalize(body)
    zchin, y0 = head['zchin'] if False else None, None
    J = joints(P); zchin = J['head'][2]; y0 = J['head'][1]
    add_expressions(body, P, zchin, y0, nb + nh, nb + nh + nhd)
    body_shapekeys(body, P, sex)
    body['sex'] = sex
    body.parent = arm
    return P, arm, body, fixed
