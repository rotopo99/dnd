"""Enemy models -> enemy_<id>.glb. Humanoids (cultist, pirate, brute) are npc.py configs on the shared hero rig (same clips);
mechs (wolf: robotic quadruped, drone: Warprom gun drone) are rigid hard-surface parts on their own small armature with own clips.
build(eid) -> dict(kind, P, arm, objs, names, springs, meta)"""
from common import *
import npc
from npc import ellipsoid, tube, hat_fit, obj_of, ring_at
from clothes import fab, rbox, band, blob, smooth01, project_uv

# ------------------------------------------------------------------ humanoids (npc.build configs)
HUMANOIDS = {
    # Judge cult fanatic: knee-long purple robe with cyan circuit lines over a black bodysuit, deep hood, bone mask with cyan eye slits
    'cultist': dict(sex='male', hair=None, hc='black', skin='light', base='cyber',
                    pal=dict(jacket='#262833', jacket_trim='#3c1f46', pants='#262833', gear='#3c3f4f', boots='#141018', boots_trim='#0b090c', accent='#70d8f2', bare=True),
                    coat=dict(col='#5c2a6c', trim='#70d8f2', zb=0.30, slit=34, flare=0.09, collar=0.03, hem=0.92, pleats=0.03, glow_trim=False, circuit=True),
                    head=['hood', 'cult_mask'], body=['cord'], gait='robe', face=dict(angry=0.3)),
    # sky pirate: shaved head under a red bandana, telnyashka, dark shorts, and sash, eye patch, gold earring
    'pirate': dict(sex='male', hair=None, hc='black', skin='tan', base='rags',
                   pal=dict(jacket='#e8e4dc', shirt_tex='stripe:#1f3563', jacket_trim='#1f3563', pants='#262833', pants_trim='#14141c', boots='#3b2519',
                            boots_trim='#1a1008', accent='#c42828', gear='#c9a24a', strap='#d8c9a0'),
                   head=['bandana', 'eyepatch', 'earring'], body=['sash'], face=dict(angry=0.25, happy=0.15)),
    # mutant brute: bulky (build / shoulders baked), grey-green skin, bald, heavy brow, rusty muzzle plate, bone spikes
    'brute': dict(sex='male', hair=None, hc='black', skin='mutant', iris=(0.85, 0.75, 0.2), base='rags',
                  pal=dict(jacket='#5b4a3a', jacket_trim='#3b2519', pants='#3c3f2a', pants_trim='#262818', boots='#3b2519', boots_trim='#1a1008',
                           accent='#74c050', gear='#6e3d22', strap='#a95f2c'),
                  shape=dict(build=1.0, shoulders=1.0), bulk=1.4, head_scale=0.88, age=1.5, head=['muzzle'], body=['spikes'], face=dict(angry=0.7), scale=1.18),
}


def hg_cult_mask(H, C):
    """bone-white face plate (forehead to chin) with two slanted glowing eye slits and a purple Judge stripe"""
    bm = bmesh.new(); hs = H['hs']; cy = H['cy']; ry = (H['by'] - H['fy']) / 2
    ellipsoid(bm, (0, cy - 0.006, H['ze'] - 0.025 * hs), (H['hx'] + 0.010, ry + 0.018, 0.128 * hs), seg=28, rings=18,
              keep=lambda c: c.y < cy - 0.05 and c.z > H['zc'] - 0.012)
    for s in (1, -1):                                                                   # eye slits (float 2 mm off the plate)
        pts = []
        for k in range(7):
            a = math.radians(s * (8 + 34 * k / 6)); x = math.sin(a) * (H['hx'] + 0.013); y = cy - 0.006 - math.cos(a) * (ry + 0.021)
            pts.append([bm.verts.new((x, y, H['ze'] - 0.004 + 0.014 * k / 6 + d * (0.009 - 0.004 * k / 6) * hs)) for d in (-1, 1)])
        for r0, r1 in zip(pts[:-1], pts[1:]): bm.faces.new((r0[0], r1[0], r1[1], r0[1]))
    mats = [fab('CultMask', '#dfe3e8', 'leather'), fab('CultMaskGlow', '#70d8f2', 'weave', True), fab('CultMaskStripe', '#5c2a6c', 'leather')]
    def mf(c):
        if abs(c.z - H['ze'] - 0.004) < 0.016 and c.y < H['fy'] - 0.012 and 0.006 < abs(c.x) < H['hx']: return 1
        if abs(c.x) < 0.010 and (c.z > H['ze'] + 0.02 or c.z < H['ze'] - 0.03): return 2
        return 0
    return bm, mats, mf


def hg_bandana(H, C):
    """tight cloth cap over the hair, knot at the back of the head with two hanging tails"""
    bm = bmesh.new(); hs = H['hs']; z0 = H['ze'] + 0.045 * hs
    r0, ry0, cy, top = hat_fit(H, z0, H['zt'] + 0.1, 0.011)
    ellipsoid(bm, (0, cy + 0.004, z0), (r0, ry0, max(H['zt'], top) - z0 + 0.016), seg=28, rings=14, keep=lambda c: c.z > z0 - 0.004)
    kb = Vector((0, cy + ry0 + 0.012, z0 + 0.01))
    blob(bm, kb, 0.022, (1.2, 0.7, 0.9), seg=10, rings=7)
    for s in (1, -1):
        tube(bm, [kb + Vector((s * 0.01, 0.0, -0.01)), kb + Vector((s * 0.03, 0.03, -0.07)), kb + Vector((s * 0.04, 0.045, -0.13))], 0.010, 6)
    return bm, [fab('Bandana', C['accent'], 'weave')], None


