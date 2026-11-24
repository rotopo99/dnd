"""Key characters and crowd NPCs: a base outfit from clothes.py (palette override) + extra parts built here in the raw layout
(clothes.build_outfit(extra=...)): coats / robes with spring-bone tails, hoods, hats, masks, visors, halo, vests, aprons.
NPCS[id] -> npc_<id>.glb (body + hair + outfit + extras + all animations)."""
from common import *
from skeleton import joints
import clothes
from clothes import shell, to_object, fab, band, blob, rbox, collar, slice_planes, assign_mats, push_out, fold_displace, pleated_skirt, BodyRadius, \
    skirt_springs, smooth01, drape

NPCS = {
    # ex-agent: black bodysuit with cyan seams, long open agent coat, wrap-around cyan shades
    'lox': dict(sex='male', hair='short', hc='black', skin='light', iris=(0.30, 0.80, 0.95), base='cyber',
                pal=dict(jacket='#1b1d25', jacket_trim='#2e3240', pants='#1b1d25', gear='#3c3f4f', boots='#121318', boots_trim='#0b0b10', accent='#70d8f2', bare=True),
                coat=dict(col='#23252f', trim='#70d8f2', zb=0.38, slit=46, flare=0.07, collar=0.05, hem=0.90, glow_trim=True), head=['visor'],
                gait='robe', face=dict(angry=0.15)),
    # the Judge's avatar: bureaucratic court robe to the ankles, stiff mantle, white mask with an amber slit, tall cap, seal
    'arbitrazh': dict(sex='male', hair='bob', hc='silver', skin='light', base='cyber', robe_body=True,
                      pal=dict(jacket='#24162c', jacket_trim='#3a2446', pants='#24162c', gear='#5c2a6c', boots='#140c18', boots_trim='#0b090c', accent='#f0b050', bare=True),
                      coat=dict(col='#2a1830', trim='#f0b050', zb=0.07, slit=16, flare=0.13, collar=0.07, hem=0.94, pleats=0.03, off=0.022, glow_trim=False),
                      head=['judge_mask', 'judge_cap'], body=['mantle', 'seal'], gait='robe'),
    # colonel Ladov: ashen skin and hair, grey greatcoat below the knee, peaked cap, medals
    'ladov': dict(sex='male', hair='short', hc='ash', skin='ashen', iris=(0.55, 0.58, 0.62), base='uniform',
                  pal=dict(jacket='#5a5e5c', jacket_trim='#8a3a2e', pants='#3c3f44', pants_trim='#8a3a2e', boots='#1d1b1a', boots_trim='#0e0d0c', accent='#c9a24a', gear='#3c3f44', strap='#c9a24a', boots_h=0.30),
                  tail=dict(col='#5a5e5c', trim='#8a3a2e', zb=0.34, slit=26, flare=0.08), head=['officer_cap', 'marks_old', 'age_marks'], body=['medals'],
                  gait='robe', face=dict(angry=0.4, sad=0.3, blink=0.34), age=1.0),
    # cyber-priest of the cult: purple hooded robe with glowing circuit lines, choir speaker grille, halo of cables
    'cyberpriest': dict(sex='female', hair=None, hc='black', skin='light', iris=(0.80, 0.30, 0.90), base='cyber', robe_body=True,
                        pal=dict(jacket='#2a1430', jacket_trim='#3c1f46', pants='#2a1430', gear='#5c2a6c', boots='#140c18', boots_trim='#0b090c', accent='#70d8f2', bare=True),
                        coat=dict(col='#5c2a6c', trim='#70d8f2', zb=0.07, slit=20, flare=0.10, collar=0.03, hem=0.94, pleats=0.04, glow_trim=True, circuit=True),
                        head=['hood', 'grille', 'halo'], gait='robe', face=dict(sad=0.2)),
    # crowd: trader (field kit in warm browns, goggles, apron, satchel), settler (rags + ushanka), guard (olive field kit, helmet, plate vest)
    'trader': dict(sex='female', hair='bob', hc='blonde', skin='tan', base='field',
                   pal=dict(jacket='#8a5a34', jacket_trim='#5e3a20', pants='#4b4a42', pants_trim='#34332d', accent='#f0b050', gear='#5e4630', strap='#d8c9a0'),
                   head=['goggles'], body=['apron', 'satchel'], face=dict(happy=0.3)),
    'settler': dict(sex='male', hair='short', hc='brown', skin='tan', base='rags',
                    pal=dict(jacket='#6e6a4c', jacket_trim='#4f4c36', pants='#4b4038', accent='#8a3a2e'), head=['ushanka'], face=dict(happy=0.25, sad=0.15)),
    'guard': dict(sex='male', hair='short', hc='black', skin='light', base='field',
                  pal=dict(jacket='#4b5a2f', jacket_trim='#323d1f', pants='#3c4428', pants_trim='#2a301c', accent='#c42828', gear='#2e3328', strap='#8d95a8'),
                  head=['helmet'], body=['vest'], face=dict(angry=0.3)),
}


# ------------------------------------------------------------------ measuring the (raw) body
def ring_at(body, z, dz=0.008):
    """-> (min x, max x, min y, max y) of the body surface in a thin z slab (head / torso measurements)."""
    vs = [v.co for v in body.data.vertices if abs(v.co.z - z) < dz]
    return min(v.x for v in vs), max(v.x for v in vs), min(v.y for v in vs), max(v.y for v in vs)


def head_ring(body, z, xmax=0.2):
    vs = [v.co for v in body.data.vertices if abs(v.co.z - z) < 0.008 and abs(v.co.x) < xmax]
    return max(abs(v.x) for v in vs), min(v.y for v in vs), max(v.y for v in vs)


def obj_of(bm, name, mats, matfn=None, smooth=True):
    me = bpy.data.meshes.new(name); bm.normal_update(); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new(name, me); link(o)
    for m in mats: o.data.materials.append(m)
    if matfn: assign_mats(o, matfn)
    if smooth: clothes.smooth_shade(o) if hasattr(clothes, 'smooth_shade') else smooth_shade(o)
    return o


def weight_all(o, bone, arm):
    for b in arm.data.bones:
        if b.name not in o.vertex_groups: o.vertex_groups.new(name=b.name)
    o.vertex_groups[bone].add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    o['own_weights'] = 1; o['rigid'] = bone


def ellipsoid(bm, c, r, seg=24, rings=14, keep=None):
    """uv sphere scaled to radii r, faces with keep(centre) False removed (open shells)."""
    res = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    vs = res['verts']
    for v in vs: v.co = Vector((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2])) + Vector(c)
    if keep:
        fs = {f for v in vs for f in v.link_faces}
        bad = [f for f in fs if not keep(f.calc_center_median())]
        bmesh.ops.delete(bm, geom=bad, context='FACES')
    return vs


