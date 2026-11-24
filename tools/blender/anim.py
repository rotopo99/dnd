"""Procedural animation clips (FK by limb directions, auto-grounded legs).
Clips: loop idle walk run crouch_walk talk sit idle_2h walk_2h run_2h aim_2h; one-shot attack_melee attack_shoot cast hit death shrug shoot_2h attack_2h.
Two-handed clips (*_2h) drive both arms by IK from a weapon frame (see GRIP2H): rifle (shoulder / low ready) or staff (both fists on the shaft)."""
from common import *
from skeleton import joints, bone_table, FINGERS

FPS = 30
D = math.radians


def sm(x): x = max(0, min(1, x)); return x * x * (3 - 2 * x)


BASE = dict(hips_x=0, hips_y=0, hips_z=0, hips_rx=0, hips_ry=0, hips_rz=0, spine_rx=0, spine_ry=0, spine_rz=0, chest_rx=0, chest_ry=0, chest_rz=0,
            uchest_rx=0, uchest_ry=0, uchest_rz=0, neck_rx=0, neck_ry=0, neck_rz=0, head_rx=0, head_ry=0, head_rz=0, ground=1, ground_y=1, lift=0, grip=0.25, lean_y=0, Ls=0, Rs=0,
            ik2h=0, gx=0, gy=0, gz=0, w_yaw=0, w_pitch=0, w_roll=0, w_staff=0, w_sup=0.36, w_world=0)
