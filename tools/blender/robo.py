"""Mechanical bodies on the hero rig (VRM humanoid bones, same clips as body_*): skeleton-robot hero, synth hero, Warprom android enemy.
Every part is a rigid piece on ONE bone (smooth superellipsoids / lofted tubes in a single bmesh), authored in the raw skeleton layout and
stretched like the human body (skeleton.stretch_mesh), so outfits (outfit_*_{f,m}.glb) and weapons fit unchanged.
  build('skel'|'synth'|'android', sex) -> P, arm, [body], names
Materials: `Skin` (plating / bone: the game tints it by the look skin), dark joints, `EyeGlow` / `AccentGlow` (emissive; the game tints them by
the look eyes). Android enemy: `AndroidPlate` (olive, colour variety by the game), `AndroidFrame`, `AndroidDark`, `AndroidGlow`."""
from common import *
from skeleton import MALE, FEMALE, joints, build_armature, stretch_mesh, stretch_bones
import rig, anim

V = Vector


def spow(x, p): return math.copysign(abs(x) ** p, x)


class Kit:
    """one bmesh; each primitive is tagged with a bone (100 % weight) and a material"""
    def __init__(self, arm, mats):
        self.bm = bmesh.new(); self.dl = self.bm.verts.layers.deform.verify()
        self.gi = {b.name: i for i, b in enumerate(arm.data.bones)}; self.names = list(self.gi)
        self.mats = mats                                     # [(name, hex, emissive)]
        self.mi = {m[0]: i for i, m in enumerate(mats)}

    def _fin(self, vs, fs, bone, mat):
        for v in vs: v[self.dl][self.gi[bone]] = 1.0
        for f in fs: f.material_index = self.mi[mat]; f.smooth = True
        bmesh.ops.recalc_face_normals(self.bm, faces=fs)

    def _grid(self, rows, closed=True):
        """rows: list of lists of BMVert (ring) or a single BMVert (pole) -> faces"""
        fs = []; nv = self.bm.verts.new
        for a, b in zip(rows[:-1], rows[1:]):
            if isinstance(a, list) and isinstance(b, list):
                n = len(a)
                for j in range(n): fs.append(self.bm.faces.new((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j])))
            elif isinstance(a, list):
                n = len(a)
                for j in range(n): fs.append(self.bm.faces.new((a[j], a[(j + 1) % n], b)))
            else:
                n = len(b)
                for j in range(n): fs.append(self.bm.faces.new((a, b[(j + 1) % n], b[j])))
        return fs

    def ellip(self, c, r, bone, mat, e=2.0, seg=14, rings=8, rot=None, keep=None):
        """superellipsoid (e = 2 ellipsoid, 3..5 rounded box) centred at c with radii r = (rx, ry, rz), rot = Matrix 3x3 (local -> raw)"""
        p = 2.0 / e; c = V(c); rx, ry, rz = r; vs = []
        place = lambda q: (rot @ q if rot is not None else q) + c
        rows = []
        mk = lambda q: self.bm.verts.new(place(V(q)))
        rows.append(mk((0, 0, -rz)))
        for k in range(1, rings):
            v = -math.pi / 2 + math.pi * k / rings; cv, sv = spow(math.cos(v), p), spow(math.sin(v), p)
            rows.append([mk((rx * cv * spow(math.cos(2 * math.pi * j / seg), p), ry * cv * spow(math.sin(2 * math.pi * j / seg), p), rz * sv)) for j in range(seg)])
        rows.append(mk((0, 0, rz)))
        for row in rows: vs += row if isinstance(row, list) else [row]
        fs = self._grid(rows)
        if keep is not None:                                  # drop faces whose centre fails keep(world point)
            for f in [f for f in fs if not keep(f.calc_center_median())]: self.bm.faces.remove(f)
            fs = [f for f in fs if f.is_valid]
        self._fin(vs, fs, bone, mat)

    def tube(self, a, b, prof, bone, mat, seg=8, sx=1.0, sy=1.0, up=(0, 1, 0), e=2.0, off=None):
        """lofted tube a -> b; prof = [(t 0..1, radius)] (radius 0 = pole); section scaled sx (side) / sy (up); off(t) -> raw offset"""
        a, b = V(a), V(b); L = (b - a).length; d = (b - a) / L; up = V(up)
        side = d.cross(up)
        if side.length < 1e-4: side = d.cross(V((1, 0, 0)))
        side.normalize(); upp = side.cross(d).normalized(); p = 2.0 / e
        rows = []; vs = []
        for t, r in prof:
            ctr = a + d * (L * t) + (V(off(t)) if off else V((0, 0, 0)))
            if r <= 1e-6: rows.append(self.bm.verts.new(ctr)); vs.append(rows[-1]); continue
            ring = [self.bm.verts.new(ctr + side * (r * sx * spow(math.cos(2 * math.pi * j / seg), p)) + upp * (r * sy * spow(math.sin(2 * math.pi * j / seg), p))) for j in range(seg)]
            rows.append(ring); vs += ring
        self._fin(vs, self._grid(rows), bone, mat)

    def caps(self, a, b, r0, r1, bone, mat, seg=8, sx=1.0, sy=1.0, up=(0, 1, 0), e=2.0, c0=1.0, c1=1.0):
        """capsule a -> b with radii r0 / r1 and round caps (c = cap length factor)"""
        L = (V(b) - V(a)).length; k0, k1 = min(r0 * c0, L * 0.45), min(r1 * c1, L * 0.45)
        pr = [(0, 0)] + [((k0 * (1 - math.cos(th))) / L, r0 * math.sin(th)) for th in (math.radians(30), math.radians(60), math.radians(80))]
        pr += [(1 - (k1 * (1 - math.cos(th))) / L, r1 * math.sin(th)) for th in (math.radians(80), math.radians(60), math.radians(30))] + [(1, 0)]
        self.tube(a, b, pr, bone, mat, seg, sx, sy, up, e)

    def band(self, a, b, r0, r1, bone, mat, seg=10, sx=1.0, sy=1.0, up=(0, 1, 0), e=2.0):
        """short tapered cylinder with flat caps"""
        self.tube(a, b, [(0, 0), (0, r0), (1, r1), (1, 0)], bone, mat, seg, sx, sy, up, e)

    def path(self, pts, r, bone, mat, seg=5, closed=False, up=(0, 0, 1), rs=None):
        """tube along a polyline"""
        pts = [V(p) for p in pts]; n = len(pts); rows = []; vs = []
        for i, q in enumerate(pts):
            t = (pts[(i + 1) % n] - pts[(i - 1) % n]) if closed else (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)])
            t.normalize(); s = t.cross(V(up))
            if s.length < 1e-4: s = t.cross(V((1, 0, 0)))
            s.normalize(); u = s.cross(t).normalized(); rr = r * (rs[i] if rs else 1)
            ring = [self.bm.verts.new(q + s * (rr * math.cos(2 * math.pi * j / seg)) + u * (rr * math.sin(2 * math.pi * j / seg))) for j in range(seg)]
            rows.append(ring); vs += ring
        fs = self._grid(rows)
        if closed:
            a, b = rows[-1], rows[0]
            for j in range(seg): fs.append(self.bm.faces.new((a[j], a[(j + 1) % seg], b[(j + 1) % seg], b[j])))
        else:
            for ring, rev in ((rows[0], True), (rows[-1], False)):
                c = self.bm.verts.new(sum((v.co for v in ring), V((0, 0, 0))) / seg); vs.append(c)
                for j in range(seg): fs.append(self.bm.faces.new((c, ring[(j + 1) % seg], ring[j]) if rev else (c, ring[j], ring[(j + 1) % seg])))
        self._fin(vs, fs, bone, mat)

    def finish(self, arm, name='Body'):
        me = bpy.data.meshes.new(name); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for i, (n, hexc, em) in enumerate(self.mats):
            m = mat_toon(n, srgb(hexc)); b = m.node_tree.nodes['Principled BSDF']
            if em:
                for k in ('Emission Color', 'Emission'):
                    if k in b.inputs: b.inputs[k].default_value = (*srgb(hexc), 1)
                if 'Emission Strength' in b.inputs: b.inputs['Emission Strength'].default_value = 2.0
            m.use_backface_culling = False
            me.materials.append(m)
        o = bpy.data.objects.new(name, me); link(o)
        for n in self.names: o.vertex_groups.new(name=n)
        o.parent = arm; md = o.modifiers.new('Armature', 'ARMATURE'); md.object = arm
        for p in me.polygons: p.use_smooth = True
        return o