def tube(bm, pts, r, seg=8):
    """polyline tube (cables)"""
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized(); a = t.orthogonal().normalized(); b = t.cross(a)
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / seg) + b * math.sin(2 * math.pi * k / seg)) * r) for k in range(seg)])
    for r0, r1 in zip(rings[:-1], rings[1:]):
        for k in range(seg): bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]))


def solidify(o, t):
    md = o.modifiers.new('Sol', 'SOLIDIFY'); md.thickness = t; md.offset = 1.0; mode('OBJECT', o); apply_modifiers(o)


# ------------------------------------------------------------------ coats / robes
def coat_torso(body, P, cfg, name='Coat'):
    """long-sleeved torso shell over the base outfit (hem at cfg.hem*hs, standing collar), trims on hem / cuffs / collar / front edges."""
    hs = P['hs']; sw = P['sw']; hem = cfg.get('hem', 0.90) * hs; neck = 1.50 * hs; xs = sw + 0.50 * hs; off = cfg.get('off', 0.016)
    def joff(co):
        if abs(co.x) > sw + 0.03: return off + 0.004 + 0.004 * min(1, (abs(co.x) - sw) / 0.3)
        return off + 0.012 * smooth01((1.04 * hs - co.z) / (0.10 * hs)) + 0.004 * (co.z > 1.28 * hs)
    bm = shell(body, hem, neck, xs, offfn=joff)
    collar(bm, neck, cfg.get('collar', 0.04), 1.0)
    slice_planes(bm, [((0, 0, hem + 0.03), (0, 0, 1)), ((xs - 0.03, 0, 0), (1, 0, 0)), ((-(xs - 0.03), 0, 0), (1, 0, 0)), ((0.012, 0, 0), (1, 0, 0)), ((-0.012, 0, 0), (1, 0, 0))])
    o = to_object(bm, name, 0.6, pin_z=[hem, neck], protect=lambda co: co.z < hem + 0.045 or co.z > neck - 0.03 or abs(co.x) > xs - 0.045 or abs(co.x) < 0.02)
    fold_displace(o, P, creases=[('x', xs * 0.52 + 0.04, 0.03, 0.003, 3, 0.0), ('z', 1.05 * hs, 0.03, 0.003, 6, 0.4)], seed=11.0)
    o.data.materials.append(fab(name + 'Main', cfg['col'], 'weave')); o.data.materials.append(fab(name + 'Trim', cfg['trim'], 'weave', cfg.get('glow_trim', False)))
    o.data.materials.append(fab(name + 'Lining', cfg.get('lining', '#14141c'), 'weave'))
    circ = cfg.get('circuit')
    def mf(c):
        if abs(c.x) > xs - 0.03 or c.z < hem + 0.03 or c.z > neck + 0.002: return 1
        if abs(c.x) < 0.012 and c.y < 0: return 1
        if circ and c.y < 0 and any(abs(abs(c.x) - x0) < 0.005 for x0 in (0.05, 0.09)) and 1.02 * hs < c.z < 1.34 * hs: return 1
        return 0
    assign_mats(o, mf)
    return o


def coat_tail(body, arm, P, cfg, parts, springs, name='CoatTail', zt=None):
    """A-line tail (spring bones coat_k_q) from the waist to cfg.zb*hs, open at the front (cfg.slit deg), turned-up hem."""
    hs = P['hs']; zt = zt or 1.0 * hs; zb = cfg['zb'] * hs
    bm = pleated_skirt(P, zt, zb, cfg.get('flare', 0.07), pleats=14, rows=16, seg_per=4, br=BodyRadius(body, zb - 0.02, zt + 0.02), margin=0.022,
                       hem_flare=0.03, fold=0.03, pleat_depth=cfg.get('pleats', 0.02))
    sl = math.radians(cfg.get('slit', 30)) / 2
    bad = [f for f in bm.faces if abs(math.atan2(f.calc_center_median().x, -f.calc_center_median().y)) < sl]
    bmesh.ops.delete(bm, geom=bad, context='FACES'); bm.normal_update()
    o = to_object(bm, name); o['own_weights'] = 1
    o.data.materials.append(fab(name + 'Main', cfg['col'], 'weave')); o.data.materials.append(fab(name + 'Trim', cfg['trim'], 'weave', cfg.get('glow_trim', False)))
    def mf(c):
        a = abs(math.atan2(c.x, -c.y))
        if c.z < zb + 0.03 or a < sl + math.radians(4): return 1
        if cfg.get('circuit') and c.y < 0 and abs(a - sl - math.radians(14)) < math.radians(1.2): return 1
        return 0
    assign_mats(o, mf)
    others = [p for p in parts if p.name in ('Jacket', 'Coat', 'Pants', 'Suit')]
    push_out(o, [body] + others, 0.006)
    long_ = cfg['zb'] < 0.3
    ss = skirt_springs(o, arm, P, zt=zt, zb=zb, prefix='coat', leg=(0.62, 0.50) if long_ else (0.85, 0.6), stiffness=0.5, flare=cfg.get('flare', 0.07))
    for c_ in ss: c_.update(stiffness=0.9 if long_ else 0.7, gravityPower=0.35, dragForce=0.55)      # heavy cloth: no bell flare on the run
    springs += ss
    bpy.context.view_layer.objects.active = o; mode('OBJECT', o); bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    return o


# ------------------------------------------------------------------ head gear (rigid on the head bone)
def hat_fit(H, z0, z1, pad=0.012):
    """hat band fitted around head + hair between z0 and z1 -> (rx, ry, cy, top z)"""
    vs = [v for v in H['hv'] if z0 - 0.01 < v.z < z1] or [Vector((H['hx'], H['cy'], z0))]
    x = max(abs(v.x) for v in vs); y0 = min(v.y for v in vs); y1 = max(v.y for v in vs)
    return x + pad, (y1 - y0) / 2 + pad, (y0 + y1) / 2, max(v.z for v in H['hv'])


def head_geo(body, P, hair=None):
    """raw-layout head measurements: chin, eyes, top z, half width, front / back y at eye level, centre y."""
    hs = P['hs']; J = joints(P); zc = J['head'][2]; zt = max(v.co.z for v in body.data.vertices)
    ze = zc + 0.100 * hs; hx, fy, by = head_ring(body, ze, 0.14)
    hv = [v.co.copy() for v in body.data.vertices if v.co.z > zc + 0.06 * hs and abs(v.co.x) < 0.16]
    if hair is not None:
        from skeleton import zinv
        hv += [Vector((v.co.x, v.co.y, zinv(v.co.z, P))) for v in hair.data.vertices if abs(v.co.x) < 0.2]
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    def face_y(x, z):
        hit = bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        return hit[0].y if hit[0] is not None else fy
    def face_hit(x, z):
        hit = bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
        if hit[0] is None or hit[0].y > fy + 0.06: return None
        n = hit[1].normalized(); return hit[0], (n if n.y < 0 else -n)
    return dict(zc=zc, ze=ze, zt=zt, hx=hx, fy=fy, by=by, cy=(fy + by) / 2, hs=hs, hv=hv, face_y=face_y, hit=face_hit)


