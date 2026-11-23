"""Procedural anime face atlas (eyes with iris + highlights, brows, mouth, blush, nose) and the face-shadow SDF map."""
from common import *
import numpy as np
from head import FW, HH, feature_layout

N = 1024
SKIN = {'light': (1.0, 0.85, 0.76), 'tan': (0.93, 0.74, 0.60), 'dark': (0.62, 0.43, 0.33), 'ashen': (0.82, 0.80, 0.79)}   # sRGB 0..1


def _grid(hs):
    hh = HH * hs
    u = (np.arange(N) + 0.5) / N
    U, V = np.meshgrid(u, u)               # row = v (0 bottom = chin)
    return (U - 0.5) * FW, V * hh


def _aa(d): return np.clip(0.5 - d / (FW / N), 0, 1)       # signed distance (m) -> coverage


def _ell(X, Z, cx, cz, rx, rz, rot=0):
    x, z = X - cx, Z - cz
    if rot: c, s = math.cos(rot), math.sin(rot); x, z = c * x + s * z, -s * x + c * z
    return (np.sqrt((x / rx) ** 2 + (z / rz) ** 2) - 1) * min(rx, rz)


def _stroke(X, Z, pts, w0, w1=None):
    """Distance field of a polyline with width tapering w0 -> w1 (returns signed distance, <0 inside)."""
    w1 = w0 if w1 is None else w1
    best = np.full(X.shape, 1e9)
    pts = np.array(pts, float); L = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]; L /= L[-1]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]; ab = b - a; l2 = (ab ** 2).sum()
        t = np.clip(((X - a[0]) * ab[0] + (Z - a[1]) * ab[1]) / l2, 0, 1)
        d = np.hypot(X - (a[0] + t * ab[0]), Z - (a[1] + t * ab[1]))
        w = (w0 + (w1 - w0) * (L[i] + (L[i + 1] - L[i]) * t)) / 2
        best = np.minimum(best, d - w)
    return best


def _over(img, mask, col, a=1.0):
    m = (mask * a)[..., None]; img[..., :3] = img[..., :3] * (1 - m) + np.array(col) * m


def _lin(c): return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


