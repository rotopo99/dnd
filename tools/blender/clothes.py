"""Four outfits as separate skinned meshes built from the body surface (offset shells + props):
  field   - utilitarian jacket + chest rig + backpack + cargo trousers + boots (orange accent)
  uniform - piped double-breasted coat, pleated skirt (female, spring bones) or trousers, shoes
  cyber   - skin-tight high-neck bodysuit with glowing cyan lines, pauldron, thigh rings, boots
  rags    - wasteland: torn shirt, ragged shorts, scarf, bandages, patch, mismatched boot
Soft look: shells are offset from the body, decimated with the hem pinned, rippled with noise/crease displacement (folds), fabric textures
(weave) via projected UVs, toon-friendly flat colours. Weights and shape keys are transferred from the body."""
from common import *
from skeleton import joints
from mathutils import noise
import numpy as np

KINDS = ['field', 'uniform', 'cyber', 'rags']
COL = dict(
    field=dict(jacket='#5e6648', jacket_trim='#3f4632', pants='#4b4a42', pants_trim='#34332d', boots='#2b2623', boots_trim='#15120f', accent='#ff8a1f', gear='#3a3a34', strap='#c9c2a8'),
    uniform=dict(jacket='#27304f', jacket_trim='#6fa8e8', pants='#222a45', pants_trim='#6fa8e8', boots='#17131a', boots_trim='#0b090c', accent='#e8c25a', gear='#1c2238', strap='#e8c25a'),
    cyber=dict(jacket='#20232e', jacket_trim='#3b4052', pants='#20232e', pants_trim='#3b4052', boots='#15161d', boots_trim='#0b0b10', accent='#70d8f2', gear='#454b60', strap='#70d8f2'),
    rags=dict(jacket='#8c8a5c', jacket_trim='#6b6a45', pants='#5b4a3a', pants_trim='#3b2519', boots='#3b2519', boots_trim='#2a1a10', accent='#c42828', gear='#8d95a8', strap='#d8c9a0'))