def hg_visor(H, C):
    bm = bmesh.new(); r = H['hx'] + 0.012; ry = (H['by'] - H['fy']) / 2 + 0.012; cy = H['cy']
    seg = 18; h = 0.026 * H['hs']; rows = []
    for k in range(seg + 1):
        a = math.radians(-82 + 164 * k / seg); x = math.sin(a) * r; y = cy - math.cos(a) * ry
        dz = 0.004 * math.cos(a)
        rows.append([bm.verts.new((x, y, H['ze'] + dz + s * h / 2)) for s in (-1, 1)])
    for r0, r1 in zip(rows[:-1], rows[1:]): bm.faces.new((r0[0], r1[0], r1[1], r0[1]))
    for s in (1, -1):   # temple arms
        bm2 = rbox(bm, (s * (H['hx'] + 0.008), cy + 0.03, H['ze'] + 0.004), (0.006, 0.07, 0.008), bevel=0.002)
    return bm, [fab('VisorGlow', '#70d8f2', 'weave', True)], None


def hg_judge_mask(H, C):
    bm = bmesh.new(); hs = H['hs']; cy = H['cy']; ry = (H['by'] - H['fy']) / 2
    zc = H['ze'] - 0.02 * hs
    ellipsoid(bm, (0, cy - 0.004, zc), (H['hx'] + 0.018, ry + 0.026, 0.140 * hs), seg=28, rings=18,
              keep=lambda c: c.y < cy - 0.035 and c.z > H['zc'] - 0.015)
    # visor slit + forehead sigil (the slit floats 2 mm off the plate)
    bm2v = []
    for k in range(13):
        a = math.radians(-58 + 116 * k / 12); x = math.sin(a) * (H['hx'] + 0.021); y = cy - 0.004 - math.cos(a) * (ry + 0.029)
        bm2v.append([bm.verts.new((x, y, H['ze'] + s * 0.009 * hs)) for s in (-1, 1)])
    for r0, r1 in zip(bm2v[:-1], bm2v[1:]): bm.faces.new((r0[0], r1[0], r1[1], r0[1]))
    blob(bm, (0, H['fy'] - 0.03, H['ze'] + 0.07 * hs), 0.012, (1, 0.4, 1.6), seg=8, rings=6)
    mats = [fab('MaskPlate', '#e8e4dc', 'weave'), fab('MaskSlit', '#f0b050', 'weave', True)]
    def mf(c):
        if abs(c.z - H['ze']) < 0.011 * hs and c.y < H['fy'] - 0.01 and abs(c.x) < H['hx']: return 1
        if c.z > H['ze'] + 0.05 * hs and abs(c.x) < 0.02 and c.y < H['fy'] - 0.02: return 1
        return 0
    return bm, mats, mf


def hg_judge_cap(H, C):
    """tall stiff judicial cap (truncated cone, flat top), amber band and a stamp-like badge"""
    bm = bmesh.new(); hs = H['hs']; z0 = H['zt'] - 0.075 * hs; h = 0.20 * hs
    r0, ry0, cy, _ = hat_fit(H, z0, z0 + 0.06, 0.018)
    res = bmesh.ops.create_cone(bm, cap_ends=True, radius1=1.0, radius2=1.12, depth=h, segments=28)
    for v in res['verts']: v.co = Vector((v.co.x * r0, v.co.y * ry0 + cy, v.co.z + z0 + h / 2))
    band(bm, (0, cy, z0 + 0.025), r0 + 0.004, ry0 + 0.004, 0.03, seg=28)
    rbox(bm, (0, cy - ry0 * 1.06 - 0.006, z0 + 0.10 * hs), (0.05, 0.012, 0.06), bevel=0.006)
    mats = [fab('JudgeCap', '#1c1220', 'leather'), fab('JudgeCapBand', '#f0b050', 'weave', True)]
    return bm, mats, lambda c: 1 if (c.z < z0 + 0.042 or (c.y < cy - ry0 and abs(c.z - z0 - 0.10 * hs) < 0.035)) else 0


def hg_officer_cap(H, C):
    bm = bmesh.new(); hs = H['hs']; z0 = H['zt'] - 0.075 * hs
    r0, ry0, cy, top = hat_fit(H, z0, z0 + 0.045, 0.012); z0 = max(z0, top - 0.075)
    band(bm, (0, cy, z0 + 0.022), r0, ry0, 0.044, seg=28)                                          # band
    ellipsoid(bm, (0, cy + 0.008, z0 + 0.052), (r0 * 1.38, ry0 * 1.42, 0.035), seg=28, rings=10)    # wide crown
    # peak: half disc in front, tilted down
    pk = []
    for k in range(11):
        a = math.radians(-70 + 140 * k / 10)
        for rr in (1.0, 1.55):
            pk.append(Vector((math.sin(a) * r0 * (1 if rr == 1 else 0.92), cy - math.cos(a) * ry0 * rr, z0 + 0.004 - (rr - 1) * 0.05)))
    vs = [bm.verts.new(p) for p in pk]
    for k in range(10): bm.faces.new((vs[2 * k], vs[2 * k + 2], vs[2 * k + 3], vs[2 * k + 1]))
    blob(bm, (0, cy - ry0 - 0.004, z0 + 0.028), 0.014, (1, 0.5, 1), seg=8, rings=6)                  # cockade
    mats = [fab('CapMain', C['jacket'], 'weave'), fab('CapBand', C['jacket_trim'], 'weave'), fab('CapPeak', '#141414', 'leather'), fab('CapBadge', C['accent'], 'leather')]
    def mf(c):
        if c.y < cy - ry0 - 0.002 and abs(c.z - z0 - 0.028) < 0.016 and abs(c.x) < 0.016: return 3
        if c.z < z0 + 0.008 and c.y < cy - ry0 * 0.9: return 2
        if c.z < z0 + 0.045: return 1
        return 0
    return bm, mats, mf


def hg_helmet(H, C):
    bm = bmesh.new(); hs = H['hs']; z0 = H['ze'] + 0.03 * hs
    r0, ry0, cy, top = hat_fit(H, z0, H['zt'] + 0.1, 0.016)
    ellipsoid(bm, (0, cy, z0), (r0, ry0, max(H['zt'], top) - z0 + 0.025), seg=28, rings=14, keep=lambda c: c.z > z0 - 0.002 or (c.y > cy and c.z > z0 - 0.07 * hs))
    band(bm, (0, cy, z0 + 0.006), r0 + 0.006, ry0 + 0.006, 0.016, seg=28)                        # rim
    for k in range(11):   # visor strip (glow)
        pass
    rbox(bm, (0, cy - ry0 - 0.004, z0 + 0.03), (0.07, 0.012, 0.016), bevel=0.004)
    mats = [fab('HelmetShell', C['jacket'], 'leather'), fab('HelmetRim', C['gear'], 'leather'), fab('HelmetGlow', '#70d8f2', 'weave', True)]
    def mf(c):
        if c.y < cy - ry0 + 0.004 and abs(c.z - z0 - 0.03) < 0.012: return 2
        if abs(c.z - z0 - 0.006) < 0.01: return 1
        return 0
    return bm, mats, mf


