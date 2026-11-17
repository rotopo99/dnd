"""Procedural animation clips (FK by limb directions, auto-grounded legs). Clips: idle walk run attack_melee attack_shoot cast hit death crouch_walk."""
from common import *
from skeleton import joints, bone_table, FINGERS

FPS = 30
D = math.radians


def sm(x): x = max(0, min(1, x)); return x * x * (3 - 2 * x)


BASE = dict(hips_x=0, hips_y=0, hips_z=0, hips_rx=0, hips_ry=0, hips_rz=0, spine_rx=0, spine_ry=0, spine_rz=0, chest_rx=0, chest_ry=0, chest_rz=0,
            uchest_rx=0, uchest_ry=0, uchest_rz=0, neck_rx=0, neck_ry=0, neck_rz=0, head_rx=0, head_ry=0, head_rz=0, ground=1, lift=0, grip=0.25, lean_y=0)
for s in 'LR':
    BASE.update({s + 'f': 0, s + 'a': 3, s + 'k': 2, s + 't': 0,                     # leg: forward, abduct, knee, ankle
                 s + 'Ad': 76, s + 'Af': 4, s + 'Ac': 0, s + 'Ed': 78, s + 'Ef': 22, s + 'Ec': 0, s + 'Hd': 0})   # arm: down, forward, cross | forearm: down, fwd, cross


def interp(keys, f, loop=False, n=None):
    """keys: [(frame, dict)] sorted; cosine ease between neighbours; missing params = BASE."""
    ks = [(fr, {**BASE, **d}) for fr, d in keys]
    if loop:
        ks = ks + [(n, ks[0][1])]
    for (f0, a), (f1, b) in zip(ks[:-1], ks[1:]):
        if f0 <= f <= f1:
            t = sm((f - f0) / max(1e-6, f1 - f0)) if f1 > f0 else 1
            return {k: a[k] + (b[k] - a[k]) * t for k in a}
    return dict(ks[-1][1])


def vec(side, down, fwd, cross):
    d = Vector((side * math.cos(D(down)) * math.cos(D(fwd)) - side * math.sin(D(cross)), -math.sin(D(fwd)), -math.sin(D(down))))
    return d.normalized()