def draw_face(sex='female', expr='neutral', skin='light', iris=(0.25, 0.62, 0.75), brow=(0.30, 0.20, 0.17), hs=1.0):
    X, Z = _grid(hs); fl = feature_layout(hs)
    sk = np.array(SKIN[skin]); img = np.ones((N, N, 4)); img[..., :3] = sk
    img[..., 3] = 1
    ink = (0.13, 0.07, 0.10); lash = (0.20, 0.10, 0.12)
    ex, ez, erx, erz = fl['eye_x'] * hs, fl['eye_z'] * hs, fl['eye_rx'] * hs, fl['eye_rz'] * hs
    openness = {'neutral': 1.0, 'blink': 0.0, 'happy': 0.0, 'angry': 0.82, 'sad': 0.85, 'surprised': 1.2}[expr]
    if sex == 'male': openness *= 0.88
    # soft shading: cheeks blush
    for s in (1, -1):
        bl = np.clip(1 - np.sqrt(((X - s * fl['blush_x'] * hs) / 0.018) ** 2 + ((Z - fl['blush_z'] * hs) / 0.010) ** 2), 0, 1) ** 1.5
        _over(img, bl, (1.0, 0.55, 0.52), 0.42 if expr != 'angry' else 0.2)
    # nose: shadow + tick
    ns = _stroke(X, Z, [(-0.0045, fl['nose_z'] * hs - 0.004), (0.0, fl['nose_z'] * hs - 0.0065), (0.0045, fl['nose_z'] * hs - 0.004)], 0.0011)
    _over(img, _aa(ns), (sk * 0.62), 0.85)
    for s in (1, -1):
        ey = ez
        cxe = s * ex                                                      # eye centre (outer side = s)
        if openness > 0.05:
            rz = erz * openness
            sclera = _aa(_ell(X, Z, cxe, ey, erx, rz))
            _over(img, sclera, (0.98, 0.97, 0.98))
            # upper-lid shadow on the sclera
            sh = np.clip((Z - (ey + rz * 0.35)) / (rz * 0.9), 0, 1)
            _over(img, sclera * sh, (0.80, 0.75, 0.82), 0.7)
            ir = erx * 0.60; icx = cxe - s * 0.0008
            irz = ir * 1.12 * min(1.25, 0.55 + openness * 0.5)
            irisM = _aa(_ell(X, Z, icx, ey + rz * 0.08, ir, irz)) * sclera
            g = np.clip((Z - (ey + rz * 0.08 - irz)) / (2 * irz), 0, 1)       # 0 bottom .. 1 top
            col = np.array(iris)[None, None, :]
            top = col * 0.30; bot = np.minimum(1, col * 1.25 + 0.12)
            ic = top * g[..., None] + bot * (1 - g[..., None]) ** 1.0
            ic = np.where((g[..., None] > 0.82), ic * 0.8, ic)
            rim = np.clip((_ell(X, Z, icx, ey + rz * 0.08, ir, irz) / -0.0015), 0, 1)[..., None]
            ic = ic * (0.55 + 0.45 * rim)
            m = irisM[..., None]; img[..., :3] = img[..., :3] * (1 - m) + ic * m
            _over(img, _aa(_ell(X, Z, icx, ey + rz * 0.05, ir * 0.42, irz * 0.46)) * sclera, (0.05, 0.04, 0.08))
            # highlights
            hx = icx - ir * 0.36; _over(img, _aa(_ell(X, Z, hx, ey + rz * 0.50, ir * 0.30, ir * 0.36)) * sclera, (1, 1, 1))
            _over(img, _aa(_ell(X, Z, icx + ir * 0.42, ey - rz * 0.35, ir * 0.15, ir * 0.15)) * sclera, (1, 1, 1), 0.95)
            _over(img, _aa(_ell(X, Z, icx + 0.0, ey - rz * 0.62, ir * 0.7, 0.0025 * hs)) * sclera, (1, 1, 1), 0.28)
            # upper lash: thick arc, wing at the outer corner
            th = np.linspace(math.radians(165), math.radians(15), 26)
            arc = [(cxe + math.cos(a) * erx * 1.02, ey + rz * 0.12 + math.sin(a) * rz * 1.04) for a in th]
            if s > 0: pass
            # outer = away from the face centre (x sign s); a=165deg is on the -x side
            arc = [(cxe + s * (-math.cos(a)) * erx * 1.02, ey + rz * 0.10 + math.sin(a) * rz * 1.03) for a in th]
            if sex == 'female':
                wing = [arc[-1], (arc[-1][0] + s * 0.0075 * hs, arc[-1][1] + 0.0045 * hs * (0.6 if expr == 'sad' else 1.0))]
                if expr == 'sad': wing[1] = (wing[1][0], wing[1][1] - 0.006)
                _over(img, _aa(_stroke(X, Z, arc, 0.0040 * hs, 0.0070 * hs)), lash)
                _over(img, _aa(_stroke(X, Z, wing, 0.0065 * hs, 0.0018)), lash)
            else:
                _over(img, _aa(_stroke(X, Z, arc, 0.0035 * hs, 0.0052 * hs)), lash)
            # lower lash: thin
            low = [(cxe + s * (-math.cos(a)) * erx * 0.98, ey + rz * 0.06 + math.sin(a) * rz * 1.0) for a in np.linspace(math.radians(190), math.radians(350), 14)]
            _over(img, _aa(_stroke(X, Z, low, 0.0007)), (0.55, 0.33, 0.33), 0.7)
            # crease
            cr = [(cxe + s * (-math.cos(a)) * erx * 0.95, ey + rz * 1.35 + math.sin(a) * rz * 0.35) for a in np.linspace(math.radians(160), math.radians(40), 12)]
            _over(img, _aa(_stroke(X, Z, cr, 0.0008)), sk * 0.7, 0.8)
        else:
            if expr == 'happy':      # ^ ^
                arc = [(cxe + math.cos(a) * erx * 0.95, ey - 0.004 + math.sin(a) * erz * 0.85) for a in np.linspace(math.radians(180), math.radians(0), 20)]
                _over(img, _aa(_stroke(X, Z, arc, 0.0034 * hs, 0.0034 * hs)), lash)
            else:                    # closed: curved lash line
                arc = [(cxe + math.cos(a) * erx * 0.98, ey + 0.002 - math.sin(a) * erz * 0.38) for a in np.linspace(math.radians(180), math.radians(0), 20)]
                _over(img, _aa(_stroke(X, Z, arc, 0.0042 * hs, 0.0042 * hs)), lash)
                if sex == 'female': _over(img, _aa(_stroke(X, Z, [arc[0] if s < 0 else arc[-1], ((arc[0][0] - 0.006) if s < 0 else (arc[-1][0] + 0.006), ey + 0.004)], 0.004, 0.0015)), lash)
        # eyebrows
        bz = fl['brow_z'] * hs; tilt = {'angry': -0.011, 'sad': 0.009, 'surprised': 0.006}.get(expr, 0.0)
        lift = 0.006 if expr == 'surprised' else 0.0
        inner = (s * (ex - 0.022 * hs), bz + tilt * -1 * 0.5 + lift - (0.002 if expr == 'angry' else 0))
        mid = (s * ex, bz + 0.004 + lift)
        outer = (s * (ex + 0.026 * hs), bz - 0.001 + lift + tilt * 0.45 * (1 if expr != 'angry' else -1) * 0)
        if expr == 'angry': inner = (inner[0], bz - 0.004); outer = (outer[0], bz + 0.004)
        if expr == 'sad': inner = (inner[0], bz + 0.004); outer = (outer[0], bz - 0.004)
        th = 0.0042 if sex == 'female' else 0.0056
        pts = [inner, ((inner[0] + mid[0]) / 2, (inner[1] + mid[1]) / 2 + 0.0005), mid, ((mid[0] + outer[0]) / 2, (mid[1] + outer[1]) / 2), outer]
        _over(img, _aa(_stroke(X, Z, pts, th, 0.0009)), brow, 0.92)
    # mouth
    mz = fl['mouth_z'] * hs
    mc = (0.55, 0.22, 0.25)
    if expr in ('neutral', 'blink'):
        pts = [(-0.0105, mz + 0.0012), (-0.004, mz - 0.0010), (0.004, mz - 0.0010), (0.0105, mz + 0.0012)]
        _over(img, _aa(_stroke(X, Z, pts, 0.0022, 0.0022)), mc)
    elif expr == 'happy':
        pts = [(-0.014, mz + 0.0035), (-0.007, mz - 0.0030), (0.007, mz - 0.0030), (0.014, mz + 0.0035)]
        d = _stroke(X, Z, pts, 0.0017, 0.0017)
        op = _aa(_ell(X, np.maximum(Z, mz - 0.0090), 0, mz + 0.0006, 0.0135, 0.0095)) * (Z < mz + 0.0025)
        _over(img, op, (0.45, 0.12, 0.16)); _over(img, _aa(_ell(X, Z, 0, mz - 0.0075, 0.0065, 0.0028)) * op, (0.95, 0.45, 0.50)); _over(img, _aa(d), mc)
    elif expr == 'angry':
        pts = [(-0.011, mz - 0.0015), (-0.004, mz + 0.0004), (0.004, mz + 0.0004), (0.011, mz - 0.0015)]
        _over(img, _aa(_stroke(X, Z, pts, 0.0019, 0.0019)), mc)
    elif expr == 'sad':
        pts = [(-0.009, mz - 0.0030), (-0.003, mz + 0.0008), (0.003, mz + 0.0008), (0.009, mz - 0.0030)]
        _over(img, _aa(_stroke(X, Z, pts, 0.0022, 0.0022)), mc)
    elif expr == 'surprised':
        _over(img, _aa(_ell(X, Z, 0, mz - 0.002, 0.0062, 0.0085)), (0.42, 0.12, 0.16)); _over(img, _aa(_ell(X, Z, 0, mz - 0.007, 0.0040, 0.0025)), (0.9, 0.42, 0.46))
        _over(img, _aa(np.abs(_ell(X, Z, 0, mz - 0.002, 0.0062, 0.0085)) - 0.0006), mc)
    if expr == 'sad':   # tear glint
        _over(img, _aa(_ell(X, Z, ex + 0.010, ez - erz * 1.5, 0.0022, 0.0034)), (0.75, 0.9, 1.0), 0.8)
    img[..., :3] = np.vectorize(lambda c: c)(np.clip(img[..., :3], 0, 1))
    return img