def hg_ushanka(H, C):
    """fur hat: puffy lumpy crown, fur roll with the front flap turned up, soft ear flaps hanging down beside the ears (with ties), tin star"""
    bm = bmesh.new(); hs = H['hs']; z0 = H['ze'] + 0.02 * hs
    r0, ry0, cy, top = hat_fit(H, z0, H['zt'] + 0.1, 0.022)
    hz = max(H['zt'], top) + 0.045 - z0
    vs = ellipsoid(bm, (0, cy, z0), (r0 + 0.006, ry0 + 0.006, hz), seg=32, rings=16, keep=lambda c: c.z > z0 - 0.004)
    for v in vs:                                                                                  # flat-ish puffy top, fur lumps
        if not v.is_valid: continue
        rel = max(0.0, (v.co.z - z0) / hz); a = math.atan2(v.co.x, v.co.y - cy)
        box = min(1.5, (max(0.0, 1 - rel ** 4)) ** 0.25 / max(0.05, math.sqrt(max(0.0, 1 - rel * rel))))   # straight sides, flat top
        if rel > 0.8: v.co.z = z0 + hz * (0.8 + (rel - 0.8) * 0.5)
        k = box * (1 + 0.03 * math.sin(7 * a + 5 * rel) * math.sin(11 * rel + 3 * a) + 0.025 * math.sin(19 * a + 13 * rel) * math.sin(23 * rel - 7 * a))   # fur tufts
        v.co.x *= k; v.co.y = cy + (v.co.y - cy) * k
    ring_pts = [Vector((math.sin(2 * math.pi * q / 40) * (r0 + 0.014), cy - math.cos(2 * math.pi * q / 40) * (ry0 + 0.014), z0 + 0.006)) for q in range(41)]
    tube(bm, ring_pts, 0.025, seg=10)                                                             # fur roll
    blob(bm, (0, cy - ry0 - 0.02, z0 + 0.045), 0.062, (1.15, 0.32, 0.72), seg=16, rings=10)      # front flap turned up
    zf = z0 - 0.085                                                                               # ear flaps down, beside the ears
    ex = max([abs(v.x) for v in H['hv'] if abs(v.z - zf) < 0.035] or [H['hx']])
    for s in (1, -1):
        res = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=1.0)
        for v in res['verts']:
            p = Vector((v.co.x * 0.020, v.co.y * 0.050, v.co.z * 0.080))
            p.x += 0.035 * max(0.0, -v.co.z) * 0.35 + 0.004 * math.sin(9 * v.co.y + 4 * v.co.z)      # flares out at the bottom, soft lumps
            v.co = Vector((s * (max(ex, r0 - 0.01) + 0.018 + p.x), cy + 0.008 + p.y, zf + 0.012 + p.z))
        tube(bm, [Vector((s * (max(ex, r0 - 0.01) + 0.026), cy + 0.008, zf - 0.066 - 0.012 * q)) for q in range(5)], 0.0035, seg=6)   # ties
    blob(bm, (0, cy - ry0 - 0.042, z0 + 0.05), 0.012, (1.2, 0.4, 1.2), seg=8, rings=6)          # tin star
    mats = [fab('UshankaTop', '#7d6a52', 'knit'), fab('UshankaFur', '#a8916f', 'knit'), fab('UshankaStar', '#c42828', 'leather')]
    def mf(c):
        if c.y < cy - ry0 - 0.035 and abs(c.z - z0 - 0.05) < 0.014 and abs(c.x) < 0.016: return 2
        if c.z < z0 + 0.032 or c.y < cy - ry0 - 0.005: return 1
        return 0
    return bm, mats, mf


def hg_marks_old(H, C):
    """age / battle marks as flat strips just above the face (no outline hull): scar over the left eye, nasolabial folds,
    eye bags, forehead lines. Rigid on the head; the face atlas swap in the game keeps them."""
    from head import feature_layout
    bm = bmesh.new(); hs = H['hs']; fl = feature_layout(hs); zc = H['zc']
    ex, ez, bz, nz, mz = fl['eye_x'] * hs, fl['eye_z'] * hs, fl['brow_z'] * hs, fl['nose_z'] * hs, fl['mouth_z'] * hs
    def strip(pts, w, n=10):
        P_ = []
        for k in range(n + 1):                                    # Catmull-free: piecewise linear resample
            u = k / n * (len(pts) - 1); i = min(int(u), len(pts) - 2); f = u - i
            x = pts[i][0] * (1 - f) + pts[i + 1][0] * f; z = pts[i][1] * (1 - f) + pts[i + 1][1] * f
            P_.append((x, z, w * (0.35 + 0.65 * math.sin(math.pi * k / n))))
        prev = None
        for k, (x, z, ww) in enumerate(P_):
            j = min(k + 1, n); i0 = max(k - 1, 0)
            tx, tz = P_[j][0] - P_[i0][0], P_[j][1] - P_[i0][1]; L = math.hypot(tx, tz) or 1; nx, nz_ = -tz / L * ww, tx / L * ww
            pr = [bm.verts.new((x + sx * nx, H['face_y'](x + sx * nx, zc + z + sx * nz_) - 0.0009, zc + z + sx * nz_)) for sx in (-1, 1)]
            if prev: bm.faces.new((prev[0], prev[1], pr[1], pr[0]))
            prev = pr
    groups = []
    f0 = len(bm.faces)
    strip([(ex + 0.012, bz + 0.022), (ex + 0.002, ez + 0.004), (ex - 0.010, ez - 0.038)], 0.0026, 12)     # scar
    groups.append((f0, len(bm.faces), 1)); f0 = len(bm.faces)
    for s in (1, -1):
        strip([(s * 0.015, nz - 0.002), (s * 0.023, mz + 0.008), (s * 0.026, mz - 0.004)], 0.0010, 8)    # nasolabial
        strip([(s * (ex - 0.017), ez - 0.024), (s * ex, ez - 0.030), (s * (ex + 0.016), ez - 0.024)], 0.0009, 8)  # eye bags
        strip([(s * (ex + 0.031), ez + 0.004), (s * (ex + 0.036), ez - 0.002)], 0.0008, 3)              # crow's feet
    for dz in (0.026, 0.040):
        strip([(-0.030, bz + dz), (0, bz + dz + 0.003), (0.030, bz + dz)], 0.0008, 10)                  # forehead lines
    f0 = len(bm.faces)
    strip([(-0.026, nz - 0.020), (-0.012, nz - 0.011), (0.0, nz - 0.012), (0.012, nz - 0.011), (0.026, nz - 0.020)], 0.0042, 14)   # grey moustache
    groups.append((f0, len(bm.faces), 2))
    mats = [fab('MarksLine', '#5a4c48', 'leather'), fab('MarksScar', '#c9a8a0', 'leather'), fab('MarksMoustache', C.get('moustache', '#8e8c88'), 'knit')]
    bm.faces.ensure_lookup_table(); bm.normal_update()
    for f in bm.faces:
        if f.normal.y > 0: f.normal_flip()
    for a, b, m in groups:
        for q in range(a, b): bm.faces[q].material_index = m
    return bm, mats, None