def rotx(deg): return Matrix.Rotation(math.radians(deg), 3, 'X')
def roty(deg): return Matrix.Rotation(math.radians(deg), 3, 'Y')
def rotz(deg): return Matrix.Rotation(math.radians(deg), 3, 'Z')


def lerp(a, b, t): return V(a) + (V(b) - V(a)) * t


# ---------------------------------------------------------------------------------------------------------------- hands / feet
def hand_fingers(K, J, P, side, bone_fn, r, mat, thumb_mat=None, scale=1.0, curl=0.0):
    """one capsule per finger on its Proximal bone (the clips curl the fingers about the knuckle)"""
    from skeleton import bone_table
    L = 'left' if side > 0 else 'right'; hs = P['hs']
    table = {b[0]: b for b in bone_table(P)}
    for fn in ('Index', 'Middle', 'Ring', 'Little'):
        pr, it, ds = table[L + fn + 'Proximal'], table[L + fn + 'Intermediate'], table[L + fn + 'Distal']
        a = V(pr[2]); b = V(ds[3]); K.caps(a, b, r * 1.05, r * 0.8, L + fn + 'Proximal', mat, seg=6, up=(0, 0, 1))
    pr, ds = table[L + 'ThumbMetacarpal'], table[L + 'ThumbDistal']
    K.caps(V(pr[2]), V(ds[3]), r * 1.2, r * 0.85, L + 'ThumbMetacarpal', thumb_mat or mat, seg=6, up=(0, 0, 1))


