"""More mech enemies (Blender pass 7), registered into enemy.MECHS:
walker - Warprom «Кузнечик» chicken-walker (digitigrade biped, legs by 2-bone IK in the sagittal plane, feet planted);
fox - «Лис» line robo-fox (sleek quadruped on the wolf's bone names / clips, orange + white factory paint, cyan eyes)."""
from common import *
from enemy import Kit, make_arm, star, seg, sm, X, Y, Z, wolf_table, wolf_clips
from clothes import fab

# ------------------------------------------------------------------ walker «Кузнечик»
WALK_COL = dict(hull='#4b5a2f', frame='#3c3f4f', steel='#8d95a8', dark='#262833', star='#c42828', glow='#c42828', warn='#f0b050')
HIP_Z = 1.40
LEG = dict(hip=(0, 0.0, HIP_Z), knee=(0, -0.30, 0.92), ankle=(0, 0.20, 0.38), foot=(0, 0.02, 0.10), toe=(0, -0.26, 0.06))


def walker_table():
    T = [('hips', None, (0, 0, HIP_Z), (0, 0, HIP_Z + 0.15)), ('body', 'hips', (0, 0.05, 1.58), (0, -0.30, 1.58)),
         ('gunL', 'body', (0.60, -0.05, 1.60), (0.60, -0.45, 1.60)), ('barrelL', 'gunL', (0.60, -0.40, 1.58), (0.60, -0.95, 1.58)),
         ('podR', 'body', (-0.60, 0.05, 1.74), (-0.60, -0.30, 1.74))]
    for s, side in ((1, 'L'), (-1, 'R')):
        x = 0.40 * s; p = {k: (x, v[1], v[2]) for k, v in LEG.items()}
        T += [('thigh' + side, 'hips', p['hip'], p['knee']), ('shin' + side, 'thigh' + side, p['knee'], p['ankle']),
              ('tarsus' + side, 'shin' + side, p['ankle'], p['foot']), ('foot' + side, 'tarsus' + side, p['foot'], p['toe'])]
    return T