def hg_goggles(H, C):
    bm = bmesh.new(); hs = H['hs']; r0 = H['hx'] + 0.012; ry0 = (H['by'] - H['fy']) / 2 + 0.012; cy = H['cy']
    z = H['ze'] + 0.075 * hs
    band(bm, (0, cy, z), r0, ry0, 0.016, seg=28)
    for s in (1, -1):
        a = math.radians(24 * s); p = Vector((math.sin(a) * (r0 + 0.012), cy - math.cos(a) * (ry0 + 0.012), z + 0.004))
        res = bmesh.ops.create_cone(bm, cap_ends=True, radius1=0.022, radius2=0.019, depth=0.024, segments=12)
        R = Vector((0, 0, 1)).rotation_difference(Vector((math.sin(a), -math.cos(a), 0.15)).normalized())
        for v in res['verts']: v.co = R @ v.co + p
    mats = [fab('GogStrap', '#3b2519', 'leather'), fab('GogLens', '#f0b050', 'weave', True)]
    return bm, mats, lambda c: 1 if (c.y < H['fy'] - 0.02) else 0


def hg_grille(H, C):
    """choir speaker over the mouth (lower-face plate with glowing slats)"""
    bm = bmesh.new(); hs = H['hs']; zm = H['zc'] + 0.045 * hs
    ry = (H['by'] - H['fy']) / 2
    ellipsoid(bm, (0, H['cy'] - 0.004, zm), (H['hx'] * 0.92, ry + 0.008, 0.062 * hs), seg=24, rings=12,
              keep=lambda c: c.y < H['cy'] - 0.045 and c.z < zm + 0.03 * hs)
    for k in range(3): rbox(bm, (0, H['fy'] - 0.018, zm - 0.012 + 0.012 * k), (0.05, 0.006, 0.004), bevel=0.0015)
    mats = [fab('GrillePlate', '#2e2236', 'leather'), fab('GrilleGlow', '#70d8f2', 'weave', True)]
    return bm, mats, lambda c: 1 if (c.y < H['fy'] - 0.014 and abs(c.x) < 0.03) else 0


def hg_halo(H, C):
    """ring of cables behind the head (vertical plane), with antenna spokes and glowing nodes"""
    bm = bmesh.new(); hs = H['hs']; c = Vector((0, H['by'] + 0.06, H['ze'] + 0.04 * hs)); R = 0.19 * hs
    pts = [c + Vector((math.sin(2 * math.pi * k / 40) * R, 0.012 * math.sin(6 * math.pi * k / 40), math.cos(2 * math.pi * k / 40) * R)) for k in range(41)]
    tube(bm, pts, 0.009, 8)
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8; d = Vector((math.sin(a), 0, math.cos(a)))
        tube(bm, [c + d * 0.06, c + d * (R - 0.01)], 0.003, 6)
        blob(bm, c + d * (R + 0.02), 0.012, seg=8, rings=6)
    tube(bm, [c + Vector((0, -0.01, -0.03)), c + Vector((0, -0.04, -0.08)), Vector((0, H['by'] - 0.01, H['zc'] + 0.02))], 0.008, 8)   # neck cable
    mats = [fab('HaloCable', '#3c3f4f', 'leather'), fab('HaloGlow', '#70d8f2', 'weave', True)]
    return bm, mats, lambda p: 1 if ((p - c).length > R + 0.008 or abs((p - c).length - R) < 0.0 ) else 0


def hg_age_marks(H, C):
    """older face on the shared atlas: heavy grey brows over the painted ones, gaunt cheek lines under the cheekbones, deeper
    nasolabial folds, grey stubble as tiny flecks on the jaw / chin / upper lip (no base patch: no skin tone to match)"""
    from head import feature_layout
    import random
    bm = bmesh.new(); hs = H['hs']; fl = feature_layout(hs); zc = H['zc']
    ex, ez, bz, nz, mz = fl['eye_x'] * hs, fl['eye_z'] * hs, fl['brow_z'] * hs, fl['nose_z'] * hs, fl['mouth_z'] * hs
    def surf(x, z, lift=0.0010):
        hit = H['hit'](x, zc + z)
        if hit is None: return None
        loc, nrm = hit
        return loc + nrm * lift, nrm
    def strip(pts, w, n=10, taper=0.35, lift=0.0011):
        P_ = []
        for k in range(n + 1):
            u = k / n * (len(pts) - 1); i = min(int(u), len(pts) - 2); f = u - i
            P_.append((pts[i][0] * (1 - f) + pts[i + 1][0] * f, pts[i][1] * (1 - f) + pts[i + 1][1] * f, w * (taper + (1 - taper) * math.sin(math.pi * k / n))))
        prev = None
        for k, (x, z, ww) in enumerate(P_):
            j = min(k + 1, n); i0 = max(k - 1, 0)
            tx, tz = P_[j][0] - P_[i0][0], P_[j][1] - P_[i0][1]; L = math.hypot(tx, tz) or 1; nx, nz_ = -tz / L * ww, tx / L * ww
            pr = []
            for sx in (-1, 1):
                r = surf(x + sx * nx, z + sx * nz_, lift)
                pr.append(bm.verts.new(r[0] if r else (x + sx * nx, H['fy'] - 0.002, zc + z + sx * nz_)))
            if prev: bm.faces.new((prev[0], prev[1], pr[1], pr[0]))
            prev = pr
    groups = []; f0 = 0
    def grp(m):
        nonlocal f0; groups.append((f0, len(bm.faces), m)); f0 = len(bm.faces)
    for s in (1, -1):                                                                                   # heavy brows (bushy, low, inner ends down)
        zb_ = ez + fl['eye_rz'] * hs + 0.006                                                           # low, just over the lids (the bangs hide bz)
        strip([(s * (ex - 0.030), zb_ - 0.007), (s * (ex - 0.010), zb_ + 0.000), (s * (ex + 0.012), zb_ + 0.003), (s * (ex + 0.030), zb_ - 0.004)], 0.0062, 14, taper=0.6, lift=0.0018)
    grp(0)
    for s in (1, -1):
        strip([(s * (ex + 0.026), ez - 0.026), (s * (ex + 0.018), ez - 0.040), (s * (ex + 0.010), ez - 0.052)], 0.0016, 8)    # gaunt cheek line
        strip([(s * 0.014, nz + 0.004), (s * 0.022, nz - 0.010), (s * 0.028, mz + 0.002), (s * 0.030, mz - 0.010)], 0.0017, 10)  # deep nasolabial
        strip([(s * 0.020, mz - 0.010), (s * 0.024, mz - 0.020)], 0.0010, 4)                                # marionette line
    grp(1)
    rnd = random.Random(7)
    def jaw_ok(x, z):
        if z < -0.004 or z > nz - 0.004: return False
        if abs(z - mz) < 0.009 and abs(x) < 0.030: return False                                         # mouth
        if z > mz + 0.002 and abs(x) > 0.030: return False                                              # upper lip only under the nose
        return abs(x) < 0.062 - 0.25 * max(0.0, z - 0.03)
    n = 0
    while n < 520:
        x = rnd.uniform(-0.07, 0.07); z = rnd.uniform(-0.006, nz)
        if not jaw_ok(x, z): continue
        r = surf(x, z, 0.0009)
        if r is None or r[1].y > -0.35: continue
        loc, nrm = r; t = nrm.orthogonal().normalized(); b = nrm.cross(t); a = rnd.uniform(0, math.pi)
        d1 = (t * math.cos(a) + b * math.sin(a)) * 0.0011; d2 = (b * math.cos(a) - t * math.sin(a)) * 0.0007
        bm.faces.new([bm.verts.new(loc + d1), bm.verts.new(loc + d2), bm.verts.new(loc - d1), bm.verts.new(loc - d2)]); n += 1
    grp(2)
    mats = [fab('AgeBrow', '#86827d', 'knit'), fab('AgeLine', '#6a5a56', 'leather'), fab('AgeStubble', '#7c7a78', 'leather')]
    bm.faces.ensure_lookup_table(); bm.normal_update()
    for f in bm.faces:
        if f.normal.y > 0: f.normal_flip()
    for a, b_, m in groups:
        for q in range(a, b_): bm.faces[q].material_index = m
    return bm, mats, None