# ------------------------------------------------------------------ materials / textures
def fabric_image(name, hexcol, kind='weave'):
    """128 px tiling fabric: colour x thread pattern (weave / knit / leather / tech panel)."""
    N = 128; h_ = hexcol.lstrip('#'); c = np.array([int(h_[i:i + 2], 16) / 255 for i in (0, 2, 4)]); u, v = np.meshgrid(np.arange(N), np.arange(N))
    if kind == 'weave': p = 0.5 + 0.5 * np.sin(u * 2 * math.pi / 4) * np.sin(v * 2 * math.pi / 4); k = 0.14
    elif kind == 'knit': p = 0.5 + 0.5 * np.sin((u + (v // 4 % 2) * 2) * 2 * math.pi / 8) ; k = 0.16
    elif kind == 'leather': p = np.random.RandomState(3).rand(N, N) * 0.5 + 0.5 * (0.5 + 0.5 * np.sin(u * 0.3 + v * 0.17)); k = 0.08
    else: p = ((u // 16 + v // 16) % 2) * 0.4 + 0.3 * (u % 16 == 0) + 0.3 * (v % 16 == 0); k = 0.07      # tech panels
    img = np.ones((N, N, 4)); img[..., :3] = np.clip(c[None, None, :] * (1 - k + k * p[..., None] * 2 * 0.5 + k * 0.5), 0, 1)
    tmp = bpy.data.images.new(name + '_t', N, N, alpha=True); tmp.pixels = img.ravel().tolist()
    pth = os.path.join(WORK, name + '.png'); tmp.filepath_raw = pth; tmp.file_format = 'PNG'; tmp.save(); bpy.data.images.remove(tmp)
    im = bpy.data.images.load(pth); im.name = name; im.pack(); return im


def fab(name, hexcol, kind='weave', emissive=False):
    if emissive:
        m = mat_toon(name, srgb(hexcol)); b = m.node_tree.nodes['Principled BSDF']
        for k in ('Emission Color', 'Emission'):
            if k in b.inputs: b.inputs[k].default_value = (*srgb(hexcol), 1)
        if 'Emission Strength' in b.inputs: b.inputs['Emission Strength'].default_value = 2.0
    else:
        m = mat_toon(name, (1, 1, 1), tex=fabric_image(name + 'Tex', hexcol, kind))
    m.use_backface_culling = False
    return m


def project_uv(o, scale=9.0):
    """Box-projected UV per polygon (dominant normal axis) - enough for tiling fabric."""
    me = o.data; uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        n = p.normal; a = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = ((c.y, c.z), (c.x, c.z), (c.x, c.y))[a]
            uv.data[li].uv = (uv.data[li].uv[0] * scale, uv.data[li].uv[1] * scale)
    me.uv_layers.active = uv


# ------------------------------------------------------------------ shells
def cut_z(bm, z0=None, z1=None):
    for z, clear in ((z0, 'clear_inner'), (z1, 'clear_outer')):
        if z is None: continue
        g = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=g, plane_co=(0, 0, z), plane_no=(0, 0, 1), **{clear: True})


def cut_x(bm, xa):
    for sx in (1, -1):
        g = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=g, plane_co=(sx * xa, 0, 0), plane_no=(sx, 0, 0), clear_outer=True)


def ragged_cut(bm, zfn, keep='above'):
    """delete faces whose centre is below zfn(x, y, z-angle) -> serrated cloth edge (no smoothing of the stair-step is wanted)."""
    bad = [f for f in bm.faces if (f.calc_center_median().z < zfn(f.calc_center_median()) if keep == 'above' else f.calc_center_median().z > zfn(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=bad, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context='VERTS')


def shell(body, z0, z1, xarm=None, off=0.010, offfn=None, ragged=None):
    bm = bmesh.new(); bm.from_mesh(body.data)
    if xarm is not None: cut_x(bm, xarm)
    cut_z(bm, z0, z1)
    if ragged: ragged_cut(bm, ragged)
    bm.normal_update()
    for v in bm.verts: v.co += v.normal * (offfn(v.co) if offfn else off)
    return bm


def to_object(bm, name, ratio=None, pin_z=None, pin_eps=0.04):
    """bm -> object; decimate keeping open boundaries (hem) pinned, then snap pinned hem verts to the cut plane(s) -> clean straight hem."""
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); link(o)
    if ratio:
        md = o.modifiers.new('Dec', 'DECIMATE'); md.ratio = ratio; md.use_collapse_triangulate = False
        mode('OBJECT', o); apply_modifiers(o)
    o.vertex_groups.clear()
    if o.data.shape_keys: o.shape_key_clear()
    if pin_z:
        bm2 = bmesh.new(); bm2.from_mesh(o.data)
        for e in bm2.edges:
            if e.is_boundary:
                for v in e.verts:
                    for z in pin_z:
                        if abs(v.co.z - z) < pin_eps: v.co.z = z
        bm2.to_mesh(o.data); bm2.free()
    smooth_shade(o)
    return o


def fold_displace(o, P, creases=(), noise_amp=0.0012, noise_scale=14.0, seed=0.0):
    """Cloth-like relief: low-amplitude noise + crease bands. creases: (axis 'z'|'x', centre, half-width, amplitude, frequency per rad, phase)."""
    me = o.data; bm = bmesh.new(); bm.from_mesh(me); bm.normal_update()
    for v in bm.verts:
        co = v.co; d = noise.noise(Vector((co.x, co.y, co.z)) * noise_scale + Vector((seed, seed, seed))) * noise_amp
        for ax, c, w, amp, fr, ph in creases:
            t = (co.z if ax == 'z' else abs(co.x)) - c
            if abs(t) < w * 2:
                ang = math.atan2(co.x, -co.y) if ax == 'z' else math.atan2(co.y, co.z - 1.4)
                d += amp * math.exp(-(t / w) ** 2) * math.sin(ang * fr + ph)
        v.co += v.normal * d
    bm.to_mesh(me); bm.free(); me.update()


def rbox(bm, c, s, rot=0.0, bevel=0.006):
    """bevelled (rounded) box"""
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r['verts']:
        p = Vector((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2]))
        if rot: p = Matrix.Rotation(rot, 3, 'Z') @ p
        v.co = p + Vector(c)
    edges = list({e for v in r['verts'] for e in v.link_edges})
    if bevel: bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=2, affect='EDGES')
    return r['verts']


def band(bm, c, rx, ry, h, axis='Z', seg=32, bulge=0.0):
    r = bmesh.ops.create_cone(bm, cap_ends=False, radius1=1.0, radius2=1.0, depth=h, segments=seg)
    for v in r['verts']:
        p = Vector((v.co.x * rx, v.co.y * ry, v.co.z))
        if axis == 'X': p = Vector((p.z, p.y, p.x))
        v.co = p + Vector(c)
    return r['verts']


def blob(bm, c, r, sc=(1, 1, 1), seg=12, rings=8):
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    for v in res['verts']: v.co = Vector((v.co.x * sc[0], v.co.y * sc[1], v.co.z * sc[2])) + Vector(c)


def collar(bm, zcut, rise, shrink):
    edges = [e for e in bm.edges if e.is_boundary and all(abs(v.co.z - zcut) < 0.02 for v in e.verts)]
    r = bmesh.ops.extrude_edge_only(bm, edges=edges)
    vs = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
    cx = sum(v.co.x for v in vs) / len(vs); cy = sum(v.co.y for v in vs) / len(vs)
    for v in vs:
        v.co.z += rise; v.co.x = cx + (v.co.x - cx) * shrink; v.co.y = cy + (v.co.y - cy) * shrink


def assign_mats(o, fn):
    for p in o.data.polygons: p.material_index = fn(p.center)


# ------------------------------------------------------------------ pleated skirt (cone, box pleats, spring bones)
def pleated_skirt(P, zt, zb, flare, pleats=22, rows=9, seg_per=4):
    hs = P['hs']; hw, ww, cw, cd = P['torso']
    bm = bmesh.new(); seg = pleats * seg_per; rings = []
    for j in range(rows + 1):
        f = j / rows; z = zt + (zb - zt) * f
        rx = (hw + 0.012) + flare * f ** 0.9; ry = 0.108 + flare * 0.95 * f ** 0.9
        rr = []
        for i in range(seg):
            a = 2 * math.pi * i / seg; ph = (i % seg_per) / seg_per         # phase in a pleat 0..1
            tri = abs(2 * ph - 1)                                           # 0 .. 1 .. 0
            depth = 0.020 * (f ** 0.7) * (1 if f > 0.04 else 0.0)
            k = 1 - depth * (1 - smooth01(tri))                              # rounded fold
            rr.append(bm.verts.new((math.sin(a) * rx * k, -math.cos(a) * ry * k, z + 0.006 * f * math.sin(a * pleats * 0.5))))
        rings.append(rr)
    for j in range(rows):
        for i in range(seg): bm.faces.new((rings[j][i], rings[j][(i + 1) % seg], rings[j + 1][(i + 1) % seg], rings[j + 1][i]))
    bm.normal_update()
    return bm


def smooth01(x): x = max(0, min(1, x)); return x * x * (3 - 2 * x)


def skirt_springs(o, arm, P, nsec=8):
    """8 sectors x 2 bones (parent hips); weights: hips (top) -> bone0 -> bone1 (hem) + a share of the thighs so legs do not cut the cloth."""
    J = joints(P); hs = P['hs']; zt = 1.0 * hs; zb = 0.60 * hs
    mode('OBJECT', arm); mode('EDIT', arm); eb = arm.data.edit_bones; names = []
    for k in range(nsec):
        a = 2 * math.pi * k / nsec; rx = (P['torso'][0] + 0.03 + 0.03); ry = 0.12
        pts = []
        for f in (0.15, 0.55, 1.0):
            r_ = (P['torso'][0] + 0.012 + 0.05 * f * 0.9); y_ = 0.108 + 0.0475 * f
            pts.append(Vector((math.sin(a) * r_, -math.cos(a) * y_, zt + (zb - zt) * f)))
        prev = eb['hips']; nm = []
        for q in range(2):
            b = eb.new('skirt_%d_%d' % (k, q)); b.head = pts[q]; b.tail = pts[q + 1]; b.parent = prev; prev = b; nm.append(b.name)
        names.append(nm)
    mode('OBJECT', arm)
    allb = [b.name for b in arm.data.bones]
    for n in allb:
        if n not in o.vertex_groups: o.vertex_groups.new(name=n)
    for v in o.data.vertices:
        f = max(0.0, min(1.0, (zt - v.co.z) / (zt - zb)))
        a = math.atan2(v.co.x, -v.co.y) % (2 * math.pi); s = a / (2 * math.pi) * nsec; k0 = int(s) % nsec; fr = s - int(s)
        w = {}
        leg = 'leftUpperLeg' if v.co.x > 0 else 'rightUpperLeg'
        w_leg = 0.35 * smooth01(f * 1.3) * (1 if abs(v.co.y) > 0.0 else 0)
        if f < 0.02: w['hips'] = 1.0
        else:
            ws = smooth01(f / 0.5)                  # hips -> spring bone 0
            wh = 1 - ws; wb0 = ws * (1 - smooth01((f - 0.5) / 0.5)); wb1 = ws * smooth01((f - 0.5) / 0.5)
            for kk, ww in ((k0, 1 - fr), ((k0 + 1) % nsec, fr)):
                w['skirt_%d_0' % kk] = w.get('skirt_%d_0' % kk, 0) + ww * wb0 * (1 - w_leg)
                w['skirt_%d_1' % kk] = w.get('skirt_%d_1' % kk, 0) + ww * wb1 * (1 - w_leg)
            w['hips'] = wh * (1 - w_leg); w[leg] = w_leg
        for b, x in w.items():
            if x > 1e-4: o.vertex_groups[b].add([v.index], x, 'REPLACE')
    return [dict(name='skirt%d' % k, bones=nm, stiffness=0.35, gravityPower=0.1, gravityDir=[0, -1, 0], dragForce=0.4, hitRadius=0.04) for k, nm in enumerate(names)]


# ------------------------------------------------------------------ outfits
def build_outfit(kind, body, arm, P, sex):
    hs = P['hs']; C = COL[kind]; sw = P['sw']; J = joints(P); hw, ww, cw, cd = P['torso']
    parts = []; springs = []; hem = 0.86 * hs; neck = 1.50 * hs; xs = sw + 0.50 * hs
    M = lambda n, k, kindt='weave', em=False: fab(kind + n, C[k], kindt, em)
    cloth = 'knit' if kind in ('cyber',) else 'weave'
    sex_f = sex == 'female'
    if kind in ('field', 'uniform'):
        def joff(co):
            if abs(co.x) > sw + 0.03: return 0.011 + 0.003 * min(1, (abs(co.x) - sw) / 0.3)
            return 0.010 + (0.006 if co.z > 1.28 * hs else 0.0) * (1 if kind == 'uniform' else 0.4)
        bm = shell(body, hem, neck, xs, offfn=joff)
        collar(bm, neck, 0.03 if kind == 'uniform' else 0.022, 0.93)
        if kind == 'uniform':
            for sx in (1, -1):
                blob(bm, (sx * (sw - 0.02), 0, 1.49 * hs), 0.05, (1.5, 1.3, 0.25))                                      # epaulettes
            for k in range(3):
                for sx in (1, -1): blob(bm, (sx * 0.03, -(cd + 0.018 + 0.006 * (k == 0)), (1.12 + 0.1 * k) * hs), 0.0095)
            band(bm, (0, 0.0, 1.0 * hs), hw * 0.88 + 0.012, 0.11, 0.035)
        else:
            for k, sx in enumerate((-1, 0, 1)): rbox(bm, (sx * 0.058, -(cd + 0.026), 1.22 * hs), (0.050, 0.036, 0.076), bevel=0.008)       # pouches
            rbox(bm, (0, -(cd + 0.02), 1.31 * hs), (0.20, 0.03, 0.03), bevel=0.01)
            rbox(bm, (0, cd + 0.06, 1.24 * hs), (0.25, 0.12, 0.30), bevel=0.03)                                                       # backpack
            band(bm, (0, 0, 0.97 * hs), hw * 0.9 + 0.012, 0.115, 0.045)
            for sx in (1, -1):
                band(bm, (sx * (sw + 0.14 * hs), 0, 1.435 * hs), 0.062, 0.062, 0.045, axis='X')
                blob(bm, (sx * (sw - 0.01), 0, 1.50 * hs), 0.06, (1.2, 1.1, 0.45))                                                   # pauldron pad
        jk = to_object(bm, 'Jacket', 0.55, pin_z=[hem, neck])
        fold_displace(jk, P, creases=[('z', 1.0 * hs, 0.03, 0.0035, 7, 0.3), ('x', xs * 0.52 + 0.04, 0.03, 0.0035, 3, 0.0)], seed=1.0)
        for i, (n, k, kt) in enumerate((('', 'jacket', cloth), ('Trim', 'jacket_trim', cloth), ('Accent', 'accent', 'weave'), ('Gear', 'gear', 'leather'))): jk.data.materials.append(M(n or 'Main', k, kt))
        def jm(c):
            if abs(c.x) > xs - 0.035: return 1
            if c.z < hem + 0.035 or c.z > neck - 0.005: return 1
            if kind == 'uniform' and abs(c.x) < 0.011 and c.y < 0: return 1
            if kind == 'field' and abs(abs(c.x) - (sw + 0.14 * hs)) < 0.03 and c.z > 1.3 * hs: return 2
            if abs(c.x) < 0.35 and c.y < -(cd + 0.012) and (c.z < 1.28 * hs and c.z > 1.15 * hs) and kind == 'field': return 3
            if c.y > cd + 0.03 or (kind == 'uniform' and abs(abs(c.x) - sw) < 0.06 and c.z > 1.46 * hs): return 3 if kind == 'field' else 2
            if kind == 'uniform' and c.z > 0.97 * hs and c.z < 1.03 * hs and abs(c.x) < 0.3: return 3
            return 0
        assign_mats(jk, jm); parts.append(jk)
        # lower body
        if kind == 'uniform' and sex_f:
            bm = pleated_skirt(P, 1.0 * hs, 0.58 * hs, 0.05)
            sk = to_object(bm, 'Skirt'); sk.data.materials.append(M('Skirt', 'pants')); sk.data.materials.append(M('SkirtTrim', 'pants_trim'))
            assign_mats(sk, lambda c: 1 if c.z < 0.58 * hs + 0.022 else 0); parts.append(sk)
            springs += skirt_springs(sk, arm, P)
            bpy.context.view_layer.objects.active = sk; mode('OBJECT', sk); bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
        else:
            bm = shell(body, 0.20 * hs, 1.0 * hs, None, offfn=lambda co: 0.009 + 0.004 * (1 if co.z < 0.45 * hs else 0))
            if kind == 'field':
                for sx in (1, -1):
                    rbox(bm, (sx * P['hx'] * 1.0, -0.062, 0.50 * hs), (0.07, 0.03, 0.09), bevel=0.012)
                    rbox(bm, (sx * (P['hx'] + 0.075), 0.0, 0.78 * hs), (0.035, 0.08, 0.11), bevel=0.01)
            pn = to_object(bm, 'Pants', 0.4, pin_z=[0.20 * hs, 1.0 * hs])
            fold_displace(pn, P, creases=[('z', 0.50 * hs, 0.03, 0.003, 5, 0.0), ('z', 0.25 * hs, 0.03, 0.003, 5, 1.0)], seed=3.0)
            for n, k, kt in (('', 'pants', cloth), ('Trim', 'pants_trim', cloth), ('Gear', 'gear', 'leather')): pn.data.materials.append(M('Pants' + n, k, kt))
            def pm(c):
                if c.z > 0.97 * hs: return 1
                if kind == 'uniform' and abs(abs(c.x) - P['hx'] - 0.06) < 0.012: return 1
                if kind == 'field' and (c.y < -0.05 and 0.44 * hs < c.z < 0.56 * hs or abs(abs(c.x) - P['hx'] - 0.075) < 0.04 and 0.7 * hs < c.z < 0.86 * hs and abs(c.y) < 0.09): return 2
                return 0
            assign_mats(pn, pm); parts.append(pn)
        zt = 0.22 * hs if kind == 'field' else 0.11 * hs
        bm = shell(body, -0.01, zt, None, offfn=lambda co: 0.016 if kind == 'field' else 0.011)
        bt = to_object(bm, 'Boots', 0.5, pin_z=[zt])
    elif kind == 'cyber':
        # skin-tight suit: arms to wrists, legs to ankles, high neck; glowing seams (accent material, emissive)
        bm = shell(body, 0.07 * hs, 1.49 * hs, xs - 0.02, off=0.0042)
        collar(bm, 1.49 * hs, 0.028, 0.95)
        band(bm, (0, 0, 1.0 * hs), hw * 0.88 + 0.008, 0.108, 0.030)                                       # belt
        for sx in (1, -1):
            blob(bm, (sx * (sw - 0.005), 0, 1.495 * hs), 0.06, (1.3, 1.15, 0.5))                           # pauldron
            for t in (0.30, 0.62): band(bm, (sx * (sw + t * 0.5 * hs), 0, 1.435 * hs), 0.046 * (0.88), 0.046, 0.012, axis='X')   # arm rings
            for z in (0.78, 0.30): band(bm, (sx * P['hx'], 0, z * hs), 0.082 if z > 0.5 else 0.054, 0.085 if z > 0.5 else 0.058, 0.016)     # leg rings
        bs = to_object(bm, 'Suit', 0.35, pin_z=[0.07 * hs, 1.49 * hs])
        fold_displace(bs, P, creases=[('x', xs * 0.52 + 0.04, 0.025, 0.0015, 3, 0.0), ('z', 0.50 * hs, 0.025, 0.0015, 5, 0.0)], noise_amp=0.0004, seed=5.0)
        for n, k, kt, em in (('Suit', 'jacket', 'knit', False), ('Plate', 'gear', 'tech', False), ('Glow', 'accent', 'weave', True), ('Trim', 'jacket_trim', 'knit', False)): bs.data.materials.append(fab('Cyber' + n, C[k], kt, em))
        def sm_(c):
            ax = abs(c.x)
            if c.z > 1.49 * hs - 0.02: return 2                                                       # neck ring glows
            if ax < 0.006 and c.y < 0 and 1.0 * hs < c.z < 1.40 * hs: return 2                          # centre seam
            if abs(ax - (hw * 0.70)) < 0.006 and 0.20 * hs < c.z < 0.97 * hs: return 2                  # leg side lines
            if ax > xs - 0.03 or c.z < 0.10 * hs: return 3
            if abs(c.z - 1.0 * hs) < 0.02 and ax < 0.3: return 1
            if abs(ax - (hw * 0.70)) < 0.03 and False: return 1
            return 0
        assign_mats(bs, sm_)
        parts.append(bs); bt = None
        bm = shell(body, -0.01, 0.20 * hs, None, offfn=lambda co: 0.013)
        bt = to_object(bm, 'Boots', 0.5, pin_z=[0.20 * hs])
    else:   # rags
        jag = lambda c: 0.02 * math.sin(math.atan2(c.x, -c.y) * 9 + c.x * 7) + 0.03 * abs(math.sin(math.atan2(c.x, -c.y) * 4.3))
        bm = shell(body, None, neck, sw + 0.13 * hs, offfn=lambda co: 0.009 + 0.004 * (1 if co.z > 1.3 * hs else 0),
                   ragged=lambda c: hem + 0.10 * hs + jag(c) + (0.05 if abs(c.x) > sw else 0.0) * 0 if c.z < 1.3 * hs else -9)
        bm.normal_update()
        # left shoulder torn away: cut a diagonal piece (sleeve missing on the right)
        bad = [f for f in bm.faces if f.calc_center_median().x < -(sw - 0.01) and f.calc_center_median().z > 1.30 * hs]
        bmesh.ops.delete(bm, geom=bad, context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm, geom=loose, context='VERTS')
        band(bm, (sw + 0.18 * hs, 0, 1.435 * hs), 0.05, 0.05, 0.02, axis='X')
        sh = to_object(bm, 'Shirt', None)
        fold_displace(sh, P, creases=[('z', 1.12 * hs, 0.05, 0.004, 6, 0.0)], noise_amp=0.003, noise_scale=10.0, seed=7.0)
        for n, k, kt in (('Shirt', 'jacket', 'weave'), ('Trim', 'jacket_trim', 'weave')): sh.data.materials.append(fab('Rags' + n, C[k], kt))
        assign_mats(sh, lambda c: 1 if (c.z > neck - 0.01 or (c.z < 1.3 * hs and c.z < hem + 0.16 * hs and abs(c.x) < 0.01)) else 0)
        parts.append(sh)
        # shorts, one leg longer
        jagp = lambda c: 0.025 * math.sin(math.atan2(c.x, -c.y) * 11 + c.z * 30) + 0.02 * math.sin(c.x * 40)
        bm = shell(body, None, 1.0 * hs, None, offfn=lambda co: 0.010,
                   ragged=lambda c: (0.52 * hs if c.x > 0 else 0.68 * hs) + jagp(c))
        rbox(bm, (-P['hx'] - 0.082, 0.0, 0.75 * hs), (0.03, 0.07, 0.09), bevel=0.01)     # patch pocket
        pn = to_object(bm, 'Shorts', None)
        fold_displace(pn, P, creases=[('z', 0.97 * hs, 0.03, 0.004, 8, 0.0)], noise_amp=0.003, noise_scale=9.0, seed=9.0)
        for n, k in (('Shorts', 'pants'), ('Trim', 'pants_trim')): pn.data.materials.append(fab('Rags' + n, C[k], 'weave'))
        assign_mats(pn, lambda c: 1 if (c.z > 0.97 * hs or (abs(c.x + P['hx'] + 0.082) < 0.03 and abs(c.z - 0.75 * hs) < 0.07 and c.y < 0)) else 0)
        parts.append(pn)
        # scarf + trailing tail, bandage wraps, shoulder patch, rusty strap
        bm = bmesh.new()
        for q in range(3): band(bm, (0, 0.01, 1.485 * hs + 0.016 * q), 0.072 + 0.002 * q, 0.072, 0.028, seg=24)
        rbox(bm, (0.03, cd * 0.7 + 0.055, 1.38 * hs), (0.055, 0.01, 0.20), bevel=0.004)           # scarf tail on the back
        for sx in (1,):
            for q in range(5): band(bm, (sx * (sw + 0.30 * hs + 0.02 * q), 0, 1.435 * hs), 0.040, 0.040, 0.014, axis='X')   # forearm bandage
        for q in range(4): band(bm, (P['hx'], 0, 0.30 * hs + 0.025 * q), 0.052, 0.056, 0.016)
        sp = to_object(bm, 'Wraps', None)
        for n, k in (('Scarf', 'accent'),): sp.data.materials.append(fab('Rags' + n, C[k], 'knit'))
        parts.append(sp)
        bm = bmesh.new()
        blob(bm, (-(sw - 0.005), 0, 1.495 * hs), 0.06, (1.3, 1.1, 0.4))
        band(bm, (0, 0, 1.36 * hs), 0.15, 0.115, 0.03)
        mt = to_object(bm, 'Metal', None)
        mt.data.materials.append(fab('RagsMetal', C['gear'], 'leather')); parts.append(mt)
        zt = 0.20 * hs
        bm = shell(body, -0.01, zt, None, offfn=lambda co: 0.015)
        bt = to_object(bm, 'Boots', 0.5, pin_z=[zt])
    if bt is not None:
        bt.data.materials.append(fab(kind + 'Boots', C['boots'], 'leather')); bt.data.materials.append(fab(kind + 'BootsTrim', C['boots_trim'], 'leather'))
        zt_ = (0.22 * hs if kind == 'field' else (0.11 * hs if kind == 'uniform' else 0.20 * hs))
        assign_mats(bt, lambda c: 1 if (c.z < 0.03 * hs or c.z > zt_ - 0.02) else 0); parts.append(bt)
    # --- UVs, weights (transfer from body, except the skirt: own), shape keys
    bones = [b.name for b in arm.data.bones]
    for o in parts:
        project_uv(o)
        if o.name == 'Skirt': continue
        for n in bones: o.vertex_groups.new(name=n)
        copy_weights_nearest(body, o, bones)
        transfer_shapekeys(body, o)
    for o in parts:
        if o.name == 'Skirt':
            bones2 = [b.name for b in arm.data.bones]
            transfer_shapekeys(body, o)
        o.parent = arm; md = o.modifiers.new('Armature', 'ARMATURE'); md.object = arm
        o.name = 'Outfit_%s_%s' % (kind, o.name)
    return parts, springs