def hg_eyepatch(H, C):
    """patch over the character's left eye (+X) and a strap around the head, tilted up towards the back"""
    from head import feature_layout
    bm = bmesh.new(); hs = H['hs']; fl = feature_layout(hs); ex, ez = fl['eye_x'] * hs, H['zc'] + fl['eye_z'] * hs
    hit = H['hit'](ex, ez)
    c = hit[0] + hit[1] * 0.004 if hit else Vector((ex, H['fy'] - 0.004, ez))
    res = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1.0)
    R = Vector((0, -1, 0)).rotation_difference(hit[1] if hit else Vector((0, -1, 0)))
    for v in res['verts']: v.co = R @ Vector((v.co.x * 0.030, v.co.y * 0.006, v.co.z * 0.026)) + c
    r0 = H['hx'] + 0.006; ry0 = (H['by'] - H['fy']) / 2 + 0.006; cy = H['cy']
    vs = band(bm, (0, cy, 0), r0, ry0, 0.008, seg=32)
    for v in vs:
        t = (v.co.y - cy) / ry0                                                         # -1 front .. 1 back
        v.co.z += ez + 0.004 + 0.045 * (t + 1) / 2 + (0.012 if v.co.x > 0 and t < 0 else 0) * (-t)
    mats = [fab('EyePatch', '#14141c', 'leather')]
    return bm, mats, None


def hg_earring(H, C):
    bm = bmesh.new(); hs = H['hs']
    from head import K
    x = -(0.095 * K * hs + 0.006); z = H['zc'] + 0.088 * K * hs - 0.028; y = H['cy'] + 0.006
    pts = [Vector((x - 0.003 * (1 - math.cos(2 * math.pi * k / 16)), y + 0.012 * math.sin(2 * math.pi * k / 16), z - 0.012 * (1 - math.cos(2 * math.pi * k / 16)))) for k in range(17)]
    tube(bm, pts, 0.0022, 6)
    return bm, [fab('Earring', '#f0b050', 'leather')], None


def hg_muzzle(H, C):
    """rusty lower-face plate with three slots and rivets (hides the soft anime mouth of the brute)"""
    bm = bmesh.new(); hs = H['hs']; zm = H['zc'] + 0.040 * hs; ry = (H['by'] - H['fy']) / 2
    ellipsoid(bm, (0, H['cy'] - 0.004, zm), (H['hx'] * 0.96, ry + 0.012, 0.060 * hs), seg=24, rings=12, keep=lambda c: c.y < H['cy'] - 0.04 and c.z < zm + 0.022 * hs)
    for k in range(3): rbox(bm, (0, H['fy'] - 0.020, zm - 0.014 + 0.013 * k), (0.046, 0.006, 0.0045), bevel=0.0015)
    for s in (1, -1): blob(bm, (s * 0.05, H['fy'] - 0.004, zm + 0.012), 0.005, seg=8, rings=5)
    for s in (1, -1): tube(bm, [Vector((s * H['hx'] * 0.9, H['cy'] - 0.01, zm + 0.012)), Vector((s * (H['hx'] + 0.006), H['cy'] + 0.04, zm + 0.03)),
                                Vector((s * H['hx'] * 0.7, H['by'] + 0.004, zm + 0.05))], 0.004, 6)
    mats = [fab('MuzzlePlate', '#6e3d22', 'leather'), fab('MuzzleSlot', '#14141c', 'leather')]
    return bm, mats, lambda c: 1 if (c.y < H['fy'] - 0.016 and abs(c.x) < 0.03) else 0


def bg_cord(body, P, C, cfg):
    hs = P['hs']; z = 1.0 * hs; x0, x1, y0, y1 = ring_at(body, z, 0.012)
    bm = bmesh.new(); rx, ry = (x1 - x0) / 2 + 0.045, (y1 - y0) / 2 + 0.05
    tube(bm, [Vector((math.sin(2 * math.pi * k / 36) * rx, -math.cos(2 * math.pi * k / 36) * ry, z)) for k in range(37)], 0.008, 6)
    for s in (1, -0.6): tube(bm, [Vector((0.05, -ry, z)), Vector((0.05 + 0.02 * s, -ry - 0.02, z - 0.12)), Vector((0.05 + 0.03 * s, -ry - 0.03, z - 0.24))], 0.006, 6)
    blob(bm, (0.08, -ry - 0.035, z - 0.26), 0.018, (1, 0.5, 1.3), seg=8, rings=6)    # Judge token
    return obj_of(bm, 'Cord', [fab('CultCord', '#d8c9a0', 'knit'), fab('CultToken', '#70d8f2', 'weave', True)], lambda c: 1 if c.z < z - 0.24 else 0)


def bg_sash(body, P, C, cfg):
    hs = P['hs']; z = 0.98 * hs; x0, x1, y0, y1 = ring_at(body, z, 0.012)
    bm = bmesh.new(); rx, ry = (x1 - x0) / 2 + 0.028, (y1 - y0) / 2 + 0.03
    band(bm, (0, 0, z), rx, ry, 0.075, seg=32)
    k = Vector((rx * 0.75, -ry * 0.7, z)); blob(bm, k, 0.03, (0.8, 0.6, 1.0), seg=10, rings=6)
    for d in (-1, 1): rbox(bm, k + Vector((0.012 * d, -0.01, -0.13)), (0.05, 0.012, 0.22), rot=0.15 * d, bevel=0.004)
    return obj_of(bm, 'Sash', [fab('PirateSash', '#c42828', 'weave')])


def bg_spikes(body, P, C, cfg):
    """bone spikes out of the shoulders, upper back and right forearm: each spike rigid on one bone"""
    from skeleton import joints
    hs = P['hs']; J = joints(P); bm = bmesh.new(); sw = P['sw']
    spikes = []
    for s, side in ((1, 'left'), (-1, 'right')):
        for k, (dx, dz, L, tilt) in enumerate(((0.0, 0.0, 0.13, 0.35), (0.06, -0.01, 0.10, 0.6), (-0.05, -0.02, 0.09, 0.15))):
            base = Vector((s * (sw - 0.03 + dx), 0.03 * k, J['upperArm'][2] + 0.05 + dz)); d = Vector((s * tilt, 0.25, 1)).normalized()
            spikes.append((base, d, L, 0.03, side + 'Shoulder'))
    for k in range(4):
        z = 1.40 * hs - 0.09 * k; x0, x1, y0, y1 = ring_at(body, z, 0.012)
        spikes.append((Vector((0, y1 + 0.025, z)), Vector((0, 1, 0.5)).normalized(), 0.15 - 0.02 * k, 0.034, 'upperChest' if k < 2 else 'chest'))
    for k in range(3):
        x = -(J['lowerArm'][0] + 0.05 + 0.07 * k); spikes.append((Vector((x, 0.02, J['lowerArm'][2] + 0.035)), Vector((-0.3, 0.3, 1)).normalized(), 0.08, 0.022, 'rightLowerArm'))
    groups = {}
    for base, d, L, r, bone in spikes:
        res = bmesh.ops.create_cone(bm, cap_ends=True, radius1=r, radius2=0.0, depth=L, segments=8)
        R = Vector((0, 0, 1)).rotation_difference(d)
        for v in res['verts']:
            v.co = R @ (v.co + Vector((0, 0, L / 2))) + base - d * 0.02
            groups.setdefault(bone, []).append(v)
    bm.verts.index_update()
    idx = {b: [v.index for v in vs] for b, vs in groups.items()}
    o = obj_of(bm, 'Spikes', [fab('BoneSpike', '#d8cfb8', 'leather')], smooth=False)
    arm = bpy.data.objects['Armature']
    for b in arm.data.bones: o.vertex_groups.new(name=b.name)
    for b, ii in idx.items(): o.vertex_groups[b].add(ii, 1.0, 'REPLACE')
    o['own_weights'] = 1
    return o