def walker_mesh(arm, T):
    C = WALK_COL; mats = [fab('WalkerHull', C['hull'], 'tech'), fab('WalkerFrame', C['frame'], 'tech'), fab('WalkerSteel', C['steel'], 'tech'),
                          fab('WalkerDark', C['dark'], 'leather'), fab('WalkerStar', C['star'], 'leather'), fab('WalkerEye', C['glow'], 'weave', True),
                          fab('WalkerWarn', C['warn'], 'tech')]
    HU, FR, ST, DK, SR, EY, WN = range(7)
    J = {n: (Vector(h), Vector(t)) for n, p, h, t in T}
    k = Kit([n for n, *_ in T])
    # pelvis: hip actuator drum across + block under the hull
    k.cyl((-0.50, 0, HIP_Z), (0.50, 0, HIP_Z), 0.12, seg=16, bone='hips', mat=DK)
    k.prism((0, 0.12, HIP_Z + 0.06), (0, -0.16, HIP_Z + 0.06), 0.46, 0.22, 0.40, 0.18, bevel=0.03, bone='hips', mat=FR)
    # hull: armoured box, cockpit wedge with a red visor slit, top hatch, side skirts with red stars, exhausts, antenna
    k.prism((0, 0.48, 1.74), (0, -0.42, 1.74), 0.86, 0.46, 0.94, 0.52, bevel=0.05, bone='body', mat=HU)
    k.prism((0, -0.40, 1.76), (0, -0.78, 1.68), 0.80, 0.46, 0.46, 0.24, bevel=0.04, bone='body', mat=HU, shift=(0, -0.02))
    k.prism((-0.19, -0.785, 1.72), (0.19, -0.785, 1.72), 0.03, 0.055, up=(0, 0, 1), bevel=0.008, bone='body', mat=EY)              # visor slit
    k.prism((-0.22, -0.765, 1.765), (0.22, -0.765, 1.765), 0.05, 0.025, up=(0, 0, 1), bevel=0.008, bone='body', mat=FR)            # brow
    for s in (1, -1): k.cyl((s * 0.13, -0.70, 1.64), (s * 0.13, -0.79, 1.63), 0.035, 0.03, seg=12, bone='body', mat=DK); k.cyl((s * 0.13, -0.785, 1.63), (s * 0.13, -0.80, 1.63), 0.022, seg=10, bone='body', mat=EY)
    k.prism((0, -0.62, 1.60), (0, -0.80, 1.585), 0.28, 0.05, 0.20, 0.04, bevel=0.01, bone='body', mat=FR)               # chin plate
    k.prism((0, 0.30, 2.01), (0, -0.10, 2.01), 0.40, 0.06, 0.36, 0.05, bevel=0.015, bone='body', mat=FR)                 # hatch
    k.cyl((0.0, 0.10, 2.03), (0.0, 0.10, 2.08), 0.09, 0.08, seg=14, bone='body', mat=DK)
    for s in (1, -1):
        k.prism((s * 0.49, 0.36, 1.66), (s * 0.49, -0.34, 1.66), 0.05, 0.30, 0.05, 0.26, bevel=0.012, bone='body', mat=HU)
        star(k.bm, Vector((s * 0.518, 0.05, 1.68)), Vector((s, 0, 0)), 0.10, 0.012); k.tag('body', SR)
        for q in range(4): k.prism((s * 0.475, -0.36 + 0.06 * q, 1.97), (s * 0.475, -0.33 + 0.06 * q, 1.97), 0.03, 0.02, bevel=0.0, bone='body', mat=WN if q % 2 == 0 else DK)
        k.cyl((s * 0.24, 0.46, 1.84), (s * 0.28, 0.62, 2.04), 0.06, 0.05, seg=12, bone='body', mat=ST)                  # exhausts
        k.cyl((s * 0.28, 0.62, 2.04), (s * 0.285, 0.64, 2.07), 0.045, 0.045, seg=12, bone='body', mat=DK)
    k.cyl((0.30, 0.30, 1.99), (0.32, 0.36, 2.42), 0.008, 0.004, seg=6, bone='body', mat=DK)                            # antenna
    k.ball((0.32, 0.36, 2.43), 0.014, 'body', EY, seg=8, rings=5)
    # left arm: shoulder mount + rotary cannon (barrel cluster spins on barrelL), ammo drum
    k.prism((0.47, 0.02, 1.62), (0.62, 0.02, 1.62), 0.18, 0.18, bevel=0.02, bone='gunL', mat=FR)
    k.prism((0.60, 0.10, 1.60), (0.60, -0.42, 1.60), 0.20, 0.22, 0.18, 0.18, bevel=0.025, bone='gunL', mat=HU)
    k.cyl((0.72, 0.05, 1.56), (0.72, -0.20, 1.56), 0.09, seg=14, bone='gunL', mat=DK)
    k.cyl((0.60, -0.40, 1.58), (0.60, -0.46, 1.58), 0.085, seg=14, bone='barrelL', mat=ST)
    for q in range(6):
        a = 2 * math.pi * q / 6; o = Vector((0.045 * math.cos(a), 0, 0.045 * math.sin(a)))
        k.cyl(Vector((0.60, -0.45, 1.58)) + o, Vector((0.60, -0.95, 1.58)) + o, 0.017, seg=8, bone='barrelL', mat=DK)
    for y in (-0.70, -0.92): k.cyl((0.60, y, 1.58), (0.60, y - 0.03, 1.58), 0.075, seg=14, bone='barrelL', mat=ST)
    # right arm: rocket pod (3 x 2 tubes), warning stripes
    k.prism((-0.47, 0.02, 1.68), (-0.62, 0.02, 1.70), 0.16, 0.16, bevel=0.02, bone='podR', mat=FR)
    k.prism((-0.62, 0.16, 1.74), (-0.62, -0.34, 1.74), 0.30, 0.30, 0.30, 0.28, bevel=0.025, bone='podR', mat=HU)
    for i in range(3):
        for j in range(2):
            c = Vector((-0.62 - 0.09 + 0.09 * i, -0.33, 1.74 - 0.065 + 0.13 * j))
            k.cyl(c + Vector((0, 0.02, 0)), c - Vector((0, 0.02, 0)), 0.038, seg=10, bone='podR', mat=DK)
            k.cyl(c - Vector((0, 0.005, 0)), c - Vector((0, 0.03, 0)), 0.022, 0.0, seg=8, bone='podR', mat=EY)          # warheads
    for q in range(5): k.prism((-0.775, 0.12 - 0.1 * q, 1.86), (-0.775, 0.07 - 0.1 * q, 1.86), 0.012, 0.04, bevel=0.0, bone='podR', mat=WN if q % 2 == 0 else DK)
    # legs
    for side, s in (('L', 1), ('R', -1)):
        a, b = J['thigh' + side]
        k.ball(a, 0.13, 'thigh' + side, FR, seg=14, rings=8)
        k.prism(a, b, 0.20, 0.26, 0.16, 0.18, up=(0, -1, 0), bevel=0.03, bone='thigh' + side, mat=HU)
        k.cyl(a + Vector((s * 0.12, 0.10, -0.05)), b + Vector((s * 0.12, 0.06, 0.12)), 0.03, seg=8, bone='thigh' + side, mat=ST)   # piston
        a, b = J['shin' + side]
        k.ball(a, 0.10, 'shin' + side, DK, seg=12, rings=8)
        k.prism(a + Vector((0, -0.07, 0.02)), a + Vector((0, -0.02, -0.20)), 0.20, 0.06, 0.16, 0.05, up=(0, -1, 0), bevel=0.015, bone='shin' + side, mat=HU)  # knee cap
        k.prism(a, b, 0.15, 0.16, 0.11, 0.12, up=(0, 1, 0), bevel=0.02, bone='shin' + side, mat=FR)
        k.prism(a.lerp(b, 0.15), a.lerp(b, 0.75), 0.16, 0.05, 0.12, 0.04, up=(0, 1, 0), bevel=0.01, bone='shin' + side, mat=HU, shift=(0, 0.09))
        k.prism(a.lerp(b, 0.25), a.lerp(b, 0.55), 0.03, 0.03, up=(0, 1, 0), bevel=0.0, bone='shin' + side, mat=WN, shift=(0, 0.0))
        k.cyl(a + Vector((s * 0.10, 0.02, -0.04)), b + Vector((s * 0.10, -0.04, 0.08)), 0.025, seg=8, bone='shin' + side, mat=ST)
        a, b = J['tarsus' + side]
        k.ball(a, 0.075, 'tarsus' + side, DK, seg=12, rings=8)
        k.prism(a, b, 0.11, 0.10, 0.10, 0.08, up=(0, -1, 0), bevel=0.015, bone='tarsus' + side, mat=HU)
        a, b = J['foot' + side]
        k.ball(a, 0.06, 'foot' + side, DK, seg=10, rings=6)
        k.prism(a + Vector((0, 0.06, -0.04)), a + Vector((0, -0.10, -0.045)), 0.20, 0.07, 0.22, 0.07, bevel=0.015, bone='foot' + side, mat=FR)
        for q in (-1, 0, 1):                                                            # toes (splayed) + heel spur
            d = Vector((0.10 * q, -0.30, 0)); r0 = a + Vector((0.06 * q, -0.06, -0.045))
            k.prism(r0, r0 + d * 0.7 + Vector((0, 0, -0.02)), 0.07, 0.06, 0.04, 0.03, bevel=0.01, bone='foot' + side, mat=HU)
            k.cyl(r0 + d * 0.7 + Vector((0, 0, -0.02)), r0 + d * 0.85 + Vector((0, 0, -0.07)), 0.022, 0.0, seg=6, bone='foot' + side, mat=ST)
        k.prism(a + Vector((0, 0.05, -0.05)), a + Vector((0, 0.22, -0.09)), 0.06, 0.05, 0.03, 0.03, bevel=0.008, bone='foot' + side, mat=HU)
    return k.obj('Walker', mats, arm)