# Two-handed weapon frame (armature space): d = barrel / knuckle direction, u = weapon up (rifle) = shaft towards the tip (staff),
# r = d x u. Right hand: thumb along u, fingers along d, back of the hand along r. Grip point of a fist in the hand bone frame:
GRIP_LOCAL = (0.0, 0.052, -0.028)
# -> weapon frame (game convention: grip at 0, +y up / shaft, +z barrel) in the rightHand bone frame: columns x_w, y_w, z_w
GRIP2H = dict(bone='rightHand', pos=list(GRIP_LOCAL), basis=[[0, 0, -1], [-1, 0, 0], [0, 1, 0]])
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
        bl = arm.data.bones                       # lengths from the (leg-stretched) armature, not the raw joint table
        self.L1 = bl['leftUpperLeg'].length; self.L2 = bl['leftLowerLeg'].length
        self.zank = bl['leftFoot'].head_local.z; self.zhip = bl['hips'].head_local.z
        self.kz = self.zhip / J['hips'][2]
        self.H = {b.name: b.head_local.copy() for b in arm.data.bones}
        self.M3 = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}
        self.LA = {s: (bl[s + 'UpperArm'].length, bl[s + 'LowerArm'].length) for s in ('left', 'right')}        # raw -> stretched scale of authored absolute hip heights (death)

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
            W[side + 'Shoulder'] = Quaternion((0, 1, 0), D(-(p[s + 's']) if s == 'L' else p[s + 's'])) @ W['upperChest']   # shrug
            Wc = W['upperChest']; sd = 1 if s == 'L' else -1
            W[side + 'UpperArm'] = Vector(self.dir[side + 'UpperArm']).rotation_difference(Wc @ vec(sd, p[s + 'Ad'], p[s + 'Af'], p[s + 'Ac']))
            W[side + 'LowerArm'] = Vector(self.dir[side + 'LowerArm']).rotation_difference(Wc @ vec(sd, p[s + 'Ed'], p[s + 'Ef'], p[s + 'Ec']))
            W[side + 'Hand'] = W[side + 'LowerArm']
        # grounding
        rest = Vector((0, 0, -(self.L1 + self.L2)))
        dz = dy = 0.0
        if p['ground']:
            dz = -min(a.z for a in ankles) - (self.L1 + self.L2) + p['lift'] * 0  # lowest ankle at rest height
            dy = -sum(a.y for a in ankles) / 2 * p['ground_y']
        loc = Vector((p['hips_x'], p['hips_y'] + dy * 1.0 + p['lean_y'], p['hips_z'] * (1 if p['ground'] else self.kz) + dz))
        if p['ik2h'] > 0.5: self.solve_2h(p, W, loc)
        return W, loc

    def posed_head(self, W, loc, name):
        chain = []; b = name
        while b: chain.append(b); b = self.par[b]
        chain.reverse(); pos = self.H[chain[0]] + loc
        for a, b in zip(chain[:-1], chain[1:]): pos = pos + W[a] @ (self.H[b] - self.H[a])
        return pos

    def weapon_frame(self, p, W, loc):
        """-> grip point G, d, u (armature space). Offsets / angles relative to the upper chest (w_world=1: hips position, world axes)."""
        Q = Quaternion((0, 0, 1), D(p['w_yaw'])) @ Quaternion((1, 0, 0), D(-p['w_pitch']))
        d = Q @ Vector((0, -1, 0)); u = Q @ Vector((0, 0, 1)); u = Quaternion(d, D(p['w_roll'])) @ u
        Wc = W['upperChest'] if p['w_world'] < 0.5 else Quaternion((1, 0, 0, 0))
        puc = self.posed_head(W, loc, 'upperChest')
        G = puc + Wc @ Vector((p['gx'], p['gy'], p['gz'])) * self.hs
        return G, (Wc @ d).normalized(), (Wc @ u).normalized()

    def solve_2h(self, p, W, loc):
        G, d, u = self.weapon_frame(p, W, loc); r = d.cross(u).normalized(); u = r.cross(d).normalized()
        frame = lambda x, y: (lambda X, Y: Matrix((X, Y, X.cross(Y))).transposed())(x.normalized(), (y - x.normalized() * y.dot(x.normalized())).normalized())
        gl = Vector(GRIP_LOCAL)
        TR = frame(-u, d)                                                      # thumb (-x) along u, fingers along d
        if p['w_staff'] > 0.5:
            S = G - u * p['w_sup'] * self.hs; TL = frame(u, d)                 # lower fist, thumb towards the tip
            poles = {'right': Vector((-1.0, 0.4, -0.6)), 'left': Vector((1.0, 0.4, -0.6))}
        else:
            S = G + d * p['w_sup'] * self.hs + u * 0.03; yl = d * math.cos(D(28)) + r * math.sin(D(28)); TL = frame(yl.cross(-u), yl)   # palm up under the fore-end, fingers across
            poles = {'right': Vector((-1.0, 0.5, -0.8)), 'left': Vector((0.5, 0.2, -1.0))}
        Wuc = W['upperChest']
        for side, T, tgt in (('right', TR, G), ('left', TL, S)):
            wrist = tgt - T @ gl
            sh = self.posed_head(W, loc, side + 'UpperArm'); L1, L2 = self.LA[side]
            v = wrist - sh; dist = min(max(v.length, abs(L1 - L2) + 1e-3), (L1 + L2) * 0.999); e = v.normalized()
            a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist); h = math.sqrt(max(0.0, L1 * L1 - a * a))
            pl = Wuc @ poles[side]; pl = (pl - e * pl.dot(e)).normalized()
            elbow = sh + e * a + pl * h; wr = sh + e * dist
            ua, la, hd = side + 'UpperArm', side + 'LowerArm', side + 'Hand'
            W[ua] = Vector(self.dir[ua]).rotation_difference(elbow - sh)
            Wla = Vector(self.dir[la]).rotation_difference(wr - elbow)
            Wh = T.to_quaternion() @ self.M3[hd].to_quaternion().inverted()
            res = Wla.inverted() @ Wh; ax = Vector(self.dir[la])
            tw = 2 * math.atan2(Vector((res.x, res.y, res.z)).dot(ax), res.w)
            if tw > math.pi: tw -= 2 * math.pi
            if tw < -math.pi: tw += 2 * math.pi
            W[la] = Wla @ Quaternion(ax, 0.55 * tw); W[hd] = Wh

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
    """Weight on the left leg (straight), right knee relaxed and forward, hip pushed out + tilted, counter-rotated chest, slow breathing, head drifts."""
    t = 2 * math.pi * f / n; b = math.sin(t); b2 = math.sin(2 * t)
    return {**BASE, 'hips_x': 0.028 + 0.004 * math.sin(t), 'hips_rz': 5 + 1.2 * math.sin(t), 'hips_ry': 3 + 0.6 * b, 'spine_rz': -3, 'chest_rz': -5 - 1.0 * math.sin(t),
            'chest_ry': -2, 'chest_rx': 1.4 * b, 'uchest_rx': 1.0 * b, 'uchest_rz': -2, 'head_rx': 1.5 - 1.0 * b, 'head_rz': 4 + 2 * math.sin(t + 0.8), 'head_ry': 3 * math.sin(t * 0.5 + 1),
            'hips_z': 0.003 * b, 'Lf': -3, 'Lk': 2, 'La': 2, 'Rf': 10, 'Rk': 16, 'Ra': 9, 'Rt': -6,
            'LAf': 6 + 2 * b, 'RAf': 10 + 2 * b, 'LAd': 74 + 1.2 * b, 'RAd': 72 + 1.2 * b, 'LEf': 24 + 3 * b, 'REf': 30 + 3 * b, 'grip': 0.3 + 0.05 * b2}