class Rig:
    def __init__(self, arm, P):
        self.arm = arm; self.P = P; self.hs = P['hs']; J = joints(P); self.J = J
        self.R = {b.name: b.matrix_local.to_3x3().to_quaternion() for b in arm.data.bones}
        self.par = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
        self.dir = {b.name: (b.tail_local - b.head_local).normalized() for b in arm.data.bones}
        self.order = [b[0] for b in bone_table(P)]
        self.L1 = (Vector(J['upperLeg']) - Vector(J['lowerLeg'])).length; self.L2 = (Vector(J['lowerLeg']) - Vector(J['foot'])).length
        self.zank = J['foot'][2]; self.zhip = J['hips'][2]

    def leg_vecs(self, p, s):
        f, a, k = p[s + 'f'], p[s + 'a'], p[s + 'k']; sd = 1 if s == 'L' else -1
        d1 = Vector((sd * math.sin(D(a)), -math.sin(D(f)), -math.cos(D(f)))).normalized()
        d2 = Vector((sd * math.sin(D(a)) * 0.6, -math.sin(D(f - k)), -math.cos(D(f - k)))).normalized()
        return d1, d2

    def solve(self, p):
        """-> dict bone -> world rotation quaternion, hips location offset (armature space)."""
        W = {}; Q = Quaternion
        eul = lambda x, y, z: Euler((D(x), D(y), D(z)), 'XYZ').to_quaternion()
        W['hips'] = eul(p['hips_rx'], p['hips_ry'], p['hips_rz'])
        W['spine'] = eul(p['spine_rx'], p['spine_ry'], p['spine_rz']) @ W['hips']
        W['chest'] = eul(p['chest_rx'], p['chest_ry'], p['chest_rz']) @ W['spine']
        W['upperChest'] = eul(p['uchest_rx'], p['uchest_ry'], p['uchest_rz']) @ W['chest']
        W['neck'] = eul(p['neck_rx'], p['neck_ry'], p['neck_rz']) @ W['upperChest']
        W['head'] = eul(p['head_rx'], p['head_ry'], p['head_rz']) @ W['neck']
        hipsW = W['hips']; ankles = []
        for s, side in (('L', 'left'), ('R', 'right')):
            d1, d2 = self.leg_vecs(p, s)
            W[side + 'UpperLeg'] = (hipsW @ d1).rotation_difference(Vector((0, 0, 0))) if False else Vector(self.dir[side + 'UpperLeg']).rotation_difference(hipsW @ d1)
            W[side + 'LowerLeg'] = Vector(self.dir[side + 'LowerLeg']).rotation_difference(hipsW @ d2)
            W[side + 'Foot'] = eul(p[s + 't'], 0, 0) @ Quaternion((1, 0, 0, 0))
            W[side + 'Toes'] = W[side + 'Foot']
            ankles.append(hipsW @ (d1 * self.L1 + d2 * self.L2))
            W[side + 'Shoulder'] = W['upperChest']
            Wc = W['upperChest']; sd = 1 if s == 'L' else -1
            W[side + 'UpperArm'] = Vector(self.dir[side + 'UpperArm']).rotation_difference(Wc @ vec(sd, p[s + 'Ad'], p[s + 'Af'], p[s + 'Ac']))
            W[side + 'LowerArm'] = Vector(self.dir[side + 'LowerArm']).rotation_difference(Wc @ vec(sd, p[s + 'Ed'], p[s + 'Ef'], p[s + 'Ec']))
            W[side + 'Hand'] = W[side + 'LowerArm']
        # grounding
        rest = Vector((0, 0, -(self.L1 + self.L2)))
        dz = dy = 0.0
        if p['ground']:
            dz = -min(a.z for a in ankles) - (self.L1 + self.L2) + p['lift'] * 0  # lowest ankle at rest height
            dy = -sum(a.y for a in ankles) / 2
        loc = Vector((p['hips_x'], p['hips_y'] + dy * 1.0 + p['lean_y'], p['hips_z'] + dz))
        return W, loc

    def apply(self, p, frame):
        W, loc = self.solve(p)
        pb = self.arm.pose.bones
        for b in self.order:
            Rq = self.R[b]; par = self.par[b]
            if b not in W:
                if b.startswith(('left', 'right')) and any(fn in b for fn in list(FINGERS) + ['Thumb']):
                    # finger curl in the bone's own rest frame
                    side = 1 if b.startswith('left') else -1
                    seg = 0 if 'Proximal' in b else (1 if 'Intermediate' in b else 2)
                    ang = (p['grip'] * (55, 75, 50)[seg]) * (0.55 if 'Thumb' in b else 1.0) + (6 if 'Thumb' in b else 0)
                    if 'Thumb' in b: rot = Quaternion((0, 0, 1), D(-side * ang * 0.6))
                    else: rot = Quaternion((0, 1, 0), D(side * ang))
                    pb[b].rotation_quaternion = Rq.inverted() @ rot @ Rq
                    pb[b].keyframe_insert('rotation_quaternion', frame=frame)
                    W[b] = W[par]
                    continue
                W[b] = W[par]
            Wp = W[par] if par else Quaternion((1, 0, 0, 0))
            q = Rq.inverted() @ (Wp.inverted() @ W[b]) @ Rq
            pb[b].rotation_mode = 'QUATERNION'; pb[b].rotation_quaternion = q
            pb[b].keyframe_insert('rotation_quaternion', frame=frame)
        # finger parents that are in W-less chains inherit via their own local rotation (W only tracks posed chain)
        pbh = pb['hips']; pbh.location = Rq_inv_loc(self.R['hips'], loc)
        pbh.keyframe_insert('location', frame=frame)


def Rq_inv_loc(Rq, v): return Rq.inverted() @ v


def new_action(arm, name):
    act = bpy.data.actions.new(name)
    if not arm.animation_data: arm.animation_data_create()
    arm.animation_data.action = act
    for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    act.use_fake_user = True
    return act


# ------------------------------------------------------------------ clips (param dict per frame)
def clip_idle(f, n):
    t = 2 * math.pi * f / n; b = math.sin(t)
    return {**BASE, 'chest_rx': 1.2 * b, 'uchest_rx': 0.8 * b, 'head_rx': -0.8 * b + 1.5, 'hips_z': 0.003 * b, 'hips_x': 0.006 * math.sin(t), 'hips_rz': 1.0 * math.sin(t),
            'chest_rz': -1.0 * math.sin(t), 'LAf': 4 + 2 * b, 'RAf': 4 + 2 * b, 'LAd': 76 + 1.2 * b, 'RAd': 76 + 1.2 * b, 'Lf': 2, 'Rf': -2, 'Lk': 3, 'Rk': 3, 'LEf': 22 + 3 * b, 'REf': 22 + 3 * b, 'head_rz': 2 * math.sin(t)}