npc.HEADGEAR.update(cult_mask=hg_cult_mask, bandana=hg_bandana, eyepatch=hg_eyepatch, earring=hg_earring, muzzle=hg_muzzle)
npc.BODYGEAR.update(cord=bg_cord, sash=bg_sash, spikes=bg_spikes)


# ------------------------------------------------------------------ hard-surface helpers (mechs)
class Kit:
    """one bmesh; every part is tagged with a material index and a single bone (rigid skinning)"""
    def __init__(self, bones):
        self.bm = bmesh.new(); self.dl = self.bm.verts.layers.deform.verify(); self.fl = self.bm.faces.layers.int.new('done')
        self.bones = bones; self.gi = {b: i for i, b in enumerate(bones)}

    def tag(self, bone, mat):
        for v in self.bm.verts:
            if not v[self.dl]: v[self.dl][self.gi[bone]] = 1.0
        for f in self.bm.faces:
            if not f[self.fl]: f[self.fl] = 1; f.material_index = mat

    def prism(self, a, b, w0, h0, w1=None, h1=None, up=(0, 0, 1), bevel=0.012, bone=None, mat=0, shift=(0, 0)):
        """tapered box from a to b; section (w along side, h along up'); shift = (side, up) offset of the far end section"""
        a, b = Vector(a), Vector(b); w1 = w0 if w1 is None else w1; h1 = h0 if h1 is None else h1
        d = (b - a).normalized(); up = Vector(up); side = d.cross(up)
        if side.length < 1e-4: side = d.cross(Vector((0, 1, 0)))
        side.normalize(); upp = side.cross(d).normalized()
        vs = []
        for c, w, h, sh in ((a, w0, h0, (0, 0)), (b, w1, h1, shift)):
            for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                vs.append(self.bm.verts.new(c + side * (sx * w / 2 + sh[0]) + upp * (sz * h / 2 + sh[1])))
        F = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
        fs = [self.bm.faces.new([vs[i] for i in f]) for f in F]
        bmesh.ops.recalc_face_normals(self.bm, faces=fs)
        if bevel: bmesh.ops.bevel(self.bm, geom=list({e for f in fs for e in f.edges}), offset=bevel, segments=1, affect='EDGES')
        if bone: self.tag(bone, mat)

    def ball(self, c, r, bone, mat, sc=(1, 1, 1), seg=10, rings=6):
        blob(self.bm, c, r, sc, seg=seg, rings=rings); self.tag(bone, mat)

    def cyl(self, a, b, r0, r1=None, seg=12, bone=None, mat=0, cap=True):
        a, b = Vector(a), Vector(b); r1 = r0 if r1 is None else r1
        res = bmesh.ops.create_cone(self.bm, cap_ends=cap, radius1=r0, radius2=r1, depth=(b - a).length, segments=seg)
        R = Vector((0, 0, 1)).rotation_difference((b - a).normalized())
        for v in res['verts']: v.co = R @ v.co + (a + b) / 2
        if bone: self.tag(bone, mat)

    def obj(self, name, mats, arm, flat=True):
        me = bpy.data.meshes.new(name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        o = bpy.data.objects.new(name, me); link(o)
        for b in self.bones: o.vertex_groups.new(name=b)
        for m in mats: o.data.materials.append(m)
        for p in o.data.polygons: p.use_smooth = not flat
        project_uv(o, 4.0)
        o.parent = arm; md = o.modifiers.new('Armature', 'ARMATURE'); md.object = arm
        return o


def make_arm(name, table):
    """table: [(bone, parent, head, tail)] -> armature object (Blender: front = -Y, up = +Z)"""
    ad = bpy.data.armatures.new(name); arm = bpy.data.objects.new('Armature', ad); link(arm)
    mode('EDIT', arm)
    for n, par, h, t in table:
        b = ad.edit_bones.new(n); b.head = h; b.tail = t; b.roll = 0
        if par: b.parent = ad.edit_bones[par]
    mode('OBJECT', arm)
    return arm


class FK:
    """per-frame keys: rel[bone] = rotation relative to the parent, in armature rest axes (x: right->left, y: front->back, z: up);
    root location in armature space. Positive rotation about +X pitches a forward (-Y) pointing bone down / swings a leg backwards."""
    def __init__(self, arm, root):
        self.arm = arm; self.root = root
        self.R = {b.name: b.matrix_local.to_quaternion() for b in arm.data.bones}
        for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'

    def key(self, rel, loc, frame):
        pb = self.arm.pose.bones
        for b in pb:
            q = rel.get(b.name, Quaternion())
            b.rotation_quaternion = self.R[b.name].inverted() @ q @ self.R[b.name]; b.keyframe_insert('rotation_quaternion', frame=frame)
        r = pb[self.root]; r.location = self.R[self.root].inverted() @ Vector(loc); r.keyframe_insert('location', frame=frame)


def Q(axis, deg):
    return Quaternion(Vector(axis).normalized(), math.radians(deg))


def X(d): return Q((1, 0, 0), d)
def Y(d): return Q((0, 1, 0), d)
def Z(d): return Q((0, 0, 1), d)


def author(arm, root, clips):
    """clips: [(name, frames, fn(f) -> (rel, loc[, extra_locs]), loop)] -> clip names"""
    import anim
    fk = FK(arm, root); names = []
    for name, n, fn, loop in clips:
        act = anim.new_action(arm, name)
        for f in range(n if loop else n + 1):
            r = fn(f); fk.key(r[0], r[1], f + 1)
            for b, v in (r[2] if len(r) > 2 else {}).items():
                pbb = arm.pose.bones[b]; pbb.location = fk.R[b].inverted() @ Vector(v); pbb.keyframe_insert('location', frame=f + 1)
        act.frame_range = (1, n if loop else n + 1); act.use_frame_range = True; act['loop'] = loop
        names.append(name)
    arm.animation_data.action = None
    for pb in arm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    return names


def sm(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)


def seg(f, keys):
    """piecewise smooth interpolation of scalar keys [(frame, value)]"""
    if f <= keys[0][0]: return keys[0][1]
    for (f0, v0), (f1, v1) in zip(keys[:-1], keys[1:]):
        if f <= f1: return v0 + (v1 - v0) * sm((f - f0) / max(1e-6, f1 - f0))
    return keys[-1][1]


def gl(v): return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]     # Blender -> glTF (y up, front +Z)


