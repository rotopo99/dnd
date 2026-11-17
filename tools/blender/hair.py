"""Three hairstyles (long, bob, short + fringe): cap shell + tapered wedge strands, spring-bone chains (VRM springBone compatible)."""
from common import *
from skeleton import joints
from head import ring, HH, K
import numpy as np

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
            k = sm(0.0, 0.9, f)
            x = p1.x + (tx - p1.x) * k * 0.8 + math.sin(f * 5 + sway_phase) * wave * f
            y = p1.y + (ty - p1.y) * k * 0.8 - 0.004 * math.sin(f * 3.1)
            x *= 1 - inward * f
            pts.append(Vector((x, y, z)))
        return pts

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

    def finish(self, name, arm, style_cfg):
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
        o.data.materials.append(hair_material(name, self.rgb))
        springs = []
        for cname, bl in names.items():
            springs.append(dict(name=cname, bones=bl, **style_cfg.get(cname, style_cfg['default'])))
        o['springBones'] = json.dumps(springs)
        return o, springs


def hair_texture(name, rgb):
    N = 256; img = np.ones((N, N, 4)); base = np.array(rgb)
    v = np.linspace(0, 1, N)[:, None] * np.ones((1, N))
    c = np.zeros((N, N, 3))
    # lower half (v<0.5): cap, angel-ring highlight band at t~0.72 (v=0.36)
    cap = (np.clip(v / 0.5, 0, 1))
    band = np.exp(-((v - 0.37) / 0.045) ** 2)
    shade_cap = 0.80 + 0.10 * np.clip(cap, 0, 1) ** 2
    # upper half: strands, root dark -> bright mid -> tip
    s = np.clip((v - 0.5) / 0.5, 0, 1)
    shade_str = 0.62 + 0.38 * np.minimum(1, s * 2.2) + 0.08 * s
    across = np.abs(np.linspace(0, 1, N)[None, :] - 0.5) * 2
    shade_str = shade_str * (1 - 0.18 * across)
    shade = np.where(v < 0.5, shade_cap, shade_str)
    hl = np.where(v < 0.5, band * 0.35, np.exp(-((s - 0.42) / 0.07) ** 2) * 0.22)
    for k in range(3): c[..., k] = np.clip(base[k] * shade + hl * (0.6 + 0.4 * (1 - base[k])), 0, 1)
    img[..., :3] = c
    tmp = bpy.data.images.new(name + '_t', N, N, alpha=True); tmp.pixels = img.ravel().tolist()
    p = os.path.join(WORK, name + '.png'); tmp.filepath_raw = p; tmp.file_format = 'PNG'; tmp.save(); bpy.data.images.remove(tmp)
    im = bpy.data.images.load(p); im.name = name; im.pack(); return im


def hair_material(name, rgb):
    im = hair_texture(name + 'Tex', rgb)
    m = mat_toon(name + 'Hair', (1, 1, 1), tex=im); m.use_backface_culling = False
    return m


SPRING_DEFAULT = dict(stiffness=0.9, gravityPower=0.05, gravityDir=[0, -1, 0], dragForce=0.45, hitRadius=0.02)