def clip_walk(f, n, run=False, crouch=False):
    t = 2 * math.pi * f / n; s, c = math.sin(t), math.cos(t)
    A = 52 if run else (20 if crouch else 28); K = 95 if run else (30 if crouch else 42)
    base = 62 if crouch else (10 if run else 0); kb = 100 if crouch else (20 if run else 8)
    p = dict(BASE)
    for sd, ph in (('L', 0.0), ('R', math.pi)):
        sn, cs = math.sin(t + ph), math.cos(t + ph)
        th = base + A * sn
        p[sd + 'f'] = th; p[sd + 'k'] = kb + K * max(0, cs) ** 1.5 + (0 if run else 0); p[sd + 't'] = -0.3 * (th - base) + (12 if crouch else 0) * 0 + (10 * max(0, cs) if run else 0) + (-base * 0.45 if crouch else 0)
        p[sd + 'a'] = 3 if not crouch else 8
        arm_sw = (-1 if sd == 'L' else -1) * 0
        a_sw = -(48 if run else (14 if crouch else 24)) * sn
        p[sd + 'Af'] = (4 if not run else 10) + a_sw
        p[sd + 'Ef'] = (30 + max(0, -a_sw) * 0.6) if not run else (85 + 10 * (-a_sw) / 48)
        p[sd + 'Ed'] = 78 if not run else 40
        p[sd + 'Ad'] = 76 if not run else 70
        p[sd + 'Ac'] = 0
        if crouch: p[sd + 'Af'] = 25 + a_sw; p[sd + 'Ef'] = 55 + max(0, -a_sw)
    p['grip'] = 0.9 if run else 0.3
    p['hips_rz'] = (9 if run else 5) * s; p['chest_rz'] = -(14 if run else 8) * s; p['head_rz'] = (5 if run else 3) * s
    p['hips_x'] = 0.012 * s; p['hips_ry'] = 0
    p['chest_rx'] = (6 if run else (14 if crouch else 1)); p['spine_rx'] = (5 if run else (10 if crouch else 0)); p['uchest_rx'] = (3 if run else (6 if crouch else 0))
    p['head_rx'] = -(8 if run else (16 if crouch else 0)); p['hips_rx'] = (4 if run else (8 if crouch else 0))
    bob = -(0.035 if run else 0.012) * math.cos(2 * t) if not crouch else -0.012 * math.cos(2 * t)
    p['hips_z'] = bob - (0.0 if not run else 0.0)
    return p


def keys_attack_melee():
    idle = dict(Lf=12, Rf=-8, Lk=14, Rk=10)
    return [(0, idle),
            (8, dict(chest_rz=-28, hips_rz=-10, head_rz=12, spine_rx=-4, RAd=-48, RAf=-32, RAc=0, REd=-10, REf=-58, Lf=18, Rf=-14, Lk=22, Rk=18, LAd=62, LAf=30, LEf=50, grip=0.9, chest_rx=-4, head_rx=-5)),
            (14, dict(chest_rz=-28, hips_rz=-10, head_rz=12, RAd=-58, RAf=-40, REd=-20, REf=-62, Lf=18, Rf=-14, Lk=22, Rk=18, LAd=62, LAf=30, LEf=50, grip=1, chest_rx=-6, head_rx=-5)),
            (20, dict(chest_rz=26, hips_rz=14, head_rz=-12, spine_rx=8, chest_rx=10, RAd=24, RAf=64, REd=14, REf=74, Lf=42, Rf=-24, Lk=40, Rk=24, LAd=64, LAf=-10, LEf=30, grip=1, head_rx=-6, hips_rx=6)),
            (28, dict(chest_rz=20, hips_rz=12, head_rz=-8, spine_rx=6, chest_rx=8, RAd=30, RAf=58, REd=20, REf=68, Lf=40, Rf=-22, Lk=36, Rk=22, LAd=64, LAf=-8, LEf=30, grip=0.9)),
            (40, idle)]


