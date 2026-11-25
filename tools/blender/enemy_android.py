"""Warprom android stormtrooper (enemy_android.glb): the synth body of robo.py in dark steel + olive hard armour (cuirass, pauldrons, guards, backpack),
closed helmet with slanted red visor slits. Hero rig / clips / meta like the other humanoid enemies. Materials: AndroidPlate (olive, tinted by the game),
AndroidFrame, AndroidDark, AndroidGlow (red emissive)."""
from common import *
from skeleton import MALE, joints, build_armature, stretch_mesh, stretch_bones
import rig, anim, robo
from robo import Kit, V, lerp, roty, rotx, rotz

MATS = [('AndroidPlate', '#4b5a2f', False), ('AndroidFrame', '#3c3f4f', False), ('AndroidDark', '#262833', False), ('AndroidGlow', '#c42828', True)]
PL, FR, DK, GL = 'AndroidPlate', 'AndroidFrame', 'AndroidDark', 'AndroidGlow'


def armor(K, P):
    J = joints(P)
    # cuirass, belly plates, red emblem
    K.ellip((0, -0.004, 1.29), (0.152, 0.100, 0.14), 'upperChest', PL, e=3.0, seg=24, rings=12)
    K.ellip((0, -0.002, 1.185), (0.128, 0.092, 0.07), 'chest', PL, e=3.0, seg=20, rings=8)
    K.ellip((0, -0.01, 1.072), (0.104, 0.074, 0.036), 'spine', PL, e=3.0, seg=16, rings=6)
    K.ellip((0, -0.104, 1.30), (0.030, 0.009, 0.030), 'upperChest', GL, e=2.0, seg=12, rings=6)
    K.ellip((0, -0.1, 1.40), (0.10, 0.04, 0.03), 'upperChest', DK, e=2.4, seg=16, rings=6)                              # gorget
    for sx, L in ((1, 'left'), (-1, 'right')):
        m = lambda p: (p[0] * sx, p[1], p[2])
        ua, la, ha = V(m(J['upperArm'])), V(m(J['lowerArm'])), V(m(J['hand']))
        ul, ll, ft, tz = V(m(J['upperLeg'])), V(m(J['lowerLeg'])), V(m(J['foot'])), V(m(J['toes']))
        K.ellip(ua + V((sx * 0.025, 0, 0.040)), (0.094, 0.080, 0.058), L + 'UpperArm', PL, e=2.7, seg=16, rings=9, rot=roty(sx * 22))   # pauldron
        K.ellip(ua + V((sx * 0.05, 0, 0.082)), (0.012, 0.05, 0.018), L + 'UpperArm', DK, e=2.2, seg=8, rings=5, rot=roty(sx * 22))      # spike ridge
        K.caps(lerp(la, ha, 0.22), lerp(la, ha, 0.86), 0.047, 0.040, L + 'LowerArm', PL, seg=10, e=2.6)                                   # bracer
        K.ellip(lerp(ul, ll, 0.45) + V((0, -0.034, 0.02)), (0.064, 0.050, 0.125), L + 'UpperLeg', PL, e=2.8, seg=14, rings=8)              # thigh guard
        K.ellip(ll + V((0, -0.052, 0.0)), (0.054, 0.032, 0.058), L + 'LowerLeg', PL, e=2.6, seg=12, rings=7)                              # knee guard
        K.caps(lerp(ll, ft, 0.18), lerp(ll, ft, 0.90), 0.062, 0.044, L + 'LowerLeg', PL, seg=12, e=2.6)                                   # shin guard
        K.ellip(tz + V((0, -0.03, 0.006)), (0.050, 0.056, 0.030), L + 'Toes', PL, e=2.6, seg=10, rings=6)                                 # toe cap
        K.ellip((sx * 0.112, -0.035, 0.862), (0.034, 0.030, 0.042), 'hips', FR, e=2.8, seg=10, rings=6)                                   # belt pouch
        K.ellip((sx * 0.10, -0.025, 0.97), (0.046, 0.08, 0.04), 'hips', PL, e=2.8, seg=12, rings=7, rot=roty(sx * 14))                    # hip plate
    # backpack power unit + exhaust, antenna
    K.ellip((0, 0.118, 1.27), (0.092, 0.052, 0.112), 'upperChest', FR, e=3.6, seg=16, rings=8)
    for sx in (1, -1):
        K.band((sx * 0.045, 0.165, 1.33), (sx * 0.045, 0.19, 1.33), 0.026, 0.022, 'upperChest', DK, seg=10)
        K.band((sx * 0.045, 0.19, 1.33), (sx * 0.045, 0.194, 1.33), 0.015, 0.015, 'upperChest', GL, seg=10)
    K.caps((0.07, 0.13, 1.33), (0.07, 0.14, 1.62), 0.005, 0.004, 'upperChest', DK, seg=5)
    # helmet: boxy shell, dark visor housing with two slanted red slits, chin guard with vents, crest, antenna
    hy, hz = 0.013, 1.668
    K.ellip((0, hy, hz), (0.104, 0.114, 0.128), 'head', PL, e=3.5, seg=28, rings=16)
    pc, pr = (0, hy - 0.062, hz - 0.012), (0.100, 0.060, 0.050)
    K.ellip(pc, pr, 'head', DK, e=3.0, seg=28, rings=14)
    def py(x, zz): return pc[1] - pr[1] * math.sqrt(max(0.02, 1 - (x / pr[0]) ** 2 - ((zz - pc[2]) / pr[2]) ** 2))
    for sx in (1, -1):
        K.ellip((sx * 0.044, py(0.044, hz - 0.004) + 0.003, hz - 0.004), (0.040, 0.008, 0.0125), 'head', GL, e=2.8, seg=14, rings=6, rot=roty(sx * 19))
        K.ellip((sx * 0.110, hy + 0.01, hz - 0.01), (0.020, 0.048, 0.052), 'head', FR, e=3.4, seg=12, rings=8)                         # ear block
    K.ellip((0, hy - 0.078, hz - 0.098), (0.070, 0.050, 0.036), 'head', FR, e=3.2, seg=16, rings=8)                                     # chin guard
    for i in (-1, 0, 1): K.ellip((i * 0.026, hy - 0.124, hz - 0.098), (0.007, 0.004, 0.024), 'head', DK, e=2.4, seg=8, rings=5)         # vents
    K.ellip((0, hy + 0.0, hz + 0.128), (0.016, 0.10, 0.040), 'head', PL, e=2.4, seg=10, rings=6)                                        # crest
    K.caps((-0.088, hy + 0.03, hz + 0.07), (-0.088, hy + 0.04, hz + 0.21), 0.005, 0.004, 'head', DK, seg=5)                              # antenna


def build():
    """fresh scene -> (P, arm, [body], clip names)"""
    reset(); P = MALE
    arm = build_armature(P, 'Armature'); K = Kit(arm, MATS)
    robo.synth(K, P, 'male', dict(skin=FR, dark=DK, eye=GL, accent=GL, bulk=1.06, legk=1.22, head=False, core=False, chest_lines=False, leg_strip=False))
    armor(K, P)
    body = K.finish(arm); rig.body_shapekeys(body, P, 'male'); body['sex'] = 'male'
    stretch_mesh(body, P); stretch_bones(arm, P)
    names = anim.author(arm, P)
    return P, arm, [body], names
