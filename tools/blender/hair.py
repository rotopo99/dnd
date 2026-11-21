"""Three hairstyles (long, bob, short + fringe): cap shell + tapered wedge strands, spring-bone chains (VRM springBone compatible)."""
from common import *
from skeleton import joints, stretch_mesh, stretch_bones, zinv
from head import ring, HH, K
import numpy as np

HAIR_TIPS = {'silver': (0.55, 0.70, 0.95), 'pink': (0.75, 0.45, 0.95), 'blue': (0.45, 0.80, 0.95), 'green': (0.85, 0.90, 0.40), 'red': (0.95, 0.55, 0.25), 'black': (0.20, 0.25, 0.45), 'brown': (0.62, 0.36, 0.20), 'blonde': (0.98, 0.85, 0.55)}
HAIR_COLORS = {'brown': (0.30, 0.19, 0.12), 'black': (0.10, 0.09, 0.12), 'blonde': (0.86, 0.68, 0.30), 'red': (0.62, 0.20, 0.12),
               'silver': (0.72, 0.74, 0.80), 'green': (0.45, 0.70, 0.30), 'pink': (0.90, 0.45, 0.62), 'blue': (0.22, 0.34, 0.70)}


def sm(a, b, x):
    t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t)


class HeadFrame:
    def __init__(self, P):
        J = joints(P); self.hs = P['hs']; self.y0 = J['head'][1]; self.z0 = J['head'][2]; self.hh = HH * self.hs

    def P(self, phi, t, off=0.0):
        """Point on the head surface: phi (rad, 0 = front, + = character's left), t 0 chin .. 1 crown, off = outward offset (m)."""
        rx, rz, zf = ring(t)
        x = math.sin(phi) * rx; yy = -math.cos(phi) * rz - zf
        n = Vector((math.sin(phi) * (1 / max(rx, 1e-3)), -math.cos(phi) * (1 / max(rz, 1e-3)), 0)).normalized()
        n = Vector((n.x, n.y, 0.0 + (0.9 if t > 0.85 else 0.0) * (t - 0.85) / 0.15)).normalized()
        return Vector((x, self.y0 + yy, self.z0 + t * self.hh)) + n * off


