"""Humanoid skeleton (VRM 1.0 humanoid bone names, T-pose, +X = character's left, front = -Y, Z up)."""
from common import *

# per-sex proportions
MALE = dict(name='male', hs=1.0, sw=0.17, hx=0.092, torso=(0.150, 0.130, 0.150, 0.105), limb=1.0, chest=0.0)
FEMALE = dict(name='female', hs=0.935, sw=0.140, hx=0.088, torso=(0.152, 0.098, 0.128, 0.100), limb=0.88, chest=1.0)

FINGERS = {  # name: (y offset, segment lengths)
    'Index': (-0.028, (0.034, 0.021, 0.019)), 'Middle': (-0.010, (0.038, 0.025, 0.020)),
    'Ring': (0.008, (0.035, 0.023, 0.019)), 'Little': (0.024, (0.028, 0.017, 0.015))}


def joints(P):
    """-> dict joint positions (left side, x>0) + trunk."""
    hs, sw, hx = P['hs'], P['sw'], P['hx']
    J = {}
    z = lambda v: v * hs
    J['hips'] = (0, 0, z(0.92)); J['spine'] = (0, 0, z(1.02)); J['chest'] = (0, 0, z(1.17))
    J['upperChest'] = (0, 0, z(1.32)); J['neck'] = (0, 0.005, z(1.45)); J['head'] = (0, 0.012, z(1.55)); J['headTop'] = (0, 0.012, z(1.79))
    az = z(1.435)
    J['shoulder'] = (0.035, 0, az); J['upperArm'] = (sw, 0, az); J['lowerArm'] = (sw + 0.27 * hs, 0, az)
    J['hand'] = (sw + 0.52 * hs, 0, az); J['handEnd'] = (sw + 0.595 * hs, 0, az)
    J['upperLeg'] = (hx, 0, z(0.92)); J['lowerLeg'] = (hx, -0.005, z(0.50)); J['foot'] = (hx, 0.0, z(0.085))
    J['toes'] = (hx, -0.125, z(0.035)); J['toesEnd'] = (hx, -0.19, z(0.02))
    return J


def bone_table(P):
    """[(name, parent, head, tail)] for both sides."""
    J = joints(P); B = []
    B += [('hips', None, J['hips'], J['spine']), ('spine', 'hips', J['spine'], J['chest']), ('chest', 'spine', J['chest'], J['upperChest']),
          ('upperChest', 'chest', J['upperChest'], J['neck']), ('neck', 'upperChest', J['neck'], J['head']), ('head', 'neck', J['head'], J['headTop'])]
    for side, sx in (('left', 1), ('right', -1)):
        m = lambda p: (p[0] * sx, p[1], p[2])
        L = lambda n: side + n
        B += [(L('Shoulder'), 'upperChest', m(J['shoulder']), m(J['upperArm'])), (L('UpperArm'), L('Shoulder'), m(J['upperArm']), m(J['lowerArm'])),
              (L('LowerArm'), L('UpperArm'), m(J['lowerArm']), m(J['hand'])), (L('Hand'), L('LowerArm'), m(J['hand']), m(J['handEnd'])),
              (L('UpperLeg'), 'hips', m(J['upperLeg']), m(J['lowerLeg'])), (L('LowerLeg'), L('UpperLeg'), m(J['lowerLeg']), m(J['foot'])),
              (L('Foot'), L('LowerLeg'), m(J['foot']), m(J['toes'])), (L('Toes'), L('Foot'), m(J['toes']), m(J['toesEnd']))]
        hs = P['hs']; hx0, hy, hz = J['handEnd']
        for fn, (fy, segs) in FINGERS.items():
            x = hx0 - 0.004 * hs
            for k, (sn, ln) in enumerate(zip(('Proximal', 'Intermediate', 'Distal'), segs)):
                ln *= hs; par = L('Hand') if k == 0 else L(fn + ('Proximal', 'Intermediate')[k - 1])
                B.append((L(fn + sn), par, m((x, fy * hs, hz - 0.002)), m((x + ln, fy * hs, hz - 0.002))))
                x += ln
        # thumb: from the wrist-side of the palm, forward (-Y) and outward
        d = Vector((0.45, -0.85, -0.2)).normalized(); p = Vector((J['hand'][0] + 0.02 * hs, -0.026 * hs, hz - 0.004))
        for sn, ln in (('Metacarpal', 0.028), ('Proximal', 0.030), ('Distal', 0.026)):
            q = p + d * ln * hs
            B.append((L('Thumb' + sn), L('Hand') if sn == 'Metacarpal' else L('Thumb' + ('Metacarpal', 'Proximal')[('Proximal', 'Distal').index(sn)]),
                      m(tuple(p)), m(tuple(q))))
            p = q
    return B


