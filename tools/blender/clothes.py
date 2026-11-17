"""Two outfits ('field', 'uniform') as separate skinned meshes built from the body surface (offset shells + props); weights and
shape keys are transferred from the body so they deform identically."""
from common import *
from skeleton import joints

COL = dict(
    field=dict(jacket='#5e6648', jacket_trim='#3f4632', pants='#4b4a42', pants_trim='#34332d', boots='#2b2623', boots_trim='#15120f', accent='#ff8a1f', gear='#3a3a34', strap='#c9c2a8'),
    uniform=dict(jacket='#27304f', jacket_trim='#6fa8e8', pants='#222a45', pants_trim='#6fa8e8', boots='#17131a', boots_trim='#0b090c', accent='#e8c25a', gear='#1c2238', strap='#e8c25a'))


def cut_z(bm, z0=None, z1=None):
    for z, clear in ((z0, 'clear_inner'), (z1, 'clear_outer')):
        if z is None: continue
        g = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=g, plane_co=(0, 0, z), plane_no=(0, 0, 1), **{clear: True})


def cut_x(bm, xa):
    for sx in (1, -1):
        g = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=g, plane_co=(sx * xa, 0, 0), plane_no=(sx, 0, 0), clear_outer=True)


def body_bm(body):
    me = body.data
    bm = bmesh.new(); bm.from_mesh(me)
    return bm


def shell(body, name, z0, z1, xarm=None, off=0.010, offfn=None, ratio=0.5):
    bm = body_bm(body)
    if xarm is not None: cut_x(bm, xarm)
    cut_z(bm, z0, z1)
    # drop loose bits (hands/head leftovers) are removed by the cuts; remove shape-key layers
    bm.normal_update()
    for v in bm.verts:
        o = offfn(v.co) if offfn else off
        v.co += v.normal * o
    return bm


def to_object(bm, name, ratio=None):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); link(o)
    if ratio:
        md = o.modifiers.new('Dec', 'DECIMATE'); md.ratio = ratio; md.use_collapse_triangulate = False
        mode('OBJECT', o); apply_modifiers(o)
    smooth_shade(o)
    return o


def box(bm, c, s, rot=0.0):
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r['verts']:
        p = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
        if rot: p = Matrix.Rotation(rot, 3, 'Z') @ p
        v.co = p + Vector(c)
    return r['verts']


def band(bm, c, rx, ry, h, axis='Z', seg=28, bulge=0.0):
    r = bmesh.ops.create_cone(bm, cap_ends=False, radius1=1.0, radius2=1.0, depth=h, segments=seg)
    for v in r['verts']:
        p = Vector((v.co.x * rx, v.co.y * ry, v.co.z))
        if axis == 'X': p = Vector((p.z, p.y, p.x))
        v.co = p + Vector(c)
    return r['verts']


def sphere(bm, c, r):
    res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=r)
    for v in res['verts']: v.co += Vector(c)


def collar(bm, zcut, rise, shrink):
    """extrude the open top loop of the shell upwards (stand collar)."""
    edges = [e for e in bm.edges if e.is_boundary and all(abs(v.co.z - zcut) < 0.02 for v in e.verts)]
    r = bmesh.ops.extrude_edge_only(bm, edges=edges)
    vs = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    cx = sum(v.co.x for v in vs) / len(vs); cy = sum(v.co.y for v in vs) / len(vs)
    for v in vs:
        v.co.z += rise; v.co.x = cx + (v.co.x - cx) * shrink; v.co.y = cy + (v.co.y - cy) * shrink


def assign_mats(o, fn):
    for p in o.data.polygons:
        p.material_index = fn(p.center)