# ------------------------------------------------------------------ wolf (robotic quadruped)
WOLF_COL = dict(plate='#8d95a8', frame='#3c3f4f', dark='#262833', accent='#f06a24', glow='#c42828', claw='#dfe3e8')


def wolf_table():
    T = [('pelvis', None, (0, 0.40, 0.74), (0, 0.12, 0.76)), ('spine', 'pelvis', (0, 0.12, 0.76), (0, -0.20, 0.80)),
         ('chest', 'spine', (0, -0.20, 0.80), (0, -0.40, 0.86)), ('neck', 'chest', (0, -0.40, 0.86), (0, -0.56, 1.02)),
         ('head', 'neck', (0, -0.56, 1.02), (0, -0.86, 0.98)), ('jaw', 'head', (0, -0.60, 0.95), (0, -0.84, 0.90)),
         ('tail0', 'pelvis', (0, 0.44, 0.82), (0, 0.60, 0.80)), ('tail1', 'tail0', (0, 0.60, 0.80), (0, 0.74, 0.70)), ('tail2', 'tail1', (0, 0.74, 0.70), (0, 0.84, 0.56))]
    for s, side in ((1, 'L'), (-1, 'R')):
        x = 0.16 * s
        T += [('upperArm' + side, 'chest', (x, -0.32, 0.72), (x, -0.27, 0.42)), ('foreArm' + side, 'upperArm' + side, (x, -0.27, 0.42), (x, -0.31, 0.11)),
              ('handPaw' + side, 'foreArm' + side, (x, -0.31, 0.11), (x, -0.42, 0.03)),
              ('thigh' + side, 'pelvis', (x, 0.36, 0.72), (x, 0.24, 0.44)), ('shin' + side, 'thigh' + side, (x, 0.24, 0.44), (x, 0.40, 0.22)),
              ('hock' + side, 'shin' + side, (x, 0.40, 0.22), (x, 0.37, 0.07)), ('footPaw' + side, 'hock' + side, (x, 0.37, 0.07), (x, 0.26, 0.03))]
    return T