def ribbon(pts, w0, w1, thick, up):
    """Tapered flattened-diamond tube along pts. Returns verts[[x,y,z,s]], faces (local idx), per-ring u across."""
    n = len(pts); V = []; F = []
    for i, p in enumerate(pts):
        s = i / (n - 1)
        T = (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        W = T.cross(up(p, s)); W = W.normalized() if W.length > 1e-6 else Vector((1, 0, 0))
        N = W.cross(T).normalized()
        w = (w0 + (w1 - w0) * s ** 0.8) / 2; th = thick * (1 - 0.6 * s) / 2
        for k, (a, b) in enumerate(((1, 0), (0, 1), (-1, 0), (0, -1))):
            V.append((p + W * (a * w) + N * (b * th * 2 if b else 0), s, k / 4))
    for i in range(n - 1):
        for k in range(4):
            a = i * 4 + k; b = i * 4 + (k + 1) % 4
            F.append((a, b, b + 4, a + 4))
    return V, F


class HairBuilder:
    def __init__(self, P, rgb):
        self.hf = HeadFrame(P); self.P = P; self.verts = []; self.faces = []; self.uvs = []; self.w = []   # w: per vertex (chain_id or None, s)
        self.chains = {}; self.rgb = rgb

    def add_cap(self, hairline, rows=8, cols=40, off=0.006, lift=0.0):
        hf = self.hf; base = len(self.verts)
        for j in range(rows + 1):
            for i in range(cols):
                phi = 2 * math.pi * i / cols; th = hairline(phi)
                t = th + (1 - th) * j / rows
                o = off + lift * math.sin(math.pi * min(1, (j / rows) * 1.0)) + 0.004 * (1 - j / rows)
                self.verts.append(hf.P(phi, min(t, 0.999), o)); self.uvs.append((i / cols, 0.5 * t)); self.w.append((None, 0))
        for j in range(rows):
            for i in range(cols):
                a = base + j * cols + i; b = base + j * cols + (i + 1) % cols
                self.faces.append((a, b, b + cols, a + cols))

    def add_strand(self, pts, w0, w1, thick, chain=None, up=None):
        up = up or (lambda p, s: Vector((p.x, p.y - self.hf.y0, 0.15)).normalized())
        V, F = ribbon(pts, w0, w1, thick, up); base = len(self.verts)
        for p, s, u in V:
            self.verts.append(p); self.uvs.append((u, 0.5 + 0.5 * s)); self.w.append((chain, s))
        self.faces += [tuple(base + i for i in f) for f in F]

    def hang(self, phi, t0, t1, z_end, shoulder=(0.125, 0.115), n=9, off0=0.012, flare=0.012, wave=0.006, inward=0.0, sway_phase=0.0):
        """Strand: runs over the head surface from t0 down to t1 then falls to z_end converging to the shoulder-line (Rs, Ds)."""
        hf = self.hf; pts = []
        nh = max(3, int(n * 0.45)); nf = n - nh
        for i in range(nh + 1):
            f = i / nh; t = t0 + (t1 - t0) * f
            pts.append(hf.P(phi, t, off0 + flare * f))
        p1 = pts[-1]; Rs, Ds = shoulder
        tx, ty = math.sin(phi) * Rs, hf.y0 - math.cos(phi) * Ds
        for i in range(1, nf + 1):
            f = i / nf; z = p1.z + (z_end - p1.z) * f
            k = sm(0.0, 0.9, f) if (Rs or Ds) else 0.0
            x = p1.x + (tx - p1.x) * k * 0.8 + math.sin(f * 5 + sway_phase) * wave * f
            y = p1.y + (ty - p1.y) * k * 0.8 - 0.004 * math.sin(f * 3.1)
            x *= 1 - inward * f
            pts.append(Vector((x, y, z)))
        return pts

    def add_sheet(self, phi0, phi1, ncols, nlocks, t0, t1fn, zfn, shoulder, n=10, off0=0.010, flare=0.02, wave=0.006, inward=0.0, bulge=0.010,
                  tip=0.5, block=3, spring_nb=4, spring_start=0.40, name='L', seed=0.0, sway=0.0):
        """Smooth hair sheet of `ncols` columns between phi0..phi1 (deg) split into `nlocks` locks with V-tipped hem and a ridge (bulge) per lock.
        t1fn(phi) -> head-surface end param, zfn(phi) -> hem height (before tip depth). Columns are grouped into spring chains of `block`."""
        hf = self.hf; cols = []
        for i in range(ncols):
            f = i / (ncols - 1); phi = math.radians(phi0 + (phi1 - phi0) * f)
            fl = f * nlocks; k = int(min(nlocks - 1, fl)); fr = fl - k
            tri = 1 - abs(2 * fr - 1)
            rnd = 0.55 + 0.45 * abs(math.sin(k * 12.9898 + seed * 7.1))
            z_end = zfn(phi) + tip * hf.hh * (tri * rnd - 1)
            pts = self.hang(phi, t0, t1fn(phi), z_end, shoulder=shoulder, n=n, off0=off0, flare=flare, wave=wave * math.sin(k * 2.1 + seed), inward=inward, sway_phase=k + seed)
            nh = max(3, int(n * 0.45))
            for j, p in enumerate(pts):
                if j >= nh - 1:
                    s = (j - nh + 1) / max(1, len(pts) - nh)
                    r = Vector((math.sin(phi), -math.cos(phi), 0)).normalized()
                    p += r * bulge * math.sin(math.pi * fr) ** 0.8 * min(1, s * 3) * (1 - 0.5 * s)
                    p.x += sway * s * s * math.sin(k * 1.7 + seed)
            cols.append(pts)
        base = len(self.verts); m = len(cols[0])
        for i, pts in enumerate(cols):
            cid = '%s%d' % (name, min(i // block, (ncols - 1) // block))
            for j, p in enumerate(pts):
                self.verts.append(p); self.uvs.append((i / (ncols - 1), 0.5 + 0.5 * j / (m - 1))); self.w.append((cid, j / (m - 1)))
        for i in range(ncols - 1):
            for j in range(m - 1):
                a = base + i * m + j; b = base + (i + 1) * m + j
                self.faces.append((a, b, b + 1, a + 1))
        if spring_nb:
            for b in range(0, ncols, block):
                mid = min(ncols - 1, b + block // 2)
                if b // block * block == b: self.chain_from('%s%d' % (name, b // block), cols[mid], spring_nb, spring_start)

    def chain_from(self, name, pts, nb, start=0.3):
        """Spring-bone chain: nb bones along the strand path from fraction `start`."""
        L = [0]; 
        for a, b in zip(pts[:-1], pts[1:]): L.append(L[-1] + (b - a).length)
        def at(fr):
            d = fr * L[-1]
            for i in range(len(pts) - 1):
                if L[i + 1] >= d: f = (d - L[i]) / max(1e-9, L[i + 1] - L[i]); return pts[i].lerp(pts[i + 1], f)
            return pts[-1]
        fr = [start + (1 - start) * k / nb for k in range(nb + 1)]
        self.chains[name] = dict(pts=[at(f) for f in fr], start=start, nb=nb)

    def finish(self, name, arm, style_cfg, tip=None):
        mode('OBJECT')
        o = mesh_obj(name, [tuple(v) for v in self.verts], [list(f) for f in self.faces])
        uv = o.data.uv_layers.new(name='UVMap')
        for p in o.data.polygons:
            for li in p.loop_indices: uv.data[li].uv = self.uvs[o.data.loops[li].vertex_index]
        o.data.uv_layers.active = uv
        smooth_shade(o)
        # bones
        mode('OBJECT', arm); mode('EDIT', arm); eb = arm.data.edit_bones; names = {}
        for cname, c in self.chains.items():
            prev = eb['head']; names[cname] = []
            for k in range(c['nb']):
                b = eb.new('hair_%s_%d' % (cname, k)); b.head = c['pts'][k]; b.tail = c['pts'][k + 1]; b.parent = prev
                if k: b.use_connect = False
                prev = b; names[cname].append(b.name)
        mode('OBJECT', arm)
        allb = [b.name for b in arm.data.bones]
        for n in allb: o.vertex_groups.new(name=n)
        for i, (cid, s) in enumerate(self.w):
            if cid is None or cid not in self.chains: o.vertex_groups['head'].add([i], 1.0, 'REPLACE'); continue
            c = self.chains[cid]; nb = c['nb']; bl = names[cid]
            # strand fraction s -> chain fraction
            sf = (s - c['start']) / (1 - c['start'])
            if sf <= 0:
                o.vertex_groups['head'].add([i], 1.0, 'REPLACE'); continue
            x = max(0, min(nb - 1e-4, sf * nb)); k = int(x); f = x - k
            # blend in the previous bone at the beginning of the segment (smooth bend)
            if k == 0:
                o.vertex_groups[bl[0]].add([i], min(1.0, 0.35 + sf * nb * 0.65), 'REPLACE'); o.vertex_groups['head'].add([i], 1 - min(1.0, 0.35 + sf * nb * 0.65), 'REPLACE')
            else:
                o.vertex_groups[bl[k]].add([i], 0.5 + 0.5 * f, 'REPLACE'); o.vertex_groups[bl[k - 1]].add([i], 0.5 - 0.5 * f, 'REPLACE')
        o.parent = arm; md = o.modifiers.new('Armature', 'ARMATURE'); md.object = arm
        # material + texture
        o.data.materials.append(hair_material(name, self.rgb, tip))
        springs = []
        for cname, bl in names.items():
            springs.append(dict(name=cname, bones=bl, **style_cfg.get(cname.rstrip('0123456789') if cname.rstrip('0123456789') in style_cfg else cname, style_cfg['default'])))
        o['springBones'] = json.dumps(springs)
        return o, springs


def hair_texture(name, rgb, tip=None):
    """Toon hair map. v<0.5: head cap (t = 2v), v>=0.5: locks (s = 2v-1). Root shadow -> mid -> tip gradient, anime 'angel ring' highlight at the crown,
    fine strand streaks, darker rim in the middle of each lock edge."""
    N = 256; img = np.ones((N, N, 4)); base = np.array(rgb); tipc = np.array(tip if tip else np.clip(np.array(rgb) * 1.25 + 0.06, 0, 1))
    v = np.linspace(0, 1, N)[:, None] * np.ones((1, N)); u = np.ones((N, 1)) * np.linspace(0, 1, N)[None, :]
    streak = 0.93 + 0.07 * np.sin(u * 150 + np.sin(u * 23) * 2)
    ring = np.exp(-((v - 0.372) / 0.034) ** 2)                      # cap ring
    s = np.clip((v - 0.5) / 0.5, 0, 1)
    ring_s = np.exp(-((s - 0.07) / 0.035) ** 2) * (v >= 0.5)           # continues the ring on the locks
    cap_shade = 0.74 + 0.22 * np.clip(v / 0.45, 0, 1) - 0.10 * np.exp(-((v - 0.30) / 0.05) ** 2)   # darker band under the ring
    str_shade = 0.78 + 0.22 * np.minimum(1, s * 3) - 0.10 * np.clip((s - 0.8) / 0.2, 0, 1)
    shade = np.where(v < 0.5, cap_shade, str_shade) * streak
    tmix = np.where(v < 0.5, 0, np.clip((s - 0.45) / 0.55, 0, 1) ** 1.3)
    c = np.zeros((N, N, 3)); hi = np.clip(np.array([1.0, 0.98, 0.95]), 0, 1)
    for k in range(3):
        col = base[k] * (1 - tmix) + tipc[k] * tmix
        c[..., k] = np.clip(col * shade + (ring + ring_s) * 0.42 * (hi[k] - col * 0.5) + np.where(v >= 0.5, np.exp(-((s - 0.50) / 0.05) ** 2) * 0.10, 0), 0, 1)
    img[..., :3] = c
    tmp = bpy.data.images.new(name + '_t', N, N, alpha=True); tmp.pixels = img.ravel().tolist()
    p = os.path.join(WORK, name + '.png'); tmp.filepath_raw = p; tmp.file_format = 'PNG'; tmp.save(); bpy.data.images.remove(tmp)
    im = bpy.data.images.load(p); im.name = name; im.pack(); return im


def hair_material(name, rgb, tip=None):
    im = hair_texture(name + 'Tex', rgb, tip)
    m = mat_toon(name + 'Hair', (1, 1, 1), tex=im); m.use_backface_culling = False
    return m


SPRING_DEFAULT = dict(stiffness=0.9, gravityPower=0.05, gravityDir=[0, -1, 0], dragForce=0.45, hitRadius=0.02)
STYLES = os.environ.get('HAIR_STYLES', 'long,bob,short,ponytail,twin,spiky').split(',')


def lerp_line(phi, front, side, back):
    """hairline height by angle: front at phi=0, side at 90deg, back at 180deg."""
    a = abs(((phi + math.pi) % (2 * math.pi)) - math.pi)
    return front + (side - front) * sm(0.35, 1.5, a) + (back - side) * sm(1.8, 2.8, a)


def bangs(hb, width=46, n=10, nl=5, depth=0.76, tip=0.12, off=0.012, flare=0.040, part=0.0):
    hf = hb.hf
    hb.add_sheet(-width, width, 36, nl, 0.975, lambda phi: depth + 0.05 * abs(math.degrees(phi)) / width, lambda phi: hf.z0 + 0.74 * hf.hh,
                 (0, 0), n=n, off0=off, flare=flare, wave=0.0, bulge=0.006, tip=tip, block=12, spring_nb=2, spring_start=0.5, name='F', seed=1.3, sway=0.004)


def side_locks(hb, zend, ang=(78, 84), width=(0.045, 0.012), shoulder=(0.10, 0.0), nm=('SL', 'SR'), nb=4, t1=0.40, flare=0.02):
    for sgn, name in ((1, nm[0]), (-1, nm[1])):
        for k, a in enumerate(ang):
            pts = hb.hang(math.radians(sgn * a), 0.80, t1, zend, shoulder=shoulder, n=10, flare=flare + 0.01 * k, wave=0.004, sway_phase=2 * k + sgn)
            hb.add_strand(pts, width[0], width[1], 0.018, chain=name)
            if k == 0: hb.chain_from(name, pts, nb, 0.40)


def tail(hb, name, tie, length, spread=0.026, side=0.0, n=7, curl=0.03, nb=5, wid=0.058):
    """Ponytail / twin-tail: bundle of tapered clumps from `tie` hanging `length`, flowing outward with an S-curve."""
    hf = hb.hf; r = math.radians
    for i in range(n):
        a = 2 * math.pi * i / n; ox = math.cos(a) * spread; oy = math.sin(a) * spread * 0.9
        o = Vector((ox, oy, 0))
        pts = []
        for j in range(11):
            f = j / 10; z = tie.z - length * f ** 1.1
            out = (0.55 * math.sin(f * math.pi * 0.9) + 0.25 * f) * 0.05
            sx = tie.x + side * out * 1.2 + math.sin(f * 4 + i) * curl * f + o.x * (1 + 0.35 * f)
            sy = tie.y + 0.04 * math.sin(f * 2.4) + 0.025 * f + o.y * (1 + 0.25 * f)
            pts.append(Vector((sx, sy, z)))
        hb.add_strand(pts, wid, 0.010, 0.040, chain=name, up=lambda p, s: Vector((0, 1, 0)))
        if i == 0: hb.chain_from(name, pts, nb, 0.10)


def build_hair(style, arm, P, rgb, tip=None):
    hb = HairBuilder(P, rgb); r = math.radians
    hf = hb.hf; zhips = joints(P)['hips'][2]; hs = P['hs']
    cfg = {'default': dict(SPRING_DEFAULT)}
    if style == 'long':
        hb.add_cap(lambda phi: lerp_line(phi, 0.79, 0.52, 0.22), rows=9, cols=44, lift=0.008)
        hb.add_sheet(52, 308, 76, 11, 0.79, lambda phi: 0.34, lambda phi: zhips + 0.14 * hs, (0.118, 0.116), n=11, flare=0.020, wave=0.014, bulge=0.014, tip=0.55, block=4, name='L', seed=0.4, sway=0.012)
        bangs(hb); side_locks(hb, zhips + 0.30 * hs, shoulder=(0.100, 0.0), flare=0.022)
        cfg['default'].update(stiffness=0.8, dragForce=0.5)
    elif style == 'bob':
        hb.add_cap(lambda phi: lerp_line(phi, 0.79, 0.50, 0.28), rows=9, cols=44, lift=0.010)
        hb.add_sheet(46, 314, 62, 9, 0.78, lambda phi: 0.36, lambda phi: hf.z0 + 0.10 * hf.hh, (0.088, 0.094), n=8, flare=0.030, wave=0.004, inward=0.14, bulge=0.012, tip=0.20, block=4, name='B', seed=2.2)
        bangs(hb, tip=0.12, depth=0.75); side_locks(hb, hf.z0 - 0.02, ang=(78,), shoulder=(0.094, 0.0), nb=3, t1=0.36, flare=0.026)
        cfg['default'].update(stiffness=1.0, dragForce=0.55, gravityPower=0.03)
    elif style == 'short':
        hb.add_cap(lambda phi: lerp_line(phi, 0.80, 0.58, 0.50), rows=9, cols=44, lift=0.014)
        bangs(hb, width=50, nl=6, depth=0.76, tip=0.22, flare=0.046, n=7)
        for sgn in (1, -1):
            pts = hb.hang(r(sgn * 82), 0.70, 0.44, hf.z0 + 0.34 * hf.hh, n=5, off0=0.008, flare=0.016, shoulder=(0, 0))
            hb.add_strand(pts, 0.046, 0.010, 0.014, chain=None)
        for i in range(8):
            ph = r(36 + 288 * i / 7 + 6 * math.sin(i))
            pts = hb.hang(ph, 0.90, 0.58, hf.z0 + 0.46 * hf.hh, n=5, off0=0.014, flare=0.034, shoulder=(0, 0))
            hb.add_strand(pts, 0.058, 0.008, 0.018, chain=None)
        cfg['default'].update(stiffness=1.2, dragForce=0.6, gravityPower=0.02)
    elif style == 'ponytail':
        hb.add_cap(lambda phi: lerp_line(phi, 0.80, 0.56, 0.34), rows=9, cols=44, lift=0.012)
        bangs(hb, width=48, nl=5, depth=0.76, tip=0.16)
        side_locks(hb, hf.z0 + 0.0 * hf.hh, ang=(80,), shoulder=(0.096, 0.0), nb=3, t1=0.40, flare=0.024)
        tie = hf.P(math.pi, 0.70, 0.03)
        tail(hb, 'T', tie, 0.40 * hs + 0.06, spread=0.022, n=7, curl=0.02, wid=0.088)
        cfg['T'] = dict(SPRING_DEFAULT, stiffness=0.55, dragForce=0.35, gravityPower=0.08); cfg['default'].update(stiffness=1.0)
    elif style == 'twin':
        hb.add_cap(lambda phi: lerp_line(phi, 0.80, 0.58, 0.40), rows=9, cols=44, lift=0.012)
        bangs(hb, width=48, nl=5, depth=0.76, tip=0.16)
        for sgn, nm in ((1, 'TL'), (-1, 'TR')):
            tie = hf.P(sgn * r(112), 0.68, 0.035)
            tail(hb, nm, tie, 0.46 * hs + 0.10, spread=0.020, side=sgn, n=6, curl=0.02, wid=0.080)
            cfg[nm] = dict(SPRING_DEFAULT, stiffness=0.5, dragForce=0.32, gravityPower=0.09)
    else:  # spiky
        hb.add_cap(lambda phi: lerp_line(phi, 0.80, 0.60, 0.50), rows=9, cols=44, lift=0.010)
        bangs(hb, width=52, nl=7, depth=0.76, tip=0.34, flare=0.044, n=7)
        for i in range(11):
            ph = r(18 + 324 * i / 10 + 10 * math.sin(i * 1.7)); t0 = 0.82 + 0.05 * math.sin(i)
            pts = [hf.P(ph, min(0.995, t0 + 0.11 * f), 0.006 + 0.055 * f ** 1.2 * (1.0 + 0.3 * math.sin(i * 2.3))) for f in (0, 0.25, 0.5, 0.75, 1.0)]
            pts = [p + Vector((0.025 * math.sin(ph) * f * f, 0.03 * -math.cos(ph) * f * f * -1, 0.015 * f)) for p, f in zip(pts, (0, .25, .5, .75, 1))]
            hb.add_strand(pts, 0.070, 0.004, 0.024, chain=None)
        cfg['default'].update(stiffness=1.3)
    o, springs = hb.finish('Hair_' + style, arm, cfg, tip)
    # built in the raw layout -> move with the stretched body (hair sits above the leg band: a pure shift)
    stretch_mesh(o, P); stretch_bones(arm, P, {b.name for b in arm.data.bones if b.name.startswith('hair_')})
    return o, springs