def to_linear(img):
    o = img.copy(); c = o[..., :3]
    o[..., :3] = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    return o


def make_image(name, arr, srgb=True, path=None):
    """arr (rows = v ascending, sRGB 0..1) -> PNG on disk (WORK, or `path`) -> loaded + packed Blender image."""
    tmp = bpy.data.images.new(name + '_tmp', arr.shape[1], arr.shape[0], alpha=True)
    tmp.pixels = arr.ravel().tolist()
    if not srgb: tmp.colorspace_settings.name = 'Non-Color'
    p = path or os.path.join(WORK, name + '.png')
    tmp.filepath_raw = p; tmp.file_format = 'PNG'; tmp.save(); bpy.data.images.remove(tmp)
    im = bpy.data.images.load(p); im.name = name
    if not srgb: im.colorspace_settings.name = 'Non-Color'
    im.pack()
    return im


def face_sdf(hs=1.0):
    """Face shadow threshold map (toon shading, 'SDF' style): value = light azimuth (0 front .. 180 side, /180) at which the texel
    drops into shadow. The left half is a mirror of the right one; the game compares it with the light angle (flip for light from the other side)."""
    X, Z = _grid(hs); fl = feature_layout(hs)
    x = X / (0.097 * 1.09)
    base = np.sqrt(np.clip(1 - np.minimum(x ** 2, 1), 0, 1))       # height field of a cylinder-ish face
    h = base * 0.097 * 1.09
    for gx, gz, s, amp in ((0, fl['nose_z'] * hs, 0.0085, 0.0085), (0.05, 0.062 * hs, 0.016, -0.003), (-0.05, 0.062 * hs, 0.016, -0.003),
                          (0, 0.030 * hs, 0.014, 0.0035)):
        h = h + amp * np.exp(-((X - gx) ** 2 + (Z - gz) ** 2) / (2 * s * s))
    gx_, gz_ = np.gradient(h, FW / N, axis=1), np.gradient(h, HH * hs / N, axis=0)
    nx, nz, ny = -gx_, -gz_ * 0.3, np.ones_like(h)
    ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2); nx, ny, nz = nx / ln, ny / ln, nz / ln
    thr = np.zeros_like(h)
    for a in np.linspace(0, 180, 91):                               # light from +x side rotating to the back
        lx, ly = math.sin(math.radians(a)), math.cos(math.radians(a))
        lit = (nx * np.sign(X) * lx + ny * ly) > 0.0
        thr = np.where(lit, a / 180.0, thr)                          # last angle at which still lit
    thr = np.clip(thr + 0.0, 0, 1)
    out = np.dstack([thr, thr, thr, np.ones_like(thr)])
    return out