def wolf_mesh(arm, T):
    C = WOLF_COL; mats = [fab('WolfPlate', C['plate'], 'tech'), fab('WolfFrame', C['frame'], 'tech'), fab('WolfDark', C['dark'], 'leather'),
                          fab('WolfAccent', C['accent'], 'tech'), fab('WolfEye', C['glow'], 'weave', True), fab('WolfClaw', C['claw'], 'leather')]
    PL, FR, DK, AC, EY, CL = range(6)
    J = {n: (Vector(h), Vector(t)) for n, p, h, t in T}
    k = Kit([n for n, *_ in T])
    # torso: deep armoured chest, narrow waist frame, pelvis block, dorsal fins
    k.prism((0, -0.50, 0.84), (0, -0.16, 0.82), 0.36, 0.40, 0.30, 0.30, bevel=0.03, bone='chest', mat=PL, shift=(0, 0.02))
    k.prism((0, -0.52, 0.74), (0, -0.22, 0.70), 0.22, 0.18, 0.16, 0.10, bevel=0.02, bone='chest', mat=FR)                   # keel under the chest
    k.prism((0, -0.18, 0.79), (0, 0.18, 0.77), 0.20, 0.20, 0.22, 0.22, bevel=0.02, bone='spine', mat=FR)
    for q in range(3): k.prism((0, -0.14 + 0.11 * q, 0.86), (0, -0.06 + 0.11 * q, 0.86), 0.26, 0.05, 0.24, 0.05, bevel=0.012, bone='spine', mat=PL)
    k.prism((0, 0.14, 0.78), (0, 0.48, 0.78), 0.30, 0.26, 0.26, 0.22, bevel=0.03, bone='pelvis', mat=PL)
    for q, (y, h) in enumerate(((-0.44, 0.13), (-0.32, 0.11), (-0.20, 0.08))):
        k.prism((0, y, 1.0 - 0.03 * q), (0, y + 0.10, 0.98 - 0.03 * q), 0.03, 0.02, 0.02, h, up=(0, 0, 1), bevel=0.006, bone='chest', mat=AC, shift=(0, h / 2))
    for s in (1, -1): k.prism((s * 0.185, -0.46, 0.86), (s * 0.185, -0.20, 0.84), 0.01, 0.05, 0.01, 0.03, bevel=0.003, bone='chest', mat=AC)   # side stripe
    # neck: stacked collar plates (mane)
    for q in range(3):
        t = q / 3.0; c0 = J['neck'][0].lerp(J['neck'][1], t); c1 = J['neck'][0].lerp(J['neck'][1], t + 0.30)
        k.prism(c0, c1, 0.26 - 0.03 * q, 0.24 - 0.02 * q, 0.22 - 0.03 * q, 0.20 - 0.02 * q, up=(0, 0.6, 1), bevel=0.015, bone='neck', mat=PL if q != 1 else FR)
    # head: skull block, long tapered snout, brow visor (glow), tall ears, cheek plates
    k.prism((0, -0.52, 1.03), (0, -0.70, 1.02), 0.24, 0.20, 0.22, 0.17, bevel=0.025, bone='head', mat=PL)
    k.prism((0, -0.69, 1.01), (0, -0.92, 0.97), 0.15, 0.10, 0.08, 0.06, bevel=0.015, bone='head', mat=PL, shift=(0, -0.01))
    k.prism((0, -0.92, 0.985), (0, -0.955, 0.975), 0.07, 0.05, 0.05, 0.04, bevel=0.01, bone='head', mat=DK)                 # nose tip
    k.prism((-0.105, -0.69, 1.065), (0.105, -0.69, 1.065), 0.035, 0.02, up=(0, -0.3, 1), bevel=0.006, bone='head', mat=EY)  # visor (left -> right)
    for s in (1, -1):
        k.prism((s * 0.075, -0.56, 1.11), (s * 0.10, -0.53, 1.29), 0.08, 0.035, 0.012, 0.012, up=(0, -1, 0), bevel=0.006, bone='head', mat=PL)
        k.prism((s * 0.075, -0.565, 1.13), (s * 0.095, -0.545, 1.24), 0.045, 0.02, 0.008, 0.008, up=(0, -1, 0), bevel=0.003, bone='head', mat=AC)
        k.prism((s * 0.12, -0.60, 0.98), (s * 0.10, -0.74, 0.96), 0.03, 0.10, 0.02, 0.06, up=(0, 0, 1), bevel=0.008, bone='head', mat=FR)
    for q in range(5):                                                                                                   # upper fangs
        for s in (1, -1): k.cyl((s * (0.03 + 0.004 * q), -0.90 + 0.04 * q, 0.945), (s * (0.03 + 0.004 * q), -0.90 + 0.04 * q, 0.915), 0.008, 0.0, seg=5, bone='head', mat=CL)
    # jaw
    k.prism((0, -0.62, 0.93), (0, -0.88, 0.905), 0.12, 0.05, 0.07, 0.035, bevel=0.01, bone='jaw', mat=FR)
    for q in range(4):
        for s in (1, -1): k.cyl((s * (0.026 + 0.004 * q), -0.86 + 0.045 * q, 0.93), (s * (0.026 + 0.004 * q), -0.86 + 0.045 * q, 0.955), 0.007, 0.0, seg=5, bone='jaw', mat=CL)
    # tail: tapering segments + glowing tip
    for i, n in enumerate(('tail0', 'tail1', 'tail2')):
        a, b = J[n]; w = 0.11 - 0.03 * i
        k.prism(a.lerp(b, 0.05), a.lerp(b, 0.92), w, w, w * 0.8, w * 0.8, bevel=0.012, bone=n, mat=PL if i != 1 else FR)
    a, b = J['tail2']; k.prism(b - (b - a) * 0.12, b + (b - a) * 0.22, 0.04, 0.04, 0.01, 0.01, bevel=0.004, bone='tail2', mat=AC)
    # legs
    for side, s in (('L', 1), ('R', -1)):
        a, b = J['upperArm' + side]; k.prism(a + Vector((0, 0, 0.04)), b, 0.12, 0.18, 0.09, 0.11, up=(0, -1, 0), bevel=0.018, bone='upperArm' + side, mat=PL)
        k.ball(a, 0.085, 'upperArm' + side, FR)
        a, b = J['foreArm' + side]; k.ball(a, 0.055, 'foreArm' + side, DK)
        k.prism(a, b, 0.07, 0.09, 0.06, 0.07, up=(0, -1, 0), bevel=0.012, bone='foreArm' + side, mat=FR)
        k.prism(a.lerp(b, 0.15), a.lerp(b, 0.7), 0.08, 0.05, 0.07, 0.04, up=(0, -1, 0), bevel=0.01, bone='foreArm' + side, mat=PL, shift=(0, 0.02))
        a, b = J['handPaw' + side]; k.ball(a, 0.042, 'handPaw' + side, DK)
        k.prism((a.x, a.y + 0.03, 0.045), (a.x, a.y - 0.12, 0.035), 0.10, 0.07, 0.09, 0.05, bevel=0.015, bone='handPaw' + side, mat=FR)
        for q in (-1, 0, 1): k.cyl((a.x + q * 0.03, a.y - 0.12, 0.04), (a.x + q * 0.03, a.y - 0.165, 0.01), 0.011, 0.0, seg=5, bone='handPaw' + side, mat=CL)
        a, b = J['thigh' + side]; k.prism(a + Vector((0, 0.02, 0.05)), b, 0.13, 0.24, 0.10, 0.13, up=(0, -1, 0), bevel=0.02, bone='thigh' + side, mat=PL)
        k.ball(a, 0.09, 'thigh' + side, FR)
        a, b = J['shin' + side]; k.ball(a, 0.055, 'shin' + side, DK)
        k.prism(a, b, 0.07, 0.08, 0.06, 0.06, up=(0, 1, 0), bevel=0.012, bone='shin' + side, mat=FR)
        k.prism(a.lerp(b, 0.1), a.lerp(b, 0.6), 0.08, 0.04, 0.07, 0.03, up=(0, 1, 0), bevel=0.008, bone='shin' + side, mat=AC, shift=(0, -0.02))
        a, b = J['hock' + side]; k.ball(a, 0.045, 'hock' + side, DK)
        k.prism(a, b, 0.06, 0.06, 0.05, 0.05, up=(0, 1, 0), bevel=0.01, bone='hock' + side, mat=PL)
        a, b = J['footPaw' + side]; k.ball(a, 0.04, 'footPaw' + side, DK)
        k.prism((a.x, a.y + 0.03, 0.04), (a.x, a.y - 0.12, 0.032), 0.10, 0.065, 0.09, 0.045, bevel=0.015, bone='footPaw' + side, mat=FR)
        for q in (-1, 0, 1): k.cyl((a.x + q * 0.03, a.y - 0.12, 0.035), (a.x + q * 0.03, a.y - 0.16, 0.008), 0.010, 0.0, seg=5, bone='footPaw' + side, mat=CL)
    return k.obj('Wolf', mats, arm)