def build_hair(style, arm, P, rgb):
    hb = HairBuilder(P, rgb); r = math.radians
    hf = hb.hf; zhips = joints(P)['hips'][2]; hs = P['hs']
    cfg = {'default': dict(SPRING_DEFAULT)}
    if style == 'long':
        hb.add_cap(lambda phi: 0.80 if abs(math.sin(phi / 2)) < 0.25 else (0.22 + 0.58 * sm(0.25, 0.7, 1 - abs(math.cos(phi / 2)) * 0) * 0 + 0.0 if False else lerp_line(phi, 0.78, 0.50, 0.25)), lift=0.006)
        # long back / side strands
        N = 15
        for i in range(N):
            phi = r(52 + 256 * i / (N - 1)); ph = phi
            pts = hb.hang(ph, 0.76, 0.34, zhips + 0.06 * hs, shoulder=(0.115 + 0.03 * abs(math.sin(ph)), 0.118), n=11, flare=0.016 + 0.01 * abs(math.sin(ph)), wave=0.012, sway_phase=i)
            cid = 'back%d' % (i // 3) if 0 else None
            grp = 'L%d' % (i // 3)
            hb.add_strand(pts, 0.062, 0.012, 0.016, chain=grp)
            if i % 3 == 1: hb.chain_from(grp, pts, 4, 0.40)
        # bangs
        for i, ph in enumerate(np.linspace(-46, 46, 9)):
            pts = hb.hang(r(ph), 0.97, 0.60 + 0.03 * abs(ph) / 46, hf.z0 + 0.5 * hf.hh, n=7, off0=0.010, flare=0.040, wave=0.0, shoulder=(0.0, 0.0))
            pts = [Vector((p.x * 1.0, p.y, p.z)) for p in pts]
            hb.add_strand(pts, 0.040, 0.008, 0.012, chain='F%d' % (0 if ph < -15 else (1 if ph < 15 else 2)))
            if abs(ph) in (np.linspace(-46, 46, 9)[1], np.linspace(-46, 46, 9)[4], np.linspace(-46, 46, 9)[7]): hb.chain_from('F%d' % (0 if ph < -15 else (1 if ph < 15 else 2)), pts, 2, 0.45)
        # face-framing side locks (down to the chest)
        for sgn, nm in ((1, 'SL'), (-1, 'SR')):
            for k in range(2):
                ph = r(sgn * (78 + 6 * k))
                pts = hb.hang(ph, 0.80, 0.40, zhips + 0.26 * hs, shoulder=(0.105, 0.0), n=10, flare=0.020 + 0.01 * k, wave=0.004, sway_phase=2 * k)
                hb.add_strand(pts, 0.040, 0.010, 0.014, chain=nm)
                if k == 0: hb.chain_from(nm, pts, 4, 0.40)
        cfg['default'].update(stiffness=0.8, dragForce=0.5)
    elif style == 'bob':
        hb.add_cap(lambda phi: lerp_line(phi, 0.78, 0.46, 0.28), lift=0.008)
        N = 13
        for i in range(N):
            phi = r(48 + 264 * i / (N - 1))
            pts = hb.hang(phi, 0.76, 0.34, hf.z0 + 0.06 * hf.hh, shoulder=(0.082 * K, 0.095 * K), n=8, flare=0.026 + 0.012 * abs(math.sin(phi)), wave=0.004, inward=0.10, sway_phase=i)
            hb.add_strand(pts, 0.062, 0.020, 0.016, chain='B%d' % (i // 3))
            if i % 3 == 1: hb.chain_from('B%d' % (i // 3), pts, 3, 0.45)
        for i, ph in enumerate(np.linspace(-46, 46, 9)):
            pts = hb.hang(r(ph), 0.97, 0.60 + 0.03 * abs(ph) / 46, hf.z0 + 0.5 * hf.hh, n=7, off0=0.010, flare=0.038, shoulder=(0, 0))
            hb.add_strand(pts, 0.040, 0.008, 0.012, chain='F%d' % (0 if ph < -15 else (1 if ph < 15 else 2)))
            if i in (1, 4, 7): hb.chain_from('F%d' % (0 if ph < -15 else (1 if ph < 15 else 2)), pts, 2, 0.45)
        for sgn, nm in ((1, 'SL'), (-1, 'SR')):
            ph = r(sgn * 76)
            pts = hb.hang(ph, 0.80, 0.36, hf.z0 - 0.02, shoulder=(0.095, 0), n=8, flare=0.024, inward=0.12)
            hb.add_strand(pts, 0.045, 0.014, 0.014, chain=nm); hb.chain_from(nm, pts, 3, 0.45)
        cfg['default'].update(stiffness=1.0, dragForce=0.55, gravityPower=0.03)
    else:  # short with fringe
        hb.add_cap(lambda phi: lerp_line(phi, 0.80, 0.56, 0.50), lift=0.012)
        for i, ph in enumerate(np.linspace(-52, 52, 9)):
            pts = hb.hang(r(ph), 0.98, 0.66 + 0.06 * abs(ph) / 52, hf.z0 + 0.55 * hf.hh, n=6, off0=0.012, flare=0.044, shoulder=(0, 0))
            tip = pts[-1]; pts[-1] = tip + Vector((0.006 * math.sin(i * 2.1), -0.004, 0.0))
            hb.add_strand(pts, 0.046, 0.006, 0.014, chain='F%d' % (0 if ph < -17 else (1 if ph < 17 else 2)))
            if i in (1, 4, 7): hb.chain_from('F%d' % (0 if ph < -17 else (1 if ph < 17 else 2)), pts, 2, 0.45)
        # side burns + tufts on top
        for sgn in (1, -1):
            pts = hb.hang(r(sgn * 82), 0.70, 0.44, hf.z0 + 0.34 * hf.hh, n=5, off0=0.008, flare=0.014, shoulder=(0, 0))
            hb.add_strand(pts, 0.040, 0.010, 0.012, chain=None)
        for i in range(7):
            ph = r(40 + 280 * i / 6 + 8)
            pts = hb.hang(ph, 0.88, 0.62, hf.z0 + 0.50 * hf.hh, n=5, off0=0.012, flare=0.032, shoulder=(0, 0))
            hb.add_strand(pts, 0.050, 0.010, 0.014, chain=None)
        cfg['default'].update(stiffness=1.2, dragForce=0.6, gravityPower=0.02)
    o, springs = hb.finish('Hair_' + style, arm, cfg)
    return o, springs


def lerp_line(phi, front, side, back):
    """hairline height by angle: front at phi=0, side at 90deg, back at 180deg."""
    a = abs(((phi + math.pi) % (2 * math.pi)) - math.pi)
    return front + (side - front) * sm(0.35, 1.5, a) + (back - side) * sm(1.8, 2.8, a)