def _ang(v): return math.atan2(v[2], v[1])


def _wrap(a): return (a + math.pi) % (2 * math.pi) - math.pi


LREST = {k: Vector(v) for k, v in LEG.items()}
L1 = (LREST['knee'] - LREST['hip']).length; L2 = (LREST['ankle'] - LREST['knee']).length
AREST = dict(thigh=_ang(LREST['knee'] - LREST['hip']), shin=_ang(LREST['ankle'] - LREST['knee']), tarsus=_ang(LREST['foot'] - LREST['ankle']))


def leg_ik(rel, side, root, foot, tilt=0.0, pitch=0.0):
    """rel[thigh/shin/tarsus/foot + side] for a foot joint target (y, z) with the hips moved by root (y, z); knee bends forward.
    tilt: tarsus world pitch (deg, + = foot joint swings back... about X), pitch: foot plate world pitch (deg, + = toes down)"""
    t = math.radians(tilt); vt = LREST['foot'] - LREST['ankle']
    vt = Vector((0, vt.y * math.cos(t) - vt.z * math.sin(t), vt.y * math.sin(t) + vt.z * math.cos(t)))
    H = Vector((0, LREST['hip'].y + root[0], LREST['hip'].z + root[1])); A = Vector((0, foot[0], foot[1])) - vt
    d = A - H; L = max(abs(L1 - L2) + 1e-3, min(L1 + L2 - 1e-3, d.length)); u = d.normalized()
    ca = (L1 * L1 + L * L - L2 * L2) / (2 * L1 * L); al = math.acos(max(-1, min(1, ca)))
    best = None
    for sg in (1, -1):
        c, s_ = math.cos(sg * al), math.sin(sg * al)
        k = H + L1 * Vector((0, u.y * c - u.z * s_, u.y * s_ + u.z * c))
        if best is None or k.y < best.y: best = k
    A = H + u * L
    th = _wrap(_ang(best - H) - AREST['thigh']); sh = _wrap(_ang(A - best) - AREST['shin']); ta = t
    rel['thigh' + side] = X(math.degrees(th)); rel['shin' + side] = X(math.degrees(sh - th)); rel['tarsus' + side] = X(math.degrees(ta - sh))
    rel['foot' + side] = X(pitch - math.degrees(ta))


