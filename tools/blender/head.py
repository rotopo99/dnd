"""Anime head: deformed UV sphere (dense grid in the face), planar face-atlas UV, ears, nose, emotion shape keys."""
from common import *
from skeleton import joints

K = 1.09            # anime head scale
HH = 0.215 * K      # head height at hs = 1 (m)
FW = 0.20 * K           # atlas width in metres (u 0..1)
KEYS = [  # t, rx, rz (depth half), z (forward shift)
    (0, 0.012, 0.022, 0.07), (0.04, 0.03, 0.046, 0.062), (0.12, 0.056, 0.07, 0.036), (0.26, 0.08, 0.09, 0.014), (0.42, 0.092, 0.099, 0.004),
    (0.6, 0.097, 0.1, 0), (0.78, 0.092, 0.098, -0.004), (0.9, 0.072, 0.084, -0.006), (0.97, 0.042, 0.052, -0.006), (1, 0.003, 0.004, -0.006)]


def _cr(p0, p1, p2, p3, f):
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f ** 3)


KEYS = [(t, rx * K, rz * K, z * K) for t, rx, rz, z in KEYS]


def ring(t):
    t = min(1, max(0, t)); j = 0
    while j < len(KEYS) - 2 and t > KEYS[j + 1][0]: j += 1
    f = (t - KEYS[j][0]) / (KEYS[j + 1][0] - KEYS[j][0]); g = lambda i, k: KEYS[max(0, min(len(KEYS) - 1, i))][k]
    return [_cr(g(j - 1, k), g(j, k), g(j + 1, k), g(j + 2, k), f) for k in (1, 2, 3)]


def gauss(d2, s): return math.exp(-d2 / (2 * s * s))


def feature_layout(hs=1.0):
    """Metric layout of the face features (m, relative to head centre line x=0 and chin z=0) shared with face_atlas.py."""
    d = dict(eye_x=0.036, eye_z=0.094, eye_rx=0.0215, eye_rz=0.0165, brow_z=0.127, nose_z=0.060, mouth_z=0.037, blush_x=0.05, blush_z=0.066)
    return {k: v * K for k, v in d.items()}


def build_head(P, sex):
    hs = P['hs']; J = joints(P); hh = HH * hs
    y0 = J['head'][1]; zchin0 = J['head'][2] + 0.0
    SEG, RINGS = 44, 32
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=SEG, v_segments=RINGS, radius=1.0)
    bm.verts.ensure_lookup_table()
    fl = feature_layout(hs)
    for v in bm.verts:
        sx, sy, sz = v.co
        t = 1 - math.acos(max(-1, min(1, sz))) / math.pi           # 0 chin .. 1 crown (even angular spacing)
        rx, rz, zf = ring(t)
        if sex == 'female' and t < 0.3: rx *= 0.95
        h = math.hypot(sx, sy)
        ux, uy = (sx / h, sy / h) if h > 1e-6 else (0, 0)          # uy < 0 = front
        v.co = Vector((ux * rx, y0 + uy * rz - zf, zchin0 + t * hh))
    bm.verts.ensure_lookup_table()
    # bake nose + eye sockets + cheeks (front, metric coordinates relative to chin)
    zchin = zchin0
    for v in bm.verts:
        x = v.co.x; zz = v.co.z - zchin
        if v.co.y < y0:
            nz = fl['nose_z'] * hs
            v.co.y -= 0.0085 * gauss(x * x * 1.0 + (zz - nz) ** 2 * 2.2, 0.0085)   # nose bump
            v.co.y += 0.0030 * (gauss((abs(x) - fl['eye_x'] * hs) ** 2 + (zz - fl['eye_z'] * hs) ** 2, 0.022))   # shallow sockets
            v.co.y -= 0.0030 * gauss((abs(x) - 0.052 * hs) ** 2 + (zz - 0.062 * hs) ** 2, 0.016)  # cheeks
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # ears
    for sx in (1, -1):
        ez = zchin + 0.088 * K * hs
        r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=7, radius=1.0)
        for v in r['verts']:
            v.co = Vector((sx * (0.095 * K + v.co.x * 0.006), y0 + v.co.y * 0.019 + 0.004, ez + v.co.z * 0.026))
    me = bpy.data.meshes.new('Head'); bm.to_mesh(me)
    # --- UV (planar front projection; back loops clamped to the texture border)
    uv = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        cx = sum(me.vertices[i].co.x for i in p.vertices) / len(p.vertices)
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = 0.5 + co.x / FW; v = (co.z - zchin) / hh
            if co.y > y0 + 0.004 and abs(co.x) < 0.09 or abs(co.x) > 0.094:
                u = 0.995 if cx > 0 else 0.005
            uv.data[li].uv = (min(1, max(0, u)), min(1, max(0, v)))
    o = bpy.data.objects.new('Head', me); link(o)
    bm.free()
    smooth_shade(o)
    o['zchin'] = zchin; o['hh'] = hh; o['y0'] = y0
    return o