def wolf_clips():
    LEGS = (('L', 'F'), ('R', 'F'), ('L', 'H'), ('R', 'H'))
    def legs(rel, ph, A, lift, front_names=('upperArm', 'foreArm', 'handPaw'), hind=('thigh', 'shin', 'hock', 'footPaw')):
        for (side, fh), p in zip(LEGS, ph):
            a = A * math.sin(p); sw = max(0.0, -math.cos(p)) * lift             # swing (forward) phase: flex
            if fh == 'F':
                rel[front_names[0] + side] = X(a - 0.3 * sw); rel[front_names[1] + side] = X(1.6 * sw); rel[front_names[2] + side] = X(0.8 * sw - 0.4 * a)
            else:
                rel[hind[0] + side] = X(a - 0.2 * sw); rel[hind[1] + side] = X(1.0 * sw); rel[hind[2] + side] = X(-1.1 * sw); rel[hind[3] + side] = X(-0.5 * a + 0.3 * sw)
    def tail(rel, f, n, amp=8, up=0):
        for i in range(3): rel['tail%d' % i] = Z(amp * math.sin(2 * math.pi * f / n - 0.6 * i)) @ X(-up if i == 0 else 0)
    def idle(f):
        n = 60; t = 2 * math.pi * f / n; rel = {}
        rel['chest'] = X(1.2 * math.sin(t)); rel['neck'] = X(-1.5 * math.sin(t)); rel['head'] = Z(6 * math.sin(t * 0.5 * 2)) @ X(2 * math.sin(t))
        rel['jaw'] = X(-3 - 2 * math.sin(t)); tail(rel, f, n, 6, -5)
        return rel, (0, 0, 0.008 * math.sin(t))
    def walk(f, n=32, A=22, lift=34):
        t = 2 * math.pi * f / n; rel = {}
        legs(rel, (t, t + math.pi, t + 0.5 * math.pi, t + 1.5 * math.pi), A, lift)
        rel['chest'] = Z(3 * math.sin(t)); rel['neck'] = X(-2 * math.sin(2 * t)); rel['head'] = X(2 * math.sin(2 * t)) @ Z(-3 * math.sin(t)); rel['jaw'] = X(-4)
        tail(rel, f, n, 10, -5)
        return rel, (0, 0, 0.012 * math.sin(2 * t))
    def run(f, n=18):
        t = 2 * math.pi * f / n; rel = {}
        legs(rel, (t, t + 0.35, t + math.pi, t + math.pi + 0.35), 34, 50)
        rel['pelvis'] = X(-7 * math.sin(t + 0.4)); rel['spine'] = X(5 * math.sin(t + 0.4)); rel['chest'] = X(6 * math.sin(t))
        rel['neck'] = X(-14 - 6 * math.sin(t)); rel['head'] = X(10 + 4 * math.sin(t)); rel['jaw'] = X(-12)
        for i in range(3): rel['tail%d' % i] = X(-12 + 6 * math.sin(t - i)) if i == 0 else X(4 * math.sin(t - i))
        return rel, (0, 0, -0.04 + 0.05 * math.sin(t + 0.9))
    def bite(f):
        rel = {}; cr = seg(f, [(0, 0), (10, 1), (14, 0), (30, 0)]); lu = seg(f, [(0, 0), (10, 0), (15, 1), (19, 1), (30, 0)])
        jaw = seg(f, [(0, -4), (8, -10), (13, -40), (16, -40), (17, -2), (30, -4)])
        rel['pelvis'] = X(-6 * cr + 4 * lu); rel['chest'] = X(-4 * cr + 6 * lu); rel['neck'] = X(-10 * cr + 22 * lu); rel['head'] = X(8 * cr - 6 * lu - 6 * seg(f, [(0, 0), (16, 0), (18, 1), (24, 0), (30, 0)]))
        rel['jaw'] = X(jaw)
        for side in 'LR':
            rel['upperArm' + side] = X(10 * cr - 24 * lu); rel['foreArm' + side] = X(-6 * cr + 12 * lu); rel['handPaw' + side] = X(-4 * cr + 10 * lu)
            rel['thigh' + side] = X(-14 * cr + 20 * lu); rel['shin' + side] = X(18 * cr - 10 * lu); rel['hock' + side] = X(-12 * cr + 6 * lu)
        for i in range(3): rel['tail%d' % i] = X(-14 * lu)
        return rel, (0, 0.10 * cr - 0.30 * lu, -0.07 * cr + 0.02 * lu)
    def hit(f):
        rel = {}; h = seg(f, [(0, 0), (3, 1), (8, 0.6), (20, 0)])
        rel['pelvis'] = X(-4 * h) @ Y(6 * h); rel['chest'] = X(-8 * h); rel['neck'] = X(-14 * h); rel['head'] = X(-10 * h) @ Z(10 * h); rel['jaw'] = X(-4 - 18 * h)
        for side in 'LR': rel['upperArm' + side] = X(-12 * h); rel['foreArm' + side] = X(10 * h)
        for i in range(3): rel['tail%d' % i] = X(10 * h)
        return rel, (0, 0.10 * h, -0.02 * h)
    def death(f):
        rel = {}; k = seg(f, [(0, 0), (6, 0.15), (20, 0.8), (26, 1.0), (30, 0.96), (34, 1), (50, 1)]); slump = seg(f, [(0, 0), (14, 1), (50, 1)])
        rel['pelvis'] = Y(-84 * k); rel['chest'] = X(-6 * slump); rel['neck'] = X(30 * slump) @ Z(-14 * k); rel['head'] = X(14 * slump); rel['jaw'] = X(-8 - 16 * seg(f, [(0, 0), (20, 1), (40, 0.6), (50, 0.6)]))
        for side, s in (('L', 1), ('R', -1)):
            rel['upperArm' + side] = X(-30 * slump) @ Y(s * 10 * k); rel['foreArm' + side] = X(40 * slump); rel['handPaw' + side] = X(20 * slump)
            rel['thigh' + side] = X(-30 * slump) @ Y(s * 10 * k); rel['shin' + side] = X(30 * slump); rel['hock' + side] = X(-20 * slump)
        for i in range(3): rel['tail%d' % i] = X(10 * slump) @ Y(-10 * k)
        return rel, (-0.30 * k, 0, -0.10 * slump - 0.40 * k + 0.05 * math.sin(math.pi * min(1, f / 26)) * (f < 26))
    return [('idle', 60, idle, True), ('walk', 32, walk, True), ('run', 18, run, True), ('bite', 30, bite, False), ('hit', 20, hit, False), ('death', 50, death, False)]