HEADGEAR = dict(marks_old=hg_marks_old, age_marks=hg_age_marks, visor=hg_visor, judge_mask=hg_judge_mask, judge_cap=hg_judge_cap, officer_cap=hg_officer_cap, helmet=hg_helmet, ushanka=hg_ushanka,
                goggles=hg_goggles, grille=hg_grille, halo=hg_halo)


def hood(body, P, H, cfg):
    """deep hood: shell around the head open at the face, falls onto the shoulders (weights head -> upperChest)."""
    hs = P['hs']; cy = H['cy'] + 0.012; r0 = H['hx'] + 0.035; ry0 = (H['by'] - H['fy']) / 2 + 0.04
    bm = bmesh.new(); zc = H['ze'] + 0.01
    def keep(c):
        # face opening: front, between brow and chin
        if c.y < cy - 0.03 and abs(c.x) < H['hx'] * 0.86 and H['zc'] - 0.02 < c.z < H['ze'] + 0.06 * hs: return False
        return c.z > H['zc'] - 0.065 * hs
    ellipsoid(bm, (0, cy, zc), (r0, ry0, (H['zt'] - zc) + 0.045), seg=32, rings=20, keep=keep)
    # cowl: flare the lower ring outwards onto the shoulders
    for v in bm.verts:
        t = smooth01((H['zc'] + 0.02 - v.co.z) / (0.07 * hs))
        if t > 0:
            v.co.x *= 1 + 0.9 * t; v.co.y = cy + (v.co.y - cy) * (1 + 0.45 * t); v.co.z -= 0.02 * t
        if v.co.z > H['zt'] - 0.01: v.co.y += 0.03 * smooth01((v.co.z - H['zt'] + 0.01) / 0.05)   # slight peak to the back
    o = obj_of(bm, 'Hood', [fab('HoodMain', cfg['col'], 'weave'), fab('HoodTrim', cfg['trim'], 'weave', True)],
               lambda c: 1 if (c.y < cy - 0.03 and abs(c.x) < H['hx'] * 0.86 + 0.03 and H['zc'] - 0.03 < c.z < H['ze'] + 0.06 * hs + 0.025) else 0)
    solidify(o, 0.006)
    push_out(o, [body], 0.012)
    return o


def hood_weights(o, arm, P):
    hs = P['hs']; J = joints(P)
    for b in arm.data.bones:
        if b.name not in o.vertex_groups: o.vertex_groups.new(name=b.name)
    for v in o.data.vertices:
        t = smooth01((v.co.z - (J['head'][2] - 0.07 * hs)) / (0.08 * hs))
        o.vertex_groups['head'].add([v.index], max(1e-3, t), 'REPLACE')
        if t < 1: o.vertex_groups['upperChest'].add([v.index], 1 - t, 'REPLACE')
    o['own_weights'] = 1


# ------------------------------------------------------------------ body gear (weights transferred from the body)
def bg_mantle(body, P, C, cfg):
    hs = P['hs']; sw = P['sw']
    bm = shell(body, 1.30 * hs, 1.51 * hs, sw + 0.16 * hs, offfn=lambda co: 0.03 + 0.03 * smooth01((1.46 * hs - co.z) / (0.14 * hs)))
    o = to_object(bm, 'Mantle', None)
    for v in o.data.vertices:   # stiff cape: flare outwards towards the lower edge
        t = smooth01((1.44 * hs - v.co.z) / (0.14 * hs)); v.co.x *= 1 + 0.10 * t; v.co.y *= 1 + 0.18 * t
    o.data.materials.append(fab('MantleMain', '#3a2446', 'weave')); o.data.materials.append(fab('MantleTrim', '#f0b050', 'weave', True))
    assign_mats(o, lambda c: 1 if c.z < 1.31 * hs + 0.012 else 0); solidify(o, 0.006)
    return o


def bg_seal(body, P, C, cfg):
    hs = P['hs']; z = 1.26 * hs; x0, x1, y0, y1 = ring_at(body, z, 0.01)
    bm = bmesh.new(); res = bmesh.ops.create_cone(bm, cap_ends=True, radius1=0.05, radius2=0.044, depth=0.014, segments=20)
    for v in res['verts']: v.co = Vector((v.co.x, -v.co.z, v.co.y)) + Vector((0, y0 - 0.04, z))
    for s in (1, -1): tube(bm, [Vector((s * 0.035, y0 - 0.04, z + 0.03)), Vector((s * 0.09, y0 - 0.01, z + 0.16 * hs)), Vector((s * 0.12, y0 + 0.02, 1.43 * hs))], 0.006, 6)   # chain
    o = obj_of(bm, 'Seal', [fab('SealGold', '#f0b050', 'leather'), fab('SealGlow', '#f2d024', 'weave', True)], lambda c: 1 if c.y < y0 - 0.046 and abs(c.x) < 0.03 else 0)
    return o


