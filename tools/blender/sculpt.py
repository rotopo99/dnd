"""Analytic 'sculpt' pass on the skin-modifier body: smooth gaussian bumps / waist-hip scaling, then light smoothing.
Coordinates are normalised by hs so both sexes use the same recipe (u = z / hs). Front = -Y, +X = character's left."""
from common import *


def g(d, s): return math.exp(-d * d / (2 * s * s))


def ell(co, c, r):
    return g(math.sqrt(sum(((co[i] - c[i]) / r[i]) ** 2 for i in range(3))), 1.0)


def sculpt_body(body, P, sex):
    hs = P['hs']; F = sex == 'female'
    bm = bmesh.new(); bm.from_mesh(body.data); bm.normal_update()
    verts = list(bm.verts); pos = [v.co.copy() for v in verts]; nrm = [v.normal.copy() for v in verts]
    new = [p.copy() for p in pos]

    def torso(co):  # inside the trunk column (not arms / legs below the crotch)
        return abs(co.x) < 0.20 * hs ** 0.3 and co.z / hs > 0.86 and co.z / hs < 1.48
    for i, co in enumerate(pos):
        u = co.z / hs; p = new[i]
        if torso(co):
            if F:
                # hourglass: cinch waist, flare hips
                k = 1 - 0.16 * g(u - 1.115, 0.055) + 0.075 * g(u - 0.935, 0.06) + 0.02 * g(u - 1.27, 0.04)
                p.x *= k; p.y = (p.y - 0.005) * (1 - 0.10 * g(u - 1.115, 0.05)) + 0.005
            else:
                k = 1 - 0.07 * g(u - 1.10, 0.07) + 0.035 * g(u - 1.33, 0.05)
                p.x *= k; p.y *= 1 - 0.05 * g(u - 1.10, 0.06)
        # legs: slim ankles, defined knee / calf
        if co.z / hs < 0.62 and abs(co.x) > 0.02:
            cx = math.copysign(P['hx'], co.x)
            ank = 1 - (0.10 if F else 0.04) * g(u - 0.10, 0.05) + (0.16 if F else 0.07) * g(u - 0.72, 0.15) + (0.10 if F else 0.08) * g(u - 0.33, 0.07)
            yc = 0.0
            p.x = cx + (p.x - cx) * ank; p.y = yc + (p.y - yc) * ank
        if abs(co.x) < 0.2 and 0.02 < u < 0.6:
            sx = math.copysign(1, co.x)
    for i, co in enumerate(pos):
        u = co.z / hs; p = new[i]; n = nrm[i]; ax = abs(co.x)
        d = Vector((0, 0, 0))
        if F:
            for sx in (1, -1):
                c = (sx * 0.074 * hs ** 0.5, -0.062, 1.285 * hs)
                w = ell(co, c, (0.066 * hs, 0.066, 0.066 * hs))
                d += w * Vector((sx * 0.016, -0.062, 0.004)) * (1 if co.y < 0.02 else 0)           # bust (projects forward, a little to the side)
                c2 = (sx * 0.074 * hs ** 0.5, -0.075, 1.255 * hs)                                    # under-bust fullness -> round lower curve
                d += ell(co, c2, (0.05, 0.05, 0.03)) * Vector((0, -0.012, -0.002))
                w = ell(co, (sx * 0.062, 0.088, 0.885 * hs), (0.058, 0.052, 0.07))
                d += w * Vector((sx * 0.003, 0.040, 0.004))                                          # glutes
                w = ell(co, (sx * 0.095, 0.04, 0.91 * hs), (0.05, 0.07, 0.10))
                d += w * Vector((sx * 0.016, 0.0, 0)) 
                w = ell(co, (sx * 0.10, 0.0, 0.78 * hs), (0.04, 0.09, 0.14))
                d += w * Vector((sx * 0.006, 0, 0))                                                   # outer thigh
                d += ell(co, (sx * P['hx'], 0.035, 0.34 * hs), (0.05, 0.05, 0.08)) * Vector((0, 0.020, 0.0))   # calf
                d += ell(co, (sx * P['hx'], -0.045, 0.43 * hs), (0.04, 0.05, 0.05)) * Vector((0, -0.006, 0))  # knee cap
                d += ell(co, (sx * 0.045, -0.05, 1.45 * hs), (0.05, 0.05, 0.02)) * Vector((0, 0.0, 0.007))    # clavicle ridge
                d += ell(co, (sx * 0.045, -0.055, 1.425 * hs), (0.05, 0.04, 0.02)) * Vector((0, 0.004, -0.0))
                d += ell(co, (sx * 0.020, -0.10, 1.34 * hs), (0.016, 0.05, 0.05)) * Vector((0, 0.012, 0))     # sternum valley
                d += ell(co, (sx * 0.035, -0.07, 1.10 * hs), (0.05, 0.05, 0.05)) * Vector((0, -0.006, 0))     # soft belly
        else:
            for sx in (1, -1):
                d += ell(co, (sx * 0.07, -0.085, 1.325 * hs), (0.06, 0.05, 0.05)) * Vector((sx * 0.004, -0.024, 0))      # pecs
                d += ell(co, (sx * 0.11, 0, 1.46 * hs), (0.10, 0.07, 0.04)) * Vector((0, 0, 0.012))                      # trapezius slope
                d += ell(co, (sx * 0.215, 0, 1.43 * hs), (0.05, 0.06, 0.06)) * Vector((0, 0, 0.012))                     # deltoid
                d += ell(co, (sx * P['hx'], 0.04, 0.34 * hs), (0.05, 0.05, 0.09)) * Vector((0, 0.022, 0))                # calf
                d += ell(co, (sx * 0.12, 0.0, 0.76 * hs), (0.05, 0.08, 0.14)) * Vector((sx * 0.008, 0, 0))               # quad sweep
                d += ell(co, (sx * 0.05, -0.08, 1.16 * hs), (0.06, 0.04, 0.05)) * Vector((0, -0.006, 0))                  # abs
                d += ell(co, (sx * 0.075, 0.06, 1.33 * hs), (0.07, 0.05, 0.07)) * Vector((0, 0.012, 0))                   # lats / back
        p += d
    for v, p in zip(verts, new): v.co = p
    # light smoothing keeps the bumps round
    for _ in range(2):
        bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.35, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(body.data); bm.free(); body.data.update()
    smooth_shade(body)