def clip_walk(f, n, run=False, crouch=False, robe=False):
    """robe: shorter stride and back kick for long robes / coats (the hem follows the thighs; no boots through the cloth)."""
    t = 2 * math.pi * f / n; s, c = math.sin(t), math.cos(t)
    A = 52 if run else (20 if crouch else 28); K = 95 if run else (30 if crouch else 42)
    base = 62 if crouch else (10 if run else 0); kb = 100 if crouch else (20 if run else 8)
    if robe and not crouch: A, K, base, kb = (30, 30, 6, 10) if run else (21, 28, 0, 8)
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


def clip_talk(f, n):
    """Conversational loop: weight shift, right hand beats with an open palm, left hand half-raised, head nods on the beats."""
    t = 2 * math.pi * f / n; b = math.sin(t); beat = max(0.0, math.sin(3 * t)) ** 2; beat2 = max(0.0, math.sin(2 * t + 1.2)) ** 2
    p = clip_idle(f, n)
    p.update({'RAd': 68 - 4 * beat, 'RAf': 24 + 10 * beat, 'RAc': 12, 'REd': 30 - 10 * beat, 'REf': 70 + 8 * beat, 'REc': 16 - 6 * beat,
              'LAd': 72 - 4 * beat2, 'LAf': 16 + 6 * beat2, 'LEd': 46 - 8 * beat2, 'LEf': 58 + 6 * beat2, 'LEc': 18,
              'head_rx': 2 + 5 * beat - 2 * b, 'head_ry': 6 * math.sin(t + 0.5), 'head_rz': 2 + 2 * math.sin(t * 2),
              'chest_ry': -4 + 4 * math.sin(t), 'chest_rx': 2 + 1.5 * beat, 'grip': 0.12 + 0.1 * beat, 'Rs': 2 * beat})
    return p


def keys_shrug():
    up = dict(Ls=16, Rs=16, LAd=68, LAf=14, LAc=-6, LEd=22, LEf=58, LEc=-38, RAd=68, RAf=14, RAc=-6, REd=22, REf=58, REc=-38,
              head_rz=9, head_rx=-3, head_ry=-4, chest_rx=-3, uchest_rx=-2, grip=0.05, Lf=4, Rf=6, Rk=10, hips_rz=2)
    return [(0, {}), (8, up), (22, {**up, 'Ls': 13, 'Rs': 13, 'head_rz': 11}), (36, {})]