def bg_medals(body, P, C, cfg):
    hs = P['hs']; z = 1.30 * hs; x0, x1, y0, y1 = ring_at(body, z, 0.01)
    bm = bmesh.new()
    for k in range(4):
        x = 0.05 + 0.024 * k
        rbox(bm, (x, y0 - 0.026, z + 0.02), (0.02, 0.006, 0.01), bevel=0.002)                       # ribbons
        res = bmesh.ops.create_cone(bm, cap_ends=True, radius1=0.009, radius2=0.009, depth=0.004, segments=10)
        for v in res['verts']: v.co = Vector((v.co.x, -v.co.z, v.co.y)) + Vector((x, y0 - 0.028, z - 0.002))
    o = obj_of(bm, 'Medals', [fab('MedalRibbon', '#8a3a2e', 'weave'), fab('MedalMetal', '#c9a24a', 'leather')], lambda c: 1 if c.z < z + 0.01 else 0)
    return o


def bg_vest(body, P, C, cfg):
    hs = P['hs']; bm = bmesh.new()
    for zz, side in ((1.24, -1), (1.24, 1)):
        x0, x1, y0, y1 = ring_at(body, zz * hs, 0.01)
        y = (y0 - 0.05) if side < 0 else (y1 + 0.05)
        rbox(bm, (0, y, zz * hs), (0.30, 0.04, 0.24 * hs), bevel=0.02)
    for s in (1, -1): rbox(bm, (s * 0.10, 0, 1.42 * hs), (0.05, 0.26, 0.02), bevel=0.008)          # shoulder straps
    x0, x1, y0, y1 = ring_at(body, 1.24 * hs, 0.01)
    rbox(bm, (0.07, y0 - 0.076, 1.18 * hs), (0.07, 0.02, 0.06), bevel=0.008)                          # radio pouch
    o = obj_of(bm, 'Vest', [fab('VestPlate', '#3c4428', 'leather'), fab('VestGear', '#2a301c', 'leather'), fab('VestTag', '#70d8f2', 'weave', True)],
               lambda c: 2 if (c.y < y0 - 0.09 and abs(c.x - 0.07) < 0.03 and abs(c.z - 1.18 * hs) < 0.02) else (1 if abs(c.z - 1.42 * hs) < 0.03 else 0))
    push_out(o, [body], 0.02)
    return o


def bg_satchel(body, P, C, cfg):
    hs = P['hs']; hx = P['hx']; bm = bmesh.new()
    rbox(bm, (hx + 0.15, -0.02, 0.86 * hs), (0.05, 0.16, 0.14), bevel=0.02)
    o = obj_of(bm, 'Satchel', [fab('SatchelLeather', '#6e3d22', 'leather')])
    push_out(o, [body], 0.03)
    return o