def keys_attack_shoot():
    aim = dict(RAd=14, RAf=78, RAc=-10, REd=12, REf=82, REc=-12, LAd=22, LAf=76, LAc=34, LEd=25, LEf=82, LEc=30, grip=0.85, chest_rz=-8, head_rz=-6, Lf=12, Rf=-12, Lk=12, Rk=10, spine_rx=3, chest_rx=2, head_rx=2, hips_rz=-5)
    rec = {**aim, 'RAd': 26, 'LAd': 34, 'chest_rx': -3, 'spine_rx': 0, 'head_rx': -2, 'RAf': 70, 'LAf': 70, 'hips_y': 0.03, 'Lk': 16, 'Rk': 14}
    return [(0, dict(grip=0.3)), (9, aim), (16, aim), (18, rec), (24, aim), (32, aim), (42, dict(grip=0.3))]


def keys_cast():
    up = dict(LAd=-30, LAf=10, LAc=0, LEd=-52, LEf=14, RAd=-30, RAf=10, REd=-52, REf=14, head_rx=-14, chest_rx=-8, spine_rx=-3, grip=0.1, Lk=8, Rk=8, hips_z=0.01)
    gather = dict(LAd=20, LAf=50, LAc=25, LEd=10, LEf=70, LEc=40, RAd=20, RAf=50, RAc=25, REd=10, REf=70, REc=40, grip=0.5, chest_rx=6, head_rx=6, spine_rx=3, Lk=14, Rk=14, Lf=6, Rf=-6)
    thrust = dict(LAd=10, LAf=88, LAc=6, LEd=8, LEf=90, LEc=4, RAd=10, RAf=88, RAc=6, REd=8, REf=90, REc=4, grip=0.1, chest_rx=10, spine_rx=6, head_rx=2, Lf=22, Rf=-14, Lk=22, Rk=14)
    return [(0, {}), (10, gather), (22, up), (28, up), (34, thrust), (44, thrust), (58, {})]


def keys_hit():
    h = dict(hips_y=0.07, chest_rx=-14, spine_rx=-6, head_rx=-16, head_rz=10, LAd=55, LAf=-18, LEd=50, LEf=10, RAd=55, RAf=-18, REd=50, REf=10, Lk=26, Rk=26, Lf=8, Rf=-14, grip=0.9, chest_rz=8, hips_rz=-4)
    return [(0, {}), (3, h), (8, {**h, 'hips_y': 0.04, 'chest_rx': -10, 'head_rx': -10}), (20, {})]


def keys_death():
    stag = dict(hips_y=0.06, chest_rx=-12, head_rx=-14, Lk=30, Rk=26, Lf=14, Rf=-10, LAd=50, RAd=50, LAf=-10, RAf=-10, grip=0.8)
    fall = dict(hips_rx=-62, hips_y=0.30, hips_z=-0.55, chest_rx=-8, head_rx=-18, Lk=55, Rk=70, Lf=40, Rf=30, LAd=18, RAd=24, LAf=-20, RAf=-30, LEd=30, REd=36, LEf=-20, REf=-26, ground=0, grip=0.5)
    lie = dict(hips_rx=-90, hips_y=0.10, hips_z=-0.795, chest_rx=0, head_rx=-6, head_rz=14, Lk=8, Rk=22, Lf=-6, Rf=-12, La=16, Ra=14, LAd=10, RAd=14, LAf=0, RAf=-6, LEd=18, REd=20, LEf=-10, REf=0, ground=0, grip=0.2)
    return [(0, {}), (5, stag), (22, fall), (36, lie), (50, lie)]


def author(arm, P):
    """creates all actions on the armature (no NLA); returns names."""
    rig = Rig(arm, P); names = []
    def run(name, n, fn, loop=True):
        act = new_action(arm, name)
        for f in range(n if loop else n + 1): rig.apply(fn(f), f + 1)
        act.frame_range = (1, n if loop else n + 1) if loop else (1, n + 1)
        act.use_frame_range = True; act['loop'] = loop
        names.append(name)
    run('idle', 60, lambda f: clip_idle(f, 60))
    run('walk', 32, lambda f: clip_walk(f, 32))
    run('run', 24, lambda f: clip_walk(f, 24, run=True))
    run('crouch_walk', 36, lambda f: clip_walk(f, 36, crouch=True))
    for name, keys, n in (('attack_melee', keys_attack_melee(), 40), ('attack_shoot', keys_attack_shoot(), 42), ('cast', keys_cast(), 58), ('hit', keys_hit(), 20), ('death', keys_death(), 50)):
        run(name, n, lambda f, keys=keys: interp(keys, f), loop=False)
    arm.animation_data.action = None
    for pb in arm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    return names