def clip_sit(f, n):
    """Seated loop (seat ~0.45-0.5 m: thighs level, shins vertical, feet flat), hands on the thighs, slow breathing.
    Feet stay at the actor position (ground_y = 0): put the seat behind the actor's origin."""
    t = 2 * math.pi * f / n; b = math.sin(t)
    p = dict(BASE)
    p.update({'Lf': 86, 'Rf': 82, 'Lk': 84, 'Rk': 78, 'La': 6, 'Ra': 8, 'Lt': 0, 'Rt': 4, 'ground_y': 0,
              'hips_rx': -4, 'spine_rx': 6, 'chest_rx': 4 + 1.2 * b, 'uchest_rx': 2 + 0.8 * b, 'head_rx': 2 - 1.2 * b, 'head_rz': 2 * math.sin(t * 0.5),
              'LAd': 66, 'LAf': 40 + 1.5 * b, 'LAc': 6, 'LEd': 30, 'LEf': 86, 'LEc': 14, 'RAd': 66, 'RAf': 40 + 1.5 * b, 'RAc': 6, 'REd': 30, 'REf': 86, 'REc': 14,
              'grip': 0.35, 'hips_z': 0.002 * b})
    return p


# ------------------------------------------------------------------ two-handed (rifle / staff) - arms by IK, see Rig.solve_2h
LOW = dict(ik2h=1, gx=-0.10, gy=-0.25, gz=-0.24, w_yaw=38, w_pitch=-24, w_roll=-14, grip=0.85)            # low ready, muzzle down-left
AIM = dict(ik2h=1, gx=-0.09, gy=-0.33, gz=0.05, w_yaw=22, w_pitch=0, w_roll=0, grip=0.85)                  # shouldered (torso turned right)
PORT = dict(ik2h=1, gx=-0.08, gy=-0.20, gz=-0.16, w_yaw=58, w_pitch=36, w_roll=-20, grip=0.9)              # port arms: diagonal across the chest


def clip_idle_2h(f, n):
    p = clip_idle(f, n); t = 2 * math.pi * f / n; b = math.sin(t)
    p.update(LOW); p.update({'gz': LOW['gz'] + 0.006 * b, 'w_pitch': LOW['w_pitch'] + 1.5 * b, 'chest_rz': -3 - 1.0 * math.sin(t), 'Rf': 6, 'Rk': 12})
    return p


def clip_walk_2h(f, n, run=False, robe=False):
    p = clip_walk(f, n, run=run, robe=robe); t = 2 * math.pi * f / n; s = math.sin(t)
    p.update(PORT if run else LOW)
    p['chest_rz'] = -(4 if run else 3) * s; p['hips_rz'] = (8 if run else 5) * s; p['head_rz'] = -0.5 * p['chest_rz']
    p['gz'] += (0.012 if run else 0.006) * math.cos(2 * t); p['w_pitch'] += (3 if run else 2) * math.sin(2 * t)
    if run: p['chest_rx'] = 9; p['spine_rx'] = 6
    return p


def stance_aim(b=0.0):
    return {**BASE, **AIM, 'chest_rz': -14, 'uchest_rz': -6, 'hips_rz': -10, 'spine_rx': 3, 'chest_rx': 3 + 0.8 * b, 'head_rz': 14, 'head_rx': 7, 'neck_rz': 4, 'head_ry': 6,
            'Lf': 12, 'Lk': 12, 'Rf': -8, 'Rk': 8, 'La': 6, 'Ra': 8, 'Rt': 4, 'hips_x': -0.01, 'Rs': 3, 'gz': AIM['gz'] + 0.004 * b}


def clip_aim_2h(f, n):
    return stance_aim(math.sin(2 * math.pi * f / n))


def keys_shoot_2h():
    a = stance_aim(); kick = {**a, 'gy': a['gy'] + 0.045, 'gz': a['gz'] + 0.012, 'w_pitch': 7, 'chest_rx': -1, 'spine_rx': 0, 'head_rx': 3, 'hips_y': 0.02, 'Rs': 6}
    return [(0, a), (2, kick), (5, {**kick, 'gy': a['gy'] + 0.02, 'w_pitch': 3}), (12, a), (20, a)]