# ------------------------------------------------------------------ Warprom gun drone (hover quadrotor)
DRONE_COL = dict(hull='#4b5a2f', frame='#3c3f4f', steel='#8d95a8', dark='#262833', star='#c42828', glow='#c42828', warn='#f0b050')
HOVER = 1.30


def drone_table():
    z = HOVER; T = [('body', None, (0, 0, z - 0.05), (0, 0, z + 0.15)), ('gun', 'body', (0, -0.05, z - 0.20), (0, -0.30, z - 0.20)),
                    ('barrel', 'gun', (0, -0.15, z - 0.20), (0, -0.50, z - 0.20)), ('eye', 'body', (0, -0.26, z + 0.02), (0, -0.36, z + 0.02))]
    for i, (sx, sy) in enumerate(((1, -1), (-1, -1), (1, 1), (-1, 1))):
        T.append(('rotor%d' % i, 'body', (sx * 0.42, sy * 0.36, z + 0.10), (sx * 0.42, sy * 0.36, z + 0.22)))
    return T


def drone_mesh(arm, T):
    C = DRONE_COL; mats = [fab('DroneHull', C['hull'], 'tech'), fab('DroneFrame', C['frame'], 'tech'), fab('DroneSteel', C['steel'], 'tech'),
                           fab('DroneDark', C['dark'], 'leather'), fab('DroneStar', C['star'], 'leather'), fab('DroneEye', C['glow'], 'weave', True), fab('DroneWarn', C['warn'], 'tech')]
    HU, FR, ST, DK, SR, EY, WN = range(7)
    z = HOVER; k = Kit([n for n, *_ in T])
    # armoured hull: faceted capsule (front -Y), top hatch, side armour, rear battery
    k.prism((0, -0.30, z), (0, 0.26, z), 0.34, 0.24, 0.30, 0.22, bevel=0.05, bone='body', mat=HU)
    k.prism((0, -0.20, z + 0.12), (0, 0.16, z + 0.12), 0.20, 0.06, 0.18, 0.05, bevel=0.02, bone='body', mat=FR)
    k.prism((0, 0.24, z + 0.01), (0, 0.36, z + 0.01), 0.22, 0.16, 0.18, 0.12, bevel=0.02, bone='body', mat=DK)
    for s in (1, -1):
        k.prism((s * 0.18, -0.22, z - 0.01), (s * 0.18, 0.18, z - 0.01), 0.04, 0.16, 0.04, 0.13, bevel=0.012, bone='body', mat=HU)
        star(k.bm, Vector((s * 0.202, -0.02, z + 0.0)), Vector((s, 0, 0)), 0.065, 0.012); k.tag('body', SR)                  # red star (side)
        k.prism((s * 0.17, 0.27, z + 0.08), (s * 0.17, 0.34, z + 0.08), 0.03, 0.02, bevel=0.004, bone='body', mat=WN)
    # sensor head: dark socket + red lens
    k.cyl((0, -0.27, z + 0.02), (0, -0.33, z + 0.02), 0.085, 0.075, seg=16, bone='eye', mat=DK)
    k.cyl((0, -0.325, z + 0.02), (0, -0.345, z + 0.02), 0.052, 0.045, seg=16, bone='eye', mat=EY)
    k.prism((-0.10, -0.31, z + 0.10), (0.10, -0.31, z + 0.10), 0.03, 0.03, up=(0, -1, 0.3), bevel=0.008, bone='body', mat=WN)    # brow strip
    # rotor arms, motor pods, guards, landing skids
    for i, (sx, sy) in enumerate(((1, -1), (-1, -1), (1, 1), (-1, 1))):
        k.prism((sx * 0.12, sy * 0.10, z + 0.04), (sx * 0.42, sy * 0.36, z + 0.08), 0.06, 0.05, 0.04, 0.04, up=(0, 0, 1), bevel=0.01, bone='body', mat=FR)
        k.cyl((sx * 0.42, sy * 0.36, z + 0.03), (sx * 0.42, sy * 0.36, z + 0.12), 0.05, 0.045, seg=12, bone='body', mat=ST)
        vs = band(k.bm, (sx * 0.42, sy * 0.36, z + 0.125), 0.22, 0.22, 0.035, seg=24); k.tag('body', HU)
        n = 'rotor%d' % i; c = Vector((sx * 0.42, sy * 0.36, z + 0.135))
        k.cyl(c - Vector((0, 0, 0.01)), c + Vector((0, 0, 0.03)), 0.025, 0.02, seg=8, bone=n, mat=DK)
        for b in range(3):
            a = 2 * math.pi * b / 3; d = Vector((math.cos(a), math.sin(a), 0))
            k.prism(c + d * 0.02, c + d * 0.20, 0.05, 0.008, 0.035, 0.006, up=(0, 0, 1), bevel=0.0, bone=n, mat=ST)
    for s in (1, -1):
        k.prism((s * 0.12, -0.12, z - 0.12), (s * 0.15, -0.12, z - 0.30), 0.03, 0.03, bevel=0.006, bone='body', mat=FR)
        k.prism((s * 0.12, 0.14, z - 0.12), (s * 0.15, 0.14, z - 0.30), 0.03, 0.03, bevel=0.006, bone='body', mat=FR)
        k.prism((s * 0.155, -0.24, z - 0.31), (s * 0.155, 0.24, z - 0.31), 0.04, 0.03, bevel=0.01, bone='body', mat=DK)
    # chin gun: turret ball + twin barrels with muzzle brakes, ammo box
    k.ball((0, -0.06, z - 0.16), 0.09, 'gun', FR, seg=14, rings=8)
    k.prism((0, -0.08, z - 0.20), (0, -0.24, z - 0.20), 0.14, 0.10, 0.12, 0.08, bevel=0.015, bone='gun', mat=HU)
    k.prism((0.10, -0.02, z - 0.20), (0.10, 0.10, z - 0.20), 0.07, 0.09, bevel=0.01, bone='gun', mat=FR)
    for s in (1, -1):
        k.cyl((s * 0.03, -0.20, z - 0.20), (s * 0.03, -0.50, z - 0.20), 0.018, seg=10, bone='barrel', mat=DK)
        k.cyl((s * 0.03, -0.46, z - 0.20), (s * 0.03, -0.53, z - 0.20), 0.026, seg=10, bone='barrel', mat=ST)
    return k.obj('Drone', mats, arm)