def build_armature(P, name='Armature'):
    arm = bpy.data.armatures.new(name); o = bpy.data.objects.new(name, arm); link(o)
    mode('OBJECT', o); mode('EDIT', o)
    for n, par, h, t in bone_table(P):
        b = arm.edit_bones.new(n); b.head = h; b.tail = t
        if par: b.parent = arm.edit_bones[par]
        # keep chains connected only where natural (not shoulders/hips/fingers roots)
    for b in arm.edit_bones:
        if (b.name in ('spine', 'chest', 'upperChest', 'neck', 'head') or b.name.endswith(('LowerArm', 'LowerLeg', 'Foot', 'Toes'))
                or b.name.endswith(('Intermediate', 'Distal', 'ThumbProximal'))):
            if b.parent and (b.parent.tail - b.head).length < 1e-4: b.use_connect = True
    mode('OBJECT', o)
    o.show_in_front = True
    return o


def head_pos(P): return Vector(joints(P)['head'])


# ------------------------------------------------------------------ leg stretch (pass 3: stylized ~8 heads)
# Everything is authored in the 'raw' layout above; then the shin/thigh band [LEG_Z0, LEG_Z1] * hs is stretched by LEG
# (soft ramps at both ends, feet and pelvis keep their shape) and everything above moves up. zmap / zinv are exact inverses.
LEG = float(os.environ.get('LEG_STRETCH', '1.17'))
LEG_Z0, LEG_Z1, LEG_RAMP = 0.13, 0.86, 0.07
_ZT = {}


def _ztab(hs):
    import numpy as np
    if hs not in _ZT:
        z = np.linspace(-0.5, 3.0, 7001); a, b, r = LEG_Z0 * hs, LEG_Z1 * hs, LEG_RAMP * hs
        ramp = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
        s = 1 + (LEG - 1) * ramp((z - a) / r) * ramp((b - z) / r)
        zm = np.concatenate([[0.0], np.cumsum((s[1:] + s[:-1]) / 2 * np.diff(z))])
        zm = zm - np.interp(0.0, z, zm)          # z = 0 (floor) stays at 0
        _ZT[hs] = (z, zm)
    return _ZT[hs]


def zmap(z, P):
    import numpy as np
    zs, zm = _ztab(P['hs']); return float(np.interp(z, zs, zm))


def zinv(z, P):
    import numpy as np
    zs, zm = _ztab(P['hs']); return float(np.interp(z, zm, zs))


def stretch_mesh(o, P, inverse=False):
    """Map z of all vertices (+ shape keys) of a mesh object (armature at the origin)."""
    f = zinv if inverse else zmap
    me = o.data
    if me.shape_keys:
        for kb in me.shape_keys.key_blocks:
            for d in kb.data: d.co.z = f(d.co.z, P)
    for v in me.vertices: v.co.z = f(v.co.z, P)
    me.update()


def stretch_bones(arm, P, names=None):
    """Map z of the bone heads / tails (all bones or the given names)."""
    mode('OBJECT', arm); mode('EDIT', arm)
    eb = [b for b in arm.data.edit_bones if names is None or b.name in names]
    con = {b.name: b.use_connect for b in eb}
    for b in eb: b.use_connect = False
    for b in eb: b.head.z = zmap(b.head.z, P); b.tail.z = zmap(b.tail.z, P)
    for b in eb: b.use_connect = con[b.name]
    mode('OBJECT', arm)


def height_m(P): return zmap(1.79 * P['hs'], P)