def keys_attack_2h():
    """Overhead two-handed strike with a staff / heavy weapon: wind-up over the right shoulder, step in, chop down, recover."""
    hold = dict(ik2h=1, w_staff=1, w_sup=0.30, grip=1.0, gx=-0.05, gy=-0.28, gz=-0.12, w_yaw=26, w_pitch=-40, w_roll=0)   # guard: shaft forward-up, butt past the right hip
    st = dict(Lf=12, Rf=-8, Lk=14, Rk=10)
    wind = {**hold, **st, 'gx': -0.14, 'gy': -0.02, 'gz': 0.26, 'w_pitch': 100, 'w_yaw': -12, 'w_roll': 10, 'chest_rz': -26, 'uchest_rz': -8, 'hips_rz': -10,
            'chest_rx': -8, 'spine_rx': -4, 'head_rz': 14, 'head_rx': -4, 'Lf': 20, 'Lk': 24, 'Rf': -14, 'Rk': 18}
    top = {**wind, 'w_pitch': 112, 'gz': 0.30, 'chest_rx': -10}
    hit = {**hold, 'gx': -0.10, 'gy': -0.40, 'gz': -0.20, 'w_pitch': -80, 'w_yaw': 32, 'chest_rz': 10, 'uchest_rz': 4, 'hips_rz': 8, 'chest_rx': 18, 'spine_rx': 12,
           'uchest_rx': 6, 'hips_rx': 8, 'head_rx': -12, 'head_rz': -4, 'Lf': 44, 'Lk': 44, 'Rf': -26, 'Rk': 26}
    foll = {**hit, 'w_pitch': -90, 'gz': -0.26, 'gy': -0.38, 'chest_rx': 20}
    g0 = {**hold, **st}
    return [(0, g0), (10, wind), (16, top), (22, hit), (28, foll), (44, g0)]


def author(arm, P, gait=None):
    """creates all actions on the armature (no NLA); returns names. gait='robe': shorter walk / run strides (long robes, coats)."""
    rb = gait == 'robe'
    rig = Rig(arm, P); names = []
    def run(name, n, fn, loop=True):
        act = new_action(arm, name)
        for f in range(n if loop else n + 1): rig.apply(fn(f), f + 1)
        act.frame_range = (1, n if loop else n + 1) if loop else (1, n + 1)
        act.use_frame_range = True; act['loop'] = loop
        names.append(name)
    run('idle', 60, lambda f: clip_idle(f, 60))
    run('walk', 32, lambda f: clip_walk(f, 32, robe=rb))
    run('run', 24, lambda f: clip_walk(f, 24, run=True, robe=rb))
    run('crouch_walk', 36, lambda f: clip_walk(f, 36, crouch=True))
    run('talk', 90, lambda f: clip_talk(f, 90))
    run('sit', 90, lambda f: clip_sit(f, 90))
    run('idle_2h', 60, lambda f: clip_idle_2h(f, 60))
    run('walk_2h', 32, lambda f: clip_walk_2h(f, 32, robe=rb))
    run('run_2h', 24, lambda f: clip_walk_2h(f, 24, run=True, robe=rb))
    run('aim_2h', 40, lambda f: clip_aim_2h(f, 40))
    for name, keys, n in (('shrug', keys_shrug(), 36), ('attack_melee', keys_attack_melee(), 40), ('attack_shoot', keys_attack_shoot(), 42), ('cast', keys_cast(), 58), ('hit', keys_hit(), 20), ('death', keys_death(), 50), ('shoot_2h', keys_shoot_2h(), 20), ('attack_2h', keys_attack_2h(), 44)):
        run(name, n, lambda f, keys=keys: interp(keys, f), loop=False)
    arm.animation_data.action = None
    for pb in arm.pose.bones: pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    return names