def add_expressions(o, P, zchin, y0, lo, hi):
    """Emotion shape keys on vertices lo..hi (the head block of the joined body mesh)."""
    hs = P['hs']; fl = feature_layout(hs)
    if not o.data.shape_keys: o.shape_key_add(name='Basis')
    def key(name, fn):
        k = o.shape_key_add(name=name, from_mix=False)
        for i in range(lo, hi):
            v = o.data.vertices[i]
            if v.co.y > y0 + 0.002: continue
            d = fn(v.co.x, v.co.z - zchin, v.co)
            if d: k.data[i].co = v.co + Vector(d)
        k.slider_min, k.slider_max = 0, 1
    ex, ez, er = fl['eye_x'] * hs, fl['eye_z'] * hs, 0.026 * hs
    def eyes(x, z):  # weight 0..1 at the eye region, vertical offset from the eye line
        return gauss((abs(x) - ex) ** 2, 0.024 * hs) * gauss((z - ez) ** 2, 0.020 * hs), z - ez
    def brow(x, z): return gauss((abs(x) - ex) ** 2, 0.026 * hs) * gauss((z - fl['brow_z'] * hs) ** 2, 0.012 * hs)
    def mouth(x, z): return gauss(x * x, 0.022 * hs) * gauss((z - fl['mouth_z'] * hs) ** 2, 0.012 * hs)
    key('blink', lambda x, z, c: (0, 0, -(eyes(x, z)[1]) * 0.92 * eyes(x, z)[0] + -0.0 * 0))
    key('happy', lambda x, z, c: (0, 0, (-(eyes(x, z)[1]) * 0.55 + 0.003) * eyes(x, z)[0] + (0.0075 * abs(x) / 0.02 if abs(x) < 0.03 else 0.0075) * mouth(x, z) * (1 if True else 0)))
    key('angry', lambda x, z, c: (0, 0, -0.011 * brow(x, z) * (1 - min(1, abs(x) / (0.06 * hs))) * 1.4 + 0.004 * brow(x, z) * min(1, abs(x) / (0.06 * hs)) - 0.0035 * eyes(x, z)[0]
                                    - 0.003 * mouth(x, z)))
    key('sad', lambda x, z, c: (0, 0, 0.007 * brow(x, z) * (1 - min(1, abs(x) / (0.06 * hs))) - 0.005 * brow(x, z) * min(1, abs(x) / (0.06 * hs)) - 0.002 * eyes(x, z)[0]
                                  - 0.006 * mouth(x, z) * min(1, abs(x) / 0.02)))
    key('surprised', lambda x, z, c: (0, 0, eyes(x, z)[1] * 0.28 * eyes(x, z)[0] + 0.012 * brow(x, z) - (eyes(x, z)[1] * 0.0) - (z - fl['mouth_z'] * hs) * 0.9 * mouth(x, z)))