FY, FZ = LEG['foot'][1], LEG['foot'][2]


def walker_clips():
    def legs(rel, root, L=(FY, FZ, 0, 0), R=(FY, FZ, 0, 0)):
        leg_ik(rel, 'L', root, L[:2], L[2], L[3]); leg_ik(rel, 'R', root, R[:2], R[2], R[3])
    def idle(f, n=60):
        t = 2 * math.pi * f / n; rel = {}; root = (0.0, -0.03 + 0.02 * math.sin(t))
        legs(rel, root); rel['body'] = Z(5 * math.sin(t * 0.5)) @ X(1.5 * math.sin(t)); rel['gunL'] = X(3 * math.sin(t + 1)); rel['podR'] = X(-2 * math.sin(t + 2))
        return rel, (0, root[0], root[1])
    def walk(f, n=40, S=0.62, lift=0.24):
        rel = {}; root = (0.0, -0.06 + 0.025 * math.cos(4 * math.pi * f / n))
        ft = []
        for ph in (0.0, 0.5):
            p = (f / n + ph) % 1.0
            if p < 0.5: q = p / 0.5; y = FY - S / 2 + S * q; z = FZ; tl = 0; pt = 0                 # stance: foot slides back
            else:
                q = (p - 0.5) / 0.5; y = FY + S / 2 - S * sm(q); z = FZ + lift * math.sin(math.pi * q); tl = 18 * math.sin(math.pi * q); pt = -10 * math.sin(math.pi * q)
            ft.append((y, z, tl, pt))
        legs(rel, root, ft[0], ft[1])
        t = 2 * math.pi * f / n
        rel['body'] = X(3) @ Y(3 * math.sin(t)) @ Z(2 * math.sin(t)); rel['gunL'] = X(-2 + 3 * math.sin(t)); rel['podR'] = X(-2 - 3 * math.sin(t))
        return rel, (0, root[0], root[1])
    def shoot(f):
        r = seg(f, [(0, 0), (2, 1), (4, 0.3), (6, 1), (8, 0.3), (10, 1), (12, 0.3), (14, 1), (16, 0.3), (24, 0)]); on = seg(f, [(0, 0), (3, 1), (16, 1), (24, 0)])
        rel = {}; root = (0.03 * r, -0.03 - 0.01 * r); legs(rel, root)
        rel['body'] = X(-2 * r) @ Z(-4 * on); rel['gunL'] = X(-4 * on - 2 * r) @ Z(-4 * on); rel['barrelL'] = Y(-38 * f if f < 17 else -38 * 16 - 20 * (f - 16))
        return rel, (0, root[0], root[1])
    def rockets(f):
        up = seg(f, [(0, 0), (8, 1), (22, 1), (30, 0)]); r = seg(f, [(0, 0), (9, 0), (10, 1), (12, 0.2), (14, 1), (16, 0.2), (30, 0)])
        rel = {}; root = (0.04 * r, -0.03 - 0.02 * r); legs(rel, root)
        rel['body'] = X(-3 * r - 2 * up); rel['podR'] = X(-28 * up - 5 * r); rel['gunL'] = X(4 * up)
        return rel, (0, root[0], root[1])
    def stomp(f):
        lift = seg(f, [(0, 0), (12, 1), (15, 1), (17, 0), (36, 0)]); slam = seg(f, [(0, 0), (16, 0), (18, 1), (22, 0.6), (36, 0)])
        rel = {}; root = (-0.04 * lift, -0.03 + 0.05 * lift - 0.12 * slam)
        R = (FY - 0.25 * lift - 0.10 * seg(f, [(0, 0), (12, 1), (17, 1), (36, 0)]), FZ + 0.48 * lift, 20 * lift, -12 * lift)
        legs(rel, root, (FY, FZ, 0, 0), R)
        rel['body'] = X(-6 * lift + 9 * slam) @ Y(-5 * lift + 3 * slam); rel['gunL'] = X(8 * slam); rel['podR'] = X(8 * slam)
        return rel, (0, root[0], root[1])
    def hit(f):
        h = seg(f, [(0, 0), (3, 1), (8, 0.5), (20, 0)]); rel = {}; root = (0.08 * h, -0.03 - 0.05 * h); legs(rel, root)
        rel['body'] = X(-9 * h) @ Y(7 * h) @ Z(6 * h); rel['gunL'] = X(-10 * h); rel['podR'] = X(12 * h)
        return rel, (0, root[0], root[1])
    def death(f):
        k = seg(f, [(0, 0), (8, 0.1), (32, 1), (60, 1)]); jolt = seg(f, [(0, 0), (3, 1), (8, 0)]); bounce = 0.04 * math.sin(math.pi * min(1, max(0, (f - 32) / 6))) if f > 32 else 0
        rel = {}; root = (0.05 * jolt - 0.10 * k, -0.03 - 0.80 * k + bounce)
        legs(rel, root, (FY + 0.06 * k, FZ, -10 * k, 0), (FY - 0.04 * k, FZ, -6 * k, 0))
        rel['body'] = X(-6 * jolt + 22 * k) @ Y(14 * k) @ Z(-8 * k); rel['gunL'] = X(30 * k); rel['podR'] = X(26 * k) @ Y(-10 * k)
        rel['barrelL'] = Y(-30 * f + 0.5 * f * f if f < 30 else -450)
        return rel, (0, root[0], root[1])
    return [('idle', 60, idle, True), ('walk', 40, walk, True), ('shoot', 24, shoot, False), ('rockets', 30, rockets, False),
            ('stomp', 36, stomp, False), ('hit', 20, hit, False), ('death', 60, death, False)]


