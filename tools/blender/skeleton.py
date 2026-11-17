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
    J['upperChest'] = (0, 0, z(1.32)); J['neck'] = (0, 0.005, z(1.45)); J['head'] = (0, 0.012, z(1.55)); J['headTop'] = (0, 0.012, z(1.78))
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