# ---------------------------------------------------------------------------------------------------------------- SYNTH (hero)
def synth(K, P, sex, S=None):
    """smooth plated android: dark joints, panel rings, glowing visor eyes and accent strips. S: style dict (enemy android overrides)"""
    S = S or {}
    J = joints(P); hs = P['hs']; fem = sex == 'female'
    SK, DK, EG, AG = S.get('skin', 'Skin'), S.get('dark', 'SynthDark'), S.get('eye', 'EyeGlow'), S.get('accent', 'AccentGlow')
    bulk = S.get('bulk', 1.0); W = lambda v: v * bulk; lg = S.get('legk', bulk)
    z = lambda v: v * hs
    k = 1.0 if not fem else 0.95
    # ---- pelvis / waist / chest
    K.ellip((0, 0.0, z(0.935)), (W(0.130), 0.086, z(0.078)), 'hips', SK, e=2.6, seg=20, rings=10)
    K.band((0, 0, z(0.868)), (0, 0, z(0.893)), W(0.128), W(0.128), 'hips', DK, seg=20, sy=0.68)                                   # belt
    for sx in (1, -1):                                                                                                          # hip guards
        K.ellip((sx * 0.128 * bulk, 0.0, z(0.90)), (0.036, 0.066, z(0.085)), 'hips', SK, e=2.4, seg=12, rings=8, rot=roty(sx * 10))
        K.ellip((sx * 0.12, 0.0, z(1.0)), (0.035, 0.05, z(0.03)), 'hips', AG, e=2.4, seg=8, rings=5, rot=roty(sx * 10)) if S.get('hip_glow', False) else None
    K.ellip((0, 0.005, z(1.065)), (W(0.090 if not fem else 0.074), 0.060, z(0.078)), 'spine', DK, e=2.2, seg=14, rings=8)       # waist (dark)
    for zz in (1.04, 1.085):
        K.band((0, 0.005, z(zz)), (0, 0.005, z(zz + 0.014)), W(0.097 if not fem else 0.081), W(0.097 if not fem else 0.081), 'spine', SK, seg=14, sy=0.7)
    cw = 0.128 if not fem else 0.114
    K.ellip((0, 0.0, z(1.18)), (W(cw * 0.86), 0.078, z(0.075)), 'chest', SK, e=2.5, seg=18, rings=8)                             # lower rib plate
    K.ellip((0, 0.0, z(1.285)), (W(cw), 0.088 if not fem else 0.084, z(0.135)), 'upperChest', SK, e=2.7, seg=22, rings=12)      # chest plate
    K.ellip((0, 0.004, z(1.405)), (W(0.150 if not fem else 0.135), 0.058, z(0.032)), 'upperChest', SK, e=2.8, seg=20, rings=8)  # shoulder yoke
    if S.get('core', True): K.ellip((0, -0.088 - (0.006 if fem else 0), z(1.255)), (0.026, 0.010, 0.026), 'upperChest', AG, e=2.0, seg=12, rings=6)    # core emblem
    if S.get('chest_lines', True):                                                                                              # panel line under the bust
        r0 = 0.905 * 1.012
        K.tube((0, 0, z(1.20)), (0, 0, z(1.212)), [(0, 0), (0, W(cw) * r0), (1, W(cw) * r0), (1, 0)], 'upperChest', DK, seg=24, sx=1, sy=(0.088 if not fem else 0.084) / cw, up=(0, 1, 0), e=2.7)
    # ---- neck / head
    K.caps((0, 0.008, z(1.42)), (0, 0.012, z(1.575)), 0.034, 0.030, 'neck', DK, seg=10)
    K.band((0, 0.008, z(1.435)), (0, 0.008, z(1.455)), 0.046, 0.040, 'neck', SK, seg=14, up=(0, 1, 0))
    if S.get('head', True):
        hy, hz = 0.013, z(1.668)
        K.ellip((0, hy, hz), (0.094, 0.104, z(0.122)), 'head', SK, e=2.35, seg=28, rings=16)                                       # cranium
        pc, pr = (0, hy - 0.036, hz - z(0.010)), (0.083, 0.082, z(0.062))
        K.ellip(pc, pr, 'head', DK, e=2.1, seg=30, rings=16)                                                                        # visor (front sticks out)
        def py(x, zz): return pc[1] - pr[1] * math.sqrt(max(0.02, 1 - (x / pr[0]) ** 2 - ((zz - pc[2]) / pr[2]) ** 2))
        for sx in (1, -1):                                                                                                          # glowing eyes
            ez = hz - z(0.010) + z(0.004)
            K.ellip((sx * 0.037, py(0.037, ez) + 0.003, ez), (0.022, 0.0075, z(0.0135)), 'head', EG, e=2.6, seg=14, rings=6, rot=roty(-sx * S.get('eye_tilt', 7)))
            K.band((sx * 0.097, hy, hz - z(0.02)), (sx * 0.116, hy, hz - z(0.02)), 0.032, 0.030, 'head', DK, seg=14, up=(0, 1, 0))     # ear discs
            K.band((sx * 0.1165, hy, hz - z(0.02)), (sx * 0.119, hy, hz - z(0.02)), 0.017, 0.017, 'head', AG, seg=12)
            K.ellip((sx * 0.106, hy + 0.072, hz + z(0.020)), (0.009, 0.062, z(0.024)), 'head', SK, e=2.4, seg=10, rings=6, rot=rotx(12) @ rotz(sx * 6))   # swept ear fins
        K.ellip((0, hy - 0.002, hz + z(0.112)), (0.012, 0.05, 0.010), 'head', DK, e=2.0, seg=8, rings=5)                           # crest line on top
    # ---- arms + legs
    for sx, L in ((1, 'left'), (-1, 'right')):
        m = lambda p: (p[0] * sx, p[1], p[2])
        ua, la, ha, he = V(m(J['upperArm'])), V(m(J['lowerArm'])), V(m(J['hand'])), V(m(J['handEnd']))
        K.ellip(ua + V((sx * 0.005, 0, 0)), (0.046, 0.046, 0.046), L + 'UpperArm', DK, seg=12, rings=8)                         # shoulder ball
        K.ellip(ua + V((sx * 0.010, 0.0, 0.034)), (W(0.058), 0.052, 0.036), L + 'Shoulder', SK, e=2.4, seg=14, rings=8, rot=roty(sx * 18))   # pauldron
        K.caps(ua, la, 0.041 * k * bulk, 0.035 * k * bulk, L + 'UpperArm', SK, seg=10, c0=0.3)
        K.band(lerp(ua, la, 0.42), lerp(ua, la, 0.47), 0.044 * k * bulk, 0.044 * k * bulk, L + 'UpperArm', DK, seg=10)
        K.ellip(la, (0.037, 0.037, 0.037), L + 'LowerArm', DK, seg=10, rings=6)                                                    # elbow
        K.caps(la, ha, 0.036 * k * bulk, 0.029 * k * bulk, L + 'LowerArm', SK, seg=10, c0=0.3)
        if S.get('arm_strip', True):
            K.tube(lerp(la, ha, 0.14), lerp(la, ha, 0.84), [(0, 0.0), (0.03, 0.0045), (0.97, 0.0045), (1, 0.0)], L + 'LowerArm', AG, seg=5, off=lambda t: (0, 0, (0.036 - 0.007 * t) * k * bulk))
        K.ellip(ha, (0.028, 0.028, 0.028), L + 'Hand', DK, seg=10, rings=6)                                                         # wrist
        K.ellip(lerp(ha, he, 0.42), (0.04 * hs, 0.026 * hs, 0.028 * hs), L + 'Hand', SK, e=2.4, seg=10, rings=6)                   # palm
        hand_fingers(K, J, P, sx, None, 0.0085 * hs, DK)
        ul, ll, ft, tz, te = V(m(J['upperLeg'])), V(m(J['lowerLeg'])), V(m(J['foot'])), V(m(J['toes'])), V(m(J['toesEnd']))
        K.ellip(ul + V((0, 0, -0.01)), (0.066 * k, 0.066 * k, 0.066 * k), L + 'UpperLeg', DK, seg=12, rings=8)                      # hip joint
        K.caps(ul, ll, 0.080 * k * lg, 0.058 * k * lg, L + 'UpperLeg', SK, seg=12, c0=0.2, c1=0.5)
        K.band(lerp(ul, ll, 0.60), lerp(ul, ll, 0.635), 0.070 * k * lg, 0.069 * k * lg, L + 'UpperLeg', DK, seg=12)
        K.ellip(ll, (0.060, 0.058, 0.060), L + 'LowerLeg', DK, seg=12, rings=8)                                                     # knee
        K.ellip(ll + V((0, -0.046, 0.0)), (0.038, 0.022, 0.046), L + 'UpperLeg', SK, e=2.4, seg=12, rings=6)                       # knee cap
        K.caps(ll, ft, 0.056 * k * lg, 0.040 * k * lg, L + 'LowerLeg', SK, seg=12, c0=0.4, c1=0.6)
        if S.get('leg_strip', True):
            K.tube(lerp(ll, ft, 0.14), lerp(ll, ft, 0.82), [(0, 0.0), (0.03, 0.005), (0.97, 0.005), (1, 0.0)], L + 'LowerLeg', AG, seg=5, off=lambda t: (0, -(0.052 - 0.015 * t) * k, 0.0))
        K.ellip(ft, (0.037, 0.037, 0.037), L + 'Foot', DK, seg=10, rings=6)                                                         # ankle
        K.ellip(lerp(ft, tz, 0.55) + V((0, 0, 0.004)), (0.047, 0.094, 0.040), L + 'Foot', SK, e=2.4, seg=14, rings=8)              # boot
        K.ellip(tz + V((0, -0.022, -0.002)), (0.038, 0.050, 0.026), L + 'Toes', SK, e=2.4, seg=10, rings=6)
    if S.get('waist_ring', True):
        K.band((0, 0.005, z(1.0)), (0, 0.005, z(1.008)), W(0.099 if not fem else 0.084), W(0.099 if not fem else 0.084), 'spine', AG, seg=14, sy=0.72)


