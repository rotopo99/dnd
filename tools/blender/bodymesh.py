"""Body surface: skin-modifier skeleton graph -> subdivision -> sculpt tweaks. (Head is built separately in head.py.)"""
from common import *
from skeleton import joints, FINGERS


def lerp3(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def skin_graph(P, part='body'):
    """-> (nodes[(pos, rx, ry)], edges, roots). Radii are half extents along the two cross-section axes."""
    J = joints(P); hs = P['hs']; lb = P['limb']; hipw, waistw, chestw, chestd = P['torso']
    nodes, edges, roots = [], [], []
    def add(p, rx, ry=None):
        nodes.append((tuple(p), rx, rx if ry is None else ry)); return len(nodes) - 1
    def chain(prev, pts):
        for p, rx, ry in pts:
            i = add(p, rx, ry); edges.append((prev, i)); prev = i
        return prev
    z = lambda v: v * hs
    B = part == 'body'
    if B:
        root = add((0, 0, z(0.955)), hipw, 0.106); roots.append(root)
        cw, cd = chestw, chestd
        top = chain(root, [((0, 0, z(1.06)), waistw * 1.02, 0.088), ((0, 0, z(1.16)), waistw, 0.090), ((0, 0, z(1.26)), (waistw + cw) / 2 + 0.006, cd * 0.97),
                          ((0, 0, z(1.345)), cw, cd), ((0, 0.0, z(1.40)), cw * 0.78, cd * 0.88)])
        chain(top, [((0, 0.005, z(1.465)), 0.056, 0.056), ((0, 0.008, z(1.53)), 0.047, 0.047), ((0, 0.012, z(1.585)), 0.045, 0.045)])
    for sx in (1, -1):
        m = lambda p: (p[0] * sx, p[1], p[2])
        ua, la, hd = J['upperArm'], J['lowerArm'], J['hand']
        he = J['handEnd']; hz = he[2]
        if B:
            sh = chain(top, [(m((0.075, 0, z(1.425))), 0.040, 0.042)])
            arm = [(m(lerp3(ua, la, t)), r * lb, r * lb) for t, r in ((0.0, 0.052), (0.18, 0.050), (0.5, 0.043), (0.82, 0.039), (1.0, 0.038))]
            arm[0] = (m((ua[0] - 0.01, 0, ua[2])), 0.056 * lb + 0.004, 0.056 * lb + 0.004)
            e = chain(sh, arm)
            fa = [(m(lerp3(la, hd, t)), r * lb, r * lb) for t, r in ((0.2, 0.040), (0.5, 0.034), (0.8, 0.027), (1.0, 0.0235))]
            chain(e, fa)
        else:
            # hand: root = palm centre, wrist node slightly inside the forearm end
            palm = add(m((hd[0] + 0.036 * hs, 0, hz)), 0.0115, 0.0245 * hs); roots.append(palm)
            w = chain(palm, [(m((hd[0] - 0.012 * hs, 0, hz)), 0.0225 * lb / 0.88 * 0.97, 0.0225 * lb / 0.88 * 0.97)])
            pf = chain(palm, [(m((he[0] - 0.006, 0, hz)), 0.0095, 0.0215 * hs)])
            for fn, (fy, segs) in FINGERS.items():
                x = he[0] - 0.004 * hs; prev = pf; rr = 0.0078 * hs if fn != 'Little' else 0.0066
                for k, ln in enumerate(segs):
                    x += ln * hs
                    prev = chain(prev, [(m((x, fy * hs, hz - 0.002)), rr * (1 - 0.1 * k), rr * (1 - 0.1 * k))])
            d = Vector((0.45, -0.85, -0.2)).normalized(); p = Vector((hd[0] + 0.02 * hs, -0.026 * hs, hz - 0.004)); prev = palm
            for ln in (0.040, 0.044):
                p = p + d * ln * hs
                prev = chain(prev, [(m(tuple(p)), 0.0095 * hs, 0.0095 * hs)])
        if B:
            ul, ll, ft, tz, te = J['upperLeg'], J['lowerLeg'], J['foot'], J['toes'], J['toesEnd']
            hip = chain(root, [(m((ul[0], 0, z(0.905))), 0.088 * (1.0 if hs == 1 else 1.08), 0.092)])
            thigh = [(m(lerp3(ul, ll, t)), rx, ry) for t, rx, ry in ((0.25, 0.082, 0.085), (0.55, 0.070, 0.072), (0.85, 0.056, 0.058), (1.0, 0.050, 0.054))]
            if hs < 1: thigh = [(p, rx * 1.06, ry * 1.05) for p, rx, ry in thigh]
            k = chain(hip, thigh)
            calf = [(m(lerp3(ll, ft, t)), rx, ry) for t, rx, ry in ((0.25, 0.049, 0.055), (0.5, 0.046, 0.049), (0.75, 0.036, 0.036), (0.93, 0.030, 0.030))]
            if hs < 1: calf = [(p, rx * 0.96, ry * 0.96) for p, rx, ry in calf]
            a = chain(k, calf)
            chain(a, [(m((ft[0], -0.075, z(0.04))), 0.036, 0.034), (m((tz[0], -0.135, z(0.026))), 0.035, 0.022), (m((te[0], -0.185, z(0.018))), 0.030, 0.016)])
    return nodes, edges, roots


def build_skin(P, level=2, part='body'):
    nodes, edges, roots = skin_graph(P, part)
    me = bpy.data.meshes.new('Skin_' + part)
    bm = bmesh.new()
    lay = bm.verts.layers.skin.verify()
    vs = []
    for p, rx, ry in nodes:
        v = bm.verts.new(p); v[lay].radius = (rx, ry); vs.append(v)
    for r in roots: vs[r][lay].use_root = True
    for a, b in edges: bm.edges.new((vs[a], vs[b]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('Skin_' + part, me); link(o)
    sk = o.modifiers.new('Skin', 'SKIN'); sk.branch_smoothing = 0.6; sk.use_smooth_shade = True
    ss = o.modifiers.new('Sub', 'SUBSURF'); ss.levels = level; ss.render_levels = level
    mode('OBJECT', o)
    apply_modifiers(o)
    smooth_shade(o)
    return o