def apron(body, P, C, arm, parts):
    """front panel from the waist to the knees (weights hips -> thighs average: it never splits between the legs)"""
    hs = P['hs']; J = joints(P); bm = bmesh.new(); rows, cols = 10, 9
    zt, zb = 1.0 * hs, 0.50 * hs; grid = []
    brs = [BodyRadius(x, zb - 0.02, zt + 0.02) for x in [body] + [p for p in parts if p.name in ('Jacket', 'Pants')]]
    br = lambda z, a: max(b(z, a) for b in brs)
    angs = [math.radians(-62 + 124 * i / cols) for i in range(cols + 1)]; prev = [0.0] * (cols + 1); rads = []
    for j in range(rows + 1):
        z = zt + (zb - zt) * j / rows
        r = [br(z, a) + 0.02 for a in angs]
        for _ in range(3): r = [max(r[i], (r[max(0, i - 1)] + r[i] + r[min(cols, i + 1)]) / 3) for i in range(cols + 1)]
        r = [max(r[i], prev[i]) for i in range(cols + 1)]; prev = r; rads.append(r)          # hangs straight down from the widest point
    for j in range(rows + 1):
        f = j / rows; z = zt + (zb - zt) * f
        grid.append([bm.verts.new((math.sin(a) * (rr + 0.03 * f), -math.cos(a) * (rr + 0.03 * f), z)) for a, rr in zip(angs, rads[j])])
    for j in range(rows):
        for i in range(cols): bm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]))
    nf = len(bm.faces)
    yp = -(rads[int(rows * 0.48)][cols // 2] + 0.03 * 0.48 + 0.007)
    rbox(bm, (0, yp, 0.76 * hs), (0.14, 0.01, 0.07), bevel=0.004)                                    # pocket
    for k, f_ in enumerate(bm.faces): f_.material_index = 1 if k >= nf else 0
    o = obj_of(bm, 'Apron', [fab('ApronCloth', '#c9b48a', 'weave'), fab('ApronTrim', '#6e3d22', 'leather')])
    for p_ in o.data.polygons:
        if p_.center.z > zt - 0.015 or p_.center.z < zb + 0.02: p_.material_index = 1
    push_out(o, [body] + [p for p in parts if p.name in ('Jacket', 'Pants')], 0.008)
    solidify(o, 0.004)
    for b in arm.data.bones: o.vertex_groups.new(name=b.name)
    for v in o.data.vertices:
        t = smooth01((zt - v.co.z) / (zt - zb) * 1.6)
        o.vertex_groups['hips'].add([v.index], 1 - 0.7 * t + 1e-3, 'REPLACE')
        if t > 0: o.vertex_groups['leftUpperLeg'].add([v.index], 0.35 * t, 'REPLACE'); o.vertex_groups['rightUpperLeg'].add([v.index], 0.35 * t, 'REPLACE')
    o['own_weights'] = 1
    return o


BODYGEAR = dict(mantle=bg_mantle, seal=bg_seal, medals=bg_medals, vest=bg_vest, satchel=bg_satchel)


def make_extra(npc, hair=None):
    """-> extra(raw_body, arm, P, parts, springs, C) for clothes.build_outfit"""
    def extra(body, arm, P, parts, springs, C):
        hs = P['hs']; H = head_geo(body, P, hair)
        cfg = npc.get('coat')
        if cfg:
            ct = coat_torso(body, P, cfg); push_out(ct, [body] + [p for p in parts if p.name in ('Suit', 'Jacket')], 0.008); parts.append(ct)
            tl = coat_tail(body, arm, P, cfg, parts, springs); parts.append(tl)
        if npc.get('tail'):
            tl = coat_tail(body, arm, P, npc['tail'], parts, springs, zt=0.98 * hs); parts.append(tl)
        if 'apron' in npc.get('body', []): parts.append(apron(body, P, C, arm, parts))
        for k in npc.get('body', []):
            if k in BODYGEAR: parts.append(BODYGEAR[k](body, P, C, cfg))
        if 'hood' in npc.get('head', []):
            ho = hood(body, P, H, cfg); hood_weights(ho, arm, P); parts.append(ho)
        objs = []
        for k in npc.get('head', []):
            if k not in HEADGEAR: continue
            bm, mats, mf = HEADGEAR[k](H, C); objs.append(obj_of(bm, 'HG_' + k, mats, mf))
        if objs:
            if len(objs) > 1:
                mode('OBJECT')
                for x in bpy.context.scene.objects: x.select_set(False)
                for x in objs: x.select_set(True)
                bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join()
            hg = objs[0]; hg.name = 'Headgear'; weight_all(hg, 'head', arm); parts.append(hg)
    return extra


def bias_face(body, keys):
    """bake a fraction of the expression shape keys into the rest face (stern / tired / friendly look per NPC): every key block moves by the
    same delta, so the morph targets stay the same and the game's face atlas swap keeps the look."""
    kb = body.data.shape_keys.key_blocks; base = kb['Basis']; d = {}
    for k, w in keys.items():
        for i, (a, b) in enumerate(zip(kb[k].data, base.data)):
            dv = a.co - b.co
            if dv.length_squared > 1e-12: d[i] = d.get(i, Vector()) + dv * w
    for blk in kb:
        for i, dv in d.items(): blk.data[i].co += dv
    for i, dv in d.items(): body.data.vertices[i].co += dv


def age_face(body, P, amt=1.0):
    """older head geometry (rest face + every key block, like bias_face): heavier brow ridge, deeper eye sockets, sunken cheeks
    under higher cheekbones, longer chin. Front of the head only; the planar face UV moves with the vertices."""
    from head import feature_layout, gauss
    from skeleton import zmap
    hs = P['hs']; J = joints(P); fl = feature_layout(hs); zchin = zmap(J['head'][2], P); y0 = J['head'][1]
    bz, ex, ez = fl['brow_z'] * hs, fl['eye_x'] * hs, fl['eye_z'] * hs
    d = {}
    for v in body.data.vertices:
        c = v.co; x = c.x; ax = abs(x); z = c.z - zchin; sg = 1 if x >= 0 else -1
        if c.y > y0 or z < -0.03 or z > 0.24 * hs or ax > 0.12: continue
        dv = Vector()
        wb = gauss((z - bz + 0.006) ** 2, 0.008) * gauss(max(0.0, ax - 0.045) ** 2, 0.012)                 # brow ridge
        dv += Vector((0, -0.0065, -0.0022)) * wb
        dv += Vector((0, 0.0022, 0)) * gauss((ax - ex) ** 2 + (z - ez) ** 2, 0.016)                         # sockets
        wc = gauss((ax - 0.050 * hs) ** 2 + (z - 0.042 * hs) ** 2, 0.013)                                     # hollow cheeks
        dv += Vector((-sg * 0.0035, 0.0060, 0)) * wc
        wk = gauss((ax - 0.064 * hs) ** 2 + (z - 0.074 * hs) ** 2, 0.010)                                     # cheekbones
        dv += Vector((sg * 0.0025, -0.0025, 0)) * wk
        wj = smooth01((0.032 * hs - z) / (0.032 * hs)) * gauss(x * x, 0.028)                                  # longer, firmer chin
        dv += Vector((0, -0.0015, -0.0065)) * wj
        if dv.length_squared > 1e-12: d[v.index] = dv * amt
    kb = body.data.shape_keys.key_blocks
    for blk in kb:
        for i, dv in d.items(): blk.data[i].co += dv
    for i, dv in d.items(): body.data.vertices[i].co += dv


def bulk_body(body, P, amt=1.0, head_scale=1.0):
    """heavy build (enemy brute): body pushed out along the normals (chest / back / trapezius most, arms, legs less; hands and head
    untouched), head scaled about the chin; every key block moves by the same delta (like bias_face)."""
    from skeleton import zmap
    hs = P['hs']; sw = P['sw']; J = joints(P); g = lambda d, s_: math.exp(-d * d / (2 * s_ * s_))
    zc = zmap(J['head'][2], P); zn = zmap(J['neck'][2], P); zh = zmap(J['hips'][2], P); az = zmap(J['upperArm'][2], P); hand = sw + 0.47 * hs
    yh = J['head'][1]; d = {}
    for v in body.data.vertices:
        c = v.co; n = v.normal; ax = abs(c.x)
        if c.z >= zc - 0.005:
            if head_scale != 1.0: d[v.index] = (Vector((c.x, c.y - yh, c.z - zc)) * (head_scale - 1.0))
            continue
        if ax > sw + 0.04 and abs(c.z - az) < 0.16 * hs:                                               # arm
            w = 0.026 * (1 - smooth01((ax - hand + 0.06 * hs) / (0.06 * hs))) * (0.75 + 0.25 * g(ax - sw - 0.12 * hs, 0.12 * hs))
            dv = n * w
        elif c.z > zh:                                                                                 # torso, neck
            w = 0.016 + 0.034 * g(c.z - zmap(1.30 * hs, P), 0.13 * hs) + 0.012 * max(0.0, -n.y) * g(c.z - zmap(1.08 * hs, P), 0.08 * hs)
            w *= 1 - 0.45 * smooth01((c.z - zn + 0.02) / 0.06)
            dv = n * w + Vector((0, 0, 0.03 * g(c.z - zn, 0.05 * hs) * g(ax - 0.10, 0.06) * (n.z > -0.2)))   # trapezius lifts towards the ears
        else:                                                                                          # legs
            dv = n * 0.012 * (0.5 + 0.5 * smooth01((c.z - zmap(0.5 * hs, P)) / (0.3 * hs)))
        d[v.index] = dv * amt
    for blk in body.data.shape_keys.key_blocks:
        for i, dv in d.items(): blk.data[i].co += dv
    for i, dv in d.items(): body.data.vertices[i].co += dv


def build(nid, cfg=None):
    """fresh scene -> (P, arm, objs [body, hair?, parts...], clip names, springs) of NPCS[nid] (or cfg: enemy.py humanoids)"""
    import rig, anim, hair as hairmod
    cfg = cfg or NPCS[nid]; reset()
    hc = hairmod.HAIR_COLORS[cfg['hc']]
    P, arm, body, fixed = rig.build_body(cfg['sex'], skin=cfg['skin'], hair_rgb=hc, iris=cfg.get('iris', (0.25, 0.62, 0.75)))
    if cfg.get('face'): bias_face(body, cfg['face'])
    if cfg.get('shape'): bias_face(body, cfg['shape'])          # body sliders baked into the rest shape (enemy brute: build / shoulders)
    if cfg.get('bulk'): bulk_body(body, P, cfg['bulk'], cfg.get('head_scale', 1.0))
    if cfg.get('age'): age_face(body, P, cfg['age'])
    names = anim.author(arm, P, gait=cfg.get('gait'))
    objs = [body]; sp = []; o = None
    if cfg.get('hair'): o, sp = hairmod.build_hair(cfg['hair'], arm, P, hc, hairmod.HAIR_TIPS[cfg['hc']]); objs.append(o)
    parts, sps = clothes.build_outfit(cfg['base'], body, arm, P, cfg['sex'], pal=cfg.get('pal'), extra=make_extra(cfg, o), prefix=nid)
    return P, arm, objs + parts, names, sp + sps