# ---------------------------------------------------------------------------------------------------------------- SKELETON (hero)
def skeleton_bot(K, P, sex):
    """stylised robot skeleton: bone-white endoskeleton (skull, spine, rib cage, pelvis, limb bones) over dark inner rods, glowing eyes"""
    J = joints(P); hs = P['hs']; fem = sex == 'female'; z = lambda v: v * hs
    SK, DK, EG = 'Skin', 'BoneDark', 'EyeGlow'
    # ---- skull
    hy, hz = 0.015, z(1.683)
    K.ellip((0, hy, hz), (0.090, 0.100, z(0.108)), 'head', SK, e=2.2, seg=22, rings=14)                                                       # cranium
    K.ellip((0, hy - 0.020, hz - z(0.050)), (0.070, 0.074, z(0.062)), 'head', SK, e=2.1, seg=18, rings=10)                                    # face / cheeks
    K.ellip((0, hy - 0.012, hz + z(0.020)), (0.082, 0.086, z(0.04)), 'head', SK, e=2.3, seg=16, rings=8, rot=rotx(-6))
    fy = hy - 0.020 - 0.074 * 0.9                                                                                                            # face front y (approx)
    for sx in (1, -1):
        K.ellip((sx * 0.037, hy - 0.073, hz - z(0.018)), (0.030, 0.026, z(0.031)), 'head', DK, e=2.2, seg=14, rings=8, rot=roty(sx * 10))   # eye sockets
        K.ellip((sx * 0.037, hy - 0.093, hz - z(0.018)), (0.012, 0.010, 0.012), 'head', EG, seg=10, rings=6)                                     # glowing eyes
        K.ellip((sx * 0.052, hy - 0.052, hz - z(0.058)), (0.020, 0.016, z(0.012)), 'head', SK, e=2.0, seg=10, rings=6)                          # cheekbone ridge
    K.ellip((0, hy - 0.080, hz - z(0.056)), (0.011, 0.016, z(0.017)), 'head', DK, e=2.0, seg=10, rings=6)                                      # nose hole
    # jaw: upper teeth band (dark mouth gap) + lower jaw
    K.ellip((0, hy - 0.033, hz - z(0.092)), (0.050, 0.044, z(0.014)), 'head', DK, e=2.4, seg=16, rings=6)                                     # mouth gap
    for i in range(-3, 4):
        K.ellip((i * 0.0135, hy - 0.073 + 0.0035 * abs(i) * abs(i) / 3, hz - z(0.092)), (0.0058, 0.008, z(0.017)), 'head', SK, e=2.4, seg=8, rings=5)   # teeth
    K.ellip((0, hy - 0.020, hz - z(0.116)), (0.050, 0.052, z(0.020)), 'head', SK, e=2.2, seg=14, rings=8)                                    # chin / lower jaw
    # ---- neck + spine (dark rod + vertebra discs)
    K.caps((0, 0.032, z(0.96)), (0, 0.030, z(1.56)), 0.013, 0.013, 'spine', DK, seg=6)
    K.caps((0, 0.030, z(1.30)), (0, 0.022, z(1.57)), 0.014, 0.013, 'upperChest', DK, seg=6)
    for zz, b, r in ((1.46, 'neck', 0.022), (1.505, 'neck', 0.021), (1.55, 'neck', 0.02), (1.37, 'upperChest', 0.026), (1.30, 'upperChest', 0.027), (1.23, 'chest', 0.028), (1.16, 'chest', 0.028), (1.09, 'spine', 0.028), (1.02, 'spine', 0.028)):
        K.band((0, 0.036 - 0.0 * zz, z(zz)), (0, 0.036, z(zz + 0.034)), r, r * 0.9, b, SK, seg=10)
    # ---- rib cage: dark core + 5 rings + sternum + clavicles
    K.ellip((0, 0.004, z(1.285)), (0.112, 0.068, z(0.13)), 'upperChest', DK, e=2.2, seg=16, rings=10)
    for zz, w, d, b in ((1.39, 0.082, 0.060, 'upperChest'), (1.34, 0.108, 0.072, 'upperChest'), (1.29, 0.124, 0.078, 'upperChest'), (1.24, 0.126, 0.080, 'chest'), (1.19, 0.114, 0.074, 'chest')):
        pts = []; n = 18
        for i in range(n):
            th = 2 * math.pi * i / n
            pts.append((w * math.cos(th), 0.004 + d * math.sin(th), z(zz) - 0.022 * max(0.0, -math.sin(th)) * hs))      # front (-y) sags lower
        K.path(pts, 0.0125, b, SK, seg=5, closed=True)
    K.caps((0, -0.068, z(1.415)), (0, -0.074, z(1.16)), 0.014, 0.011, 'chest', SK, seg=8, sx=1.3, sy=1.0)
    for sx in (1, -1):
        K.caps((sx * 0.012, -0.058, z(1.412)), (sx * 0.150, -0.030, z(1.438)), 0.0095, 0.0095, 'upperChest', SK, seg=6)
    # ---- pelvis
    for sx in (1, -1):
        K.ellip((sx * 0.100, 0.012, z(0.975)), (0.050, 0.020, z(0.058)), 'hips', SK, e=2.2, seg=14, rings=8, rot=roty(sx * 22))     # iliac wing
        K.caps((sx * 0.082, -0.050, z(0.915)), (sx * 0.012, -0.060, z(0.89)), 0.013, 0.011, 'hips', SK, seg=6)                    # pubic arch
    K.ellip((0, 0.040, z(0.93)), (0.044, 0.020, z(0.062)), 'hips', SK, e=2.2, seg=12, rings=8)                                   # sacrum
    K.ellip((0, 0.0, z(0.925)), (0.082, 0.052, z(0.040)), 'hips', DK, e=2.2, seg=12, rings=6)
    # ---- limbs
    for sx, L in ((1, 'left'), (-1, 'right')):
        m = lambda p: (p[0] * sx, p[1], p[2])
        ua, la, ha, he = V(m(J['upperArm'])), V(m(J['lowerArm'])), V(m(J['hand'])), V(m(J['handEnd']))
        K.ellip(ua, (0.040, 0.040, 0.040), L + 'UpperArm', SK, seg=12, rings=8)                                                              # shoulder ball
        K.caps(ua, la, 0.015, 0.013, L + 'UpperArm', DK, seg=6)
        K.caps(lerp(ua, la, 0.10), lerp(ua, la, 0.90), 0.024, 0.020, L + 'UpperArm', SK, seg=8, c0=1.2, c1=1.2)                              # humerus
        K.ellip(la, (0.034, 0.034, 0.034), L + 'LowerArm', SK, seg=10, rings=6)                                                              # elbow
        K.caps(la, ha, 0.013, 0.011, L + 'LowerArm', DK, seg=6)
        for dy in (-0.012, 0.014):                                                                                                           # radius + ulna
            K.caps(lerp(la, ha, 0.10) + V((0, dy, 0)), lerp(la, ha, 0.92) + V((0, dy * 0.7, 0)), 0.0145, 0.012, L + 'LowerArm', SK, seg=6, c0=1.0, c1=1.0)
        K.ellip(ha, (0.022, 0.022, 0.022), L + 'Hand', SK, seg=8, rings=6)
        K.ellip(lerp(ha, he, 0.40), (0.030 * hs, 0.016 * hs, 0.026 * hs), L + 'Hand', SK, e=2.2, seg=10, rings=6)
        hand_fingers(K, J, P, sx, None, 0.0075 * hs, SK)
        ul, ll, ft, tz, te = V(m(J['upperLeg'])), V(m(J['lowerLeg'])), V(m(J['foot'])), V(m(J['toes'])), V(m(J['toesEnd']))
        K.ellip(ul + V((-sx * 0.016, 0, 0.012)), (0.044, 0.044, 0.044), L + 'UpperLeg', SK, seg=12, rings=8)                                  # hip ball
        K.caps(ul, ll, 0.020, 0.017, L + 'UpperLeg', DK, seg=6)
        K.caps(lerp(ul, ll, 0.06), lerp(ul, ll, 0.94), 0.038, 0.030, L + 'UpperLeg', SK, seg=10, c0=1.0, c1=1.0)                             # femur
        K.ellip(ll, (0.044, 0.042, 0.044), L + 'LowerLeg', SK, seg=10, rings=8)                                                              # knee
        K.ellip(ll + V((0, -0.030, 0.0)), (0.030, 0.018, 0.034), L + 'UpperLeg', SK, e=2.2, seg=10, rings=6)                                  # patella
        K.caps(ll, ft, 0.016, 0.013, L + 'LowerLeg', DK, seg=6)
        K.caps(lerp(ll, ft, 0.08), lerp(ll, ft, 0.94), 0.029, 0.021, L + 'LowerLeg', SK, seg=8, c0=1.0, c1=1.0)                              # tibia
        K.caps(lerp(ll, ft, 0.14) + V((sx * 0.028, 0.026, 0)), lerp(ll, ft, 0.88) + V((sx * 0.016, 0.018, 0)), 0.013, 0.011, L + 'LowerLeg', SK, seg=6)   # fibula
        K.ellip(ft, (0.032, 0.032, 0.032), L + 'Foot', SK, seg=8, rings=6)
        K.ellip(lerp(ft, tz, 0.55) + V((0, 0, 0.003)), (0.040, 0.086, 0.028), L + 'Foot', SK, e=2.3, seg=12, rings=8)
        K.ellip(tz + V((0, -0.026, -0.004)), (0.036, 0.046, 0.019), L + 'Toes', SK, e=2.3, seg=10, rings=6)


MATS = {
    'synth': [('Skin', '#8d95a8', False), ('SynthDark', '#262833', False), ('EyeGlow', '#70d8f2', True), ('AccentGlow', '#70d8f2', True)],
    'skel': [('Skin', '#dfe3e8', False), ('BoneDark', '#262833', False), ('EyeGlow', '#c42828', True)],
}


def build(kind, sex):
    """fresh scene -> (P, arm, [body obj], clip names); kind skel | synth"""
    reset()
    P = FEMALE if sex == 'female' else MALE
    arm = build_armature(P, 'Armature')
    K = Kit(arm, MATS[kind])
    (skeleton_bot if kind == 'skel' else synth)(K, P, sex)
    body = K.finish(arm)
    rig.body_shapekeys(body, P, sex)
    body['sex'] = sex
    stretch_mesh(body, P); stretch_bones(arm, P)
    names = anim.author(arm, P)
    return P, arm, [body], names