def pleated_skirt(P, zt, zb, flare, seg=48, rows=7):
    hs = P['hs']; hw, ww, cw, cd = P['torso']
    me = bpy.data.meshes.new('Skirt'); bm = bmesh.new()
    rings = []
    for j in range(rows + 1):
        f = j / rows; z = zt + (zb - zt) * f
        rx = (hw + 0.02) + flare * (f ** 0.8); ry = 0.112 + flare * 0.9 * (f ** 0.8)
        ring_ = []
        for i in range(seg):
            a = 2 * math.pi * i / seg; pl = 1 + 0.055 * f * math.cos(a * 16)
            ring_.append(bm.verts.new((math.sin(a) * rx * pl, -math.cos(a) * ry * pl + 0.0, z)))
        rings.append(ring_)
    for j in range(rows):
        for i in range(seg):
            bm.faces.new((rings[j][i], rings[j][(i + 1) % seg], rings[j + 1][(i + 1) % seg], rings[j + 1][i]))
    bm.normal_update()
    return bm


def build_outfit(kind, body, arm, P, sex):
    hs = P['hs']; C = COL[kind]; sw = P['sw']; J = joints(P); hw, ww, cw, cd = P['torso']
    parts = []; hem = 0.86 * hs; neck = 1.50 * hs; xs = sw + 0.50 * hs     # sleeve end (just above the wrist)
    # --- jacket
    def joff(co):
        if abs(co.x) > sw + 0.03: return 0.011 + 0.003 * min(1, (abs(co.x) - sw) / 0.3)      # sleeves slightly wider
        return 0.010 + (0.006 if co.z > 1.28 * hs else 0.0) * (1 if kind == 'uniform' else 0.4)
    bm = shell(body, 'Jacket', hem, neck, xs, offfn=joff)
    collar(bm, neck, 0.03 if kind == 'uniform' else 0.022, 0.93)
    if kind == 'uniform':
        for sx in (1, -1): box(bm, (sx * (sw - 0.02), 0, 1.485 * hs), (0.095, 0.085, 0.012), 0.0)          # epaulettes
        box(bm, (0, 0, 0.99 * hs), (0.01, 0.01, 0.01))
        for k in range(3):
            for sx in (1, -1): sphere(bm, (sx * 0.03, -(cd + 0.018 + 0.006 * (k == 0)), (1.12 + 0.1 * k) * hs), 0.0085)
        band(bm, (0, 0.0, 1.0 * hs), hw * 0.88 + 0.012, 0.11, 0.035)
    else:
        for k, sx in enumerate((-1, 0, 1)): box(bm, (sx * 0.055, -(cd + 0.026), 1.22 * hs), (0.048, 0.034, 0.075))    # chest rig pouches
        box(bm, (0, -(cd + 0.02), 1.31 * hs), (0.20, 0.03, 0.03))
        box(bm, (0, cd + 0.06, 1.24 * hs), (0.25, 0.12, 0.30))                                                     # backpack
        band(bm, (0, 0, 0.97 * hs), hw * 0.9 + 0.012, 0.115, 0.045)                                              # belt
        for sx in (1, -1): band(bm, (sx * (sw + 0.14 * hs), 0, 1.435 * hs), 0.062, 0.062, 0.045, axis='X')       # accent armband
    jk = to_object(bm, 'Jacket', 0.55)
    jk.data.materials.append(mat_toon('Jacket', srgb(C['jacket']))); jk.data.materials.append(mat_toon('JacketTrim', srgb(C['jacket_trim'])))
    jk.data.materials.append(mat_toon('Accent', srgb(C['accent']))); jk.data.materials.append(mat_toon('Gear', srgb(C['gear'])))
    def jm(c):
        if abs(c.x) > xs - 0.035: return 1
        if c.z < hem + 0.035 or c.z > neck - 0.005: return 1
        if kind == 'uniform' and abs(c.x) < 0.011 and c.y < 0: return 1
        if kind == 'field' and abs(abs(c.x) - (sw + 0.14 * hs)) < 0.03 and c.z > 1.3 * hs: return 2
        if abs(c.x) < 0.35 and c.y < -(cd + 0.012) and (c.z < 1.28 * hs and c.z > 1.15 * hs) and kind == 'field': return 3
        if c.y > cd + 0.03 or (kind == 'uniform' and abs(abs(c.x) - sw) < 0.06 and c.z > 1.46 * hs): return 3 if kind == 'field' else 2
        if kind == 'uniform' and (c.z > 1.12 * hs and c.z < 1.34 * hs) and abs(c.x) < 0.04 and c.y < -(cd + 0.012): return 2
        if kind == 'uniform' and c.z > 0.97 * hs and c.z < 1.03 * hs and abs(c.x) < 0.3: return 3
        return 0
    assign_mats(jk, jm); parts.append(jk)
    # --- lower body
    if kind == 'uniform' and sex == 'female':
        bm = pleated_skirt(P, 1.0 * hs, 0.60 * hs, 0.05)
        sk = to_object(bm, 'Skirt')
        sk.data.materials.append(mat_toon('Skirt', srgb(C['pants']))); sk.data.materials.append(mat_toon('SkirtTrim', srgb(C['pants_trim'])))
        assign_mats(sk, lambda c: 1 if c.z < 0.60 * hs + 0.025 else 0); parts.append(sk)
        low_z1 = 0.99 * hs; legs_z0 = None
    else:
        def poff(co): return 0.009 + 0.004 * (1 if co.z < 0.45 * hs else 0)
        bm = shell(body, 'Pants', 0.20 * hs, 1.0 * hs, None, offfn=poff)
        if kind == 'field':
            for sx in (1, -1): box(bm, (sx * P['hx'] * 1.0, -0.062, 0.50 * hs), (0.07, 0.03, 0.09))      # knee pads
            for sx in (1, -1): box(bm, (sx * (P['hx'] + 0.075), 0.0, 0.78 * hs), (0.035, 0.08, 0.11))    # thigh pockets
        pn = to_object(bm, 'Pants', 0.5)
        pn.data.materials.append(mat_toon('Pants', srgb(C['pants']))); pn.data.materials.append(mat_toon('PantsTrim', srgb(C['pants_trim'])))
        pn.data.materials.append(mat_toon('Gear', srgb(C['gear'])))
        def pm(c):
            if c.z > 0.97 * hs: return 1
            if kind == 'uniform' and abs(abs(c.x) - P['hx'] - 0.06) < 0.012: return 1
            if kind == 'field' and (c.y < -0.05 and 0.44 * hs < c.z < 0.56 * hs or abs(abs(c.x) - P['hx'] - 0.075) < 0.04 and 0.7 * hs < c.z < 0.86 * hs and abs(c.y) < 0.09): return 2
            return 0
        assign_mats(pn, pm); parts.append(pn)
    # --- boots / shoes
    zt = 0.22 * hs if kind == 'field' else 0.11 * hs
    bm = shell(body, 'Boots', 0.0 - 0.01, zt, None, offfn=lambda co: 0.016 if kind == 'field' else 0.011)
    bt = to_object(bm, 'Boots', 0.5)
    bt.data.materials.append(mat_toon('Boots', srgb(C['boots']))); bt.data.materials.append(mat_toon('BootsTrim', srgb(C['boots_trim'])))
    assign_mats(bt, lambda c: 1 if (c.z < 0.03 * hs or c.z > zt - 0.02) else 0); parts.append(bt)
    # --- weights, shape keys
    bones = [b.name for b in arm.data.bones]
    for o in parts:
        for n in bones: o.vertex_groups.new(name=n)
        copy_weights_nearest(body, o, bones)
        transfer_shapekeys(body, o)
        o.parent = arm; md = o.modifiers.new('Armature', 'ARMATURE'); md.object = arm
        for m in o.data.materials: m.use_backface_culling = False
        o.data.uv_layers.new(name='UVMap')
        o.name = 'Outfit_%s_%s' % (kind, o.name)
    return parts