# ------------------------------------------------------------------ robo-fox «Лис»
FOX_COL = dict(plate='#f06a24', white='#e8e4dc', frame='#3c3f4f', dark='#262833', glow='#70d8f2', claw='#dfe3e8')
FS = (0.78, 0.86, 0.66)          # wolf rest layout scaled (x, y, z): lower, slimmer


def fox_table():
    sc = lambda p: (p[0] * FS[0], p[1] * FS[1], p[2] * FS[2])
    T = [(n, par, sc(h), sc(t)) for n, par, h, t in wolf_table() if not n.startswith('tail')]
    T = [(n, par, (h if n != 'neck' else h), t) for n, par, h, t in T]
    T += [('tail0', 'pelvis', (0, 0.38, 0.55), (0, 0.60, 0.50)), ('tail1', 'tail0', (0, 0.60, 0.50), (0, 0.84, 0.42)), ('tail2', 'tail1', (0, 0.84, 0.42), (0, 1.04, 0.38))]
    return T


def fox_mesh(arm, T):
    C = FOX_COL; mats = [fab('FoxPlate', C['plate'], 'tech'), fab('FoxWhite', C['white'], 'tech'), fab('FoxFrame', C['frame'], 'tech'),
                         fab('FoxDark', C['dark'], 'leather'), fab('FoxEye', C['glow'], 'weave', True), fab('FoxClaw', C['claw'], 'leather')]
    PL, WH, FR, DK, EY, CL = range(6)
    J = {n: (Vector(h), Vector(t)) for n, p, h, t in T}
    k = Kit([n for n, *_ in T])
    ch0, ch1 = J['chest']; sp0, sp1 = J['spine']; pv0, pv1 = J['pelvis']; nk0, nk1 = J['neck']; hd0, hd1 = J['head']
    # torso: tapered chest with white breast plate, slim waist, hips
    k.prism(ch1 + Vector((0, -0.04, 0)), sp0 + Vector((0, 0.02, -0.01)), 0.24, 0.28, 0.20, 0.22, bevel=0.03, bone='chest', mat=PL)
    k.prism(ch1 + Vector((0, -0.03, -0.14)), sp0 + Vector((0, 0, -0.12)), 0.17, 0.08, 0.12, 0.05, bevel=0.02, bone='chest', mat=WH)
    k.prism(sp0, sp1, 0.15, 0.15, 0.17, 0.17, bevel=0.02, bone='spine', mat=FR)
    k.prism(sp0 + Vector((0, 0.01, 0.06)), sp1 + Vector((0, -0.01, 0.07)), 0.17, 0.03, 0.18, 0.03, bevel=0.01, bone='spine', mat=PL)
    k.prism(sp1 + Vector((0, 0.03, -0.075)), sp0 + Vector((0, -0.02, -0.07)), 0.12, 0.03, 0.10, 0.03, bevel=0.008, bone='spine', mat=WH)
    k.prism(pv1 + Vector((0, -0.02, 0)), pv0 + Vector((0, 0.03, 0.0)), 0.21, 0.20, 0.18, 0.17, bevel=0.03, bone='pelvis', mat=PL)
    for s in (1, -1): k.prism((s * 0.125, ch1.y + 0.02, ch1.z + 0.01), (s * 0.125, sp0.y - 0.02, sp0.z), 0.01, 0.04, 0.01, 0.025, bevel=0.003, bone='chest', mat=EY)   # side light line
    # neck: white ruff plates
    for q in range(3):
        t = q / 3.0; c0 = nk0.lerp(nk1, t); c1 = nk0.lerp(nk1, t + 0.4)
        k.prism(c0, c1, 0.17 - 0.02 * q, 0.17 - 0.015 * q, 0.15 - 0.02 * q, 0.15 - 0.015 * q, up=(0, 0.6, 1), bevel=0.012, bone='neck', mat=WH if q == 0 else PL)
    # head: wedge skull, long narrow snout, white cheeks, black nose, cyan eye slits, tall ears with dark tips
    hz = hd0.z; hy = hd0.y
    k.prism((0, hy + 0.03, hz + 0.01), (0, hy - 0.11, hz), 0.18, 0.15, 0.16, 0.12, bevel=0.02, bone='head', mat=PL)
    k.prism((0, hy - 0.10, hz - 0.005), (0, hy - 0.30, hz - 0.035), 0.11, 0.075, 0.035, 0.035, bevel=0.01, bone='head', mat=PL, shift=(0, -0.005))
    for s in (1, -1):
        k.prism((s * 0.065, hy - 0.04, hz - 0.035), (s * 0.03, hy - 0.22, hz - 0.045), 0.04, 0.05, 0.015, 0.02, up=(0, 0, 1), bevel=0.006, bone='head', mat=WH)   # cheek
        k.prism((s * 0.050, hy - 0.10, hz + 0.035), (s * 0.072, hy - 0.06, hz + 0.045), 0.012, 0.018, 0.01, 0.014, up=(0, -0.3, 1), bevel=0.002, bone='head', mat=EY)  # eye slit
        b0 = Vector((s * 0.055, hy + 0.0, hz + 0.06)); b1 = Vector((s * 0.085, hy + 0.03, hz + 0.24))
        k.prism(b0, b1, 0.085, 0.03, 0.006, 0.006, up=(0, -1, 0), bevel=0.003, bone='head', mat=PL)                                     # ear
        k.prism(b0.lerp(b1, 0.12) + Vector((0, -0.012, 0)), b0.lerp(b1, 0.8) + Vector((0, -0.012, 0)), 0.05, 0.012, 0.008, 0.006, up=(0, -1, 0), bevel=0.002, bone='head', mat=WH)
        k.prism(b0.lerp(b1, 0.72), b1 + (b1 - b0) * 0.06, 0.03, 0.034, 0.004, 0.008, up=(0, -1, 0), bevel=0.002, bone='head', mat=DK)
    k.prism((0, hy - 0.30, hz - 0.03), (0, hy - 0.325, hz - 0.035), 0.04, 0.03, 0.03, 0.025, bevel=0.008, bone='head', mat=DK)          # nose
    k.prism((-0.006, hy - 0.06, hz + 0.08), (0.006, hy - 0.06, hz + 0.08), 0.03, 0.03, bevel=0.0, bone='head', mat=EY)                    # forehead lens
    for q in range(4):
        for s in (1, -1): k.cyl((s * 0.022, hy - 0.28 + 0.04 * q, hz - 0.05), (s * 0.022, hy - 0.28 + 0.04 * q, hz - 0.07), 0.006, 0.0, seg=5, bone='head', mat=CL)
    jw0, jw1 = J['jaw']
    k.prism(jw0 + Vector((0, 0.0, -0.005)), jw1 + Vector((0, -0.03, 0.0)), 0.08, 0.035, 0.03, 0.02, bevel=0.008, bone='jaw', mat=WH)
    # tail: bushy lozenge segments, white tip
    for i, n in enumerate(('tail0', 'tail1', 'tail2')):
        a, b = J[n]; w = (0.09, 0.15, 0.14)[i]; w0 = (0.06, 0.10, 0.11)[i]; w2 = (0.10, 0.12, 0.04)[i]
        m = a.lerp(b, 0.5); a = a - (b - a) * (0.18 if i else 0.0)
        k.prism(a, m, w0, w0 * 0.9, w, w * 0.9, bevel=0.02, bone=n, mat=PL if i < 2 else WH)
        k.prism(m, b + (b - a) * (0.08 if i < 2 else 0.35), w, w * 0.9, w2, w2 * 0.9, bevel=0.02, bone=n, mat=PL if i < 1 else WH if i == 2 else PL)
    a, b = J['tail1']; k.prism(a.lerp(b, 0.75), b + (b - a) * 0.08, 0.13, 0.12, 0.12, 0.11, bevel=0.015, bone='tail1', mat=WH)
    # legs (slim, dark joints, white socks)
    for side, s in (('L', 1), ('R', -1)):
        a, b = J['upperArm' + side]; k.prism(a + Vector((0, 0, 0.03)), b, 0.08, 0.13, 0.06, 0.07, up=(0, -1, 0), bevel=0.014, bone='upperArm' + side, mat=PL)
        k.ball(a, 0.06, 'upperArm' + side, FR)
        a, b = J['foreArm' + side]; k.ball(a, 0.035, 'foreArm' + side, DK)
        k.prism(a, b, 0.045, 0.055, 0.04, 0.045, up=(0, -1, 0), bevel=0.01, bone='foreArm' + side, mat=FR)
        k.prism(a.lerp(b, 0.45), a.lerp(b, 1.0), 0.055, 0.06, 0.05, 0.05, up=(0, -1, 0), bevel=0.01, bone='foreArm' + side, mat=WH)
        a, b = J['handPaw' + side]; k.ball(a, 0.03, 'handPaw' + side, DK)
        k.prism((a.x, a.y + 0.02, 0.03), (a.x, a.y - 0.08, 0.024), 0.07, 0.05, 0.06, 0.035, bevel=0.012, bone='handPaw' + side, mat=DK)
        for q in (-1, 0, 1): k.cyl((a.x + q * 0.02, a.y - 0.08, 0.026), (a.x + q * 0.02, a.y - 0.11, 0.006), 0.008, 0.0, seg=5, bone='handPaw' + side, mat=CL)
        a, b = J['thigh' + side]; k.prism(a + Vector((0, 0.02, 0.04)), b, 0.10, 0.17, 0.07, 0.09, up=(0, -1, 0), bevel=0.016, bone='thigh' + side, mat=PL)
        k.ball(a, 0.065, 'thigh' + side, FR)
        a, b = J['shin' + side]; k.ball(a, 0.038, 'shin' + side, DK)
        k.prism(a, b, 0.05, 0.055, 0.045, 0.045, up=(0, 1, 0), bevel=0.01, bone='shin' + side, mat=FR)
        k.prism(a.lerp(b, 0.1), a.lerp(b, 0.7), 0.06, 0.03, 0.05, 0.025, up=(0, 1, 0), bevel=0.006, bone='shin' + side, mat=PL, shift=(0, -0.015))
        a, b = J['hock' + side]; k.ball(a, 0.032, 'hock' + side, DK)
        k.prism(a, b, 0.045, 0.045, 0.04, 0.04, up=(0, 1, 0), bevel=0.008, bone='hock' + side, mat=WH)
        a, b = J['footPaw' + side]; k.ball(a, 0.03, 'footPaw' + side, DK)
        k.prism((a.x, a.y + 0.02, 0.028), (a.x, a.y - 0.08, 0.022), 0.07, 0.045, 0.06, 0.032, bevel=0.012, bone='footPaw' + side, mat=DK)
        for q in (-1, 0, 1): k.cyl((a.x + q * 0.02, a.y - 0.08, 0.024), (a.x + q * 0.02, a.y - 0.11, 0.005), 0.007, 0.0, seg=5, bone='footPaw' + side, mat=CL)
    return k.obj('Fox', mats, arm)


def fox_clips():
    return wolf_clips()


def _sc(p): return (p[0] * FS[0], p[1] * FS[1], p[2] * FS[2])


MECHS = {
    'walker': dict(table=walker_table, mesh=walker_mesh, clips=walker_clips, root='hips', kind='walker',
                   anchors=dict(muzzle=('barrelL', (0.60, -0.95, 1.58)), rockets=('podR', (-0.62, -0.36, 1.74)), eye=('body', (0, -0.68, 1.74)),
                                core=('body', (0, 0, 1.72)), feet=('hips', (0, 0, 0)))),
    'fox': dict(table=fox_table, mesh=fox_mesh, clips=fox_clips, root='pelvis', kind='quadruped',
                anchors=dict(mouth=('jaw', _sc((0, -0.86, 0.93))), eyes=('head', _sc((0, -0.70, 1.065))), chest=('chest', _sc((0, -0.36, 0.84))))),
}