def star(bm, c, n, r, t):
    """five-pointed star plate: centre c, facing n, outer radius r, thickness t"""
    u = n.orthogonal().normalized(); u = Vector((0, 0, 1)) if abs(n.z) < 0.9 else u; w = n.cross(u).normalized()
    ring = []
    for i in range(10):
        a = math.pi / 2 + math.pi * i / 5; rr = r if i % 2 == 0 else r * 0.42
        ring.append(c + (u * math.sin(a) + w * math.cos(a)) * rr)
    top = [bm.verts.new(p + n * t) for p in ring]; bot = [bm.verts.new(p) for p in ring]; ct = bm.verts.new(c + n * t)
    for i in range(10):
        j = (i + 1) % 10; bm.faces.new((ct, top[i], top[j])); bm.faces.new((bot[i], bot[j], top[j], top[i]))


def drone_clips():
    def spin(rel, f, rate=55):
        for i in range(4): rel['rotor%d' % i] = Z(((-1) ** i) * rate * f)
    def idle(f, n=48):
        t = 2 * math.pi * f / n; rel = {'body': X(2 * math.sin(t)) @ Y(2 * math.sin(t * 0.5 * 2 + 1)), 'gun': Z(8 * math.sin(t * 0.5 * 2)), 'eye': Z(10 * math.sin(t))}
        spin(rel, f, 60); return rel, (0, 0, 0.035 * math.sin(t))
    def move(f, n=24):
        t = 2 * math.pi * f / n; rel = {'body': X(14 + 2 * math.sin(t)), 'gun': X(-12), 'eye': X(-8)}
        spin(rel, f, 75); return rel, (0, 0, -0.03 + 0.02 * math.sin(t))
    def shoot(f):
        r = seg(f, [(0, 0), (2, 1), (5, 0.2), (8, 1), (11, 0.2), (20, 0)]); rel = {'body': X(-4 * r), 'gun': X(-3 * r)}
        spin(rel, f, 60); return rel, (0, 0.03 * r, 0), {'barrel': (0, 0.06 * r, 0)}
    def hit(f):
        h = seg(f, [(0, 0), (2, 1), (8, 0.4), (20, 0)]); rel = {'body': Y(-16 * h) @ X(-10 * h), 'gun': Z(15 * h), 'eye': Z(-12 * h)}
        spin(rel, f, 60 - 30 * h); return rel, (0.06 * h, 0.10 * h, 0.05 * h)
    def death(f):
        k = seg(f, [(0, 0), (30, 1), (34, 1), (45, 1)]); fall = seg(f, [(0, 0), (6, 0.05), (30, 1), (45, 1)])
        rel = {'body': Z(200 * seg(f, [(0, 0), (30, 1), (45, 1)])) @ Y(14 * k) @ X(8 * k), 'gun': X(25 * k), 'eye': X(15 * k)}
        for i in range(4): rel['rotor%d' % i] = Z(((-1) ** i) * (60 * f - 0.9 * f * f) if f < 33 else ((-1) ** i) * (60 * 33 - 0.9 * 33 * 33))
        bounce = 0.04 * math.sin(math.pi * min(1, max(0, (f - 30) / 6))) if f > 30 else 0
        return rel, (0, 0.15 * k, -(HOVER - 0.40) * fall + bounce)
    return [('idle', 48, idle, True), ('move', 24, move, True), ('shoot', 20, shoot, False), ('hit', 20, hit, False), ('death', 45, death, False)]


MECHS = {
    'wolf': dict(table=wolf_table, mesh=wolf_mesh, clips=wolf_clips, root='pelvis', kind='quadruped',
                 anchors=dict(mouth=('jaw', (0, -0.86, 0.93)), eyes=('head', (0, -0.70, 1.065)), chest=('chest', (0, -0.36, 0.84)))),
    'drone': dict(table=drone_table, mesh=drone_mesh, clips=drone_clips, root='body', kind='drone',
                  anchors=dict(muzzle=('barrel', (0, -0.53, HOVER - 0.20)), eye=('eye', (0, -0.345, HOVER + 0.02)), core=('body', (0, 0, HOVER)))),
}
IDS = list(HUMANOIDS) + list(MECHS)


def build(eid):
    if eid in HUMANOIDS:
        cfg = HUMANOIDS[eid]; P, arm, objs, names, sp = npc.build(eid, cfg)
        return dict(kind='humanoid', P=P, arm=arm, objs=objs, names=names, springs=sp, sex=cfg['sex'],
                    meta=dict(enemy=eid, hair=cfg.get('hair'), outfit=cfg['base'], skin=cfg['skin'], scale=cfg.get('scale', 1.0)))
    m = MECHS[eid]; reset()
    T = m['table'](); arm = make_arm(eid, T); o = m['mesh'](arm, T)
    names = author(arm, m['root'], m['clips']())
    vs = [arm.matrix_world @ v.co for v in o.data.vertices]
    ext = [max(v[i] for v in vs) - min(v[i] for v in vs) for i in range(3)]
    meta = dict(enemy=eid, kind=m['kind'], height_m=round(max(v.z for v in vs), 3), length_m=round(ext[1], 3), width_m=round(ext[0], 3),
                anchors={k: dict(bone=b, pos=gl(p)) for k, (b, p) in m['anchors'].items()}, root=m['root'])
    return dict(kind=m['kind'], P=None, arm=arm, objs=[o], names=names, springs=[], meta=meta)


def write_meta(path, r, tris):
    arm = r['arm']
    if r['kind'] == 'humanoid':
        import export
        export.meta(path, arm, r['P'], r['sex'], [x.name for x in r['objs']], r['names'], r['springs'], dict(triangles=tris, **r['meta']))
        return
    m = dict(name=os.path.basename(path), up='Y', front='+Z', bones=[b.name for b in arm.data.bones],
             parents={b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}, parts=[x.name for x in r['objs']],
             animations=r['names'], loops=[n for n in r['names'] if bpy.data.actions[n].get('loop')], fps=30, triangles=tris, **r['meta'])
    json.dump(m, open(os.path.splitext(path)[0] + '.json', 'w'), indent=1, ensure_ascii=False)
